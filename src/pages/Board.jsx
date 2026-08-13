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
  BOARD_TAGS, tagInfo, loadFeed, loadThread, askQuestion, postAnswer,
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
function AskModal({ open, onClose, onAsked }) {
  const { user } = useAuth()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [tag, setTag] = useState('country')
  const [country, setCountry] = useState('')
  const [busy, setBusy] = useState(false)

  const reset = () => { setTitle(''); setBody(''); setTag('country'); setCountry('') }
  const ok = title.trim().length >= 5

  async function submit(e) {
    e.preventDefault()
    if (!ok || busy) return
    setBusy(true)
    const { data, error } = await askQuestion({ authorId: user.id, title, body, tag, country })
    setBusy(false)
    if (error) { notice(`That did not post: ${error.message}`); return }
    reset()
    onAsked?.(data?.id)
  }

  return (
    <Modal open={open} onClose={onClose} title="Ask the community" wide>
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

        {/* Only asked when it can be answered. A "which country" field on a
            question about editing software is a field somebody has to work out
            they are allowed to skip. */}
        {tag === 'country' && (
          <div className="animate-fade-up">
            <label htmlFor="board-country" className="mb-1.5 block text-sm font-semibold">Which country?</label>
            <input
              id="board-country" className="input" value={country} placeholder="Japan"
              onChange={(e) => setCountry(e.target.value)}
            />
          </div>
        )}

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
            {busy ? 'Posting…' : 'Post to the board'}
          </button>
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
        </div>
      </form>
    </Modal>
  )
}

// ------------------------------------------------------------------ one card
function QuestionCard({ q }) {
  const t = tagInfo(q.tag)
  const answers = Number(q.answer_count || 0)
  const faces = (q.answerers || []).slice(0, 3)
  return (
    <Link
      to={`/board/${q.id}`}
      className="group flex h-full flex-col rounded-card border border-gray-100 bg-white p-4 shadow-card transition-all duration-200 hover:-translate-y-1 hover:border-brand/40 hover:shadow-lift sm:p-5"
    >
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-2.5 py-1 text-[11px] font-semibold text-brand">
          <Icon name={t.icon} className="h-3 w-3" />
          {q.tag === 'country' && q.country ? q.country : t.short}
        </span>
        {answers === 0 ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />
            Waiting for an answer
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700">
            <Icon name="check" className="h-3 w-3" />
            {answers} {answers === 1 ? 'answer' : 'answers'}
          </span>
        )}
      </div>

      <h3 className="text-base font-semibold leading-snug transition-colors group-hover:text-brand">
        {q.title}
      </h3>
      {q.body && <p className="mt-1.5 line-clamp-2 text-sm text-smoke">{q.body}</p>}

      <div className="mt-auto flex items-center gap-2.5 pt-4">
        <Avatar src={q.author_photo} name={q.author_name} size="xs" />
        <span className="min-w-0 flex-1 truncate text-xs text-smoke">
          {q.author_name} · {formatMessageTime(q.created_at)}
        </span>
        {/* FACES, NOT A NUMBER. Whether anybody who would know has been near
            this thread is the actual question, and a count cannot answer it. */}
        {faces.length > 0 && (
          <span className="flex -space-x-2">
            {faces.map((a) => (
              <span key={a.id} className="rounded-full ring-2 ring-white">
                <Avatar src={a.photo_url} name={a.name} size="xs" />
              </span>
            ))}
          </span>
        )}
      </div>
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
      <NetworkLayout width="narrow" switcher={false}>
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

          {rows === null ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40" />)}
            </div>
          ) : rows.length === 0 ? (
            <EmptyState
              icon={<Icon name="chat" className="h-6 w-6" />}
              title={search ? `Nothing matches “${search}”` : 'The board is empty'}
              hint={search
                ? 'Try a shorter search, or ask it yourself and let the community answer.'
                : 'Be the first. Somebody here has been where you are going.'}
              action={<button onClick={() => setAsking(true)} className="btn-primary">Ask a question</button>}
            />
          ) : (
            <Reveal className="grid gap-3 sm:grid-cols-2" stagger={0.05}>
              {rows.map((q) => <QuestionCard key={q.id} q={q} />)}
            </Reveal>
          )}
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
                <button onClick={dropQuestion} className="ml-auto text-xs font-medium text-smoke hover:text-red-600">
                  Remove
                </button>
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
    </NetworkMotion>
  )
}
