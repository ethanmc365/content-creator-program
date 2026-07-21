import { describe, it, expect } from 'vitest'
import { mdToHtml, htmlToMd } from './richEditor'

// Round-trip a markdown string through the WYSIWYG layer: md -> html -> live DOM
// -> md. The admin edits the HTML; we must get the same portable markdown back.
function roundTrip(md, opts) {
  const div = document.createElement('div')
  div.innerHTML = mdToHtml(md, opts)
  return htmlToMd(div)
}

describe('richEditor markdown <-> html', () => {
  it('preserves headings, bold, italic and lists', () => {
    const md = '# Title\n\nSome **bold** and *italic* text.\n\n- one\n- two'
    expect(roundTrip(md)).toBe(md)
  })

  it('preserves numbered lists, quotes and dividers', () => {
    const md = '1. first\n2. second\n\n> a quote\n\n---'
    expect(roundTrip(md)).toBe(md)
  })

  it('preserves checklists with checked state', () => {
    const md = '- [ ] todo\n- [x] done'
    expect(roundTrip(md)).toBe(md)
  })

  it('preserves links', () => {
    const md = 'See [the site](https://tryp.com) now.'
    expect(roundTrip(md)).toBe(md)
  })

  it('renders headings without markers in the HTML (clean WYSIWYG)', () => {
    const html = mdToHtml('## Weekly question')
    expect(html).toContain('<h2>Weekly question</h2>')
    expect(html).not.toContain('##')
  })

  it('turns @mentions into non-editable chips when names are known', () => {
    const html = mdToHtml('hey @Sam Rivera', { inlineOnly: true, mentionNames: ['Sam Rivera'] })
    expect(html).toContain('data-mention="Sam Rivera"')
    const div = document.createElement('div')
    div.innerHTML = html
    expect(htmlToMd(div)).toBe('hey @Sam Rivera')
  })

  it('serializes a bold chat line back to markdown', () => {
    const div = document.createElement('div')
    div.innerHTML = '<div>Big <strong>news</strong> today</div>'
    expect(htmlToMd(div)).toBe('Big **news** today')
  })

  it('never concatenates sibling blocks without a separator', () => {
    const div = document.createElement('div')
    div.innerHTML = '<h1>Title</h1><div>Para one</div><div>Para two</div>'
    expect(htmlToMd(div)).toBe('# Title\n\nPara one\n\nPara two')
  })

  it('keeps multi-line chat messages on single newlines', () => {
    const div = document.createElement('div')
    div.innerHTML = '<div>line one</div><div>line two</div>'
    expect(htmlToMd(div, { inlineOnly: true })).toBe('line one\nline two')
  })

  it('recovers readable markdown from execCommand nesting (blocks inside a heading)', () => {
    // Chrome can nest a paragraph/list inside a heading after mixed edits. We must
    // still get line-separated markdown, never a run-on blob.
    const div = document.createElement('div')
    div.innerHTML = '<h1>Weekly questions<div>Drop a hack below</div><ul><li>Pack cubes</li><li>Offline maps</li></ul></h1>'
    const md = htmlToMd(div)
    expect(md).not.toContain('questionsDrop')
    expect(md).toContain('# Weekly questions')
  })

  it('serializes a list wrapped in a div (execCommand output)', () => {
    const div = document.createElement('div')
    div.innerHTML = '<div><ul><li>one</li><li>two</li></ul></div>'
    expect(htmlToMd(div)).toBe('- one\n- two')
  })
})
