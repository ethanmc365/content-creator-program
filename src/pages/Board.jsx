import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import NetworkLayout from '../components/network/NetworkLayout'
import NetworkMotion from '../components/NetworkMotion'
import Reveal from '../components/network/Reveal'
import Icon from '../components/Icon'
import LocalTime from '../components/LocalTime'
import { ActionRow, Avatar, EmptyState, Modal, Skeleton } from '../components/ui'
import { confirm, notice } from '../lib/confirm'
import { toast } from '../lib/toast'
import {
  BOARD_TAGS, tagInfo, loadFeed, loadThread, askQuestion, editQuestion, postAnswer,
  removeAnswer, removeQuestion,
} from '../lib/board'
import { cx, formatMessageTime, messageTimeTitle } from '../lib/utils'
import { useT } from '../lib/i18n'

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
  const tr = useT()
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
          <p className="mb-2 text-sm font-semibold">{tr("What is it about?")}</p>
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
            <label htmlFor="board-country" className="mb-1.5 block text-sm font-semibold">{tr("Which country?")}</label>
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
            {tr("Your question")}
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
            {tr("Anything that would help somebody answer")} <span className="font-normal text-smoke">(optional)</span>
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
          <button type="button" onClick={onClose} className="btn-ghost">{tr("Cancel")}</button>
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
// THE HISTORY OF THIS PAGE IS A CORKBOARD, AND IT IS GONE.
//
// Everything that used to be documented here - the tilt hashed from the id so a
// note kept its angle across refreshes, hover straightening it as you reached
// for it, the thumbtack redrawn four times until it read as pushed THROUGH the
// paper, the nine minimum heights that faked a hand-made wall, the CSS columns
// that let the heights stay ragged, amber for waiting and green for answered -
// all of it was real work and all of it has been removed.
//
// Ethan: "move away from the current pin section and the slanted post-it notes
// style cards completely, because I feel like it doesn't match the modern
// platform."
//
// The argument, and why it is worth keeping the epitaph: the corkboard was not
// badly made, it was made to a brief that stopped being true as the rest of the
// product settled. Every other surface here is a white card, square to the page,
// soft even shadow, lifting straight up on hover. One page pretending to be a
// physical object in the middle of that does not read as charm; it reads as a
// screen from a different app. See QuestionCard below for what replaced it and
// for the two design calls that were not just "delete the tilt".

// ---------------------------------------------------------------- one card
//
// THE PAPER IS GONE. ALL OF IT.
//
// This was a wall of post-it notes: white sheets tilted a degree and a half,
// each hanging off a drawn thumbtack, laid out in CSS columns so the heights
// came out ragged like a real corkboard. An enormous amount of care went into
// it - the pin was redrawn four times, the tilt turned about the pin rather
// than the note's centre, the shadow was offset downwards to read as a curl
// rather than a decal, and the note heights were floored by a hash so the wall
// looked hand-made.
//
// Ethan: "move away from the current pin section and the slanted post-it notes
// style cards completely, because I feel like it doesn't match the modern
// platform."
//
// He is right, and the reason is worth writing down because the old version was
// not badly built, it was built to the wrong brief. Every other surface in this
// product is the same object: a white card, square to the page, soft even
// shadow, rounded corners, lifting straight up on hover. The board was the one
// page pretending to be a physical thing, and a skeuomorph in the middle of a
// flat system does not read as charming, it reads as a page from a different
// app. The tilt also cost real things: it fought the reveal animation (an
// inline transform beats a stylesheet rule, so the stagger had to move to a
// wrapper), it needed `break-inside-avoid` and CSS columns, and it meant nine
// different minimum heights existed to fake variety that the content should
// have been producing on its own.
//
// WHAT REPLACES IT IS A LIST, NOT A GRID, and that is the substantive design
// call rather than just "remove the tilt". A question is a variable-length
// sentence with a fixed-shape answer count beside it. In a grid of equal cards
// the long ones clamp and the short ones sit in a pool of white; in a list every
// row is exactly as tall as its question and the answer counts line up down the
// left where they can be compared at a glance. Two columns on a wide screen,
// because a single 1200px-wide row for a nine-word question is worse than both.
//
// THE COUNT IS THE LEFT-HAND OBJECT AND IT CARRIES THE STATE. One thing to
// look at per row: a number in a tinted square. Brand tint and a pulse when
// nothing has been answered, green with the count when it has. That replaces
// the coloured top band, the "waiting for an answer" line with its pinging dot,
// and the separate answers chip - three signals saying one thing.

// ONE QUESTION.
//
// THE "OPEN" TILE IS GONE, AND IT DESERVED TO. A 56px square holding a pulsing
// dot over the word "Open" was the first thing on every card and the least
// legible - Ethan: "I don't get the 'open' thing". It was carrying two ideas at
// once (how many answers, and whether anybody has replied) in a shape that
// could only really say one, and when the answer was zero it fell back on a
// word that means nothing here: open as opposed to what? Closed? Locked?
//
// The state is a SENTENCE now, in the meta row, in the reader's own language:
// "3 answers", or "Waiting for an answer". Same information, no decoding, and
// it frees the whole left column - which is what lets three of these sit on a
// row instead of two.
function QuestionCard({ q }) {
  const tr = useT()
  const t = tagInfo(q.tag)
  const answers = Number(q.answer_count || 0)
  const shown = q.answers || []

  return (
    <Link
      to={`/board/${q.id}`}
      className={cx(
        'group flex w-full flex-col rounded-card border border-gray-100 bg-white p-4 text-left shadow-card',
        'transition-all duration-200 hover:-translate-y-1 hover:border-brand/40 hover:shadow-lift',
      )}
    >
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="inline-flex min-w-0 items-center gap-1.5 rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-semibold text-brand">
          <Icon name={t.icon} className="h-3 w-3 shrink-0" />
          <span className="truncate">{q.tag === 'country' && q.country ? q.country : t.short}</span>
        </span>
        {/* THE STATE, IN WORDS. Orange for a question nobody has answered
            (it is a small ask, not an error) and green once somebody has. */}
        <span
          className={cx(
            'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-semibold',
            answers === 0 ? 'bg-brand-tint text-brand' : 'bg-green-50 text-green-700',
          )}
        >
          {answers === 0 ? (
            <>
              <span className="relative flex h-1.5 w-1.5" aria-hidden>
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60 motion-reduce:hidden" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
              </span>
              {tr("Waiting for an answer")}
            </>
          ) : (
            <>
              <span className="tabular-nums">{answers}</span>
              {answers === 1 ? 'answer' : 'answers'}
            </>
          )}
        </span>
        <span className="ml-auto shrink-0 text-[10px] font-medium uppercase tracking-wide text-gray-400">
          {formatMessageTime(q.created_at)}
        </span>
      </span>

      {/* THE QUESTION IS THE HEADING AND IT READS LIKE ONE. It was 15px sitting
          under a 56px tile that outweighed it; at three across it is the thing
          the card is for, so it takes the size. `line-clamp-3` is a safety net
          against somebody pasting an essay into the title, not the thing
          setting the height. */}
      <h3 className="mt-2 line-clamp-3 text-base font-semibold leading-snug tracking-[-0.01em] text-ink transition-colors group-hover:text-brand">
        {q.title}
      </h3>
      {q.body && <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-smoke">{q.body}</p>}

      {/* ---- WHAT SOMEBODY SAID ----
          One answer previewed, not two: a card three across carries less
          vertical budget than the old note did, and the second preview was
          always the first thing to be scrolled past. */}
      {shown.length > 0 && (
        <span className="mt-2.5 flex gap-2 rounded-xl bg-cloud/60 p-2.5">
          <span className="mt-0.5 shrink-0">
            <Avatar src={shown[0].author_photo} name={shown[0].author_name} size="xs" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-semibold text-ink">{shown[0].author_name}</span>
            <span className="line-clamp-2 block text-[12px] leading-snug text-smoke">{shown[0].body}</span>
          </span>
        </span>
      )}

      {/* `mt-auto` pins the byline to the bottom, so a row of cards lines up on
          this line however long the questions above it ran. */}
      <span className="mt-auto flex items-center gap-2 pt-3">
        <Avatar src={q.author_photo} name={q.author_name} size="xs" />
        <span className="min-w-0 flex-1 truncate text-[11px] text-smoke">{q.author_name}</span>
        {(answers > 1 || shown.some((a) => a.truncated)) && (
          <span className="shrink-0 text-[11px] font-semibold text-brand">
            {answers > 1 ? `All ${answers}` : 'Read it'}
          </span>
        )}
        <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand" />
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
  const tr = useT()
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
      {/* NOT FULL BLEED ANY MORE. `full` was right when this was a WALL of
          pinned notes and the wall was the idea; it is a card grid now, and a
          grid stretched edge to edge on a 1440px screen puts the first and last
          question a foot apart with nothing between them. Ethan: "maybe the
          board doesn't have to be so wide, slightly more narrow." */}
      <NetworkLayout width="default" switcher={false}>
        <div className="space-y-6">
          <header className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-end sm:justify-between">
            <div>
              <h1 className="flex items-center gap-2.5 text-3xl font-bold tracking-tight sm:text-4xl">
                <Icon name="chat" className="h-8 w-8 shrink-0 text-brand" />
                {tr("Community board")}
              </h1>
              {/* NO STRAPLINE. It read "Ask the whole network something. Anyone
                  can answer, and the answers stay here for whoever asks next",
                  which is a good description of the feature and a thing you need
                  told once. The wall of pinned notes under it says all of it
                  without a sentence, and the space is better spent on the notes.
                  Ethan: "remove this description below the title." */}
            </div>
            {/* FULL WIDTH ON A PHONE, THE SAME RULE AS EVERY OTHER PAGE.
                (1 Sep 2026.)

                Ethan: "an example is the community board page on mobile, the
                ask a question button is at the top in the left hand side; it
                should either span across the entire top or be centred in the
                top. Please improve this design across the layouts."

                It was a shrink-to-fit button in a `flex-wrap justify-between`
                header, so on a phone it wrapped onto its own line and sat
                against the left margin under a 30px heading - a small orange
                rectangle in a lot of white, and the only thing on the page you
                were meant to press. `ActionRow` is the rule the flight log and
                the calendar already follow: the primary action takes the whole
                width below `sm` and is an ordinary inline button above it. */}
            <ActionRow
              className="w-full sm:w-auto"
              lead={(
                <button onClick={() => setAsking(true)} className="btn-primary transition-transform duration-200 hover:scale-105">
                  <Icon name="pencil" className="h-4 w-4" />
                  {tr("Ask a question")}
                </button>
              )}
            />
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
              placeholder={tr("Search questions and answers…")}
              aria-label={tr("Search the board")}
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
            {rows === null ? (
              // The skeleton mirrors NOTE_SHAPES rather than a ladder of
              // arbitrary heights: what loads in has to be the shape of what
              // arrives, or the wall visibly re-lays itself the moment the
              // query lands.
              // The skeleton is the shape of what arrives, or the page visibly
              // re-lays itself the moment the query lands. Rows, not a ragged
              // wall of nine different heights.
              <div className="grid items-start gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {[132, 108, 108, 156, 108, 132].map((h, i) => (
                  <Skeleton key={i} className="block rounded-card" style={{ height: h }} />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={<Icon name="chat" className="h-6 w-6" />}
                title={search ? `Nothing matches “${search}”` : 'Nothing asked yet'}
                hint={search
                  ? 'Try a shorter search, or ask it yourself and let the community answer.'
                  : 'Be the first. Somebody here has been where you are going.'}
                action={<button onClick={() => setAsking(true)} className="btn-primary">{tr("Ask a question")}</button>}
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
              // A GRID OF ROWS, AND `items-start` IS DOING REAL WORK.
              //
              // The old wall was CSS columns, which was the only way to get
              // ragged note heights: a grid ROW is as tall as its tallest cell,
              // so one long note leaves a hole beside every short one. That
              // problem does not exist here. `items-start` lets each card keep
              // its own height instead of stretching to match its neighbour, so
              // a one-line question stays one line tall and the two columns
              // simply end at different points - which is what a list of
              // different-length questions should look like.
              //
              // ONE COLUMN ON A PHONE. The old wall went two-across even at
              // 375px, because a single column of notes is a list and the WALL
              // was the idea. The wall is gone, a list is now exactly the
              // intention, and two 170px-wide cards on a phone would clamp
              // every question to three words.
              //
              // Reveal can wrap this directly now. It could not before: it puts
              // each child in its own div, and that wrapper is precisely what
              // `break-inside-avoid` had to sit on.
              // THREE ACROSS FROM `xl`. Two columns of wide cards on a 1440px
              // screen meant each question sat in 600px of card holding forty
              // characters of question, so the board read as a short list of
              // very large rows. `items-start` keeps each card its own height
              // rather than stretching it to match its neighbour.
              <Reveal className="grid items-start gap-3 sm:gap-4 sm:grid-cols-2 xl:grid-cols-3" stagger={0.04}>
                {rows.map((q) => <QuestionCard key={q.id} q={q} />)}
              </Reveal>
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
  const tr = useT()
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
            title={tr("That question is not here")}
            hint={tr("It may have been removed by whoever asked it.")}
            action={<Link to="/board" className="btn-secondary">{tr("Back to the board")}</Link>}
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
        {/* THE THREAD IS THE SAME OBJECT AS THE ROW, ENLARGED. It used to be the
            note taken off the wall - pin, state band, paper - which was the
            right instinct for a board made of paper and is the wrong one now
            that the board is made of cards. Same border, same radius, same
            shadow as the card you tapped to get here, so opening a question
            reads as the card expanding rather than as arriving somewhere new.
            The state has moved entirely into the "waiting for an answer" chip
            below, which is where it already was in words. */}
        <div className="space-y-6 pt-3">
          <Link to="/board" className="inline-flex items-center gap-2 text-sm font-medium text-smoke transition-colors hover:text-brand">
            <Icon name="chevronLeft" className="h-4 w-4" />
            {tr("Community board")}
          </Link>

          <article className={cx(
            'relative rounded-card border bg-white shadow-lift',
            openQ ? 'border-brand/25' : 'border-gray-100',
          )}>
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
                  {tr("Waiting for an answer")}
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
                      {tr("Edit")}
                    </button>
                  )}
                  <button onClick={dropQuestion} className="text-xs font-medium text-smoke hover:text-red-600">
                    {tr("Remove")}
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
                {tr("Nobody has answered this yet. If you know even part of it, say so - a partial answer beats silence and somebody else will fill in the rest.")}
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
                        <span className="rounded-full bg-brand-tint px-1.5 py-0.5 text-[10px] font-semibold text-brand">{tr("Team")}</span>
                      )}
                      <span className="text-[11px] text-smoke" title={messageTimeTitle(a.created_at)}>
                        {formatMessageTime(a.created_at)}
                      </span>
                      {(a.author_id === user?.id || isAdmin) && (
                        <button onClick={() => dropAnswer(a)} className="ml-auto text-[11px] font-medium text-smoke hover:text-red-600">
                          {tr("Remove")}
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
                {tr("Several people can answer. Yours does not replace anybody else’s.")}
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
