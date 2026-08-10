import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'

// Searching a conversation.
//
// EXTRACTED FROM ChatExtras SO THE LEGACY CHAT CAN HAVE IT TOO. ChatExtras
// imports the Motion runtime, and Chat.jsx - the room 43 creators actually use
// every day - is eagerly routed, so importing from there would have put Motion
// in every creator's first paint just to get a magnifying glass. Same trap as
// flagFromIso and ParticipationBar. ChatExtras re-exports these two, so the
// network rooms are unchanged.
//
// Filters what is already loaded rather than querying. A room holds 200
// messages in memory; searching them is instant and works offline, and a
// server round trip for something this small would be slower AND worse.

// ------------------------------------------------------------------- search
//
// Filters what is already loaded rather than querying. A room holds 200
// messages in memory; searching them is instant and works offline, and a
// server round trip for something this small would be slower AND worse.

export function RoomSearch({ value, onChange, count, total }) {
  const ref = useRef(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (open) ref.current?.focus()
    else onChange('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Search this room"
        className="shrink-0 rounded-lg p-1.5 text-smoke transition-colors hover:bg-white hover:text-ink"
      >
        <Icon name="magnifier" className="h-4 w-4" />
      </button>
    )
  }

  return (
    <div className="flex min-w-0 flex-1 items-center gap-2">
      <Icon name="magnifier" className="h-3.5 w-3.5 shrink-0 text-smoke" />
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        placeholder="Search this room"
        className="min-w-0 flex-1 border-0 bg-transparent text-sm outline-none placeholder:text-gray-400"
      />
      {value && (
        <span className="shrink-0 text-[11px] tabular-nums text-smoke">
          {count} of {total}
        </span>
      )}
      <button onClick={() => setOpen(false)} aria-label="Close search"
        className="shrink-0 rounded-lg p-1 text-smoke transition-colors hover:text-ink">
        <Icon name="close" className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// Highlights the matched run inside a message without dangerouslySetInnerHTML.
export function Highlight({ text, term }) {
  if (!term) return text
  const i = text.toLowerCase().indexOf(term.toLowerCase())
  if (i === -1) return text
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-brand/20 px-0.5 text-inherit">{text.slice(i, i + term.length)}</mark>
      {text.slice(i + term.length)}
    </>
  )
}
