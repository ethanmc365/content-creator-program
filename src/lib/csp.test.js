import { describe, expect, it } from 'vitest'
import indexHtml from '../../index.html?raw'
import vercel from '../../vercel.json'

// EVERY INLINE SCRIPT IN index.html IS ALLOWED BY THE CONTENT SECURITY POLICY.
//
// THE BUG THIS EXISTS FOR (9 Sep 2026). The boot layer learned to draw the
// public page's shape instead of the signed-in app shell, decided by an inline
// script reading `location.pathname` - the only thing that knows which page is
// coming before a single module has been fetched. It worked perfectly on the
// dev server and did nothing at all on production, because
//
//     script-src 'self' 'wasm-unsafe-eval' https://challenges.cloudflare.com
//
// has no `'unsafe-inline'`. Chrome parsed the script, refused to run it, and
// the front page kept drawing five phone tabs a stranger does not have. It was
// found by screenshotting production after the deploy, not by reading anything.
//
// This is the SECOND time this policy has silently switched a feature off - the
// first was `worker-src 'self'` stopping every iPhone photo converting, because
// heic2any builds its worker from a `blob:` URL. Both failures look identical
// from the outside: the feature is simply absent, on production only, with the
// explanation sitting in a console nobody was reading.
//
// So the rule is enforced rather than remembered. `style-src` is deliberately
// NOT checked: it carries `'unsafe-inline'`, which is the whole point of the
// inline `<style>` the boot layer needs.
//
// IF THIS TEST FAILS, the fix is to recompute the hash, not to delete the
// assertion:
//
//   node -e 'const f=require("fs"),c=require("crypto");
//     const s=f.readFileSync("index.html","utf8");
//     const re=/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;let m;
//     while((m=re.exec(s))) console.log(c.createHash("sha256").update(m[1],"utf8").digest("base64"))'
//
// and paste it into `vercel.json` as `'sha256-<value>'`.
//
// Verified that Vite does not rewrite the script on the way through: the hash
// of `index.html` and of `dist/index.html` are the same string.

/** Every inline `<script>` body in the document, in source order. */
function inlineScripts(html) {
  const out = []
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g
  let m = re.exec(html)
  while (m) {
    out.push(m[1])
    m = re.exec(html)
  }
  return out
}

/** The `script-src` directive, as a set of source expressions. */
function scriptSrc(policy) {
  const directive = policy.split(';').map((d) => d.trim()).find((d) => d.startsWith('script-src'))
  return new Set((directive || '').split(/\s+/).slice(1))
}

const policy = vercel.headers
  .flatMap((h) => h.headers)
  .find((h) => h.key.toLowerCase() === 'content-security-policy')?.value

// The Web Crypto digest, which is what the browser hashes with - and it is
// async, so every assertion below awaits.
async function sha256(text) {
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return btoa(String.fromCharCode(...new Uint8Array(digest)))
}

describe('the content security policy', () => {
  it('is actually served from vercel.json', () => {
    expect(policy).toBeTruthy()
    expect(policy).toContain('script-src')
  })

  // The one that would have caught the boot script.
  it('allows every inline script in index.html by hash', async () => {
    const allowed = scriptSrc(policy)
    const scripts = inlineScripts(indexHtml)
    // A document with no inline script at all would pass this vacuously, which
    // is the wrong kind of green: the boot layer needs one.
    expect(scripts.length).toBeGreaterThan(0)
    for (const body of scripts) {
      const hash = `'sha256-${await sha256(body)}'`
      expect(allowed.has(hash) || allowed.has("'unsafe-inline'")).toBe(true)
    }
  })

  // `'unsafe-inline'` would make the assertion above pass for ever while
  // undoing the reason the policy exists. If it is ever added, that should be a
  // decision somebody made on purpose, not a way to get this test green.
  it('does not simply allow all inline script', () => {
    expect(scriptSrc(policy).has("'unsafe-inline'")).toBe(false)
  })
})
