import { Fragment, useCallback, useEffect, useId, useState } from 'react'
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
// time with a progress bar across the top, big answers to tap, and a thank-you at the end. There is NO
// CLOSE BUTTON (2 Oct 2026): they take part, or they say "No thanks". It comes back the next time the
// app opens until it is answered or declined. Declining asks once more, kindly, and then takes the no.
//
// STRUCTURED WITH THE OTHER ASKS, NOT ON TOP OF THEM. It joins the same one-at-a-time queue as the
// home-screen, notifications and bank-details prompts (lib/appNag), last in line, and never while the
// walkthrough is running or any other dialog is open.

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
      const next = pendingSurveys(live, mine, [])[0]
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

/** The survey as a dialog over the app. Used by the pop-up and by the Feedback page.
 *
 *  NO WAY OUT BUT AN ANSWER (2 Oct 2026). Ethan: "They shouldn't have that X button at all. There should
 *  be no X button. They can either just say 'No thanks' or 'Continue.'" So there is no close button and
 *  Escape does nothing: the card leaves when they take part and finish, or say no. It leaves the way it
 *  came - the scrim fades and the card sinks - instead of vanishing. */
export function SurveyModal({ survey, onDone, preview = false, dismissible = false }) {
  const [leaving, setLeaving] = useState(false)
  useEffect(() => lockScroll(), [])
  const finish = useCallback(() => {
    setLeaving(true)
    setTimeout(onDone, 240)
  }, [onDone])
  // A survey somebody OPENED themselves (from the Feedback page) can be put down again with Escape or a
  // tap outside - nothing is recorded. The one that pops up on its own cannot: that is the "no X" rule.
  useEffect(() => {
    if (!dismissible) return undefined
    const onKey = (e) => { if (e.key === 'Escape') finish() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [dismissible, finish])
  return createPortal(
    <div role="dialog" aria-modal="true" className={cx('fixed inset-0 z-[80] flex items-end justify-center bg-ink/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4', leaving ? 'animate-fade-out' : 'animate-fade-in')}
      onPointerDown={(e) => { if (dismissible && e.target === e.currentTarget) finish() }}>
      <div className={cx('w-full max-w-md sm:w-[28rem]', leaving ? 'animate-survey-sink' : 'animate-survey-rise')}>
        <SurveyCard survey={survey} preview={preview} onDone={finish} />
      </div>
    </div>,
    document.body,
  )
}

// The same handful of confetti pieces every time, so a thank-you is always the same thank-you.
const CONFETTI = Array.from({ length: 22 }, (_, i) => {
  const a = (i / 22) * Math.PI * 2 + (i % 3) * 0.2
  const d = 70 + ((i * 37) % 70)
  return {
    x: Math.round(Math.cos(a) * d), y: Math.round(Math.sin(a) * d * 0.8 - 26), r: ((i * 53) % 360) - 180,
    d: (i % 6) * 40, c: ['#ffffff', '#fde68a', '#fed7aa', '#fbbf24', '#ffffff', '#fdba74'][i % 6],
  }
})

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
  // "No thanks" CLOSES THE SURVEY (2 Oct 2026). In the pop-up it records the no and the card leaves; in
  // the builder's preview it closes the preview the same way, so the team sees what a creator sees.
  async function decline() {
    setBusy('decline')
    const ok = await write({ declined: true, answers: {} })
    setBusy('')
    if (ok) onDone()
  }
  function go(d) {
    setDir(d)
    if (d > 0 && last) { send(); return }
    setI((x) => Math.max(0, Math.min(questions.length - 1, x + d)))
  }
  const set = (v) => setAnswers((a) => ({ ...a, [q.id]: v }))
  // A line that arrives a word at a time. The spaces are real spaces, so a screen reader still reads a sentence.
  const words = (text) => {
    const list = String(text).split(' ')
    return list.map((w, k) => (
      <Fragment key={k}>
        <span className="survey-word" style={{ '--d': `${120 + k * 70}ms` }}>{w}</span>
        {k < list.length - 1 ? ' ' : null}
      </Fragment>
    ))
  }

  return (
    <div className={cx('relative overflow-hidden rounded-t-[28px] bg-white shadow-lift sm:rounded-[28px]', className)}>
      {/* ---------- the orange header ---------- */}
      <div className="brand-drift relative overflow-hidden px-6 pb-6 pt-5 text-white">
        <span aria-hidden className="survey-orb pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/15 blur-2xl" />
        <span aria-hidden className="survey-orb pointer-events-none absolute -bottom-16 -left-10 h-36 w-36 rounded-full bg-white/10 blur-2xl [animation-delay:-3s]" />
        <div className="relative flex items-center gap-3">
          {stage === 'questions' ? (
            <>
              <div className="flex flex-1 gap-1.5" role="progressbar" aria-valuemin={1} aria-valuemax={questions.length} aria-valuenow={i + 1} aria-label={tr('Question {n} of {t}', { n: i + 1, t: questions.length })}>
                {questions.map((x, k) => {
                  const done = k < i || (k === i && answered(x, answers[x.id]))
                  const width = k < i ? '100%' : k === i ? (done ? '100%' : '42%') : '0%'
                  return (
                    <span key={x.id} className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-white/25">
                      <span
                        className={cx('survey-shine survey-fill absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-white via-amber-100 to-white transition-[width] duration-700 ease-out', k === i && !done && 'survey-glow')}
                        style={{ width }}
                      />
                    </span>
                  )
                })}
              </div>
              <span key={i} className="survey-label shrink-0 text-[11px] font-bold tabular-nums tracking-wide text-white/90">{i + 1}/{questions.length}</span>
            </>
          ) : (
            <span className="inline-flex flex-1 items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/85">
              <Icon name="sparkles" className="survey-twinkle h-3.5 w-3.5" />
              {tr('Quick survey')}
            </span>
          )}
        </div>
        {stage === 'intro' && (
          <div key="intro-h" className="relative mt-5">
            <p className="text-3xl font-bold leading-tight tracking-tight">{words(first ? tr('Hey {name}', { name: first }) : tr('Hey there'))}</p>
            <p className="survey-word mt-2 block text-[17px] font-semibold leading-snug text-white/95" style={{ '--d': '380ms' }}><TLine text={survey.title} /></p>
          </div>
        )}
        {stage === 'questions' && (
          <p key={`q-h${i}`} className="survey-label relative mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-white/80">
            {tr('Question {n} of {t}', { n: i + 1, t: questions.length })}
          </p>
        )}
        {stage === 'decline' && (
          <div key="decline-h" className="relative mt-5">
            <p className="text-2xl font-bold leading-tight tracking-tight">{words(tr('Before you go'))}</p>
          </div>
        )}
        {stage === 'sent' && (
          <div key="sent-h" className="relative mt-3 flex flex-col items-center pb-1 text-center">
            {CONFETTI.map((c, k) => (
              <span key={k} aria-hidden className="survey-confetti" style={{ '--x': `${c.x}px`, '--y': `${c.y}px`, '--r': `${c.r}deg`, '--d': `${c.d}ms`, background: c.c }} />
            ))}
            <span className="survey-done relative flex h-16 w-16 items-center justify-center rounded-full bg-white text-brand shadow-lift">
              <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path className="survey-draw" style={{ '--len': 24 }} d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
            </span>
            <p className="mt-4 text-2xl font-bold tracking-tight">{words(first ? tr('Thank you, {name}!', { name: first }) : tr('Thank you!'))}</p>
          </div>
        )}
      </div>

      {/* ---------- the body ---------- */}
      <div className="px-6 pb-6 pt-5">
        {stage === 'intro' && (
          <div key="intro" className="animate-survey-in">
            {survey.intro && <p className="text-[15px] leading-relaxed text-smoke"><TLine text={survey.intro} /></p>}
            <div className="mt-4 grid grid-cols-2 gap-2 text-[12px] font-semibold text-ink">
              <span className="survey-word inline-flex items-center justify-center gap-1.5 rounded-full bg-cloud px-3 py-1.5" style={{ '--d': '160ms' }}><Icon name="poll" className="h-3.5 w-3.5 text-brand" />{questions.length === 1 ? tr('1 question') : tr('{n} questions', { n: questions.length })}</span>
              <span className="survey-word inline-flex items-center justify-center gap-1.5 rounded-full bg-cloud px-3 py-1.5" style={{ '--d': '260ms' }}><Icon name="clock" className="h-3.5 w-3.5 text-brand" />{mins === 1 ? tr('About 1 minute') : tr('About {n} minutes', { n: mins })}</span>
            </div>
            <button type="button" onClick={() => { setDir(1); setStage('questions') }} className="btn-primary survey-shine mt-6 w-full justify-center !py-3.5 text-[15px] transition-transform duration-200 active:scale-[0.98] hoverable:hover:scale-[1.02]">
              {tr("Let's go")}
              <Icon name="chevronRight" className="survey-nudge h-4 w-4" strokeWidth={2.4} />
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
              <button type="button" onClick={() => (i === 0 ? setStage('intro') : go(-1))} aria-label={tr('Back')} className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-cloud text-smoke transition-all duration-200 active:scale-95 hoverable:hover:-translate-x-0.5 hoverable:hover:bg-gray-200 hoverable:hover:text-ink">
                <Icon name="chevronLeft" className="h-5 w-5" />
              </button>
              <button type="button" onClick={() => go(1)} disabled={!canNext || !!busy} className={cx('btn-primary h-12 flex-1 justify-center text-[15px] transition-all duration-300 active:scale-[0.98] disabled:opacity-40 hoverable:enabled:hover:scale-[1.02]', canNext && 'survey-shine')}>
                {busy === 'send' ? <Spinner className="h-4 w-4" /> : null}
                {last ? tr('Send my answers') : !answered(q, answers[q.id]) && !q.required ? tr('Skip') : tr('Next')}
                {!last && <Icon name="chevronRight" className={cx('h-4 w-4', canNext && 'survey-nudge')} strokeWidth={2.4} />}
              </button>
            </div>
          </div>
        )}

        {stage === 'decline' && (
          <div key="decline" className="animate-survey-in">
            <p className="text-[15px] leading-relaxed text-ink">{tr('This really helps us make the community better for you, and it only takes about {n} minute.', { n: mins })}</p>
            <p className="mt-2 text-[13px] leading-relaxed text-smoke">{tr('Every answer is read by the team. You can still say no.')}</p>
            <button type="button" onClick={() => { setDir(1); setStage('questions') }} className="btn-primary survey-shine mt-6 w-full justify-center !py-3.5 text-[15px] transition-transform duration-200 active:scale-[0.98] hoverable:hover:scale-[1.02]">
              {tr("OK, I'll help")}
            </button>
            <button type="button" onClick={decline} disabled={!!busy} className="btn-secondary mt-2.5 w-full justify-center !py-3 active:scale-[0.98]">
              {busy === 'decline' ? <Spinner className="h-4 w-4" /> : tr('No thanks')}
            </button>
          </div>
        )}

        {stage === 'sent' && (
          <div key="sent" className="animate-survey-in text-center">
            <p className="text-[15px] leading-relaxed text-smoke">
              {survey.thanks ? <TLine text={survey.thanks} /> : tr('Your answers are with the team. Every one is read.')}
            </p>
            <button type="button" onClick={onDone} className="btn-primary mx-auto mt-6 w-full justify-center !py-3.5 active:scale-[0.98]">{tr('Done')}</button>
          </div>
        )}
      </div>
    </div>
  )
}

// A SINGLE STAR, FILLED WITH A GRADIENT (2 Oct 2026). Gold to amber to the brand orange, so a chosen
// star reads warm and alive rather than as a flat orange block. `gid` ties it to the gradient the row
// defines once.
const STAR = 'M11.48 3.499a.562.562 0 0 1 1.04 0l2.125 5.111a.563.563 0 0 0 .475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 0 0-.182.557l1.285 5.385a.562.562 0 0 1-.84.61l-4.725-2.885a.563.563 0 0 0-.586 0L6.982 20.54a.562.562 0 0 1-.84-.61l1.285-5.386a.562.562 0 0 0-.182-.557l-4.204-3.602a.563.563 0 0 1 .321-.988l5.518-.442a.563.563 0 0 0 .475-.345L11.48 3.5Z'
const SPARKS = Array.from({ length: 8 }, (_, k) => {
  const a = (k / 8) * Math.PI * 2
  return { x: Math.round(Math.cos(a) * 34), y: Math.round(Math.sin(a) * 34), c: ['#fbbf24', '#f59e0b', '#d94407', '#fde68a'][k % 4] }
})
const STAR_LABELS = ['Not good', 'Could be better', 'It is okay', 'Good', 'Loved it']

function RatingAnswer({ q, value, onChange }) {
  const tr = useT()
  const gid = useId().replace(/:/g, '')
  const [hover, setHover] = useState(0)
  const shown = hover || value || 0
  return (
    <div>
      <svg width="0" height="0" aria-hidden className="absolute">
        <defs>
          <linearGradient id={`${gid}-on`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fde047" />
            <stop offset="45%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#d94407" />
          </linearGradient>
        </defs>
      </svg>
      <div className="flex items-center justify-between gap-1" role="radiogroup" aria-label={q.prompt} onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => {
          // THREE STATES, NO LOOP (4 Oct 2026). Ethan: the stars "constantly go from smaller to bigger, and some of them lose their colour
          // and appear in their colour again". Two causes: every empty star pulsed forever (`survey-twinkle`), and a star's element was
          // swapped for a new one whenever it changed state, so it blinked. Now an empty star is still; the gold star is a layer ABOVE
          // a grey one and only its opacity changes, so brightening is a cross-fade that cascades from the first star to the last. A
          // hovered star shows the gold at 55%, a chosen one at full strength, and only the star you press pops.
          const chosen = (value || 0) >= n
          const lit = shown >= n
          const bright = chosen && (!hover || hover >= n) ? 1 : lit ? 0.55 : 0
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={value === n}
              aria-label={String(n)}
              onMouseEnter={() => setHover(n)}
              onFocus={() => setHover(n)}
              onBlur={() => setHover(0)}
              onClick={() => onChange(n)}
              className="relative flex aspect-square flex-1 items-center justify-center rounded-2xl outline-none transition-transform duration-200 active:scale-90 focus-visible:ring-2 focus-visible:ring-brand hoverable:hover:-translate-y-1"
            >
              {value === n && SPARKS.map((sp, k) => (
                <span key={`${value}-${k}`} aria-hidden className="survey-spark" style={{ '--x': `${sp.x}px`, '--y': `${sp.y}px`, background: sp.c }} />
              ))}
              <span className={cx('relative block', value === n && 'survey-star-in')} style={{ '--d': '0ms' }}>
                <svg viewBox="0 0 24 24" className="h-10 w-10 sm:h-11 sm:w-11" aria-hidden>
                  <path d={STAR} fill="#e5e7eb" stroke="#d1d5db" strokeWidth="0.6" strokeLinejoin="round" />
                </svg>
                <svg
                  viewBox="0 0 24 24"
                  className="absolute inset-0 h-10 w-10 sm:h-11 sm:w-11"
                  style={{ opacity: bright, transform: `scale(${bright === 1 ? 1 : 0.92})`, transition: `opacity 260ms ease, transform 260ms ease`, transitionDelay: bright ? `${(n - 1) * 45}ms` : '0ms', filter: bright === 1 ? 'drop-shadow(0 5px 7px rgba(217,68,7,0.35))' : 'none' }}
                  aria-hidden
                >
                  <path d={STAR} fill={`url(#${gid}-on)`} stroke="#d94407" strokeWidth="0.6" strokeLinejoin="round" />
                </svg>
              </span>
            </button>
          )
        })}
      </div>
      <p key={shown} className="survey-label mt-3 h-5 text-center text-sm font-bold text-brand">
        {shown ? tr(STAR_LABELS[shown - 1]) : <span className="font-medium text-gray-400">{tr('Tap a star')}</span>}
      </p>
    </div>
  )
}

function ScaleAnswer({ q, value, onChange }) {
  const tr = useT()
  return (
    <div>
      <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-11" role="radiogroup" aria-label={q.prompt}>
        {Array.from({ length: 11 }, (_, n) => {
          const on = value === n
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => onChange(n)}
              className="group relative flex h-11 items-center justify-center rounded-xl text-sm font-bold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-brand"
            >
              <span className={cx(
                'absolute inset-0 rounded-xl border-2 transition-all duration-200',
                on ? 'scale-105 border-transparent bg-gradient-to-br from-brand-light to-brand shadow-card' : 'border-gray-100 bg-white group-hover:-translate-y-0.5 group-hover:border-brand/40',
              )} />
              {on && <span key={value} aria-hidden className="survey-ripple absolute inset-0 rounded-xl bg-brand/40" />}
              <span key={on ? `on${value}` : 'off'} className={cx('relative', on ? 'survey-pop text-white' : 'text-ink')}>{n}</span>
            </button>
          )
        })}
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-gray-100">
        <div
          className={cx('h-full rounded-full bg-gradient-to-r from-brand-light to-brand transition-[width] duration-500 ease-out', value != null && 'survey-shine')}
          style={{ width: value == null ? '0%' : `${(value / 10) * 100}%` }}
        />
      </div>
      <div className="mt-2 flex justify-between text-[11px] font-semibold text-gray-400">
        <span>{tr('Not at all')}</span><span>{tr('Definitely')}</span>
      </div>
    </div>
  )
}

// YES AND NO, WITH THEIR MARKS DRAWN (2 Oct 2026). Ethan: "there seems to be something weird with the
// animations and style" when picking one. The old buttons toggled their background, border and scale
// all at once and fought their own hover lift. Now the colour is a layer that fades in, the tick or
// cross is drawn as a stroke, the other answer steps back, and a ripple leaves the one that was chosen.
function YesNoAnswer({ q, value, onChange }) {
  const tr = useT()
  const opts = [['yes', tr('Yes'), 'M5 12.5l4.5 4.5L19 7.5', 24], ['no', tr('No'), 'M6 6l12 12M18 6L6 18', 34]]
  return (
    <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label={q.prompt}>
      {opts.map(([k, label, d, len]) => {
        const on = value === k
        const other = value != null && !on
        return (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(k)}
            className={cx(
              'group relative flex h-24 flex-col items-center justify-center gap-1.5 overflow-hidden rounded-2xl text-[15px] font-bold outline-none transition-all duration-300 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-brand',
              other ? 'scale-[0.97] opacity-60' : 'hoverable:hover:-translate-y-0.5',
            )}
          >
            <span aria-hidden className={cx('absolute inset-0 rounded-2xl border-2 bg-white transition-colors duration-300', on ? 'border-transparent' : 'border-gray-100 group-hover:border-brand/40')} />
            <span aria-hidden className={cx('absolute inset-0 rounded-2xl bg-gradient-to-br from-brand-light to-brand shadow-card transition-opacity duration-300', on ? 'opacity-100' : 'opacity-0')} />
            {on && <span key={value} aria-hidden className="survey-ripple absolute left-1/2 top-1/2 -ml-8 -mt-8 h-16 w-16 rounded-full bg-white/60" />}
            <span className={cx('relative flex h-9 w-9 items-center justify-center rounded-full transition-colors duration-300', on ? 'bg-white/25 text-white' : 'bg-cloud text-smoke group-hover:text-brand')}>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path key={on ? 'drawn' : 'still'} className={on ? 'survey-draw' : undefined} style={{ '--len': len }} d={d} />
              </svg>
            </span>
            <span className={cx('relative transition-colors duration-300', on ? 'text-white' : 'text-ink')}>{label}</span>
          </button>
        )
      })}
    </div>
  )
}

function ChoiceAnswer({ q, value, onChange }) {
  const tr = useT()
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
            style={{ animationDelay: `${k * 45}ms` }}
            className={cx(
              'animate-fade-up group relative flex w-full items-center gap-3 overflow-hidden rounded-2xl border-2 px-4 py-3 text-left text-[15px] font-semibold outline-none transition-[border-color,transform] duration-200 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-brand',
              on ? 'border-transparent' : 'border-gray-100 hoverable:hover:translate-x-0.5 hoverable:hover:border-brand/40',
            )}
          >
            <span aria-hidden className={cx('absolute inset-0 origin-left bg-gradient-to-r from-brand to-brand-light transition-transform duration-400 ease-out', on ? 'scale-x-100' : 'scale-x-0')} />
            <span className={cx('relative flex h-6 w-6 shrink-0 items-center justify-center border-2 transition-all duration-300', multi ? 'rounded-md' : 'rounded-full', on ? 'scale-110 border-white bg-white text-brand' : 'border-gray-300')}>
              {on && <Icon name="check" className="survey-pop h-3.5 w-3.5" strokeWidth={3} />}
            </span>
            <span className={cx('relative min-w-0 flex-1 transition-colors duration-300', on ? 'text-white' : 'text-ink')}><TLine text={o} /></span>
          </button>
        )
      })}
      {multi && <p className="pt-1 text-[12px] text-gray-400">{tr('Pick as many as you like.')}</p>}
    </div>
  )
}

function Answer({ q, value, onChange }) {
  const tr = useT()
  if (q.type === 'rating') return <RatingAnswer q={q} value={value} onChange={onChange} />
  if (q.type === 'scale') return <ScaleAnswer q={q} value={value} onChange={onChange} />
  if (q.type === 'yesno') return <YesNoAnswer q={q} value={value} onChange={onChange} />
  if (q.type === 'choice' || q.type === 'multi') return <ChoiceAnswer q={q} value={value} onChange={onChange} />
  return (
    <div className="relative">
      <textarea
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
        rows={4}
        maxLength={2000}
        placeholder={tr('Write your answer…')}
        className="input no-ios-zoom min-h-[7rem] resize-none rounded-2xl text-[15px] transition-shadow duration-300 focus:shadow-[0_0_0_4px_rgba(217,68,7,0.12)]"
      />
      {(value || '').length > 0 && <span className="survey-label absolute bottom-2.5 right-3.5 text-[11px] font-semibold tabular-nums text-gray-400">{(value || '').length}/2000</span>}
    </div>
  )
}
