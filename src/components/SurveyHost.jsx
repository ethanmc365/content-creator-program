import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Spinner } from './ui'
import Icon from './Icon'
import { TLine } from './TranslatedText'
import { claimNag, finishNag, onNagChange, onTourRunning, tourRunning } from '../lib/appNag'
import { lockScroll } from '../lib/scrollLock'
import { answered, minutesFor, pendingSurveys } from '../lib/surveys'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

// A SURVEY, POPPED UP (30 Sep 2026, migration 291; rebuilt 1 Oct 2026, migration 293).
//
// Ethan: "I would also much improve the preview of it and maybe have it more like the recap card with
// that cool, engaging design and clean animations, rather than just a boring form style ... We can
// say, 'Hey, their name,' in the actual pop-up ... It should just automatically keep asking until the
// answer, or if they select 'I don't want to take part' ... say something like, 'This really helps
// us' ... but they can still always click no."
//
// So it is a CARD, not a form: an orange header that greets the creator by name, one question at a
// time with a progress bar across the top, big answers to tap, and a thank-you at the end. The close
// button is "later": the survey comes back the next time the app opens, until it is answered or
// declined. Declining asks once more, kindly, and then takes the no.
//
// STRUCTURED WITH THE OTHER ASKS, NOT ON TOP OF THEM. It joins the same one-at-a-time queue as the
// home-screen, notifications and bank-details prompts (lib/appNag), last in line, and never while the
// walkthrough is running or any other dialog is open.
const SNOOZE_KEY = 'tryp_survey_later'
const snoozed = () => { try { return JSON.parse(sessionStorage.getItem(SNOOZE_KEY) || '[]') } catch { return [] } }
const snooze = (id) => { try { sessionStorage.setItem(SNOOZE_KEY, JSON.stringify([...new Set([...snoozed(), id])])) } catch { /* private mode */ } }

export default function SurveyHost() {
  const { user, profile } = useAuth()
  const [survey, setSurvey] = useState(null)
  const [turn, setTurn] = useState(0)
  useEffect(() => onNagChange(() => setTurn((n) => n + 1)), [])
  useEffect(() => onTourRunning(() => setTurn((n) => n + 1)), [])

  useEffect(() => {
    if (!user?.id || !profile || profile.status !== 'active' || profile.is_admin || !profile.tour_completed_at) return undefined
    if (survey) return undefined
    let alive = true
    // Last in the queue: give the other asks a head start to claim this app open first.
    const id = setTimeout(async () => {
      const [{ data: live }, { data: mine }] = await Promise.all([
        supabase.from('surveys').select('*').eq('status', 'live'),
        supabase.from('survey_responses').select('survey_id').eq('profile_id', user.id),
      ])
      if (!alive) return
      const next = pendingSurveys(live, mine, snoozed())[0]
      if (!next || tourRunning()) return
      if (document.querySelector('[role="dialog"]')) { setTimeout(() => alive && setTurn((n) => n + 1), 8000); return }
      if (!claimNag('survey')) return
      setSurvey(next)
    }, 3500)
    return () => { alive = false; clearTimeout(id) }
  }, [user?.id, profile, turn, survey])

  const close = useCallback(() => {
    setSurvey(null)
    finishNag('survey')
  }, [])

  if (!survey) return null
  return <SurveyModal survey={survey} onDone={close} />
}

/** The survey as a dialog over the app. Used by the pop-up and by the Feedback page. */
export function SurveyModal({ survey, onDone, preview = false }) {
  useEffect(() => lockScroll(), [])
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { if (!preview) snooze(survey.id); onDone() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [survey.id, onDone, preview])
  return createPortal(
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-[80] flex items-end justify-center bg-ink/45 p-0 backdrop-blur-[2px] animate-fade-in sm:items-center sm:p-4">
      <div className="w-full max-w-md animate-survey-rise sm:w-[28rem]">
        <SurveyCard survey={survey} preview={preview} onDone={onDone} />
      </div>
    </div>,
    document.body,
  )
}

/**
 * THE CARD ITSELF. Drawn in the pop-up, on the Feedback page, and - inline, with `preview` - in the
 * admin's survey builder, so what the team sees is exactly what a creator sees.
 * `stage` lets the builder's preview jump straight to a screen: 'intro' | 'questions' | 'decline' | 'sent'.
 */
export function SurveyCard({ survey, onDone = () => {}, preview = false, stage: forced = null, at = 0, name: forcedName = null, className }) {
  const tr = useT()
  const { user, profile } = useAuth()
  const questions = survey.questions || []
  const [stage, setStage] = useState(forced || 'intro')
  const [i, setI] = useState(forced === 'questions' ? Math.max(0, Math.min(at, (survey.questions || []).length - 1)) : 0)
  const [dir, setDir] = useState(1)
  const [answers, setAnswers] = useState({})
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  // The builder's preview can change screens from outside.
  const [lastForced, setLastForced] = useState(forced)
  if (forced !== lastForced) { setLastForced(forced); if (forced) { setStage(forced); setI(0) } }

  const first = (forcedName || profile?.name || '').split(' ')[0]
  const q = questions[Math.min(i, questions.length - 1)]
  const last = i >= questions.length - 1
  const canNext = !q || !q.required || answered(q, answers[q.id])
  const mins = minutesFor(questions)

  async function write(row) {
    if (preview) return true
    const { error } = await supabase.from('survey_responses').insert({ survey_id: survey.id, profile_id: user.id, ...row })
    // Already answered on another device counts as done.
    if (error && error.code !== '23505') { setErr(tr('That did not send. Try again in a moment.')); return false }
    return true
  }
  async function send() {
    setBusy('send')
    const ok = await write({ answers, declined: false })
    setBusy('')
    if (ok) setStage('sent')
  }
  async function decline() {
    setBusy('decline')
    const ok = await write({ declined: true, answers: {} })
    setBusy('')
    if (ok) onDone()
  }
  function later() {
    if (!preview) snooze(survey.id)
    onDone()
  }
  function go(d) {
    setDir(d)
    if (d > 0 && last) { send(); return }
    setI((x) => Math.max(0, Math.min(questions.length - 1, x + d)))
  }
  const set = (v) => setAnswers((a) => ({ ...a, [q.id]: v }))

  return (
    <div className={cx('relative overflow-hidden rounded-t-[28px] bg-white shadow-lift sm:rounded-[28px]', className)}>
      {/* ---------- the orange header ---------- */}
      <div className="brand-drift relative overflow-hidden px-6 pb-6 pt-5 text-white">
        <span aria-hidden className="survey-orb pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/15 blur-2xl" />
        <span aria-hidden className="survey-orb pointer-events-none absolute -bottom-16 -left-10 h-36 w-36 rounded-full bg-white/10 blur-2xl [animation-delay:-3s]" />
        <div className="relative flex items-center gap-2">
          {stage === 'questions' ? (
            <div className="flex flex-1 gap-1" aria-label={tr('Question {n} of {t}', { n: i + 1, t: questions.length })}>
              {questions.map((x, k) => (
                <span key={x.id} className="h-1 flex-1 overflow-hidden rounded-full bg-white/30">
                  <span className="block h-full rounded-full bg-white transition-[width] duration-500 ease-out" style={{ width: k < i ? '100%' : k === i ? (answered(x, answers[x.id]) ? '100%' : '40%') : '0%' }} />
                </span>
              ))}
            </div>
          ) : (
            <span className="inline-flex flex-1 items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/85">
              <Icon name="sparkles" className="h-3.5 w-3.5" />
              {tr('Quick survey')}
            </span>
          )}
          {stage !== 'sent' && (
            <button type="button" onClick={later} aria-label={tr('Later')} title={tr('Later')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/15 text-white transition-all duration-200 hoverable:hover:scale-105 hoverable:hover:bg-white/25">
              <Icon name="close" className="h-4 w-4" />
            </button>
          )}
        </div>
        {stage === 'intro' && (
          <div key="intro-h" className="relative mt-5 animate-survey-in">
            <p className="text-3xl font-bold leading-tight tracking-tight">{first ? tr('Hey {name}', { name: first }) : tr('Hey there')}</p>
            <p className="mt-2 text-[17px] font-semibold leading-snug text-white/95"><TLine text={survey.title} /></p>
          </div>
        )}
        {stage === 'questions' && (
          <p key="q-h" className="relative mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">
            {tr('Question {n} of {t}', { n: i + 1, t: questions.length })}
          </p>
        )}
        {stage === 'decline' && (
          <div key="decline-h" className="relative mt-5 animate-survey-in">
            <p className="text-2xl font-bold leading-tight tracking-tight">{tr('Before you go')}</p>
          </div>
        )}
        {stage === 'sent' && (
          <div key="sent-h" className="relative mt-3 flex flex-col items-center pb-1 text-center animate-survey-in">
            <span className="survey-done relative flex h-16 w-16 items-center justify-center rounded-full bg-white text-brand shadow-lift">
              <Icon name="check" className="h-8 w-8" strokeWidth={2.6} />
            </span>
            <p className="mt-4 text-2xl font-bold tracking-tight">{first ? tr('Thank you, {name}!', { name: first }) : tr('Thank you!')}</p>
          </div>
        )}
      </div>

      {/* ---------- the body ---------- */}
      <div className="px-6 pb-6 pt-5">
        {preview && <p className="mb-4 rounded-xl bg-cloud px-3 py-2 text-[11px] font-semibold text-smoke">{tr('Preview - nothing you do here is saved.')}</p>}

        {stage === 'intro' && (
          <div key="intro" className="animate-survey-in">
            {survey.intro && <p className="text-[15px] leading-relaxed text-smoke"><TLine text={survey.intro} /></p>}
            <div className="mt-4 flex flex-wrap gap-2 text-[12px] font-semibold text-ink">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cloud px-3 py-1.5"><Icon name="poll" className="h-3.5 w-3.5 text-brand" />{questions.length === 1 ? tr('1 question') : tr('{n} questions', { n: questions.length })}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cloud px-3 py-1.5"><Icon name="clock" className="h-3.5 w-3.5 text-brand" />{mins === 1 ? tr('About 1 minute') : tr('About {n} minutes', { n: mins })}</span>
            </div>
            <button type="button" onClick={() => { setDir(1); setStage('questions') }} className="btn-primary mt-6 w-full justify-center !py-3.5 text-[15px] transition-transform duration-200 hoverable:hover:scale-[1.02]">
              {tr("Let's go")}
              <Icon name="chevronRight" className="h-4 w-4" strokeWidth={2.4} />
            </button>
            <button type="button" onClick={() => setStage('decline')} className="mx-auto mt-3 block text-[13px] font-semibold text-smoke transition-colors hover:text-ink">
              {tr("I don't want to take part")}
            </button>
          </div>
        )}

        {stage === 'questions' && q && (
          <div key={q.id} className={dir > 0 ? 'animate-survey-next' : 'animate-survey-back'}>
            <p className="text-lg font-bold leading-snug text-ink">
              <TLine text={q.prompt} />
              {!q.required && <span className="ml-1.5 align-middle text-xs font-medium text-gray-400">({tr('optional')})</span>}
            </p>
            {q.help && <p className="mt-1 text-[13px] text-smoke"><TLine text={q.help} /></p>}
            <div className="mt-5">
              <Answer q={q} value={answers[q.id]} onChange={set} />
            </div>
            {err && <p className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{err}</p>}
            <div className="mt-6 flex items-center gap-2.5">
              <button type="button" onClick={() => (i === 0 ? setStage('intro') : go(-1))} aria-label={tr('Back')} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cloud text-smoke transition-all duration-200 hoverable:hover:-translate-x-0.5 hoverable:hover:text-ink">
                <Icon name="chevronLeft" className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => go(1)} disabled={!canNext || !!busy} className="btn-primary h-12 flex-1 justify-center text-[15px] transition-all duration-200 disabled:opacity-40 hoverable:enabled:hover:scale-[1.02]">
                {busy === 'send' ? <Spinner className="h-4 w-4" /> : null}
                {last ? tr('Send my answers') : !answered(q, answers[q.id]) && !q.required ? tr('Skip') : tr('Next')}
                {!last && <Icon name="chevronRight" className="h-4 w-4" strokeWidth={2.4} />}
              </button>
            </div>
          </div>
        )}

        {stage === 'decline' && (
          <div key="decline" className="animate-survey-in">
            <p className="text-[15px] leading-relaxed text-ink">{tr('This really helps us make the community better for you, and it only takes about {n} minute.', { n: mins })}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-smoke">{tr('Every answer is read by the team. You can still say no.')}</p>
            <button type="button" onClick={() => { setDir(1); setStage('questions') }} className="btn-primary mt-6 w-full justify-center !py-3.5 text-[15px] transition-transform duration-200 hoverable:hover:scale-[1.02]">
              {tr("OK, I'll help")}
            </button>
            <button type="button" onClick={decline} disabled={!!busy} className="btn-secondary mt-2.5 w-full justify-center !py-3">
              {busy === 'decline' ? <Spinner className="h-4 w-4" /> : tr('No thanks')}
            </button>
          </div>
        )}

        {stage === 'sent' && (
          <div key="sent" className="animate-survey-in text-center">
            <p className="text-[15px] leading-relaxed text-smoke">
              {survey.thanks ? <TLine text={survey.thanks} /> : tr('Your answers are with the team. Every one is read.')}
            </p>
            <button type="button" onClick={onDone} className="btn-primary mx-auto mt-6 w-full justify-center !py-3.5">{tr('Done')}</button>
          </div>
        )}
      </div>
    </div>
  )
}

function Answer({ q, value, onChange }) {
  const tr = useT()
  if (q.type === 'rating') {
    return (
      <div className="flex items-center justify-between gap-2" role="radiogroup" aria-label={q.prompt}>
        {[1, 2, 3, 4, 5].map((n) => {
          const on = value >= n
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={String(n)}
              onClick={() => onChange(n)}
              className={cx(
                'flex aspect-square flex-1 items-center justify-center rounded-2xl border-2 transition-all duration-200 hoverable:hover:-translate-y-0.5',
                on ? 'border-brand bg-brand text-white shadow-card' : 'border-gray-100 bg-white text-gray-300 hoverable:hover:border-brand/40 hoverable:hover:text-brand',
                value === n && 'survey-pop',
              )}
            >
              <Icon name="star" className="h-7 w-7" />
            </button>
          )
        })}
      </div>
    )
  }
  if (q.type === 'scale') {
    return (
      <div>
        <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11" role="radiogroup" aria-label={q.prompt}>
          {Array.from({ length: 11 }, (_, n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              onClick={() => onChange(n)}
              className={cx(
                'flex h-11 items-center justify-center rounded-xl border-2 text-sm font-bold tabular-nums transition-all duration-200 hoverable:hover:-translate-y-0.5',
                value === n ? 'survey-pop border-brand bg-brand text-white shadow-card' : 'border-gray-100 text-ink hoverable:hover:border-brand/40',
              )}
            >
              {n}
            </button>
          ))}
        </div>
        <div className="mt-2 flex justify-between text-[11px] font-semibold text-gray-400">
          <span>{tr('Not at all')}</span><span>{tr('Definitely')}</span>
        </div>
      </div>
    )
  }
  if (q.type === 'yesno') {
    return (
      <div className="grid grid-cols-2 gap-3">
        {[['yes', tr('Yes'), 'check'], ['no', tr('No'), 'close']].map(([k, label, icon]) => (
          <button
            key={k}
            type="button"
            aria-pressed={value === k}
            onClick={() => onChange(k)}
            className={cx(
              'flex h-20 flex-col items-center justify-center gap-1 rounded-2xl border-2 text-[15px] font-bold transition-all duration-200 hoverable:hover:-translate-y-0.5',
              value === k ? 'survey-pop border-brand bg-brand text-white shadow-card' : 'border-gray-100 text-ink hoverable:hover:border-brand/40',
            )}
          >
            <Icon name={icon} className="h-5 w-5" strokeWidth={2.4} />
            {label}
          </button>
        ))}
      </div>
    )
  }
  if (q.type === 'choice' || q.type === 'multi') {
    const multi = q.type === 'multi'
    const picked = multi ? (Array.isArray(value) ? value : []) : value
    return (
      <div className="space-y-2">
        {(q.options || []).map((o, k) => {
          const on = multi ? picked.includes(o) : picked === o
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(multi ? (on ? picked.filter((x) => x !== o) : [...picked, o]) : o)}
              style={{ animationDelay: `${k * 40}ms` }}
              className={cx(
                'animate-fade-up flex w-full items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-[15px] font-semibold transition-all duration-200',
                on ? 'border-brand bg-brand text-white shadow-card' : 'border-gray-100 text-ink hoverable:hover:translate-x-0.5 hoverable:hover:border-brand/40',
              )}
            >
              <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center border-2 transition-colors', multi ? 'rounded-md' : 'rounded-full', on ? 'border-white bg-white text-brand' : 'border-gray-300')}>
                {on && <Icon name="check" className="h-3.5 w-3.5" strokeWidth={3} />}
              </span>
              <span className="min-w-0 flex-1"><TLine text={o} /></span>
            </button>
          )
        })}
        {multi && <p className="pt-1 text-[12px] text-gray-400">{tr('Pick as many as you like.')}</p>}
      </div>
    )
  }
  return (
    <textarea
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      rows={4}
      maxLength={2000}
      placeholder={tr('Write your answer…')}
      className="input no-ios-zoom min-h-[7rem] resize-none rounded-2xl text-[15px]"
    />
  )
}
