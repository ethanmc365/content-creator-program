import { lazy, Suspense } from 'react'
import { Link, useParams } from 'react-router-dom'
import Icon from '../../components/Icon'
import { Badge, PlaneLoader } from '../../components/ui'
import { NotFoundScreen } from '../../components/ErrorScreen'
import { SandboxLine, CardGrid } from './testing/kit'

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
const ResultsLab = lazy(() => import('./testing/ResultsLab'))
const ProfileLab = lazy(() => import('./testing/ProfileLab'))
const SecurityLab = lazy(() => import('./testing/SecurityLab'))

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
    key: 'health', title: 'Live platform health', icon: 'chartPie', group: 'Toolkit',
    blurb: 'The one page here that reads real data. Row counts, storage, the scheduled jobs and the edge functions, read only.',
    tags: ['Real data', 'Read only'],
    element: <HealthLab />,
  },
]

const GROUPS = ['Start here', 'Joining the programme', 'Money', 'The programme', 'Automations', 'Toolkit']

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

      <div className="mb-8">
        <div className="flex items-start gap-4">
          <span className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-tint text-brand">
            <Icon name="joystick" className="h-6 w-6" />
          </span>
          <div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Testing Centre</h1>
            <p className="mt-2 max-w-2xl leading-relaxed text-smoke">
              Every feature and every automation on the platform, running on people who do not exist.
              Built to be demonstrated: press the buttons, watch an invoice raise itself, walk the
              onboarding, close a challenge and publish its podium. No creator is ever involved.
            </p>
          </div>
        </div>
      </div>

      <SandboxLine />

      <div className="mt-10 space-y-10">
        {GROUPS.map((group) => {
          const items = LABS.filter((l) => l.group === group)
          if (!items.length) return null
          return (
            <section key={group}>
              <h2 className="mb-4 text-xs font-bold uppercase tracking-[0.14em] text-smoke">{group}</h2>
              <CardGrid>
                {items.map((l) => (
                  <Link
                    key={l.key}
                    to={`/admin/testing/${l.key}`}
                    className="card group flex h-full flex-col !p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
                  >
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-tint text-brand transition-transform duration-200 group-hover:scale-105">
                      <Icon name={l.icon} className="h-5 w-5" />
                    </span>
                    <p className="mt-3 font-semibold transition-colors group-hover:text-brand">{l.title}</p>
                    <p className="mt-1.5 flex-1 text-xs leading-relaxed text-smoke">{l.blurb}</p>
                    <span className="mt-3 flex flex-wrap gap-1.5">
                      {l.tags.map((t) => (
                        <Badge key={t} tone={t === 'Real data' ? 'amber' : 'grey'} className="!px-2 !py-0.5 !text-[10px]">{t}</Badge>
                      ))}
                    </span>
                  </Link>
                ))}
              </CardGrid>
            </section>
          )
        })}
      </div>

      <p className="mt-12 text-center text-xs text-smoke">
        Admins only. This whole area is behind the admin route guard, loads on demand, and is not linked
        from anywhere a creator can reach.
      </p>
    </div>
  )
}
