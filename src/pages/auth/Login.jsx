import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Spinner } from '../../components/ui'
import Turnstile from '../../components/Turnstile'
import AuthShell, { DemoCaptcha } from './AuthShell'
import { useDemoMode } from '../../lib/demoMode'

// `?demo=1`, admins only, renders this page inertly for the Testing Centre.
export default function Login() {
  const { on: demo, asked: demoAsked } = useDemoMode()
  // A `type="password"` field makes macOS offer to fill or save a password. In
  // the Testing Centre that is a system dialog thrown over a demo that cannot
  // accept a password anyway, on every single screen. The field is inert in demo
  // mode, so it does not need to be a password field.
  const pwProps = demoAsked
    ? { type: 'text', autoComplete: 'off', name: 'demo-field', 'data-1p-ignore': 'true', 'data-lpignore': 'true' }
    : { type: 'password', autoComplete: 'current-password' }
  const { signIn, user } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaKey, setCaptchaKey] = useState(0)

  // Navigate DECLARATIVELY once the session is actually in context. Calling
  // navigate('/home') straight after signIn() raced the auth state: setSession
  // updates supabase, but React's `user` was still null for a tick, so
  // ProtectedRoute saw no user and bounced back to /login with empty fields -
  // the "have to enter my details twice" bug. Waiting for `user` to appear
  // removes the window entirely: we only leave /login once we're truly signed in.
  useEffect(() => {
    if (demoAsked) return
    if (user) navigate('/home', { replace: true })
  }, [user, navigate, demoAsked])

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (demo) { setError('Sandbox: nobody was signed in.'); return }
    // Read straight from the fields too: browser autofill can populate the DOM
    // without firing React's onChange, which would otherwise submit blank creds
    // on the first try (the "enter it twice" bug).
    const emailVal = (e.target.email?.value || email).trim()
    const passVal = e.target.password?.value || password
    setBusy(true)
    const { error } = await signIn(emailVal, passVal, captchaToken)
    if (error) {
      setBusy(false)
      setError(error.message === 'Invalid login credentials' ? 'Email or password is incorrect. Try again.' : error.message)
      setCaptchaToken(''); setCaptchaKey((k) => k + 1) // tokens are single-use; reset for retry
      return
    }
    // Success: leave `busy` true and let the effect above navigate once `user`
    // lands, so the button never flips back to an enabled "Log in" state (which
    // looked like the form had cleared) during the redirect.
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Log in to the Tryp.com Content Creator Community."
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
          <input id="password" {...pwProps} required className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" />
        </div>

        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

        {demo ? <DemoCaptcha /> : <Turnstile key={captchaKey} onToken={setCaptchaToken} />}

        <button type="submit" disabled={busy || !captchaToken} className="btn-primary w-full">
          {busy ? <Spinner /> : captchaToken ? 'Log in' : 'Verifying…'}
        </button>
      </form>
    </AuthShell>
  )
}
