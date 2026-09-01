import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { useIsPhone } from '../lib/useKeyboardInset'
import { useT } from '../lib/i18n'

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

export function RoomSearch({ value, onChange, count, total, label = 'Search this room' }) {
  const tr = useT()
  const ref = useRef(null)
  const [open, setOpen] = useState(false)
  const phone = useIsPhone()

  useEffect(() => {
    if (open) ref.current?.focus()
    else onChange('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // SIZED LIKE THE DM ONE, BECAUSE THE DM ONE IS RIGHT.
  //
  // This was a bare 14px input on a transparent background wedged into the
  // room's hint strip, which is 1 unit of vertical padding tall. Opening it gave
  // you a text field with nowhere to sit and a magnifier the size of the text
  // beside it - the reported "very, very cramped". The DM header gives its
  // search a real field with real height, and that is the one that "fits much
  // nicer", so this is now that: a 36px rounded field with its own surface, and
  // a 36px square target when closed.
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label={label}
        title={label}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-smoke transition-colors hover:bg-white hover:text-ink"
      >
        <Icon name="magnifier" className="h-4 w-4" />
      </button>
    )
  }

  return (
    <div className="flex h-9 min-w-0 flex-1 items-center gap-2 rounded-full border border-gray-200 bg-white pl-3 pr-1.5 shadow-sm">
      <Icon name="magnifier" className="h-4 w-4 shrink-0 text-smoke" />
      <input
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && setOpen(false)}
        /* "Search", not "Search this conversation". This field is the whole
           width of a phone's tab strip minus a magnifier and a close button,
           so the long label was cut off mid-word. The `aria-label` on the
           closed button still says what it searches. */
        placeholder={phone ? 'Search' : label}
        /* `no-ios-zoom`: a 14px input makes iOS Safari zoom the page in on
           focus and never zoom back out. See index.css.
           focus-visible:ring-0 because index.css puts a brand ring on
           *:focus-visible, and this input is focused PROGRAMMATICALLY the
           moment it opens - so the ring fired every single time and read as an
           orange box round the search bar. `outline-none` cannot clear it: the
           ring is a box-shadow. Same fix as the command palette input. */
        className="no-ios-zoom min-w-0 flex-1 border-0 bg-transparent p-0 outline-none focus-visible:ring-0 placeholder:text-gray-400"
      />
      {value && (
        <span className="shrink-0 whitespace-nowrap text-[11px] tabular-nums text-smoke">
          {count} of {total}
        </span>
      )}
      <button onClick={() => setOpen(false)} aria-label={tr("Close search")}
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-smoke transition-colors hover:bg-cloud hover:text-ink">
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
