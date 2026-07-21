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

  // Toggle a checklist item when its box (the left gutter) is clicked.
  const onMouseDown = (e) => {
    const li = e.target.closest?.('ul[data-check] > li')
    if (li && e.offsetX <= 22) {
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
