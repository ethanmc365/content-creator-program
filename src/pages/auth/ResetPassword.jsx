import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { Spinner } from '../../components/ui'
import AuthShell from './AuthShell'

// Step 2 of the reset flow: the email link opens this page with a recovery
// session already active, so we just need the new password.
export default function ResetPassword() {
  const { updatePassword } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError("Passwords don't match.")
    setBusy(true)
    const { error } = await updatePassword(password)
    setBusy(false)
    if (error) {
      setError(
        error.message.includes('session')
          ? 'This reset link has expired — request a new one from the login page.'
          : error.message
      )
      return
    }
    navigate('/home')
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Almost there — set your new password below.">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="password" className="label">New password</label>
          <input id="password" type="password" required minLength={8} autoComplete="new-password" className="input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" />
        </div>
        <div>
          <label htmlFor="confirm" className="label">Confirm new password</label>
          <input id="confirm" type="password" required className="input" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Repeat your password" />
        </div>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary w-full">
          {busy ? <Spinner /> : 'Save new password'}
        </button>
      </form>
    </AuthShell>
  )
}
