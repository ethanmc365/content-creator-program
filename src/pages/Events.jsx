import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek,
} from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Badge, PageHeader, Skeleton } from '../components/ui'
import { formatDateTime, cx } from '../lib/utils'

// Events calendar: admin-created events (Q&As, content days, milestones)
// PLUS challenge start/end dates pulled in automatically so deadlines are
// impossible to miss. Month grid on top, upcoming list below.
const TYPE_META = {
  event: { emoji: '📍', tone: 'light', label: 'Event' },
  qa: { emoji: '🎤', tone: 'light', label: 'Q&A' },
  deadline: { emoji: '⏰', tone: 'red', label: 'Deadline' },
  milestone: { emoji: '🎉', tone: 'green', label: 'Milestone' },
  challenge: { emoji: '🏁', tone: 'brand', label: 'Challenge' },
}

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
        { id: `${c.id}-start`, title: `${c.title} — starts`, date: c.start_date, type: 'challenge', link: `/challenges/${c.id}` },
        { id: `${c.id}-end`, title: `${c.title} — deadline`, date: c.end_date, type: 'deadline', link: `/challenges/${c.id}` },
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
  const upcoming = events.filter((e) => new Date(e.date) >= new Date(new Date().setHours(0, 0, 0, 0))).slice(0, 8)
  const dayEvents = selectedDay ? eventsOn(selectedDay) : []

  return (
    <div className="page">
      <PageHeader
        title="Events & calendar"
        subtitle="Challenge deadlines, Q&As, content days — never miss a date."
        action={isAdmin && <Link to="/admin/events" className="btn-primary">Manage events</Link>}
      />

      {loading ? (
        <Skeleton className="h-96 w-full" />
      ) : (
        <div className="grid gap-10 lg:grid-cols-3">
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
                const selected = selectedDay && isSameDay(day, selectedDay)
                return (
                  <button
                    key={day.toISOString()}
                    onClick={() => setSelectedDay(selected ? null : day)}
                    className={cx(
                      'flex min-h-[64px] flex-col items-center gap-1 bg-white p-2 transition-colors hover:bg-cloud sm:min-h-[80px]',
                      !isSameMonth(day, month) && 'text-gray-300',
                      selected && '!bg-brand-tint'
                    )}
                    aria-label={`${format(day, 'd MMMM')}${todaysEvents.length ? `, ${todaysEvents.length} events` : ''}`}
                  >
                    <span className={cx(
                      'flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium',
                      isToday(day) && 'bg-brand text-white'
                    )}>
                      {format(day, 'd')}
                    </span>
                    <span className="flex flex-wrap justify-center gap-0.5">
                      {todaysEvents.slice(0, 3).map((e) => (
                        <span key={e.id} className="text-[10px]" title={e.title} aria-hidden>{TYPE_META[e.type]?.emoji}</span>
                      ))}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Selected day details */}
            {selectedDay && (
              <div className="card mt-5 animate-fade-up !p-6">
                <h3 className="mb-3 text-sm font-semibold">{format(selectedDay, 'EEEE d MMMM')}</h3>
                {dayEvents.length === 0 ? (
                  <p className="text-sm text-smoke">Nothing on this day — a perfect filming day 🎥</p>
                ) : (
                  <ul className="space-y-3">
                    {dayEvents.map((e) => (
                      <li key={e.id} className="flex items-start gap-3">
                        <span aria-hidden>{TYPE_META[e.type]?.emoji}</span>
                        <div>
                          {e.link ? (
                            <Link to={e.link} className="text-sm font-medium hover:text-brand">{e.title}</Link>
                          ) : (
                            <p className="text-sm font-medium">{e.title}</p>
                          )}
                          {e.description && <p className="mt-0.5 text-xs text-smoke">{e.description}</p>}
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
              <p className="text-sm text-smoke">Nothing scheduled — enjoy the calm ☀️</p>
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
                      <p className="mt-1 text-xs text-smoke">{formatDateTime(e.date)}</p>
                      <Badge tone={TYPE_META[e.type]?.tone || 'grey'} className="mt-2">
                        {TYPE_META[e.type]?.emoji} {TYPE_META[e.type]?.label}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </aside>
        </div>
      )}
    </div>
  )
}
