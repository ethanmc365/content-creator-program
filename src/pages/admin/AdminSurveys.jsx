import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Avatar, EmptyState, PageHeader, Select, Skeleton, Spinner } from '../../components/ui'
import Icon from '../../components/Icon'
import { SurveyModal } from '../../components/SurveyHost'
import { confirm, notice } from '../../lib/confirm'
import { cx, formatDate } from '../../lib/utils'
import {
  AUDIENCES, MODES, QUESTION_TYPES, SURVEY_STARTERS, blankSurvey, cleanSurvey, fromStarter, newQuestion, summarise, surveyProblem,
} from '../../lib/surveys'

// SURVEYS (30 Sep 2026, migration 291).
//
// Ethan: "Maybe we should have a survey thing or feedback page on the admin panel, or we can actually
// post forms that will give a pop-up to the creators to fill in. We can ask them for ideas or
// feedback on the platform ... Actually get some feedback easily."
//
// Three screens in one page: the list (each survey with its response rate), the builder (questions,
// who it is for, how hard it asks, a preview that is the creator's own form), and the results
// (per question: a rating's average and spread, a choice's bars, the written answers with names).
// A survey goes out only when it is switched to Live; Close stops it without losing a single answer.
const STATUS = {
  draft: { label: 'Draft', chip: 'bg-cloud text-gray-500' },
  live: { label: 'Live', chip: 'bg-green-50 text-green-700' },
  closed: { label: 'Closed', chip: 'bg-gray-100 text-smoke' },
}

export default function AdminSurveys() {
  const { profile } = useAuth()
  const [rows, setRows] = useState(null)
  const [counts, setCounts] = useState({})
  const [editing, setEditing] = useState(null)
  const [viewing, setViewing] = useState(null)
  const [markets, setMarkets] = useState([])
  const [challenges, setChallenges] = useState([])

  const load = useCallback(async () => {
    const [{ data: s }, { data: r }, { data: m }, { data: c }] = await Promise.all([
      supabase.from('surveys').select('*').order('created_at', { ascending: false }),
      supabase.from('survey_responses').select('survey_id, declined'),
      supabase.from('communities').select('id, name, kind').is('retired_at', null).eq('kind', 'chapter').order('name'),
      supabase.from('challenges').select('id, title, end_date').order('start_date', { ascending: false }).limit(60),
    ])
    setRows(s || [])
    const n = {}
    for (const x of r || []) {
      n[x.survey_id] = n[x.survey_id] || { answered: 0, declined: 0 }
      n[x.survey_id][x.declined ? 'declined' : 'answered'] += 1
    }
    setCounts(n)
    setMarkets(m || [])
    setChallenges(c || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function save(survey, status) {
    const problem = surveyProblem(survey)
    if (problem) { notice(problem, { title: 'Not ready yet' }); return }
    const row = { ...cleanSurvey(survey), ...(status ? { status } : null) }
    delete row.created_at
    delete row.updated_at
    const { error } = row.id
      ? await supabase.from('surveys').update(row).eq('id', row.id)
      : await supabase.from('surveys').insert({ ...row, created_by: profile?.id })
    if (error) { notice(error.message, { title: 'Could not save the survey' }); return }
    setEditing(null)
    load()
  }

  async function setStatus(survey, status) {
    if (status === 'live' && !await confirm(
      survey.mode === 'until_done'
        ? 'Send this survey out? It pops up for everyone it is for, each time they open the app, until they answer or say no.'
        : 'Send this survey out? It pops up once for everyone it is for.',
      { title: 'Go live', confirmLabel: 'Go live' },
    )) return
    const { error } = await supabase.from('surveys').update({ status }).eq('id', survey.id)
    if (error) { notice(error.message, { title: 'Could not change it' }); return }
    load()
  }

  async function remove(survey) {
    if (!await confirm(`Delete "${survey.title}" and every answer to it? This cannot be undone.`, { title: 'Delete survey', confirmLabel: 'Delete', danger: true })) return
    await supabase.from('surveys').delete().eq('id', survey.id)
    setViewing(null)
    load()
  }

  if (editing) {
    return (
      <div className="page">
        <SurveyEditor
          survey={editing}
          markets={markets}
          challenges={challenges}
          onChange={setEditing}
          onCancel={() => setEditing(null)}
          onSave={(status) => save(editing, status)}
        />
      </div>
    )
  }

  if (viewing) {
    return (
      <div className="page">
        <SurveyResults
          survey={viewing}
          onBack={() => setViewing(null)}
          onEdit={() => { setEditing(viewing); setViewing(null) }}
          onStatus={(st) => setStatus(viewing, st).then(() => setViewing((v) => ({ ...v, status: st })))}
          onDelete={() => remove(viewing)}
        />
      </div>
    )
  }

  return (
    <div className="page">
      <PageHeader
        back="/admin"
        title="Surveys"
        inlineAction
        action={(
          <button type="button" onClick={() => setEditing(blankSurvey())} className="btn-primary !py-2.5">
            <Icon name="plus" className="h-4 w-4" strokeWidth={2.4} /> New survey
          </button>
        )}
      />

      {rows === null ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-card" />)}</div>
      ) : (
        <div className="space-y-8">
          {rows.length > 0 && (
            <div className="grid gap-3 animate-fade-up">
              {rows.map((s) => {
                const c = counts[s.id] || { answered: 0, declined: 0 }
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setViewing(s)}
                    className="group flex items-center gap-4 rounded-card border border-gray-100 bg-white p-4 text-left shadow-card transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/30 hoverable:hover:shadow-lift"
                  >
                    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
                      <Icon name="chartPie" className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-semibold text-ink">{s.title}</span>
                        <span className={cx('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider', STATUS[s.status].chip)}>{STATUS[s.status].label}</span>
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-smoke">
                        {(s.questions || []).length} {(s.questions || []).length === 1 ? 'question' : 'questions'} · {audienceText(s, markets, challenges)} · {MODES.find((m) => m.key === s.mode)?.label}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-right sm:block">
                      <span className="block text-lg font-bold tabular-nums text-ink">{c.answered}</span>
                      <span className="block text-[11px] text-smoke">answered{c.declined ? ` · ${c.declined} said no` : ''}</span>
                    </span>
                    <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5" />
                  </button>
                )
              })}
            </div>
          )}

          <section className="animate-fade-up [animation-delay:80ms]">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">{rows.length ? 'Start another from' : 'Start from'}</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {SURVEY_STARTERS.map((st) => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => setEditing(fromStarter(st))}
                  className="flex flex-col gap-2 rounded-card border border-dashed border-gray-200 bg-white p-4 text-left transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/40 hoverable:hover:shadow-card"
                >
                  <span className="text-sm font-semibold text-ink">{st.title}</span>
                  <span className="text-xs leading-relaxed text-smoke">{st.intro}</span>
                  <span className="mt-auto pt-1 text-[11px] font-semibold text-brand">{st.questions.length} questions · Use this</span>
                </button>
              ))}
            </div>
            {rows.length === 0 && (
              <p className="mt-4 text-sm text-smoke">
                Surveys pop up for creators after the other app prompts, one at a time, and never over the walkthrough. Bug reports and ideas sent any time still arrive in <Link to="/admin/feedback" className="font-semibold text-brand hover:underline">Bugs &amp; Ideas</Link>.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function audienceText(s, markets, challenges) {
  if (s.audience === 'markets') return (s.community_ids || []).map((id) => markets.find((m) => m.id === id)?.name).filter(Boolean).join(', ') || 'Chosen markets'
  if (s.audience === 'challenge') return `Entrants of ${challenges.find((c) => c.id === s.challenge_id)?.title || 'a challenge'}`
  return 'Every creator'
}

// ---------------------------------------------------------------- builder ---
function SurveyEditor({ survey, markets, challenges, onChange, onCancel, onSave }) {
  const set = (patch) => onChange({ ...survey, ...patch })
  const setQ = (i, patch) => set({ questions: survey.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) })
  const move = (i, d) => {
    const qs = [...survey.questions]
    const j = i + d
    if (j < 0 || j >= qs.length) return
    ;[qs[i], qs[j]] = [qs[j], qs[i]]
    set({ questions: qs })
  }
  const [preview, setPreview] = useState(false)
  const problem = surveyProblem(survey)

  return (
    <div className="space-y-6">
      <div className="sticky top-16 z-30 -mx-1 bg-white px-1 pb-2 pt-1 sm:top-20">
        <div className="flex items-center gap-3 rounded-card border border-gray-100 bg-white px-3 py-2.5 shadow-card">
          <button type="button" onClick={onCancel} aria-label="All surveys" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cloud text-smoke transition-all hoverable:hover:-translate-y-0.5 hoverable:hover:text-brand">
            <Icon name="chevronLeft" className="h-4 w-4" />
          </button>
          <p className="min-w-0 flex-1 truncate text-[15px] font-bold text-ink">{survey.title || 'New survey'}</p>
          <button type="button" onClick={() => setPreview(true)} className="btn-secondary !px-3 !py-2 text-xs"><Icon name="eye" className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Preview</span></button>
          <button type="button" onClick={() => onSave()} className="btn-secondary !px-3 !py-2 text-xs">Save</button>
          {survey.status !== 'live' && (
            <button type="button" onClick={() => onSave('live')} disabled={!!problem} className="btn-primary !px-4 !py-2 text-xs disabled:opacity-40">Save and go live</button>
          )}
        </div>
        {problem && <p className="mt-2 px-1 text-xs font-medium text-amber-700">{problem}</p>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <section className="card space-y-3">
            <label className="block">
              <span className="label">Title</span>
              <input className="input" value={survey.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} placeholder="How is the platform working for you?" />
            </label>
            <label className="block">
              <span className="label">A line under it (optional)</span>
              <textarea className="input min-h-[4rem] resize-none" value={survey.intro || ''} maxLength={400} onChange={(e) => set({ intro: e.target.value })} placeholder="Two minutes. Every answer is read by the team." />
            </label>
            <p className="text-[11px] text-smoke">Write it in English: each creator sees it in their own language, and the wording can be corrected in Languages &gt; Briefs and content.</p>
          </section>

          {survey.questions.map((q, i) => (
            <section key={q.id} className="card space-y-3 animate-fade-up">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand text-xs font-bold text-white">{i + 1}</span>
                <Select
                  variant="chip"
                  className="w-44"
                  value={q.type}
                  onChange={(t) => setQ(i, { type: t, options: t === 'choice' || t === 'multi' ? (q.options?.length ? q.options : ['', '']) : [] })}
                  options={QUESTION_TYPES.map((t) => ({ value: t.key, label: t.label }))}
                  ariaLabel="Kind of question"
                />
                <span className="ml-auto flex items-center gap-0.5">
                  <IconBtn name="chevronUp" label="Move up" onClick={() => move(i, -1)} disabled={i === 0} />
                  <IconBtn name="chevronDown" label="Move down" onClick={() => move(i, 1)} disabled={i === survey.questions.length - 1} />
                  <IconBtn name="trash" label="Remove" danger onClick={() => set({ questions: survey.questions.filter((_, j) => j !== i) })} disabled={survey.questions.length === 1} />
                </span>
              </div>
              <input className="input" value={q.prompt} maxLength={200} onChange={(e) => setQ(i, { prompt: e.target.value })} placeholder="What do you want to ask?" />
              {(q.type === 'choice' || q.type === 'multi') && (
                <div className="space-y-2">
                  {q.options.map((o, k) => (
                    <div key={k} className="flex items-center gap-2">
                      <Icon name={q.type === 'multi' ? 'squares' : 'check'} className="h-4 w-4 shrink-0 text-gray-300" />
                      <input className="input !py-2" value={o} maxLength={80} onChange={(e) => setQ(i, { options: q.options.map((x, m) => (m === k ? e.target.value : x)) })} placeholder={`Option ${k + 1}`} />
                      <IconBtn name="close" label="Remove option" onClick={() => setQ(i, { options: q.options.filter((_, m) => m !== k) })} disabled={q.options.length <= 2} />
                    </div>
                  ))}
                  {q.options.length < 8 && (
                    <button type="button" onClick={() => setQ(i, { options: [...q.options, ''] })} className="text-xs font-semibold text-brand hover:underline">+ Add an option</button>
                  )}
                </div>
              )}
              <label className="flex cursor-pointer items-center gap-2 text-xs text-smoke">
                <input type="checkbox" checked={!!q.required} onChange={(e) => setQ(i, { required: e.target.checked })} className="h-4 w-4 accent-[#d94407]" />
                Needs an answer
              </label>
            </section>
          ))}

          <div className="flex flex-wrap gap-2">
            {QUESTION_TYPES.map((t) => (
              <button key={t.key} type="button" onClick={() => set({ questions: [...survey.questions, newQuestion(t.key)] })} className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-gray-200 px-3.5 py-2 text-xs font-semibold text-smoke transition-all hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/40 hoverable:hover:text-brand">
                <Icon name={t.icon} className="h-3.5 w-3.5" /> {t.label}
              </button>
            ))}
          </div>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-40 lg:self-start">
          <section className="card space-y-3">
            <p className="text-sm font-bold text-ink">Who it is for</p>
            {AUDIENCES.map((a) => (
              <Choice key={a.key} on={survey.audience === a.key} onClick={() => set({ audience: a.key })} label={a.label} hint={a.hint} />
            ))}
            {survey.audience === 'markets' && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {markets.map((m) => {
                  const on = survey.community_ids.includes(m.id)
                  return (
                    <button key={m.id} type="button" onClick={() => set({ community_ids: on ? survey.community_ids.filter((x) => x !== m.id) : [...survey.community_ids, m.id] })}
                      className={cx('rounded-lg border px-2.5 py-1 text-xs font-semibold transition-all', on ? 'border-brand bg-brand text-white' : 'border-gray-200 text-smoke hoverable:hover:text-ink')}>
                      {m.name}
                    </button>
                  )
                })}
              </div>
            )}
            {survey.audience === 'challenge' && (
              <Select portal variant="field" value={survey.challenge_id || ''} onChange={(v) => set({ challenge_id: v || null })} ariaLabel="Challenge"
                options={[{ value: '', label: 'Pick a challenge' }, ...challenges.map((c) => ({ value: c.id, label: c.title }))]} />
            )}
          </section>
          <section className="card space-y-3">
            <p className="text-sm font-bold text-ink">How it asks</p>
            {MODES.map((m) => (
              <Choice key={m.key} on={survey.mode === m.key} onClick={() => set({ mode: m.key })} label={m.label} hint={m.hint} />
            ))}
            <label className="flex cursor-pointer items-start gap-2.5 pt-1 text-xs text-smoke">
              <input type="checkbox" checked={survey.allow_decline} onChange={(e) => set({ allow_decline: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[#d94407]" />
              <span><span className="font-semibold text-ink">Offer &ldquo;I don&rsquo;t want to take part&rdquo;</span><br />Saying no stops it asking that person again.</span>
            </label>
          </section>
          <section className="card space-y-2">
            <p className="text-sm font-bold text-ink">Closes on (optional)</p>
            <input type="date" className="input" value={survey.ends_at ? survey.ends_at.slice(0, 10) : ''} onChange={(e) => set({ ends_at: e.target.value ? new Date(`${e.target.value}T23:59:00`).toISOString() : null })} />
            <p className="text-[11px] text-smoke">After this it stops appearing. Answers are kept.</p>
          </section>
        </aside>
      </div>

      {preview && <SurveyModal survey={cleanSurvey({ ...survey, questions: survey.questions.filter((q) => q.prompt.trim()) })} preview onDone={() => setPreview(false)} />}
    </div>
  )
}

function Choice({ on, onClick, label, hint }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cx('flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all duration-200', on ? 'border-brand bg-brand-tint/50' : 'border-gray-100 hoverable:hover:border-brand/30')}>
      <span className={cx('mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2', on ? 'border-brand' : 'border-gray-300')}>
        {on && <span className="h-2 w-2 rounded-full bg-brand" />}
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-ink">{label}</span>
        {hint && <span className="block text-[11px] leading-snug text-smoke">{hint}</span>}
      </span>
    </button>
  )
}

function IconBtn({ name, label, onClick, disabled, danger }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} aria-label={label} title={label}
      className={cx('flex h-8 w-8 items-center justify-center rounded-lg text-smoke transition-colors disabled:opacity-30', danger ? 'hoverable:hover:bg-red-50 hoverable:hover:text-red-500' : 'hoverable:hover:bg-cloud hoverable:hover:text-ink')}>
      <Icon name={name} className="h-4 w-4" />
    </button>
  )
}

// ---------------------------------------------------------------- results ---
function SurveyResults({ survey, onBack, onEdit, onStatus, onDelete }) {
  const [responses, setResponses] = useState(null)
  const [people, setPeople] = useState({})
  const [audience, setAudience] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [{ data: r }, { data: size }] = await Promise.all([
        supabase.from('survey_responses').select('*').eq('survey_id', survey.id).order('created_at', { ascending: false }),
        supabase.rpc('survey_audience_size', { p_survey: survey.id }),
      ])
      const ids = [...new Set((r || []).map((x) => x.profile_id))]
      const { data: p } = ids.length ? await supabase.from('profiles').select('id, name, photo_url, is_test').in('id', ids) : { data: [] }
      if (!alive) return
      const byId = Object.fromEntries((p || []).map((x) => [x.id, x]))
      setPeople(byId)
      setResponses((r || []).filter((x) => !byId[x.profile_id]?.is_test))
      setAudience(size ?? null)
    })()
    return () => { alive = false }
  }, [survey.id])

  const summary = useMemo(() => (responses ? summarise(survey, responses) : null), [survey, responses])
  const rate = audience ? Math.round(((summary?.answered || 0) / audience) * 100) : null

  async function status(st) { setBusy(true); await onStatus(st); setBusy(false) }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} aria-label="All surveys" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cloud text-smoke transition-all hoverable:hover:-translate-y-0.5 hoverable:hover:text-brand">
          <Icon name="chevronLeft" className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">{survey.title}</h1>
          <p className="text-xs text-smoke">Created {formatDate(survey.created_at)}{survey.ends_at ? ` · closes ${formatDate(survey.ends_at)}` : ''}</p>
        </div>
        <span className={cx('rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wider', STATUS[survey.status].chip)}>{STATUS[survey.status].label}</span>
        <button type="button" onClick={onEdit} className="btn-secondary !py-2 text-xs"><Icon name="pencil" className="h-3.5 w-3.5" /> Edit</button>
        {survey.status === 'live'
          ? <button type="button" disabled={busy} onClick={() => status('closed')} className="btn-secondary !py-2 text-xs">Close it</button>
          : <button type="button" disabled={busy} onClick={() => status('live')} className="btn-primary !py-2 text-xs">{survey.status === 'closed' ? 'Reopen' : 'Go live'}</button>}
        <button type="button" onClick={onDelete} aria-label="Delete" className="flex h-9 w-9 items-center justify-center rounded-lg text-smoke transition-colors hoverable:hover:bg-red-50 hoverable:hover:text-red-500"><Icon name="trash" className="h-4 w-4" /></button>
      </div>

      {!summary ? <Skeleton className="h-64 w-full rounded-card" /> : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Answered" value={summary.answered} />
            <Stat label="Said no" value={summary.declined} />
            <Stat label="Asked" value={audience ?? '-'} />
            <Stat label="Response rate" value={rate == null ? '-' : `${rate}%`} />
          </div>
          {rate != null && (
            <div className="h-2.5 overflow-hidden rounded-full bg-cloud">
              <div className="kpi-fill h-full rounded-full bg-gradient-to-r from-brand-light to-brand" style={{ width: `${Math.min(100, rate)}%` }} />
            </div>
          )}

          {summary.answered === 0 ? (
            <EmptyState icon={<Icon name="chartPie" className="h-7 w-7" />} title="No answers yet" hint={survey.status === 'live' ? 'Answers appear here as they arrive.' : 'Put it live to start collecting answers.'} />
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {summary.questions.map((q, i) => (
                <section key={q.id} className="card animate-fade-up" style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
                  <p className="text-sm font-semibold text-ink"><span className="mr-1.5 text-brand">{i + 1}.</span>{q.prompt}</p>
                  <p className="mt-0.5 text-[11px] text-smoke">{q.n} {q.n === 1 ? 'answer' : 'answers'}</p>
                  <div className="mt-4">
                    {q.type === 'rating' && <RatingResult q={q} />}
                    {(q.type === 'choice' || q.type === 'multi') && <ChoiceResult q={q} />}
                    {q.type === 'text' && <TextResult q={q} people={people} />}
                  </div>
                </section>
              ))}
            </div>
          )}
        </>
      )}
      {busy && <Spinner className="h-4 w-4" />}
    </div>
  )
}

function Stat({ label, value }) {
  return (
    <div className="rounded-card border border-gray-100 bg-white px-4 py-3 shadow-card">
      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-ink">{value}</p>
    </div>
  )
}

function RatingResult({ q }) {
  const max = Math.max(1, ...q.spread)
  return (
    <div className="flex items-end gap-5">
      <div>
        <p className="text-4xl font-bold tabular-nums text-ink">{q.average == null ? '-' : q.average.toFixed(1)}</p>
        <p className="mt-1 flex gap-0.5 text-brand">
          {[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" className={cx('h-3.5 w-3.5', q.average != null && q.average >= n - 0.25 ? 'opacity-100' : 'opacity-25')} />)}
        </p>
      </div>
      <div className="flex h-24 flex-1 items-end gap-2">
        {q.spread.map((c, k) => (
          <div key={k} className="flex flex-1 flex-col items-center gap-1">
            <span className="text-[10px] font-bold tabular-nums text-smoke">{c || ''}</span>
            <div className="w-full rounded-t-md bg-gradient-to-t from-brand to-brand-light kpi-fill" style={{ height: `${Math.max(4, (c / max) * 64)}px`, opacity: c ? 1 : 0.2 }} />
            <span className="text-[10px] font-semibold text-gray-400">{k + 1}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ChoiceResult({ q }) {
  const total = Math.max(1, q.n)
  const top = Math.max(0, ...q.counts.map((c) => c.count))
  return (
    <div className="space-y-2.5">
      {q.counts.map((c) => {
        const pct = Math.round((c.count / total) * 100)
        return (
          <div key={c.option}>
            <div className="mb-1 flex items-baseline justify-between gap-2 text-[13px]">
              <span className={cx('truncate', c.count === top && top > 0 ? 'font-semibold text-ink' : 'text-smoke')}>{c.option}</span>
              <span className="shrink-0 tabular-nums text-smoke"><strong className="text-ink">{c.count}</strong> · {pct}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-cloud">
              <div className={cx('kpi-fill h-full rounded-full', c.count === top && top > 0 ? 'bg-gradient-to-r from-brand-light to-brand' : 'bg-[#fbc9a6]')} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )
      })}
      {q.type === 'multi' && <p className="text-[11px] text-gray-400">People could pick more than one, so this adds up to more than 100%.</p>}
    </div>
  )
}

function TextResult({ q, people }) {
  const [all, setAll] = useState(false)
  const shown = all ? q.answers : q.answers.slice(0, 5)
  return (
    <div>
      <ul className="max-h-80 space-y-2 overflow-y-auto overscroll-contain pr-1">
        {shown.map((a, k) => {
          const p = people[a.profile_id]
          return (
            <li key={k} className="rounded-xl bg-cloud/60 px-3 py-2.5">
              <p className="whitespace-pre-wrap text-sm text-ink">{a.text}</p>
              {p && (
                <Link to={`/profile/${p.id}`} className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium text-smoke hover:text-brand">
                  <Avatar src={p.photo_url} name={p.name} size="xs" /> {p.name}
                </Link>
              )}
            </li>
          )
        })}
      </ul>
      {q.answers.length > 5 && (
        <button type="button" onClick={() => setAll((x) => !x)} className="mt-2 text-xs font-semibold text-brand hover:underline">
          {all ? 'Show fewer' : `Show all ${q.answers.length}`}
        </button>
      )}
    </div>
  )
}
