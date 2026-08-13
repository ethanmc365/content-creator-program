import { describe, it, expect } from 'vitest'
import { createRef } from 'react'
import { render } from '@testing-library/react'
import RichEditable from './RichEditable'

// THE HEADING FOLLOWS THE SELECTION.
//
// Ethan's report: bold and italic only changed the highlighted words, but
// pressing H turned the whole line into a heading. These cover the shape of the
// fix - the selection is cut into a block of its own before it is re-tagged, so
// the words either side keep the format they had.

const mount = (md = '') => {
  const ref = createRef()
  const changes = []
  render(<RichEditable ref={ref} docId="t" initialMd={md} inlineOnly onChangeMd={(v) => changes.push(v)} />)
  return { ref, md: () => changes[changes.length - 1] ?? md }
}

/** Select `text` wherever it appears inside the editor and press a toolbar button. */
const selectAndFormat = (ref, text, cmd = ['formatBlock', 'h1']) => {
  const root = ref.current.el()
  const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let node
  while ((node = walk.nextNode())) {
    const at = node.nodeValue.indexOf(text)
    if (at < 0) continue
    const r = document.createRange()
    r.setStart(node, at)
    r.setEnd(node, at + text.length)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(r)
    break
  }
  ref.current.exec(...cmd)
}

describe('RichEditable heading', () => {
  it('makes only the highlighted words a heading', () => {
    const { ref, md } = mount('say hello world')
    selectAndFormat(ref, 'hello')
    expect(md()).toBe('say\n# hello\nworld')
  })

  it('leaves the rest of the line alone at the start of a line', () => {
    const { ref, md } = mount('hello world')
    selectAndFormat(ref, 'hello')
    expect(md()).toBe('# hello\nworld')
  })

  it('takes the whole line when nothing is selected', () => {
    const { ref, md } = mount('say hello world')
    const root = ref.current.el()
    const node = document.createTreeWalker(root, NodeFilter.SHOW_TEXT).nextNode()
    const r = document.createRange()
    r.setStart(node, 4)
    r.collapse(true)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(r)
    ref.current.exec('formatBlock', 'h1')
    expect(md()).toBe('# say hello world')
  })

  it('un-headings just the highlighted words, leaving the rest a heading', () => {
    const { ref, md } = mount('# one two three')
    selectAndFormat(ref, 'two')
    expect(md()).toBe('# one\ntwo\n# three')
  })

  it('does not touch the line below when the selection ends at its start', () => {
    const { ref, md } = mount('first\nsecond')
    const root = ref.current.el()
    const blocks = [...root.children]
    const r = document.createRange()
    r.selectNodeContents(blocks[0])
    r.setEnd(blocks[1], 0)
    const sel = window.getSelection()
    sel.removeAllRanges()
    sel.addRange(r)
    ref.current.exec('formatBlock', 'h1')
    expect(md()).toBe('# first\nsecond')
  })
})
