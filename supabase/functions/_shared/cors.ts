// WHICH ORIGINS OUR FUNCTIONS ANSWER TO, DECIDED ONCE.
//
// Every function had its own copy of this, and every copy had the same bug:
//
//     hostname.endsWith('.vercel.app')
//
// Anybody can deploy a site to Vercel. `tryp-creators-evil.vercel.app` is five
// minutes and no money, and it matched - so any attacker-controlled page could
// make cross-origin calls to these functions and READ THE REPLIES, which is the
// whole thing CORS exists to prevent.
//
// It was not as bad as it sounds, because these functions authenticate on the
// `Authorization` header rather than on a cookie, and an attacker's page cannot
// read our token out of our origin's localStorage to put in that header. But
// "the second control saved us" is how you find out the first one was broken,
// and the preview-deploy convenience it bought is not worth an open door.
//
// So: the two production hostnames, plus Vercel preview deploys for THIS
// project only (they are `content-creator-program-<hash>-<scope>.vercel.app`),
// plus localhost for development.

const EXACT = new Set([
  'trypcreators.vercel.app',
  'content-creator-program.vercel.app',
])

// A preview deploy of this project, and nothing else on vercel.app. The prefix
// is the project name Vercel derives from the repository, so a different repo
// - which is what an attacker would have - cannot produce a matching hostname.
const PREVIEW = /^(trypcreators|content-creator-program)-[a-z0-9-]+\.vercel\.app$/

export const PRIMARY_ORIGIN = 'https://trypcreators.vercel.app'

export function allowOrigin(origin: string | null): string {
  if (!origin) return PRIMARY_ORIGIN
  try {
    const { hostname, protocol } = new URL(origin)
    const https = protocol === 'https:'
    const local = (protocol === 'http:' || protocol === 'https:')
      && (hostname === 'localhost' || hostname === '127.0.0.1')
    const ok = (https && (EXACT.has(hostname) || PREVIEW.test(hostname))) || local
    // An unknown origin is answered with the primary domain, so the browser
    // refuses the response rather than the request 500ing.
    return ok ? origin : PRIMARY_ORIGIN
  } catch {
    return PRIMARY_ORIGIN
  }
}

export function corsHeaders(req: Request, extraAllowedHeaders = '') {
  const base = 'authorization, x-client-info, apikey, content-type'
  return {
    'Access-Control-Allow-Origin': allowOrigin(req.headers.get('origin')),
    'Access-Control-Allow-Headers': extraAllowedHeaders ? `${base}, ${extraAllowedHeaders}` : base,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}
