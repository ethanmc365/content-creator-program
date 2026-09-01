import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Spinner } from '../../components/ui'
import Turnstile from '../../components/Turnstile'
import AuthShell, { DemoCaptcha } from './AuthShell'
import { useDemoMode } from '../../lib/demoMode'
import { useT } from '../../lib/i18n'

// Public creator signup. New accounts are creators by default - // admins are promoted later (see README → "Making an account an admin").
// `?demo=1`, for an admin only, renders this page inertly inside the Testing
// Centre: no redirect when somebody who is already signed in looks at it, no
// account created, and a placeholder where the captcha goes. See lib/demoMode.
export default function Signup() {
  const tr = useT()
  const { on: demo, asked: demoAsked } = useDemoMode()
  // A `type="password"` field makes macOS offer to fill or save a password. In
  // the Testing Centre that is a system dialog thrown over a demo that cannot
  // accept a password anyway, on every single screen. The field is inert in demo
  // mode, so it does not need to be a password field.
  const pwProps = demoAsked
    ? { type: 'text', autoComplete: 'off', name: 'demo-field', 'data-1p-ignore': 'true', 'data-lpignore': 'true' }
    : { type: 'password', autoComplete: 'new-password' }
  const { signUp, user } = useAuth()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const ref = searchParams.get('ref') // referral code from a creator's invite link
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaKey, setCaptchaKey] = useState(0)
  const [agreed, setAgreed] = useState(false)

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
    if (demoAsked) return
    if (user) navigate('/onboarding', { replace: true })
  }, [user, navigate, demoAsked])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (demo) { setError('Sandbox: no account was created.'); return }
    // Read from the fields too (browser autofill may not fire React onChange).
    const field = (id) => e.target.querySelector('#' + id)?.value
    const nameVal = (field('name') || name).trim()
    const emailVal = (field('email') || email).trim()
    const passVal = field('password') || password
    if (passVal.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (!agreed) {
      setError('Please agree to the Terms and Privacy Policy to continue.')
      return
    }
    setBusy(true)
    const { data, error } = await signUp(emailVal, passVal, nameVal, ref, captchaToken)
    if (error) {
      setBusy(false)
      setError(error.message)
      setCaptchaToken(''); setCaptchaKey((k) => k + 1) // tokens are single-use; reset for retry
      return
    }
    // If email confirmation is enabled in Supabase, there's no session yet, so
    // the effect above won't fire - prompt them to confirm. Otherwise leave
    // `busy` true and let the effect navigate once `user` lands.
    if (!data.session) { setBusy(false); setError('CHECK_EMAIL') }
  }

  if (error === 'CHECK_EMAIL') {
    return (
      <AuthShell title={tr("Check your inbox 📬")} subtitle="We've sent you a confirmation link. Click it, then log in to start your onboarding.">
        <Link to="/login" className="btn-primary w-full">{tr("Go to log in")}</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={tr("Join the community")}
      subtitle="Create your creator account. It takes a minute."
      footer={<span>{tr("Already a member?")} <Link to="/login" className="font-medium text-brand hover:underline">{tr("Log in")}</Link></span>}
    >
      {ref && (
        <p className="mb-5 rounded-xl bg-brand-tint px-4 py-3 text-center text-sm font-medium text-brand">
          {tr("You were invited by a Tryp.com creator. Welcome aboard!")}
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="name" className="label">{tr("Your name")}</label>
          <input id="name" type="text" required className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("e.g. Amelia Hart")} />
        </div>
        <div>
          <label htmlFor="email" className="label">{tr("Email")}</label>
          <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder={tr("you@example.com")} />
        </div>
        <div>
          <label htmlFor="password" className="label">{tr("Password")}</label>
          <input id="password" {...pwProps} required minLength={8} className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder={tr("At least 8 characters")} />
        </div>

        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

        <label className="flex items-start gap-3 text-xs text-smoke">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => { setAgreed(e.target.checked); setError('') }}
            className="mt-0.5 h-4 w-4 shrink-0 accent-brand"
          />
          <span>
            I agree to the{' '}
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline">{tr("Terms of Service")}</a>{' '}
            and{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline">{tr("Privacy Policy")}</a>,
            and to represent Tryp.com honestly in my content.
          </span>
        </label>

        {demo ? <DemoCaptcha /> : <Turnstile key={captchaKey} onToken={setCaptchaToken} />}

        <button type="submit" disabled={busy || !captchaToken || !agreed} className="btn-primary w-full">
          {busy ? <Spinner /> : captchaToken ? 'Create account' : 'Verifying…'}
        </button>
      </form>
    </AuthShell>
  )
}
