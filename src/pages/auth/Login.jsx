import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Spinner } from '../../components/ui'
import Turnstile from '../../components/Turnstile'
import AuthShell from './AuthShell'

export default function Login() {
  const { signIn } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaKey, setCaptchaKey] = useState(0)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    // Read straight from the fields too: browser autofill can populate the DOM
    // without firing React's onChange, which would otherwise submit blank creds
    // on the first try (the "enter it twice" bug).
    const emailVal = (e.target.email?.value || email).trim()
    const passVal = e.target.password?.value || password
    setBusy(true)
    const { error } = await signIn(emailVal, passVal, captchaToken)
    setBusy(false)
    if (error) {
      setError(error.message === 'Invalid login credentials' ? 'Email or password is incorrect. Try again.' : error.message)
      setCaptchaToken(''); setCaptchaKey((k) => k + 1) // tokens are single-use; reset for retry
      return
    }
    navigate('/home')
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to the Tryp.com Content Creator Program."
      footer={<span>New here? <Link to="/signup" className="font-medium text-brand hover:underline">Create your account</Link></span>}
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" required autoComplete="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </div>
        <div>
          <div className="flex items-center justify-between">
            <label htmlFor="password" className="label">Password</label>
            <Link to="/forgot-password" className="mb-2 text-xs font-medium text-brand hover:underline">Forgot password?</Link>
          </div>
          <input id="password" type="password" required autoComplete="current-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>

        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

        <Turnstile key={captchaKey} onToken={setCaptchaToken} />

        <button type="submit" disabled={busy || !captchaToken} className="btn-primary w-full">
          {busy ? <Spinner /> : captchaToken ? 'Log in' : 'Verifying…'}
        </button>
      </form>
    </AuthShell>
  )
}
