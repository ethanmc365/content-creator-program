import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { EmptyState, PageHeader, Skeleton } from '../components/ui'
import Icon from '../components/Icon'
import { timeAgo, cx } from '../lib/utils'
import { FILTERS, groupByAge, matchesFilter, metaFor, useNotifications } from '../lib/notifications'

// THE WHOLE HISTORY, AND THE SAME CENTRE THE BELL IS.
//
// This page and the bell used to be two separate implementations of the same
// list, and they disagreed about nearly everything: this one held a hundred
// rows and had no realtime subscription, so it was stale the moment you opened
// it; it had its own copy of the type-to-icon table, which had drifted; and
// neither of them could dismiss anything. Both read `lib/notifications` now, so
// there is one answer to "what is in my notifications" and one set of things
// you can do to them.
//
// WHAT THIS PAGE HAS THAT THE PANEL DOES NOT: room. The panel is a glance -
// thirty rows, four filters, two-line bodies. This is the archive, so the
// bodies are not clamped, the groups have headings with counts, and the
// operations that affect a lot of rows at once live here where there is space
// to explain what they do.
//
// `live: false`. The bell is mounted in the shell on every page including this
// one, and two subscribers on the same Supabase channel topic is a duplicate
// subscription. The bell is already listening; this page reads once and lets
// navigation refresh it.

/** One row, at archive size: nothing clamped, everything dismissible. */
function Row({ n, leaving, onOpen, onDismiss, i }) {
  const meta = metaFor(n.type)
  return (
    <div
      className={cx('group/row relative flex items-stretch border-b border-gray-50 last:border-0', leaving ? 'notif-leave' : 'notif-enter')}
      style={leaving ? undefined : { '--notif-i': Math.min(i, 8) }}
    >
      <button
        onClick={() => onOpen(n)}
        className={cx(
          'flex w-full items-start gap-4 px-5 py-4 pr-14 text-left transition-colors duration-150 sm:px-7',
          n.read ? 'hover:bg-cloud/60' : 'bg-brand-tint/40 hover:bg-brand-tint/60',
        )}
      >
        <span
          className={cx(
            'mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover/row:scale-110',
            n.read ? 'bg-cloud text-smoke' : 'bg-brand text-white',
          )}
          aria-hidden
        >
          <Icon name={meta.icon} className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cx('block text-sm', n.read ? 'font-medium' : 'font-semibold')}>{n.title}</span>
          {n.body && <span className="mt-0.5 block text-sm leading-snug text-smoke">{n.body}</span>}
          <span className="mt-1.5 flex items-center gap-1.5 text-xs text-gray-400">
            <span className="font-medium uppercase tracking-wide">{meta.label}</span>
            <span aria-hidden>·</span>
            {timeAgo(n.created_at)}
            {n.link && (
              <span className="ml-1 inline-flex items-center gap-0.5 font-medium text-brand opacity-0 transition-opacity duration-150 group-hover/row:opacity-100">
                Open
                <Icon name="chevronRight" className="h-3 w-3" />
              </span>
            )}
          </span>
        </span>
      </button>

      {/* The dot and the cross share one corner - see the note in
          NotificationBell for why neither of them ever moves the layout. */}
      {!n.read && (
        <span className="pointer-events-none absolute right-6 top-6 h-2.5 w-2.5 rounded-full bg-brand transition-opacity duration-150 group-hover/row:opacity-0" aria-label="Unread" />
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onDismiss(n.id) }}
        aria-label="Dismiss this notification"
        className={cx(
          'absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-gray-400 sm:right-5',
          'transition-all duration-150 hover:bg-white hover:text-ink hover:shadow-card active:scale-90',
          'opacity-0 group-hover/row:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100',
        )}
      >
        <Icon name="close" className="h-4 w-4" />
      </button>
    </div>
  )
}

export default function Notifications() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [filter, setFilter] = useState('all')

  const {
    items, loading, leaving, unread, readCount,
    markRead, markAllRead, dismiss, clearRead,
  } = useNotifications({
    userId: user?.id,
    pathname: location.pathname,
    pushPrefs: profile?.notif_prefs,
    limit: 150,
    live: false,
  })

  function open(n) {
    if (!n.read) markRead(n.id)
    if (n.link) navigate(n.link)
  }

  const rows = (items || []).filter((n) => matchesFilter(n, filter))
  const groups = groupByAge(rows)
  // The position of each row in the WHOLE list, so the entrance ladder runs
  // straight down the page rather than restarting inside every heading. A map
  // rather than a counter incremented inside the render: a variable mutated
  // while rendering is a variable whose value depends on how many times React
  // chose to render, which is exactly what `react-hooks/immutability` is for.
  const order = new Map(rows.map((n, i) => [n.id, i]))

  return (
    <div className="page max-w-3xl">
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread` : "You're all caught up."}
        action={
          <div className="flex flex-wrap gap-2">
            {unread > 0 && <button onClick={markAllRead} className="btn-secondary !py-2.5 text-sm">Mark all read</button>}
            {readCount > 0 && (
              <button onClick={clearRead} className="btn-ghost !py-2.5 text-sm text-smoke hover:text-ink">
                <Icon name="trash" className="h-4 w-4" />
                Clear read
              </button>
            )}
          </div>
        }
      />

      {/* The same four filters as the panel, from the same table, so a "People"
          list here and a "People" list there can never mean two things. */}
      {(items || []).length > 4 && (
        <div className="mb-5 flex flex-wrap gap-2">
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
                  'rounded-full px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
                  on
                    ? 'bg-brand text-white'
                    : 'border border-gray-200 bg-white text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand',
                )}
              >
                {f.label}
                <span className={cx('ml-1.5 text-xs', on ? 'text-white/70' : 'text-gray-400')}>{n}</span>
              </button>
            )
          })}
        </div>
      )}

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (items || []).length === 0 ? (
        <EmptyState
          icon={<Icon name="bell" className="h-7 w-7" />}
          title="Nothing here yet"
          hint="Challenge launches, results, rewards and DMs will all show up here."
        />
      ) : rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-gray-200 px-6 py-12 text-center">
          <p className="text-sm font-medium text-ink">Nothing under this filter.</p>
          <button onClick={() => setFilter('all')} className="mt-2 text-sm font-medium text-brand hover:underline">
            Show everything
          </button>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map(([heading, group]) => (
            <section key={heading}>
              <p className="mb-2 flex items-baseline gap-2 text-[11px] font-bold uppercase tracking-widest text-gray-400">
                {heading}
                <span className="font-semibold text-gray-300">{group.length}</span>
              </p>
              <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
                {group.map((n) => (
                  <Row key={n.id} n={n} i={order.get(n.id)} leaving={leaving.has(n.id)} onOpen={open} onDismiss={dismiss} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  )
}
