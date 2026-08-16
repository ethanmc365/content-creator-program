import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameDay, isSameMonth, isToday, startOfMonth, startOfWeek,
} from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useMyScopes, inScope } from '../lib/scope'
import { PageHeader, Skeleton } from '../components/ui'
import Icon from '../components/Icon'
import EventRsvp from '../components/EventRsvp'
import EventPolls from '../components/EventPolls'
import { SuggestEvent, EventRatingsAdmin } from '../components/EventFeedback'
import { formatDateTimeTz, cx } from '../lib/utils'
import { downloadIcs, downloadIcsFeed, googleCalendarUrl } from '../lib/calendar'

// THE CALENDAR, REBUILT.
//
// Ethan: "a page that has been neglected and needs a big rebuild, improvement
// and new features is the calendar page. Redo the design, build in clean
// animations across all the features on the page and reactive elements when
// hovering over and clicking etc, build in more useful features."
//
// WHAT WAS WRONG WITH IT, and none of it was the month grid, which was fine:
//
//   IT WAS EMOJI. 📍 🎤 ⏰ 🎉 🏁 🤝 🎓, on a platform whose written rule is
//   line icons and never emoji in chrome. Seven of them, in the badges, in the
//   day list, and 24 pixels tall in the hero heading.
//
//   IT HAD ONE VIEW AND THE VIEW WAS A MONTH. A month grid answers "what is
//   this month shaped like" and cannot answer "what is next", which is the
//   question anybody opening a calendar on a Tuesday actually has. There is a
//   week and an agenda now, and the switch is remembered.
//
//   NOTHING MOVED AND NOTHING REACTED. A day cell had `transition-colors` and
//   that was the entire interaction language of the page: no hover state worth
//   the name, no press, no entrance, and the selected-day panel simply appeared.
//
//   IT COULD NOT ANSWER "WHEN IS THAT". Every date was an absolute date, so
//   "16 August at 18:00" needed the reader to work out that it is tomorrow. Now
//   every card says how far away it is, and anything inside a week says it in
//   words.
//
//   YOU COULD ADD ONE EVENT TO YOUR DIARY AT A TIME. Fourteen dates, fourteen
//   downloads. The whole thing comes as one file now - see `buildIcsFeed`.
//
//   AND A DAY WITH FIVE THINGS ON IT LOOKED LIKE A DAY WITH ONE. Three stars
//   and a "+2", all the same colour, on a grid where a deadline and a workshop
//   are very different news.
//
// WHAT IT KEEPS: challenge dates merged in automatically, `inScope` filtering
// that fails open, the polls and the suggestion box at the foot. This is a page
// the 45 UK creators use today, so nothing that worked has been taken away.

// EVERY TYPE IS A LINE ICON AND A TONE, AND THE TONE IS THE URGENCY.
//
// Deadlines are the only thing on here anybody can MISS, so they are the only
// thing drawn in a colour that is not the brand. Everything else is Tryp orange
// at one of two weights: a thing the team is running, or a thing you are going
// to.
const TYPE_META = {
  event: { icon: 'pin', label: 'Event', tone: 'brand' },
  qa: { icon: 'chat', label: 'Q&A', tone: 'brand' },
  deadline: { icon: 'clock', label: 'Deadline', tone: 'red' },
  milestone: { icon: 'sparkles', label: 'Milestone', tone: 'soft' },
  challenge: { icon: 'flag', label: 'Challenge', tone: 'brand' },
  meetup: { icon: 'users', label: 'Meet-up', tone: 'soft' },
  workshop: { icon: 'bulb', label: 'Workshop', tone: 'soft' },
}
const metaFor = (type) => TYPE_META[type] || { icon: 'calendar', label: type || 'Event', tone: 'soft' }

const TONE_DOT = { brand: 'bg-brand', red: 'bg-red-500', soft: 'bg-brand-light' }
const TONE_CHIP = {
  brand: 'bg-brand-tint text-brand',
  red: 'bg-red-50 text-red-600',
  soft: 'bg-cloud text-smoke',
}
const TONE_TILE = {
  brand: 'bg-brand text-white',
  red: 'bg-red-500 text-white',
  soft: 'bg-brand-tint text-brand',
}

const VIEWS = [
  { key: 'month', label: 'Month', icon: 'calendar' },
  { key: 'week', label: 'Week', icon: 'reorder' },
  { key: 'agenda', label: 'Agenda', icon: 'book' },
]
const VIEW_KEY = 'tryp-calendar-view'

// HOW FAR AWAY, IN WORDS, AND ONLY WHEN WORDS ARE BETTER THAN A DATE.
//
// "In 3 days" is more useful than "18 August" for anything this week and less
// useful for anything next month, where the actual date is what you need to
// check against your own diary. So it switches at a week, and past events say
// so plainly rather than counting up.
function whenLabel(date, now) {
  const ms = date.getTime() - now.getTime()
  const days = Math.round(ms / 86400000)
  if (ms < 0) {
    if (days > -1) return 'Earlier today'
    if (days === -1) return 'Yesterday'
    if (days > -7) return `${-days} days ago`
    return null
  }
  const h = Math.floor(ms / 3600000)
  if (h < 1) return 'Starting now'
  if (h < 24 && isSameDay(date, now)) return `Today, in ${h} ${h === 1 ? 'hour' : 'hours'}`
  if (days === 1 || (days === 0 && !isSameDay(date, now))) return 'Tomorrow'
  if (days < 7) return `In ${days} days`
  return null
}

// Map an Events-list item to calendar fields (folds the meeting link into the
// notes so it travels into the creator's calendar app).
function toCalEvent(e) {
  const details = [e.description, e.meeting_url && `Join: ${e.meeting_url}`].filter(Boolean).join('\n\n')
  return { title: e.title, start: e.date, description: details, location: e.meeting_url || '', uid: e.id }
}

// "Add to calendar" split button: .ics download (Apple/Outlook/any) + a Google
// Calendar quick link. Uses a native <details> so each instance manages itself.
function AddToCalendar({ event, subtle = false }) {
  const cal = toCalEvent(event)
  const close = (el) => el.closest('details')?.removeAttribute('open')
  return (
    <details className="group/cal relative inline-block">
      <summary className={cx(
        'inline-flex cursor-pointer list-none items-center gap-1.5 font-medium transition-all duration-200',
        subtle
          ? 'text-xs text-brand hover:underline'
          : 'btn border border-white/40 text-white hover:bg-white/10 hover:-translate-y-0.5',
      )}>
        <Icon name="calendar" className={subtle ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
        Add to calendar
      </summary>
      <div className="absolute right-0 z-30 mt-2 w-52 origin-top-right overflow-hidden rounded-card border border-gray-100 bg-white p-1 text-left shadow-lift animate-menu-in">
        <button
          onClick={(e) => { downloadIcs(cal); close(e.currentTarget) }}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-cloud"
        >
          <Icon name="device" className="h-4 w-4 text-smoke" />
          Apple / Outlook
        </button>
        <a
          href={googleCalendarUrl(cal)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => close(e.currentTarget)}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-ink transition-colors hover:bg-cloud"
        >
          <Icon name="link" className="h-4 w-4 text-smoke" />
          Google Calendar
        </a>
      </div>
    </details>
  )
}

// ---------------------------------------------------------------- one entry
//
// ONE CARD COMPONENT FOR THE WEEK, THE AGENDA AND THE DAY PANEL. There used to
// be three near-identical blocks of JSX for the same object, which is how the
// agenda list ended up with an RSVP control the day panel did not have.
function EventCard({ e, now, compact = false }) {
  const meta = metaFor(e.type)
  const date = new Date(e.date)
  const soon = whenLabel(date, now)
  const past = date < now
  return (
    <div
      className={cx(
        'group relative flex gap-3.5 rounded-card border bg-white p-4 transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lift',
        past ? 'border-gray-100 opacity-70 hover:opacity-100' : 'border-gray-100 shadow-card',
      )}
    >
      {/* THE DATE AS A TILE, coloured by what kind of thing it is. A row of
          these reads as a diary before you have read a word of it. */}
      <div className={cx(
        'flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-2xl leading-none transition-transform duration-200 group-hover:scale-105',
        TONE_TILE[meta.tone],
      )}>
        <span className="text-[10px] font-semibold uppercase tracking-widest opacity-80">{format(date, 'MMM')}</span>
        <span className="text-xl font-bold tabular-nums">{format(date, 'd')}</span>
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
          {e.link ? (
            <Link to={e.link} className="text-sm font-semibold leading-snug transition-colors hover:text-brand">{e.title}</Link>
          ) : (
            <p className="text-sm font-semibold leading-snug">{e.title}</p>
          )}
          {/* HOW SOON, AS THE LOUDEST THING ON THE CARD when it is soon and as
              nothing at all when it is not. A row of "in 34 days" chips is
              noise; one "Tomorrow" is the reason to look at the page. */}
          {soon && !past && (
            <span className="shrink-0 rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
              {soon}
            </span>
          )}
        </div>

        <p className="mt-1 text-xs text-smoke">{formatDateTimeTz(e.date)}</p>
        {e.description && !compact && (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-smoke">{e.description}</p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', TONE_CHIP[meta.tone])}>
            <Icon name={meta.icon} className="h-3 w-3" />
            {meta.label}
          </span>
          {e.meeting_url && (
            <a href={e.meeting_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand transition-transform duration-200 hover:translate-x-0.5">
              Join the call
              <Icon name="chevronRight" className="h-3 w-3" />
            </a>
          )}
          <AddToCalendar event={e} subtle />
        </div>

        {e.rsvp_enabled && <div className="mt-2"><EventRsvp eventId={e.id} /></div>}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- the page
export default function Events() {
  const { isAdmin } = useAuth()
  // Always-on scope helper, not CommunityContext: this page is one of the ones
  // 45 live creators open, and it has to scope correctly whether or not the
  // network preview flag is set. `inScope` fails OPEN, so an unscoped event is
  // everybody's and an unreadable membership table degrades to the old
  // behaviour rather than to an empty calendar.
  const { ids: scopeIds } = useMyScopes()
  const [events, setEvents] = useState(null)
  const [month, setMonth] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState(null)
  const [types, setTypes] = useState(() => new Set())
  // `react-hooks/purity` bans `new Date()` in render, and this is also the right
  // shape anyway: one clock for the whole page, ticking slowly, so every "in 3
  // days" on it agrees with every other one.
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])

  // THE VIEW IS REMEMBERED PER DEVICE. Somebody who lives in the agenda should
  // not be handed a month grid every morning.
  const [view, setView] = useState(() => {
    try { return localStorage.getItem(VIEW_KEY) || 'month' } catch { return 'month' }
  })
  const pickView = useCallback((v) => {
    setView(v)
    try { localStorage.setItem(VIEW_KEY, v) } catch { /* private mode */ }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function load() {
      const [{ data: ev }, { data: ch }] = await Promise.all([
        supabase.from('events').select('*').order('date'),
        supabase.from('challenges').select('id, title, start_date, end_date').neq('status', 'draft'),
      ])
      if (cancelled) return
      // Merge admin events with auto-generated challenge dates.
      const challengeEvents = (ch ?? []).flatMap((c) => [
        { id: `${c.id}-start`, title: `${c.title} opens`, date: c.start_date, type: 'challenge', link: `/challenges/${c.id}` },
        { id: `${c.id}-end`, title: `${c.title} closes`, date: c.end_date, type: 'deadline', link: `/challenges/${c.id}` },
      ])
      const mine = (ev ?? []).filter((e) => inScope(scopeIds, e.community_id))
      setEvents([...mine, ...challengeEvents].sort((a, b) => new Date(a.date) - new Date(b.date)))
    }
    load()
    return () => { cancelled = true }
  }, [scopeIds])

  const loading = events === null
  const all = useMemo(() => events || [], [events])

  // WHICH TYPES EXIST, NOT WHICH TYPES WE HAVE HEARD OF. Admins can invent a
  // type, and a filter row built from a hard-coded list would silently hide it.
  const presentTypes = useMemo(() => {
    const seen = new Map()
    for (const e of all) seen.set(e.type, (seen.get(e.type) || 0) + 1)
    return [...seen.entries()].sort((a, b) => b[1] - a[1])
  }, [all])

  const shown = useMemo(
    () => (types.size === 0 ? all : all.filter((e) => types.has(e.type))),
    [all, types],
  )
  const toggleType = (t) => setTypes((cur) => {
    const next = new Set(cur)
    if (next.has(t)) next.delete(t); else next.add(t)
    return next
  })

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
    const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
  }, [month])

  // Events keyed by calendar day, built ONCE per filter change rather than by
  // scanning the whole list inside every one of forty-two day cells.
  const byDay = useMemo(() => {
    const m = new Map()
    for (const e of shown) {
      const k = format(new Date(e.date), 'yyyy-MM-dd')
      const list = m.get(k)
      if (list) list.push(e); else m.set(k, [e])
    }
    return m
  }, [shown])
  const eventsOn = useCallback((day) => byDay.get(format(day, 'yyyy-MM-dd')) || [], [byDay])

  const todayStart = useMemo(() => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d }, [now])
  const upcoming = useMemo(() => shown.filter((e) => new Date(e.date) >= todayStart), [shown, todayStart])
  const nextEvent = upcoming[0]

  // WHAT THIS MONTH LOOKS LIKE, IN ONE LINE. The grid shows you where things
  // are; this says how many and how urgent, which is the thing you would
  // otherwise count by eye.
  const monthSummary = useMemo(() => {
    const inMonth = shown.filter((e) => isSameMonth(new Date(e.date), month))
    const deadlines = inMonth.filter((e) => e.type === 'deadline').length
    return { n: inMonth.length, deadlines }
  }, [shown, month])

  const weekDays = useMemo(() => {
    const start = startOfWeek(selectedDay || now, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [selectedDay, now])

  // ARROW KEYS MOVE THE MONTH, `t` GOES TO TODAY. A calendar is one of the very
  // few surfaces where a keyboard shortcut is obvious rather than clever, and
  // the typing guard is what stops `t` doing it while somebody writes a poll.
  const monthRef = useRef(month)
  useEffect(() => { monthRef.current = month }, [month])
  useEffect(() => {
    if (view !== 'month') return undefined
    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA)$/.test(e.target?.tagName) || e.target?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowLeft') setMonth(addMonths(monthRef.current, -1))
      else if (e.key === 'ArrowRight') setMonth(addMonths(monthRef.current, 1))
      else if (e.key === 't' || e.key === 'T') { setMonth(new Date()); setSelectedDay(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view])

  const dayEvents = selectedDay ? eventsOn(selectedDay) : []

  return (
    <div className="page">
      <PageHeader
        title="Events & calendar"
        subtitle="Challenge deadlines, Q&As, content days. Never miss a date."
        action={
          <div className="flex flex-wrap gap-2">
            {/* THE WHOLE CALENDAR, ONCE. See `buildIcsFeed` - fourteen dates
                used to be fourteen downloads, which is a feature nobody uses
                twice. */}
            {upcoming.length > 1 && (
              <button
                onClick={() => downloadIcsFeed(upcoming.map(toCalEvent), 'tryp-creator-calendar')}
                className="btn-secondary !py-2.5 text-sm"
              >
                <Icon name="calendar" className="h-4 w-4" />
                Add all {upcoming.length}
              </button>
            )}
            {isAdmin && <Link to="/admin/events" className="btn-primary">Manage events</Link>}
          </div>
        }
      />

      {loading ? (
        <div className="space-y-6">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-96 w-full" />
        </div>
      ) : (
        <>
          {/* ---------- Next-up hero ---------- */}
          {nextEvent && <NextUp e={nextEvent} now={now} />}

          {/* ---------- The controls: view, filters, month ---------- */}
          <div className="mb-5 flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* THE VIEW SWITCH IS A REAL SEGMENTED CONTROL with a sliding
                  highlight, not three buttons that change colour. The slide is
                  what tells you the three are one control. */}
              <div className="relative flex rounded-full bg-cloud p-1">
                <span
                  className="absolute inset-y-1 rounded-full bg-white shadow-card transition-transform duration-300 ease-out"
                  style={{
                    width: `calc((100% - 0.5rem) / ${VIEWS.length})`,
                    transform: `translateX(calc(${VIEWS.findIndex((v) => v.key === view)} * 100%))`,
                    left: '0.25rem',
                  }}
                  aria-hidden
                />
                {VIEWS.map((v) => (
                  <button
                    key={v.key}
                    onClick={() => pickView(v.key)}
                    aria-pressed={view === v.key}
                    className={cx(
                      'relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-colors duration-200',
                      view === v.key ? 'text-ink' : 'text-smoke hover:text-ink',
                    )}
                  >
                    <Icon name={v.icon} className="h-3.5 w-3.5" />
                    {v.label}
                  </button>
                ))}
              </div>

              {view === 'month' && (
                <div className="flex items-center gap-2">
                  <h2 className="min-w-[9.5rem] text-lg font-bold tabular-nums">{format(month, 'MMMM yyyy')}</h2>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setMonth(addMonths(month, -1))} aria-label="Previous month"
                      className="flex h-9 w-9 items-center justify-center rounded-full text-smoke transition-all duration-200 hover:bg-cloud hover:text-ink active:scale-90">
                      <Icon name="chevronLeft" className="h-4 w-4" />
                    </button>
                    <button onClick={() => { setMonth(new Date()); setSelectedDay(null) }}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold text-smoke transition-all duration-200 hover:bg-cloud hover:text-ink active:scale-95">
                      Today
                    </button>
                    <button onClick={() => setMonth(addMonths(month, 1))} aria-label="Next month"
                      className="flex h-9 w-9 items-center justify-center rounded-full text-smoke transition-all duration-200 hover:bg-cloud hover:text-ink active:scale-90">
                      <Icon name="chevronRight" className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* THE TYPE FILTER, and only when there is more than one type to
                choose between. Two chips over a calendar with one kind of thing
                on it is a control that can only ever hide something. */}
            {presentTypes.length > 1 && (
              <div className="flex flex-wrap gap-2">
                <FilterChip on={types.size === 0} onClick={() => setTypes(new Set())} icon="globe" label="Everything" />
                {presentTypes.map(([t, n]) => {
                  const meta = metaFor(t)
                  return (
                    <FilterChip
                      key={t} on={types.has(t)} onClick={() => toggleType(t)}
                      icon={meta.icon} label={meta.label} count={n} tone={meta.tone}
                    />
                  )
                })}
              </div>
            )}
          </div>

          {view === 'month' && (
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <MonthGrid
                  days={days} month={month} eventsOn={eventsOn}
                  selectedDay={selectedDay} onSelect={setSelectedDay}
                />
                <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-smoke">
                  <span>
                    <span className="font-semibold text-ink">{monthSummary.n}</span>
                    {monthSummary.n === 1 ? ' thing' : ' things'} in {format(month, 'MMMM')}
                    {monthSummary.deadlines > 0 && (
                      <span className="text-red-600">
                        {' · '}{monthSummary.deadlines} {monthSummary.deadlines === 1 ? 'deadline' : 'deadlines'}
                      </span>
                    )}
                  </span>
                  <span className="hidden sm:inline text-gray-400">Arrow keys change month · T for today</span>
                </p>

                {/* THE DAY PANEL GROWS OUT OF NOTHING rather than appearing.
                    `grid-template-rows: 0fr -> 1fr` animates to the content's
                    own height without anybody measuring anything, which is the
                    same trick the board's country field uses. */}
                <div className={cx(
                  'grid transition-[grid-template-rows,opacity] duration-300 ease-out motion-reduce:transition-none',
                  selectedDay ? 'mt-5 grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0',
                )}>
                  <div className="overflow-hidden">
                    {selectedDay && (
                      <div className="rounded-card border border-gray-100 bg-white p-5 shadow-card">
                        <div className="mb-3 flex items-center justify-between gap-3">
                          <h3 className="text-sm font-bold">{format(selectedDay, 'EEEE d MMMM')}</h3>
                          <button onClick={() => setSelectedDay(null)} aria-label="Close"
                            className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 transition-all duration-150 hover:bg-cloud hover:text-ink active:scale-90">
                            <Icon name="close" className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        {dayEvents.length === 0 ? (
                          <p className="text-sm text-smoke">Nothing planned. A good day to film something.</p>
                        ) : (
                          <div className="reveal is-in space-y-3">
                            {dayEvents.map((e, i) => (
                              <div key={e.id} className="reveal-item" style={{ '--reveal-i': i }}>
                                <EventCard e={e} now={now} compact />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <aside>
                <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                  <Icon name="clock" className="h-5 w-5 text-brand" />
                  Coming up
                </h2>
                <UpcomingList rows={upcoming.slice(0, 6)} now={now} />
              </aside>
            </div>
          )}

          {view === 'week' && (
            <WeekView days={weekDays} eventsOn={eventsOn} now={now}
              onShift={(n) => setSelectedDay(addDays(weekDays[0], n * 7))}
              onToday={() => setSelectedDay(null)} />
          )}

          {view === 'agenda' && (
            <section>
              {upcoming.length === 0 ? (
                <EmptyCalendar />
              ) : (
                <div className="reveal is-in space-y-3">
                  {upcoming.slice(0, 40).map((e, i) => (
                    <div key={e.id} className="reveal-item" style={{ '--reveal-i': Math.min(i, 12) }}>
                      <EventCard e={e} now={now} />
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Availability polls, creator event ideas, and (admins) post-event ratings */}
          <div className="mt-12">
            <EventPolls />
            <SuggestEvent />
            <EventRatingsAdmin />
          </div>
        </>
      )}
    </div>
  )
}

// ---------------------------------------------------------------- pieces
function FilterChip({ on, onClick, icon, label, count, tone = 'brand' }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={cx(
        'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95',
        on
          ? tone === 'red'
            ? 'border-red-500 bg-red-500 text-white'
            : 'border-brand bg-brand text-white'
          : 'border-gray-200 bg-white text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand',
      )}
    >
      <Icon name={icon} className="h-3.5 w-3.5" />
      {label}
      {count != null && <span className={cx('tabular-nums', on ? 'text-white/70' : 'text-gray-400')}>{count}</span>}
    </button>
  )
}

// THE NEXT THING, AND HOW LONG YOU HAVE. The old hero printed the date and left
// the arithmetic to the reader. This is the one card on the page that is allowed
// to be loud, because it is the one fact somebody came for.
function NextUp({ e, now }) {
  const meta = metaFor(e.type)
  const date = new Date(e.date)
  const soon = whenLabel(date, now)
  return (
    <section className="relative z-10 mb-8 overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-6 text-white shadow-lift sm:p-9">
      <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-black/5 blur-2xl" />
      <div className="relative">
        <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-widest">
          <Icon name={meta.icon} className="h-3.5 w-3.5" />
          Next up
        </span>
        <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h2 className="text-2xl font-bold leading-tight sm:text-3xl">{e.title}</h2>
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-white/85">
              {formatDateTimeTz(e.date)}
              {soon && (
                <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider">{soon}</span>
              )}
            </p>
            {e.description && <p className="mt-2.5 max-w-xl text-sm text-white/80">{e.description}</p>}
          </div>
          <div className="flex shrink-0 flex-wrap gap-3">
            {e.meeting_url && (
              <a href={e.meeting_url} target="_blank" rel="noopener noreferrer"
                className="btn bg-white text-brand transition-transform duration-200 hover:scale-105 hover:bg-white">
                Join the call
              </a>
            )}
            <AddToCalendar event={e} />
            {e.link && (
              <Link to={e.link} className="btn border border-white/40 text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/10">
                View
              </Link>
            )}
          </div>
        </div>
        {e.rsvp_enabled && <div className="mt-5"><EventRsvp eventId={e.id} /></div>}
      </div>
    </section>
  )
}

// THE GRID. Every cell is a button that lifts, every day with something on it
// carries one dot per event COLOURED BY TYPE, and today is a filled disc.
function MonthGrid({ days, month, eventsOn, selectedDay, onSelect }) {
  return (
    <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
      <div className="grid grid-cols-7 border-b border-gray-100 bg-cloud/60">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="py-2.5 text-center text-[10px] font-bold uppercase tracking-widest text-smoke">
            <span className="hidden sm:inline">{d}</span>
            <span className="sm:hidden">{d[0]}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px bg-gray-100">
        {days.map((day) => {
          const list = eventsOn(day)
          const selected = selectedDay && isSameDay(day, selectedDay)
          const outside = !isSameMonth(day, month)
          const today = isToday(day)
          return (
            <button
              key={day.toISOString()}
              onClick={() => onSelect(selected ? null : day)}
              aria-label={`${format(day, 'd MMMM')}${list.length ? `, ${list.length} events` : ''}`}
              aria-pressed={!!selected}
              className={cx(
                'group relative flex min-h-[66px] flex-col items-center gap-1.5 bg-white p-2 transition-all duration-150 sm:min-h-[88px]',
                'hover:z-10 hover:bg-brand-tint/40 active:scale-[0.97]',
                outside && 'bg-cloud/30',
                selected && '!bg-brand-tint ring-2 ring-inset ring-brand/50',
              )}
            >
              <span className={cx(
                'flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold tabular-nums transition-all duration-200',
                today ? 'bg-brand text-white shadow-card' : outside ? 'text-gray-300' : 'text-ink group-hover:bg-white',
              )}>
                {format(day, 'd')}
              </span>

              {/* ONE DOT PER EVENT, IN ITS OWN COLOUR, up to four. A deadline
                  and a workshop were the same orange star before, so a month
                  with three deadlines in it looked exactly like a month with
                  three meet-ups. */}
              {list.length > 0 && (
                <span className="flex flex-wrap items-center justify-center gap-1">
                  {list.slice(0, 4).map((e) => (
                    <span
                      key={e.id}
                      title={e.title}
                      className={cx(
                        'h-1.5 w-1.5 rounded-full transition-transform duration-200 group-hover:scale-125',
                        TONE_DOT[metaFor(e.type).tone],
                      )}
                    />
                  ))}
                  {list.length > 4 && (
                    <span className="text-[9px] font-bold leading-none text-smoke">+{list.length - 4}</span>
                  )}
                </span>
              )}

              {/* The first title, where there is room for it. A month grid that
                  only shows dots makes you click every day to find out what is
                  on it. */}
              {list.length > 0 && (
                <span className="hidden w-full truncate px-0.5 text-[10px] font-medium leading-tight text-smoke sm:block">
                  {list[0].title}
                </span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// THE WEEK. Seven columns on a desktop, seven rows on a phone - a week view
// that keeps its columns at 375px gives every day 50 pixels, which fits a date
// and nothing else.
function WeekView({ days, eventsOn, now, onShift, onToday }) {
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold">
          {format(days[0], 'd MMM')} &ndash; {format(days[6], 'd MMM yyyy')}
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={() => onShift(-1)} aria-label="Previous week"
            className="flex h-9 w-9 items-center justify-center rounded-full text-smoke transition-all duration-200 hover:bg-cloud hover:text-ink active:scale-90">
            <Icon name="chevronLeft" className="h-4 w-4" />
          </button>
          <button onClick={onToday}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-smoke transition-all duration-200 hover:bg-cloud hover:text-ink active:scale-95">
            This week
          </button>
          <button onClick={() => onShift(1)} aria-label="Next week"
            className="flex h-9 w-9 items-center justify-center rounded-full text-smoke transition-all duration-200 hover:bg-cloud hover:text-ink active:scale-90">
            <Icon name="chevronRight" className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="reveal is-in grid gap-3 sm:grid-cols-2 lg:grid-cols-7">
        {days.map((day, i) => {
          const list = eventsOn(day)
          const today = isToday(day)
          return (
            <div key={day.toISOString()} className="reveal-item" style={{ '--reveal-i': i }}>
              <div className={cx(
                'flex h-full flex-col rounded-card border p-3 transition-all duration-200',
                today ? 'border-brand bg-brand-tint/30' : 'border-gray-100 bg-white shadow-card',
                list.length > 0 && 'hover:-translate-y-0.5 hover:shadow-lift',
              )}>
                <p className={cx('text-[10px] font-bold uppercase tracking-widest', today ? 'text-brand' : 'text-smoke')}>
                  {format(day, 'EEE')}
                </p>
                <p className={cx('text-2xl font-bold tabular-nums leading-none', today ? 'text-brand' : 'text-ink')}>
                  {format(day, 'd')}
                </p>
                <div className="mt-3 space-y-2">
                  {list.length === 0 ? (
                    <p className="text-[11px] text-gray-300">&mdash;</p>
                  ) : list.map((e) => {
                    const meta = metaFor(e.type)
                    const body = (
                      <>
                        <span className={cx('mt-1 block h-1 w-6 rounded-full', TONE_DOT[meta.tone])} />
                        <span className="mt-1.5 block text-[11px] font-semibold leading-snug text-ink">{e.title}</span>
                        <span className="block text-[10px] text-smoke">{format(new Date(e.date), 'HH:mm')}</span>
                      </>
                    )
                    return e.link ? (
                      <Link key={e.id} to={e.link} className="block rounded-lg p-1 transition-colors hover:bg-cloud">{body}</Link>
                    ) : (
                      <div key={e.id} className="rounded-lg p-1">{body}</div>
                    )
                  })}
                </div>
              </div>
            </div>
          )
        })}
      </div>
      {/* The week's own agenda underneath it, because seven narrow columns can
          hold a title and not a description, a link, an RSVP or a diary
          button. */}
      <div className="mt-8 space-y-3">
        {days.flatMap((d) => eventsOn(d)).map((e) => (
          <EventCard key={e.id} e={e} now={now} />
        ))}
      </div>
    </section>
  )
}

function UpcomingList({ rows, now }) {
  if (rows.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-gray-200 px-5 py-10 text-center text-sm text-smoke">
        Nothing scheduled yet.
      </p>
    )
  }
  return (
    <div className="reveal is-in space-y-3">
      {rows.map((e, i) => (
        <div key={e.id} className="reveal-item" style={{ '--reveal-i': i }}>
          <EventCard e={e} now={now} compact />
        </div>
      ))}
    </div>
  )
}

function EmptyCalendar() {
  return (
    <div className="rounded-card border border-dashed border-gray-200 px-6 py-16 text-center">
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-tint text-brand">
        <Icon name="calendar" className="h-6 w-6" />
      </span>
      <p className="text-sm font-semibold text-ink">Nothing coming up</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-smoke">
        Challenge deadlines land here on their own. Anything else is a date somebody has to put in, and there is a box at the foot of this page for asking.
      </p>
    </div>
  )
}
