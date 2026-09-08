import { Link } from 'react-router-dom'
import { CopyButton, Skeleton } from '../ui'
import Icon from '../Icon'
import { cx, formatDateTimeTz } from '../../lib/utils'

// THE PIECES BOTH CREATOR POPUPS ARE BUILT FROM.
//
// Ethan: "the admin popup that shows whenever you click on a creator's name - I
// really like how that looks, and I think it looks better than the actual popup
// that shows when you click on a creator on the creator dashboard. So take some
// inspiration from that one, build and add it to the other one, like the way
// the contact details show up etc. And the other UI things, like improving the
// buttons and the layout - I don't like how there's four buttons on one row and
// then one button on the next row, it just looks bad."
//
// There were two panels about the same person, written weeks apart, and the
// newer one was better. The obvious move is to copy its markup across, and that
// is the move that guarantees they diverge again the next time either is
// touched - which is exactly how they came to differ in the first place.
//
// So the SHAPES live here and both panels import them. A change to how a
// contact row looks is one edit, in one file, and it is impossible for the two
// popups to disagree about it.
//
// WHAT STAYS DIFFERENT IS DELIBERATE AND IS ABOUT AUTHORITY, NOT STYLE. The
// roster's sheet carries suspend, promote, password reset and delete; the
// profile popup carries none of them. That is not an inconsistency to iron out
// - anything that changes an account belongs on the page you deliberately went
// to, not on a card that opens when you press a name.

/**
 * One destination, as a tile.
 *
 * A TILE AND NOT A BUTTON, AND THAT IS THE LAYOUT COMPLAINT ANSWERED. The
 * roster had five full-width pill buttons wrapping onto two rows - four, then a
 * lonely fifth - which is the "it just looks bad" Ethan describes, and it is
 * also the wrong signal: a pill is what this design language uses for an ACTION,
 * and these are places to go. A fixed grid cannot wrap into an orphan, and four
 * even tiles read as one control with four choices.
 */
export function PageTile({ to, onClose, icon, label }) {
  return (
    <Link
      to={to}
      onClick={onClose}
      className="flex flex-col items-center gap-1.5 rounded-xl border border-gray-100 px-2 py-3 text-center text-[11px] font-semibold text-smoke transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/40 hoverable:hover:text-brand"
    >
      <Icon name={icon} className="h-4 w-4" />
      {label}
    </Link>
  )
}

/**
 * A contact detail, with the one action it has attached to it.
 *
 * The roster had these as a `<dl>` of bare label/value pairs with a copy button
 * squeezed against the text, and the value truncated - so an email long enough
 * to matter was the one you could not read. A row per detail gives the value the
 * width, `select-all` makes a double-click take the whole thing, and the copy
 * button has somewhere to sit.
 */
export function ContactRow({ icon, label, value, empty, loading }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-white/70 px-3.5 py-2.5">
      <Icon name={icon} className="h-4 w-4 shrink-0 text-brand" />
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-semibold uppercase tracking-wide text-brand/70">{label}</span>
        {loading
          ? <Skeleton className="mt-1 h-4 w-32 rounded" />
          : value
            ? <span className="block select-all break-all text-sm font-medium text-ink">{value}</span>
            : <span className="block text-sm text-gray-400">{empty}</span>}
      </span>
      {!loading && value && <CopyButton value={value} label={`Copy ${label.toLowerCase()}`} className="!h-7 !w-7 shrink-0" />}
    </div>
  )
}

/** One number about a creator. `null` draws a skeleton rather than a zero. */
export function StatTile({ label, value, accent }) {
  return (
    <div className={cx('rounded-xl border px-3 py-2.5 text-center',
      accent ? 'border-brand/25 bg-brand-tint/30' : 'border-gray-100')}>
      {value === null || value === undefined
        ? <Skeleton className="mx-auto h-5 w-8 rounded" />
        : <p className={cx('text-lg font-bold tabular-nums', accent && 'text-brand')}>{value}</p>}
      <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
    </div>
  )
}

/**
 * The creator's recent entries.
 *
 * ONE LIST, TWO PANELS. The roster drew a bordered pill per row inside a 176px
 * scroller; the profile popup drew a divided list with the view count on the
 * right. The second is better at the job - a divided list reads as a table of
 * the same thing repeated, and the number somebody is looking for is in a
 * column rather than buried in a run-on line of metadata.
 */
export function EntryList({ entries, limit = 6 }) {
  if (!entries?.length) return null
  return (
    <ul className="divide-y divide-gray-100 overflow-hidden rounded-card border border-gray-100">
      {entries.slice(0, limit).map((s) => (
        <li key={s.id} className="flex items-center gap-3 px-3.5 py-2.5">
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold">{s.challenges?.title || 'A challenge'}</span>
            <span className="block truncate text-[11px] text-smoke">
              {s.platform || '—'} · {formatDateTimeTz(s.submitted_at)}
            </span>
          </span>
          <span className="shrink-0 text-xs font-semibold tabular-nums">
            {(s.logged_views ?? 0).toLocaleString()}
          </span>
          {s.video_url && (
            <a
              href={s.video_url}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 text-[11px] font-semibold text-brand hover:underline"
            >
              Watch ↗
            </a>
          )}
        </li>
      ))}
    </ul>
  )
}

/** A small all-caps heading. Used above every block in both panels. */
export function SheetLabel({ children, meta }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
      {children}
      {meta && <span className="ml-2 font-normal normal-case tracking-normal text-gray-300">{meta}</span>}
    </p>
  )
}
