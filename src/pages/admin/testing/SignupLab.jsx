import { useState } from 'react'
import { LabPage, Panel, Note, Stage, useStage, Choice, KeyVal, Code, InfoList } from './kit'

// THE FRONT DOOR, LIVE, AT A REAL WIDTH.
//
// Each of these is the real public route running in a same-origin iframe with
// `?demo=1` on it. Two reasons it is a frame and not an inline render:
//
//   1. A CSS media query reads the BROWSER viewport, so a 390px-wide box on a
//      laptop still gets every desktop rule. Inline, the "phone" preview was a
//      desktop layout in a narrow column and the "desktop" preview was not a
//      desktop at all. In a frame the breakpoints are real.
//   2. An admin looking at the log-in page is already signed in, and the page
//      correctly redirects them home. `?demo=1` makes it inert - and it only
//      does anything at all for an admin. See lib/demoMode.

const SCREENS = [
  {
    value: 'landing', label: 'Landing', title: 'The public landing page',
    src: '/?demo=1', device: 'desktop',
    blurb: 'The only page an unauthenticated stranger sees. Its live numbers, creator map and featured creators come from four anonymous read-only database functions, so nothing about a creator is exposed to build it.',
  },
  {
    value: 'signup', label: 'Sign up', title: 'Creating an account',
    src: '/signup?demo=1', device: 'phone',
    blurb: 'Name, email, password, and an explicit agreement to the terms and privacy policy. Referral links land here with a code in the address, and the click is counted once per browser.',
  },
  {
    value: 'login', label: 'Log in', title: 'Coming back',
    src: '/login?demo=1', device: 'phone',
    blurb: 'Reads the fields directly as well as through React state, because browser autofill can populate the form without firing a change event. That was a real bug: people had to type their password twice.',
  },
  {
    value: 'forgot', label: 'Forgot password', title: 'Asking for a reset link',
    src: '/forgot-password?demo=1', device: 'phone',
    blurb: 'The reply never says whether an account exists. Confirming an email address is registered is an information leak, so the wording covers both cases.',
  },
  {
    value: 'reset', label: 'Set a new password', title: 'The page the email link opens',
    src: '/reset-password?demo=1', device: 'phone',
    blurb: 'Opened with a recovery session already active, so all it asks for is the new password twice. An expired link is named as expired rather than reported as a failure.',
  },
]

export default function SignupLab() {
  const stage = useStage('desktop')
  const [screen, setScreen] = useState('landing')
  const current = SCREENS.find((s) => s.value === screen) || SCREENS[0]

  // Switching screens also switches to the width that screen is FOR. The
  // landing page is a desktop page that works on a phone; the auth pages are
  // phone pages that work on a desktop. Opening each at its own size is the
  // difference between showing somebody the product and showing them a box.
  function pick(v) {
    setScreen(v)
    stage.onDevice(SCREENS.find((s) => s.value === v)?.device || 'phone')
  }

  return (
    <LabPage
      title="The public pages"
      icon="globe"
      subtitle="Everything a stranger can reach without an account, running here rather than pictured. Switch between phone, tablet and desktop to show the whole thing is built for a phone first."
    >
      <Panel i={0} title="Which screen" hint="Each is the real component, made inert so nothing can be created, signed in or reset from inside the Testing Centre.">
        <Choice options={SCREENS} value={screen} onChange={pick} />
        <div className="mt-5">
          <p className="text-sm font-semibold">{current.title}</p>
          <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-smoke">{current.blurb}</p>
        </div>
      </Panel>

      <Stage {...stage} key={current.value} src={current.src} label={current.title} />

      <Panel
        i={1}
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

      <Panel i={2} title="What a new account can actually do" hint="Nothing, is the answer, and that is the whole design.">
        <InfoList
          items={[
            { icon: 'ban', t: 'It cannot read a room', d: 'Row level security gates every read on being an active member, in a security definer function. There is no client-side check to bypass.' },
            { icon: 'ban', t: 'It cannot post anything', d: 'Writes are gated separately on whether you are allowed to post, which a pending account is not.' },
            { icon: 'ban', t: 'It cannot reach any page but onboarding', d: 'And after that, the review screen. The route guard fails closed: a status it does not recognise is refused, not allowed.' },
            { icon: 'check', t: 'It can be deleted by the person who made it', d: 'Thirty day grace period, then the account and its files go together.' },
          ]}
        />
      </Panel>

      <Panel i={3} title="Referral links" hint="Every creator has one. It is the same sign-up page with a code on the end.">
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
