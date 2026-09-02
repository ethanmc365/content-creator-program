// WHICH ORIGINS OUR FUNCTIONS ANSWER TO, DECIDED ONCE.
//
// Every function had its own copy of this, and every copy had the same bug:
// `hostname.endsWith('.vercel.app')`. Anybody can deploy a site to Vercel, so
// `tryp-creators-evil.vercel.app` matched - and any attacker-controlled page
// could make cross-origin calls to these functions and READ THE REPLIES.
//
// THIS FILE EXISTED IN PRODUCTION AND NOT IN THE REPOSITORY for a while, which
// is its own kind of bug: the deployed function and the file you edit were two
// different programs. It lives here now. Note that the edge bundler FLATTENS a
// function to a single directory, so `../_shared/x.ts` survives only because
// the deploy uploads this file alongside the entrypoint - a helper that is
// merely imported and not uploaded fails at bundle time.

const EXACT = new Set([
  'trypcreators.vercel.app',
  'content-creator-program.vercel.app',
])

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
