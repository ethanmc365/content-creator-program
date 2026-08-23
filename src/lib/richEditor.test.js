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

  // Keep typing with bold on and press Enter: the browser carries the <strong>
  // across the break. Written naively that is `**line one\n**`, which no
  // per-line renderer can match, so the message shows its asterisks and loses
  // its bold. The marker closes and reopens per line instead.
  it('closes a bold run at the end of each line it covers', () => {
    const div = document.createElement('div')
    div.innerHTML = '<div><strong>line one<br>line two</strong></div>'
    expect(htmlToMd(div, { inlineOnly: true })).toBe('**line one**\n**line two**')
  })

  it('does not leave an empty marker pair on the trailing line', () => {
    const div = document.createElement('div')
    div.innerHTML = '<div><strong>Seven days left!<br></strong></div>'
    expect(htmlToMd(div, { inlineOnly: true })).toBe('**Seven days left!**')
  })

  it('pushes trailing space outside the markers', () => {
    const div = document.createElement('div')
    div.innerHTML = '<div>a <strong>bold </strong>b</div>'
    expect(htmlToMd(div, { inlineOnly: true })).toBe('a **bold** b')
  })
})

// ---------------------------------------------------------------------------
// SECURITY: the markdown renderer must not be able to emit an attribute.
//
// Found by audit, 22 Aug 2026. escapeHtml covered &, < and > - enough for text
// that lands in element CONTENT, and not enough for text that lands in an
// ATTRIBUTE. The mention rule writes the matched name into `data-mention="..."`,
// so a creator whose DISPLAY NAME contained a double quote could close that
// attribute and open an event handler. It reaches an admin through
// RichEditable's dangerouslySetInnerHTML, so the attacker is any creator and
// the victim is the team.
//
// These assert on a PARSED DOM rather than on the string: a regex looking for
// `onmouseover=` cannot tell the difference between an attribute that exists
// and the same characters sitting harmlessly inside a quoted value.
describe('mdToHtml cannot be made to emit attributes', () => {
  const parse = (html) => {
    const d = document.createElement('div')
    d.innerHTML = html
    return d
  }
  const handlers = (root) =>
    [...root.querySelectorAll('*')].flatMap((el) =>
      [...el.attributes].map((a) => a.name).filter((n) => n.startsWith('on')))

  it('a hostile display name cannot inject an event handler', () => {
    const hostile = 'Bob" onmouseover="alert(1)'
    const html = mdToHtml(`hey @${hostile}`, { inlineOnly: true, mentionNames: [hostile] })
    expect(handlers(parse(html))).toEqual([])
  })

  it('a hostile name cannot inject a whole element either', () => {
    const hostile = 'Eve"><img src=x onerror="alert(1)'
    const html = mdToHtml(`hi @${hostile}`, { inlineOnly: true, mentionNames: [hostile] })
    const root = parse(html)
    expect(handlers(root)).toEqual([])
    expect(root.querySelector('img')).toBeNull()
  })

  it('quotes in an ordinary message survive as text', () => {
    const root = parse(mdToHtml('she said "hello" and left', { inlineOnly: true }))
    expect(root.textContent).toContain('"hello"')
    expect(handlers(root)).toEqual([])
  })

  it('a mention with a quote still round-trips to the right name', () => {
    const name = 'Bob" the builder'
    const html = mdToHtml(`@${name}`, { inlineOnly: true, mentionNames: [name] })
    const el = parse(html).querySelector('[data-mention]')
    expect(el.getAttribute('data-mention')).toBe(name)
  })

  it('a link cannot smuggle a javascript: url', () => {
    const root = parse(mdToHtml('[click](javascript:alert(1))', { inlineOnly: true }))
    const a = root.querySelector('a')
    expect(a).toBeNull()
  })
})
