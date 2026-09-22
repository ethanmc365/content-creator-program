import { Link } from 'react-router-dom'
import Icon from '../Icon'
import { cx } from '../../lib/utils'

// THE TITLE IS THE DOOR (22 Sep 2026).
//
// Ethan: "beside latest announcements title, today's puzzle title etc we have
// something that says all announcements with a little arrow... remove this
// button and instead make it so that clicking on the title brings you to the
// page. The title shouldn't change colour or anything but hovering over it
// should magnify it slightly so people know you can click on it."
//
// So a section heading with somewhere to go IS the link: same weight, same ink,
// a small lift in scale on hover (anchored at its left edge so it grows away
// from the icon rather than off the column), and a press state. It also gives
// the whole width of the row back to the title, which is what lets "Latest
// announcements" sit on one line on a phone.
export default function SectionTitle({ icon, to, label, children, className = '' }) {
  const inner = (
    <>
      {icon && <Icon name={icon} className="h-5 w-5 shrink-0 text-brand" />}
      <span className="min-w-0">{children}</span>
    </>
  )
  return (
    <h2 className={cx('flex min-w-0 items-center text-lg font-semibold', className)}>
      {to ? (
        <Link
          to={to}
          aria-label={label || undefined}
          title={label || undefined}
          className="inline-flex min-w-0 origin-left items-center gap-2 rounded-lg text-inherit transition-transform duration-200 ease-out hoverable:hover:scale-[1.04] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
        >
          {inner}
        </Link>
      ) : (
        <span className="inline-flex min-w-0 items-center gap-2">{inner}</span>
      )}
    </h2>
  )
}
