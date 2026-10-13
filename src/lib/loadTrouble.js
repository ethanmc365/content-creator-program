// "SOME OF THIS PAGE DID NOT LOAD", DECIDED ONCE FOR EVERY PAGE.
//
// Most pages read with `const { data } = await supabase...` and render `data ?? []`, so a failed read used to look
// exactly like "nothing here". Rather than give ~60 pages their own error state, the client's fetch reports failed
// READS here and the app shell (components/LoadTrouble) offers one retry that remounts the page.
//
// A read is a GET to the REST API, or an RPC that died on the network / timed out / was rate limited / hit a server
// error. An RPC answering 400 is a business rule speaking ("Only VIP creators can add a video") and is the caller's
// to show, never this bar's. Auth, storage and edge functions have their own handling.
const listeners = new Set()
let failing = false

const GET_FAILS = new Set([400, 408, 429, 500, 502, 503, 504])
const RPC_FAILS = new Set([408, 429, 500, 502, 503, 504])

function set(next) {
  if (failing === next) return
  failing = next
  listeners.forEach((fn) => fn(next))
}

export function reportLoadFailure() { set(true) }
export function clearLoadFailure() { set(false) }
export function onLoadTrouble(fn) { listeners.add(fn); return () => listeners.delete(fn) }

export function classify(url, method, status) {
  if (!url.includes('/rest/v1/')) return false
  const rpc = url.includes('/rest/v1/rpc/')
  if (method === 'GET' || method === 'HEAD') return status === 0 || GET_FAILS.has(status)
  if (rpc && method === 'POST') return status === 0 || RPC_FAILS.has(status)
  return false
}

export function watchLoads(fetchImpl) {
  return async (input, init) => {
    const url = typeof input === 'string' ? input : input?.url || String(input)
    const method = String(init?.method || input?.method || 'GET').toUpperCase()
    try {
      const res = await fetchImpl(input, init)
      if (classify(url, method, res.status)) reportLoadFailure()
      return res
    } catch (e) {
      if (e?.name !== 'AbortError' && classify(url, method, 0)) reportLoadFailure()
      throw e
    }
  }
}
