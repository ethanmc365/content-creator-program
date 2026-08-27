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

const SignupLab = lazy(() => import('./testing/SignupLab'))
const OnboardingLab = lazy(() => import('./testing/OnboardingLab'))
const InvoiceLab = lazy(() => import('./testing/InvoiceLab'))
const ViewsLab = lazy(() => import('./testing/ViewsLab'))

export const LABS = [
  {
    key: 'signup', title: 'The public pages', icon: 'globe', group: 'Joining the programme',
    blurb: 'What a stranger sees: the landing page, sign up, log in and the password reset, live at any screen size.',
    tags: ['5 screens', 'Inert'],
    element: <SignupLab />,
  },
  {
    key: 'onboarding', title: 'Onboarding flow', icon: 'pencil', group: 'Joining the programme',
    blurb: 'All nine screens a new creator fills in after signing up, and everything the platform writes when they finish.',
    tags: ['9 screens', 'Live components'],
    element: <OnboardingLab />,
  },
  {
    key: 'invoice', title: 'Automatic invoicing', icon: 'money', group: 'Money',
    blurb: 'A prize is won and its invoice raises itself. Walk the whole chain, from the reward row to the sent PDF.',
    tags: ['Real functions'],
    element: <InvoiceLab />,
  },
  {
    key: 'views', title: 'View counts', icon: 'eye', group: 'The programme',
    blurb: 'Paste any post link and see exactly what the automatic sync reads from it, platform by platform.',
    tags: ['Live', 'Reads nothing'],
    element: <ViewsLab />,
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
          <span className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center text-brand">
            <Icon name="device" className="h-7 w-7" />
          </span>
          <div>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Testing Centre</h1>
          </div>
        </div>
      </div>

      <SandboxLine />

      {/* ONE GRID, NOT SIX SECTIONS.
          It used to be five named groups with a heading above each, which on a
          laptop meant scrolling past three headings to reach the invoice lab
          and made a page of eighteen small cards nearly two thousand pixels
          tall. The grouping was orientation, and orientation is what you need
          the first time; every time after that it is furniture between you and
          the thing you came for. The group is a word on the card now. */}
      <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
        {LABS.map((l, i) => (
          <Link
            key={l.key}
            to={`/admin/testing/${l.key}`}
            style={{ '--lab-i': i }}
            className="lab-card group relative flex items-start gap-3.5 overflow-hidden rounded-card border border-gray-100 bg-white p-4 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lift"
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center text-brand transition-transform duration-200 group-hover:scale-110">
              <Icon name={l.icon} className="h-[22px] w-[22px]" />
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
