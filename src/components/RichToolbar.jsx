import { useCallback, useEffect, useState } from 'react'
import Icon from './Icon'
import { cx } from '../lib/utils'
import { promptText } from '../lib/confirm'

// The formatting bar for every rich surface: admin Notes, the resource library,
// and a challenge's brief and rules.
//
// WHY IT IS A COMPONENT NOW. It was written inside the Notes page - a TOOLBAR
// array, a runTool switch and a row of buttons, about seventy lines. Resources
// and the challenge form both need exactly the same thing, and the way that
// usually goes is three copies that drift: one grows a link button, another
// keeps a checklist nobody wants on a challenge brief, and the third quietly
// produces markdown the reader cannot render. One component, one behaviour.
//
// IT SHOWS WHAT IS ON. Ethan asked for the active button to light up in Tryp
// orange, and he is right that it was missing rather than merely unstyled: with
// no active state, a toolbar tells you what you COULD do and never what you ARE
// doing. You cannot tell whether the caret is already inside a bullet without
// typing a character to find out. The state is read from the selection, which is
// the only thing that actually knows.

const ALL = [
  { label: 'H1', title: 'Heading 1', act: 'h1', block: 'h1' },
  { label: 'H2', title: 'Heading 2', act: 'h2', block: 'h2' },
  { label: 'H3', title: 'Heading 3', act: 'h3', block: 'h3' },
  { sep: true },
  { label: 'B', title: 'Bold', cls: 'font-bold', act: 'bold', cmd: 'bold' },
  { label: 'I', title: 'Italic', cls: 'italic', act: 'italic', cmd: 'italic' },
  { icon: 'link', title: 'Link', act: 'link' },
  { sep: true },
  { label: '•', title: 'Bullet list', act: 'ul', cmd: 'insertUnorderedList' },
  { label: '1.', title: 'Numbered list', act: 'ol', cmd: 'insertOrderedList' },
  { label: '☑', title: 'Checklist', act: 'check' },
  { label: '❝', title: 'Quote', act: 'quote', block: 'blockquote' },
  { label: '—', title: 'Divider', act: 'divider' },
]

/**
 * @param {object}  props
 * @param {object}  props.editorRef  ref to a RichEditable
 * @param {string[]} [props.only]    act names to show, in this order. Omit for all.
 * @param {boolean} [props.sticky]   stick to the top while scrolling a long doc
 */
export default function RichToolbar({ editorRef, only, sticky = false, className }) {
  const [active, setActive] = useState({})

  const tools = only
    ? only.flatMap((a) => (a === '|' ? [{ sep: true }] : ALL.filter((t) => t.act === a)))
    : ALL

  // WHAT IS ON, read from the selection.
  //
  // `queryCommandState` is deprecated and it is also the only thing every
  // browser agrees on for a contentEditable, which is what this surface is. The
  // try/catch is not defensive noise: it throws outright in some browsers when
  // there is no selection in an editable at all, which is the state this
  // component spends most of its life in.
  const refresh = useCallback(() => {
    const el = editorRef.current?.el?.()
    const sel = window.getSelection()
    if (!el || !sel?.anchorNode || !el.contains(sel.anchorNode)) {
      setActive({})
      return
    }
    const next = {}
    try {
      const block = (document.queryCommandValue('formatBlock') || '').toLowerCase()
      for (const t of ALL) {
        if (t.block) next[t.act] = block === t.block
        else if (t.cmd) next[t.act] = document.queryCommandState(t.cmd)
      }
    } catch {
      // No usable selection. An empty map is the honest answer.
    }
    setActive(next)
  }, [editorRef])

  useEffect(() => {
    document.addEventListener('selectionchange', refresh)
    return () => document.removeEventListener('selectionchange', refresh)
  }, [refresh])

  async function run(act) {
    const ed = editorRef.current
    if (!ed) return
    const curBlock = () => (document.queryCommandValue('formatBlock') || '').toLowerCase()
    const setBlock = (tag) => ed.exec('formatBlock', curBlock() === tag ? 'p' : tag)
    // A list or quote applied while the caret sits in a heading would nest
    // inside it; drop back to a paragraph first so we get clean sibling blocks.
    const unheading = () => { if (/^h[1-3]$/.test(curBlock())) ed.exec('formatBlock', 'p') }

    switch (act) {
      case 'h1': case 'h2': case 'h3': setBlock(act); break
      case 'quote': setBlock('blockquote'); break
      case 'bold': case 'italic': ed.exec(act); break
      case 'ul': unheading(); ed.exec('insertUnorderedList'); break
      case 'ol': unheading(); ed.exec('insertOrderedList'); break
      case 'check': unheading(); ed.insertHtml('<ul data-check="1"><li data-checked="0">To do</li></ul>'); break
      case 'divider': unheading(); ed.insertHtml('<hr><p><br></p>'); break
      case 'link': {
        // The selection is captured BEFORE the dialog takes focus. Toolbar
        // buttons preventDefault on mousedown so the caret is still in the
        // document at this point; once a modal opens it is not.
        const sel = window.getSelection()
        const saved = sel && sel.rangeCount ? sel.getRangeAt(0).cloneRange() : null
        const hasText = saved && !saved.collapsed
        const url = await promptText('Paste or type the web address to link.', {
          title: 'Add a link',
          placeholder: 'https://…',
          confirmLabel: 'Add link',
          inputType: 'url',
        })
        if (!url) return
        const href = (/^https?:\/\//i.test(url) ? url : `https://${url}`).replace(/"/g, '%22')
        ed.el?.()?.focus()
        if (saved) { const s = window.getSelection(); s.removeAllRanges(); s.addRange(saved) }
        if (hasText) ed.exec('createLink', href)
        else ed.insertHtml(`<a href="${href}">${href}</a>&nbsp;`)
        break
      }
      default: break
    }
    refresh()
  }

  return (
    <div
      className={cx(
        'mb-3 flex flex-wrap items-center gap-1 rounded-xl border border-gray-100 bg-white/90 p-1.5 backdrop-blur',
        sticky && 'sticky top-2 z-10',
        className,
      )}
    >
      {tools.map((t, i) =>
        t.sep ? (
          <span key={`s${i}`} className="mx-1 h-5 w-px bg-gray-200" />
        ) : (
          <button
            key={t.act}
            type="button"
            title={t.title}
            aria-pressed={!!active[t.act]}
            // preventDefault keeps the caret in the document: without it the
            // button takes focus, the browser drops the selection, and the
            // command applies to nothing.
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => run(t.act)}
            className={cx(
              'flex h-8 min-w-8 items-center justify-center rounded-lg px-2 text-sm transition-colors',
              active[t.act]
                ? 'bg-brand-tint text-brand'
                : 'text-ink hover:bg-cloud',
              t.cls,
            )}
          >
            {t.icon ? <Icon name={t.icon} className="h-4 w-4" /> : t.label}
          </button>
        ),
      )}
    </div>
  )
}
