import { useEffect, useRef, useState } from 'react'
import { Spinner } from './ui'
import { editMessage } from '../lib/messageActions'
import { cx } from '../lib/utils'

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
export default function MessageEditor({ kind, message, onSaved, onCancel, onDark = false }) {
  const [value, setValue] = useState(message.body || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const ref = useRef(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.focus()
    // Caret at the END, not over the whole message. You opened this to change
    // something small; a full selection means the first key you press deletes
    // everything you wrote.
    const n = el.value.length
    el.setSelectionRange(n, n)
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 220)}px`
  }, [])

  function grow(e) {
    setValue(e.target.value)
    e.target.style.height = 'auto'
    e.target.style.height = `${Math.min(e.target.scrollHeight, 220)}px`
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
    <div className="w-full min-w-[12rem] text-left">
      <textarea
        ref={ref}
        value={value}
        onChange={grow}
        rows={1}
        maxLength={4000}
        aria-label="Edit your message"
        onKeyDown={(e) => {
          // Escape cancels, Enter saves, Shift+Enter is a new line. Same
          // grammar as the composer, so there is nothing new to learn.
          if (e.key === 'Escape') { e.preventDefault(); onCancel() }
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); save() }
        }}
        className={cx(
          'w-full resize-none rounded-xl border px-3 py-2 text-sm leading-relaxed outline-none',
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
