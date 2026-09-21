import { describe, it, expect } from 'vitest'
import { briefExcerpt } from './briefExcerpt'

describe('briefExcerpt', () => {
  it('skips the heading and strips the marks', () => {
    const md = '# Welcome to the **first** challenge\n\nPost **three** videos about *your* city. See [the rules](https://x.y).\n\n## Rules\n- one'
    expect(briefExcerpt(md)).toEqual({ text: 'Post three videos about your city. See the rules.', more: true })
  })
  it('joins the lines of one paragraph and stops at the blank line', () => {
    expect(briefExcerpt('Line one\nline two\n\nNext').text).toBe('Line one line two')
  })
  it('cuts long text on a word', () => {
    const r = briefExcerpt('word '.repeat(100), 30)
    expect(r.text.endsWith('…')).toBe(true)
    expect(r.text.length).toBeLessThanOrEqual(31)
    expect(r.more).toBe(true)
  })
  it('says there is no more when the paragraph is the brief', () => {
    expect(briefExcerpt('Just this.')).toEqual({ text: 'Just this.', more: false })
    expect(briefExcerpt('')).toEqual({ text: '', more: false })
  })
})
