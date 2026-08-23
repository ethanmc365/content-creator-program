import { describe, it, expect } from 'vitest'
import { toV4, toV6, isPrivateAddress, isBlockedHost, allowedTarget } from './net.ts'

// THE SSRF GUARD FOR THE LINK PREVIEW.
//
// Every string in `MUST_BLOCK` is a request somebody could put in a chat
// message to make our server fetch something it should not. Several of them got
// through the version this replaced. If any of them starts passing again, this
// file is what says so.

const MUST_BLOCK = [
  // Loopback, in every notation a URL parser accepts.
  ['127.0.0.1', 'dotted loopback'],
  ['2130706433', 'decimal loopback'],
  ['0x7f000001', 'hex loopback'],
  ['017700000001', 'octal loopback'],
  ['127.1', 'short-form loopback'],
  ['0x7f.1', 'mixed-notation loopback'],
  ['::1', 'IPv6 loopback'],
  ['[::1]', 'bracketed IPv6 loopback'],
  ['::ffff:127.0.0.1', 'IPv4-mapped loopback'],
  // The one that matters most: cloud instance metadata.
  ['169.254.169.254', 'AWS/GCP metadata'],
  ['metadata.google.internal', 'GCP metadata by name'],
  ['::ffff:169.254.169.254', 'metadata, mapped'],
  // Private ranges.
  ['10.1.2.3', 'RFC1918 /8'],
  ['172.16.0.1', 'RFC1918 /12 low'],
  ['172.31.255.255', 'RFC1918 /12 high'],
  ['192.168.1.1', 'RFC1918 /16'],
  ['100.64.0.1', 'carrier-grade NAT'],
  ['0.0.0.0', 'this network'],
  ['fd00::1', 'IPv6 unique local'],
  ['fe80::1', 'IPv6 link-local'],
  ['ff02::1', 'IPv6 multicast'],
  ['224.0.0.1', 'multicast'],
  ['255.255.255.255', 'broadcast'],
  // Internal names.
  ['localhost', 'localhost'],
  ['LOCALHOST', 'localhost, shouting'],
  ['api.localhost', 'localhost subdomain'],
  ['printer.local', 'mDNS'],
  ['db.internal', 'internal TLD'],
  ['x.supabase.internal', 'our own internals'],
]

const MUST_ALLOW = ['example.com', 'www.bbc.co.uk', '1.1.1.1', '8.8.8.8', '93.184.216.34', 'tryp.com']

describe('addresses the link preview refuses', () => {
  for (const [host, why] of MUST_BLOCK) {
    it(`blocks ${host} (${why})`, () => {
      expect(isBlockedHost(host)).toBe(true)
    })
  }
})

describe('addresses the link preview allows', () => {
  for (const host of MUST_ALLOW) {
    it(`allows ${host}`, () => {
      expect(isBlockedHost(host)).toBe(false)
    })
  }
})

describe('the IPv4 parser', () => {
  it('expands every notation to the same four octets', () => {
    for (const form of ['127.0.0.1', '2130706433', '0x7f000001', '017700000001', '127.1', '127.0.1']) {
      expect(toV4(form), form).toEqual([127, 0, 0, 1])
    }
  })

  it('is not fooled into reading a hostname as an address', () => {
    expect(toV4('example.com')).toBeNull()
    expect(toV4('1.2.3.4.5')).toBeNull()
    expect(toV4('999.1.1.1')).toBeNull()
    expect(toV4('')).toBeNull()
  })
})

describe('what a fetch target has to satisfy', () => {
  const publicDns = async () => ['93.184.216.34']
  const privateDns = async () => ['10.0.0.5']
  const noAnswer = async () => []
  const brokenDns = async () => { throw new Error('SERVFAIL') }

  it('accepts an ordinary https page', async () => {
    expect(await allowedTarget(new URL('https://example.com/a'), publicDns)).toBe(true)
  })

  // THE DNS CASE. A public-looking name with a private A record is the whole
  // reason resolution happens at all.
  it('refuses a public name that resolves somewhere private', async () => {
    expect(await allowedTarget(new URL('https://internal.evil.test/'), privateDns)).toBe(false)
  })

  it('refuses when DNS cannot answer, rather than assuming it is fine', async () => {
    expect(await allowedTarget(new URL('https://nowhere.test/'), noAnswer)).toBe(false)
    expect(await allowedTarget(new URL('https://nowhere.test/'), brokenDns)).toBe(false)
  })

  // A port turns a page fetcher into an internal port scanner.
  it('refuses anything that is not port 80 or 443', async () => {
    expect(await allowedTarget(new URL('http://example.com:6379/'), publicDns)).toBe(false)
    expect(await allowedTarget(new URL('http://example.com:22/'), publicDns)).toBe(false)
    expect(await allowedTarget(new URL('http://example.com:80/'), publicDns)).toBe(true)
    expect(await allowedTarget(new URL('https://example.com:443/'), publicDns)).toBe(true)
  })

  it('refuses schemes that are not http', async () => {
    for (const u of ['file:///etc/passwd', 'gopher://example.com/', 'ftp://example.com/']) {
      expect(await allowedTarget(new URL(u), publicDns), u).toBe(false)
    }
  })

  // user:pass@host is how you smuggle a different host past a human reading the
  // URL, and past some parsers.
  it('refuses embedded credentials', async () => {
    expect(await allowedTarget(new URL('https://user:pw@example.com/'), publicDns)).toBe(false)
  })

  it('refuses a literal private address without asking DNS at all', async () => {
    let asked = false
    const dns = async () => { asked = true; return ['1.1.1.1'] }
    expect(await allowedTarget(new URL('http://169.254.169.254/latest/meta-data/'), dns)).toBe(false)
    expect(asked).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// IPv6, PARSED RATHER THAN PATTERN-MATCHED
//
// Every case below except the plain-text ones was found by firing the payload
// at the DEPLOYED function and watching `::ffff:127.0.0.1` come back 200. The
// URL parser normalises the dotted tail into hex groups before our code ever
// sees the string, so the shapes a person types and the shapes we are handed
// are different sets and BOTH have to be covered.
// ---------------------------------------------------------------------------
describe('IPv6 addresses', () => {
  const blocked = [
    '::1', '[::1]', '0:0:0:0:0:0:0:1',
    '::', '0:0:0:0:0:0:0:0',
    '::ffff:127.0.0.1',      // as typed
    '::ffff:7f00:1',         // as new URL() normalises it - THE BYPASS
    '[::ffff:7f00:1]',
    '0:0:0:0:0:ffff:7f00:1',
    '::ffff:169.254.169.254',
    '::ffff:a9fe:a9fe',      // metadata service, normalised
    '::ffff:10.0.0.1',
    '::ffff:a00:1',
    '::ffff:192.168.1.1',
    '::127.0.0.1',           // deprecated IPv4-compatible
    '64:ff9b::7f00:1',       // NAT64
    '2002:7f00:1::',         // 6to4 wrapping loopback
    '2002:a9fe:a9fe::1',     // 6to4 wrapping the metadata service
    'fc00::1', 'fd12:3456::1',
    'fe80::1', 'feb0::1',
    'ff02::1',
    ':::1',                  // nonsense, and unjudgeable is a no
    '::ffff:999.1.1.1',
    'gggg::1',
  ]
  for (const h of blocked) {
    it(`blocks ${h}`, () => { expect(isPrivateAddress(h)).toBe(true) })
  }

  const allowed = ['2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8', '::ffff:808:808']
  for (const h of allowed) {
    it(`allows ${h}`, () => { expect(isPrivateAddress(h)).toBe(false) })
  }

  it('expands :: to exactly eight groups', () => {
    expect(toV6('::1')).toEqual([0, 0, 0, 0, 0, 0, 0, 1])
    expect(toV6('2002:7f00:1::')).toEqual([0x2002, 0x7f00, 1, 0, 0, 0, 0, 0])
    expect(toV6('::ffff:127.0.0.1')).toEqual([0, 0, 0, 0, 0, 0xffff, 0x7f00, 1])
    expect(toV6('1:2:3:4:5:6:7:8')).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('refuses malformed input rather than guessing', () => {
    expect(toV6('1:2:3:4:5:6:7:8:9')).toBe(null)
    expect(toV6('1::2::3')).toBe(null)
    expect(toV6('1:2:3')).toBe(null)
    expect(toV6('127.0.0.1')).toBe(null)
  })
})

describe('a trailing dot is the same name', () => {
  for (const h of ['localhost.', 'foo.internal.', 'printer.local.', 'x.supabase.internal.', 'metadata.google.internal.']) {
    it(`blocks ${h}`, () => { expect(isBlockedHost(h)).toBe(true) })
  }
  it('still allows a normal fully-qualified name', () => {
    expect(isBlockedHost('example.com.')).toBe(false)
  })
})
