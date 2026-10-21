// STAYING SIGNED IN THROUGH A MOVE TO NEW SERVERS.
//
// Moving the platform to a new Supabase project (Tryp's own servers) copies every account, including the long-lived
// refresh token each phone holds, but the new server signs access tokens with a new key. Without this, the first
// request after the switch is refused (401) and the creator has to sign in again. With it, a refused request swaps
// the refresh token for a new access token once and is sent again, so nobody notices the move. A normal expired token
// is handled the same way.
//
// Two parts:
// 1. SESSION_STORAGE_KEY pins where the login is kept in the browser. supabase-js derives the default from the
//    project address, so a new address would look for the login in a different place and find nothing. This value IS
//    today's default, so pinning it changes nothing for anyone now. Never change it.
// 2. carrySession(fetch) wraps the client's fetch: a 401 on a database or file request that carried a signed-in
//    user's token triggers one shared refresh (at most every 30 s) and one retry.

export const SESSION_STORAGE_KEY = 'sb-heuhqqoxyggawuckxocp-auth-token'

const RETRY_PATHS = ['/rest/v1/', '/storage/v1/']
const REFRESH_GAP_MS = 30_000

let client = null
/** Called once with the Supabase client, after it is created (it cannot be passed in before it exists). */
export function attachClient(c) { client = c }

let refreshing = null
let lastRefreshAt = 0
async function freshToken() {
  if (!client) return null
  if (!refreshing) {
    if (Date.now() - lastRefreshAt < REFRESH_GAP_MS) {
      // Refreshed a moment ago: use that token rather than asking again.
      const { data } = await client.auth.getSession()
      return data?.session?.access_token ?? null
    }
    lastRefreshAt = Date.now()
    refreshing = client.auth.refreshSession()
      .then(({ data, error }) => (error ? null : data?.session?.access_token ?? null))
      .catch(() => null)
      .finally(() => { refreshing = null })
  }
  return refreshing
}

function headerOf(headers, name) {
  if (!headers) return null
  if (typeof headers.get === 'function') return headers.get(name)
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase())
  return key ? headers[key] : null
}

function withAuth(headers, token) {
  const h = new Headers(headers || {})
  h.set('Authorization', `Bearer ${token}`)
  return h
}

// A user's token, not the public key: only a signed-in request can be rescued by a refresh.
function isUserToken(auth) {
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
  if (!token || token.split('.').length !== 3) return false
  try {
    const claims = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return !!claims.sub
  } catch { return false }
}

export function carrySession(baseFetch) {
  return async function carried(input, init = {}) {
    const res = await baseFetch(input, init)
    if (res.status !== 401) return res
    const url = typeof input === 'string' ? input : input?.url || ''
    if (!RETRY_PATHS.some((p) => url.includes(p))) return res
    const auth = headerOf(init.headers, 'Authorization') ?? (typeof input !== 'string' ? input?.headers?.get?.('Authorization') : null)
    if (!isUserToken(auth)) return res
    const token = await freshToken()
    if (!token || `Bearer ${token}` === auth) return res
    return baseFetch(input, { ...init, headers: withAuth(init.headers, token) })
  }
}

/** For tests. */
export function _reset() { client = null; refreshing = null; lastRefreshAt = 0 }
