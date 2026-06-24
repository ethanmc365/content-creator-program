import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Spinner } from '../../components/ui'
import Turnstile from '../../components/Turnstile'
import AuthShell from './AuthShell'

// Public creator signup. New accounts are creators by default - // admins are promoted later (see README → "Making an account an admin").
export default function Signup() {
  const { signUp } = useAuth()
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

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
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
    setBusy(false)
    if (error) {
      setError(error.message)
      setCaptchaToken(''); setCaptchaKey((k) => k + 1) // tokens are single-use; reset for retry
      return
    }
    // If email confirmation is enabled in Supabase, there's no session yet.
    if (data.session) navigate('/onboarding')
    else setError('CHECK_EMAIL')
  }

  if (error === 'CHECK_EMAIL') {
    return (
      <AuthShell title="Check your inbox 📬" subtitle="We've sent you a confirmation link. Click it, then log in to start your onboarding.">
        <Link to="/login" className="btn-primary w-full">Go to log in</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Join the program"
      subtitle="Create your creator account. It takes a minute."
      footer={<span>Already a member? <Link to="/login" className="font-medium text-brand hover:underline">Log in</Link></span>}
    >
      {ref && (
        <p className="mb-5 rounded-xl bg-brand-tint px-4 py-3 text-center text-sm font-medium text-brand">
          You were invited by a Tryp.com creator. Welcome aboard!
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="name" className="label">Your name</label>
          <input id="name" type="text" required className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Amelia Hart" />
        </div>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" type="password" required autoComplete="new-password" minLength={8} className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
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
            <a href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline">Terms of Service</a>{' '}
            and{' '}
            <a href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline">Privacy Policy</a>,
            and to represent Tryp.com honestly in my content.
          </span>
        </label>

        <Turnstile key={captchaKey} onToken={setCaptchaToken} />

        <button type="submit" disabled={busy || !captchaToken || !agreed} className="btn-primary w-full">
          {busy ? <Spinner /> : captchaToken ? 'Create account' : 'Verifying…'}
        </button>
      </form>
    </AuthShell>
  )
}
