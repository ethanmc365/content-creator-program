import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// This file's own directory, which is the repo root. Resolved from import.meta
// rather than process.cwd() so the plugin does not care where the dev server
// was started from - and so this stays lintable under the browser globals the
// rest of the project is checked against.
const REPO_ROOT = path.dirname(fileURLToPath(import.meta.url))

// A DEV-SERVER LOGIN DOOR, SO SIGNED-IN TESTING NEVER DEPENDS ON A CAPTCHA.
//
// The whole app is behind a login, and that login is behind Cloudflare
// Turnstile. Turnstile decides per visitor whether to demand an interactive
// "verify you are human" click, and it started demanding one from automated
// browsers on localhost in Aug 2026 - so every signed-in page became
// unverifiable without a human sitting there clicking a checkbox, and the only
// workarounds were copying session tokens around by hand.
//
// This removes the whole problem. `GET /__dev-login` mints a real session with
// the Supabase admin API and hands the browser a page that stores it, exactly
// as a magic-link sign-in would. No captcha is involved because no password
// grant is involved.
//
// WHY THIS IS SAFE
//
//  * `apply: 'serve'` - a Vite plugin with this set is not part of `build`, so
//    there is nothing to accidentally ship. It cannot exist in production.
//  * It refuses to do anything unless SUPABASE_SERVICE_KEY is present in
//    .env.qa, which is gitignored and lives only on a developer's machine. A
//    clone of this repo has no such file and this route 404s.
//  * It will only mint sessions for @trypcreators.test addresses. Those are the
//    QA accounts (is_test = true, hidden everywhere in the app); the domain is
//    reserved and unroutable, so it structurally cannot issue a session for a
//    real creator no matter what is passed to it.
//  * It binds to the dev server only, which listens on localhost.
//
// USAGE
//   http://localhost:5173/__dev-login            -> qa-creator
//   http://localhost:5173/__dev-login?as=admin   -> qa-admin
//   http://localhost:5173/__dev-login?to=/rooms  -> and land somewhere specific

const QA_DOMAIN = '@trypcreators.test'
const ACCOUNTS = {
  creator: `qa-creator${QA_DOMAIN}`,
  admin: `qa-admin${QA_DOMAIN}`,
}

function readEnvFile(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
  }
  return out
}

function page(title, body) {
  return `<!doctype html><meta charset="utf-8"><title>${title}</title>`
    + '<style>body{font:15px/1.5 system-ui;margin:3rem auto;max-width:34rem;padding:0 1rem;color:#1c1c1c}'
    + 'code{background:#f4f4f5;padding:.1rem .35rem;border-radius:4px}</style>'
    + body
}

export default function devAuth({ root = REPO_ROOT } = {}) {
  return {
    name: 'tryp-dev-auth',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev-login', async (req, res) => {
        const send = (code, html) => {
          res.statusCode = code
          res.setHeader('Content-Type', 'text/html; charset=utf-8')
          // Never let a proxy or the browser keep a page with a token in it.
          res.setHeader('Cache-Control', 'no-store')
          res.end(html)
        }

        try {
          const env = { ...readEnvFile(path.join(root, '.env')), ...readEnvFile(path.join(root, '.env.qa')) }
          const url = env.VITE_SUPABASE_URL
          const anon = env.VITE_SUPABASE_ANON_KEY
          const service = env.SUPABASE_SERVICE_KEY

          if (!service || !url || !anon) {
            return send(404, page('Not configured', '<h1>Dev login is not set up</h1>'
              + '<p>Put your Supabase <code>service_role</code> secret in <code>.env.qa</code> as '
              + '<code>SUPABASE_SERVICE_KEY=…</code> and restart the dev server. '
              + 'That file is gitignored and never leaves your machine.</p>'))
          }

          const q = new URL(req.url, 'http://localhost').searchParams
          const email = q.get('email') || ACCOUNTS[q.get('as') || 'creator'] || ACCOUNTS.creator
          if (!email.endsWith(QA_DOMAIN)) {
            return send(400, page('Refused', `<h1>QA accounts only</h1>`
              + `<p>This door only opens for <code>${QA_DOMAIN}</code> addresses, so it can never `
              + `mint a session for a real creator.</p>`))
          }

          const admin = { apikey: service, Authorization: `Bearer ${service}`, 'Content-Type': 'application/json' }
          const linkRes = await fetch(`${url}/auth/v1/admin/generate_link`, {
            method: 'POST', headers: admin,
            body: JSON.stringify({ type: 'magiclink', email }),
          })
          const link = await linkRes.json()
          const hash = link.hashed_token || link.properties?.hashed_token
          if (!hash) {
            return send(502, page('Supabase said no', '<h1>Could not mint a link</h1><pre>'
              + String(link.msg || link.error_description || JSON.stringify(link)).slice(0, 400) + '</pre>'))
          }

          const sessRes = await fetch(`${url}/auth/v1/verify`, {
            method: 'POST',
            headers: { apikey: anon, 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: 'magiclink', token_hash: hash }),
          })
          const s = await sessRes.json()
          if (!s.access_token) {
            return send(502, page('Supabase said no', '<h1>Could not verify the link</h1><pre>'
              + String(s.msg || s.error_description || JSON.stringify(s)).slice(0, 400) + '</pre>'))
          }

          // The exact shape supabase-js keeps in localStorage, under the key it
          // derives from the project ref.
          const ref = new URL(url).hostname.split('.')[0]
          const session = {
            access_token: s.access_token,
            token_type: s.token_type || 'bearer',
            expires_in: s.expires_in,
            expires_at: s.expires_at || Math.floor(Date.now() / 1000) + Number(s.expires_in || 3600),
            refresh_token: s.refresh_token,
            user: s.user,
          }
          const to = q.get('to') && q.get('to').startsWith('/') ? q.get('to') : '/global'

          return send(200, page('Signing in…',
            `<h1>Signed in as ${email}</h1><p>Taking you to <code>${to}</code>…</p>`
            + `<script>localStorage.setItem(${JSON.stringify(`sb-${ref}-auth-token`)},`
            + `${JSON.stringify(JSON.stringify(session))});location.replace(${JSON.stringify(to)})</script>`))
        } catch (err) {
          return send(500, page('Dev login failed', '<h1>Dev login failed</h1><pre>'
            + String(err && err.message).slice(0, 400) + '</pre>'))
        }
      })
    },
  }
}
