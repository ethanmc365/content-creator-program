import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek,
} from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Badge, PageHeader, Skeleton } from '../components/ui'
import EventRsvp from '../components/EventRsvp'
import EventPolls from '../components/EventPolls'
import { SuggestEvent, EventRatingsAdmin } from '../components/EventFeedback'
import { formatDateTimeTz, cx } from '../lib/utils'
import { downloadIcs, googleCalendarUrl } from '../lib/calendar'

// Map an Events-list item to calendar fields (folds the meeting link into the
// notes so it travels into the creator's calendar app).
function toCalEvent(e) {
  const details = [e.description, e.meeting_url && `Join: ${e.meeting_url}`].filter(Boolean).join('\n\n')
  return { title: e.title, start: e.date, description: details, location: e.meeting_url || '' }
}

// "Add to calendar" split button: .ics download (Apple/Outlook/any) + a Google
// Calendar quick link. Uses a native <details> so each instance manages itself.
function AddToCalendar({ event, subtle = false }) {
  const cal = toCalEvent(event)
  const close = (el) => el.closest('details')?.removeAttribute('open')
  return (
    <details className="group relative inline-block">
      <summary className={cx(
        'inline-flex cursor-pointer list-none items-center gap-1.5 font-medium',
        subtle
          ? 'text-xs text-brand hover:underline'
          : 'btn border border-white/40 text-white hover:bg-white/10'
      )}>
        <svg viewBox="0 0 24 24" className={subtle ? 'h-3.5 w-3.5' : 'h-4 w-4'} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4"/></svg>
        Add to calendar
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-48 overflow-hidden rounded-card border border-gray-100 bg-white p-1 text-left shadow-lift">
        <button
          onClick={(e) => { downloadIcs(cal); close(e.currentTarget) }}
          className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-cloud"
        >Apple / Outlook (.ics)</button>
        <a
          href={googleCalendarUrl(cal)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => close(e.currentTarget)}
          className="block w-full rounded-lg px-3 py-2 text-left text-sm text-ink hover:bg-cloud"
        >Google Calendar ↗</a>
      </div>
    </details>
  )
}

// Events calendar: admin-created events (Q&As, content days, milestones)
// PLUS challenge start/end dates pulled in automatically so deadlines are
// impossible to miss. Month grid on top, upcoming list below.
const TYPE_META = {
  event: { emoji: '📍', tone: 'light', label: 'Event' },
  qa: { emoji: '🎤', tone: 'light', label: 'Q&A' },
  deadline: { emoji: '⏰', tone: 'red', label: 'Deadline' },
  milestone: { emoji: '🎉', tone: 'green', label: 'Milestone' },
  challenge: { emoji: '🏁', tone: 'brand', label: 'Challenge' },
  meetup: { emoji: '🤝', tone: 'light', label: 'Meet-up' },
  workshop: { emoji: '🎓', tone: 'light', label: 'Workshop' },
}
// Custom admin types fall back to a generic calendar pin.
const metaFor = (type) => TYPE_META[type] || { emoji: '📌', tone: 'grey', label: type }

export default function Events() {
  const { isAdmin } = useAuth()
  const [events, setEvents] = useState([])
  const [loading, setLoading] = useState(true)
  const [month, setMonth] = useState(new Date())
  const [selectedDay, setSelectedDay] = useState(null)

  useEffect(() => {
    async function load() {
      const [{ data: ev }, { data: ch }] = await Promise.all([
        supabase.from('events').select('*').order('date'),
        supabase.from('challenges').select('id, title, start_date, end_date').neq('status', 'draft'),
      ])
      // Merge admin events with auto-generated challenge dates.
      const challengeEvents = (ch ?? []).flatMap((c) => [
        { id: `${c.id}-start`, title: `${c.title}: starts`, date: c.start_date, type: 'challenge', link: `/challenges/${c.id}` },
        { id: `${c.id}-end`, title: `${c.title}: deadline`, date: c.end_date, type: 'deadline', link: `/challenges/${c.id}` },
      ])
      setEvents([...(ev ?? []), ...challengeEvents].sort((a, b) => new Date(a.date) - new Date(b.date)))
      setLoading(false)
    }
    load()
  }, [])

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
    const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
  }, [month])

  const eventsOn = (day) => events.filter((e) => isSameDay(new Date(e.date), day))
  const upcomingAll = events.filter((e) => new Date(e.date) >= new Date(new Date().setHours(0, 0, 0, 0)))
  const upcoming = upcomingAll.slice(0, 8)
  const nextEvent = upcomingAll[0] // featured at the top

  const dayEvents = selectedDay ? eventsOn(selectedDay) : []

  return (
    <div className="page">
      <PageHeader
        title="Events & calendar"
        subtitle="Challenge deadlines, Q&As, content days. Never miss a date."
        action={isAdmin && <Link to="/admin/events" className="btn-primary">Manage events</Link>}
      />

      {/* ---------- Next-up hero card ---------- */}
      {!loading && nextEvent && (
        <div className="relative z-10 mb-10 rounded-card bg-gradient-to-br from-brand to-brand-light p-7 text-white shadow-lift sm:p-9">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/75">Next up</p>
          <div className="mt-2 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-2xl font-bold sm:text-3xl">{metaFor(nextEvent.type).emoji} {nextEvent.title}</h2>
              <p className="mt-1 text-white/85">{formatDateTimeTz(nextEvent.date)}</p>
              {nextEvent.description && <p className="mt-2 max-w-xl text-sm text-white/80">{nextEvent.description}</p>}
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              {nextEvent.meeting_url && (
                <a href={nextEvent.meeting_url} target="_blank" rel="noopener noreferrer" className="btn bg-white text-brand hover:bg-white/90">
                  Join the call ↗
                </a>
              )}
              <AddToCalendar event={nextEvent} />
              {nextEvent.link && (
                <Link to={nextEvent.link} className="btn border border-white/40 text-white hover:bg-white/10">View →</Link>
              )}
            </div>
          </div>
          {nextEvent.rsvp_enabled && <div className="mt-5"><EventRsvp eventId={nextEvent.id} /></div>}
        </div>
      )}

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
          {/* ---------- Month grid ---------- */}
          <div className="lg:col-span-2">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="text-xl font-bold">{format(month, 'MMMM yyyy')}</h2>
              <div className="flex gap-1">
                <button onClick={() => setMonth((m) => addMonths(m, -1))} className="btn-ghost !p-2.5" aria-label="Previous month">←</button>
                <button onClick={() => setMonth(new Date())} className="btn-ghost !px-3 !py-2 text-xs">Today</button>
                <button onClick={() => setMonth((m) => addMonths(m, 1))} className="btn-ghost !p-2.5" aria-label="Next month">→</button>
              </div>
            </div>

            <div className="grid grid-cols-7 gap-px overflow-hidden rounded-card border border-gray-100 bg-gray-100 shadow-card">
              {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
                <div key={d} className="bg-cloud px-2 py-2 text-center text-[11px] font-semibold text-smoke">{d}</div>
              ))}
              {days.map((day) => {
                const todaysEvents = eventsOn(day)
                const hasEvents = todaysEvents.length > 0
                const selected = selectedDay && isSameDay(day, selectedDay)
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDay(selected ? null : day)}
                    className={cx(
                      'flex min-h-[64px] flex-col items-center gap-1 p-2 transition-colors sm:min-h-[80px]',
                      // Days with events get a soft orange wash so they stand out.
                      hasEvents ? 'bg-brand-tint/60 hover:bg-brand-tint' : 'bg-white hover:bg-cloud',
                      !isSameMonth(day, month) && 'text-gray-300',
                      selected && '!bg-brand-tint ring-1 ring-inset ring-brand/40'
                    )}
                    aria-label={`${format(day, 'd MMMM')}${todaysEvents.length ? `, ${todaysEvents.length} events` : ''}`}
                  >
                    <span className={cx(
                      'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium',
                      isToday(day) ? 'bg-brand text-white' : hasEvents && 'font-semibold text-brand'
                    )}>
                      {format(day, 'd')}
                    </span>
                    {/* A clear orange star per event (up to 3), then a +N count. */}
                    {hasEvents && (
                      <span className="flex flex-wrap items-center justify-center gap-0.5" title={todaysEvents.map((e) => e.title).join(', ')}>
                        {todaysEvents.slice(0, 3).map((e) => (
                          <svg key={e.id} className="h-3 w-3 text-brand" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                            <path d="M11.48 3.5a.56.56 0 011.04 0l2.13 4.74 5.18.53c.5.05.7.68.32 1.02l-3.87 3.46 1.1 5.09c.1.49-.43.87-.86.61L12 16.8l-4.52 2.65c-.43.26-.96-.12-.86-.61l1.1-5.09-3.87-3.46a.56.56 0 01.32-1.02l5.18-.53 2.13-4.74z"/>
                          </svg>
                        ))}
                        {todaysEvents.length > 3 && (
                          <span className="text-[9px] font-semibold text-brand">+{todaysEvents.length - 3}</span>
                        )}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Selected day details */}
            {selectedDay && (
              <div className="card mt-5 animate-fade-up !p-6">
                <h3 className="mb-3 text-sm font-semibold">{format(selectedDay, 'EEEE d MMMM')}</h3>
                {dayEvents.length === 0 ? (
                  <p className="text-sm text-smoke">Nothing on this day. A perfect filming day 🎥</p>
                ) : (
                  <ul className="space-y-3">
                    {dayEvents.map((e) => (
                      <li key={e.id} className="flex items-start gap-3">
                        <span aria-hidden>{metaFor(e.type).emoji}</span>
                        <div className="min-w-0">
                          {e.link ? (
                            <Link to={e.link} className="text-sm font-medium hover:text-brand">{e.title}</Link>
                          ) : (
                            <p className="text-sm font-medium">{e.title}</p>
                          )}
                          {e.description && <p className="mt-0.5 text-xs text-smoke">{e.description}</p>}
                          <div className="mt-1 flex flex-wrap items-center gap-3">
                            {e.meeting_url && (
                              <a href={e.meeting_url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-brand hover:underline">
                                Join the call ↗
                              </a>
                            )}
                            <AddToCalendar event={e} subtle />
                          </div>
                          {e.rsvp_enabled && <EventRsvp eventId={e.id} />}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>

          {/* ---------- Upcoming list ---------- */}
          <aside>
            <h2 className="mb-5 text-lg font-semibold">Coming up</h2>
            {upcoming.length === 0 ? (
              <p className="text-sm text-smoke">Nothing scheduled.</p>
            ) : (
              <ol className="space-y-4">
                {upcoming.map((e) => (
                  <li key={e.id} className="card flex items-start gap-4 !p-5">
                    <div className="flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl bg-cloud">
                      <span className="text-xs font-bold text-brand">{format(new Date(e.date), 'd')}</span>
                      <span className="text-[10px] font-medium uppercase text-smoke">{format(new Date(e.date), 'MMM')}</span>
                    </div>
                    <div className="min-w-0">
                      {e.link ? (
                        <Link to={e.link} className="block text-sm font-semibold leading-snug hover:text-brand">{e.title}</Link>
                      ) : (
                        <p className="text-sm font-semibold leading-snug">{e.title}</p>
                      )}
                      <p className="mt-1 text-xs text-smoke">{formatDateTimeTz(e.date)}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Badge tone={metaFor(e.type).tone}>
                          {metaFor(e.type).emoji} {metaFor(e.type).label}
                        </Badge>
                        {e.meeting_url && (
                          <a href={e.meeting_url} target="_blank" rel="noopener noreferrer" className="text-xs font-medium text-brand hover:underline">
                            Join ↗
                          </a>
                        )}
                        <AddToCalendar event={e} subtle />
                      </div>
                      {e.rsvp_enabled && <EventRsvp eventId={e.id} />}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </div>
      )}

      {/* Availability polls, creator event ideas, and (admins) post-event ratings */}
      {!loading && (
        <div className="mt-10">
          <EventPolls />
          <SuggestEvent />
          <EventRatingsAdmin />
        </div>
      )}
    </div>
  )
}
