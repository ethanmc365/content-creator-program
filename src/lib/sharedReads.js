// ONE REQUEST FOR ONE QUESTION ASKED TWICE AT ONCE.
//
// Opening the app fired ~70 requests, and a dozen of them were the SAME read
// asked twice by two components that mounted together (the header and the page
// both wanting creator_private, two badges counting the same pending
// connections). Every concurrent request holds a database connection, and on
// 13 Oct a burst of app opens took Supabase to 51 of its 60 - the warning that
// comes before pages start loading empty.
//
// So an identical REST read that is already on its way is joined rather than
// sent again: both callers get their own copy of the one answer. Deliberately
// narrow:
// - only GET/HEAD under /rest/v1/ (an RPC is a POST and may write);
// - "identical" includes the auth, Accept, Prefer and Range headers, so two
//   users, `.single()` vs a list, or a count vs rows never share;
// - only while in flight - nothing is cached once the answer lands;
// - a request carrying its own abort signal is never shared, since cancelling
//   it must not cancel somebody else's;
// - ANY write empties the table, so a read issued after a save never joins
//   one that left before it and comes back with the old row.
const inflight = new Map()

const KEY_HEADERS = ['authorization', 'apikey', 'accept', 'accept-profile', 'prefer', 'range']

function methodOf(input, init) {
  return (init?.method || (typeof input !== 'string' && input?.method) || 'GET').toUpperCase()
}

function keyFor(url, method, init) {
  const h = new Headers(init?.headers || undefined)
  return [method, url, ...KEY_HEADERS.map((k) => h.get(k) || '')].join('\n')
}

export function shareReads(baseFetch) {
  return function sharedFetch(input, init = {}) {
    const url = typeof input === 'string' ? input : input?.url || String(input)
    const method = methodOf(input, init)
    if (method !== 'GET' && method !== 'HEAD') {
      inflight.clear()
      return baseFetch(input, init)
    }
    if (init.signal || !url.includes('/rest/v1/')) return baseFetch(input, init)

    const key = keyFor(url, method, init)
    let shared = inflight.get(key)
    if (!shared) {
      shared = baseFetch(input, init)
      inflight.set(key, shared)
      const forget = () => { if (inflight.get(key) === shared) inflight.delete(key) }
      shared.then(forget, forget)
    }
    // Every caller, the first included, reads a clone: a body can be read once.
    return shared.then((res) => res.clone())
  }
}

/** For tests. */
export function _inflightSize() { return inflight.size }
