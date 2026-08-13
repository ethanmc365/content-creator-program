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
        {/* THE TAG FIRST, because it changes what the rest of the form asks. */}
        <div>
          <p className="mb-2 text-sm font-semibold">What is it about?</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {BOARD_TAGS.map((t) => {
              const on = tag === t.key
              return (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setTag(t.key)}
                  aria-pressed={on}
                  className={cx(
                    'flex items-start gap-3 rounded-xl border p-3 text-left transition-all duration-200',
                    on ? 'border-brand bg-brand-tint/30 ring-1 ring-brand/30' : 'border-gray-200 hover:-translate-y-0.5 hover:border-brand/50',
                  )}
                >
                  <span className={cx(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg',
                    on ? 'bg-brand text-white' : 'bg-cloud text-smoke',
                  )}>
                    <Icon name={t.icon} className="h-4 w-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">{t.label}</span>
                    <span className="mt-0.5 block text-[11px] leading-snug text-smoke">{t.hint}</span>
                  </span>
                </button>
              )
            })}
          </div>
        </div>

        {/* A SLOT THAT IS ALWAYS THE SAME HEIGHT.
            "Which country?" only makes sense for one of the four tags - a
            country field on a question about editing software is a field
            somebody has to work out they are allowed to skip - but mounting and
            unmounting it made the whole dialog grow and shrink as you moved
            between the tags, which is Ethan's "the size of the popup visually
            jumps and changes, it looks bad". A modal that resizes under the
            cursor also moves the button you were about to press.
            So the slot is always there and always 4.5rem; only its contents
            change, and the alternative content is the chosen tag's own hint,
            which is worth reading rather than being spacing pretending to be
            copy. */}
        <div className="flex h-[4.5rem] flex-col justify-end">
          {tag === 'country' ? (
            <>
              <label htmlFor="board-country" className="mb-1.5 block text-sm font-semibold">Which country?</label>
              <input
                id="board-country" className="input" value={country} placeholder="Japan"
                onChange={(e) => setCountry(e.target.value)}
              />
            </>
          ) : (
            <p key={tag} className="animate-fade-up pb-3 text-sm leading-snug text-smoke">
              {tagInfo(tag).hint}
            </p>
          )}
        </div>

        <div>
          <label htmlFor="board-title" className="mb-1.5 block text-sm font-semibold">
            Your question
          </label>
          <input
            id="board-title" className="input" value={title} maxLength={160}
            placeholder="Is the JR Pass still worth it for two weeks?"
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
            id="board-body" rows={5} className="input" value={body} maxLength={4000}
            placeholder="When you are going, what you have already tried, what you actually need to decide."
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

// THE PIN. Drawn rather than an emoji or an icon-font glyph, because it has to
// sit half over the top edge of the note and cast a small shadow onto it, which
// is the whole trick that makes the note look attached to something.
function Pin({ hue }) {
  return (
    <span className="pointer-events-none absolute -top-2.5 left-1/2 z-10 -translate-x-1/2" aria-hidden>
      <svg viewBox="0 0 24 24" className="h-6 w-6" style={{ filter: 'drop-shadow(0 2px 2px rgba(20,20,30,0.28))' }}>
        <circle cx="12" cy="9" r="6" fill={hue} />
        {/* The highlight is what stops the head reading as a flat dot. */}
        <circle cx="10" cy="7" r="2" fill="#ffffff" fillOpacity="0.55" />
        <path d="M12 15v6" stroke="#8a8a94" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    </span>
  )
}

function QuestionNote({ q }) {
  const t = tagInfo(q.tag)
  const answers = Number(q.answer_count || 0)
  const faces = (q.answerers || []).slice(0, 3)
  const h = noteHash(q.id)
  // -1.6, -0.8, 0.8 or 1.6 degrees. Small on purpose: past about two degrees a
  // wall of notes stops looking casual and starts looking broken.
  const tilt = [-1.6, -0.8, 0.8, 1.6][h % 4]

  return (
    <Link
      to={`/board/${q.id}`}
      style={{ transform: `rotate(${tilt}deg)` }}
      className={cx(
        'group relative flex aspect-square flex-col rounded-sm border p-4 shadow-card transition-all duration-300 ease-out',
        // `hover:!rotate-0` beats the inline transform: reaching for a note
        // squares it up and lifts it off the board.
        'hover:z-10 hover:-translate-y-1.5 hover:!rotate-0 hover:shadow-lift',
        // THE STATE IS THE COLOUR OF THE PAPER. Readable across a whole wall at
        // a glance, where the old state chips had to be read one at a time.
        // Border/background utilities rather than arbitrary values or ring
        // colours, because those are the ones the dark layer remaps.
        answers === 0
          ? 'border-amber-200 bg-amber-50'
          : 'border-green-200 bg-green-50',
      )}
    >
      <Pin hue={answers === 0 ? '#f5853f' : '#16a34a'} />

      <span className="mb-2 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-smoke">
        <Icon name={t.icon} className="h-3 w-3 shrink-0" />
        <span className="truncate">{q.tag === 'country' && q.country ? q.country : t.short}</span>
      </span>

      {/* The question is the note. Clamped rather than shrunk: a smaller type
          size for a longer question would make the hardest one to read the one
          set in the smallest type. */}
      <h3 className="line-clamp-4 text-[15px] font-semibold leading-snug text-ink transition-colors group-hover:text-brand">
        {q.title}
      </h3>
      {q.body && <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-smoke">{q.body}</p>}

      <span className="mt-auto block">
        <span
          className={cx(
            'mb-2.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold',
            answers === 0 ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800',
          )}
        >
          {answers === 0
            ? <>Waiting for an answer</>
            : <><Icon name="check" className="h-3 w-3" />{answers} {answers === 1 ? 'answer' : 'answers'}</>}
        </span>

        <span className="flex items-center gap-2">
          <Avatar src={q.author_photo} name={q.author_name} size="xs" />
          <span className="min-w-0 flex-1 truncate text-[11px] text-smoke">
            {q.author_name} · {formatMessageTime(q.created_at)}
          </span>
          {/* FACES, NOT A NUMBER. Whether anybody who would know has been near
              this thread is the actual question, and a count cannot answer it. */}
          {faces.length > 0 && (
            <span className="flex shrink-0 -space-x-2">
              {faces.map((a) => (
                <span key={a.id} className="rounded-full ring-2 ring-white">
                  <Avatar src={a.photo_url} name={a.name} size="xs" />
                </span>
              ))}
            </span>
          )}
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
              <p className="mt-1.5 text-sm text-smoke">
                Ask the whole network something. Anyone can answer, and the answers stay here for whoever
                asks next.
              </p>
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

          <div className="flex flex-wrap gap-2">
            {STATES.map((s) => (
              <button
                key={s.label}
                onClick={() => setState(s.key)}
                aria-pressed={state === s.key}
                className={cx(
                  'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200',
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

          {/* THE BOARD ITSELF.
              A warm, very light surface with a faint grain and an inset edge,
              so the notes have something to be pinned TO. Deliberately not a
              photographic cork texture: this app is white-dominant with one
              orange, and a brown wood-effect panel would be the loudest thing
              on any page it appeared on. The grain is two repeating gradients,
              which costs nothing and does not need an image. */}
          <div className="board-surface rounded-card p-4 ring-1 ring-black/5 sm:p-6 lg:p-8">
            {rows === null ? (
              <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="aspect-square" />)}
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
              // The gap is generous on purpose: notes that nearly touch read as
              // a grid, and the tilt needs room or the corners overlap.
              <Reveal className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" stagger={0.045}>
                {rows.map((q) => <QuestionNote key={q.id} q={q} />)}
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

  async function dropAnswer(a) {
    if (!await confirm('Remove your answer? It will disappear from the thread.')) return
    await removeAnswer(a.id)
    load()
  }

  async function dropQuestion() {
    if (!await confirm('Remove this question and its answers from the board?')) return
    await removeQuestion(id)
    navigate('/board')
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

  return (
    <NetworkMotion>
      <NetworkLayout width="narrow" switcher={false}>
        <div className="space-y-6">
          <Link to="/board" className="inline-flex items-center gap-2 text-sm font-medium text-smoke transition-colors hover:text-brand">
            <Icon name="chevronLeft" className="h-4 w-4" />
            Community board
          </Link>

          <article className="rounded-card border border-gray-100 bg-white p-5 shadow-card sm:p-6">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-2.5 py-1 text-[11px] font-semibold text-brand">
                <Icon name={t.icon} className="h-3 w-3" />
                {q.tag === 'country' && q.country ? q.country : t.short}
              </span>
              {answers.length === 0 && (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
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
          </article>

          <section>
            <h2 className="mb-3 text-sm font-semibold">
              {answers.length === 0
                ? 'No answers yet'
                : `${answers.length} ${answers.length === 1 ? 'answer' : 'answers'}`}
            </h2>

            {answers.length === 0 ? (
              <p className="rounded-card border border-dashed border-gray-200 px-5 py-8 text-center text-sm text-smoke">
                Nobody has answered this yet. If you know even part of it, say so - a partial answer beats
                silence and somebody else will fill in the rest.
              </p>
            ) : (
              <Reveal className="space-y-3" stagger={0.05}>
                {answers.map((a) => (
                  <div key={a.id} className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
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
          <form onSubmit={answer} className="rounded-card border border-brand/25 bg-brand-tint/15 p-4 sm:p-5">
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
