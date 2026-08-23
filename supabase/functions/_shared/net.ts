// IS THIS ADDRESS SAFE FOR US TO FETCH FROM?
//
// The link-preview function takes a URL from a signed-in user and fetches it
// from inside our infrastructure. That is Server-Side Request Forgery by
// construction, and the only thing standing between it and the cloud metadata
// service is this file - so it lives on its own, with a test beside it, rather
// than as a regex inside a request handler.
//
// It has no Deno dependencies on purpose: the test suite runs it under vitest.

/**
 * Every IPv4 shape a URL parser will accept, as four octets.
 *
 * THIS IS THE PART THAT WAS MISSING. A guard that matches `/^127\./` catches
 * dotted-decimal and nothing else, and a URL bar accepts far more than that:
 *
 *     http://2130706433/      decimal
 *     http://0x7f000001/      hex
 *     http://017700000001/    octal
 *     http://127.1/           short form, last part fills the rest
 *     http://0x7f.1/          mixed
 *
 * Every one of those is 127.0.0.1 to a browser and to Deno's fetch.
 */
export function toV4(host: string): number[] | null {
  const h = host.trim()
  if (!/^[0-9a-fx.]+$/i.test(h)) return null
  const parts = h.split('.')
  if (parts.length > 4 || parts.some((p) => p === '')) return null
  const nums: number[] = []
  for (const p of parts) {
    let n: number
    if (/^0x[0-9a-f]+$/i.test(p)) n = parseInt(p, 16)
    else if (/^0[0-7]+$/.test(p)) n = parseInt(p, 8)
    else if (/^\d+$/.test(p)) n = parseInt(p, 10)
    else return null
    if (!Number.isFinite(n) || n < 0) return null
    nums.push(n)
  }
  const last = nums.pop()!
  if (nums.length === 4 || last >= 256 ** (4 - nums.length)) return null
  if (nums.some((n) => n > 255)) return null
  const octets = [...nums]
  for (let i = 4 - nums.length - 1; i >= 0; i--) octets.push((last >> (i * 8)) & 0xff)
  return octets.length === 4 ? octets : null
}

/**
 * Every IPv6 shape, as eight 16-bit groups.
 *
 * THIS IS THE OTHER HALF OF THE SAME LESSON, AND IT WAS FOUND BY PROBING THE
 * DEPLOYED FUNCTION RATHER THAN BY READING IT. The first version matched the
 * v6 forms as TEXT - `/^f[cd]/`, and a `::ffff:([0-9.]+)$` regex for the
 * IPv4-mapped case. But nobody hands us the string they typed. `new URL()`
 * normalises first, and it normalises
 *
 *     http://[::ffff:127.0.0.1]/   ->   hostname "[::ffff:7f00:1]"
 *
 * The dotted tail is gone, the regex misses, and loopback is reachable again.
 * Text matching cannot decide this question; the address has to be parsed.
 */
export function toV6(host: string): number[] | null {
  const h = host.trim().toLowerCase().replace(/^\[|\]$/g, '')
  if (!h.includes(':')) return null
  if ((h.match(/::/g) || []).length > 1) return null

  // A trailing dotted-quad ("::ffff:127.0.0.1") is two more groups.
  let tail: number[] = []
  let rest = h
  const dotted = h.match(/(^|:)((?:\d{1,3}\.){3}\d{1,3})$/)
  if (dotted) {
    const v4 = toV4(dotted[2])
    if (!v4) return null
    tail = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]]
    rest = h.slice(0, h.length - dotted[2].length).replace(/:$/, '') || (h.startsWith('::') ? '::' : '')
    if (rest === '' && h.startsWith('::')) rest = '::'
  }

  const gap = rest.indexOf('::')
  const parse = (part: string): number[] | null => {
    if (!part) return []
    const out: number[] = []
    for (const g of part.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(g)) return null
      out.push(parseInt(g, 16))
    }
    return out
  }

  let groups: number[]
  if (gap >= 0) {
    const head = parse(rest.slice(0, gap).replace(/:$/, ''))
    const foot = parse(rest.slice(gap + 2).replace(/^:/, ''))
    if (!head || !foot) return null
    const fill = 8 - tail.length - head.length - foot.length
    if (fill < 0) return null
    groups = [...head, ...Array(fill).fill(0), ...foot, ...tail]
  } else {
    const all = parse(rest)
    if (!all) return null
    groups = [...all, ...tail]
  }
  return groups.length === 8 ? groups : null
}

/** Is this literal address one we must never fetch from? */
export function isPrivateAddress(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, '')

  const v4 = toV4(h)
  if (v4) {
    const [a, b] = v4
    if (a === 0 || a === 10 || a === 127) return true            // this network, private, loopback
    if (a === 169 && b === 254) return true                      // link-local, incl. cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true             // private
    if (a === 192 && b === 168) return true                      // private
    if (a === 192 && b === 0) return true                        // IETF protocol assignments
    if (a === 100 && b >= 64 && b <= 127) return true            // carrier-grade NAT
    if (a >= 224) return true                                    // multicast, reserved, broadcast
    return false
  }

  if (h.includes(':')) {
    const g = toV6(h)
    // Unparseable and yet colon-bearing: we could not judge it, so it is a no.
    if (!g) return true
    const v4of = (a: number, b: number) =>
      isPrivateAddress([a >> 8, a & 0xff, b >> 8, b & 0xff].join('.'))

    if (g.every((x) => x === 0)) return true                                  // ::
    if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true        // ::1
    if ((g[0] & 0xfe00) === 0xfc00) return true                               // fc00::/7 unique local
    if ((g[0] & 0xffc0) === 0xfe80) return true                               // fe80::/10 link-local
    if ((g[0] & 0xff00) === 0xff00) return true                               // ff00::/8 multicast
    // ::ffff:a.b.c.d - an IPv4 address wearing a hat. THE ONE THAT GOT THROUGH.
    if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return v4of(g[6], g[7])
    // ::a.b.c.d (deprecated IPv4-compatible) and 64:ff9b::/96 (NAT64), both of
    // which are also just an IPv4 address with extra steps.
    if (g.slice(0, 6).every((x) => x === 0)) return v4of(g[6], g[7])
    if (g[0] === 0x0064 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return v4of(g[6], g[7])
    // 2002:a.b.c.d::/16 - 6to4 carries the v4 address in groups 1 and 2.
    if (g[0] === 0x2002) return v4of(g[1], g[2])
    return false
  }

  return false
}

/** Is this HOSTNAME one we must never fetch from, before DNS is consulted? */
export function isBlockedHost(host: string): boolean {
  // A TRAILING DOT IS THE SAME NAME. `localhost.` and `db.internal.` are the
  // fully-qualified spellings, they resolve identically, and `endsWith('.internal')`
  // does not match either of them. DNS resolution would have caught these anyway
  // - which is exactly why it is worth removing the reason to rely on that.
  const h = host.toLowerCase().replace(/\.+$/, '')
  if (!h) return true
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.home.arpa')) return true
  // Supabase's own internal names, so a preview can never be pointed at us.
  if (h.endsWith('.supabase.internal') || h === 'metadata.google.internal') return true
  return isPrivateAddress(h)
}

/**
 * Everything a fetch target must satisfy, checked for the submitted URL AND for
 * every redirect hop. `resolve` is injected so the test does not need DNS.
 */
export async function allowedTarget(
  url: URL,
  resolve: (hostname: string) => Promise<string[]>,
): Promise<boolean> {
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false
  // A port is how you turn a page fetcher into an internal port scanner.
  if (url.port && url.port !== '80' && url.port !== '443') return false
  if (url.username || url.password) return false
  if (isBlockedHost(url.hostname)) return false
  // A literal address has already been judged; only a NAME needs DNS.
  if (toV4(url.hostname) || url.hostname.includes(':')) return true
  let records: string[] = []
  try {
    records = await resolve(url.hostname)
  } catch {
    return false
  }
  // No answers at all means we could not check, and "could not check" is a no.
  if (records.length === 0) return false
  return records.every((ip) => !isPrivateAddress(ip))
}
