import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Avatar, EmptyState, PageHeader, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import { SurveyCard } from '../../components/SurveyHost'
import { CHART, FILL, axisTickSmall, tooltipStyle } from '../../components/charts/chartTheme'
import { confirm, notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { cx, downloadCsv, formatDate } from '../../lib/utils'
import { useT } from '../../lib/i18n'
import {
  AUDIENCES, QUESTION_TYPES, SURVEY_STARTERS, TIMINGS, blankSurvey, cleanSurvey, fromStarter, hasOptions, newQuestion,
  responsesByDay, summarise, surveyProblem,
} from '../../lib/surveys'

// SURVEYS (30 Sep 2026, migration 291; rebuilt 1 Oct 2026, migration 293).
//
// Ethan, on the first version: "It seems a bit crowded and hard to understand ... When I scroll on
// the right column, it scrolls the left ... whenever I click on the rating, that dropdown is hidden
// behind the next card ... I don't know why 'Pick a challenge' is an option ... There should be a
// really nice page ... where we actually view the results. We can see charts of it, view everyone
// that the creator actually submitted".
//
// Three screens in one page:
//   THE LIST      every survey with its answers so far, and templates to start from.
//   THE BUILDER   four numbered steps on the left (the words, the questions, who, when) and, on the
//                 right, the creator's own card on a phone - live, as you type. Each column scrolls on
//                 its own. Question kinds are buttons, not a dropdown, so nothing can hide behind the
//                 next card. A challenge is picked from a list of challenges, not a menu with a
//                 "pick a challenge" row in it.
//   THE RESULTS   the headline numbers, answers coming in over time, a chart per question, and every
//                 response, person by person, with delete (for tests) and a CSV export.
// A survey never closes on a date: it keeps asking until each creator answers or says no. "Stop
// asking" on the results page takes it down without losing a single answer.
const STATUS = {
  draft: { label: 'Draft', chip: 'bg-cloud text-gray-500' },
  live: { label: 'Live', chip: 'bg-emerald-50 text-emerald-600' },
  closed: { label: 'Stopped', chip: 'bg-gray-100 text-smoke' },
}

export default function AdminSurveys() {
  const tr = useT()
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
      supabase.from('challenges').select('id, title, start_date, end_date, status').neq('status', 'draft').order('start_date', { ascending: false }).limit(40),
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
    if (problem) { notice(problem, { title: tr('Not ready yet') }); return }
    if (status === 'live' && !await confirm(
      tr('Send this survey out? It appears for everyone it is for, each time they open the app, until they answer or say no.'),
      { title: tr('Go live'), confirmLabel: tr('Go live') },
    )) return
    const row = { ...cleanSurvey(survey), ...(status ? { status } : null) }
    delete row.created_at
    delete row.updated_at
    const { data, error } = row.id
      ? await supabase.from('surveys').update(row).eq('id', row.id).select().single()
      : await supabase.from('surveys').insert({ ...row, created_by: profile?.id }).select().single()
    if (error) { notice(error.message, { title: tr('Could not save the survey') }); return }
    toastSuccess(status === 'live' ? tr('Live. Creators see it the next time they open the app.') : tr('Saved'))
    setEditing(null)
    await load()
    if (data) setViewing(data)
  }

  async function setStatus(survey, status) {
    if (status === 'live' && !await confirm(
      tr('Send this survey out? It appears for everyone it is for, each time they open the app, until they answer or say no.'),
      { title: tr('Go live'), confirmLabel: tr('Go live') },
    )) return false
    const { error } = await supabase.from('surveys').update({ status }).eq('id', survey.id)
    if (error) { notice(error.message, { title: tr('Could not change it') }); return false }
    load()
    return true
  }

  async function remove(survey) {
    if (!await confirm(tr('Delete "{title}" and every answer to it? This cannot be undone.', { title: survey.title }), { title: tr('Delete survey'), confirmLabel: tr('Delete'), danger: true })) return
    await supabase.from('surveys').delete().eq('id', survey.id)
    setViewing(null)
    load()
  }

  if (editing) {
    return (
      <div className="page !max-w-[1400px]">
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
          key={viewing.id}
          survey={viewing}
          markets={markets}
          challenges={challenges}
          onBack={() => setViewing(null)}
          onEdit={() => { setEditing(viewing); setViewing(null) }}
          onStatus={async (st) => { if (await setStatus(viewing, st)) setViewing((v) => ({ ...v, status: st })) }}
          onDelete={() => remove(viewing)}
        />
      </div>
    )
  }

  const liveCount = (rows || []).filter((s) => s.status === 'live' && !s.is_test).length
  const answeredAll = Object.values(counts).reduce((a, c) => a + c.answered, 0)

  return (
    <div className="page">
      <PageHeader
        back="/admin"
        title={tr('Surveys')}
        inlineAction
        action={(
          <button type="button" onClick={() => setEditing(blankSurvey())} className="btn-primary !py-2.5 transition-transform duration-200 hoverable:hover:scale-[1.03]">
            <Icon name="plus" className="h-4 w-4" strokeWidth={2.4} /> {tr('New survey')}
          </button>
        )}
      />

      {rows === null ? (
        <div className="space-y-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-24 w-full rounded-card" />)}</div>
      ) : (
        <div className="space-y-9">
          {rows.length > 0 && (
            <div className="grid grid-cols-3 gap-3 animate-fade-up">
              <MiniStat label={tr('Surveys')} value={rows.length} />
              <MiniStat label={tr('Live now')} value={liveCount} accent={liveCount > 0} />
              <MiniStat label={tr('Answers in')} value={answeredAll} />
            </div>
          )}

          {rows.length > 0 && (
            <div className="grid gap-3">
              {rows.map((s, i) => {
                const c = counts[s.id] || { answered: 0, declined: 0 }
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setViewing(s)}
                    style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}
                    className="animate-fade-up group flex items-center gap-4 rounded-card border border-gray-100 bg-white p-4 text-left shadow-card transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/30 hoverable:hover:shadow-lift"
                  >
                    <span className={cx('flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-card', s.is_test ? 'bg-gray-400' : 'brand-drift')}>
                      <Icon name="chartPie" className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-semibold text-ink">{s.title}</span>
                        <span className={cx('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider', STATUS[s.status].chip)}>{tr(STATUS[s.status].label)}</span>
                        {s.is_test && <span className="shrink-0 rounded-md bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-700">{tr('Test')}</span>}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-smoke">
                        {(s.questions || []).length === 1 ? tr('1 question') : tr('{n} questions', { n: (s.questions || []).length })} · {audienceText(s, markets, challenges, tr)}
                      </span>
                    </span>
                    <span className="hidden shrink-0 text-right sm:block">
                      <span className="block text-xl font-bold tabular-nums text-ink">{c.answered}</span>
                      <span className="block text-[11px] text-smoke">{tr('answered')}{c.declined ? ` · ${tr('{n} said no', { n: c.declined })}` : ''}</span>
                    </span>
                    <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-brand" />
                  </button>
                )
              })}
            </div>
          )}

          <section className="animate-fade-up [animation-delay:80ms]">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Start from a template')}</h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {SURVEY_STARTERS.map((st, i) => (
                <button
                  key={st.key}
                  type="button"
                  onClick={() => setEditing(fromStarter(st))}
                  style={{ animationDelay: `${120 + i * 40}ms` }}
                  className="animate-fade-up group flex flex-col gap-2.5 rounded-card border border-gray-100 bg-white p-4 text-left shadow-card transition-all duration-200 hoverable:hover:-translate-y-1 hoverable:hover:border-brand/30 hoverable:hover:shadow-lift"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-cloud text-brand transition-colors group-hover:bg-brand group-hover:text-white"><Icon name={st.icon} className="h-4 w-4" /></span>
                    <span className="min-w-0 flex-1 text-sm font-semibold leading-snug text-ink">{tr(st.title)}</span>
                  </span>
                  <span className="text-xs leading-relaxed text-smoke">{tr(st.intro)}</span>
                  <span className="mt-auto flex flex-wrap gap-1 pt-1">
                    {st.questions.map((q, k) => (
                      <span key={k} className="inline-flex items-center gap-1 rounded-md bg-cloud px-1.5 py-0.5 text-[10px] font-semibold text-smoke">
                        <Icon name={QUESTION_TYPES.find((t) => t.key === q.type)?.icon} className="h-3 w-3" />
                        {tr(QUESTION_TYPES.find((t) => t.key === q.type)?.label)}
                      </span>
                    ))}
                  </span>
                  {st.audience === 'challenge' && <span className="text-[11px] font-semibold text-brand">{tr('Shown when a challenge ends')}</span>}
                </button>
              ))}
            </div>
            {rows.length === 0 && (
              <p className="mt-4 text-sm text-smoke">
                {tr('Surveys appear for creators after the other app prompts, one at a time, and never over the walkthrough.')}{' '}
                <Link to="/admin/feedback" className="font-semibold text-brand hover:underline">{tr('Bugs and ideas')}</Link>
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value, accent }) {
  return (
    <div className="rounded-card border border-gray-100 bg-white px-4 py-3 shadow-card">
      <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400">{label}</p>
      <p className={cx('mt-1 text-2xl font-bold tabular-nums', accent ? 'text-brand' : 'text-ink')}>{value}</p>
    </div>
  )
}

function audienceText(s, markets, challenges, tr) {
  if (s.audience === 'markets') return (s.community_ids || []).map((id) => tr(markets.find((m) => m.id === id)?.name || '')).filter(Boolean).join(', ') || tr('Chosen markets')
  if (s.audience === 'challenge') return tr('Entrants of {c}', { c: challenges.find((c) => c.id === s.challenge_id)?.title || tr('a challenge') })
  return tr('Every creator')
}

// ---------------------------------------------------------------- builder ---
function SurveyEditor({ survey, markets, challenges, onChange, onCancel, onSave }) {
  const tr = useT()
  const set = (patch) => onChange({ ...survey, ...patch })
  const setQ = (i, patch) => set({ questions: survey.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) })
  const move = (i, d) => {
    const qs = [...survey.questions]
    const j = i + d
    if (j < 0 || j >= qs.length) return
    ;[qs[i], qs[j]] = [qs[j], qs[i]]
    set({ questions: qs })
  }
  const duplicate = (i) => {
    const qs = [...survey.questions]
    qs.splice(i + 1, 0, { ...qs[i], id: newQuestion(qs[i].type).id, options: [...(qs[i].options || [])] })
    set({ questions: qs })
  }
  const [previewStage, setPreviewStage] = useState('intro')
  const [openQ, setOpenQ] = useState(survey.questions[0]?.id || null)
  const problem = surveyProblem(survey)
  // The question being edited is the one the phone shows (counting only worded questions).
  const openIdx = Math.max(0, survey.questions.filter((q) => q.prompt.trim()).findIndex((q) => q.id === openQ))
  // The preview is the stored shape (trimmed, empty options dropped), with unworded questions left out.
  const previewSurvey = useMemo(() => {
    const c = cleanSurvey({ ...survey, title: survey.title || tr('Your survey title'), questions: survey.questions.filter((q) => q.prompt.trim()) })
    return c
  }, [survey, tr])

  // A challenge survey starts on the challenge that ended most recently (or the one running now).
  useEffect(() => {
    if (survey.audience === 'challenge' && !survey.challenge_id && challenges[0]) set({ challenge_id: challenges[0].id })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [survey.audience, challenges])

  return (
    <div className="flex flex-col gap-4 lg:h-[calc(100dvh-9rem)]">
      {/* ---------- the bar: never scrolls, says what you are editing ---------- */}
      <div className="flex shrink-0 flex-wrap items-center gap-3 rounded-card border border-gray-100 bg-white px-3 py-2.5 shadow-card">
        <button type="button" onClick={onCancel} aria-label={tr('All surveys')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cloud text-smoke transition-all hoverable:hover:-translate-x-0.5 hoverable:hover:text-brand">
          <Icon name="chevronLeft" className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-bold uppercase tracking-wide text-gray-400">{survey.id ? tr('Editing survey') : tr('New survey')}</p>
          <p className="truncate text-[15px] font-bold text-ink">{survey.title || tr('Untitled survey')}</p>
        </div>
        <span className={cx('hidden rounded-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider sm:inline', STATUS[survey.status || 'draft'].chip)}>{tr(STATUS[survey.status || 'draft'].label)}</span>
        <button type="button" onClick={() => onSave()} className="btn-secondary !px-3.5 !py-2 text-xs">{tr('Save draft')}</button>
        {survey.status !== 'live' && !survey.is_test && (
          <button type="button" onClick={() => onSave('live')} disabled={!!problem} className="btn-primary !px-4 !py-2 text-xs transition-transform duration-200 disabled:opacity-40 hoverable:enabled:hover:scale-[1.03]">
            <Icon name="plane" className="h-3.5 w-3.5" /> {tr('Go live')}
          </button>
        )}
      </div>
      {problem && <p className="-mt-2 shrink-0 px-1 text-xs font-medium text-amber-700">{problem}</p>}

      <div className="grid min-h-0 flex-1 gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* ---------- left: the steps, scrolling on their own ---------- */}
        <div className="min-h-0 space-y-4 lg:overflow-y-auto lg:overscroll-contain lg:pb-10 lg:pr-2">
          <Step n={1} title={tr('The words')} hint={tr('Write it in English. Each creator reads it in their own language.')}>
            <Field label={tr('Title')}>
              <input className="input text-[15px] font-semibold" value={survey.title} maxLength={120} onChange={(e) => set({ title: e.target.value })} onFocus={() => setPreviewStage('intro')} placeholder={tr('How is the platform working for you?')} />
            </Field>
            <Field label={tr('A line under it')} optional>
              <textarea className="input min-h-[3.5rem] resize-none" value={survey.intro || ''} maxLength={400} onChange={(e) => set({ intro: e.target.value })} onFocus={() => setPreviewStage('intro')} placeholder={tr('Two minutes. Every answer is read by the team.')} />
            </Field>
            <Field label={tr('Thank-you message')} optional>
              <input className="input" value={survey.thanks || ''} maxLength={200} onChange={(e) => set({ thanks: e.target.value })} onFocus={() => setPreviewStage('sent')} placeholder={tr('Your answers are with the team. Every one is read.')} />
            </Field>
          </Step>

          <Step n={2} title={tr('The questions')} hint={tr('{n} so far. Press one to edit it.', { n: survey.questions.length })}>
            <div className="space-y-2.5">
              {survey.questions.map((q, i) => (
                <QuestionEditor
                  key={q.id}
                  q={q}
                  i={i}
                  total={survey.questions.length}
                  open={openQ === q.id}
                  onOpen={() => { setOpenQ(openQ === q.id ? null : q.id); setPreviewStage('questions') }}
                  onChange={(patch) => setQ(i, patch)}
                  onMove={(d) => move(i, d)}
                  onDuplicate={() => duplicate(i)}
                  onRemove={() => set({ questions: survey.questions.filter((_, j) => j !== i) })}
                />
              ))}
            </div>
            <div className="mt-3 rounded-xl border border-dashed border-gray-200 p-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Add a question')}</p>
              <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                {QUESTION_TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => { const nq = newQuestion(t.key); set({ questions: [...survey.questions, nq] }); setOpenQ(nq.id); setPreviewStage('questions') }}
                    className="group flex items-center gap-2 rounded-lg bg-cloud/70 px-2.5 py-2 text-left transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:bg-brand hoverable:hover:text-white"
                  >
                    <Icon name={t.icon} className="h-4 w-4 shrink-0 text-brand transition-colors group-hover:text-white" />
                    <span className="min-w-0">
                      <span className="block text-[12.5px] font-semibold leading-tight">{tr(t.label)}</span>
                      <span className="block truncate text-[10.5px] text-smoke transition-colors group-hover:text-white/80">{tr(t.hint)}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </Step>

          <Step n={3} title={tr('Who sees it')}>
            <div className="grid gap-2 sm:grid-cols-3">
              {AUDIENCES.map((a) => (
                <OptionCard key={a.key} on={survey.audience === a.key} onClick={() => set({ audience: a.key })} icon={a.icon} label={tr(a.label)} hint={tr(a.hint)} />
              ))}
            </div>
            {survey.audience === 'markets' && (
              <div className="mt-3 flex flex-wrap gap-1.5 animate-fade-up">
                {markets.map((m) => {
                  const on = survey.community_ids.includes(m.id)
                  return (
                    <button key={m.id} type="button" onClick={() => set({ community_ids: on ? survey.community_ids.filter((x) => x !== m.id) : [...survey.community_ids, m.id] })}
                      className={cx('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200', on ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hoverable:hover:-translate-y-0.5 hoverable:hover:text-ink')}>
                      {on && <Icon name="check" className="h-3 w-3" strokeWidth={3} />}
                      {tr(m.name)}
                    </button>
                  )
                })}
              </div>
            )}
            {survey.audience === 'challenge' && (
              <div className="mt-3 animate-fade-up">
                <p className="mb-2 text-xs text-smoke">{tr('It appears for everyone who entered, once the challenge has ended - never while it is running.')}</p>
                <div className="max-h-64 space-y-1.5 overflow-y-auto overscroll-contain pr-1">
                  {challenges.map((c) => {
                    const on = survey.challenge_id === c.id
                    const ended = c.end_date && new Date(c.end_date) < new Date()
                    return (
                      <button key={c.id} type="button" onClick={() => set({ challenge_id: c.id })}
                        className={cx('flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all duration-200', on ? 'bg-brand text-white shadow-card' : 'bg-cloud/60 hoverable:hover:bg-cloud')}>
                        <Icon name="flag" className={cx('h-4 w-4 shrink-0', on ? 'text-white' : 'text-brand')} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-semibold">{c.title}</span>
                          <span className={cx('block text-[11px]', on ? 'text-white/80' : 'text-smoke')}>
                            {c.start_date ? formatDate(c.start_date) : ''}{c.end_date ? ` → ${formatDate(c.end_date)}` : ''}
                          </span>
                        </span>
                        <span className={cx('shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide', on ? 'bg-white/20 text-white' : ended ? 'bg-gray-100 text-smoke' : 'bg-emerald-50 text-emerald-600')}>
                          {ended ? tr('Ended') : tr('Running')}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            )}
          </Step>

          <Step n={4} title={tr('When it appears')} hint={tr('It keeps coming back each time they open the app until they answer or say no.')}>
            {survey.audience === 'challenge' ? (
              <div className="flex items-center gap-3 rounded-xl bg-cloud/70 px-3.5 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand text-white"><Icon name="flag" className="h-4 w-4" /></span>
                <p className="text-[13px] font-semibold text-ink">{tr('When the challenge ends')}</p>
              </div>
            ) : (
              <>
                <div className="grid gap-2 sm:grid-cols-3">
                  {TIMINGS.map((t) => (
                    <OptionCard key={t.key} on={(survey.timing || 'now') === t.key} onClick={() => set({ timing: t.key })} icon={t.icon} label={tr(t.label)} hint={tr(t.hint)} />
                  ))}
                </div>
                {survey.timing === 'date' && (
                  <input type="date" className="input mt-3 max-w-[14rem] animate-fade-up" value={survey.starts_at ? survey.starts_at.slice(0, 10) : ''} onChange={(e) => set({ starts_at: e.target.value ? new Date(`${e.target.value}T09:00:00`).toISOString() : null })} />
                )}
              </>
            )}
          </Step>
        </div>

        {/* ---------- right: the creator's card, on a phone, live ---------- */}
        <aside className="min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:pb-10">
          <div className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
            <div className="mb-3 flex items-center justify-between gap-2">
              <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400"><Icon name="eye" className="h-3.5 w-3.5" />{tr('What creators see')}</p>
            </div>
            <div className="mb-4 grid grid-cols-4 gap-1 rounded-xl bg-cloud p-1 text-[11.5px] font-semibold">
              {[['intro', tr('Opening')], ['questions', tr('Questions')], ['decline', tr('Saying no')], ['sent', tr('Thank you')]].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setPreviewStage(k)} className={cx('rounded-lg px-1 py-1.5 transition-all duration-200', previewStage === k ? 'bg-white text-ink shadow-card' : 'text-smoke hoverable:hover:text-ink')}>{label}</button>
              ))}
            </div>
            <div className="mx-auto max-w-[340px] rounded-[36px] border-[6px] border-ink bg-[#f3f3f5] p-2 shadow-lift">
              <div className="flex min-h-[520px] flex-col justify-end overflow-hidden rounded-[28px] bg-ink/40 pt-16">
                {previewSurvey.questions.length === 0 ? (
                  <p className="m-4 rounded-2xl bg-white p-5 text-center text-sm text-smoke">{tr('Word a question to see it here.')}</p>
                ) : (
                  <SurveyCard key={`${previewStage}:${openIdx}`} survey={previewSurvey} preview stage={previewStage} at={openIdx} name="Sam" className="!rounded-t-[24px] !rounded-b-none" onDone={() => setPreviewStage('intro')} />
                )}
              </div>
            </div>
            <p className="mt-3 text-center text-[11px] leading-relaxed text-smoke">{tr('Each creator sees their own first name, in their own language. Closing it means "later": it comes back next time.')}</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function Step({ n, title, hint, children }) {
  return (
    <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card sm:p-5 animate-fade-up" style={{ animationDelay: `${(n - 1) * 50}ms` }}>
      <div className="mb-4 flex items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-bold text-white">{n}</span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold leading-7 text-ink">{title}</h2>
          {hint && <p className="text-xs text-smoke">{hint}</p>}
        </div>
      </div>
      <div className="space-y-3">{children}</div>
    </section>
  )
}

function Field({ label, optional, children }) {
  const tr = useT()
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12px] font-semibold text-ink">{label}{optional && <span className="ml-1 font-normal text-gray-400">({tr('optional')})</span>}</span>
      {children}
    </label>
  )
}

function OptionCard({ on, onClick, icon, label, hint }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cx('flex h-full flex-col gap-1.5 rounded-xl p-3 text-left transition-all duration-200', on ? 'bg-brand text-white shadow-card' : 'bg-cloud/60 text-ink hoverable:hover:-translate-y-0.5 hoverable:hover:bg-cloud')}>
      <Icon name={icon} className={cx('h-4 w-4', on ? 'text-white' : 'text-brand')} />
      <span className="text-[13px] font-semibold leading-tight">{label}</span>
      <span className={cx('text-[11px] leading-snug', on ? 'text-white/80' : 'text-smoke')}>{hint}</span>
    </button>
  )
}

function QuestionEditor({ q, i, total, open, onOpen, onChange, onMove, onDuplicate, onRemove }) {
  const tr = useT()
  const type = QUESTION_TYPES.find((t) => t.key === q.type)
  return (
    <div className={cx('overflow-hidden rounded-xl border transition-all duration-200', open ? 'border-brand/40 shadow-card' : 'border-gray-100')}>
      <button type="button" onClick={onOpen} className={cx('flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors', open ? 'bg-white' : 'bg-cloud/40 hoverable:hover:bg-cloud')}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand text-xs font-bold text-white">{i + 1}</span>
        <span className="min-w-0 flex-1">
          <span className={cx('block truncate text-[13px] font-semibold', q.prompt ? 'text-ink' : 'text-gray-400')}>{q.prompt || tr('Unworded question')}</span>
          <span className="flex items-center gap-1 text-[11px] text-smoke"><Icon name={type?.icon} className="h-3 w-3" />{tr(type?.label)}{q.required ? '' : ` · ${tr('optional')}`}</span>
        </span>
        <Icon name="chevronDown" className={cx('h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-3 border-t border-gray-100 bg-white p-3 animate-fade-up">
          {/* THE KIND IS A ROW OF BUTTONS, NOT A DROPDOWN (1 Oct 2026): the old menu opened behind the
              next card and could not be scrolled. */}
          <div className="flex flex-wrap gap-1">
            {QUESTION_TYPES.map((t) => (
              <button key={t.key} type="button" onClick={() => onChange({ type: t.key, options: hasOptions(t.key) ? (q.options?.length ? q.options : ['', '']) : [] })}
                className={cx('inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold transition-all duration-150', q.type === t.key ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hoverable:hover:text-ink')}>
                <Icon name={t.icon} className="h-3.5 w-3.5" />{tr(t.label)}
              </button>
            ))}
          </div>
          <input className="input font-semibold" value={q.prompt} maxLength={200} onChange={(e) => onChange({ prompt: e.target.value })} placeholder={tr('What do you want to ask?')} autoFocus={!q.prompt} />
          <input className="input !py-2 text-[13px]" value={q.help || ''} maxLength={160} onChange={(e) => onChange({ help: e.target.value })} placeholder={tr('A hint under the question (optional)')} />
          {hasOptions(q.type) && (
            <div className="space-y-1.5">
              {q.options.map((o, k) => (
                <div key={k} className="flex items-center gap-2">
                  <span className={cx('h-4 w-4 shrink-0 border-2 border-gray-300', q.type === 'multi' ? 'rounded' : 'rounded-full')} />
                  <input className="input !py-2 text-[13px]" value={o} maxLength={80} onChange={(e) => onChange({ options: q.options.map((x, m) => (m === k ? e.target.value : x)) })} placeholder={tr('Option {n}', { n: k + 1 })} />
                  <IconBtn name="close" label={tr('Remove option')} onClick={() => onChange({ options: q.options.filter((_, m) => m !== k) })} disabled={q.options.length <= 2} />
                </div>
              ))}
              {q.options.length < 8 && (
                <button type="button" onClick={() => onChange({ options: [...q.options, ''] })} className="ml-6 text-xs font-semibold text-brand hover:underline">+ {tr('Add an option')}</button>
              )}
            </div>
          )}
          <div className="flex items-center justify-between gap-2 border-t border-gray-100 pt-2.5">
            <button type="button" role="switch" aria-checked={!!q.required} onClick={() => onChange({ required: !q.required })} className="flex items-center gap-2 text-xs font-semibold text-ink">
              <span className={cx('relative h-5 w-9 rounded-full transition-colors duration-200', q.required ? 'bg-brand' : 'bg-gray-200')}>
                <span className={cx('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all duration-200', q.required ? 'left-[18px]' : 'left-0.5')} />
              </span>
              {tr('Needs an answer')}
            </button>
            <span className="flex items-center gap-0.5">
              <IconBtn name="chevronUp" label={tr('Move up')} onClick={() => onMove(-1)} disabled={i === 0} />
              <IconBtn name="chevronDown" label={tr('Move down')} onClick={() => onMove(1)} disabled={i === total - 1} />
              <IconBtn name="copy" label={tr('Duplicate')} onClick={onDuplicate} />
              <IconBtn name="trash" label={tr('Remove')} danger onClick={onRemove} disabled={total === 1} />
            </span>
          </div>
        </div>
      )}
    </div>
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
function SurveyResults({ survey, markets, challenges, onBack, onEdit, onStatus, onDelete }) {
  const tr = useT()
  const [responses, setResponses] = useState(null)
  const [people, setPeople] = useState({})
  const [audience, setAudience] = useState(null)
  const [busy, setBusy] = useState(false)
  const [tab, setTab] = useState('charts')
  const [tick, setTick] = useState(0)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const [{ data: r }, { data: size }] = await Promise.all([
        supabase.from('survey_responses').select('*').eq('survey_id', survey.id).order('created_at', { ascending: false }),
        supabase.rpc('survey_audience_size', { p_survey: survey.id }),
      ])
      const ids = [...new Set((r || []).map((x) => x.profile_id).filter(Boolean))]
      const { data: p } = ids.length
        ? await supabase.from('profiles').select('id, name, photo_url, is_test, community_members(communities(name, kind))').in('id', ids)
        : { data: [] }
      if (!alive) return
      const byId = Object.fromEntries((p || []).map((x) => [x.id, x]))
      setPeople(byId)
      // Test accounts are left out of a real survey; on a test survey everything counts.
      setResponses((r || []).filter((x) => survey.is_test || !byId[x.profile_id]?.is_test))
      setAudience(survey.is_test ? (r || []).length : size ?? null)
    })()
    return () => { alive = false }
  }, [survey.id, survey.is_test, tick])

  // New answers appear as they land.
  useEffect(() => {
    const ch = supabase.channel(`survey-${survey.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'survey_responses', filter: `survey_id=eq.${survey.id}` }, () => setTick((n) => n + 1))
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [survey.id])

  const summary = useMemo(() => (responses ? summarise(survey, responses) : null), [survey, responses])
  const byDay = useMemo(() => responsesByDay(responses), [responses])
  const rate = audience ? Math.round(((summary?.answered || 0) / audience) * 100) : null

  const who = useCallback((r) => {
    if (!r.profile_id) return { name: r.sample_name || tr('Sample'), market: r.sample_market || '', photo: null, sample: true }
    const p = people[r.profile_id]
    const market = (p?.community_members || []).map((m) => m.communities).find((c) => c?.kind === 'chapter')?.name || ''
    return { id: p?.id, name: p?.name || tr('Someone'), market, photo: p?.photo_url }
  }, [people, tr])

  async function status(st) { setBusy(true); await onStatus(st); setBusy(false) }
  async function removeResponse(r) {
    if (!await confirm(tr('Delete this response? This cannot be undone.'), { title: tr('Delete response'), confirmLabel: tr('Delete'), danger: true })) return
    const { error } = await supabase.from('survey_responses').delete().eq('id', r.id)
    if (error) { notice(error.message); return }
    setResponses((list) => list.filter((x) => x.id !== r.id))
  }
  function exportCsv() {
    const qs = survey.questions || []
    downloadCsv(`${survey.title.replace(/[^\w]+/g, '-').toLowerCase()}.csv`, (responses || []).map((r) => {
      const w = who(r)
      const row = { Name: w.name, Market: w.market, Date: String(r.created_at || '').slice(0, 10), Status: r.declined ? 'Said no' : 'Answered' }
      for (const q of qs) { const v = r.answers?.[q.id]; row[q.prompt] = Array.isArray(v) ? v.join('; ') : v ?? '' }
      return row
    }))
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={onBack} aria-label={tr('All surveys')} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cloud text-smoke transition-all hoverable:hover:-translate-x-0.5 hoverable:hover:text-brand">
          <Icon name="chevronLeft" className="h-4 w-4" />
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold tracking-tight">{survey.title}</h1>
          <p className="text-xs text-smoke">{audienceText(survey, markets, challenges, tr)} · {tr('Created {d}', { d: formatDate(survey.created_at) })}</p>
        </div>
        <span className={cx('rounded-md px-2 py-1 text-[11px] font-bold uppercase tracking-wider', STATUS[survey.status].chip)}>{tr(STATUS[survey.status].label)}</span>
        <button type="button" onClick={onEdit} className="btn-secondary !py-2 text-xs"><Icon name="pencil" className="h-3.5 w-3.5" /> {tr('Edit')}</button>
        {!survey.is_test && (survey.status === 'live'
          ? <button type="button" disabled={busy} onClick={() => status('closed')} className="btn-secondary !py-2 text-xs">{tr('Stop asking')}</button>
          : <button type="button" disabled={busy} onClick={() => status('live')} className="btn-primary !py-2 text-xs">{tr('Go live')}</button>)}
        <button type="button" onClick={onDelete} aria-label={tr('Delete')} title={tr('Delete')} className="flex h-9 w-9 items-center justify-center rounded-lg text-smoke transition-colors hoverable:hover:bg-red-50 hoverable:hover:text-red-500"><Icon name="trash" className="h-4 w-4" /></button>
      </div>

      {survey.is_test && (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-amber-100 bg-amber-50/70 px-4 py-3 animate-fade-up">
          <Icon name="alert" className="h-5 w-5 shrink-0 text-amber-600" />
          <p className="min-w-0 flex-1 text-sm text-amber-800">{tr('This is a test survey with sample answers from made-up people. It is never shown to creators.')}</p>
          <button type="button" onClick={onDelete} className="btn-secondary !py-1.5 text-xs">{tr('Delete test survey')}</button>
        </div>
      )}

      {!summary ? <Skeleton className="h-64 w-full rounded-card" /> : (
        <>
          {/* ---------- the headline ---------- */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div className="brand-drift relative overflow-hidden rounded-card p-5 text-white shadow-card animate-fade-up">
              <span aria-hidden className="survey-orb pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
              <div className="relative flex items-center gap-5">
                <RateRing pct={rate} />
                <div className="grid flex-1 grid-cols-2 gap-x-4 gap-y-3">
                  <HeroNum label={tr('Answered')} value={summary.answered} />
                  <HeroNum label={tr('Said no')} value={summary.declined} />
                  <HeroNum label={tr('Asked')} value={audience ?? '-'} />
                  <HeroNum label={tr('Still to answer')} value={audience == null ? '-' : Math.max(0, audience - summary.answered - summary.declined)} />
                </div>
              </div>
            </div>
            <div className="rounded-card border border-gray-100 bg-white p-4 shadow-card animate-fade-up [animation-delay:60ms]">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Answers coming in')}</p>
              {byDay.length === 0 ? <p className="py-10 text-center text-sm text-smoke">{tr('Nothing yet.')}</p> : (
                <div className="h-36 animate-chart-in">
                  <ResponsiveContainer>
                    <AreaChart data={byDay.map((d) => ({ ...d, label: formatDate(d.day) }))} margin={{ top: 6, right: 6, left: -22, bottom: 0 }}>
                      <CartesianGrid vertical={false} stroke={CHART.grid} />
                      <XAxis dataKey="label" tick={axisTickSmall} axisLine={false} tickLine={false} minTickGap={24} />
                      <YAxis tick={axisTickSmall} axisLine={false} tickLine={false} allowDecimals={false} />
                      <Tooltip contentStyle={tooltipStyle} formatter={(v, k) => [v, k === 'answered' ? tr('Answered') : tr('Said no')]} />
                      <Area type="monotone" dataKey="answered" stackId="a" stroke={CHART.brand} strokeWidth={2} fill={FILL.area} animationDuration={700} />
                      <Area type="monotone" dataKey="declined" stackId="a" stroke="#9ca3af" strokeWidth={1.5} fill="#f3f4f6" animationDuration={700} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="inline-flex gap-1 rounded-xl bg-cloud p-1 text-[13px] font-semibold">
              {[['charts', tr('Question by question')], ['people', tr('Every response ({n})', { n: responses.length })]].map(([k, label]) => (
                <button key={k} type="button" onClick={() => setTab(k)} className={cx('rounded-lg px-3.5 py-1.5 transition-all duration-200', tab === k ? 'bg-white text-ink shadow-card' : 'text-smoke hoverable:hover:text-ink')}>{label}</button>
              ))}
            </div>
            {responses.length > 0 && (
              <button type="button" onClick={exportCsv} className="btn-secondary !py-2 text-xs"><Icon name="download" className="h-3.5 w-3.5" /> {tr('Export CSV')}</button>
            )}
          </div>

          {tab === 'charts' ? (
            summary.answered === 0 ? (
              <EmptyState icon={<Icon name="chartPie" className="h-7 w-7" />} title={tr('No answers yet')} hint={survey.status === 'live' ? tr('Answers appear here as they arrive.') : tr('Put it live to start collecting answers.')} />
            ) : (
              <div key="charts" className="grid gap-4 lg:grid-cols-2">
                {summary.questions.map((q, i) => (
                  <section key={q.id} className={cx('card animate-fade-up', q.type === 'text' && 'lg:col-span-2')} style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }}>
                    <div className="flex items-start gap-2.5">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-brand text-[11px] font-bold text-white">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold leading-snug text-ink">{q.prompt}</p>
                        <p className="mt-0.5 text-[11px] text-smoke">{q.n === 1 ? tr('1 answer') : tr('{n} answers', { n: q.n })}</p>
                      </div>
                    </div>
                    <div className="mt-4">
                      {q.type === 'rating' && <RatingResult q={q} />}
                      {q.type === 'scale' && <ScaleResult q={q} />}
                      {q.type === 'yesno' && <YesNoResult q={q} />}
                      {(q.type === 'choice' || q.type === 'multi') && <ChoiceResult q={q} />}
                      {q.type === 'text' && <TextResult q={q} who={(a) => who({ profile_id: a.profile_id, sample_name: a.sample_name })} />}
                    </div>
                  </section>
                ))}
              </div>
            )
          ) : (
            <ResponsesList key="people" survey={survey} responses={responses} who={who} onDelete={removeResponse} />
          )}
        </>
      )}
    </div>
  )
}

function HeroNum({ label, value }) {
  return (
    <div>
      <p className="text-2xl font-bold tabular-nums leading-none">{value}</p>
      <p className="mt-1 text-[10.5px] font-semibold uppercase tracking-wide text-white/80">{label}</p>
    </div>
  )
}

function RateRing({ pct }) {
  const tr = useT()
  const r = 38
  const c = 2 * Math.PI * r
  const p = Math.max(0, Math.min(100, pct ?? 0))
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg viewBox="0 0 96 96" className="h-24 w-24 -rotate-90">
        <circle cx="48" cy="48" r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="9" />
        <circle cx="48" cy="48" r={r} fill="none" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)} className="transition-[stroke-dashoffset] duration-1000 ease-out" />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-xl font-bold tabular-nums leading-none">{pct == null ? '-' : `${pct}%`}</span>
        <span className="mt-0.5 text-[9px] font-bold uppercase tracking-wide text-white/80">{tr('answered')}</span>
      </div>
    </div>
  )
}

function RatingResult({ q }) {
  const tr = useT()
  const data = [5, 4, 3, 2, 1].map((n) => ({ name: `${n}`, count: q.spread[n - 1] }))
  return (
    <div className="flex items-center gap-5">
      <div className="shrink-0 text-center">
        <p className="text-4xl font-bold tabular-nums text-ink">{q.average == null ? '-' : q.average.toFixed(1)}</p>
        <p className="mt-1 flex justify-center gap-0.5 text-brand">
          {[1, 2, 3, 4, 5].map((n) => <Icon key={n} name="star" className={cx('h-3.5 w-3.5', q.average != null && q.average >= n - 0.25 ? 'opacity-100' : 'opacity-25')} />)}
        </p>
        <p className="mt-1 text-[10.5px] font-semibold text-smoke">{tr('out of 5')}</p>
      </div>
      <div className="h-32 flex-1 animate-chart-in">
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 28, left: -18, bottom: 0 }} barCategoryGap="22%">
            <XAxis type="number" hide allowDecimals={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: CHART.axis, fontWeight: 700 }} axisLine={false} tickLine={false} width={36} tickFormatter={(v) => `${v}★`} />
            <Tooltip cursor={{ fill: 'rgba(26,26,26,0.03)' }} contentStyle={tooltipStyle} formatter={(v) => [v, tr('Answers')]} />
            <Bar dataKey="count" fill={FILL.brandH} radius={[0, 6, 6, 0]} background={{ fill: '#f3f4f6', radius: 6 }} animationDuration={700}>
              <LabelList dataKey="count" position="right" style={{ fontSize: 11, fontWeight: 700, fill: CHART.ink }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

function ScaleResult({ q }) {
  const tr = useT()
  const data = q.spread.map((count, n) => ({ name: String(n), count, band: n >= 9 ? 'high' : n >= 7 ? 'mid' : 'low' }))
  return (
    <div>
      <div className="mb-3 flex items-baseline gap-4">
        <p className="text-3xl font-bold tabular-nums text-ink">{q.average == null ? '-' : q.average.toFixed(1)}<span className="ml-1 text-sm font-semibold text-smoke">/ 10</span></p>
        {q.score != null && (
          <p className="text-[12px] font-semibold text-smoke">{tr('Recommend score')} <span className={cx('text-base font-bold', q.score >= 0 ? 'text-emerald-600' : 'text-red-500')}>{q.score > 0 ? `+${q.score}` : q.score}</span></p>
        )}
      </div>
      <div className="h-32 animate-chart-in">
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 14, right: 0, left: -26, bottom: 0 }} barCategoryGap="16%">
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="name" tick={axisTickSmall} axisLine={false} tickLine={false} />
            <YAxis tick={axisTickSmall} axisLine={false} tickLine={false} allowDecimals={false} />
            <Tooltip cursor={{ fill: 'rgba(26,26,26,0.03)' }} contentStyle={tooltipStyle} formatter={(v) => [v, tr('Answers')]} />
            <Bar dataKey="count" radius={[5, 5, 0, 0]} animationDuration={700}>
              {data.map((d) => <Cell key={d.name} fill={d.band === 'high' ? FILL.green : d.band === 'mid' ? FILL.amber : FILL.brand} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-1 text-[11px] text-smoke">{tr('Green is 9-10, amber 7-8. The score is the share of 9-10 minus the share of 0-6.')}</p>
    </div>
  )
}

function YesNoResult({ q }) {
  const tr = useT()
  const total = Math.max(1, q.n)
  const data = q.counts.map((c) => ({ name: c.option === 'yes' ? tr('Yes') : tr('No'), value: c.count, key: c.option }))
  const yes = q.counts.find((c) => c.option === 'yes')?.count || 0
  return (
    <div className="flex items-center gap-5">
      <div className="relative h-32 w-32 shrink-0 animate-chart-in">
        <ResponsiveContainer>
          <PieChart>
            <Pie data={data} dataKey="value" innerRadius={42} outerRadius={60} paddingAngle={2} startAngle={90} endAngle={-270} animationDuration={800} stroke="none">
              {data.map((d) => <Cell key={d.key} fill={d.key === 'yes' ? '#d94407' : '#e5e7eb'} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold tabular-nums text-ink">{Math.round((yes / total) * 100)}%</span>
          <span className="text-[10px] font-bold uppercase text-smoke">{tr('Yes')}</span>
        </div>
      </div>
      <div className="flex-1 space-y-2 text-sm">
        {data.map((d) => (
          <p key={d.key} className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 font-semibold text-ink"><span className={cx('h-2.5 w-2.5 rounded-full', d.key === 'yes' ? 'bg-brand' : 'bg-gray-200')} />{d.name}</span>
            <span className="tabular-nums text-smoke"><strong className="text-ink">{d.value}</strong> · {Math.round((d.value / total) * 100)}%</span>
          </p>
        ))}
      </div>
    </div>
  )
}

function ChoiceResult({ q }) {
  const tr = useT()
  const total = Math.max(1, q.n)
  const data = [...q.counts].sort((a, b) => b.count - a.count).map((c) => ({ name: c.option, count: c.count, pct: c.count / total }))
  const top = data[0]?.count || 0
  return (
    <div>
      <div className="animate-chart-in" style={{ height: Math.max(90, data.length * 38) }}>
        <ResponsiveContainer>
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 44, left: 0, bottom: 0 }} barCategoryGap="24%">
            <XAxis type="number" hide domain={[0, 1]} />
            <YAxis type="category" dataKey="name" width={140} tick={{ fontSize: 12, fill: CHART.ink, fontWeight: 600 }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: 'rgba(26,26,26,0.03)' }} contentStyle={tooltipStyle} formatter={(v, k, p) => [`${p.payload.count} · ${Math.round(v * 100)}%`, tr('Answers')]} />
            <Bar dataKey="pct" radius={[0, 7, 7, 0]} background={{ fill: '#f3f4f6', radius: 7 }} animationDuration={700}>
              {data.map((d) => <Cell key={d.name} fill={d.count === top && top > 0 ? FILL.brandH : '#fbc9a6'} />)}
              <LabelList dataKey="pct" position="right" formatter={(v) => `${Math.round(v * 100)}%`} style={{ fontSize: 11, fontWeight: 700, fill: CHART.ink }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {q.type === 'multi' && <p className="mt-1 text-[11px] text-gray-400">{tr('People could pick more than one, so this adds up to more than 100%.')}</p>}
    </div>
  )
}

function TextResult({ q, who }) {
  const tr = useT()
  const [all, setAll] = useState(false)
  const shown = all ? q.answers : q.answers.slice(0, 6)
  return (
    <div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {shown.map((a, k) => {
          const w = who(a)
          return (
            <li key={k} className="rounded-xl bg-cloud/60 px-3.5 py-3 animate-fade-up" style={{ animationDelay: `${Math.min(k, 8) * 30}ms` }}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">&ldquo;{a.text}&rdquo;</p>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-smoke">
                <Avatar src={w.photo} name={w.name} size="xs" />
                {w.id ? <Link to={`/profile/${w.id}`} className="hover:text-brand">{w.name}</Link> : w.name}
                {w.market && <span className="text-gray-400">· {tr(w.market)}</span>}
              </p>
            </li>
          )
        })}
      </ul>
      {q.answers.length > 6 && (
        <button type="button" onClick={() => setAll((x) => !x)} className="mt-3 text-xs font-semibold text-brand hover:underline">
          {all ? tr('Show fewer') : tr('Show all {n}', { n: q.answers.length })}
        </button>
      )}
    </div>
  )
}

function ResponsesList({ survey, responses, who, onDelete }) {
  const tr = useT()
  const [open, setOpen] = useState(null)
  if (!responses.length) return <EmptyState icon={<Icon name="users" className="h-7 w-7" />} title={tr('No responses yet')} />
  return (
    <div className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card animate-fade-up">
      {responses.map((r, i) => {
        const w = who(r)
        const on = open === r.id
        return (
          <div key={r.id} className={cx(i > 0 && 'border-t border-gray-100')}>
            <button type="button" onClick={() => setOpen(on ? null : r.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hoverable:hover:bg-cloud/50">
              <Avatar src={w.photo} name={w.name} size="sm" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-ink">{w.name}{w.sample && <span className="ml-1.5 rounded bg-amber-50 px-1 text-[10px] font-bold uppercase text-amber-700">{tr('Sample')}</span>}</span>
                <span className="block text-[11px] text-smoke">{w.market ? `${tr(w.market)} · ` : ''}{formatDate(r.created_at)}</span>
              </span>
              <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', r.declined ? 'bg-gray-100 text-smoke' : 'bg-emerald-50 text-emerald-600')}>{r.declined ? tr('Said no') : tr('Answered')}</span>
              <Icon name="chevronDown" className={cx('h-4 w-4 shrink-0 text-gray-400 transition-transform duration-200', on && 'rotate-180')} />
            </button>
            {on && (
              <div className="space-y-3 border-t border-gray-50 bg-cloud/30 px-4 py-4 animate-fade-up">
                {r.declined ? <p className="text-sm text-smoke">{tr('They chose not to take part.')}</p> : (survey.questions || []).map((q, k) => {
                  const v = r.answers?.[q.id]
                  const text = v == null || v === '' || (Array.isArray(v) && !v.length) ? null
                    : Array.isArray(v) ? v.join(', ') : q.type === 'yesno' ? (v === 'yes' ? tr('Yes') : tr('No')) : q.type === 'rating' ? `${v} / 5` : q.type === 'scale' ? `${v} / 10` : String(v)
                  return (
                    <div key={q.id}>
                      <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{k + 1}. {q.prompt}</p>
                      <p className={cx('mt-0.5 whitespace-pre-wrap text-sm', text ? 'text-ink' : 'text-gray-400')}>{text || tr('Skipped')}</p>
                    </div>
                  )
                })}
                <div className="flex justify-end">
                  <button type="button" onClick={() => onDelete(r)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-smoke transition-colors hoverable:hover:bg-red-50 hoverable:hover:text-red-500">
                    <Icon name="trash" className="h-3.5 w-3.5" /> {tr('Delete response')}
                  </button>
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

