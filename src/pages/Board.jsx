import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import NetworkLayout from '../components/network/NetworkLayout'
import NetworkMotion from '../components/NetworkMotion'
import Reveal from '../components/network/Reveal'
import Thumbtack, { ThumbtackDefs } from '../components/network/Thumbtack'
import Icon from '../components/Icon'
import LocalTime from '../components/LocalTime'
import { Avatar, EmptyState, Modal, Skeleton } from '../components/ui'
import { confirm, notice } from '../lib/confirm'
import { toast } from '../lib/toast'
import {
  BOARD_TAGS, tagInfo, loadFeed, loadThread, askQuestion, editQuestion, postAnswer,
  removeAnswer, removeQuestion,
} from '../lib/board'
import { cx, formatMessageTime, messageTimeTitle } from '../lib/utils'

// THE COMMUNITY BOARD.
//
// WHY IT EXISTS, AND WHY IT IS NOT A ROOM
//
// A creator with a question about Japan has three bad options in a chat-shaped
// product: post it in a room where it scrolls past six other conversations in an
// hour, DM one person and get exactly one person's answer, or not ask. Rooms are
// good at conversation and bad at questions, because a question has a lifetime
// measured in days and a room has one measured in minutes.
//
// So: a question stays put, anybody can answer it, several people can answer the
// same one, and the answer is still there in March for the next person who
// wonders the same thing. That last part is the whole return on it - a room's
// value is spent the moment it scrolls, and a board's compounds.
//
// UNANSWERED IS THE STATE THAT MATTERS
//
// The board's one promise to somebody who asks is that their question will not
// sit there. So "waiting for an answer" is a first-class filter with a live
// count on it, and it is the one the empty-ish board opens on: a creator who
// arrives with nothing to ask can still see, in one number, whether there is
// anybody to help. "Answered" is derived from having answers, never from a flag
// somebody has to remember to set - a resolved flag is wrong within a week.
//
// EVERY CARD SHOWS WHO ANSWERED, AS FACES
//
// Not "3 replies". Three faces, because the question a reader is really asking
// of an answered thread is whether anybody who would know has been near it, and
// a number cannot answer that.

// ---------------------------------------------------------------- the composer
//
// ONE FORM FOR ASKING AND FOR EDITING. `existing` switches it: the fields are
// the same fields and the validation is the same validation, so writing it
// twice would only guarantee that the two drift.
function AskModal({ open, onClose, onAsked, existing = null }) {
  const { user } = useAuth()
  const editing = !!existing
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tag, setTag] = useState('country')
  const [country, setCountry] = useState('')
  const [busy, setBusy] = useState(false)

  // Reseed whenever a different question is opened for editing (or the modal is
  // opened fresh to ask). Keyed on the id so re-renders never stamp on typing.
  useEffect(() => {
    if (!open) return
    setTitle(existing?.title || '')
    setBody(existing?.body || '')
    setTag(existing?.tag || 'country')
    setCountry(existing?.country || '')
  }, [open, existing?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const ok = title.trim().length >= 5

  async function submit(e) {
    e.preventDefault()
    if (!ok || busy) return
    setBusy(true)
    const { data, error } = editing
      ? await editQuestion({ id: existing.id, title, body, tag, country })
      : await askQuestion({ authorId: user.id, title, body, tag, country })
    setBusy(false)
    if (error) { notice(`That did not save: ${error.message}`); return }
    onAsked?.(data?.id ?? existing?.id)
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit your question' : 'Ask the community'} wide>
      <form onSubmit={submit} className="space-y-5">
        {/* THE TAG FIRST, because it changes what the rest of the form asks.
            One line each, not a label over a line of examples. See BOARD_TAGS
            for why the examples went; what it buys here is four short chips
            instead of four paragraphs, which is most of the white space Ethan
            was looking at. */}
        <div>
          <p className="mb-2 text-sm font-semibold">What is it about?</p>
          <div className="grid grid-cols-2 gap-2">
            {BOARD_TAGS.map((t) => {
              const on = tag === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTag(t.key)}
                  aria-pressed={on}
                  className={cx(
                    'flex items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-200',
                    on ? 'border-brand bg-brand-tint/30 ring-1 ring-brand/30' : 'border-gray-200 hover:-translate-y-0.5 hover:border-brand/50',
                  )}
                >
                  <span className={cx(
                    'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-colors',
                    on ? 'bg-brand text-white' : 'bg-cloud text-smoke',
                  )}>
                    <Icon name={t.icon} className="h-3.5 w-3.5" />
                  </span>
                  <span className="min-w-0 truncate text-sm font-semibold">{t.label}</span>
                </button>
              )
            })}
          </div>
        </div>

        {/* THE COUNTRY FIELD GROWS AND SHRINKS. IT DOES NOT APPEAR AND
            DISAPPEAR, AND IT NO LONGER RESERVES A HOLE.

            "Which country?" only makes sense for one of the four tags, so there
            have now been three versions of this slot and the first two were both
            wrong in the obvious ways. Mounting and unmounting the field made the
            whole dialog jump a row taller and shorter as you moved between tags,
            which also moves the button you were about to press. Reserving a
            fixed 4.5rem slot and filling it with the tag's hint text fixed the
            jump by making the dialog permanently taller and putting filler in
            the gap - which is exactly the white space Ethan is now looking at,
            and the filler was the hint copy he has asked to be rid of.

            So the slot is a real height transition. `grid-template-rows: 0fr ->
            1fr` animates to the content's OWN height without anybody measuring
            anything or hard-coding a number, and `overflow-hidden` on the inner
            row is what makes the clip follow it. The field fades as it goes so
            it does not look like it is being squeezed through a letterbox, and
            `aria-hidden` plus `inert`-by-tabindex keeps a collapsed input out of
            the tab order.

            The whole thing is `motion-safe:` - with reduced motion it simply is
            or is not there, which is the correct reading of that preference. */}
        <div
          className={cx(
            'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
            tag === 'country' ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
          )}
        >
          <div className="overflow-hidden">
            <label htmlFor="board-country" className="mb-1.5 block text-sm font-semibold">Which country?</label>
            <input
              id="board-country" className="input" value={country}
              tabIndex={tag === 'country' ? undefined : -1}
              aria-hidden={tag !== 'country'}
              onChange={(e) => setCountry(e.target.value)}
            />
          </div>
        </div>

        <div>
          <label htmlFor="board-title" className="mb-1.5 block text-sm font-semibold">
            Your question
          </label>
          {/* NO PLACEHOLDER. It used to read "Is the JR Pass still worth it for
              two weeks?", which is a good example question and a bad thing to
              put in the box: a fully-formed sentence sitting in the field is
              read as content by half the people who see it, it anchors what
              everybody asks about, and the line under the box already says what
              makes a good question. Ethan: "remove these." */}
          <input
            id="board-title" className="input" value={title} maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
          />
          {/* A LENGTH HINT, NOT A LENGTH ERROR. The counter only speaks up near
              the ends, because a number that is always there is a number nobody
              reads. */}
          <p className="mt-1 text-xs text-smoke">
            {title.trim().length < 5
              ? 'One clear sentence gets more answers than a headline.'
              : title.length > 130 ? `${160 - title.length} characters left` : 'Good. Add the detail below if it helps.'}
          </p>
        </div>

        <div>
          <label htmlFor="board-body" className="mb-1.5 block text-sm font-semibold">
            Anything that would help somebody answer <span className="font-normal text-smoke">(optional)</span>
          </label>
          <textarea
            id="board-body" rows={4} className="input" value={body} maxLength={4000}
            onChange={(e) => setBody(e.target.value)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={!ok || busy} className="btn-primary disabled:opacity-40">
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Post to the board'}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
      </form>
    </Modal>
  )
}

// ------------------------------------------------------------------ one note
//
// A STICKY NOTE ON A BOARD, NOT A ROW IN A LIST.
//
// Ethan: "I don't like the current design, I want it to visually look much
// different, like an actual board where the cards are square little sticky
// notes across a wide page with a little pin icon looking like it's pinned on."
// He is describing the thing the feature already IS - a place where questions
// are pinned up and left - and the old card, a wide white rectangle in a
// two-column list, was the shape of every other feed in the app.
//
// The design does three things a list cannot:
//
//   * A NOTE HAS A SIZE. A square card cannot hold an essay, so a long question
//     is visibly a long question and the title has to earn its space. The list
//     card grew to fit anything, which is why the board read as homogeneous.
//   * THE ROTATION IS THE POINT. A grid of perfectly aligned squares is a grid.
//     A degree and a half of tilt, DIFFERENT PER NOTE, is what makes it a
//     board. It is deterministic (hashed from the id) so a note does not jump
//     to a new angle every time the feed refreshes, which would be unsettling
//     in a way nobody could name.
//   * HOVER STRAIGHTENS IT. Reaching for a note squares it up and lifts it off
//     the cork. That is a physical idea everyone already has, and it costs one
//     transition.
//
// COLOUR CARRIES THE STATE. Waiting for an answer is warm amber, answered is a
// pale green, and that is legible across a whole wall of notes at a glance - the
// state chips in the old design needed reading one at a time.

// A stable small integer from an id: same note, same tilt, every render.
function noteHash(id = '') {
  let h = 0
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0
  return Math.abs(h)
}

// THE THUMBTACK LIVES IN ITS OWN FILE.
//
// It was defined here and copied, in an older form, into the hub's BoardCard -
// so the two drifted and the same note was pinned up by two different objects
// depending on which page you were looking at. See components/network/Thumbtack
// for what it is and why it is shaped the way it is. `ThumbtackDefs` is
// re-exported because BoardThread below renders one too.

// WHAT THE REDESIGN CHANGED, AND WHY
//
// Ethan: "the current design doesn't match the platform colours and aesthetics,
// please redesign it, make it more aesthetic while still keeping that kind of
// style and function." The shape was right - notes, pins, tilt, hover
// straightens - and the palette was from somewhere else entirely.
//
//   * THE PAPER IS WHITE NOW, AND THE STATE IS A BAND ACROSS THE TOP. Amber
//     paper and green paper are two hues this product does not own, tiling a
//     whole page. On a white-dominant product with one orange, a wall of amber
//     rectangles IS the design, and it is not this one. White notes on a
//     faintly orange board read as paper on a board; the coloured strip at the
//     head of each note still carries the state at a glance, which was the one
//     thing the coloured paper was doing well.
//   * WAITING IS BRAND ORANGE, ANSWERED IS GREEN. Orange because a question
//     nobody has answered is the thing this page wants you to act on, and
//     orange is what this product uses for "here". Green stays for answered:
//     it is the only other colour in the system and it means done everywhere
//     else in the app.
//   * THE TAG IS A REAL CHIP. It was grey uppercase micro-type doing the job of
//     a label; it is a brand-tint chip now, which is how every other tag in
//     this product looks.
//   * THE FOOT IS SEPARATED BY A RULE. The author line used to float against
//     the paper under the question with nothing between them, so a two-line
//     question and a name ran together. A hairline is enough.
// A NOTE IS THE SIZE OF WHAT IS WRITTEN ON IT.
//
// Every note used to be `aspect-square`, which is a grid of identical tiles - a
// spreadsheet with rounded corners. Ethan: "the post it notes shouldn't all be
// the same size, it should depend on the text and it would look more aesthetic
// if they were different sizes and arranged in a cool way."
//
// So the note has NO fixed height at all now. It is as tall as its question,
// its answers and its foot, and the arrangement comes from CSS columns rather
// than a grid: notes flow down a column and the next one starts where the last
// one ended, which is exactly how things end up on a real board. A grid cannot
// do this - grid rows are as tall as their tallest cell, so one long note would
// leave a gap beside every short one on its row.
//
// The TYPE SIZE steps with the length too. A six-word question set in the same
// 15px as a forty-word one is a small note with a lot of air in it; giving the
// short one bigger type makes it read as a note somebody scrawled, and it is
// what stops a wall of variable-height cards looking merely uneven.
function noteScale(q) {
  const n = (q.title || '').length + (q.body || '').length / 3
  if (n < 40) return 'text-[17px] sm:text-[19px]'
  if (n < 80) return 'text-[15px] sm:text-[16px]'
  return 'text-[14px] sm:text-[15px]'
}

// A NOTE HAS A SHAPE OF ITS OWN, AND THE WALL IS A MIXTURE OF SHAPES.
//
// Letting the height fall out of the text alone got the notes off the grid, and
// it left a second problem: a board of short questions is a board of identical
// short strips, because almost every question IS short. Ethan: "I want the
// visual post notes to be different sizes depending on the question and just
// have a mixture anyway. On average they should be square, but also have some
// smaller ones like the current ones, and even longer ones that are like two
// squares on top of each other."
//
// So each note is given a MINIMUM shape, as a ratio of its own width, and the
// text can still push past it. The mixture is weighted the way he described it -
// square is the common case, small and tall are the variation, and one in ten is
// the double - and it is drawn from the id hash, so a note keeps its shape
// between visits rather than reshuffling the whole wall on every refresh.
//
// HOW A MINIMUM ASPECT RATIO IS ACTUALLY DONE HERE, because the two obvious
// ways are both wrong and the third nearly worked.
//
// A PIXEL HEIGHT cannot work: the column width changes at three breakpoints and
// again whenever the rail is there.
//
// `aspect-ratio` ALONE sets the height rather than flooring it, so a note whose
// question runs long has its own text hanging out of the bottom of the paper.
//
// `aspect-ratio` PLUS `min-height: fit-content` is what this was first written
// as, on the reasoning that `fit-content` in the block axis resolves to the
// content's own height. It does not, in practice: on a box that already has a
// resolved aspect-ratio height Chrome leaves the minimum at the ratio, and the
// long note overflowed exactly as before - which is what shipped for about ten
// minutes and is visible in the third note on the board.
//
// SO IT IS THE PERCENTAGE-PADDING SPACER, which is old and completely reliable.
// A percentage `padding-top` resolves against the CONTAINING BLOCK'S WIDTH, so a
// zero-width floated span with `padding-top: 150%` is exactly one and a half
// note-widths tall and occupies no room across. A parent with `display:
// flow-root` grows to contain a float, so the note is AT LEAST that tall and
// taller when the writing needs it, at any column width, with no measuring.
//
// `flow-root` and not `overflow: hidden` - the other way to contain a float -
// because the pin deliberately hangs over the top edge and a clip would cut its
// head off. And the note stops being a flex column, so the author line follows
// the writing down the page instead of being pushed to the bottom edge: on a
// tall note that leaves blank paper under it, which is what a real note with
// three words on it looks like.
const NOTE_SHAPES = [0.62, 1, 1, 1.5, 1, 0.62, 2.06, 1, 1, 1.5]

function QuestionNote({ q }) {
  const t = tagInfo(q.tag)
  const answers = Number(q.answer_count || 0)
  const shown = q.answers || []
  const h = noteHash(q.id)
  // -1.6, -0.8, 0.8 or 1.6 degrees. Small on purpose: past about two degrees a
  // wall of notes stops looking casual and starts looking broken.
  const tilt = [-1.6, -0.8, 0.8, 1.6][h % 4]
  const shape = NOTE_SHAPES[h % NOTE_SHAPES.length]
  const open = answers === 0

  return (
    <Link
      to={`/board/${q.id}`}
      // THE NOTE TURNS ABOUT ITS PIN, because that is the only thing holding
      // it. This is one line and it does more for "this is pinned up" than the
      // drawing of the pin does: the tilt is now a sheet hanging off a fixed
      // point rather than a rectangle rotated about its own middle, and
      // straightening on hover swings it back around the same point instead of
      // sliding the pin sideways across the paper. `2.1rem` is where the
      // flange sits - see Thumbtack.
      style={{ transform: `rotate(${tilt}deg)`, transformOrigin: '50% 2.1rem' }}
      className={cx(
        // `break-inside-avoid` is what makes the columns work: without it a
        // note is split across the bottom of one column and the top of the
        // next, which is a genuinely alarming thing to see happen to a piece of
        // paper. `mb-*` rather than a grid gap, because columns have no gap
        // along their own axis.
        'group relative mb-4 flow-root break-inside-avoid rounded-lg border bg-white transition-all duration-300 ease-out sm:mb-5',
        // PAPER, NOT A CARD. `shadow-card` is the flat even shadow every other
        // surface in this app uses and it is the wrong one here: a sheet held
        // at one point hangs, so it is closest to the page at the pin and
        // furthest from it at the bottom edge. The shadow is offset downwards
        // and gets a second, wider, softer pass under it, which is what reads
        // as a curl rather than a decal.
        'shadow-[0_2px_3px_-1px_rgba(20,20,30,0.07),0_10px_16px_-8px_rgba(20,20,30,0.16)]',
        // NO `overflow-hidden` HERE. The state band gets rounded top corners of
        // its own instead, so the note can keep a square clip-free box.
        //
        // `hover:!rotate-0` beats the inline transform: reaching for a note
        // squares it up and lifts it off the page.
        'hover:z-10 hover:-translate-y-1.5 hover:!rotate-0',
        'hover:shadow-[0_4px_6px_-2px_rgba(20,20,30,0.08),0_20px_30px_-12px_rgba(20,20,30,0.24)]',
        open ? 'border-brand/25 hover:border-brand/50' : 'border-green-200 hover:border-green-400',
      )}
    >
      <Thumbtack className="h-14 w-14" top="top-0.5" />

      {/* THE SHAPE. Zero width so it takes no room across, percentage padding so
          its height is a fraction of the note's own width. See NOTE_SHAPES. */}
      <span className="float-left w-0" style={{ paddingTop: `${shape * 100}%` }} aria-hidden />

      {/* THE STATE, AS A BAND. Two pixels of colour across the top of a white
          note is legible across a whole wall without tinting the paper - and it
          leaves the paper white, which is what makes the wall read as this
          product rather than as a different one. */}
      <span className={cx('block h-1 w-full rounded-t-lg', open ? 'bg-brand' : 'bg-green-500')} aria-hidden />

      {/* THE PIN NEEDS PAPER TO SIT ON. `pt-14` is the head plus a little air
          under it, and it is not wasted space - a real note has a margin above
          the writing precisely because that is where the pin goes. Content
          that started at the top edge is what forced the old pin off the top
          of the card in the first place. */}
      <span className="block p-3.5 pt-14 sm:p-4 sm:pt-14">
        <span className="mb-2 flex items-center gap-1.5">
          <span className={cx(
            'inline-flex min-w-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold',
            open ? 'bg-brand-tint text-brand' : 'bg-green-50 text-green-700',
          )}>
            <Icon name={t.icon} className="h-3 w-3 shrink-0" />
            <span className="truncate">{q.tag === 'country' && q.country ? q.country : t.short}</span>
          </span>
          {!open && (
            <span className="ml-auto shrink-0 text-[10px] font-bold text-green-700">
              {answers} {answers === 1 ? 'answer' : 'answers'}
            </span>
          )}
        </span>

        {/* The question is the note. Still clamped, but at eight lines rather
            than four: the clamp is now a safety net against somebody pasting an
            essay into the title, not the thing deciding the note's height. */}
        <h3 className={cx('line-clamp-[8] font-semibold leading-snug text-ink transition-colors group-hover:text-brand', noteScale(q))}>
          {q.title}
        </h3>
        {q.body && <p className="mt-1.5 line-clamp-3 text-[13px] leading-snug text-smoke">{q.body}</p>}

        {/* ---- WHAT PEOPLE SAID, ON THE NOTE ----
            Ethan: "the answers show below them, but if there's tons of answers
            or a message is too long you can make it so that you have to click
            to see it all."
            Two answers, two lines each, and then a line that says how much is
            left. Both caps matter and they are different caps: clamping the
            TEXT stops one long answer swallowing the note, and capping the
            COUNT stops a popular question becoming a column of its own. The
            whole note is already a link to the thread, so "click to see it all"
            costs no extra control - the line just has to say so. */}
        {shown.length > 0 && (
          <span className="mt-3 block space-y-2 border-t border-gray-100 pt-2.5">
            {shown.slice(0, 2).map((a) => (
              <span key={a.id} className="flex gap-2">
                <span className="mt-0.5 shrink-0">
                  <Avatar src={a.author_photo} name={a.author_name} size="xs" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[11px] font-semibold text-ink">{a.author_name}</span>
                  <span className="line-clamp-2 block text-[12px] leading-snug text-smoke">{a.body}</span>
                </span>
              </span>
            ))}
            {(answers > 2 || shown.some((a) => a.truncated)) && (
              <span className="block pt-0.5 text-[11px] font-semibold text-brand">
                {answers > 2
                  ? `Read all ${answers} answers`
                  : 'Read the full answer'}
              </span>
            )}
          </span>
        )}

        <span className="block pt-3">
        <span className="block border-t border-gray-100 pt-2.5">
          {open && (
            <span className="mb-2 flex items-center gap-1.5 text-[11px] font-semibold text-brand">
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
              </span>
              Waiting for an answer
            </span>
          )}
          <span className="flex items-center gap-2">
            <Avatar src={q.author_photo} name={q.author_name} size="xs" />
            <span className="min-w-0 flex-1 truncate text-[11px] text-smoke">
              {q.author_name} · {formatMessageTime(q.created_at)}
            </span>
          </span>
        </span>
        </span>
      </span>
    </Link>
  )
}

// ---------------------------------------------------------------- the board
const STATES = [
  { key: null, label: 'Everything' },
  { key: 'unanswered', label: 'Waiting for an answer' },
  { key: 'answered', label: 'Answered' },
]

export default function Board() {
  const [rows, setRows] = useState(null)
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState(null)
  const [state, setState] = useState(null)
  const [asking, setAsking] = useState(false)
  const navigate = useNavigate()

  const refresh = useCallback(async (opts) => {
    try {
      setRows(await loadFeed({ search, tag, state, ...opts }))
    } catch (e) {
      notice(`The board could not load: ${e.message}`)
      setRows([])
    }
  }, [search, tag, state])

  // DEBOUNCED, because this is a full-text query and a keystroke is not a
  // question. 250ms is under the threshold where typing feels laggy and well
  // over the gap between two keys.
  useEffect(() => {
    const t = setTimeout(() => { refresh() }, search ? 250 : 0)
    return () => clearTimeout(t)
  }, [refresh, search])

  const waiting = useMemo(
    () => (rows || []).filter((r) => Number(r.answer_count) === 0).length,
    [rows],
  )

  return (
    <NetworkMotion>
      {/* A WIDE PAGE, because a board is a wall. `narrow` gave the notes two
          columns at any screen size, which is a list with square cards in it. */}
      <NetworkLayout width="full" switcher={false}>
        <div className="space-y-6">
          <header className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight sm:text-3xl">
                <Icon name="chat" className="h-7 w-7 shrink-0 text-brand" />
                Community board
              </h1>
              {/* NO STRAPLINE. It read "Ask the whole network something. Anyone
                  can answer, and the answers stay here for whoever asks next",
                  which is a good description of the feature and a thing you need
                  told once. The wall of pinned notes under it says all of it
                  without a sentence, and the space is better spent on the notes.
                  Ethan: "remove this description below the title." */}
            </div>
            <button onClick={() => setAsking(true)} className="btn-primary transition-transform duration-200 hover:scale-105">
              <Icon name="pencil" className="h-4 w-4" />
              Ask a question
            </button>
          </header>

          {/* SEARCH IS THE FIRST CONTROL, not a filter tucked beside the tags.
              A board is only worth building if the answer from March is
              findable, and search is the only way anybody finds it. */}
          <div className="relative">
            <Icon name="magnifier" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
            <input
              type="search"
              className="input !pl-11"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search questions and answers…"
              aria-label="Search the board"
            />
          </div>

          {/* ONE ROW THAT SCROLLS ON A PHONE, wrapping from `sm` up. Seven
              pills wrapping at 375px is three rows of controls above the thing
              they filter, which pushed the board itself below the fold on the
              page whose whole point is the board. */}
          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0 [&::-webkit-scrollbar]:hidden">
            {STATES.map((s) => (
              <button
                key={s.label}
                onClick={() => setState(s.key)}
                aria-pressed={state === s.key}
                className={cx(
                  'inline-flex shrink-0 items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200',
                  state === s.key
                    ? 'border-brand bg-brand text-white'
                    : 'border-gray-200 bg-white text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand',
                )}
              >
                {s.key === 'unanswered' && state !== s.key && waiting > 0 && (
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
                )}
                {s.label}
              </button>
            ))}
            <span className="mx-1 hidden w-px self-stretch bg-gray-200 sm:block" />
            {BOARD_TAGS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTag(tag === t.key ? null : t.key)}
                aria-pressed={tag === t.key}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200',
                  tag === t.key
                    ? 'border-brand bg-brand text-white'
                    : 'border-gray-200 bg-white text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand',
                )}
              >
                <Icon name={t.icon} className="h-3.5 w-3.5" />
                {t.short}
              </button>
            ))}
          </div>

          {/* THERE IS NO BOARD BEHIND THE NOTES ANY MORE.
              It was a tinted, faintly grained panel with an inset edge - a
              drawn cork wall for the notes to be pinned to. Ethan: "remove the
              backing wall and just have the cards pinned on the entire white
              screen."
              He is right, and the reason is the same one that took the amber
              and green paper away before it: this product is white with one
              orange in it, and a full-width textured panel is a second surface
              competing with the notes for the reader's attention on a page
              whose entire content is the notes. Pinned straight onto the page,
              the paper is the only thing with a shadow, so the paper is the only
              thing that looks raised - which is what "pinned up" actually looks
              like.
              The minimum height went with it. It existed to stop a half-empty
              WALL looking like a strip of cork; with no wall there is nothing to
              look empty, and a screen and a half of enforced whitespace under
              four notes would be the new version of the same problem. */}
          {/* HALF A SCREEN OF ROOM UNDER THE LAST NOTE, ALWAYS.
              A board with six notes on it stops dead a third of the way down
              the window, and on a phone the last note ends up jammed against
              the tab bar with nowhere to go - the page simply refuses to
              scroll, which reads as the app having locked up rather than as
              there being nothing more. Ethan: "I want to be able to always
              scroll at least half a page down below nothing." So the wall
              carries half a viewport of empty board under it, plus the phone's
              tab bar and safe area, and a short board scrolls exactly like a
              long one. `50vh` and not `50dvh`: on iOS a dvh unit changes as the
              address bar collapses, so the page would grow while you scrolled
              it. */}
          <div className="pt-3 pb-[calc(50vh+6rem+env(safe-area-inset-bottom))] sm:pb-[50vh]">
            {/* The thumbtack's gradients, declared once for every pin on the
                page rather than once per note. */}
            <ThumbtackDefs />
            {rows === null ? (
              // The skeleton mirrors NOTE_SHAPES rather than a ladder of
              // arbitrary heights: what loads in has to be the shape of what
              // arrives, or the wall visibly re-lays itself the moment the
              // query lands.
              <div className="columns-2 gap-4 sm:gap-5 lg:columns-3 xl:columns-4">
                {[170, 260, 260, 380, 260, 170, 520, 260].map((h, i) => (
                  <Skeleton key={i} className="mb-4 block sm:mb-5" style={{ height: h }} />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<Icon name="chat" className="h-6 w-6" />}
                title={search ? `Nothing matches “${search}”` : 'Nothing pinned up yet'}
                hint={search
                  ? 'Try a shorter search, or ask it yourself and let the community answer.'
                  : 'Be the first. Somebody here has been where you are going.'}
                action={<button onClick={() => setAsking(true)} className="btn-primary">Ask a question</button>}
              />
            ) : (
              // COLUMNS, NOT A GRID, and that is what makes the notes different
              // sizes. A grid row is as tall as its tallest cell, so one long
              // note leaves a hole beside every short one on its row and the
              // only way out is to make them all the same height - which is
              // where `aspect-square` came from in the first place. Columns
              // have no rows: a note ends and the next one starts, so the wall
              // packs itself and the heights can be whatever the text needs.
              //
              // TWO ACROSS ON A PHONE, NOT ONE. A single column of notes is a
              // list - the wall is the whole idea. Two fit at 375px once the
              // page gutters are gone, which is what the full bleed bought.
              //
              // `Reveal` cannot wrap this: it puts every child in its own div,
              // and a wrapper between the column container and the note is
              // exactly what `break-inside-avoid` needs to be ON. The stagger
              // is done here instead, with the same variable the stylesheet
              // reads, so the notes still arrive one after another.
              // `mt-1.5` used to be here to stop a column box clipping the head
              // off the pin of whichever note started a column. The pin sits
              // wholly ON the paper now, so nothing overhangs and nothing can
              // be clipped; the margin stays purely as breathing room between
              // the heading and the first row of notes.
              <div className="reveal is-in columns-2 gap-4 sm:gap-5 lg:columns-3 xl:columns-4">
                {rows.map((q, i) => (
                  <div key={q.id} className="reveal-item mt-1.5 break-inside-avoid" style={{ '--reveal-i': Math.min(i, 12) }}>
                    <QuestionNote q={q} />
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </NetworkLayout>

      <AskModal
        open={asking}
        onClose={() => setAsking(false)}
        onAsked={(id) => {
          setAsking(false)
          toast('Posted to the board')
          if (id) navigate(`/board/${id}`)
          else refresh()
        }}
      />
    </NetworkMotion>
  )
}

// ---------------------------------------------------------------- one thread
export function BoardThread() {
  const { id } = useParams()
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [body, setBody] = useState('')
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const boxRef = useRef(null)

  const load = useCallback(async () => setData(await loadThread(id)), [id])
  useEffect(() => { load() }, [load])

  // Live, because two creators answering the same question at the same time is
  // the good case and each should see the other's answer arrive.
  useEffect(() => {
    const ch = supabase.channel(`board-${id}`)
      .on('postgres_changes',
        { event: '*', schema: 'public', table: 'board_answers', filter: `question_id=eq.${id}` },
        load)
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [id, load])

  async function answer(e) {
    e.preventDefault()
    if (!body.trim() || busy) return
    setBusy(true)
    const { error } = await postAnswer({ questionId: id, authorId: user.id, body })
    setBusy(false)
    if (error) { notice(`That did not post: ${error.message}`); return }
    setBody('')
    load()
  }

  // BOTH OF THESE NOW SAY WHEN THEY FAIL.
  //
  // They used to `await` a builder and throw the result away, so the RLS
  // refusal that made Remove a no-op (see migration 101) reached nobody: the
  // dialog closed, the page navigated, and the note was still there when you
  // got back. A destructive action that cannot report failure is worse than one
  // that does not exist, because you believe it worked.
  async function dropAnswer(a) {
    if (!await confirm('Remove your answer? It will disappear from the thread.')) return
    try {
      await removeAnswer(a.id)
      toast('Answer removed')
      load()
    } catch (e) {
      notice(`That did not remove: ${e.message}`)
    }
  }

  async function dropQuestion() {
    if (!await confirm('Remove this question and its answers from the board?')) return
    try {
      await removeQuestion(id)
      toast('Removed from the board')
      navigate('/board')
    } catch (e) {
      notice(`That did not remove: ${e.message}`)
    }
  }

  if (data === null) {
    return (
      <NetworkMotion>
        <NetworkLayout width="narrow" switcher={false}>
          <Skeleton className="h-64" />
        </NetworkLayout>
      </NetworkMotion>
    )
  }

  const { question: q, answers } = data
  if (!q) {
    return (
      <NetworkMotion>
        <NetworkLayout width="narrow" switcher={false}>
          <EmptyState
            icon={<Icon name="chat" className="h-6 w-6" />}
            title="That question is not here"
            hint="It may have been removed by whoever asked it."
            action={<Link to="/board" className="btn-secondary">Back to the board</Link>}
          />
        </NetworkLayout>
      </NetworkMotion>
    )
  }

  const t = tagInfo(q.tag)
  const mine = q.author_id === user?.id

  const openQ = answers.length === 0

  return (
    <NetworkMotion>
      <NetworkLayout width="narrow" switcher={false}>
        {/* OPENING A NOTE KEEPS THE BOARD.
            Ethan: "when clicking, I think it should open big but still keep the
            same look and aesthetic, not just back to a random card."
            It used to be a plain white card on the plain page background, which
            is the shape of every other detail page in the app - so tapping a
            pinned note took you somewhere that had nothing to do with a board.
            The thread now sits ON the same surface, and the question is the
            same note it was on the wall: the pin, the state band, the paper.
            Just much bigger, which is what "open big" means.

            The tilt is deliberately NOT carried over. A tilted note is a note
            on a wall among others; a tilted page of body text you are trying to
            read is a gimmick. Reaching for a note already straightens it, so
            arriving straightened is the same gesture finishing. */}
        {/* No surface here either - see the note on the board itself. The
            question is still the same note it was on the wall (the pin, the
            state band, the paper), just much bigger, which is what makes
            opening one feel like taking it down rather than navigating. */}
        <div className="space-y-6 pt-3">
          <ThumbtackDefs />
          <Link to="/board" className="inline-flex items-center gap-2 text-sm font-medium text-smoke transition-colors hover:text-brand">
            <Icon name="chevronLeft" className="h-4 w-4" />
            Community board
          </Link>

          <article className={cx(
            'relative rounded-lg border bg-white shadow-lift',
            openQ ? 'border-brand/25' : 'border-green-200',
          )}>
            <Thumbtack />
            <span className={cx('block h-1 w-full rounded-t-lg', openQ ? 'bg-brand' : 'bg-green-500')} aria-hidden />
            <div className="p-5 sm:p-7">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-2.5 py-1 text-[11px] font-semibold text-brand">
                <Icon name={t.icon} className="h-3 w-3" />
                {q.tag === 'country' && q.country ? q.country : t.short}
              </span>
              {/* Brand orange, not amber. It is the same state the note on the
                  wall draws in orange, and the two surfaces have to agree or
                  the colour stops meaning anything. */}
              {openQ && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-2.5 py-1 text-[11px] font-semibold text-brand">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                  Waiting for an answer
                </span>
              )}
              {(mine || isAdmin) && (
                <span className="ml-auto flex items-center gap-3">
                  {/* EDIT BEFORE REMOVE, and only for people who can. Deleting
                      a question deletes its answers with it, so the person who
                      only wanted to fix a typo needs the gentler option first
                      and nearer to hand. */}
                  {mine && (
                    <button onClick={() => setEditing(true)} className="text-xs font-medium text-smoke hover:text-brand">
                      Edit
                    </button>
                  )}
                  <button onClick={dropQuestion} className="text-xs font-medium text-smoke hover:text-red-600">
                    Remove
                  </button>
                </span>
              )}
            </div>

            <h1 className="text-xl font-bold leading-snug sm:text-2xl">{q.title}</h1>
            {q.body && <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-ink">{q.body}</p>}

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
              <Avatar src={q.profiles?.photo_url} name={q.profiles?.name} size="sm" />
              <div className="min-w-0">
                <Link to={`/profile/${q.author_id}`} className="block truncate text-sm font-semibold hover:text-brand">
                  {q.profiles?.name}
                </Link>
                <span className="text-xs text-smoke" title={messageTimeTitle(q.created_at)}>
                  Asked {formatMessageTime(q.created_at)}
                </span>
              </div>
              {!mine && <LocalTime profile={q.profiles} className="ml-auto text-xs text-smoke" />}
            </div>
            </div>
          </article>

          <section>
            <h2 className="mb-3 text-sm font-semibold text-ink">
              {answers.length === 0
                ? 'No answers yet'
                : `${answers.length} ${answers.length === 1 ? 'answer' : 'answers'}`}
            </h2>

            {answers.length === 0 ? (
              <p className="rounded-lg border border-dashed border-brand/30 bg-white/70 px-5 py-8 text-center text-sm text-smoke">
                Nobody has answered this yet. If you know even part of it, say so - a partial answer beats
                silence and somebody else will fill in the rest.
              </p>
            ) : (
              // The answers are smaller notes under the big one, so the whole
              // thread reads as one thing pinned up rather than as a card
              // followed by a list of unrelated cards.
              <Reveal className="space-y-3" stagger={0.05}>
                {answers.map((a) => (
                  <div key={a.id} className="rounded-lg border border-gray-100 bg-white p-4 shadow-card">
                    <div className="mb-2.5 flex items-center gap-2.5">
                      <Avatar src={a.profiles?.photo_url} name={a.profiles?.name} size="xs" />
                      <Link to={`/profile/${a.author_id}`} className="truncate text-sm font-semibold hover:text-brand">
                        {a.profiles?.name}
                      </Link>
                      {a.profiles?.is_admin && (
                        <span className="rounded-full bg-brand-tint px-1.5 py-0.5 text-[10px] font-semibold text-brand">Team</span>
                      )}
                      <span className="text-[11px] text-smoke" title={messageTimeTitle(a.created_at)}>
                        {formatMessageTime(a.created_at)}
                      </span>
                      {(a.author_id === user?.id || isAdmin) && (
                        <button onClick={() => dropAnswer(a)} className="ml-auto text-[11px] font-medium text-smoke hover:text-red-600">
                          Remove
                        </button>
                      )}
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{a.body}</p>
                  </div>
                ))}
              </Reveal>
            )}
          </section>

          {/* THE COMPOSER IS ALWAYS THERE, and it is never a modal. A question
              you have to click a button to answer is a question fewer people
              answer, and the reason to be on this page at all is to answer it. */}
          <form onSubmit={answer} className="rounded-lg border border-brand/25 bg-white p-4 shadow-card sm:p-5">
            <label htmlFor="board-answer" className="mb-2 block text-sm font-semibold">
              {mine ? 'Add something to your own question' : 'Answer this'}
            </label>
            <textarea
              id="board-answer"
              ref={boxRef}
              rows={4}
              className="input bg-white"
              value={body}
              maxLength={4000}
              onChange={(e) => setBody(e.target.value)}
              placeholder={mine
                ? 'Extra detail, or what you ended up doing.'
                : 'What you know, even if it is only part of it.'}
            />
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button type="submit" disabled={!body.trim() || busy} className="btn-primary disabled:opacity-40">
                {busy ? 'Posting…' : 'Post answer'}
              </button>
              <span className="text-xs text-smoke">
                Several people can answer. Yours does not replace anybody else&rsquo;s.
              </span>
            </div>
          </form>
        </div>
      </NetworkLayout>

      <AskModal
        open={editing}
        existing={q}
        onClose={() => setEditing(false)}
        onAsked={() => { setEditing(false); toast('Question updated'); load() }}
      />
    </NetworkMotion>
  )
}
