import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import { Spinner } from '../../components/ui'
import Icon from '../../components/Icon'
import Turnstile from '../../components/Turnstile'
import AuthShell, { DemoCaptcha } from './AuthShell'
import { useDemoMode } from '../../lib/demoMode'
import { LOCALES, loadLocale, setLocale, useT } from '../../lib/i18n'
import { loadOverrides } from '../../lib/translations'
import GoogleButton from '../../components/GoogleButton'

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
  const { signUp, user, profile, signOut } = useAuth()
  const [claiming, setClaiming] = useState(false)
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const ref = searchParams.get('ref') // referral code from a creator's invite link
  // A TEAM INVITE, WHICH IS A DIFFERENT KIND OF LINK ENTIRELY. `ref` credits a
  // creator for bringing somebody in; `team` says the person following it is
  // applying to work on the programme rather than to create for it. It grants
  // nothing - see migration 280 - so the only thing it changes here is what the
  // page says, and the fact that the token is kept for `claim_team_invite` once
  // there is a session to claim it with.
  const teamToken = searchParams.get('team')
  // A VIP LINK (2 Oct 2026, migration 294): /vip/join/<token>, sent by the team straight to a creator. It is the
  // same sign-up and gathers the same profile; the token is kept until there is a session to spend it on, and
  // makes them a VIP as they finish (Onboarding claims it). Nothing here grants anything by itself.
  const { token: vipToken } = useParams()
  const [vipInvite, setVipInvite] = useState(null)
  const [teamInvite, setTeamInvite] = useState(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaKey, setCaptchaKey] = useState(0)
  const [agreed, setAgreed] = useState(false)
  const [signedUpHere, setSignedUpHere] = useState(false)

  // Is the VIP link good, and which programme is it for? Also: open the page in the programme's language
  // unless this device has already been told otherwise.
  useEffect(() => {
    if (!vipToken) return undefined
    let alive = true
    supabase.rpc('vip_invite_check', { p_token: vipToken }).then(async ({ data }) => {
      const row = Array.isArray(data) ? data[0] : data
      if (!alive) return
      setVipInvite(row?.valid ? row : { valid: false })
      if (row?.valid) {
        try { localStorage.setItem('tryp_vip_invite', vipToken) } catch { /* private mode */ }
        let chosen = false
        try { chosen = !!localStorage.getItem('tryp-locale') } catch { /* private mode */ }
        if (!chosen && row.language && LOCALES.some((l) => l.code === row.language)) {
          await Promise.all([loadLocale(row.language), loadOverrides(row.language).catch(() => {})])
          setLocale(row.language)
        }
      }
    })
    return () => { alive = false }
  }, [vipToken])

  // Is the team token real, and what does it say it is for? Answered by an
  // RPC that tells a stranger only those two things.
  useEffect(() => {
    if (!teamToken) return undefined
    let alive = true
    supabase.rpc('team_invite_check', { p_token: teamToken }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data
      if (alive) setTeamInvite(row?.valid ? row : { valid: false })
    })
    return () => { alive = false }
  }, [teamToken])

  // KEEP IT UNTIL THERE IS A SESSION TO SPEND IT ON. `claim_team_invite` runs as
  // the person who just signed up, and there is no session at the moment the
  // link is opened. Onboarding reads this back.
  useEffect(() => {
    if (!teamToken || !teamInvite?.valid) return
    try { localStorage.setItem('tryp_team_invite', teamToken) } catch { /* private mode */ }
  }, [teamToken, teamInvite])

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
    if (!user) return
    // SOMEBODY ALREADY SIGNED IN IS ASKED, NOT SWITCHED (1 Oct 2026). Opening the link used to make whoever was signed
    // in a VIP the moment the page loaded ("it just automatically logged me in with my other account"). The page now
    // says who is signed in and lets them choose; see the card below.
    if (vipToken && vipInvite?.valid && !signedUpHere) return
    if (vipToken && vipInvite === null && !signedUpHere) return
    navigate('/onboarding', { replace: true })
  }, [user, navigate, demoAsked, vipToken, vipInvite, signedUpHere])

  // The signed-in visitor chose to join with the account they are already using.
  async function joinWithThisAccount() {
    setClaiming(true)
    await supabase.rpc('claim_vip_invite', { p_token: vipToken })
    try { localStorage.removeItem('tryp_vip_invite') } catch { /* nothing to do */ }
    navigate('/vip', { replace: true })
  }
  // ...or to start again as somebody else: sign out, keep the link, and the sign-up form below is what is left.
  // A NEW ACCOUNT MADE ON THIS PAGE IS NOT ASKED "JOIN WITH THIS ACCOUNT?" (1 Oct 2026). Ethan: after "Sign out and
  // use another" and signing up, the same card came back naming the account he had just created. An account made
  // here goes straight on to the profile, where the link is claimed (Onboarding reads `tryp_vip_invite`).
  async function useAnotherAccount() {
    try { await signOut() } catch { /* the form below still works */ }
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    if (demo) { setError(tr('Sandbox: no account was created.')); return }
    // Read from the fields too (browser autofill may not fire React onChange).
    const field = (id) => e.target.querySelector('#' + id)?.value
    const nameVal = (field('name') || name).trim()
    const emailVal = (field('email') || email).trim()
    const passVal = field('password') || password
    if (passVal.length < 8) {
      setError(tr('Password must be at least 8 characters.'))
      return
    }
    if (!agreed) {
      setError(tr('Please agree to the Terms and Privacy Policy to continue.'))
      return
    }
    setBusy(true)
    setSignedUpHere(true)
    if (vipToken) { try { localStorage.setItem('tryp_vip_invite', vipToken) } catch { /* private mode */ } }
    const { data, error } = await signUp(emailVal, passVal, nameVal, ref, captchaToken)
    if (error) {
      setBusy(false)
      setSignedUpHere(false)
      // "CAN THEY STILL USE THAT EMAIL TO SIGN UP NORMALLY?" - THE ANSWER IS
      // NO, AND THE SCREEN HAS TO SAY WHICH DOOR IS THEIRS (7 Sep 2026).
      //
      // One address is one account. Somebody who joined with Google and then
      // comes back and fills this form in gets GoTrue's "User already
      // registered", which is true and useless: it does not say that the
      // account is theirs, that it works, or how to get into it.
      //
      // AND THE HINT MUST NOT BECOME AN ENUMERATION ORACLE. Knowing WHICH
      // sign-in method an address uses is exactly the fact an attacker wants
      // and the reason `sendPasswordReset` above always reports success. So
      // this never claims the account is a Google one - it names both doors and
      // lets the person who owns the address know which is theirs. Somebody
      // guessing learns only what GoTrue already told them.
      setError(/already registered|already exists/i.test(error.message)
        ? tr('That email already has an account. Log in with your password, or use Continue with Google if that is how you joined. Forgotten your password? Reset it from the log in page.')
        : error.message)
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
      <AuthShell title={tr("Check your inbox")} subtitle={tr("We have sent you a confirmation link. Open it, then log in and we will take you through the rest.")}>
        <Link to="/login" className="btn-primary w-full">{tr("Go to log in")}</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell
      title={teamInvite?.valid ? tr('Join the Tryp.com team') : vipInvite?.valid ? tr('Join the VIP creators') : tr("Join the community")}
      subtitle={teamInvite?.valid ? tr('Create your account and a short profile. It takes a couple of minutes.') : vipInvite?.valid ? null : tr("Create your creator account. It takes a minute.")}
      footer={<span>{tr("Already a member?")} <Link to="/login" className="font-medium text-brand hover:underline">{tr("Log in")}</Link></span>}
    >
      {vipToken && vipInvite && (
        vipInvite.valid ? (
          <div className="brand-drift relative mb-6 overflow-hidden rounded-2xl p-5 text-white shadow-card sm:p-6">
            <span aria-hidden className="survey-orb pointer-events-none absolute -right-10 -top-14 h-44 w-44 rounded-full bg-white/15 blur-2xl" />
            <p className="relative text-[11px] font-bold uppercase tracking-[0.16em] text-white/85">{tr('By invitation')}</p>
            {/* SHORTER (1 Oct 2026). Ethan: "just say 'Paid for every view.' Don't say 'your own page, your own rooms,
                pay per every month'". The three steps say the rest. */}
            <p className="relative mt-1 text-xl font-bold leading-snug sm:text-[22px]">{tr('Paid for every view')}</p>
            <ol className="relative mt-4 grid grid-cols-3 gap-2 text-center">
              {[tr('Make your account'), tr('Tell us about you'), tr('Your VIP page opens')].map((label, i) => (
                <li key={label} className="rounded-xl bg-white/15 px-2 py-2.5 backdrop-blur-sm">
                  <span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-white text-[11px] font-bold text-brand">{i + 1}</span>
                  <span className="mt-1.5 block text-[11px] font-semibold leading-tight">{label}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="mb-5 rounded-xl bg-cloud px-4 py-3 text-center text-sm text-smoke">
            {tr('We do not recognise that VIP link. Check you copied all of it, or ask the team to send it again. You can still sign up as a creator below.')}
          </p>
        )
      )}

      {vipToken && vipInvite?.valid && user && !demoAsked && !signedUpHere && (
        <div className="mb-6 rounded-2xl border border-gray-100 bg-white p-4 shadow-card">
          <p className="text-sm text-smoke">{tr('You are signed in as')}</p>
          <p className="truncate text-[15px] font-bold text-ink">{profile?.name || user.email}</p>
          <p className="mt-2 text-xs leading-relaxed text-smoke">{tr('Join the VIP creators with this account, or sign out and sign up as somebody new.')}</p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={joinWithThisAccount} disabled={claiming} className="btn-primary flex-1 justify-center">{claiming ? <Spinner className="h-4 w-4" /> : tr('Join with this account')}</button>
            <button type="button" onClick={useAnotherAccount} disabled={claiming} className="btn-secondary flex-1 justify-center">{tr('Sign out and use another')}</button>
          </div>
        </div>
      )}

      {ref && !teamToken && !vipToken && (
        <p className="mb-5 rounded-xl bg-brand-tint px-4 py-3 text-center text-sm font-medium text-brand">
          {tr("You were invited by a Tryp.com creator. Welcome aboard!")}
        </p>
      )}

      {/* THE PAGE SAYS WHAT YOU ARE APPLYING FOR, AND NOT WHICH JOB (29 Sep 2026).
          Ethan: "don't say sign up as market manager, just say sign up to join the
          Tryp.com team, as we might have people signing up that are not necessarily
          on the Tryp.com team." The invite can carry a role title, but that is a
          note for whoever approves it - the person following the link is told only
          that they are signing up to join the team, in three plain steps. */}
      {teamToken && teamInvite && (
        teamInvite.valid ? (
          <div className="mb-6 overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-br from-brand-tint to-white p-4 sm:p-5">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-card">
                <Icon name="shield" className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-bold leading-snug text-ink">{tr('Sign up to join the Tryp.com team')}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-smoke">{tr('Somebody on the team will look over your profile and approve you before you get in.')}</p>
              </div>
            </div>
            <ol className="mt-4 grid grid-cols-3 gap-2 text-center">
              {[tr('Make your account'), tr('Add a short profile'), tr('We approve you')].map((label, i) => (
                <li key={label} className="rounded-xl bg-white/80 px-2 py-2.5 shadow-sm">
                  <span className="mx-auto flex h-6 w-6 items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">{i + 1}</span>
                  <span className="mt-1.5 block text-[11px] font-semibold leading-tight text-ink">{label}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : (
          <p className="mb-5 rounded-xl bg-cloud px-4 py-3 text-center text-sm text-smoke">
            {tr('That team invite link has expired or been withdrawn. You can still sign up as a creator below.')}
          </p>
        )
      )}

      {!(vipToken && vipInvite?.valid && user && !demoAsked && !signedUpHere) && (<>
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="name" className="label">{tr("Your name")}</label>
          {/* NO INVENTED PERSON IN THE BOX (3 Sep 2026). Ethan: "when you click
              to sign up it shows an example name, Amelia Hart. I wouldn't put
              this in, it seems a bit of a weird example - just put in your name
              or something instead."
              A made-up full name in a field labelled "Your name" is the one
              placeholder that can be misread as content, and it made the form
              feel like a demo of itself. The field is asking for a name and
              says so in its label; the hint only needs to say which name. */}
          <input id="name" type="text" required className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={tr("Your full name")} />
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
            {tr('I agree to the {terms} and {privacy}, and to represent Tryp.com honestly in my content.')
              .split(/(\{terms\}|\{privacy\})/)
              .map((part, i) => (part === '{terms}'
                ? <a key={i} href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline">{tr("Terms of Service")}</a>
                : part === '{privacy}'
                  ? <a key={i} href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline">{tr("Privacy Policy")}</a>
                  : part))}
          </span>
        </label>

        {demo ? <DemoCaptcha /> : <Turnstile key={captchaKey} onToken={setCaptchaToken} />}

        <button type="submit" disabled={busy || !captchaToken || !agreed} className="btn-primary w-full">
          {busy ? <Spinner /> : captchaToken ? tr('Create account') : tr('Verifying…')}
        </button>
      </form>

      {/* CONTINUE WITH GOOGLE, UNDER THE FORM (7 Sep 2026).
          Ethan: "it is currently at the top but I think usually it's at the
          bottom somewhere and would make more sense there."

          It began above the form and that was the wrong way round: the email
          form is the primary path and the one this page's heading is about, so
          a third-party button over the top of it made the form look like the
          fallback and pushed the first field below the fold on a phone.

          Everything else about it is unchanged and worth restating, because it
          is the reason this needs no branch anywhere else: a Google signup is an
          `auth.users` insert like any other, so `handle_new_user` writes the
          same pending profile and ProtectedRoute sends them to the same nine
          onboarding screens. The address is registered the same way and is never
          asked for twice - onboarding has never asked for one.

          It draws nothing at all until it knows Google is configured on the
          project; the invite code is handed to it because it cannot survive the
          round trip in the URL. See lib/oauth. */}
      <div className="mt-6">
        <GoogleButton referral={ref} label={tr("Sign up with Google")} />
      </div>
      </>)}
    </AuthShell>
  )
}
