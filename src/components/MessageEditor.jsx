import { useEffect, useRef, useState } from 'react'
import { Spinner } from './ui'
import { editMessage } from '../lib/messageActions'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

// Editing a message IN PLACE, in the bubble it already occupies.
//
// The alternative - lift the text back into the composer at the bottom of the
// thread - is how several products do it and it is worse here: the message you
// are editing scrolls away while you edit it, and the composer is where NEW
// messages come from, so the same box doing two jobs is one keystroke away
// from sending your correction as a fresh message.
//
// A PLAIN TEXTAREA, NOT RichEditable. Deliberate. The composer is
// contentEditable because it has to show bold text while you type it; an edit
// is a repair, it is nearly always a word, and swapping a two-line bubble for a
// rich editor mid-thread moves everything below it. The markdown source is what
// gets edited, which is also the honest thing to show: what you see is exactly
// what will be stored.
//
// The window is five minutes and the DATABASE is what enforces it (migration
// 097). If the clock runs out while this is open, saving fails with the
// server's own sentence rather than silently doing nothing.
//
// IT IS AS BIG AS THE THING YOU ARE EDITING, AND THAT WAS A LAYOUT BUG RATHER
// THAN A SIZE ONE (7 Sep 2026).
//
// Ethan: "whenever you edit a message - say I type a long message and then
// click edit - the edit box is just this tiny little box, and the long message
// is really hard to see in it. The edit box should match the size of the actual
// text box you send."
//
// The textarea was already auto-growing, which is why the size looked
// deliberate and was not. The cause is one class up: a chat bubble is
// `w-fit max-w-full`, so its width is decided by its CONTENT - and its content,
// while editing, is a `w-full` textarea. A percentage inside a shrink-to-fit
// box is circular, so the browser falls back to the only real number in the
// declaration, which was `min-w-[12rem]`. Every edit, on every message of every
// length, opened a 192px column: a three-line message became eleven lines in a
// box capped at 220px, i.e. a scroller.
//
// So the fix is in three parts and only one of them is here:
//
//   the PAGE      gives the bubble `w-full` while it is being edited, so it
//                 takes the message column's full 82% - the same width the
//                 composer has at the bottom of the thread.
//   MIN HEIGHT    matches ChatComposer's `min-h-[2.75rem]`, so a one-word edit
//                 is the same size as a one-word message.
//   MAX HEIGHT    is 40% of the viewport rather than a flat 220px. 220px is
//                 about five lines; a long message is exactly the case being
//                 complained about, and capping it below the height of the
//                 thing it holds is what made it a peephole.
//
// `min-w-[12rem]` is gone. It was only ever load-bearing by accident.
export default function MessageEditor({ kind, message, onSaved, onCancel, onDark = false }) {
  const tr = useT()
  const [value, setValue] = useState(message.body || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef(null)

  // THE CAP IS MEASURED AGAINST THE SCREEN, NOT WRITTEN DOWN. A flat 220px is
  // right on nothing: it is most of a phone's usable height and a fifth of a
  // laptop's. 40% of the viewport leaves the thread readable above the edit on
  // both, and `Math.max` keeps a very short window (a phone with the keyboard
  // up) from collapsing it to a slot.
  function fit(el) {
    if (!el) return
    const cap = Math.max(160, Math.round(window.innerHeight * 0.4))
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, cap)}px`
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    // Caret at the END, not over the whole message. You opened this to change
    // something small; a full selection means the first key you press deletes
    // everything you wrote.
    const n = el.value.length
    el.setSelectionRange(n, n)
    fit(el)
  }, [])

  function grow(e) {
    setValue(e.target.value)
    fit(e.target)
  }

  async function save() {
    if (busy) return
    const next = value.trim()
    if (next === (message.body || '').trim()) { onCancel(); return }
    setBusy(true)
    setError('')
    try {
      const editedAt = await editMessage(kind, message.id, next)
      onSaved({ ...message, body: next, edited_at: editedAt || new Date().toISOString() })
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <div className="w-full text-left">
      <textarea
        ref={ref}
        value={value}
        onChange={grow}
        rows={1}
        maxLength={4000}
        aria-label={tr("Edit your message")}
        onKeyDown={(e) => {
          // Escape cancels, Enter saves, Shift+Enter is a new line. Same
          // grammar as the composer, so there is nothing new to learn.
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() }
        }}
        className={cx(
          // `min-h` and the type size are the composer's, so an edit is visibly
          // the same control as the box the message was written in.
          'w-full min-h-[2.75rem] resize-none rounded-xl border px-3 py-2 text-base leading-relaxed outline-none sm:text-sm',
          // On a brand-orange bubble the normal input styling is invisible, so
          // the editor borrows the bubble's own contrast instead of punching a
          // white box through it.
          onDark
            ? 'border-white/40 bg-white/15 text-white placeholder:text-white/60'
            : 'border-gray-200 bg-white text-ink focus:border-brand',
        )}
      />
      {error && (
        <p role="alert" className={cx('mt-1 text-[11px] font-medium', onDark ? 'text-white' : 'text-red-600')}>{error}</p>
      )}
      <div className="mt-1.5 flex items-center justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className={cx('rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors', onDark ? 'text-white/80 hover:text-white' : 'text-smoke hover:text-ink')}
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className={cx(
            'rounded-full px-3 py-1 text-[11px] font-semibold transition-transform duration-200 hover:scale-105 disabled:opacity-60',
            onDark ? 'bg-white text-brand' : 'bg-brand text-white',
          )}
        >
          {busy ? <Spinner className="h-3 w-3" /> : 'Save'}
        </button>
      </div>
    </div>
  )
}
