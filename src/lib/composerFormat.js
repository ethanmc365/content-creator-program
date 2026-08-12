// Markdown formatting for a PLAIN TEXTAREA composer.
//
// Two of the three chat surfaces compose in a textarea (the market rooms and
// the DMs); the third (the legacy chat) composes on a contentEditable and has
// its own DOM-based path in RichEditable. This is the textarea half, extracted
// so the two callers cannot drift - they had one copy between them and the DMs
// had none, which is why the DMs shipped with no formatting at all.
//
// THE RULE THAT MATTERS: a heading is a BLOCK, bold and italic are a RUN.
// Pressing H must touch the current LINE and nothing else, and pressing B must
// touch the SELECTION and nothing else. Getting that backwards is what made the
// contentEditable version turn a whole message into a heading.

const MARK = { bold: '**', italic: '*' }
const PLACEHOLDER = { bold: 'bold text', italic: 'italic text' }

/**
 * Work out the new value and caret for a formatting press.
 *
 * @param {string} body   current text
 * @param {number} start  selectionStart
 * @param {number} end    selectionEnd
 * @param {'heading'|'bold'|'italic'} kind
 * @returns {{ value: string, selStart: number, selEnd: number }}
 */
export function applyFormat(body, start, end, kind) {
  if (kind === 'heading') {
    // The line the caret is on, and only that line. `lastIndexOf('\n', start-1)`
    // finds the break BEFORE the caret; +1 puts us on the first character of
    // the line. A selection spanning three lines still only re-tags the line it
    // starts on, which matches how the button reads: "make this a heading".
    const lineStart = body.lastIndexOf('\n', Math.max(0, start - 1)) + 1
    const has = body.slice(lineStart).startsWith('# ')
    const value = has
      ? body.slice(0, lineStart) + body.slice(lineStart + 2)
      : body.slice(0, lineStart) + '# ' + body.slice(lineStart)
    const d = has ? -2 : 2
    return { value, selStart: Math.max(lineStart, start + d), selEnd: Math.max(lineStart, end + d) }
  }

  const mark = MARK[kind]
  if (!mark) return { value: body, selStart: start, selEnd: end }
  const sel = body.slice(start, end)
  // Already wrapped? Unwrap. Checked on the selection itself so pressing B
  // twice on the same highlighted words is a real toggle.
  const wrapped = sel.startsWith(mark) && sel.endsWith(mark) && sel.length > mark.length * 2
  if (wrapped) {
    const inner = sel.slice(mark.length, -mark.length)
    return { value: body.slice(0, start) + inner + body.slice(end), selStart: start, selEnd: start + inner.length }
  }
  const text = sel || PLACEHOLDER[kind]
  const value = body.slice(0, start) + mark + text + mark + body.slice(end)
  return { value, selStart: start + mark.length, selEnd: start + mark.length + text.length }
}

/**
 * Apply a formatting press to a live textarea: reads its selection, hands the
 * new value to `setValue`, then restores focus and the caret on the next frame
 * (React has to have re-rendered the value before the caret can be placed in
 * it).
 */
export function formatTextarea(el, body, kind, setValue) {
  if (!el) return
  const start = el.selectionStart ?? body.length
  const end = el.selectionEnd ?? body.length
  const { value, selStart, selEnd } = applyFormat(body, start, end, kind)
  setValue(value)
  requestAnimationFrame(() => {
    el.focus()
    try { el.setSelectionRange(selStart, selEnd) } catch { /* detached */ }
  })
}
