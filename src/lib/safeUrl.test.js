import { describe, it, expect } from 'vitest'
import { safeUrl } from './safeUrl'

describe('safeUrl', () => {
  it('keeps web links and in-app paths', () => {
    expect(safeUrl('https://www.tiktok.com/@a/video/123')).toBe('https://www.tiktok.com/@a/video/123')
    expect(safeUrl(' http://example.com ')).toBe('http://example.com')
    expect(safeUrl('/challenges/1')).toBe('/challenges/1')
  })
  it('drops script, data and protocol-relative links', () => {
    for (const bad of ['javascript:alert(1)', ' JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', '//evil.example', '', null, undefined, 'not a url']) {
      expect(safeUrl(bad)).toBeUndefined()
    }
  })
})
