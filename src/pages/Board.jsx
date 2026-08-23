import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import NetworkLayout from '../components/network/NetworkLayout'
import NetworkMotion from '../components/NetworkMotion'
import Reveal from '../components/network/Reveal'
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
// ------------------------------------------------------------------ v3 -----
//
// Ethan: "the cards look long and short, it's a bad UI... overall seems like a
// wasted feature. I want it rebuilt much better, perhaps the questions can
// stand out more."
//
// He is right on all three counts, and they are the same fault seen from three
// angles. THE QUESTION WAS NOT THE OBJECT ON THE CARD. A row carried a big
// coloured counter on the left, a tag chip, a timestamp, a title at 15px, a
// body preview, a quoted answer and an author line - eight things, of which the
// question was the fifth-largest. Put that in a two-column grid where every row
// is as tall as its own content and you get exactly what he is describing: a
// ragged wall of boxes with nothing to look at.
//
// THREE CHANGES, IN THE ORDER THEY MATTER:
//
//  1. THE QUESTION IS THE CARD. It is set at 19px, it is the first thing in the
//     box, and everything else on the card is 11px grey underneath it. You read
//     a board by reading questions; nothing else on a card has ever made
//     somebody click.
//
//  2. ONE COLUMN, WITH A RAIL BESIDE IT. Two columns of variable-height cards
//     is the "long and short" problem by construction - a grid row is as tall
//     as its tallest cell and a question is a variable-length sentence. One
//     column of full-width rows has no such row, every card is exactly as tall
//     as its question, and the left edge of every question lines up, which is
//     what makes a list scannable. The width that frees goes to a rail that
//     answers the questions the feed cannot: what is on here, what is waiting,
//     and what this page is for.
//
//  3. IT SAYS WHAT IT IS. "A wasted feature" is partly a discovery problem: a
//     creator landing on a board of four questions has no idea whether it is
//     worth asking anything. The header now states the deal in one line, the
//     composer is an inviting box rather than a button in the corner, and the
//     rail carries the count of questions still waiting for somebody.
//
// UNANSWERED IS STILL THE STATE THAT MATTERS. The board's one promise to
// somebody who asks is that their question will not sit there, so "waiting" is
// a first-class filter with a live count, and it is derived from having answers
// rather than from a flag somebody has to remember to set.

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
        {/* THE QUESTION IS THE FIRST FIELD NOW, not the fourth.
            The tag used to lead, on the reasoning that it changes what the rest
            of the form asks - which is true and is still not a good enough
            reason to make somebody classify a question they have not written
            yet. Type the question, then say what it is about. */}
        <div>
          <label htmlFor="board-title" className="mb-1.5 block text-sm font-semibold">
            What do you want to know?
          </label>
          {/* NO PLACEHOLDER. It used to read "Is the JR Pass still worth it for
              two weeks?", which is a good example question and a bad thing to
              put in the box: a fully-formed sentence sitting in the field is
              read as content by half the people who see it, and it anchors what
              everybody asks about. */}
          <input
            id="board-title" className="input !text-base" value={title} maxLength={160}
            onChange={(e) => setTitle(e.target.value)}
          />
          {/* A LENGTH HINT, NOT A LENGTH ERROR. The counter only speaks up near
              the ends, because a number that is always there is a number nobody
              reads. */}
          <p className="mt-1.5 text-xs text-smoke">
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
            DISAPPEAR, AND IT DOES NOT RESERVE A HOLE.

            "Which country?" only makes sense for one of the four tags.
            Mounting and unmounting the field made the whole dialog jump a row
            taller and shorter as you moved between tags, which also moves the
            button you were about to press; reserving a fixed slot fixed the
            jump by making the dialog permanently taller.

            So the slot is a real height transition. `grid-template-rows: 0fr ->
            1fr` animates to the content's OWN height without anybody measuring
            anything, and `overflow-hidden` on the inner row is what makes the
            clip follow it. `aria-hidden` plus a negative tabindex keeps a
            collapsed input out of the tab order. */}
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

        <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
          <button type="submit" disabled={!ok || busy} className="btn-primary disabled:opacity-40">
            {busy ? 'Saving…' : editing ? 'Save changes' : 'Post to the board'}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          {!editing && (
            <span className="text-xs text-smoke">Everyone in the network can see and answer it.</span>
          )}
        </div>
      </form>
    </Modal>
  )
}

// ---------------------------------------------------------------- one card
//
// THE QUESTION IS THE OBJECT. Everything else is a caption on it.
//
// A reader scanning this page is doing exactly one thing: reading questions and
// deciding whether they know the answer or want to know it. So the question is
// 19px and sits at the top of the box with nothing above it but a hairline of
// context, and the six other things a card used to shout are one grey line
// underneath.
//
// THE STATE LIVES ON THE LEFT EDGE, AS A COLOUR. A 3px bar rather than a badge:
// it costs no vertical space, it is legible at the edge of vision while you are
// reading something else, and it means "waiting" and "answered" can be told
// apart down a whole column without reading a word.
function QuestionCard({ q }) {
  const t = tagInfo(q.tag)
  const answers = Number(q.answer_count || 0)
  const open = answers === 0
  const preview = (q.answers || [])[0]

  return (
    <Link to={`/board/${q.id}`} className={cx('board-card', open ? 'is-open' : 'is-answered')}>
      <span className="board-card-edge" aria-hidden />

      <span className="board-card-top">
        <span className="board-tag">
          <Icon name={t.icon} className="h-3 w-3 shrink-0" />
          <span className="truncate">{q.tag === 'country' && q.country ? q.country : t.short}</span>
        </span>
        <span className="board-dot" aria-hidden>·</span>
        <span className="truncate">{q.author_name}</span>
        <span className="board-dot" aria-hidden>·</span>
        <span className="shrink-0" title={messageTimeTitle(q.created_at)}>{formatMessageTime(q.created_at)}</span>
      </span>

      <h3 className="board-question">{q.title}</h3>
      {q.body && <p className="board-body">{q.body}</p>}

      <span className="board-card-foot">
        {open ? (
          <span className="board-waiting">
            <span className="relative flex h-1.5 w-1.5" aria-hidden>
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60 motion-reduce:hidden" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-brand" />
            </span>
            Waiting for an answer
          </span>
        ) : (
          <span className="board-answered">
            {/* FACES, NOT A NUMBER. The question a reader is really asking of an
                answered thread is whether anybody who would know has been near
                it, and a count cannot answer that. */}
            <span className="flex -space-x-2">
              {(q.answers || []).slice(0, 3).map((a, i) => (
                <Avatar key={i} src={a.author_photo} name={a.author_name} size="xs" className="!ring-2 !ring-white" />
              ))}
            </span>
            <span className="font-semibold text-green-700">
              {answers} {answers === 1 ? 'answer' : 'answers'}
            </span>
          </span>
        )}

        {/* The first answer, one line, in quotes. It is the difference between
            "somebody replied" and "here is what they said", and it is what
            makes an answered board worth reading rather than merely tidy. */}
        {preview && (
          <span className="board-quote">
            &ldquo;{preview.body}&rdquo;
          </span>
        )}

        <Icon name="chevronRight" className="board-chev" />
      </span>
    </Link>
  )
}

// ---------------------------------------------------------------- the board
const STATES = [
  { key: null, label: 'Everything', icon: 'chat' },
  { key: 'unanswered', label: 'Waiting', icon: 'clock' },
  { key: 'answered', label: 'Answered', icon: 'check' },
]

// HOW THE LIST IS ORDERED, AND WHY THERE IS A CHOICE AT ALL.
//
// The RPC returns newest first, which is right for somebody checking in and
// wrong for somebody who came to help - "most answers" finds the threads worth
// reading, and "waiting longest" finds the person who has been ignored for a
// week. Sorting in the browser rather than in Postgres because the whole page
// is one query of at most a hundred rows, and a sort control that costs a round
// trip is a sort control nobody touches twice.
const SORTS = [
  { key: 'new', label: 'Newest', fn: (a, b) => new Date(b.created_at) - new Date(a.created_at) },
  { key: 'busy', label: 'Most answered', fn: (a, b) => Number(b.answer_count || 0) - Number(a.answer_count || 0) },
  { key: 'stale', label: 'Waiting longest', fn: (a, b) => new Date(a.created_at) - new Date(b.created_at) },
]

const PAGE = 40

export default function Board() {
  const [rows, setRows] = useState(null)
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState(null)
  const [state, setState] = useState(null)
  const [sort, setSort] = useState('new')
  const [limit, setLimit] = useState(PAGE)
  const [asking, setAsking] = useState(false)
  const navigate = useNavigate()

  const refresh = useCallback(async (opts) => {
    try {
      setRows(await loadFeed({ search, tag, state, limit, ...opts }))
    } catch (e) {
      notice(`The board could not load: ${e.message}`)
      setRows([])
    }
  }, [search, tag, state, limit])

  // DEBOUNCED, because this is a full-text query and a keystroke is not a
  // question. 250ms is under the threshold where typing feels laggy and well
  // over the gap between two keys.
  useEffect(() => {
    const t = setTimeout(() => { refresh() }, search ? 250 : 0)
    return () => clearTimeout(t)
  }, [refresh, search])

  // Any filter change starts the list again from the top.
  useEffect(() => { setLimit(PAGE) }, [search, tag, state])

  const stats = useMemo(() => {
    const list = rows || []
    const waiting = list.filter((r) => Number(r.answer_count) === 0)
    return {
      total: list.length,
      waiting: waiting.length,
      answered: list.length - waiting.length,
      // The oldest questions nobody has answered. This is the one thing on the
      // page that asks the reader for something rather than offering them
      // something, which is why it is in the rail and not the feed.
      stalest: [...waiting].sort((a, b) => new Date(a.created_at) - new Date(b.created_at)).slice(0, 4),
    }
  }, [rows])

  const tagCounts = useMemo(() => {
    const counts = {}
    for (const r of rows || []) counts[r.tag] = (counts[r.tag] || 0) + 1
    return counts
  }, [rows])

  const shown = useMemo(() => {
    const fn = (SORTS.find((s) => s.key === sort) || SORTS[0]).fn
    return [...(rows || [])].sort(fn)
  }, [rows, sort])

  const filtered = !!search || !!tag || !!state

  const rail = (
    <>
      {/* WHAT THIS PAGE IS FOR, SAID ONCE.
          Half of "it seems like a wasted feature" is that nothing on the page
          ever explained the deal. Three lines, in the rail where an explanation
          belongs, rather than a paragraph under the title where it would be in
          the way of the board forever. */}
      <div className="board-rail-card">
        <p className="board-rail-head">How this works</p>
        <ul className="mt-2.5 space-y-2.5">
          {[
            ['chat', 'Ask anything', 'Gear, rates, visas, which airline actually pays out.'],
            ['users', 'Anyone can answer', 'Several people can, and they often disagree - that is useful.'],
            ['clock', 'It stays put', 'Unlike a room. The answer is still here in March.'],
          ].map(([icon, head, line]) => (
            <li key={head} className="flex gap-2.5">
              <span className="board-rail-icon"><Icon name={icon} className="h-3.5 w-3.5" /></span>
              <span className="min-w-0">
                <span className="block text-xs font-semibold">{head}</span>
                <span className="block text-[11px] leading-relaxed text-smoke">{line}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>

      {rows !== null && stats.total > 0 && (
        <div className="board-rail-card">
          <p className="board-rail-head">On the board</p>
          <div className="mt-2.5 grid grid-cols-3 gap-2">
            {[
              ['Questions', stats.total, 'text-ink'],
              ['Waiting', stats.waiting, 'text-brand'],
              ['Answered', stats.answered, 'text-green-700'],
            ].map(([label, n, tone]) => (
              <div key={label} className="rounded-xl bg-cloud/70 px-2 py-2 text-center">
                <p className={cx('text-lg font-bold tabular-nums leading-none', tone)}>{n}</p>
                <p className="mt-1 text-[10px] font-medium text-smoke">{label}</p>
              </div>
            ))}
          </div>
          {filtered && (
            <p className="mt-2 text-[10px] leading-relaxed text-gray-400">
              Counted across what your filters are showing.
            </p>
          )}
        </div>
      )}

      {stats.stalest.length > 0 && (
        <div className="board-rail-card">
          <p className="board-rail-head">Nobody has answered these</p>
          <p className="mt-1 text-[11px] leading-relaxed text-smoke">
            You almost certainly know one of them.
          </p>
          <div className="mt-2.5 space-y-1">
            {stats.stalest.map((q) => (
              <Link key={q.id} to={`/board/${q.id}`} className="board-rail-row">
                <span className="line-clamp-2 text-xs font-medium leading-snug">{q.title}</span>
                <span className="mt-0.5 block text-[10px] text-smoke">
                  {q.author_name} · {formatMessageTime(q.created_at)}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="board-rail-card">
        <p className="board-rail-head">Browse by topic</p>
        <div className="mt-2.5 space-y-1">
          {BOARD_TAGS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTag(tag === t.key ? null : t.key)}
              aria-pressed={tag === t.key}
              className={cx('board-topic', tag === t.key && 'is-on')}
            >
              <Icon name={t.icon} className="h-3.5 w-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate text-left">{t.label}</span>
              <span className="shrink-0 tabular-nums text-[10px] text-smoke">{tagCounts[t.key] || 0}</span>
            </button>
          ))}
        </div>
      </div>
    </>
  )

  return (
    <NetworkMotion>
      {/* NOT `width="full"` ANY MORE. The board was a wall of notes and needed
          the whole screen; it is a list of questions now, and a 1500px-wide row
          holding a nine-word question is the worst of both. A reading column
          with a rail beside it is the shape of the content. */}
      <NetworkLayout switcher={false} rail={rail} ready={rows !== null}>
        <div className="space-y-5">
          <header>
            <h1 className="flex items-center gap-2.5 text-2xl font-bold tracking-tight sm:text-3xl">
              <Icon name="chat" className="h-7 w-7 shrink-0 text-brand" />
              Community board
            </h1>
            <p className="mt-1.5 max-w-xl text-sm leading-relaxed text-smoke">
              The questions worth asking somebody who has actually been there. Ask one, or answer one -
              both take about a minute.
            </p>
          </header>

          {/* THE COMPOSER IS A BOX YOU CAN TYPE IN, NOT A BUTTON IN THE CORNER.
              A primary button labelled "Ask a question" is a thing you decide to
              press; an empty field with your own face beside it is a thing you
              start filling in. It opens the real dialog on focus - one field
              here and five in the modal would be two composers to keep in step. */}
          <button onClick={() => setAsking(true)} className="board-ask">
            <span className="board-ask-icon"><Icon name="pencil" className="h-4 w-4" /></span>
            <span className="board-ask-text">Ask the network something…</span>
            <span className="board-ask-go">Ask</span>
          </button>

          <div className="board-controls">
            <div className="relative flex-1">
              <Icon name="magnifier" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
              <input
                type="search"
                className="input !py-2.5 !pl-10 !text-sm"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search questions and answers…"
                aria-label="Search the board"
              />
            </div>

            {/* A SEGMENTED CONTROL, NOT SEVEN PILLS IN A ROW. The three states
                are mutually exclusive and the tags are not, so drawing them as
                one undifferentiated row of chips taught people that pressing
                two of them was possible when it was not. */}
            <div className="board-seg" role="group" aria-label="Filter by state">
              {STATES.map((s) => (
                <button
                  key={s.label}
                  onClick={() => setState(s.key)}
                  aria-pressed={state === s.key}
                  className={cx('board-seg-btn', state === s.key && 'is-on')}
                >
                  <Icon name={s.icon} className="h-3.5 w-3.5 shrink-0" />
                  <span>{s.label}</span>
                  {s.key === 'unanswered' && state !== s.key && stats.waiting > 0 && (
                    <span className="board-seg-count">{stats.waiting}</span>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-smoke">
              {rows === null
                ? 'Loading…'
                : `${shown.length} question${shown.length === 1 ? '' : 's'}${tag ? ` about ${tagInfo(tag).short.toLowerCase()}` : ''}`}
            </p>
            <div className="flex items-center gap-1">
              <span className="text-[11px] text-gray-400">Sort</span>
              {SORTS.map((s) => (
                <button
                  key={s.key}
                  onClick={() => setSort(s.key)}
                  aria-pressed={sort === s.key}
                  className={cx('board-sort', sort === s.key && 'is-on')}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>

          {/* ROOM UNDER THE LAST QUESTION ON A DESKTOP, AND NONE ON A PHONE.
              A short board used to stop dead a third of the way down the window
              with nothing under it, so half a viewport of padding was added -
              which was right when the feed was the whole page and is wrong now
              that the rail follows the feed on a phone. Half a screen of
              nothing between the last question and "how this works" is worse
              than a page that ends. On a desktop the rail is a column beside
              the feed, so the spacer still earns its place there.
              `40vh` and not `40dvh`: on iOS a dvh unit changes as the address
              bar collapses, so the page would grow while you scrolled it. */}
          <div className="pb-4 lg:pb-[40vh]">
            {rows === null ? (
              <div className="space-y-3">
                {[112, 96, 128, 96, 112].map((h, i) => (
                  <Skeleton key={i} className="block rounded-card" style={{ height: h }} />
                ))}
              </div>
            ) : shown.length === 0 ? (
              <EmptyState
                icon={<Icon name="chat" className="h-6 w-6" />}
                title={search ? `Nothing matches “${search}”` : state === 'unanswered' ? 'Everything has been answered' : 'Nothing asked yet'}
                hint={search
                  ? 'Try a shorter search, or ask it yourself and let the community answer.'
                  : state === 'unanswered'
                    ? 'Nobody is waiting on anything right now. That is the board working.'
                    : 'Be the first. Somebody here has been where you are going.'}
                action={<button onClick={() => setAsking(true)} className="btn-primary">Ask a question</button>}
              />
            ) : (
              <>
                <Reveal className="space-y-3" stagger={0.035}>
                  {shown.map((q) => <QuestionCard key={q.id} q={q} />)}
                </Reveal>
                {/* MORE, WHEN THERE IS MORE. The query takes a limit and the
                    old page hard-coded fifty with no way past it, which on a
                    board that works is a board that silently stops. */}
                {rows.length >= limit && (
                  <div className="mt-5 flex justify-center">
                    <button onClick={() => setLimit((n) => n + PAGE)} className="btn-secondary !py-2 text-sm">
                      Show more questions
                    </button>
                  </div>
                )}
              </>
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
//
// WHAT OPENING A QUESTION LOOKS LIKE.
//
// Ethan: "improve the whole functionality and how it appears when clicked."
//
// The thread used to be the same white card as the feed row, at a bigger size,
// followed by a flat list of identical white cards and a form. Three things are
// different now and each fixes something specific:
//
//   THE QUESTION IS A HEADER, NOT A CARD. It is set on the page in 24px with
//   its state and its author under it. A question you have navigated TO does
//   not need a box round it to say it is the subject - it is the only thing at
//   the top of the screen.
//
//   THE ANSWERS ARE A THREAD. A rule down the left, avatars on it, and the
//   first answer marked. That is what makes six answers read as a conversation
//   about one thing rather than six unrelated cards.
//
//   THE RAIL CARRIES WHAT ELSE IS ON THIS TOPIC. Reusing the feed query with
//   the same tag, which costs one round trip and turns a dead end into a way
//   further in - the single biggest thing a Q&A page can do for the "it is a
//   wasted feature" problem.
export function BoardThread() {
  const { id } = useParams()
  const { user, isAdmin } = useAuth()
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [related, setRelated] = useState([])
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

  // More on the same topic. Best effort in every sense: a failure here costs
  // the rail a card and must never take the thread down with it.
  const tagKey = data?.question?.tag
  useEffect(() => {
    if (!tagKey) return undefined
    let alive = true
    loadFeed({ tag: tagKey, limit: 6 })
      .then((r) => { if (alive) setRelated((r || []).filter((q) => q.id !== id)) })
      .catch(() => {})
    return () => { alive = false }
  }, [tagKey, id])

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

  // BOTH OF THESE SAY WHEN THEY FAIL.
  //
  // They used to `await` a builder and throw the result away, so the RLS
  // refusal that made Remove a no-op (see migration 101) reached nobody: the
  // dialog closed, the page navigated, and the question was still there when
  // you got back. A destructive action that cannot report failure is worse than
  // one that does not exist, because you believe it worked.
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
          <div className="space-y-4 pt-3">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
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

  const rail = (
    <>
      <div className="board-rail-card">
        <p className="board-rail-head">{openQ ? 'Nobody has answered yet' : 'Add yours'}</p>
        <p className="mt-1.5 text-[11px] leading-relaxed text-smoke">
          {openQ
            ? 'If you know even part of it, say so. A partial answer beats silence, and somebody else will fill in the rest.'
            : 'Yours does not replace anybody else’s. Two people disagreeing is the most useful thing on this board.'}
        </p>
        <button
          onClick={() => boxRef.current?.focus()}
          className="btn-primary mt-3 w-full !py-2 text-xs"
        >
          {mine ? 'Add to your question' : 'Write an answer'}
        </button>
      </div>

      {related.length > 0 && (
        <div className="board-rail-card">
          <p className="board-rail-head">More about {t.short.toLowerCase()}</p>
          <div className="mt-2.5 space-y-1">
            {related.slice(0, 5).map((r) => (
              <Link key={r.id} to={`/board/${r.id}`} className="board-rail-row">
                <span className="line-clamp-2 text-xs font-medium leading-snug">{r.title}</span>
                <span className="mt-0.5 block text-[10px] text-smoke">
                  {Number(r.answer_count) === 0
                    ? 'Waiting for an answer'
                    : `${r.answer_count} ${Number(r.answer_count) === 1 ? 'answer' : 'answers'}`}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}
    </>
  )

  return (
    <NetworkMotion>
      <NetworkLayout switcher={false} rail={rail}>
        <div className="space-y-6 pt-3 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:pb-10">
          <Link to="/board" className="inline-flex items-center gap-2 text-sm font-medium text-smoke transition-colors hover:text-brand">
            <Icon name="chevronLeft" className="h-4 w-4" />
            Community board
          </Link>

          {/* THE QUESTION, AS THE PAGE'S SUBJECT. No card: it is the only thing
              at the top of the screen and a box round it would be a box round
              the whole page. */}
          <header>
            <div className="flex flex-wrap items-center gap-2">
              <span className="board-tag board-tag--lg">
                <Icon name={t.icon} className="h-3.5 w-3.5" />
                {q.tag === 'country' && q.country ? q.country : t.short}
              </span>
              {openQ ? (
                <span className="board-state board-state--open">
                  <span className="h-1.5 w-1.5 rounded-full bg-brand" />
                  Waiting for an answer
                </span>
              ) : (
                <span className="board-state board-state--done">
                  <Icon name="check" className="h-3 w-3" />
                  {answers.length} {answers.length === 1 ? 'answer' : 'answers'}
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

            <h1 className="mt-3 text-[26px] font-bold leading-tight tracking-tight sm:text-[32px]">{q.title}</h1>
            {q.body && <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{q.body}</p>}

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
          </header>

          <section>
            {answers.length === 0 ? (
              <div className="board-empty-answers">
                <Icon name="chat" className="h-5 w-5 shrink-0 text-brand" />
                <p>
                  Nobody has answered this yet. If you know even part of it, say so - a partial answer beats
                  silence and somebody else will fill in the rest.
                </p>
              </div>
            ) : (
              // A THREAD, NOT A LIST OF CARDS. One rule down the left with the
              // avatars sitting on it, so six answers read as a conversation
              // about one thing.
              // The rule down the left is drawn only from the second answer
              // onwards: with one answer it is a two-inch line hanging off an
              // avatar, which reads as a rendering fault rather than a thread.
              <Reveal className="board-thread" data-many={answers.length > 1 ? 'yes' : 'no'} stagger={0.05}>
                {answers.map((a, i) => (
                  <div key={a.id} className="board-answer">
                    <span className="board-answer-mark">
                      <Avatar src={a.profiles?.photo_url} name={a.profiles?.name} size="sm" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <Link to={`/profile/${a.author_id}`} className="truncate text-sm font-semibold hover:text-brand">
                          {a.profiles?.name}
                        </Link>
                        {a.profiles?.is_admin && (
                          <span className="rounded-full bg-brand-tint px-1.5 py-0.5 text-[10px] font-semibold text-brand">Team</span>
                        )}
                        {i === 0 && answers.length > 1 && (
                          <span className="rounded-full bg-green-50 px-1.5 py-0.5 text-[10px] font-semibold text-green-700">First</span>
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
                      <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink">{a.body}</p>
                    </div>
                  </div>
                ))}
              </Reveal>
            )}
          </section>

          {/* THE COMPOSER IS ALWAYS THERE, and it is never a modal. A question
              you have to press a button to answer is a question fewer people
              answer, and the reason to be on this page at all is to answer it. */}
          <form onSubmit={answer} className="board-composer">
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
