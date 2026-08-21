import { useState } from 'react'
import Signup from '../../auth/Signup'
import Login from '../../auth/Login'
import ForgotPassword from '../../auth/ForgotPassword'
import ResetPassword from '../../auth/ResetPassword'
import Landing from '../../Landing'
import { LabPage, Panel, Note, Stage, useStage, Choice, KeyVal, Code } from './kit'

// THE FRONT DOOR, LIVE.
//
// These are the real public pages, rendered inside the admin panel. They are
// inert (see the `demo` prop on each): an admin looking at the log-in page is
// already signed in, and without that prop the page would immediately redirect
// them to the home page, which is exactly what it is supposed to do in real
// life and exactly what makes it impossible to look at.
//
// The Landing page is included because it is the only page on this platform a
// stranger sees, and it is worth showing next to the ones behind the door.

const SCREENS = [
  {
    value: 'landing', label: 'Landing', title: 'The public landing page',
    blurb: 'The only page an unauthenticated stranger sees. Its live numbers, creator map and featured creators come from four anonymous read-only database functions, so nothing about a creator is exposed to build it.',
    render: () => <Landing demo />,
    height: 900,
  },
  {
    value: 'signup', label: 'Sign up', title: 'Creating an account',
    blurb: 'Name, email, password, and an explicit agreement to the terms and privacy policy. Referral links land here with a code in the address, and the click is counted once per browser.',
    render: () => <Signup demo />,
  },
  {
    value: 'login', label: 'Log in', title: 'Coming back',
    blurb: 'Reads the fields directly as well as through React state, because browser autofill can populate the form without firing a change event. That was a real bug: people had to type their password twice.',
    render: () => <Login demo />,
  },
  {
    value: 'forgot', label: 'Forgot password', title: 'Asking for a reset link',
    blurb: 'The reply never says whether an account exists. Confirming an email address is registered is an information leak, so the wording covers both cases.',
    render: () => <ForgotPassword demo />,
  },
  {
    value: 'reset', label: 'Set a new password', title: 'The page the email link opens',
    blurb: 'Opened with a recovery session already active, so all it asks for is the new password twice. An expired link is named as expired rather than reported as a failure.',
    render: () => <ResetPassword demo />,
  },
]

export default function SignupLab() {
  const stage = useStage('phone')
  const [screen, setScreen] = useState('signup')
  const current = SCREENS.find((s) => s.value === screen) || SCREENS[1]

  return (
    <LabPage
      title="Sign up and log in"
      icon="key"
      subtitle="The five public pages, running here rather than pictured. Switch between them, and switch between phone, tablet and desktop to show the whole thing is built for a phone first."
    >
      <Panel title="Which screen" hint="Each is the real component, made inert so nothing can be created, signed in or reset from inside the Testing Centre.">
        <Choice options={SCREENS} value={screen} onChange={setScreen} />
        <div className="mt-5">
          <p className="text-sm font-semibold">{current.title}</p>
          <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-smoke">{current.blurb}</p>
        </div>
      </Panel>

      <Stage {...stage} height={current.height || 800} label={current.title}>
        {current.render()}
      </Stage>

      <Panel
        title="What guards the front door"
        hint="Four things, none of which are visible on the page itself."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <KeyVal
            rows={[
              ['Captcha', 'Cloudflare Turnstile on sign up, log in and reset'],
              ['Rate limit', '5 attempts per 15 minutes, per address'],
              ['Where that runs', 'auth-gate edge function, before Supabase'],
              ['Password minimum', '8 characters'],
              ['Email confirmation', 'Off. A session follows sign up immediately'],
              ['Session length', 'One week, refreshed silently'],
            ]}
          />
          <div className="space-y-4">
            <Note>
              <p className="font-semibold text-ink">Signing up does not get you in.</p>
              <p>
                A new account is created with the status pending. Onboarding is the only page it can
                reach, and after that the review screen, until an admin approves the application. The
                route guard fails closed: an unknown status never reaches the app.
              </p>
            </Note>
            <Code>{`ALLOWED_STATUSES = ['active', 'muted']

pending   ->  review screen
declined  ->  declined screen
suspended ->  suspended screen
anything else -> review screen`}</Code>
          </div>
        </div>
      </Panel>

      <Panel title="Referral links" hint="Every creator has one. It is the same sign-up page with a code on the end.">
        <Code>{`https://trypcreators.vercel.app/signup?ref=MAYA7K

1. The click is counted once per browser, per code.
2. The new account is stamped with the referrer.
3. The referral shows as "Signing up" on the referrer's page.
4. It only COUNTS when that creator submits a video to a challenge.`}</Code>
        <Note className="mt-4">
          <p>
            That last rule is deliberate and it is the reason the referral numbers are worth anything. A
            referral that counts on sign up rewards people for creating accounts. See the creator journey
            lab for the four stages drawn out.
          </p>
        </Note>
      </Panel>
    </LabPage>
  )
}
