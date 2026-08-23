import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Spinner } from '../../components/ui'
import Icon from '../../components/Icon'
import Turnstile from '../../components/Turnstile'
import AuthShell, { DemoCaptcha } from './AuthShell'
import { useDemoMode } from '../../lib/demoMode'
import { cx } from '../../lib/utils'

// PUBLIC CREATOR SIGNUP.
//
// New accounts are creators by default; admins are promoted later (see README →
// "Making an account an admin"). `?demo=1`, for an admin only, renders this page
// inertly inside the Testing Centre: no redirect when somebody who is already
// signed in looks at it, no account created, and a placeholder where the
// captcha goes. See lib/demoMode.
//
// WHAT CHANGED, AND WHY IT MATTERED
//
// Three fields, a tick box and a button is not much to get wrong, and this form
// got two things wrong anyway. Every failure - a short password, an unticked
// box, an address already registered - arrived as one red line UNDER the whole
// form, so it said that something was wrong and never which thing. And the
// password field said "at least 8 characters" and then told you off after you
// pressed the button, which is the wrong order for a rule you could simply
// show being met.
//
// So: errors live on the field they belong to and appear as you leave it, the
// password has a four-block strength meter and a reveal, and the button says
// what is stopping it rather than sitting there greyed out and silent.

/**
 * How strong, 0-4, and what to say about it.
 *
 * Deliberately not a zxcvbn-style entropy estimate: this gate exists to stop
 * "password1", not to resist an offline attack on a hash nobody has. Length is
 * most of it, because length is most of it.
 */
export function passwordScore(pw = '') {
  if (!pw) return { score: 0, label: '' }
  let n = 0
  if (pw.length >= 8) n += 1
  if (pw.length >= 12) n += 1
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) n += 1
  if (/\d/.test(pw) || /[^\w\s]/.test(pw)) n += 1
  // A PASSWORD TOO SHORT TO ACCEPT STILL SCORES ONE, NEVER ZERO.
  // Zero draws four empty blocks and no words under a field somebody is
  // actively typing into, which reads as the meter being broken rather than as
  // the password being weak.
  if (pw.length < 8) n = 1
  const label = ['', 'Too easy to guess', 'Passable', 'Good', 'Strong'][n]
  return { score: n, label }
}

export default function Signup() {
  const { on: demo } = useDemoMode()
  const { signUp, user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const ref = searchParams.get('ref') // referral code from a creator's invite link

  const [values, setValues] = useState({ name: '', email: '', password: '' })
  const [touched, setTouched] = useState({})
  const [formError, setFormError] = useState('')
  const [checkEmail, setCheckEmail] = useState(false)
  const [busy, setBusy] = useState(false)
  const [reveal, setReveal] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaKey, setCaptchaKey] = useState(0)
  const [agreed, setAgreed] = useState(false)
  const formRef = useRef(null)

  const set = (patch) => { setFormError(''); setValues((v) => ({ ...v, ...patch })) }
  const touch = (k) => setTouched((t) => ({ ...t, [k]: true }))

  const pw = useMemo(() => passwordScore(values.password), [values.password])

  // WHAT IS WRONG, FIELD BY FIELD. One function, so the button's disabled state
  // and the messages under the fields can never disagree about whether the form
  // is ready.
  const problems = {
    name: !values.name.trim() ? 'We need something to call you.' : '',
    email: !values.email.trim()
      ? 'Your email address goes here.'
      : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())
        ? 'That does not look like an email address.'
        : '',
    password: !values.password
      ? 'Pick a password.'
      : values.password.length < 8
        ? 'Eight characters minimum.'
        : '',
  }
  const ready = !problems.name && !problems.email && !problems.password && agreed

  // Count one click per browser per referral code, so referrers can see their
  // invite-link funnel (clicks → signed up → approved) on the Refer page.
  useEffect(() => {
    if (!ref || demo) return
    const key = `tryp_ref_click_${ref}`
    try {
      if (localStorage.getItem(key)) return
      localStorage.setItem(key, '1')
    } catch { /* private mode: still count the click */ }
    supabase.rpc('increment_referral_click', { code: ref }).then(() => {})
  }, [ref, demo])

  // Navigate declaratively once the session is really in context, for the same
  // reason as Login: navigating straight after signUp() raced the auth state and
  // could bounce back through /login. Onboarding is guarded, so we only move once
  // `user` exists (email confirmation is off, so a session always follows signup).
  useEffect(() => {
    if (demo) return
    if (user) navigate('/onboarding', { replace: true })
  }, [user, navigate, demo])

  async function handleSubmit(e) {
    e.preventDefault()
    setFormError('')
    setTouched({ name: true, email: true, password: true, agreed: true })
    if (demo) { setFormError('Sandbox: no account was created.'); return }
    // Read from the fields too (browser autofill may not fire React onChange).
    const field = (id) => formRef.current?.querySelector('#' + id)?.value
    const nameVal = (field('name') || values.name).trim()
    const emailVal = (field('email') || values.email).trim()
    const passVal = field('password') || values.password
    if (nameVal !== values.name || emailVal !== values.email || passVal !== values.password) {
      setValues({ name: nameVal, email: emailVal, password: passVal })
    }
    if (!nameVal || !emailVal || passVal.length < 8 || !agreed) return

    setBusy(true)
    const { data, error } = await signUp(emailVal, passVal, nameVal, ref, captchaToken)
    if (error) {
      setBusy(false)
      setFormError(friendly(error.message))
      setCaptchaToken(''); setCaptchaKey((k) => k + 1) // tokens are single-use; reset for retry
      return
    }
    // If email confirmation is enabled in Supabase, there's no session yet, so
    // the effect above won't fire - prompt them to confirm. Otherwise leave
    // `busy` true and let the effect navigate once `user` lands.
    if (!data.session) { setBusy(false); setCheckEmail(true) }
  }

  if (checkEmail) {
    return (
      <AuthShell
        title="Check your inbox"
        subtitle={`We have sent a confirmation link to ${values.email}. Open it, log in, and you can start your application.`}
      >
        <div className="space-y-4">
          <div className="flex items-start gap-3 rounded-xl bg-cloud px-4 py-3.5 text-sm text-smoke">
            <Icon name="envelope" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <span>Nothing after a couple of minutes? It is almost always in spam, filed under whatever your provider thinks a new account looks like.</span>
          </div>
          <Link to="/login" className="btn-primary w-full">Go to log in</Link>
        </div>
      </AuthShell>
    )
  }

  const show = (k) => touched[k] && problems[k]

  return (
    <AuthShell
      title="Join the programme"
      subtitle="One page now, a short application after it. Most people are through in under five minutes."
      footer={<span>Already in? <Link to="/login" className="font-medium text-brand hover:underline">Log in</Link></span>}
    >
      {ref && (
        <div className="mb-6 flex items-start gap-3 rounded-xl border border-brand/25 bg-brand-tint/50 px-4 py-3.5">
          <Icon name="heart" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <p className="text-sm text-ink">
            <span className="font-semibold text-brand">A creator sent you here.</span>{' '}
            They get credit when you are approved, which is how this community grows.
          </p>
        </div>
      )}

      <form ref={formRef} onSubmit={handleSubmit} noValidate className="space-y-5">
        <Field
          id="name" label="Your name" autoComplete="name"
          placeholder="First and last"
          value={values.name} onChange={(v) => set({ name: v })} onBlur={() => touch('name')}
          error={show('name')}
          hint="However you want to be credited. You can change it later."
        />

        <Field
          id="email" label="Email" type="email" autoComplete="email"
          placeholder="you@example.com"
          value={values.email} onChange={(v) => set({ email: v })} onBlur={() => touch('email')}
          error={show('email')}
        />

        <div>
          <label htmlFor="password" className="label">Password</label>
          <div className="relative">
            <input
              id="password"
              type={reveal ? 'text' : 'password'}
              autoComplete="new-password"
              className="input pr-12"
              aria-invalid={show('password') ? 'true' : undefined}
              value={values.password}
              onChange={(e) => set({ password: e.target.value })}
              onBlur={() => touch('password')}
              placeholder="Eight characters or more"
            />
            <button
              type="button"
              onClick={() => setReveal((r) => !r)}
              className="pw-reveal"
              aria-label={reveal ? 'Hide password' : 'Show password'}
            >
              <Icon name={reveal ? 'ban' : 'eye'} className="h-4 w-4" />
            </button>
          </div>
          {/* THE METER IS ONLY THERE ONCE THERE IS SOMETHING TO MEASURE. Four
              empty blocks under an empty field is a rule being announced before
              anybody has tried to break it. */}
          {values.password && (
            <>
              <div className="pw-meter" aria-hidden>
                {[1, 2, 3, 4].map((n) => (
                  <span key={n} className="pw-seg" data-on={pw.score >= n ? String(pw.score) : '0'} />
                ))}
              </div>
              <p className={cx('mt-1.5 text-xs', pw.score >= 3 ? 'text-green-700' : 'text-smoke')}>
                {pw.label}
              </p>
            </>
          )}
          {show('password') && (
            <p className="field-error"><Icon name="alert" className="h-3.5 w-3.5" />{problems.password}</p>
          )}
        </div>

        <label className={cx(
          'flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition-colors',
          agreed ? 'border-brand/30 bg-brand-tint/25' : 'border-gray-200 hover:border-gray-300',
        )}>
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => { setAgreed(e.target.checked); setFormError('') }}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
          />
          <span className="text-xs leading-relaxed text-smoke">
            I agree to the{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline">Terms of Service</a>{' '}
            and{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline">Privacy Policy</a>,
            and to represent Tryp.com honestly in anything I post.
          </span>
        </label>

        {formError && (
          <p role="alert" className="flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{formError}</span>
          </p>
        )}

        {demo ? <DemoCaptcha /> : <Turnstile key={captchaKey} onToken={setCaptchaToken} />}

        {/* THE BUTTON SAYS WHAT IS STOPPING IT. A disabled primary button with
            no explanation is the single most common dead end in a sign-up form:
            somebody has filled everything in, the button is grey, and there is
            nothing on the screen that says the tick box is the problem. */}
        <button type="submit" disabled={busy || !captchaToken || !ready} className="btn-primary w-full">
          {busy
            ? <Spinner />
            : !captchaToken ? 'Checking you are human…'
              : !agreed ? 'Agree to the terms to continue'
                : 'Create my account'}
        </button>

        <p className="text-center text-xs leading-relaxed text-smoke">
          Creating an account does not put you in the programme - it opens the application. A person on
          the team reads every one.
        </p>
      </form>
    </AuthShell>
  )
}

/** One labelled input, its hint and its error, so all three cannot drift. */
function Field({ id, label, hint, error, value, onChange, onBlur, type = 'text', ...rest }) {
  return (
    <div>
      <label htmlFor={id} className="label">{label}</label>
      <input
        id={id}
        type={type}
        className="input"
        aria-invalid={error ? 'true' : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        {...rest}
      />
      {error
        ? <p className="field-error"><Icon name="alert" className="h-3.5 w-3.5" />{error}</p>
        : hint ? <p className="mt-1.5 text-xs text-smoke">{hint}</p> : null}
    </div>
  )
}

/**
 * Supabase's own wording, translated.
 *
 * "User already registered" is the one that matters: it is the most common
 * failure on this form and the raw string reads like a database complaint
 * rather than the very ordinary thing that has just happened.
 */
function friendly(message = '') {
  const m = message.toLowerCase()
  if (m.includes('already registered') || m.includes('already exists')) {
    return 'There is already an account on that email. Try logging in, or reset the password.'
  }
  if (m.includes('captcha')) return 'The human check did not go through. Give it a moment and try again.'
  if (m.includes('rate limit') || m.includes('too many')) return 'That is a lot of attempts. Wait a minute and try again.'
  if (m.includes('password')) return 'That password was refused: eight characters or more, please.'
  return message || 'That did not go through. Try again in a moment.'
}
