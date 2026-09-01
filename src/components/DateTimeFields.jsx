import { useEffect, useRef, useState } from 'react'
import { cx } from '../lib/utils'

// TYPED DATES AND TIMES, WITHOUT THE NATIVE CONTROL.
//
// EXTRACTED FROM THE FLIGHT LOG, where this was built and then stayed. Every
// other date field on the platform was either `<input type="date">` or a single
// text box being reformatted on every keystroke, and the owner has now reported
// the same fault in three of them: "when typing in the date, similar to typing
// in date on flight log, it should still show dd/mm/yy until I type the actual
// number on, not disappear after the first number, and the slashes should still
// visually show, I don't have to type them."
//
// WHY NOT `<input type="date">`. It is three segments the browser owns, and
// every segment you land on is painted with the OS selection highlight - a blue
// block that flashes across the field as you type. You cannot style it: it is
// UA shadow DOM and `::selection` does not reach it.
//
// WHY NOT A SINGLE REFORMATTING TEXT BOX. That is what "find a time" had. A
// controlled input that rewrites its own value mid-typing is one you cannot
// type "1" into, because the moment you do it becomes "01" and the caret jumps
// to the end. And the placeholder is all-or-nothing, so the moment you type one
// character the whole "DD/MM/YYYY" hint vanishes and you are navigating by
// memory.
//
// SO: separate numeric segments with real separators painted between them. The
// separators are always visible and are never typed. Each segment keeps its own
// placeholder, so after typing the day you can still see MM and YYYY waiting.

// A CLICK ANYWHERE IN THE BOX STARTS WHERE THE FIELD IS UNFINISHED.
//
// Ethan: "when I click anywhere on the box it should always start with me
// entering DD then MM then Year, not me clicking near year starts at year."
//
// The segments are real inputs sitting side by side, so the browser did the
// literal thing and focused whichever one your pointer happened to land on -
// which on an empty field means typing the day into the year box. Reading order
// is the intent: while the value is INCOMPLETE, any press inside the frame goes
// to the first segment still waiting for digits.
//
// Once the date IS complete this steps aside, because at that point a click on
// the year is somebody correcting the year, and dragging them back to the day
// would make an existing date impossible to edit.
function focusFirstUnfinished(refs, sizes) {
  const target = refs.findIndex((r, i) => (r.current?.value?.length ?? 0) < sizes[i])
  if (target === -1) return null
  return refs[target].current
}

function Part({ id, label, value, onChange, onOverflow, onBack, width, max, inputRef }) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      id={id}
      ref={inputRef}
      aria-label={label}
      inputMode="numeric"
      autoComplete="off"
      value={value}
      onFocus={(e) => { setFocused(true); e.target.select() }}
      onBlur={() => setFocused(false)}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, '').slice(0, max)
        onChange(digits)
        if (digits.length === max) onOverflow?.()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Backspace' && !value) { e.preventDefault(); onBack?.() }
      }}
      placeholder={focused ? '0'.repeat(max) : label}
      className={cx(
        // `no-ios-zoom` IS 16px ON A PHONE. Ethan, of the calendar's "find a
        // time": "please ensure you've fixed the issue with the zooming in
        // across the platform because clicking on a text box here automatically
        // is zooming in." iOS Safari zooms the page into any field under 16px
        // and never zooms back out; at `text-sm` every date and time segment on
        // the platform was one - the calendar, the flight log, the challenge
        // form and this dialog all draw this component. The segment widths
        // below are wide enough for 16px tabular digits.
        'no-ios-zoom bg-transparent text-center tabular-nums text-ink outline-none placeholder:text-gray-300',
        // NO RING ON THE SEGMENT. THIS IS THE ORANGE BOX.
        //
        // index.css has a base rule `input:focus-visible { ring-1 ring-brand }`
        // so a search box lights up when you tab to it. A text input is
        // `:focus-visible` on a MOUSE CLICK too (correct per spec - the browser
        // cannot know you are not about to type), and this field is several
        // inputs inside one bordered box pretending to be one control. So
        // clicking into DD drew a small orange rectangle around two characters,
        // inside the field's own border, and it hopped along as the caret
        // advanced. The segment is not a control a person perceives, so it must
        // not have a focus indicator of its own - the WRAPPER carries it.
        'focus-visible:ring-0 focus-visible:ring-offset-0',
        width,
      )}
    />
  )
}

const Frame = ({ children, invalid, id, label, hint, error, onMouseDown }) => (
  <div>
    {label && <label htmlFor={id} className="label">{label}</label>}
    <div
      onMouseDown={onMouseDown}
      className={cx(
        'flex w-full items-center gap-0.5 rounded-xl border bg-white px-3.5 py-2.5 transition-colors',
        'focus-within:border-brand focus-within:ring-1 focus-within:ring-brand',
        invalid ? 'border-brand/60' : 'border-gray-200',
      )}
    >
      {children}
    </div>
    {error
      ? <p className="mt-1 text-[11px] font-medium text-brand">{error}</p>
      : hint && <p className="mt-1 text-[11px] text-gray-400">{hint}</p>}
  </div>
)

/**
 * DD / MM / YYYY. Emits an ISO `yyyy-MM-dd` once all three are complete AND the
 * result is a real date, and '' at every other moment.
 */
export function DateField({ id, label, value, onChange, max, min, hint, futureError }) {
  // The parts are LOCAL state, not derived from `value` on every render - see
  // the note above about reformatting mid-typing.
  const [d, setD] = useState(() => (value ? value.slice(8, 10) : ''))
  const [m, setM] = useState(() => (value ? value.slice(5, 7) : ''))
  const [y, setY] = useState(() => (value ? value.slice(0, 4) : ''))
  const dRef = useRef(null)
  const mRef = useRef(null)
  const yRef = useRef(null)

  // Re-seed from the outside ONLY when the caller clears or replaces the value
  // wholesale (opening the editor on a different row). Syncing on every change
  // is what makes it uneditable.
  useEffect(() => {
    if (!value) {
      if (d || m || y) { setD(''); setM(''); setY('') }
      return
    }
    const nd = value.slice(8, 10)
    const nm = value.slice(5, 7)
    const ny = value.slice(0, 4)
    if (`${y}-${m}-${d}` !== value) { setD(nd); setM(nm); setY(ny) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  // Push up only when all three are complete and the result is a real date.
  // 31/02 is three complete boxes and not a day, and a form that accepts it and
  // fails on save is worse than one that simply waits.
  useEffect(() => {
    if (d.length === 2 && m.length === 2 && y.length === 4) {
      const iso = `${y}-${m}-${d}`
      const dt = new Date(`${iso}T12:00:00Z`)
      const ok = !Number.isNaN(dt.getTime())
        && dt.getUTCDate() === Number(d) && dt.getUTCMonth() + 1 === Number(m)
      onChange(ok ? iso : '')
    } else {
      onChange('')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, m, y])

  const tooLate = value && max && value > max
  const tooEarly = value && min && value < min
  const bad = tooLate || tooEarly

  return (
    <Frame
      id={`${id}-d`} label={label} hint={hint} invalid={bad}
      onMouseDown={(e) => {
        const first = focusFirstUnfinished([dRef, mRef, yRef], [2, 2, 4])
        if (!first || first === e.target) return
        e.preventDefault()
        first.focus()
        first.select()
      }}
      error={bad ? (futureError || (tooLate ? 'That is in the future.' : 'That is too far back.')) : null}
    >
      <Part id={`${id}-d`} inputRef={dRef} label="DD" max={2} width="w-7" value={d}
        onChange={setD} onOverflow={() => mRef.current?.focus()} />
      <span className="text-gray-300">/</span>
      <Part id={`${id}-m`} inputRef={mRef} label="MM" max={2} width="w-8" value={m}
        onChange={setM} onOverflow={() => yRef.current?.focus()} onBack={() => dRef.current?.focus()} />
      <span className="text-gray-300">/</span>
      <Part id={`${id}-y`} inputRef={yRef} label="YYYY" max={4} width="w-12" value={y}
        onChange={setY} onBack={() => mRef.current?.focus()} />
    </Frame>
  )
}

/**
 * HH : MM, 24 hour. Emits 'HH:MM' when both halves are complete and in range,
 * '' otherwise. The colon is painted, never typed.
 */
export function TimeField({ id, label, value, onChange, hint, optional = false }) {
  // "Optional" belongs to the LABEL, which has a whole line to itself. See the
  // note where the old in-field marker used to be.
  const shownLabel = optional && label ? `${label} (optional)` : label
  const [h, setH] = useState(() => (value ? value.slice(0, 2) : ''))
  const [m, setM] = useState(() => (value ? value.slice(3, 5) : ''))
  const hRef = useRef(null)
  const mRef = useRef(null)

  useEffect(() => {
    if (!value) {
      if (h || m) { setH(''); setM('') }
      return
    }
    if (`${h}:${m}` !== value) { setH(value.slice(0, 2)); setM(value.slice(3, 5)) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  useEffect(() => {
    if (h.length === 2 && m.length === 2 && Number(h) <= 23 && Number(m) <= 59) onChange(`${h}:${m}`)
    else onChange('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [h, m])

  const bad = (h.length === 2 && Number(h) > 23) || (m.length === 2 && Number(m) > 59)

  return (
    <Frame
      id={`${id}-h`} label={shownLabel} hint={hint} invalid={bad}
      onMouseDown={(e) => {
        const first = focusFirstUnfinished([hRef, mRef], [2, 2])
        if (!first || first === e.target) return
        e.preventDefault()
        first.focus()
        first.select()
      }}
      error={bad ? 'Use a 24 hour time, so 14:30 rather than 2:30pm.' : null}
    >
      <Part id={`${id}-h`} inputRef={hRef} label="HH" max={2} width="w-7" value={h}
        onChange={setH} onOverflow={() => mRef.current?.focus()} />
      <span className="text-gray-300">:</span>
      <Part id={`${id}-m`} inputRef={mRef} label="MM" max={2} width="w-8" value={m}
        onChange={setM} onBack={() => hRef.current?.focus()} />
      {/* THE WORD "OPTIONAL" IS GONE. Ethan: "the repeat until with the time
          shows the word optional half out of the box, remove the word
          optional." It was absolutely the wrong element for the job - an
          `ml-auto` span inside a fixed-width row of digit segments, so on any
          field narrow enough (the repeat-until time is the narrowest on the
          platform) it was pushed through the border. Whether a field is
          required is stated by the LABEL, which every caller already sets, and
          which has room for it. */}
    </Frame>
  )
}
