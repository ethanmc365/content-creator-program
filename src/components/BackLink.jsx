import { Link, useLocation, useNavigate } from 'react-router-dom'
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
// IN-APP HISTORY, NOT `history.length` (20 Oct 2026). `history.length` counts pages from before the app was opened
// too, so a profile opened from a shared link would "go back" out of the app. The router's first entry has the key
// 'default'; anything else was reached by navigating inside the app, and Back (button, Cmd+[, swipe) lands on that
// page with its tab, list and scroll position put back (lib/restorable + AppLayout's scroll memory).
export default function BackLink({ to = '/global', label = 'Back', className }) {
  const tr = useT()
  const navigate = useNavigate()
  const { key } = useLocation()
  const canGoBack = key !== 'default'

  // ON A PHONE IT IS JUST THE ARROW, in a round white button so it still reads as a control. The label joins it from
  // `sm` up, where the space is free, and stays in the accessible name everywhere.
  const classes = cx(
    'group -ml-1 mb-2 inline-flex h-9 items-center gap-1.5 rounded-full border border-gray-200 bg-white pl-2 pr-2 text-sm font-semibold text-ink shadow-sm animate-back-in sm:mb-4 sm:pr-4',
    'transition-[transform,box-shadow,color] duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:text-brand hoverable:hover:shadow-md active:scale-95',
    className,
  )

  const inner = (
    <>
      <span className="flex h-5 w-5 items-center justify-center transition-transform duration-200 group-hover:-translate-x-0.5">
        <Icon name="chevronLeft" className="h-4 w-4" />
      </span>
      {/* Translated HERE: the default ("Back") is set in this signature, so a caller that passes nothing has no string to
          wrap. `tr` on an already-translated label misses and returns it unchanged. */}
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
