import { lazy, Suspense } from 'react'
import { Link, useParams } from 'react-router-dom'
import Icon from '../../components/Icon'
import { PlaneLoader } from '../../components/ui'
import { NotFoundScreen } from '../../components/ErrorScreen'
import { SandboxLine } from './testing/kit'

// THE TESTING CENTRE.
//
// WHY IT EXISTS
//
// Most of what this platform does happens when nobody is looking. A cash
// reward writes a draft invoice. A challenge closes itself at local midnight
// and archives itself the next morning. A birthday card goes out at seven. An
// inactive creator gets a nudge at eight. None of that can be shown by opening
// the admin panel and pointing at it, and the only way to show it USED TO BE
// to do it for real - to a real creator, with their real name, their real bank
// details and their real inbox. That is not something to do in a meeting.
//
// So: one page per automation, every one of them driven by the SAME code the
// live platform runs, over people who do not exist. The invoice lab builds a
// real PDF with the real generator. The onboarding lab renders the real
// onboarding component. The scoring lab ranks entries with the real scoring
// function. Nothing here is a mockup, and nothing here writes anything down.
//
// WHO CAN SEE IT
//
// Nobody but an admin. The route sits under <AdminRoute /> with the rest of
// /admin, the whole tree is lazy so a creator never downloads a byte of it, and
// there is no link to it from any creator surface. See App.jsx.

const DemoScript = lazy(() => import('./testing/ScriptLab'))
const SignupLab = lazy(() => import('./testing/SignupLab'))
const OnboardingLab = lazy(() => import('./testing/OnboardingLab'))
const JourneyLab = lazy(() => import('./testing/JourneyLab'))
const InvoiceLab = lazy(() => import('./testing/InvoiceLab'))
const ChallengeLab = lazy(() => import('./testing/ChallengeLab'))
const ProgrammeLab = lazy(() => import('./testing/ProgrammeLab'))
const NotificationLab = lazy(() => import('./testing/NotificationLab'))
const EmailLab = lazy(() => import('./testing/EmailLab'))
const CronLab = lazy(() => import('./testing/CronLab'))
const FlightLab = lazy(() => import('./testing/FlightLab'))
const ToolkitLab = lazy(() => import('./testing/ToolkitLab'))
const HealthLab = lazy(() => import('./testing/HealthLab'))
const ViewsLab = lazy(() => import('./testing/ViewsLab'))
const ResultsLab = lazy(() => import('./testing/ResultsLab'))
const ProfileLab = lazy(() => import('./testing/ProfileLab'))
const SecurityLab = lazy(() => import('./testing/SecurityLab'))
const WalkthroughLab = lazy(() => import('./testing/WalkthroughLab'))

export const LABS = [
  {
    key: 'script', title: 'Demo run of show', icon: 'book', group: 'Start here',
    blurb: 'The order to show things in, what to say, and roughly how long each part takes.',
    tags: ['30 minutes'],
    element: <DemoScript />,
  },
  {
    key: 'signup', title: 'Sign up and log in', icon: 'key', group: 'Joining the programme',
    blurb: 'The real public sign-up page, the log-in page and the password reset, live at any screen size.',
    tags: ['Live screens'],
    element: <SignupLab />,
  },
  {
    key: 'onboarding', title: 'Onboarding flow', icon: 'users', group: 'Joining the programme',
    blurb: 'All eight steps of the real onboarding, prefilled, with the required-field gating working.',
    tags: ['Live screens', '8 steps'],
    element: <OnboardingLab />,
  },
  {
    key: 'walkthrough', title: 'The first five minutes', icon: 'sparkles', group: 'Joining the programme',
    blurb: 'The guided walk round the platform a new creator gets once, and the ask to put it on their home screen.',
    tags: ['Interactive', 'Runs live'],
    element: <WalkthroughLab />,
  },
  {
    key: 'journey', title: 'A creator, end to end', icon: 'plane', group: 'Joining the programme',
    blurb: 'Application to approval to first video: the review queue, the welcome email, the connect gate, the referral counting.',
    tags: ['Automation'],
    element: <JourneyLab />,
  },
  {
    key: 'invoice', title: 'Automatic invoicing', icon: 'money', group: 'Money',
    blurb: 'A cash reward raises its own invoice, snapshots the payee, queues for a second pair of eyes and generates a real PDF.',
    tags: ['Automation', 'Real PDF'],
    element: <InvoiceLab />,
  },
  {
    key: 'programme', title: 'Scoring and cost per view', icon: 'chart', group: 'Money',
    blurb: 'The three scoring modes ranking live entries, the points ledger, and what a challenge costs per thousand views.',
    tags: ['Live maths'],
    element: <ProgrammeLab />,
  },
  {
    key: 'results', title: 'Results and the podium', icon: 'trophy', group: 'The programme',
    blurb: 'Log the final views, look at standings that are still private, then publish and watch the podium and the £10 vouchers land.',
    tags: ['Interactive', 'The podium'],
    element: <ResultsLab />,
  },
  {
    key: 'challenge', title: 'Challenge lifecycle', icon: 'flag', group: 'The programme',
    blurb: 'Scheduled, published, reminded, closed, scored, published to a podium and archived. With a clock you can drag.',
    tags: ['Automation', 'Time travel'],
    element: <ChallengeLab />,
  },
  {
    key: 'notifications', title: 'Notifications', icon: 'bell', group: 'Automations',
    blurb: 'Every one of the nineteen kinds the platform sends, drawn as a creator sees it, plus where each one is routed.',
    tags: ['19 types'],
    element: <NotificationLab />,
  },
  {
    key: 'email', title: 'Email', icon: 'envelope', group: 'Automations',
    blurb: 'The welcome email, the invoice email, the birthday card and the nudges, rendered as they arrive.',
    tags: ['Templates'],
    element: <EmailLab />,
  },
  {
    key: 'cron', title: 'Jobs that run themselves', icon: 'clock', group: 'Automations',
    blurb: 'The seven scheduled jobs, what each one checks, and a dry run of every one of them against the demo data.',
    tags: ['Automation', 'Dry run'],
    element: <CronLab />,
  },
  {
    key: 'flight', title: 'Flight log', icon: 'plane', group: 'Toolkit',
    blurb: 'Two airport codes and a date become a boarding pass: distance, block time, time zones crossed, carbon, who flies it.',
    tags: ['Live maths'],
    element: <FlightLab />,
  },
  {
    key: 'toolkit', title: 'Text, time and media', icon: 'pencil', group: 'Toolkit',
    blurb: 'The message formatter, local time for any creator, deadline maths, and what happens to a photo or a video on upload.',
    tags: ['Live maths'],
    element: <ToolkitLab />,
  },
  {
    key: 'profile', title: 'What a profile is for', icon: 'users', group: 'Joining the programme',
    blurb: 'Every field onboarding asks for and the exact feature that breaks without it. The argument for what is required.',
    tags: ['Reference'],
    element: <ProfileLab />,
  },
  {
    key: 'security', title: 'Who can see what', icon: 'shield', group: 'Toolkit',
    blurb: 'Twelve questions about privacy, asked of five kinds of account. Every no is enforced by the database, not the interface.',
    tags: ['Reference'],
    element: <SecurityLab />,
  },
  {
    key: 'views', title: 'View counts, off the link', icon: 'eye', group: 'Toolkit',
    blurb: 'Paste a TikTok or Instagram link and see what the automatic sync reads from it. Real posts, live numbers, writes nothing.',
    tags: ['Real data', 'Read only'],
    element: <ViewsLab />,
  },
  {
    key: 'health', title: 'Live platform health', icon: 'chartPie', group: 'Toolkit',
    blurb: 'The one page here that reads real data. Row counts, storage, the scheduled jobs and the edge functions, read only.',
    tags: ['Real data', 'Read only'],
    element: <HealthLab />,
  },
]


function LabFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <PlaneLoader />
    </div>
  )
}

export default function TestingCentre() {
  const { lab } = useParams()

  if (lab) {
    const found = LABS.find((l) => l.key === lab)
    if (!found) return <NotFoundScreen />
    return <Suspense fallback={<LabFallback />}>{found.element}</Suspense>
  }

  return (
    <div className="page mx-auto max-w-6xl px-5 py-8 sm:py-10">
      <Link
        to="/admin"
        className="mb-6 inline-flex items-center gap-1.5 text-sm font-medium text-smoke transition-colors hover:text-brand"
      >
        <Icon name="chevronLeft" className="h-4 w-4" />
        Admin
      </Link>

      <div className="mb-7 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-4">
          <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-tint text-brand">
            <Icon name="joystick" className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Testing Centre</h1>
            <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-smoke">
              Every feature and every automation, running on people who do not exist. Press the buttons:
              raise an invoice, walk the onboarding, close a challenge and publish its podium.
            </p>
          </div>
        </div>
        <p className="shrink-0 text-xs text-smoke">
          <span className="font-semibold text-ink">{LABS.length}</span> areas
        </p>
      </div>

      <SandboxLine />

      {/* ONE GRID, NOT SIX SECTIONS.
          It used to be five named groups with a heading above each, which on a
          laptop meant scrolling past three headings to reach the invoice lab
          and made a page of eighteen small cards nearly two thousand pixels
          tall. The grouping was orientation, and orientation is what you need
          the first time; every time after that it is furniture between you and
          the thing you came for. The group is a word on the card now. */}
      <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {LABS.map((l, i) => (
          <Link
            key={l.key}
            to={`/admin/testing/${l.key}`}
            style={{ '--lab-i': i }}
            className="lab-card group relative flex items-start gap-3.5 overflow-hidden rounded-card border border-gray-100 bg-white p-4 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lift"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand transition-transform duration-200 group-hover:scale-110">
              <Icon name={l.icon} className="h-[18px] w-[18px]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold transition-colors group-hover:text-brand">{l.title}</span>
                {l.tags.includes('Real data') && (
                  <span className="shrink-0 rounded-full bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-amber-700">
                    live
                  </span>
                )}
              </span>
              <span className="mt-1 block text-[11px] leading-relaxed text-smoke">{l.blurb}</span>
              <span className="mt-2 block text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400">
                {l.group}
              </span>
            </span>
            <Icon
              name="chevronRight"
              className="mt-0.5 h-4 w-4 shrink-0 text-gray-300 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-brand"
            />
          </Link>
        ))}
      </div>
    </div>
  )
}
