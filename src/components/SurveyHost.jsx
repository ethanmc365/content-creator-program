import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Modal, Spinner } from './ui'
import Icon from './Icon'
import { TLine } from './TranslatedText'
import { claimNag, finishNag, onNagChange, onTourRunning, tourRunning } from '../lib/appNag'
import { missingAnswer, pendingSurveys } from '../lib/surveys'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

// A SURVEY, POPPED UP (30 Sep 2026, migration 291).
//
// Ethan: "we can actually post forms that will give a pop-up to the creators to fill in ... This could
// be a persistent pop-up until every creator does it, or persistent every time they open the app.
// Obviously, they might have other persistent pop-ups, so it's just structuring it well ... Maybe a
// button saying 'I don't want to take part'."
//
// STRUCTURED WITH THE OTHER ASKS, NOT ON TOP OF THEM. It joins the same one-at-a-time queue as the
// home-screen, notifications and bank-details prompts (lib/appNag), last in line, and never while the
// walkthrough is running or any other dialog is open. So a creator meets at most one thing at a time,
// and a survey waits its turn rather than stacking.
//
//   Later                          until_done: gone for this app open, back next time
//   I don't want to take part      a declined row: never asked again
//   Send                           their answers: never asked again
// A survey set to "ask once" treats closing as a no.
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

/** The survey in a dialog. Used by the pop-up, by the Feedback page and by the admin's preview. */
export function SurveyModal({ survey, onDone, preview = false }) {
  const tr = useT()
  const { user } = useAuth()
  const [busy, setBusy] = useState('')
  const [sent, setSent] = useState(false)
  const [err, setErr] = useState('')

  async function write(row) {
    if (preview) return true
    const { error } = await supabase.from('survey_responses').insert({ survey_id: survey.id, profile_id: user.id, ...row })
    // Already answered on another device counts as done.
    if (error && error.code !== '23505') { setErr(tr('That did not send. Try again in a moment.')); return false }
    return true
  }

  async function decline() {
    setBusy('decline')
    const ok = await write({ declined: true, answers: {} })
    setBusy('')
    if (ok) onDone()
  }

  function later() {
    if (survey.mode === 'once') { decline(); return }
    snooze(survey.id)
    onDone()
  }

  async function submit(answers) {
    setBusy('send')
    const ok = await write({ answers, declined: false })
    setBusy('')
    if (ok) setSent(true)
  }

  return (
    <Modal open onClose={sent ? onDone : later} title={sent ? tr('Thank you!') : <TLine text={survey.title} />}>
      {sent ? (
        <div className="py-4 text-center animate-page-in">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-brand text-white shadow-card">
            <Icon name="check" className="h-7 w-7" strokeWidth={2.4} />
          </span>
          <p className="mt-4 text-sm text-smoke">{tr('Your answers are with the team. Every one is read.')}</p>
          <button type="button" onClick={onDone} className="btn-primary mx-auto mt-5">{tr('Done')}</button>
        </div>
      ) : (
        <SurveyForm
          survey={survey}
          busy={busy}
          err={err}
          preview={preview}
          onSubmit={submit}
          onLater={later}
          onDecline={survey.allow_decline ? decline : null}
        />
      )}
    </Modal>
  )
}

export function SurveyForm({ survey, busy = '', err = '', preview = false, onSubmit, onLater, onDecline }) {
  const tr = useT()
  const [answers, setAnswers] = useState({})
  const [missing, setMissing] = useState(null)
  const set = (id, v) => { setAnswers((a) => ({ ...a, [id]: v })); setMissing(null) }

  function send() {
    const gap = missingAnswer(survey.questions, answers)
    if (gap) { setMissing(gap.id); document.getElementById(`sq-${gap.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return }
    onSubmit(answers)
  }

  return (
    <div className="space-y-5 animate-page-in">
      {preview && (
        <p className="rounded-xl bg-brand-tint/60 px-3.5 py-2.5 text-xs font-semibold text-brand">{tr('Preview - nothing you do here is saved.')}</p>
      )}
      {survey.intro && <p className="text-sm leading-relaxed text-smoke"><TLine text={survey.intro} /></p>}
      {(survey.questions || []).map((q, i) => (
        <div key={q.id} id={`sq-${q.id}`} className={cx('rounded-card border p-4 transition-colors duration-200', missing === q.id ? 'border-brand bg-brand-tint/30' : 'border-gray-100 bg-white')}>
          <p className="text-sm font-semibold text-ink">
            <span className="mr-1.5 text-brand">{i + 1}.</span>
            <TLine text={q.prompt} />
            {!q.required && <span className="ml-1.5 text-xs font-medium text-gray-400">({tr('optional')})</span>}
          </p>
          <div className="mt-3">
            <Answer q={q} value={answers[q.id]} onChange={(v) => set(q.id, v)} />
          </div>
          {missing === q.id && <p className="mt-2 text-xs font-semibold text-brand">{tr('This one needs an answer.')}</p>}
        </div>
      ))}
      {err && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{err}</p>}
      <div className="flex flex-col gap-2 pt-1 sm:flex-row-reverse">
        <button type="button" onClick={send} disabled={!!busy} className="btn-primary flex-1 justify-center disabled:opacity-60">
          {busy === 'send' ? <Spinner className="h-4 w-4" /> : <Icon name="plane" className="h-4 w-4" />}
          {tr('Send my answers')}
        </button>
        <button type="button" onClick={onLater} disabled={!!busy} className="btn-secondary flex-1 justify-center">
          {survey.mode === 'once' ? tr('Close') : tr('Later')}
        </button>
      </div>
      {onDecline && (
        <button type="button" onClick={onDecline} disabled={!!busy} className="mx-auto block text-xs font-semibold text-smoke underline-offset-2 transition-colors hover:text-ink hover:underline">
          {busy === 'decline' ? tr('One moment…') : tr('I don\'t want to take part')}
        </button>
      )}
    </div>
  )
}

function Answer({ q, value, onChange }) {
  const tr = useT()
  if (q.type === 'rating') {
    return (
      <div className="flex items-center gap-1.5" role="radiogroup" aria-label={q.prompt}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={String(n)}
            onClick={() => onChange(n)}
            className={cx(
              'flex h-11 w-11 items-center justify-center rounded-xl border transition-all duration-150 hoverable:hover:-translate-y-0.5',
              value >= n ? 'border-brand bg-brand text-white shadow-card' : 'border-gray-200 text-gray-300 hoverable:hover:border-brand/40 hoverable:hover:text-brand',
            )}
          >
            <Icon name="star" className="h-5 w-5" />
          </button>
        ))}
        {value ? <span className="ml-2 text-sm font-bold tabular-nums text-ink">{value}/5</span> : null}
      </div>
    )
  }
  if (q.type === 'choice' || q.type === 'multi') {
    const multi = q.type === 'multi'
    const picked = multi ? (Array.isArray(value) ? value : []) : value
    return (
      <div className="flex flex-wrap gap-2">
        {(q.options || []).map((o) => {
          const on = multi ? picked.includes(o) : picked === o
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(multi ? (on ? picked.filter((x) => x !== o) : [...picked, o]) : o)}
              className={cx(
                'inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-sm font-medium transition-all duration-150',
                on ? 'border-brand bg-brand text-white shadow-card' : 'border-gray-200 text-ink hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/40',
              )}
            >
              {multi && <Icon name={on ? 'check' : 'plus'} className="h-3.5 w-3.5" strokeWidth={2.4} />}
              <TLine text={o} />
            </button>
          )
        })}
        {multi && <p className="w-full text-[11px] text-gray-400">{tr('Pick as many as you like.')}</p>}
      </div>
    )
  }
  return (
    <textarea
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      maxLength={2000}
      placeholder={tr('Write your answer…')}
      className="input min-h-[5.5rem] resize-y"
    />
  )
}
