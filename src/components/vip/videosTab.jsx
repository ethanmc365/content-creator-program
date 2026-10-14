import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { Avatar, Floating, Select, Skeleton } from '../ui'
import Icon from '../Icon'
import VideoThumb from '../VideoThumb'
import { cx, downloadCsv, formatDate, formatViews } from '../../lib/utils'
import { confirm, notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { useKindT } from '../../lib/vip'
import { safeUrl } from '../../lib/safeUrl'
import { allRows } from '../../lib/fetchAll'
import { vipApi } from '../../api/vip'

// VIP TOOLS > VIDEOS (14 Oct 2026). "There should be a page where you can easily see all the recent videos ... and you
// can view, split by creator, what each creator actually posted." The videos sat at the foot of People. Here: every
// video in the market, newest first or grouped by creator, with search, platform, month and the answers to the team's
// video questions as filters. A creator's name opens a small menu: their community profile, their VIP page, a message.

const PLATFORMS = ['TikTok', 'Instagram', 'YouTube', 'Facebook']
const monthKey = (iso) => (iso ? String(iso).slice(0, 7) : '')
const monthName = (k) => new Date(`${k}-01T12:00:00Z`).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })

function useProgrammeVideos(programme) {
  const [state, setState] = useState(null)
  useEffect(() => {
    let alive = true
    Promise.all([
      allRows(() => vipApi.videos().select('id, profile_id, platform, video_url, thumbnail_url, logged_views, posted_at, submitted_at, status, caption, profiles:profile_id(id, name, photo_url)').eq('programme_id', programme.id)),
      vipApi.videoQuestions().select('*').or(`programme_id.eq.${programme.id},and(programme_id.is.null,kind.eq.${programme.kind || 'vip'})`).order('position'),
    ]).then(async ([videos, { data: questions }]) => {
      const list = (videos || []).filter((v) => v.status !== 'removed')
      const ids = list.map((v) => v.id)
      const answers = []
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await vipApi.videoAnswers().select('video_id, question_id, answers').in('video_id', ids.slice(i, i + 200))
        answers.push(...(data || []))
      }
      if (alive) setState({ videos: list, questions: questions || [], answers })
    })
    return () => { alive = false }
  }, [programme.id, programme.kind])
  return [state, setState]
}

export function VipVideosTab({ programme }) {
  const tr = useKindT()
  const [params] = useSearchParams()
  const [state] = useProgrammeVideos(programme)
  const [view, setView] = useState('recent')
  const [q, setQ] = useState('')
  const [platform, setPlatform] = useState('')
  const [month, setMonth] = useState('')
  const [creator, setCreator] = useState('')
  const [answer, setAnswer] = useState(() => (params.get('q') ? { q: params.get('q'), a: params.get('a') || '' } : null))
  // A press on an answer in Video questions lands here filtered to it, even when this page was already open.
  const askedQ = params.get('q')
  const askedA = params.get('a') || ''
  const [seenAsk, setSeenAsk] = useState(`${askedQ}|${askedA}`)
  if (seenAsk !== `${askedQ}|${askedA}`) { setSeenAsk(`${askedQ}|${askedA}`); setAnswer(askedQ ? { q: askedQ, a: askedA } : null) }

  const byVideo = useMemo(() => {
    const m = new Map()
    for (const a of state?.answers || []) {
      const cur = m.get(a.video_id) || {}
      cur[a.question_id] = a.answers
      m.set(a.video_id, cur)
    }
    return m
  }, [state])
  const qById = useMemo(() => new Map((state?.questions || []).map((x) => [x.id, x])), [state])
  const months = useMemo(() => [...new Set((state?.videos || []).map((v) => monthKey(v.posted_at || v.submitted_at)))].filter(Boolean).sort().reverse(), [state])
  const creators = useMemo(() => {
    const m = new Map()
    for (const v of state?.videos || []) if (v.profiles) m.set(v.profile_id, v.profiles)
    return [...m.values()].sort((a, b) => String(a.name).localeCompare(String(b.name)))
  }, [state])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (state?.videos || []).filter((v) => {
      if (platform && v.platform !== platform) return false
      if (month && monthKey(v.posted_at || v.submitted_at) !== month) return false
      if (creator && v.profile_id !== creator) return false
      if (answer) {
        const got = byVideo.get(v.id)?.[answer.q]
        if (answer.a === '__none') { if (got?.length) return false } else if (answer.a ? !got?.includes(answer.a) : !got?.length) return false
      }
      if (needle && !`${v.profiles?.name || ''} ${v.caption || ''} ${v.video_url}`.toLowerCase().includes(needle)) return false
      return true
    }).sort((a, b) => String(b.posted_at || b.submitted_at).localeCompare(String(a.posted_at || a.submitted_at)))
  }, [state, q, platform, month, creator, answer, byVideo])

  if (!state) return <div className="space-y-3"><Skeleton className="h-16 w-full rounded-card" /><div className="grid grid-cols-2 gap-3 sm:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[9/14] rounded-card" />)}</div></div>

  const totalViews = shown.reduce((n, v) => n + (Number(v.logged_views) || 0), 0)
  const posting = new Set(shown.map((v) => v.profile_id)).size
  const groups = view === 'creators'
    ? creators.map((c) => ({ c, vids: shown.filter((v) => v.profile_id === c.id) })).filter((g) => g.vids.length)
      .sort((a, b) => b.vids.reduce((n, v) => n + (Number(v.logged_views) || 0), 0) - a.vids.reduce((n, v) => n + (Number(v.logged_views) || 0), 0))
    : null
  const filtered = q || platform || month || creator || answer

  function exportCsv() {
    downloadCsv(`vip-videos-${programme.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`, shown.map((v) => ({
      creator: v.profiles?.name || '', platform: v.platform, posted: (v.posted_at || v.submitted_at || '').slice(0, 10), views: v.logged_views ?? '', link: v.video_url,
      ...Object.fromEntries((state.questions || []).map((x) => [x.question, (byVideo.get(v.id)?.[x.id] || []).join(' | ')])),
    })))
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        {[[tr('Videos'), shown.length.toLocaleString()], [tr('Views'), formatViews(totalViews)], [tr('Creators posting'), posting]].map(([k, v], i) => (
          <div key={k} className="rounded-card border border-gray-100 bg-white px-4 py-3 shadow-card animate-rise" style={{ animationDelay: `${i * 40}ms` }}>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-smoke">{k}</p>
            <p className="mt-0.5 text-2xl font-bold tabular-nums text-ink">{v}</p>
          </div>
        ))}
      </div>

      <div className="rounded-card border border-gray-100 bg-white p-2 shadow-card">
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex gap-0.5 rounded-full bg-cloud p-0.5">
            {[['recent', tr('Newest first'), 'clock'], ['creators', tr('By creator'), 'users']].map(([k, label, icon]) => (
              <button key={k} type="button" onClick={() => setView(k)} aria-pressed={view === k}
                className={cx('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors', view === k ? 'bg-brand text-white shadow-card' : 'text-smoke hover:text-ink')}>
                <Icon name={icon} className="h-3.5 w-3.5" />{label}
              </button>
            ))}
          </div>
          <div className="relative min-w-[9rem] flex-1">
            <Icon name="magnifier" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Search')} className="input !py-2 !pl-9 text-sm" aria-label={tr('Search videos')} />
          </div>
          <Select value={creator} onChange={setCreator} variant="field" className="w-44" ariaLabel={tr('Creator')}
            options={[{ value: '', label: tr('Every creator') }, ...creators.map((c) => ({ value: c.id, label: c.name }))]} />
          <Select value={month} onChange={setMonth} variant="field" className="w-40" ariaLabel={tr('Month')} search={false}
            options={[{ value: '', label: tr('Every month') }, ...months.map((m) => ({ value: m, label: monthName(m) }))]} />
          <button type="button" onClick={exportCsv} disabled={!shown.length} className="rounded-xl border border-gray-200 px-3 py-2 text-xs font-semibold text-smoke hover:border-brand hover:text-brand disabled:opacity-40">
            <Icon name="download" className="mr-1 inline h-3.5 w-3.5" />CSV
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1 pb-0.5">
          {PLATFORMS.map((p) => (
            <button key={p} type="button" onClick={() => setPlatform((cur) => (cur === p ? '' : p))} aria-pressed={platform === p}
              className={cx('rounded-full px-3 py-1 text-xs font-semibold transition-colors', platform === p ? 'bg-brand text-white' : 'bg-cloud text-smoke hover:text-ink')}>{p}</button>
          ))}
          {state.questions.map((x) => (
            <Select key={x.id} value={answer?.q === x.id ? (answer.a || '__any') : ''} variant="chip" className="max-w-[16rem]" ariaLabel={x.question} search={false}
              onChange={(v) => setAnswer(v ? { q: x.id, a: v === '__any' ? '' : v } : null)}
              options={[{ value: '', label: x.question }, { value: '__any', label: tr('Answered') }, { value: '__none', label: tr('Not answered') },
                ...(x.options?.length ? x.options : [tr('Yes'), tr('No')]).map((o) => ({ value: o, label: o }))]} />
          ))}
          {filtered && <button type="button" onClick={() => { setQ(''); setPlatform(''); setMonth(''); setCreator(''); setAnswer(null) }} className="ml-auto text-xs font-semibold text-smoke hover:text-brand">{tr('Clear')}</button>}
        </div>
      </div>

      {shown.length === 0 && <p className="rounded-card border border-dashed border-gray-200 px-6 py-12 text-center text-sm text-smoke">{tr('No videos match that.')}</p>}

      {view === 'recent' && shown.length > 0 && (
        <div key={`${platform}|${month}|${creator}|${answer?.q}|${answer?.a}`} className="grid grid-cols-2 gap-3 animate-tab-in sm:grid-cols-3 lg:grid-cols-5">
          {shown.slice(0, 120).map((v, i) => <VideoTile key={v.id} v={v} answers={byVideo.get(v.id)} qById={qById} delay={Math.min(i, 10) * 30} />)}
        </div>
      )}
      {view === 'recent' && shown.length > 120 && <p className="text-center text-xs text-smoke">{tr('Showing the newest 120. Narrow it down or download the CSV for all {n}.', { n: shown.length })}</p>}

      {groups && (
        <div className="space-y-3 animate-tab-in">
          {groups.map(({ c, vids }, gi) => (
            <section key={c.id} className="rounded-card border border-gray-100 bg-white p-3 shadow-card animate-rise sm:p-4" style={{ animationDelay: `${Math.min(gi, 8) * 35}ms` }}>
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <CreatorMenu person={c} />
                <span className="ml-auto text-xs text-smoke">
                  <b className="text-ink">{vids.length}</b> {vids.length === 1 ? tr('video') : tr('videos')} · <b className="text-ink">{formatViews(vids.reduce((n, v) => n + (Number(v.logged_views) || 0), 0))}</b> {tr('views')}
                </span>
              </div>
              <div className="scrollbar-none -mx-1 flex snap-x gap-2.5 overflow-x-auto px-1 pb-1">
                {vids.map((v) => <div key={v.id} className="w-[132px] shrink-0 snap-start"><VideoTile v={v} answers={byVideo.get(v.id)} qById={qById} compact /></div>)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

function VideoTile({ v, answers, qById, delay = 0, compact = false }) {
  const tags = Object.entries(answers || {}).flatMap(([qid, vals]) => (qById.get(qid) ? vals : []))
  return (
    <div className="group relative animate-rise" style={{ animationDelay: `${delay}ms` }}>
      <a href={safeUrl(v.video_url)} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-card border border-gray-100 bg-white shadow-card transition-all duration-300 hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift">
        <div className="relative">
          <VideoThumb url={v.video_url} platform={v.platform} thumbnailUrl={v.thumbnail_url} className="!aspect-[9/14]" mark={false} />
          <span className="absolute bottom-2 right-2 rounded-full bg-ink/75 px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">{v.logged_views != null ? formatViews(v.logged_views) : '…'}</span>
        </div>
        <div className="space-y-1 px-2.5 py-2">
          {!compact && <p className="truncate text-xs font-semibold text-ink">{v.profiles?.name}</p>}
          <p className="text-[11px] text-smoke">{v.platform} · {formatDate(v.posted_at || v.submitted_at)}</p>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {tags.slice(0, 3).map((t) => <span key={t} className="max-w-full truncate rounded-full bg-brand px-2 py-0.5 text-[10px] font-semibold text-white">{t}</span>)}
              {tags.length > 3 && <span className="text-[10px] font-semibold text-smoke">+{tags.length - 3}</span>}
            </div>
          )}
        </div>
      </a>
    </div>
  )
}

// A CREATOR'S NAME OPENS A MENU (14 Oct 2026): "clicking on the profile should then show the option to view their community
// profile or just their actual VIP profile".
export function CreatorMenu({ person }) {
  const tr = useKindT()
  const [open, setOpen] = useState(false)
  const anchor = useRef(null)
  const menu = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (!anchor.current?.contains(e.target) && !menu.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', away, true)
    return () => document.removeEventListener('pointerdown', away, true)
  }, [open])
  const vipHref = `/vip?mode=as&who=${person.id}`
  return (
    <>
      <button ref={anchor} type="button" onClick={() => setOpen((o) => !o)} className="group flex min-w-0 items-center gap-2.5" aria-expanded={open}>
        <Avatar src={person.photo_url} name={person.name} size="sm" />
        <span className="truncate text-sm font-bold text-ink group-hover:text-brand">{person.name}</span>
        <Icon name="chevronDown" className={cx('h-3.5 w-3.5 text-smoke transition-transform', open && 'rotate-180')} />
      </button>
      <Floating anchor={anchor} open={open} innerRef={menu} offset={6}>
        <div className="w-56 overflow-hidden rounded-2xl border border-gray-100 bg-white py-1 shadow-lift animate-menu-in">
          {[
            [`/profile/${person.id}`, tr('Community profile'), 'user'],
            [vipHref, tr('Their VIP page'), 'star'],
            [`/messages?to=${person.id}`, tr('Send a message'), 'chat'],
          ].map(([to, label, icon]) => (
            <Link key={label} to={to} onClick={() => setOpen(false)} className="flex items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-ink hover:bg-cloud hover:text-brand">
              <Icon name={icon} className="h-4 w-4 text-brand" />{label}
            </Link>
          ))}
        </div>
      </Floating>
    </>
  )
}

// ---------------------------------------------------------------------------------------------------------- the questions
// VIP TOOLS > VIDEO QUESTIONS. Write a question, give it options (or none for Yes / No), one answer or several, required
// or not, for everyone in the market or chosen creators; switch it off without losing its answers. Each question shows
// how its answers add up, and an answer opens the Videos page filtered to it.
export function VipQuestionsTab({ programme, isOwner }) {
  const tr = useKindT()
  const [state, setState] = useProgrammeVideos(programme)
  const [members, setMembers] = useState([])
  const [editing, setEditing] = useState(null)
  const [, setParams] = useSearchParams()
  useEffect(() => {
    vipApi.members().select('profile_id, profiles:profile_id(id, name, photo_url)').eq('programme_id', programme.id).eq('status', 'active')
      .then(({ data }) => setMembers((data || []).map((m) => m.profiles).filter(Boolean).sort((a, b) => String(a.name).localeCompare(String(b.name)))))
  }, [programme.id])

  async function reload() {
    const { data } = await vipApi.videoQuestions().select('*').or(`programme_id.eq.${programme.id},and(programme_id.is.null,kind.eq.${programme.kind || 'vip'})`).order('position')
    setState((s) => ({ ...s, questions: data || [] }))
  }
  async function save(d) {
    const row = {
      question: d.question.trim(), options: d.options, multiple: d.options.length > 0 && d.multiple, required: d.required,
      audience: d.audience, profile_ids: d.audience === 'some' ? d.profile_ids : [], active: d.active,
      programme_id: d.everywhere ? null : programme.id, kind: programme.kind || 'vip', updated_at: new Date().toISOString(),
    }
    const { error } = d.id ? await vipApi.videoQuestions().update(row).eq('id', d.id) : await vipApi.videoQuestions().insert(row)
    if (error) { notice(`Could not save: ${error.message}`); return false }
    toastSuccess(tr('Saved. Creators see it the next time they add a video.'))
    setEditing(null)
    reload()
    return true
  }
  async function remove(x) {
    if (!await confirm(tr('Delete "{q}" and every answer to it?', { q: x.question }), { danger: true, confirmLabel: tr('Delete') })) return
    const { error } = await vipApi.videoQuestions().delete().eq('id', x.id)
    if (error) { notice(error.message); return }
    reload()
  }
  const openVideos = (qid, a) => setParams((p) => { const n = new URLSearchParams(p); n.set('mode', 'tools'); n.set('tab', 'videos'); n.set('q', qid); if (a) n.set('a', a); else n.delete('a'); return n }, { replace: true })

  if (!state) return <Skeleton className="h-64 w-full rounded-card" />
  const counts = (qid) => {
    const m = new Map()
    let answered = 0
    for (const a of state.answers) if (a.question_id === qid) { answered++; for (const v of a.answers) m.set(v, (m.get(v) || 0) + 1) }
    return { m, answered }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-gray-100 bg-white p-4 shadow-card">
        <div className="min-w-0">
          <h3 className="font-semibold">{tr('Questions on every video')}</h3>
          <p className="mt-0.5 text-xs text-smoke">{tr('Asked each time a creator adds a video, challenge or not. They pay nothing: they label the video so you can count and filter.')}</p>
        </div>
        <button type="button" onClick={() => setEditing({ question: '', options: [], multiple: false, required: true, audience: 'all', profile_ids: [], active: true, everywhere: false })} className="btn-primary !py-2 text-xs">
          <Icon name="plus" className="h-4 w-4" />{tr('New question')}
        </button>
      </div>

      {editing && <QuestionEditor draft={editing} members={members} isOwner={isOwner} onCancel={() => setEditing(null)} onSave={save} />}

      {state.questions.length === 0 && !editing && (
        <p className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center text-sm text-smoke">{tr('No questions yet. Try "What is this video about?" with options like Flight and hotel, City break, Christmas markets.')}</p>
      )}

      {state.questions.map((x, i) => {
        const { m, answered } = counts(x.id)
        const opts = x.options?.length ? x.options : [tr('Yes'), tr('No')]
        const max = Math.max(1, ...opts.map((o) => m.get(o) || 0))
        return (
          <section key={x.id} className={cx('rounded-card border bg-white p-4 shadow-card animate-rise', x.active ? 'border-gray-100' : 'border-dashed border-gray-200 opacity-70')} style={{ animationDelay: `${i * 40}ms` }}>
            <div className="flex flex-wrap items-start gap-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{x.question}</p>
                <p className="mt-0.5 flex flex-wrap gap-x-2 text-[11px] text-smoke">
                  <span>{x.multiple ? tr('Several answers') : tr('One answer')}</span>·
                  <span>{x.required ? tr('Required') : tr('Optional')}</span>·
                  <span>{x.audience === 'all' ? tr('Everyone') : tr('{n} chosen creators', { n: x.profile_ids.length })}</span>·
                  <span>{x.programme_id ? programme.name : tr('Every market')}</span>
                  {!x.active && <><span>·</span><span className="font-semibold text-ink">{tr('Switched off')}</span></>}
                </p>
              </div>
              <button type="button" onClick={() => setEditing({ ...x, everywhere: !x.programme_id })} className="rounded-full p-2 text-smoke hover:bg-cloud hover:text-brand" aria-label={tr('Edit')}><Icon name="pencil" className="h-4 w-4" /></button>
              <button type="button" onClick={() => remove(x)} className="rounded-full p-2 text-smoke hover:bg-cloud hover:text-red-500" aria-label={tr('Delete')}><Icon name="trash" className="h-4 w-4" /></button>
            </div>
            <div className="mt-3 space-y-2">
              {opts.map((o) => (
                <button key={o} type="button" onClick={() => openVideos(x.id, o)} className="group block w-full text-left">
                  <span className="mb-1 flex justify-between text-sm"><span className="font-medium group-hover:text-brand">{o}</span><span className="font-semibold tabular-nums">{m.get(o) || 0}</span></span>
                  <span className="block h-2 overflow-hidden rounded-full bg-cloud"><span className="block h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${((m.get(o) || 0) / max) * 100}%` }} /></span>
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs text-smoke">
              {tr('{a} of {n} videos answered', { a: answered, n: state.videos.length })} ·{' '}
              <button type="button" onClick={() => openVideos(x.id, '')} className="font-semibold text-brand hover:underline">{tr('See the videos')}</button>
            </p>
          </section>
        )
      })}
    </div>
  )
}

function QuestionEditor({ draft, members, isOwner, onCancel, onSave }) {
  const tr = useKindT()
  const [d, setD] = useState(draft)
  const [opt, setOpt] = useState('')
  const [busy, setBusy] = useState(false)
  const addOpt = () => { const v = opt.trim(); if (v && !d.options.includes(v)) setD((x) => ({ ...x, options: [...x.options, v] })); setOpt('') }
  const toggle = (k) => setD((x) => ({ ...x, [k]: !x[k] }))
  const switchRow = (k, label, hint) => (
    <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl bg-cloud/60 px-3.5 py-2.5">
      <span><span className="block text-sm font-semibold">{label}</span>{hint && <span className="block text-[11px] text-smoke">{hint}</span>}</span>
      <button type="button" role="switch" aria-checked={d[k]} onClick={() => toggle(k)} className={cx('relative h-6 w-11 shrink-0 rounded-full transition-colors', d[k] ? 'bg-brand' : 'bg-gray-200')}>
        <span className={cx('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform', d[k] ? 'translate-x-[22px]' : 'translate-x-0.5')} />
      </button>
    </label>
  )
  return (
    <section className="rounded-card border-2 border-brand/40 bg-white p-4 shadow-lift animate-pop-in sm:p-5">
      <h3 className="mb-3 font-semibold">{d.id ? tr('Edit the question') : tr('New question')}</h3>
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="vq-text">{tr('The question')}</label>
          <input id="vq-text" className="input" value={d.question} maxLength={200} placeholder={tr('What is this video about?')} onChange={(e) => setD((x) => ({ ...x, question: e.target.value }))} />
        </div>
        <div>
          <span className="label">{tr('Answers to pick from')}</span>
          <div className="flex flex-wrap gap-1.5">
            {d.options.map((o) => (
              <span key={o} className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white">
                {o}<button type="button" aria-label={`Remove ${o}`} onClick={() => setD((x) => ({ ...x, options: x.options.filter((y) => y !== o) }))} className="ml-0.5 opacity-80 hover:opacity-100">✕</button>
              </span>
            ))}
            <input value={opt} onChange={(e) => setOpt(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addOpt() } }} onBlur={addOpt}
              placeholder={d.options.length ? tr('Add another') : tr('Type an answer, then Enter')} className="input !w-56 !py-1.5 text-sm" />
          </div>
          <p className="mt-1 text-[11px] text-smoke">{d.options.length ? '' : tr('Leave empty for a Yes / No question.')}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {d.options.length > 0 && switchRow('multiple', tr('They can tick several'), tr('Off: exactly one answer'))}
          {switchRow('required', tr('They must answer'), tr('Add video waits until it is answered'))}
          {switchRow('active', tr('Asking now'), tr('Off keeps the answers, stops asking'))}
          {isOwner && switchRow('everywhere', tr('Every market'), tr('Ask in every market of this kind'))}
        </div>
        <div>
          <span className="label">{tr('Who is asked')}</span>
          <div className="flex gap-1.5">
            {[['all', tr('Everyone')], ['some', tr('Chosen creators')]].map(([k, label]) => (
              <button key={k} type="button" onClick={() => setD((x) => ({ ...x, audience: k }))} aria-pressed={d.audience === k}
                className={cx('rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors', d.audience === k ? 'bg-brand text-white' : 'bg-cloud text-smoke hover:text-ink')}>{label}</button>
            ))}
          </div>
          {d.audience === 'some' && (
            <div className="mt-2 flex max-h-56 flex-wrap gap-1.5 overflow-y-auto rounded-xl bg-cloud/50 p-2">
              {members.map((p) => {
                const on = d.profile_ids.includes(p.id)
                return (
                  <button key={p.id} type="button" onClick={() => setD((x) => ({ ...x, profile_ids: on ? x.profile_ids.filter((y) => y !== p.id) : [...x.profile_ids, p.id] }))} aria-pressed={on}
                    className={cx('inline-flex items-center gap-1.5 rounded-full py-1 pl-1 pr-3 text-xs font-semibold transition-colors', on ? 'bg-brand text-white' : 'bg-white text-ink ring-1 ring-gray-200')}>
                    <Avatar src={p.photo_url} name={p.name} size="xs" />{p.name}
                  </button>
                )
              })}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-ghost">{tr('Cancel')}</button>
          <button type="button" disabled={busy || d.question.trim().length < 3 || (d.audience === 'some' && !d.profile_ids.length)}
            onClick={async () => { setBusy(true); await onSave(d); setBusy(false) }} className="btn-primary disabled:opacity-40">{busy ? tr('Saving…') : tr('Save')}</button>
        </div>
      </div>
    </section>
  )
}
