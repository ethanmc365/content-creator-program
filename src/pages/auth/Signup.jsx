import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Spinner } from '../../components/ui'
import AuthShell from './AuthShell'

// Public creator signup. New accounts are creators by default —
// admins are promoted later (see README → "Making an account an admin").
export default function Signup() {
  const { signUp } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    setBusy(true)
    const { data, error } = await signUp(email.trim(), password, name.trim())
    setBusy(false)
    if (error) {
      setError(error.message)
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
      subtitle="Create your Tryp.com Creator account — it takes a minute."
      footer={<span>Already a member? <Link to="/login" className="font-medium text-brand hover:underline">Log in</Link></span>}
    >
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

        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner /> : 'Create account'}
        </button>

        <p className="text-center text-xs text-smoke">
          By joining you agree to represent Tryp.com honestly in your content.
        </p>
      </form>
    </AuthShell>
  )
}
