import { Link, useNavigate } from 'react-router-dom'
import Icon from './Icon'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

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
  const tr = useT()
  const navigate = useNavigate()
  const canGoBack = typeof window !== 'undefined' && window.history.length > 1

  // ON A PHONE IT IS JUST THE ARROW.
  //
  // The word "Back" next to a back arrow is the arrow said twice, and on a
  // 375px screen the pair took a full-width row above every page heading. The
  // label stays from `sm` up, where the space is free and the extra clarity
  // costs nothing, and stays in the accessible name everywhere.
  const classes = cx(
    'group -ml-1 mb-2 inline-flex items-center gap-1 rounded-full py-1 pl-1 text-sm font-medium text-smoke sm:mb-4 sm:pr-3',
    'transition-colors hover:text-brand',
    className,
  )

  const inner = (
    <>
      <span className="flex h-6 w-6 items-center justify-center rounded-full transition-transform duration-200 group-hover:-translate-x-0.5">
        <Icon name="chevronLeft" className="h-4 w-4" />
      </span>
      {/* Translated HERE, not at the call site: the default ("Back") is set in
          this signature, so a caller that passes nothing has no string to wrap.
          `tr` on a value that is already Spanish is a lookup that misses and
          returns what it was given, so a caller passing its own translated
          label is unaffected. */}
      <span className="hidden sm:inline">{tr(label)}</span>
    </>
  )

  if (canGoBack) {
    return (
      <button type="button" onClick={() => navigate(-1)} className={classes} aria-label={tr("Go back")}>
        {inner}
      </button>
    )
  }
  // aria-label, not just the text, because below `sm` there IS no text.
  return <Link to={to} className={classes} aria-label={tr(label)}>{inner}</Link>
}
