// Test helper for src/api: a stand-in Supabase client that records every call in a query chain and resolves with a
// canned result, so a test can assert the exact query a function sends (table, columns, filters, order).
export function recordingClient(result = { data: [], error: null }) {
  const calls = []
  const chain = () => {
    const p = new Proxy(function () {}, {
      get(_t, prop) {
        if (prop === 'then') return (res, rej) => Promise.resolve(typeof result === 'function' ? result(calls) : result).then(res, rej)
        return (...args) => { calls.push([prop, ...args]); return p }
      },
    })
    return p
  }
  const client = {
    from: (t) => { calls.push(['from', t]); return chain() },
    rpc: (fn, args) => { calls.push(['rpc', fn, args]); return chain() },
  }
  return { client, calls }
}
