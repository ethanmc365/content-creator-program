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

// KEEP THE LINE YOU ARE TYPING ON IN VIEW.
//
// A composer that has grown past its cap scrolls, and once it scrolls a browser
// will happily let the caret walk out of the visible box - you carry on typing
// into a line you cannot see. `scrollIntoView` is the wrong tool here: it walks
// up and scrolls every ancestor, which on a phone means moving the whole fixed
// chat overlay. This nudges ONE element by the minimum needed, and does nothing
// at all when the box is not scrolling.
function keepCaretVisible(el) {
  if (!el || el.scrollHeight - el.clientHeight <= 1) return
  const sel = window.getSelection?.()
  if (!sel?.rangeCount) return
  const range = sel.getRangeAt(0)
  if (!el.contains(range.commonAncestorContainer)) return
  let rect = range.getBoundingClientRect()
  // A collapsed range between nodes can report an empty rect; the nearest
  // element ancestor is a good enough stand-in.
  if (!rect || (!rect.height && !rect.width)) {
    const node = range.startContainer
    const holder = node.nodeType === 1 ? node : node.parentElement
    rect = holder?.getBoundingClientRect()
  }
  if (!rect) return
  const box = el.getBoundingClientRect()
  const PAD = 4
  if (rect.bottom > box.bottom - PAD) el.scrollTop += rect.bottom - box.bottom + PAD
  else if (rect.top < box.top + PAD) el.scrollTop -= box.top - rect.top + PAD
}

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

  // EVERY LINE MUST LIVE IN A BLOCK OF ITS OWN, OR A HEADING EATS THE MESSAGE.
  //
  // THE BUG THIS FIXES. `blockAncestor` walks up from the caret looking for a
  // direct child of the root. A contentEditable that has been cleared and typed
  // into fresh holds its text as a BARE TEXT NODE on the root - there is no
  // block to find - so the walk ran off the top of the editor, returned null,
  // and applyBlock fell through to `document.execCommand('formatBlock')`, which
  // formats the WHOLE editable. That is the reported "highlighting a word and
  // pressing heading turns the entire message into a heading": the selection
  // was never consulted, because there was nothing to consult it about.
  //
  // So before formatting anything, loose content at the root is wrapped: each
  // run of inline nodes becomes its own block, and a bare <br> - which is how
  // browsers write a line break at the root - ENDS a run rather than joining
  // two lines into one, or Shift+Enter would quietly merge two lines into one
  // heading.
  //
  // The text nodes themselves are MOVED, not replaced, so a Range captured
  // before the wrap still points at the same characters afterwards.
  const ROOT_BLOCK = /^(P|DIV|H1|H2|H3|H4|H5|H6|BLOCKQUOTE|UL|OL|OL|HR|PRE)$/
  const normalizeBlocks = () => {
    const root = elRef.current
    if (!root) return
    const tag = inlineOnly ? 'div' : 'p'
    let run = []
    const flush = () => {
      if (!run.length) return
      const wrapper = document.createElement(tag)
      run[0].before(wrapper)
      run.forEach((n) => wrapper.appendChild(n))
      run = []
    }
    for (const n of [...root.childNodes]) {
      if (n.nodeType === 1 && ROOT_BLOCK.test(n.tagName)) { flush(); continue }
      if (n.nodeType === 1 && n.tagName === 'BR') {
        if (run.length) { flush(); n.remove() } else {
          const wrapper = document.createElement(tag)
          n.replaceWith(wrapper)
          wrapper.appendChild(n)
        }
        continue
      }
      // A whitespace-only text node between two blocks is layout noise, not a
      // line; wrapping it would add an empty paragraph to the markdown.
      if (n.nodeType === 3 && !n.nodeValue.trim() && !run.length) continue
      run.push(n)
    }
    flush()
  }

  // A HEADING FOLLOWS THE SELECTION, NOT THE LINE.
  //
  // Bold and italic touch exactly what is highlighted, and Ethan's report was
  // that H did not: highlight one word in a sentence, press H, and the whole
  // sentence became the heading. "It should be the exact same function."
  //
  // It cannot literally be the same function - a heading is a block element in
  // both HTML and markdown, there is no such thing as half a line of <h1> - so
  // the selection is made into a block of its own first. "say hello world" with
  // "hello" highlighted becomes three blocks (say / hello / world) and only the
  // middle one is re-tagged. The leftovers keep the tag they had, so un-heading
  // one word out of a heading leaves the rest a heading.
  //
  // A COLLAPSED CARET still means the line: there is no selection to follow, and
  // "make this line a heading" is the only sensible reading of a bare press.
  const blockLike = (block) => document.createElement(block.tagName.toLowerCase())

  // Move everything in `block` before (start=true) / after (start=false) the
  // given boundary into a new sibling block. Returns true if anything moved.
  const splitOff = (block, container, offset, start) => {
    const r = document.createRange()
    try {
      r.selectNodeContents(block)
      if (start) r.setEnd(container, offset)
      else r.setStart(container, offset)
    } catch { return false }
    if (!r.toString().length) return false
    const el = blockLike(block)
    el.appendChild(r.extractContents())
    if (!el.firstChild) el.appendChild(document.createElement('br'))
    if (start) block.before(el)
    else block.after(el)
    return true
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
    let range = sel.getRangeAt(0)
    if (!root.contains(range.startContainer)) return fireChange()
    let startBlk = blockAncestor(range.startContainer)
    if (!startBlk) {
      // Loose text at the root. Wrap it, restore the caret/selection onto the
      // same nodes, and look again - NEVER fall through to a whole-editor
      // execCommand, which is what used to make one word into a heading and
      // take the rest of the message with it.
      const sC = range.startContainer, sO = range.startOffset
      const eC = range.endContainer, eO = range.endOffset
      normalizeBlocks()
      try {
        const r = document.createRange()
        r.setStart(sC, sO)
        r.setEnd(eC, eO)
        sel.removeAllRanges()
        sel.addRange(r)
        range = r
      } catch { /* the node did not survive; fall back to whatever is selected */ }
      startBlk = blockAncestor(range.startContainer)
    }
    // Still nothing to format? Do nothing at all. Formatting the whole surface
    // is never the right answer to "I could not find the line you meant".
    if (!startBlk) return fireChange()
    let endBlk = blockAncestor(range.endContainer)
    // A selection that stops at the very START of the next block (offset 0)
    // shouldn't drag that block in - otherwise highlighting to the end of a line
    // silently reformats the line below it too.
    if (endBlk && endBlk !== startBlk) {
      const probe = document.createRange()
      probe.selectNodeContents(endBlk)
      try { probe.setEnd(range.endContainer, range.endOffset) } catch { /* end not inside endBlk */ }
      if (probe.toString().length === 0) {
        endBlk = endBlk.previousElementSibling || startBlk
      }
    }
    // Cut the selection out into blocks of its own, so the format lands on the
    // highlighted words and not on the line that happens to contain them. The
    // END is split first: extracting the tail cannot disturb a boundary that
    // sits before it, whereas extracting the head re-writes the very text node
    // and offset the tail boundary is expressed in.
    let didSplit = false
    if (!range.collapsed) {
      const skip = /^(UL|OL|HR)$/
      if (endBlk && !skip.test(endBlk.tagName)) {
        didSplit = splitOff(endBlk, range.endContainer, range.endOffset, false) || didSplit
      }
      if (startBlk && !skip.test(startBlk.tagName)) {
        didSplit = splitOff(startBlk, range.startContainer, range.startOffset, true) || didSplit
      }
    }

    // Walk the sibling blocks the selection covers (skip lists / dividers).
    // Computed AFTER the split, so the leftovers are not in the list.
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
      if (didSplit) {
        // The split re-wrote the very text nodes and offsets those endpoints
        // were expressed in. The converted blocks now hold exactly what was
        // highlighted, so selecting them IS restoring the user's selection.
        const last = newBlocks[newBlocks.length - 1]
        r.selectNodeContents(newBlocks[0])
        r.setEnd(last, last.childNodes.length)
      } else {
        r.setStart(sC, sO)
        r.setEnd(eC, eO)
      }
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

  // DRAGGING INSIDE A GROWN COMPOSER SCROLLS IT. WE DO IT OURSELVES.
  //
  // Ethan, again, about the DMs and the groups: "unable to scroll inside the
  // text box". `overflow-y: auto` + `overscroll-behavior: contain` + `pan-y` is
  // the correct CSS and it is already there - but none of it wins the argument
  // on a phone, because a touch-drag that STARTS inside a FOCUSED
  // contenteditable is claimed by the platform's text-selection and
  // caret-dragging gesture before scrolling is ever considered. In a DM the box
  // is focused almost all the time (you tapped it to type), which is exactly
  // why this reads as a DM and group bug rather than a chat one.
  //
  // So the drag is handled here: move the content by hand, and preventDefault
  // so the platform does not also start selecting. Only while the box actually
  // overflows - a composer with one line in it must keep the normal caret and
  // selection behaviour, which people do use.
  //
  // The listener has to be registered manually with `{ passive: false }`.
  // React attaches `touchmove` at the root as PASSIVE, so `preventDefault()`
  // inside an `onTouchMove` prop is ignored with a console warning and this
  // would look like it worked and do nothing.
  useEffect(() => {
    const el = elRef.current
    if (!el) return undefined
    let startY = 0
    let startTop = 0
    let active = false

    const canScroll = () => el.scrollHeight - el.clientHeight > 1

    const onStart = (e) => {
      if (e.touches.length !== 1 || !canScroll()) { active = false; return }
      active = true
      startY = e.touches[0].clientY
      startTop = el.scrollTop
    }
    const onMove = (e) => {
      if (!active || e.touches.length !== 1) return
      const dy = startY - e.touches[0].clientY
      const max = el.scrollHeight - el.clientHeight
      const next = Math.max(0, Math.min(max, startTop + dy))
      // Only take the gesture while it is genuinely ours. At the very top
      // pulling further down, or at the very bottom pushing further up, there
      // is nothing to scroll - and swallowing that would break the pull the
      // reader is making at the edge.
      if ((dy < 0 && el.scrollTop <= 0) || (dy > 0 && el.scrollTop >= max)) return
      el.scrollTop = next
      if (e.cancelable) e.preventDefault()
    }
    const onEnd = () => { active = false }

    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchmove', onMove, { passive: false })
    el.addEventListener('touchend', onEnd)
    el.addEventListener('touchcancel', onEnd)
    return () => {
      el.removeEventListener('touchstart', onStart)
      el.removeEventListener('touchmove', onMove)
      el.removeEventListener('touchend', onEnd)
      el.removeEventListener('touchcancel', onEnd)
    }
  }, [])

  useImperativeHandle(ref, () => ({
    el: () => elRef.current,
    focus: () => elRef.current?.focus(),
    getMd: () => (elRef.current ? htmlToMd(elRef.current, { inlineOnly }) : ''),
    exec: (cmd, value = null) => {
      // Only take focus if the caret is not already in here. Re-focusing an
      // element the selection is already inside is a no-op in a browser but a
      // selection-destroying one in jsdom, and the formatting handlers below
      // read the selection - so the guard is what makes them testable, and it
      // is one less way for a stray focus() to lose what the user highlighted.
      const sel0 = window.getSelection()
      const inside = elRef.current && sel0?.rangeCount
        && elRef.current.contains(sel0.getRangeAt(0).commonAncestorContainer)
      if (!inside) elRef.current?.focus()
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
      // A BLOCK, not a bare <br>. An empty surface whose only child is a <br>
      // gives the first typed character no block to live in, which is exactly
      // the state that made the heading button reformat everything (see
      // normalizeBlocks). Starting from a block means the common case never
      // needs rescuing.
      if (el) { el.innerHTML = inlineOnly ? '<div><br></div>' : '<p><br></p>'; syncEmpty('') }
      onChangeMd?.('')
    },
  }))

  // Toggle a checklist item ONLY when its actual box is clicked (left ~20px on
  // the first line). Anywhere else - including just right of the box on an empty
  // item - falls through so the caret lands there and you can type.
  const onMouseDown = (e) => {
    const li = e.target.closest?.('ul[data-check] > li')
    if (!li) return
    const rect = li.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    if (x >= -4 && x <= 20 && y <= 28) {
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
      onInput={(e) => { fireChange(); keepCaretVisible(elRef.current); onInput?.(e) }}
      onPaste={onPaste}
      onMouseDown={onMouseDown}
      onKeyDown={onKeyDownInternal}
      className={cx('rt-editor outline-none', className)}
      {...rest}
    />
  )
})

export default RichEditable
