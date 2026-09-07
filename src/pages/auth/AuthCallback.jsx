import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { takeRef } from '../../lib/oauth'
import { AppLoader } from '../../components/ui'
import AuthShell from './AuthShell'
import { useT } from '../../lib/i18n'

// WHERE THE GOOGLE ROUND TRIP LANDS.
//
// supabase-js does the actual work: `detectSessionInUrl` is on, so the client
// sees the `?code=` in this URL, exchanges it for a session against GoTrue and
// fires `onAuthStateChange`. AuthContext is already listening. So this page has
// only three jobs, and none of them is the sign-in.
//
//   1  HOLD THE SCREEN while that exchange happens. Without a route of its own
//      the return would land on `/login`, which renders a login FORM - so
//      somebody who has just signed in with Google would watch a login page
//      appear and then vanish, which reads as the sign-in having failed and
//      then been retried. `AppLoader` is the app's own waiting state and says
//      nothing has gone wrong.
//
//   2  ATTACH THE INVITE CODE. An invite link is `/signup?ref=CODE`, and
//      nothing we attach to an OAuth request survives the trip to Google and
//      back - so the code was stashed in localStorage before we left and is
//      spent here, exactly once, through `attach_referral` (migration 196).
//      Best effort by design: a referral that cannot be attached must never be
//      allowed to fail a signup, so nothing is reported and nothing is retried.
//
//   3  SAY SO WHEN IT FAILED. Google returns errors as query parameters on this
//      URL - a refused consent screen, a misconfigured client, an expired code.
//      Left alone that is a permanent spinner, which is the worst possible
//      answer. The parameter is read and shown in the branded card, with the
//      way back.
//
// IT IS NOT CODE-SPLIT. Every other page in this app is a lazy route; this one
// is imported eagerly (see App.jsx) because it renders during a redirect, when
// the network has just been handed back from another origin and a chunk that
// fails to arrive would strand somebody mid-sign-in with no session and no
// screen. It is a few hundred bytes.
export default function AuthCallback() {
  const tr = useT()
  const navigate = useNavigate()
  const { user, sessionChecked } = useAuth()
  const [failed, setFailed] = useState(null)
  // The referral is spent ONCE. This effect re-runs whenever `user` changes and
  // an RPC fired twice would post a second "new referral signup" to every admin.
  const claimed = useRef(false)

  // Google's own refusals arrive as query parameters, and they arrive BEFORE
  // any session does - so this is read first and separately.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
    const err = q.get('error_description') || q.get('error') || hash.get('error_description') || hash.get('error')
    if (err) setFailed(err.replace(/\+/g, ' '))
  }, [])

  useEffect(() => {
    if (failed || !user) return
    if (!claimed.current) {
      claimed.current = true
      const ref = takeRef()
      // A thenable, not a promise: `.rpc(...).catch()` would throw a TypeError.
      // `.then(ok, fail)` is the shape that is safe on a supabase-js builder.
      if (ref) supabase.rpc('attach_referral', { p_code: ref }).then(() => {}, () => {})
    }
    // `/home` and not `/onboarding`: ProtectedRoute owns that decision and
    // already makes it correctly for a brand-new account (`!profile.onboarded`
    // → `/onboarding`). Sending people straight to onboarding here would be a
    // second copy of that rule, and the two would disagree the first time one
    // of them changed.
    navigate('/home', { replace: true })
  }, [user, failed, navigate])

  if (failed) {
    return (
      <AuthShell
        title={tr('That did not work')}
        subtitle="Google did not complete the sign in. Nothing was created and nothing was changed - you can try again, or use your email and password."
        footer={<span>{tr('Need a hand?')} <Link to="/login" className="font-medium text-brand hover:underline">{tr('Back to log in')}</Link></span>}
      >
        <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{failed}</p>
        <Link to="/login" className="btn-primary w-full justify-center">{tr('Try again')}</Link>
      </AuthShell>
    )
  }

  // `sessionChecked && !user` means the exchange finished and produced nothing.
  // That is a real dead end rather than a slow one, so it must not spin.
  if (sessionChecked && !user) {
    return (
      <AuthShell
        title={tr('Sign in did not complete')}
        subtitle="We did not get a session back. That usually means the link was opened twice or it has expired."
        footer={<span><Link to="/signup" className="font-medium text-brand hover:underline">{tr('Create your account')}</Link></span>}
      >
        <Link to="/login" className="btn-primary w-full justify-center">{tr('Back to log in')}</Link>
      </AuthShell>
    )
  }

  return <AppLoader label={tr('Signing you in…')} />
}
