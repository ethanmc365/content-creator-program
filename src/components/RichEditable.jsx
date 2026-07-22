import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef } from 'react'
import { mdToHtml, htmlToMd } from '../lib/richEditor'
import { cx } from '../lib/utils'

// A single contentEditable WYSIWYG surface. It seeds itself from stored markdown
// once (per `docId`), then owns its own DOM - we never re-render its children, so
// the caret never jumps. On every edit it serializes back to markdown and calls
// onChangeMd, so the rest of the app keeps its clean, portable markdown while the
// admin only ever sees rendered headings/bold/lists (no # ** * markers).
//
// Exposes an imperative handle (focus / exec / insertHtml / insertMention /
// clear / getMd) so the surrounding toolbar and chat logic can drive it.
const ZWSP = String.fromCharCode(0x200b) // caret anchor when toggling bold/italic off

const RichEditable = forwardRef(function RichEditable(
  { docId, initialMd = '', mentionNames, inlineOnly = false, placeholder = '', className, onChangeMd, onKeyDown, onInput, ...rest },
  ref
) {
  const elRef = useRef(null)
  const opts = useMemo(() => ({ inlineOnly, mentionNames }), [inlineOnly, mentionNames])

  // Seed once per docId. Same object identity across renders => React leaves the
  // DOM we mutate alone; a new docId => React reseeds with that note's content.
  const seed = useMemo(
    () => ({ __html: mdToHtml(initialMd, opts) }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [docId]
  )

  const syncEmpty = useCallback((md) => {
    const el = elRef.current
    if (el) el.classList.toggle('is-empty', !md.trim())
  }, [])

  const fireChange = useCallback(() => {
    const el = elRef.current
    if (!el) return ''
    const md = htmlToMd(el, { inlineOnly })
    syncEmpty(md)
    onChangeMd?.(md)
    return md
  }, [onChangeMd, syncEmpty, inlineOnly])

  useEffect(() => { syncEmpty(initialMd) }, [seed, initialMd, syncEmpty])

  // The top-level block (direct child of the root) that a node sits in.
  const blockAncestor = (node) => {
    const root = elRef.current
    let el = node && node.nodeType === 1 ? node : node?.parentNode
    while (el && el.parentNode && el.parentNode !== root) el = el.parentNode
    return el && el.parentNode === root ? el : null
  }

  // Re-tag a block, keeping its inline children. Used for headings / quote / p.
  const retag = (block, tag) => {
    if (block.tagName.toLowerCase() === tag) return block
    const el = document.createElement(tag)
    while (block.firstChild) el.appendChild(block.firstChild)
    if (!el.firstChild) el.appendChild(document.createElement('br'))
    block.replaceWith(el)
    return el
  }

  // Block formatting (headings / quote) done on the DOM, not execCommand, so it
  // only ever touches the block(s) the selection actually spans - never the whole
  // note - and toggling the same format again reliably drops back to a paragraph.
  const applyBlock = (tag) => {
    const root = elRef.current
    const sel = window.getSelection()
    if (!root || !sel || !sel.rangeCount) return fireChange()
    const range = sel.getRangeAt(0)
    const startBlk = blockAncestor(range.startContainer)
    const endBlk = blockAncestor(range.endContainer)
    if (!startBlk) { document.execCommand('formatBlock', false, tag); return fireChange() }
    // Walk the sibling blocks the selection covers (skip lists / dividers).
    const blocks = []
    let cur = startBlk
    while (cur) {
      if (!/^(UL|OL|HR)$/.test(cur.tagName)) blocks.push(cur)
      if (cur === endBlk) break
      cur = cur.nextElementSibling
    }
    if (!blocks.length) return fireChange()
    // If they're all already this tag, toggle back to a normal paragraph.
    const allMatch = blocks.every((b) => b.tagName.toLowerCase() === tag.toLowerCase())
    const finalTag = allMatch && tag !== 'p' ? 'p' : tag
    // Remember exactly what the user had selected. retag() MOVES the child text
    // nodes into the new block (same node objects), so these endpoints stay valid
    // - we restore the user's own selection rather than selecting the whole block
    // (which felt like it "auto-selected everything").
    const sC = range.startContainer, sO = range.startOffset
    const eC = range.endContainer, eO = range.endOffset
    const newBlocks = blocks.map((b) => retag(b, finalTag))
    try {
      const r = document.createRange()
      r.setStart(sC, sO)
      r.setEnd(eC, eO)
      sel.removeAllRanges()
      sel.addRange(r)
    } catch {
      // The original container was an empty block that no longer exists; just
      // drop the caret into the first converted block.
      const r = document.createRange()
      r.setStart(newBlocks[0], 0)
      r.collapse(true)
      sel.removeAllRanges()
      sel.addRange(r)
    }
    return fireChange()
  }

  // Bold / italic. A real selection just toggles natively (wrap / unwrap). A
  // collapsed caret is the tricky one: turning the format ON leans on the
  // browser's pending style, but turning it OFF must NOT un-format the word the
  // caret is inside (the old bug) - instead we drop the caret just after the
  // formatted run so the next characters are plain.
  const inlineToggle = (tagName) => {
    const root = elRef.current
    const sel = window.getSelection()
    if (!root || !sel || !sel.rangeCount) return fireChange()
    const cmd = tagName === 'STRONG' ? 'bold' : 'italic'
    const range = sel.getRangeAt(0)
    if (!range.collapsed) { document.execCommand(cmd); return fireChange() }
    let fmt = range.startContainer
    fmt = fmt && fmt.nodeType === 1 ? fmt : fmt?.parentNode
    while (fmt && fmt !== root && fmt.tagName !== tagName) fmt = fmt.parentNode
    if (fmt && fmt !== root && fmt.tagName === tagName) {
      const marker = document.createTextNode(ZWSP) // stripped on serialize
      fmt.after(marker)
      const r = document.createRange()
      r.setStart(marker, 1)
      r.collapse(true)
      sel.removeAllRanges()
      sel.addRange(r)
      return fireChange()
    }
    document.execCommand(cmd)
    return fireChange()
  }

  // Use <p> paragraph separators so Enter creates sibling blocks (and Enter at the
  // end of a heading drops you into a normal paragraph) instead of nesting.
  useEffect(() => {
    try { document.execCommand('defaultParagraphSeparator', false, 'p') } catch { /* not supported */ }
  }, [])

  useImperativeHandle(ref, () => ({
    el: () => elRef.current,
    focus: () => elRef.current?.focus(),
    getMd: () => (elRef.current ? htmlToMd(elRef.current, { inlineOnly }) : ''),
    exec: (cmd, value = null) => {
      elRef.current?.focus()
      // Route block + inline formatting through our own DOM-based handlers so
      // they behave predictably (only the selected block, reliable toggles).
      if (cmd === 'formatBlock') return applyBlock((value || 'p').toLowerCase())
      if (cmd === 'bold') return inlineToggle('STRONG')
      if (cmd === 'italic') return inlineToggle('EM')
      document.execCommand(cmd, false, value)
      return fireChange()
    },
    insertHtml: (html) => {
      elRef.current?.focus()
      document.execCommand('insertHTML', false, html)
      return fireChange()
    },
    // Replace an in-progress "@query" (length back from the caret) with a chip.
    insertMention: (name, back = 0) => {
      const el = elRef.current
      if (!el) return ''
      el.focus()
      const sel = window.getSelection()
      if (sel?.rangeCount && back > 0) {
        const r = sel.getRangeAt(0)
        try { r.setStart(r.startContainer, Math.max(0, r.startOffset - back)) } catch { /* ignore */ }
        sel.removeAllRanges(); sel.addRange(r)
      }
      const chip = `<span class="rt-mention" data-mention="${name}" contenteditable="false">@${name}</span>&nbsp;`
      document.execCommand('insertHTML', false, chip)
      return fireChange()
    },
    clear: () => {
      const el = elRef.current
      if (el) { el.innerHTML = inlineOnly ? '<br>' : '<p><br></p>'; syncEmpty('') }
      onChangeMd?.('')
    },
  }))

  // Toggle a checklist item when its box (the left gutter ~26px) is clicked.
  // Measured against the item's own left edge so it works wherever the click
  // actually lands (offsetX was relative to whatever node was under the cursor).
  const onMouseDown = (e) => {
    const li = e.target.closest?.('ul[data-check] > li')
    if (!li) return
    const rect = li.getBoundingClientRect()
    if (e.clientX - rect.left <= 26) {
      e.preventDefault()
      li.dataset.checked = li.dataset.checked === '1' ? '0' : '1'
      fireChange()
    }
  }

  // Paste as PLAIN text so copying a section from a web page / another note never
  // injects messy styled HTML - it drops in clean and picks up our own styling.
  const onPaste = (e) => {
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    document.execCommand('insertText', false, text)
    fireChange()
  }

  // Enter at the END of a heading / quote must drop into a fresh paragraph.
  // Browsers otherwise keep the caret INSIDE the heading, so every following line
  // (and any list you add) ends up nested in one <h1> - a run-on, all-bold blob.
  const onKeyDownInternal = (e) => {
    if (!inlineOnly && e.key === 'Enter' && !e.shiftKey) {
      const sel = window.getSelection()
      const root = elRef.current
      if (sel?.rangeCount && root) {
        let block = sel.anchorNode
        while (block && block.parentNode !== root) block = block.parentNode
        if (block && /^(H1|H2|H3|BLOCKQUOTE)$/.test(block.tagName || '')) {
          const tail = sel.getRangeAt(0).cloneRange()
          tail.selectNodeContents(block)
          tail.setStart(sel.anchorNode, sel.anchorOffset)
          if (tail.toString().trim() === '') {
            e.preventDefault()
            const p = document.createElement('p')
            p.appendChild(document.createElement('br'))
            block.after(p)
            const r = document.createRange()
            r.setStart(p, 0)
            r.collapse(true)
            sel.removeAllRanges()
            sel.addRange(r)
            fireChange()
            return
          }
        }
      }
    }
    onKeyDown?.(e)
  }

  return (
    <div
      ref={elRef}
      role="textbox"
      aria-multiline="true"
      contentEditable
      suppressContentEditableWarning
      spellCheck
      data-placeholder={placeholder}
      dangerouslySetInnerHTML={seed}
      onInput={(e) => { fireChange(); onInput?.(e) }}
      onPaste={onPaste}
      onMouseDown={onMouseDown}
      onKeyDown={onKeyDownInternal}
      className={cx('rt-editor outline-none', className)}
      {...rest}
    />
  )
})

export default RichEditable
