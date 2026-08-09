import { Link, useNavigate } from 'react-router-dom'
import Icon from './Icon'
import { cx } from '../lib/utils'

// Back, at the top left, on every page you can arrive at from somewhere else.
//
// The shell has a nav bar and a tab bar, so nobody is ever truly stuck. But
// "not stuck" is a low bar: a creator who taps Connections from the hub, reads
// a profile, comes back and wants the hub again has to work out which of five
// tabs they came from. The browser back button does it on desktop and is a
// swipe most people do not know about on iOS, so the affordance has to be on
// the page.
//
// HISTORY FIRST, FALLBACK SECOND. `navigate(-1)` is right when there is
// somewhere to go back TO, and wrong on a cold load from a notification or a
// shared link, where it would take the creator out of the app entirely. The
// length check is how you tell the two apart.
export default function BackLink({ to = '/global', label = 'Back', className }) {
  const navigate = useNavigate()
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1

  const classes = cx(
    'group -ml-1 mb-4 inline-flex items-center gap-1 rounded-full py-1 pl-1 pr-3 text-sm font-medium text-smoke',
    'transition-colors hover:text-brand',
    className,
  )

  const inner = (
    <>
      <span className="flex h-6 w-6 items-center justify-center rounded-full transition-transform duration-200 group-hover:-translate-x-0.5">
        <Icon name="chevronLeft" className="h-4 w-4" />
      </span>
      {label}
    </>
  )

  if (canGoBack) {
    return (
      <button type="button" onClick={() => navigate(-1)} className={classes} aria-label="Go back">
        {inner}
      </button>
    )
  }
  return <Link to={to} className={classes}>{inner}</Link>
}
