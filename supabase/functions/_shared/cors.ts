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
  // The branch alias, which is a fixed name rather than a shape.
  'content-creator-program-git-main-contentcreatorprogram.vercel.app',
])

// AND THE PATTERN THAT REPLACED IT HAD THE SAME HOLE, ONE LAYER DOWN.
//
// It was `^(trypcreators|content-creator-program)-[a-z0-9-]+\.vercel\.app$`,
// which only pins the PREFIX. Found by testing rather than by reading: a
// preflight sent from `https://trypcreators-evil.vercel.app` came back with
// `Access-Control-Allow-Origin: https://trypcreators-evil.vercel.app`. Anybody
// can deploy a Vercel project called `trypcreators-anything`, so the fix for
// "anybody can deploy to Vercel" had merely narrowed the set of names an
// attacker has to choose from.
//
// A real preview URL for this project is
// `content-creator-program-<hash>-contentcreatorprogram.vercel.app`: project,
// deployment hash, then THE TEAM SLUG. The team slug is the part that is not
// available to somebody else, so it is the part worth matching, and the hash
// segment is `[a-z0-9]+` with no dashes so a project merely NAMED to look like
// a preview does not slip through.
//
// Residual, written down rather than left implied: somebody could still
// register a personal project named exactly `trypcreators-<8+ alphanumerics>-
// contentcreatorprogram`. It is not worth more machinery, because CORS is not
// the security boundary for these functions - they authenticate on an explicit
// Authorization header and no cookie rides along, so a cross-origin page cannot
// borrow a creator's session and gains nothing it could not do with curl. This
// is hygiene, and it should be tight hygiene.
const PREVIEW = /^(trypcreators|content-creator-program)-[a-z0-9]{6,}-contentcreatorprogram\.vercel\.app$/

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
