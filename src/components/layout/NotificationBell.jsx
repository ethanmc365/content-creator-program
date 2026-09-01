import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import Icon from '../Icon'
import { timeAgo, cx } from '../../lib/utils'
import { FILTERS, groupByAge, matchesFilter, metaFor, useNotifications } from '../../lib/notifications'
import { useT } from '../../lib/i18n'

// THE NOTIFICATION CENTRE.
//
// What was here was a LIST OF THE LAST TWELVE THINGS with a "mark all read"
// link over it. Everything wrong with it came from the same place: it was a
// read-only log, so the only thing you could do to a notification was look at
// it, and the only way it ever left was by falling off the bottom.
//
//   NOTHING COULD BE CLEARED. Not one row, not the whole list. So the panel a
//   regular here opens is a dozen things that already happened, with the two
//   that matter somewhere among them.
//   NOTHING COULD BE FILTERED. A message somebody is waiting on a reply to and
//   an announcement from three weeks ago were the same kind of row.
//   NOTHING WAS DATED except by "3 days ago" on each row, which is twenty
//   separate small sums for the reader to do.
//   IT OPENED AND CLOSED WITH ONE CANNED CLASS and its rows did not move at
//   all - so dismissing, had it existed, would have had nowhere to go.
//
// So: rows can be dismissed one at a time and read ones cleared in a batch,
// there is a filter row over them, they are grouped under headings that say
// when, and every one of those operations has motion that says what happened -
// the panel unfolds from the bell, the rows land one after another, a dismissed
// row slides out to the right and the ones under it close the gap.
//
// The data and every operation live in lib/notifications, shared with the
// /notifications page, which is now the same centre with room to breathe.
//
// NO MOTION IMPORT. This is in the app shell, which every creator downloads on
// every page, so all of it is CSS - see the `notif-*` keyframes in index.css.

/** One row. Whole row opens it; the cross on the right takes it away. */
function NotificationRow({ n, leaving, onOpen, onDismiss, i }) {
  const tr = useT()
  const meta = metaFor(n.type)
  return (
    <div
      className={cx(
        'group/row relative flex items-stretch',
        leaving ? 'notif-leave' : 'notif-enter',
      )}
      style={leaving ? undefined : { '--notif-i': Math.min(i, 8) }}
    >
      <button
        onClick={() => onOpen(n)}
        className={cx(
          'flex min-w-0 flex-1 items-start gap-3 rounded-xl py-2.5 pl-6 pr-9 text-left transition-colors duration-150',
          n.read ? 'hover:bg-cloud' : 'bg-brand-tint/45 hover:bg-brand-tint/70',
        )}
      >
        <span
          className={cx(
            'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-transform duration-200 group-hover/row:scale-110',
            n.read ? 'bg-cloud text-smoke' : 'bg-brand text-white',
          )}
          aria-hidden
        >
          <Icon name={meta.icon} className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cx('block text-sm leading-snug', n.read ? 'font-medium text-ink' : 'font-semibold text-ink')}>
            {n.title}
          </span>
          {n.body && <span className="mt-0.5 line-clamp-2 block text-xs leading-snug text-smoke">{n.body}</span>}
          <span className="mt-1 flex items-center gap-1.5 text-[11px] text-gray-400">
            {/* The kind of thing it is, then when. The label is the one piece
                of context a title cannot always carry: "Sam Rivera" tells you
                nothing until you know it is a connection request. */}
            <span className="font-medium uppercase tracking-wide text-gray-400">{meta.label}</span>
            <span aria-hidden>·</span>
            {timeAgo(n.created_at)}
          </span>
        </span>
      </button>

      {/* THE UNREAD DOT AND THE DISMISS BUTTON SHARE ONE CORNER, because they
          are never both the thing you want: while you are reading the list the
          dot is the information, and the moment you reach for the row you are
          about to act on it. So the dot fades out and the cross fades in under
          the pointer, in the same place, and neither one ever moves the layout.
          On touch, where there is no hover, the cross is simply always there -
          `group-hover` never latches, so a phone gets the affordance and a
          desktop gets the clean list. */}
      {!n.read && (
        <span
          /* THE UNREAD DOT IS ON THE LEFT, AWAY FROM THE DISMISS BUTTON.
             It was at right-3 top-4 and the X occupies right-1.5 top-2 in a
             28px box, so the dot sat inside the button - "the live dot and
             the X overlap". They were also two different meanings stacked in
             one corner: one says this is new, the other throws it away.
             Unread belongs at the start of the row, which is where every
             other list in the app puts it. */
          className="pointer-events-none absolute left-1.5 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-brand transition-opacity duration-150 group-hover/row:opacity-0"
          aria-label={tr("Unread")}
        />
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(n.id) }}
        aria-label={tr("Dismiss this notification")}
        className={cx(
          'absolute right-1.5 top-2 flex h-7 w-7 items-center justify-center rounded-full text-gray-400',
          'transition-all duration-150 hover:bg-white hover:text-ink hover:shadow-card active:scale-90',
          'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100',
          '[@media(hover:none)]:opacity-100',
        )}
      >
        <Icon name="close" className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export default function NotificationBell() {
  const tr = useT()
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState('all')
  const panelRef = useRef(null)

  const {
    items, loading, leaving, unread, readCount,
    markRead, markAllRead, dismiss, clearRead,
  } = useNotifications({
    userId: user?.id,
    pathname: location.pathname,
    pushPrefs: profile?.notif_prefs,
    limit: 30,
  })

  // THE BELL RINGS WHEN SOMETHING ARRIVES. One shake, only when the count goes
  // UP, and never on the first paint - a bell that swings because a page
  // finished loading its own history is a bell nobody trusts the second time.
  const [ringing, setRinging] = useState(false)
  const seenRef = useRef(null)
  useEffect(() => {
    if (loading) return undefined
    const prev = seenRef.current
    seenRef.current = unread
    if (prev === null || unread <= prev) return undefined
    setRinging(true)
    const t = setTimeout(() => setRinging(false), 900)
    return () => clearTimeout(t)
  }, [unread, loading])

  // Close on a click outside, and on Escape - a panel you can only shut by
  // finding the button again is a panel that traps a keyboard.
  useEffect(() => {
    if (!open) return undefined
    const onClick = (e) => { if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // The filter resets when the panel closes. A filter that survives being shut
  // is a panel that opens tomorrow showing you a subset for reasons you have
  // long forgotten, with an empty state that looks like a bug.
  useEffect(() => { if (!open) setFilter('all') }, [open])

  // WHERE THE BOTTOM OF THE BELL IS, for the phone layout above. Measured
  // rather than hard-coded, because the header is a different height once it
  // carries the safe-area inset of an installed app.
  const [sheetTop, setSheetTop] = useState(56)
  useLayoutEffect(() => {
    if (!open) return
    const r = panelRef.current?.getBoundingClientRect()
    if (r) setSheetTop(Math.round(r.bottom + 8))
  }, [open])

  function openNotification(n) {
    setOpen(false)
    if (!n.read) markRead(n.id)
    if (n.link) navigate(n.link)
  }

  const rows = (items || []).filter((n) => matchesFilter(n, filter))
  const groups = groupByAge(rows)
  // The index a row is at across the whole list, so the entrance ladder runs
  // down the panel rather than restarting inside every heading.
  const order = new Map(rows.map((n, i) => [n.id, i]))

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className={cx(
          'relative rounded-full p-2.5 transition-all duration-200 hover:bg-cloud active:scale-95',
          open ? 'bg-cloud text-ink' : 'text-smoke hover:text-ink',
        )}
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
      >
        <svg
          className={cx('h-5 w-5', ringing && 'notif-ring')}
          style={{ transformOrigin: '50% 15%' }}
          fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unread > 0 && (
          // `key` on the count, so the badge re-mounts and re-plays its pop
          // every time the number changes rather than silently swapping digits.
          <span
            key={unread}
            className="notif-badge absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {/* The panel unfolds from its own top-right corner, which is where the
          bell is. It used to be `animate-fade-up`, which rises from BELOW - so
          a panel hanging off a bell in the top bar arrived by travelling
          upwards, away from the button that opened it. */}
      {/* FULL WIDTH ON A PHONE. A 21rem card hanging off the right of a 375px
          screen is a column with a margin on one side and nothing on the other,
          and the notification text - a sentence with a name and a room in it -
          wrapped to four lines inside it. Ethan: "the panel should be a
          full-width card rather than a narrow one on the right." It keeps its
          anchored width from `sm` up, where it is a dropdown under a bell
          rather than the whole screen. */}
      {open && (
        // ON A PHONE IT IS PINNED TO THE VIEWPORT, NOT HUNG OFF THE BELL.
        //
        // THE BUG THIS FIXES. It was made full-width (`w-[calc(100vw-1.5rem)]`)
        // but left anchored to the bell with `right-0` - and the bell is not at
        // the right edge of the header, the avatar is. So a 351px panel hanging
        // off a button 64px in from the edge started at x = -5 and ran off the
        // LEFT of the screen, with a band of empty space on the right. Ethan:
        // "it's cut off on the left side. I mentioned I wanted it moved
        // centered, but you didn't actually center it."
        //
        // A full-width card cannot be positioned relative to a button that is
        // not centred; it has to be positioned relative to the thing it is
        // full-width OF. So below `sm` it is `fixed` with an even inset on both
        // sides, and from `sm` up it goes back to being the dropdown under a
        // bell that it always was.
        // The offset goes through a CUSTOM PROPERTY rather than an inline
        // `top`, so that `sm:top-auto` can still win above the breakpoint - an
        // inline style beats every class and would have pinned the desktop
        // dropdown to a measured phone offset.
        <div
          style={{ '--bell-top': `${sheetTop}px` }}
          className={cx(
            'z-40 overflow-hidden rounded-card border border-gray-100 bg-white shadow-lift animate-menu-in',
            'fixed inset-x-3 top-[var(--bell-top)] origin-top',
            'sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[23rem] sm:origin-top-right',
          )}>
          <div className="flex items-center justify-between gap-2 px-4 pb-2.5 pt-3.5">
            <p className="text-sm font-semibold">
              Notifications
              {unread > 0 && <span className="ml-1.5 text-xs font-medium text-brand">{unread} new</span>}
            </p>
            {unread > 0 && (
              <button onClick={markAllRead} className="shrink-0 text-xs font-medium text-brand transition-transform duration-150 hover:scale-105">
                {tr("Mark all read")}
              </button>
            )}
          </div>

          {/* THE FILTER ROW IS ONLY WORTH ITS SPACE ONCE THERE IS SOMETHING TO
              FILTER. Four pills over three notifications is chrome. */}
          {(items || []).length > 4 && (
            <div className="flex gap-1.5 px-4 pb-2.5">
              {FILTERS.map((f) => {
                const on = filter === f.key
                const n = (items || []).filter((x) => matchesFilter(x, f.key)).length
                if (!n && f.key !== 'all') return null
                return (
                  <button
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    aria-pressed={on}
                    className={cx(
                      'rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all duration-150',
                      on ? 'bg-brand text-white' : 'bg-cloud text-smoke hover:text-ink',
                    )}
                  >
                    {f.label}
                    {f.key !== 'all' && <span className={cx('ml-1', on ? 'text-white/70' : 'text-gray-400')}>{n}</span>}
                  </button>
                )
              })}
            </div>
          )}

          <div className="max-h-[26rem] overflow-y-auto overscroll-contain px-2 pb-1">
            {loading ? (
              <div className="space-y-2 p-2">
                {[0, 1, 2].map((i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-cloud" />)}
              </div>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-tint text-brand">
                  <Icon name="check" className="h-5 w-5" />
                </span>
                <p className="text-sm font-medium text-ink">
                  {filter === 'all' ? "You're all caught up." : 'Nothing here.'}
                </p>
                {filter !== 'all' && (
                  <button onClick={() => setFilter('all')} className="text-xs font-medium text-brand hover:underline">
                    {tr("Show everything")}
                  </button>
                )}
              </div>
            ) : (
              groups.map(([heading, group]) => (
                <div key={heading}>
                  <p className="px-2.5 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                    {heading}
                  </p>
                  {group.map((n) => (
                    <NotificationRow
                      key={n.id} n={n} i={order.get(n.id)}
                      leaving={leaving.has(n.id)}
                      onOpen={openNotification}
                      onDismiss={dismiss}
                    />
                  ))}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-3 py-2">
            <Link to="/notifications" onClick={() => setOpen(false)} className="rounded-lg px-2 py-1.5 text-sm font-medium text-brand transition-colors hover:bg-cloud">
              {tr("View all")}
            </Link>
            {/* CLEARING WHAT YOU HAVE READ, NOT CLEARING EVERYTHING - the unread
                ones are the entire point of the panel, and a button whose most
                likely use is a mistake does not belong next to them. */}
            {readCount > 0 && (
              <button onClick={clearRead} className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-smoke transition-colors hover:bg-cloud hover:text-ink">
                <Icon name="trash" className="h-3.5 w-3.5" />
                Clear {readCount} read
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
