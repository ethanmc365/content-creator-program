import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar, Modal, Skeleton, Spinner, Toggle } from '../components/ui'
import Icon from '../components/Icon'
import Segmented from '../components/network/Segmented'
import RichEditable from '../components/RichEditable'
import RichToolbar from '../components/RichToolbar'
import ImageMarkup from '../components/ImageMarkup'
import { renderNote } from '../lib/noteMarkdown'
import { uploadChatImage } from '../lib/chatMedia'
import { confirm, notice } from '../lib/confirm'
import { toastSuccess } from '../lib/toast'
import { cx, timeAgo } from '../lib/utils'
import { useT } from '../lib/i18n'
import HelpTeam, { HelpOpenDoors } from '../components/HelpTeam'

// QUESTIONS AND ANSWERS (7 Oct 2026).
//
// Ethan: "build a frequently asked questions page ... as an admin you'll be able to click the edit button at the top
// and edit those frequently asked questions. Also anyone can ask a new question and we can reply to it ... the ability
// to delete that or edit the question to structure it better ... headings, bold, and maybe the ability to add an image
// circling something."
//
// Its own page rather than a section of Get help, because it has its own job (find the answer yourself, in seconds)
// and its own admin life (edit, reorder, answer). Get help leads with a card into it, and the avatar menu links it.
//
// ONE PAGE, "GET HELP" (8 Oct 2026). Ethan: "combine the questions and answers page into the Get Help page, so the
// questions and answers should be at the top. If you scroll down, there should be the Get Help below it ... Ask a
// Question should also be below those things, and obviously they can be hidden or like toggles." And: "remove at the
// top ... Getting Started, Challenges, and Points. Those buttons aren't necessary." So the answers lead (search, then
// every topic as a heading), and the two ways to reach a person sit underneath as sections that open on a tap. The
// page lives at /help; /help/faq and Settings > Get help both arrive here.
//
// Three tabs: the answers everybody sees (searchable, by topic, with the answered community questions under them);
// "My questions", where a creator sees what they asked and can reword or withdraw one until it is answered; and, for
// the team, "Inbox", where questions are answered, made public, or turned into a proper FAQ entry. Answers are
// markdown, written in the same rich editor as What's new, with images that can be marked up before they go in.

// A glyph for each topic the starter answers use; any topic an admin adds gets the lifebuoy.
const TOPIC_ICON = { 'Getting started': 'sparkles', 'Challenges and points': 'trophy', 'Payments and rewards': 'wallet', 'VIP programme': 'star', 'Account and app': 'users' }

const TOOLBAR = ['h2', 'h3', '|', 'bold', 'italic', 'link', '|', 'ul', 'ol', 'quote', 'divider']

export default function Faq() {
  const tr = useT()
  const { user, profile } = useAuth()
  const isAdmin = !!profile?.is_admin
  const [params, setParams] = useSearchParams()
  const tab = ['faq', 'mine', 'questions'].includes(params.get('tab')) && (params.get('tab') !== 'questions' || isAdmin) ? params.get('tab') : 'faq'
  const setTab = (t) => setParams(t === 'faq' ? {} : { tab: t }, { replace: true })

  const [faqs, setFaqs] = useState(undefined)
  const [community, setCommunity] = useState([])
  const [mine, setMine] = useState(undefined)
  const [inbox, setInbox] = useState(undefined)
  const [editing, setEditing] = useState(false)
  const [editRow, setEditRow] = useState(null)

  const loadFaqs = useCallback(async () => {
    const [{ data }, { data: pub }] = await Promise.all([
      supabase.from('faqs').select('*').order('position').order('created_at'),
      supabase.from('faq_questions').select('id, question, answer, answered_at').eq('is_public', true).eq('status', 'answered').is('faq_id', null).order('answered_at', { ascending: false }).limit(30),
    ])
    setFaqs(data || [])
    setCommunity(pub || [])
  }, [])
  const loadMine = useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase.from('faq_questions').select('*').eq('asker_id', user.id).order('created_at', { ascending: false })
    setMine(data || [])
  }, [user?.id])
  const loadInbox = useCallback(async () => {
    if (!isAdmin) return
    const { data } = await supabase.from('faq_questions').select('*, asker:profiles!faq_questions_asker_id_fkey(id, name, photo_url)').order('created_at', { ascending: false }).limit(200)
    setInbox(data || [])
  }, [isAdmin])
  useEffect(() => { loadFaqs() }, [loadFaqs])
  useEffect(() => { loadMine() }, [loadMine])
  useEffect(() => { loadInbox() }, [loadInbox])

  const openCount = (inbox || []).filter((q) => q.status === 'open').length

  return (
    <div className="page max-w-6xl">
      <FaqHero
        isAdmin={isAdmin}
        editing={editing}
        onEdit={() => { setEditing((v) => !v); setTab('faq') }}
      />

      <div className="mb-5 mt-6 flex justify-center">
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'faq', label: tr('Answers') },
            { value: 'mine', label: tr('My questions') },
            ...(isAdmin ? [{ value: 'questions', label: openCount ? `${tr('Inbox')} (${openCount})` : tr('Inbox') }] : []),
          ]}
        />
      </div>

      {/* TWO COLUMNS (9 Oct 2026). Ethan: "the small right column and the bigger left column. Move all those frequently asked
          questions to the big left column, and then in the right column ... Ask a question at the very top right, and the
          team things below it ... Ask the community and Help us improve as buttons." On a phone the column drops under the
          answers, with a one-tap jump to it so asking is never a long scroll away. */}
      <div className={cx('grid items-start gap-6', tab !== 'questions' && 'lg:grid-cols-[minmax(0,1fr)_360px]')}>
        <div className="min-w-0">
          {tab !== 'questions' && (
            <a href="#help-side" className="mb-4 flex items-center justify-center gap-2 rounded-full border border-brand/25 bg-brand-tint px-4 py-2.5 text-sm font-bold text-brand transition-colors lg:hidden">
              <Icon name="handRaised" className="h-4 w-4" />{tr('Ask a question or message the team')}
            </a>
          )}
          {tab === 'faq' && (
            <AnswersTab
              faqs={faqs}
              community={community}
              editing={editing}
              onEditRow={setEditRow}
              onChanged={loadFaqs}
            />
          )}
          {tab === 'mine' && <MineTab rows={mine} onChanged={loadMine} />}
          {tab === 'questions' && isAdmin && <InboxTab rows={inbox} faqs={faqs || []} onChanged={() => { loadInbox(); loadFaqs() }} />}
        </div>
        {tab !== 'questions' && (
          <aside id="help-side" className="min-w-0 scroll-mt-24 space-y-4">
            <AskCard compact onAsked={() => { loadMine(); loadInbox() }} />
            <HelpTeam />
            <HelpOpenDoors />
          </aside>
        )}
      </div>

      {editRow && (
        <FaqEditor
          row={editRow === true ? null : editRow}
          categories={[...new Set((faqs || []).map((f) => f.category))]}
          nextPosition={(faqs || []).reduce((n, f) => Math.max(n, f.position), 0) + 1}
          onClose={() => setEditRow(null)}
          onSaved={() => { setEditRow(null); loadFaqs() }}
        />
      )}
      {editing && tab === 'faq' && (
        <button type="button" onClick={() => setEditRow(true)} className="btn-primary fixed bottom-[calc(6.5rem+env(safe-area-inset-bottom))] right-5 z-40 shadow-lift lg:bottom-8">
          <Icon name="plus" className="h-4 w-4" strokeWidth={2.4} />{tr('Add a question')}
        </button>
      )}
    </div>
  )
}

function FaqHero({ isAdmin, editing, onEdit }) {
  const tr = useT()
  return (
    <section className="faq-hero relative overflow-hidden rounded-[28px] px-6 pb-8 pt-8 text-white shadow-card sm:px-10 sm:pt-10">
      <span aria-hidden className="faq-bubble faq-bubble-a">?</span>
      <span aria-hidden className="faq-bubble faq-bubble-b">?</span>
      <span aria-hidden className="faq-bubble faq-bubble-c">!</span>
      <div className="relative flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/85"><Icon name="lifebuoy" className="h-4 w-4" />{tr('Questions and Answers')}</p>
          <h1 className="mt-2 text-[30px] font-extrabold leading-[1.05] tracking-tight sm:text-[40px]">{tr('Get Help')}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-white/85">{tr('The answers creators ask for most. Cannot find yours? Ask a question or message the team on the right.')}</p>
        </div>
        {isAdmin && (
          <button type="button" onClick={onEdit} aria-pressed={editing}
            className={cx('inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold shadow-card transition-all duration-200 hoverable:hover:-translate-y-0.5', editing ? 'bg-ink text-white' : 'bg-white text-brand')}>
            <Icon name={editing ? 'check' : 'pencil'} className="h-4 w-4" />{editing ? tr('Done editing') : tr('Edit')}
          </button>
        )}
      </div>
    </section>
  )
}

// ------------------------------------------------------------------ answers --
function AnswersTab({ faqs, community, editing, onEditRow, onChanged }) {
  const tr = useT()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  const cats = useMemo(() => [...new Set((faqs || []).filter((f) => editing || f.published).map((f) => f.category))], [faqs, editing])
  const needle = q.trim().toLowerCase()
  const shown = (faqs || [])
    .filter((f) => editing || f.published)
    .filter((f) => !needle || `${f.question} ${f.answer}`.toLowerCase().includes(needle))
  const groups = cats.map((c) => ({ c, rows: shown.filter((f) => f.category === c) })).filter((g) => g.rows.length)
  const comm = community.filter((c) => !needle || `${c.question} ${c.answer}`.toLowerCase().includes(needle))

  async function move(f, dir) {
    const list = (faqs || []).filter((x) => x.category === f.category)
    const i = list.findIndex((x) => x.id === f.id)
    const other = list[i + dir]
    if (!other) return
    await Promise.all([
      supabase.from('faqs').update({ position: other.position }).eq('id', f.id),
      supabase.from('faqs').update({ position: f.position }).eq('id', other.id),
    ])
    onChanged()
  }
  async function remove(f) {
    if (!await confirm(tr('Delete this question and its answer?'), { confirmLabel: tr('Delete'), danger: true })) return
    const { error } = await supabase.from('faqs').delete().eq('id', f.id)
    if (error) { notice(error.message); return }
    toastSuccess(tr('Deleted.'))
    onChanged()
  }

  return (
    <div className="space-y-6">
      <div className="relative">
        <Icon name="magnifier" className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Search the answers')} className="input no-ios-zoom !rounded-full !py-3.5 !pl-12 shadow-card" aria-label={tr('Search the answers')} />
      </div>
      {faqs === undefined ? (
        <div className="space-y-3">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full rounded-2xl" />)}</div>
      ) : groups.length === 0 && comm.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-200 bg-white px-5 py-10 text-center text-sm text-smoke">{needle ? tr('Nothing matches that. Ask it on the right.') : tr('No questions yet.')}</p>
      ) : (
        groups.map((g, gi) => (
          <section key={g.c} className="animate-rise" style={{ animationDelay: `${gi * 60}ms` }}>
            <h2 className="mb-2.5 flex items-center gap-2 px-1 text-[12px] font-extrabold uppercase tracking-[0.14em] text-ink"><Icon name={TOPIC_ICON[g.c] || 'lifebuoy'} className="h-4 w-4 text-brand" />{tr(g.c)}</h2>
            <ul className="space-y-2">
              {g.rows.map((f, i) => (
                <FaqItem
                  key={f.id}
                  question={f.question}
                  answer={f.answer}
                  open={open === f.id || !!needle}
                  onToggle={() => setOpen((o) => (o === f.id ? null : f.id))}
                  hidden={!f.published}
                  admin={editing ? {
                    onEdit: () => onEditRow(f),
                    onUp: i > 0 ? () => move(f, -1) : null,
                    onDown: i < g.rows.length - 1 ? () => move(f, 1) : null,
                    onDelete: () => remove(f),
                  } : null}
                />
              ))}
            </ul>
          </section>
        ))
      )}

      {comm.length > 0 && (
        <section>
          <h2 className="mb-2.5 flex items-center gap-2 px-1 text-[12px] font-extrabold uppercase tracking-[0.14em] text-ink"><Icon name="chat" className="h-4 w-4 text-brand" />{tr('Asked by the community')}</h2>
          <ul className="space-y-2">
            {comm.map((c) => (
              <FaqItem key={c.id} question={c.question} answer={c.answer || ''} open={open === c.id || !!needle} onToggle={() => setOpen((o) => (o === c.id ? null : c.id))} />
            ))}
          </ul>
        </section>
      )}

    </div>
  )
}

function FaqItem({ question, answer, open, onToggle, hidden, admin }) {
  const tr = useT()
  return (
    <li className={cx('overflow-hidden rounded-2xl border bg-white transition-all duration-300', open ? 'border-brand/40 shadow-lift' : 'border-gray-100 shadow-card hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/30 hoverable:hover:shadow-lift', hidden && 'opacity-60')}>
      <div className="flex items-center">
        <button type="button" onClick={onToggle} aria-expanded={open} className="group flex min-w-0 flex-1 items-center gap-3 px-4 py-4 text-left sm:px-5">
          <span className={cx('flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-black transition-all duration-300', open ? 'rotate-0 bg-brand text-white' : 'bg-transparent text-brand')}>?</span>
          <span className="min-w-0 flex-1 text-[15px] font-semibold leading-snug text-ink">{question}{hidden && <span className="ml-2 rounded-full bg-cloud px-2 py-0.5 text-[10px] font-bold uppercase text-smoke">{tr('Hidden')}</span>}</span>
          <Icon name="chevronDown" className={cx('h-5 w-5 shrink-0 text-gray-400 transition-transform duration-300', open && 'rotate-180 text-brand')} />
        </button>
        {admin && (
          <span className="flex shrink-0 items-center gap-0.5 pr-3">
            <IconBtn icon="chevronUp" label={tr('Move up')} onClick={admin.onUp} />
            <IconBtn icon="chevronDown" label={tr('Move down')} onClick={admin.onDown} />
            <IconBtn icon="pencil" label={tr('Edit')} onClick={admin.onEdit} />
            <IconBtn icon="trash" label={tr('Delete')} onClick={admin.onDelete} danger />
          </span>
        )}
      </div>
      <div className={cx('grid transition-[grid-template-rows] duration-300 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
        <div className="min-h-0 overflow-hidden">
          <div className="border-t border-gray-100 px-5 pb-5 pt-3 text-[14.5px] sm:pl-[3.75rem]">{renderNote(answer)}</div>
        </div>
      </div>
    </li>
  )
}

function IconBtn({ icon, label, onClick, danger }) {
  return (
    <button type="button" onClick={onClick || undefined} disabled={!onClick} aria-label={label} title={label}
      className={cx('flex h-8 w-8 items-center justify-center rounded-full text-smoke transition-colors disabled:opacity-25', danger ? 'hoverable:hover:bg-red-50 hoverable:hover:text-red-600' : 'hoverable:hover:bg-cloud hoverable:hover:text-brand')}>
      <Icon name={icon} className="h-4 w-4" />
    </button>
  )
}

// ---------------------------------------------------------------------- ask --
function AskCard({ onAsked, compact = false, bare = false }) {
  const tr = useT()
  const { user } = useAuth()
  const [question, setQuestion] = useState('')
  const [details, setDetails] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  async function send() {
    if (question.trim().length < 5) return
    setBusy(true)
    const { error } = await supabase.from('faq_questions').insert({ asker_id: user.id, question: question.trim(), details: details.trim() || null })
    setBusy(false)
    if (error) { notice(error.message); return }
    setQuestion(''); setDetails(''); setSent(true)
    toastSuccess(tr('Sent. The team will reply here.'))
    onAsked?.()
    setTimeout(() => setSent(false), 4000)
  }
  return (
    <section className={cx('relative overflow-hidden', !bare && 'ask-card rounded-[24px] text-white shadow-card', !bare && (compact ? 'p-5' : 'p-6 sm:p-7'))}>
      {!bare && <h2 className="relative flex items-center gap-2 text-lg font-bold"><Icon name="handRaised" className="ask-icon h-5 w-5" />{tr('Ask a question')}</h2>}
      {!bare && <p className="relative mt-0.5 text-sm text-white/90">{tr('The team replies here, and you get a notification. Good questions are added to the answers.')}</p>}
      <div className={cx('relative space-y-3', !bare && 'mt-4')}>
        <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={600} placeholder={tr('What would you like to know?')} className="input no-ios-zoom" aria-label={tr('Your question')} />
        <textarea value={details} onChange={(e) => setDetails(e.target.value)} rows={3} maxLength={2000} placeholder={tr('Anything that helps us answer (optional)')} className="input no-ios-zoom resize-none" aria-label={tr('Details')} />
        <div className="flex items-center justify-between gap-3">
          <span className={cx('flex items-center gap-1.5 text-sm font-bold transition-opacity duration-300', bare ? 'text-brand' : 'text-white', sent ? 'opacity-100' : 'opacity-0')}><Icon name="check" className="h-4 w-4" />{tr('Sent')}</span>
          <button type="button" onClick={send} disabled={busy || question.trim().length < 5}
            className={cx('inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold shadow-card transition-all duration-200 disabled:opacity-60 hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift', bare ? 'bg-brand text-white' : 'ask-send')}>
            {busy ? <Spinner className="h-4 w-4" /> : <Icon name="chevronRight" className="h-4 w-4" />}{tr('Send question')}
          </button>
        </div>
      </div>
    </section>
  )
}

// --------------------------------------------------------------------- mine --
function MineTab({ rows, onChanged }) {
  const tr = useT()
  const [editId, setEditId] = useState(null)
  const [text, setText] = useState('')
  async function save(r) {
    const { error } = await supabase.from('faq_questions').update({ question: text.trim(), updated_at: new Date().toISOString() }).eq('id', r.id)
    if (error) { notice(error.message); return }
    setEditId(null); onChanged()
  }
  async function withdraw(r) {
    if (!await confirm(tr('Withdraw this question?'), { confirmLabel: tr('Withdraw'), danger: true })) return
    const { error } = await supabase.from('faq_questions').delete().eq('id', r.id)
    if (error) { notice(error.message); return }
    onChanged()
  }
  if (rows === undefined) return <Skeleton className="h-32 w-full rounded-card" />
  return (
    <div className="space-y-5">
      {rows.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-200 bg-white px-5 py-10 text-center text-sm text-smoke">{tr('You have not asked anything yet.')}</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li key={r.id} className="rounded-2xl border border-gray-100 bg-white p-5 shadow-card animate-rise">
              <div className="flex items-start gap-3">
                <span className={cx('mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase', r.status === 'answered' ? 'bg-brand text-white' : r.status === 'closed' ? 'bg-cloud text-smoke' : 'bg-brand-tint text-brand')}>
                  {r.status === 'answered' ? tr('Answered') : r.status === 'closed' ? tr('Closed') : tr('Waiting')}
                </span>
                <div className="min-w-0 flex-1">
                  {editId === r.id ? (
                    <div className="space-y-2">
                      <input value={text} onChange={(e) => setText(e.target.value)} className="input no-ios-zoom" />
                      <div className="flex gap-2">
                        <button type="button" onClick={() => save(r)} disabled={text.trim().length < 5} className="btn-primary !py-1.5 text-xs">{tr('Save')}</button>
                        <button type="button" onClick={() => setEditId(null)} className="btn-secondary !py-1.5 text-xs">{tr('Cancel')}</button>
                      </div>
                    </div>
                  ) : (
                    <p className="font-semibold text-ink">{r.question}</p>
                  )}
                  <p className="mt-0.5 text-xs text-smoke">{timeAgo(r.created_at)}</p>
                  {r.answer && <div className="mt-3 rounded-xl bg-cloud/60 px-4 py-3 text-sm">{renderNote(r.answer)}</div>}
                </div>
                {r.status === 'open' && editId !== r.id && (
                  <span className="flex shrink-0 gap-0.5">
                    <IconBtn icon="pencil" label={tr('Reword')} onClick={() => { setEditId(r.id); setText(r.question) }} />
                    <IconBtn icon="trash" label={tr('Withdraw')} onClick={() => withdraw(r)} danger />
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// -------------------------------------------------------------------- inbox --
function InboxTab({ rows, faqs, onChanged }) {
  const tr = useT()
  const [filter, setFilter] = useState('open')
  if (rows === undefined) return <Skeleton className="h-40 w-full rounded-card" />
  const shown = rows.filter((r) => (filter === 'all' ? true : r.status === filter))
  return (
    <div className="space-y-4">
      <div className="flex justify-center">
        <Segmented value={filter} onChange={setFilter} size="sm"
          options={[{ value: 'open', label: tr('Waiting') }, { value: 'answered', label: tr('Answered') }, { value: 'all', label: tr('All') }]} />
      </div>
      {shown.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-200 bg-white px-5 py-10 text-center text-sm text-smoke">{filter === 'open' ? tr('Nothing waiting. Nice.') : tr('Nothing here.')}</p>
      ) : (
        <ul className="space-y-3">{shown.map((r) => <InboxItem key={r.id} r={r} categories={[...new Set(faqs.map((f) => f.category))]} onChanged={onChanged} />)}</ul>
      )}
    </div>
  )
}

function InboxItem({ r, categories, onChanged }) {
  const tr = useT()
  const { user } = useAuth()
  const editor = useRef(null)
  const [open, setOpen] = useState(r.status === 'open')
  const [question, setQuestion] = useState(r.question)
  const [answer, setAnswer] = useState(r.answer || '')
  const [isPublic, setIsPublic] = useState(r.is_public)
  const [toFaq, setToFaq] = useState(false)
  const [category, setCategory] = useState(categories[0] || 'General')
  const [busy, setBusy] = useState(false)

  async function save() {
    if (!answer.trim()) { notice(tr('Write an answer first.')); return }
    setBusy(true)
    let faqId = r.faq_id
    if (toFaq && !faqId) {
      const { data, error } = await supabase.from('faqs').insert({ category: category.trim() || 'General', question: question.trim(), answer, position: 999, from_question: r.id, created_by: user.id }).select('id').single()
      if (error) { setBusy(false); notice(error.message); return }
      faqId = data.id
    }
    const { error } = await supabase.from('faq_questions').update({
      question: question.trim(), answer, status: 'answered', answered_by: user.id, answered_at: r.answered_at || new Date().toISOString(),
      is_public: isPublic, faq_id: faqId, updated_at: new Date().toISOString(),
    }).eq('id', r.id)
    setBusy(false)
    if (error) { notice(error.message); return }
    toastSuccess(r.status === 'answered' ? tr('Answer updated.') : tr('Answered. They have been told.'))
    onChanged()
  }
  async function close() {
    await supabase.from('faq_questions').update({ status: 'closed', updated_at: new Date().toISOString() }).eq('id', r.id)
    onChanged()
  }
  async function remove() {
    if (!await confirm(tr('Delete this question?'), { confirmLabel: tr('Delete'), danger: true })) return
    await supabase.from('faq_questions').delete().eq('id', r.id)
    onChanged()
  }

  return (
    <li className={cx('rounded-2xl border bg-white shadow-card transition-all duration-300', open ? 'border-brand/30' : 'border-gray-100')}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-3 px-5 py-4 text-left">
        <Avatar src={r.asker?.photo_url} name={r.asker?.name || ''} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">{r.question}</span>
          <span className="block text-xs text-smoke">{r.asker?.name} · {timeAgo(r.created_at)}{r.is_public ? ` · ${tr('public')}` : ''}{r.faq_id ? ` · ${tr('in the FAQ')}` : ''}</span>
        </span>
        <span className={cx('shrink-0 rounded-full px-2.5 py-0.5 text-[10.5px] font-bold uppercase', r.status === 'answered' ? 'bg-brand text-white' : r.status === 'closed' ? 'bg-cloud text-smoke' : 'bg-brand-tint text-brand')}>{r.status === 'open' ? tr('Waiting') : tr(r.status === 'answered' ? 'Answered' : 'Closed')}</span>
      </button>
      {open && (
        <div className="animate-tab-in space-y-4 border-t border-gray-100 px-5 py-4">
          {r.details && <p className="rounded-xl bg-cloud/60 px-4 py-3 text-sm text-ink/90 [overflow-wrap:anywhere]">{r.details}</p>}
          <label className="block"><span className="label">{tr('Question (tidy it up if you like)')}</span>
            <input value={question} onChange={(e) => setQuestion(e.target.value)} className="input" />
          </label>
          <div>
            <p className="label">{tr('Answer')}</p>
            <AnswerEditor editorRef={editor} docId={`q-${r.id}`} initialMd={r.answer || ''} onChangeMd={setAnswer} />
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <label className="flex items-center gap-2.5 text-sm font-semibold text-ink"><Toggle on={isPublic} onChange={setIsPublic} label={tr('Show to everyone')} />{tr('Show to everyone')}</label>
            {!r.faq_id && (
              <label className="flex items-center gap-2.5 text-sm font-semibold text-ink"><Toggle on={toFaq} onChange={setToFaq} label={tr('Add to the answers')} />{tr('Add to the answers')}</label>
            )}
            {toFaq && (
              <input list="faq-cats" value={category} onChange={(e) => setCategory(e.target.value)} className="input !w-48 !py-2 text-sm" aria-label={tr('Topic')} placeholder={tr('Topic')} />
            )}
            <datalist id="faq-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            <button type="button" onClick={remove} className="btn-secondary !py-2 text-sm text-red-600">{tr('Delete')}</button>
            {r.status === 'open' && <button type="button" onClick={close} className="btn-secondary !py-2 text-sm">{tr('Close without answer')}</button>}
            <button type="button" onClick={save} disabled={busy} className="btn-primary !py-2 text-sm">{busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}{r.status === 'answered' ? tr('Update answer') : tr('Send answer')}</button>
          </div>
        </div>
      )}
    </li>
  )
}

// ------------------------------------------------------------------- editor --
/** The rich editor plus an "Add image" button that opens the mark-up tool and drops the picture in at the caret. */
function AnswerEditor({ editorRef, docId, initialMd, onChangeMd }) {
  const tr = useT()
  const { user } = useAuth()
  const fileRef = useRef(null)
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState(false)
  async function add(blob) {
    setBusy(true)
    try {
      const { url } = await uploadChatImage(blob, user.id)
      const safe = String(url).replace(/"/g, '&quot;')
      editorRef.current?.insertHtml(`<figure contenteditable="false" data-img="${safe}" data-alt=""><img src="${safe}" alt=""></figure><p><br></p>`)
      setFile(null)
    } catch (e) { notice(e.message || tr('Could not add that image.')) } finally { setBusy(false) }
  }
  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <RichToolbar editorRef={editorRef} only={TOOLBAR} />
        <button type="button" onClick={() => fileRef.current?.click()} className="mb-2 inline-flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-ink transition-colors hoverable:hover:border-brand hoverable:hover:text-brand">
          <Icon name="image" className="h-4 w-4" />{tr('Image')}
        </button>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) setFile(f) }} />
      </div>
      <RichEditable
        ref={editorRef}
        docId={docId}
        initialMd={initialMd}
        onChangeMd={onChangeMd}
        placeholder={tr('Write the answer. Headings, bold, lists and images all work.')}
        className="min-h-[10rem] rounded-card border border-gray-200 bg-white px-4 py-3 text-[15px] leading-relaxed focus:border-brand/40"
      />
      {file && <ImageMarkup file={file} busy={busy} onDone={add} onClose={() => setFile(null)} />}
    </div>
  )
}

function FaqEditor({ row, categories, nextPosition, onClose, onSaved }) {
  const tr = useT()
  const { user } = useAuth()
  const editor = useRef(null)
  const [question, setQuestion] = useState(row?.question || '')
  const [category, setCategory] = useState(row?.category || categories[0] || 'General')
  const [answer, setAnswer] = useState(row?.answer || '')
  const [published, setPublished] = useState(row ? row.published : true)
  const [busy, setBusy] = useState(false)
  async function save() {
    setBusy(true)
    const payload = { question: question.trim(), category: category.trim() || 'General', answer, published, updated_at: new Date().toISOString() }
    const { error } = row
      ? await supabase.from('faqs').update(payload).eq('id', row.id)
      : await supabase.from('faqs').insert({ ...payload, position: nextPosition, created_by: user.id })
    setBusy(false)
    if (error) { notice(error.message); return }
    toastSuccess(row ? tr('Saved.') : tr('Added.'))
    onSaved()
  }
  return (
    <Modal open onClose={onClose} title={row ? tr('Edit the question') : tr('Add a question')} wide>
      <div className="space-y-4">
        <label className="block"><span className="label">{tr('Question')}</span><input className="input" maxLength={300} value={question} onChange={(e) => setQuestion(e.target.value)} /></label>
        <label className="block"><span className="label">{tr('Topic')}</span>
          <input className="input" list="faq-editor-cats" value={category} onChange={(e) => setCategory(e.target.value)} />
          <datalist id="faq-editor-cats">{categories.map((c) => <option key={c} value={c} />)}</datalist>
        </label>
        <div>
          <p className="label">{tr('Answer')}</p>
          <AnswerEditor editorRef={editor} docId={row?.id || 'new-faq'} initialMd={row?.answer || ''} onChangeMd={setAnswer} />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2.5 text-sm font-semibold text-ink"><Toggle on={published} onChange={setPublished} label={tr('Show to creators')} />{tr('Show to creators')}</label>
          <div className="flex gap-2.5">
            <button type="button" onClick={onClose} className="btn-secondary !py-2.5 text-sm">{tr('Cancel')}</button>
            <button type="button" onClick={save} disabled={busy || question.trim().length < 3} className="btn-primary !py-2.5 text-sm">{busy ? <Spinner className="h-4 w-4" /> : <Icon name="check" className="h-4 w-4" />}{tr('Save')}</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
