import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Spinner } from '../../components/ui'
import Turnstile from '../../components/Turnstile'
import AuthShell from './AuthShell'

// Step 1 of the reset flow: enter your email → Supabase sends a reset link
// that lands on /reset-password.
export default function ForgotPassword() {
  const { sendPasswordReset } = useAuth()
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaKey, setCaptchaKey] = useState(0)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setBusy(true)
    const emailVal = (e.target.querySelector('#email')?.value || email).trim()
    const { error } = await sendPasswordReset(emailVal, captchaToken)
    setBusy(false)
    if (error) {
      setError(error.message)
      setCaptchaToken(''); setCaptchaKey((k) => k + 1)
    } else setSent(true)
  }

  if (sent) {
    return (
      <AuthShell title="Email on its way ✉️" subtitle={`If an account exists for ${email}, you'll receive a reset link shortly. Check your spam folder too.`}>
        <Link to="/login" className="btn-primary w-full">Back to log in</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title="Reset your password"
      subtitle="Enter your email and we'll send you a secure reset link."
      footer={<Link to="/login" className="font-medium text-brand hover:underline">← Back to log in</Link>}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" required className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
        <Turnstile key={captchaKey} onToken={setCaptchaToken} />
        <button type="submit" disabled={busy || !captchaToken} className="btn-primary w-full">
          {busy ? <Spinner /> : captchaToken ? 'Send reset link' : 'Verifying…'}
        </button>
      </form>
    </AuthShell>
  )
}
