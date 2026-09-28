import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  addDays, addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format,
  isSameDay, isSameMonth, isToday, isWeekend, startOfMonth, startOfWeek,
} from 'date-fns'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useMyScopes } from '../lib/scope'
import { Modal, PageHeader } from '../components/ui'
import PageSkeleton from '../components/PageSkeleton'
import { useCachedPage, writePageCache } from '../lib/pageCache'
import Icon from '../components/Icon'
import EventRsvp from '../components/EventRsvp'
import EventPolls from '../components/EventPolls'
import { SuggestEvent, EventRatingsAdmin, EventRatingPrompt } from '../components/EventFeedback'
import EventTime from '../components/calendar/EventTime'
import ReminderBell from '../components/calendar/ReminderBell'
import RsvpFaces from '../components/calendar/RsvpFaces'
import PersonalEventModal from '../components/calendar/PersonalEventModal'
import SubscribeCalendar from '../components/calendar/SubscribeCalendar'
import TimezonePrompt from '../components/calendar/TimezonePrompt'
import { DeadlineReminderModal } from '../components/NotificationPreferences'
import { useTimezone } from '../lib/timezone'
import { loadCalendar } from '../lib/calendarSources'
import Reveal from '../components/network/Reveal'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

// THE CALENDAR, THIRD PASS.
//
// The rebuild before this one gave it three views, a real segmented control and
// no emoji. What it still could not do was tell you anything that was true of
// YOU rather than of the programme, and that is what this pass is about.
//
// WHAT CHANGED AND WHY
//
//   IT SHOWS YOUR OWN DATES NOW. Flights, collab trips, invoices and personal
//   content days all live on the platform already and none of them were on the
//   page that is about dates. See lib/calendarSources - every one of them is
//   scoped to one person BY THE QUERY, not by a filter afterwards.
//
//   IT KNOWS WHAT IS ON RIGHT NOW. An event whose start has passed and whose
//   end has not gets a pulsing chip and goes to the top. Ethan: "The single
//   highest-value state a calendar can show and the one it currently cannot."
//   It needed `events.ends_at`, which did not exist until migration 107.
//
//   THE TYPE FILTER IS GONE. Ethan: "ive found those buttons above the calendar
//   useless so you can remove them, it should constantly be showing everything."
//   A filter row over a calendar can only ever hide something you were about to
//   be told about, and every type already carries its own tile and chip.
//
//   NOTHING IS PINK ANY MORE. Deadlines were `bg-red-500` tiles and `bg-red-50`
//   chips, which is the palette rule broken twice on the same card. Urgency is
//   now carried by WEIGHT within the brand: solid orange is the loudest thing,
//   a tint is the quietest, and your own private rows are charcoal.
//
//   TIMES SAY WHOSE CLOCK THEY ARE ON. See lib/eventTime.
//
//   WHO IS GOING IS FACES. See components/calendar/RsvpFaces.
//
//   YOU CAN SUBSCRIBE INSTEAD OF DOWNLOADING. "Add all 14" wrote a file that was
//   out of date the moment anybody added a fifteenth. The subscription is a URL
//   Apple and Google re-fetch on their own.
//
//   IT WORKS ON A PHONE. The hero is a strip rather than a poster, the view
//   switch spans the full width, and the month grid takes a horizontal swipe -
//   the gesture people already try before they find the arrows.

// EVERY TYPE IS A LINE ICON AND A WEIGHT, AND THE WEIGHT IS THE URGENCY.
//
// There is no second hue. `strong` is the platform orange at full strength and
// is reserved for the only thing on here you can actually miss; `brand` is the
// lighter orange for things the team is running; `soft` is a tint for context;
// `own` is charcoal, for the rows that are nobody's business but yours.
const TYPE_META = {
  event: { icon: 'pin', label: 'Event', tone: 'brand' },
  qa: { icon: 'chat', label: 'Q&A', tone: 'brand' },
  deadline: { icon: 'clock', label: 'Deadline', tone: 'strong' },
  milestone: { icon: 'sparkles', label: 'Milestone', tone: 'soft' },
  challenge: { icon: 'flag', label: 'Challenge', tone: 'brand' },
  meetup: { icon: 'users', label: 'Meet-up', tone: 'brand' },
  workshop: { icon: 'bulb', label: 'Workshop', tone: 'soft' },
  personal: { icon: 'eye', label: 'Just you', tone: 'own' },
  flight: { icon: 'plane-tryp', label: 'Flight', tone: 'soft' },
  trip: { icon: 'globe', label: 'Trip', tone: 'soft' },
  invoice: { icon: 'wallet', label: 'Payment', tone: 'own' },
}
const metaFor = (type) => TYPE_META[type] || { icon: 'calendar', label: type || 'Event', tone: 'soft' }

const TONE_DOT = { strong: 'bg-brand', brand: 'bg-brand-light', soft: 'bg-brand-light/50', own: 'bg-ink' }
const TONE_CHIP = {
  strong: 'bg-brand text-white',
  brand: 'bg-brand-tint text-brand',
  soft: 'bg-cloud text-smoke',
  own: 'bg-ink/5 text-ink',
}
const TONE_TILE = {
  strong: 'bg-brand text-white',
  brand: 'bg-brand-light text-white',
  soft: 'bg-brand-tint text-brand',
  own: 'bg-ink text-white',
}

const VIEWS = [
  { key: 'month', label: 'Month', icon: 'calendar' },
  { key: 'week', label: 'Week', icon: 'reorder' },
  { key: 'agenda', label: 'Agenda', icon: 'book' },
]
const VIEW_KEY = 'tryp-calendar-view'
// See lib/pageCache.
const CAL_CACHE_KEY = 'calendar'
const dayKey = (d) => format(d, 'yyyy-MM-dd')

// IS THIS ON RIGHT NOW.
//
// `ends_at` when the event has one. When it does not - and nothing created
// before migration 107 does - a live window of 90 minutes is assumed, but ONLY
// for the kinds where "on now" is a meaningful thing to say. A flight, an
// invoice or a challenge deadline has no duration, and a pulsing "Live now" on
// a payment would be nonsense.
const LIVE_KINDS = new Set(['event', 'personal'])
const ASSUMED_LIVE_MS = 90 * 60_000
function isLive(item, now) {
  if (!LIVE_KINDS.has(item.kind)) return false
  const start = new Date(item.date).getTime()
  if (start > now.getTime()) return false
  const end = item.endsAt ? new Date(item.endsAt).getTime() : start + ASSUMED_LIVE_MS
  return now.getTime() < end
}

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

// ---------------------------------------------------------------- one entry
//
// ONE CARD COMPONENT FOR THE WEEK, THE AGENDA, THE DAY PANEL AND THE LIVE RAIL.
// There used to be three near-identical blocks of JSX for the same object,
// which is how the agenda list ended up with an RSVP control the day panel did
// not have.
function EventCard({ e, now, zone, rsvps, myId, connectedIds, compact = false, onEdit, live = false, onDeadlinePrefs }) {
  const tr = useT()
  const meta = metaFor(e.type)
  const date = new Date(e.date)
  const soon = whenLabel(date, now)
  const past = date < now && !live
  const rows = rsvps?.get(e.id) || []

  return (
    <div
      className={cx(
        'group relative flex gap-3.5 rounded-card border bg-white p-4 transition-all duration-200',
        'hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lift',
        live
          // The live card is the one thing on the page allowed to hold a ring.
          ? 'border-brand ring-2 ring-brand/25 shadow-lift'
          : past ? 'border-gray-100 opacity-70 hover:opacity-100' : 'border-gray-100 shadow-card',
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
          <span className="flex shrink-0 items-center gap-1.5">
            {live ? <LiveChip /> : soon && !past && (
              // HOW SOON, AS THE LOUDEST THING ON THE CARD when it is soon and
              // as nothing at all when it is not. A row of "in 34 days" chips is
              // noise; one "Tomorrow" is the reason to look at the page.
              <span className="rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white">
                {soon}
              </span>
            )}
            <ReminderBell item={e} now={now} onOpenDeadlinePrefs={onDeadlinePrefs} />
          </span>
        </div>

        <p className="mt-1 text-xs text-smoke">
          <EventTime at={e.date} zone={zone} prefix={`${format(date, 'd MMM')}, `} />
        </p>
        {e.description && !compact && (
          <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-smoke">{e.description}</p>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider', TONE_CHIP[meta.tone])}>
            <Icon name={meta.icon} className="h-3 w-3" />
            {meta.label}
          </span>
          {e.meetingUrl && (
            <a href={e.meetingUrl} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold text-brand transition-transform duration-200 hover:translate-x-0.5">
              {tr("Join the call")}
              <Icon name="chevronRight" className="h-3 w-3" />
            </a>
          )}
          {e.editable && (
            <button onClick={() => onEdit?.(e)} className="text-xs font-semibold text-smoke transition-colors hover:text-ink">
              {tr("Edit")}
            </button>
          )}
        </div>

        {/* Faces before buttons: who is going is the reason to answer, and the
            answer control is what you reach for once you have decided. */}
        {rows.length > 0 && (
          <RsvpFaces rows={rows} myId={myId} connectedIds={connectedIds} className="mt-2.5" />
        )}
        {e.rsvpEnabled && <div className="mt-2.5"><EventRsvp eventId={e.id} /></div>}
      </div>
    </div>
  )
}

// A PULSE, NOT A BLINK. Two rings on the same slow beat, so it reads as
// "happening" rather than "error". CSS only - this page is eagerly routed.
function LiveChip({ className = '' }) {
  const tr = useT()
  return (
    <span className={cx('inline-flex items-center gap-1.5 rounded-full bg-brand px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white', className)}>
      <span className="relative flex h-1.5 w-1.5" aria-hidden>
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-75 motion-reduce:hidden" />
        <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
      </span>
      {tr("Live now")}
    </span>
  )
}

// ---------------------------------------------------------------- the page
export default function Events() {
  const tr = useT()
  const { user, profile, isAdmin } = useAuth()
  // Always-on scope helper, not CommunityContext: this page is one of the ones
  // 45 live creators open, and it has to scope correctly whether or not the
  // network preview flag is set. `inScope` fails OPEN, so an unscoped event is
  // everybody's and an unreadable membership table degrades to the old
  // behaviour rather than to an empty calendar.
  const { ids: scopeIds, loading: scopesLoading } = useMyScopes()
  // SECOND AND LATER VISITS DRAW THE CALENDAR, NOT A MONTH OF GREY SQUARES.
  // `reload()` still runs on every visit. See lib/pageCache.
  const cachedCal = useCachedPage(CAL_CACHE_KEY)
  const [data, setData] = useState(cachedCal ?? null)          // { items, travelDays }
  const [rsvps, setRsvps] = useState(new Map())
  const [connectedIds, setConnectedIds] = useState(new Set())
  const [month, setMonth] = useState(() => new Date())
  const [selectedDay, setSelectedDay] = useState(null)
  const [weekAnchor, setWeekAnchor] = useState(null)
  const [personalOpen, setPersonalOpen] = useState(false)
  const [editingPersonal, setEditingPersonal] = useState(null)
  const [subscribeOpen, setSubscribeOpen] = useState(false)
  const [suggestOpen, setSuggestOpen] = useState(false)
  const [deadlinePrefsOpen, setDeadlinePrefsOpen] = useState(false)
  // ONE CLOCK, AND IT NOTICES WHEN YOU MOVE. See lib/timezone: the host-time
  // second line is gone, and what replaced it is a single prompt the first time
  // the device reports somewhere new.
  const tz = useTimezone(profile)
  const [tzAsked, setTzAsked] = useState(false)
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

  const reload = useCallback(async () => {
    if (!user) return
    const next = await loadCalendar({ userId: user.id, scopeIds })
    setData(next)
    writePageCache(CAL_CACHE_KEY, next)
  }, [user, scopeIds])

  // WAIT FOR THE SCOPES BEFORE THE FIRST LOAD. `useMyScopes` starts at
  // `{ ids: null }`, which `inScope` treats as "could not tell, show
  // everything" - correct as a permanent fallback and wrong as a loading state,
  // because it paints one frame of every market's events before narrowing.
  useEffect(() => { if (!scopesLoading) reload() }, [scopesLoading, reload])

  // A CREATOR WHO HAS NEVER BEEN ASKED IS NOT "MOVED", THEY ARE NEW. The first
  // visit quietly records where they are, so the prompt fires on the first
  // actual move rather than on the first ever page load.
  useEffect(() => {
    if (tz.firstTime) tz.acknowledge()
  }, [tz])

  // RSVPs for everything on the page, in one query rather than one per card.
  // `EventRsvp` still loads its own rows for the control it owns; this is the
  // read-only face row, and it is the reason a page with fourteen events makes
  // one request instead of fourteen.
  useEffect(() => {
    if (!data?.items?.length) return undefined
    let alive = true
    const ids = data.items.filter((i) => i.kind === 'event').map((i) => i.id)
    if (!ids.length) return undefined
    ;(async () => {
      const [{ data: rows }, { data: conns }] = await Promise.all([
        supabase.from('event_rsvps')
          .select('event_id, user_id, status, profiles:user_id(id, name, photo_url)')
          .in('event_id', ids),
        // `creator_id` / `connected_creator_id`, NOT requester/addressee - the
        // table has been called both in different features and only one of them
        // is real.
        supabase.from('connections')
          .select('creator_id, connected_creator_id')
          .eq('status', 'accepted')
          .or(`creator_id.eq.${user.id},connected_creator_id.eq.${user.id}`),
      ])
      if (!alive) return
      const m = new Map()
      for (const r of rows ?? []) {
        const list = m.get(r.event_id)
        if (list) list.push(r); else m.set(r.event_id, [r])
      }
      setRsvps(m)
      setConnectedIds(new Set((conns ?? []).map((c) => (c.creator_id === user.id ? c.connected_creator_id : c.creator_id))))
    })()
    return () => { alive = false }
  }, [data, user])

  const loading = data === null
  const all = useMemo(() => data?.items ?? [], [data])
  const travelDays = data?.travelDays ?? new Map()

  const days = useMemo(() => {
    const gridStart = startOfWeek(startOfMonth(month), { weekStartsOn: 1 })
    const gridEnd = endOfWeek(endOfMonth(month), { weekStartsOn: 1 })
    return eachDayOfInterval({ start: gridStart, end: gridEnd })
  }, [month])

  // Events keyed by calendar day, built ONCE per change rather than by scanning
  // the whole list inside every one of forty-two day cells.
  const byDay = useMemo(() => {
    const m = new Map()
    for (const e of all) {
      const k = dayKey(new Date(e.date))
      const list = m.get(k)
      if (list) list.push(e); else m.set(k, [e])
    }
    return m
  }, [all])
  const eventsOn = useCallback((day) => byDay.get(dayKey(day)) || [], [byDay])

  const todayStart = useMemo(() => { const d = new Date(now); d.setHours(0, 0, 0, 0); return d }, [now])
  const liveNow = useMemo(() => all.filter((e) => isLive(e, now)), [all, now])
  const liveIds = useMemo(() => new Set(liveNow.map((e) => e.id)), [liveNow])
  const upcoming = useMemo(
    () => all.filter((e) => new Date(e.date) >= todayStart && !liveIds.has(e.id)),
    [all, todayStart, liveIds],
  )
  const nextEvent = upcoming[0]

  const monthSummary = useMemo(() => {
    const inMonth = all.filter((e) => isSameMonth(new Date(e.date), month))
    const deadlines = inMonth.filter((e) => e.type === 'deadline').length
    return { n: inMonth.length, deadlines }
  }, [all, month])

  const weekDays = useMemo(() => {
    const start = startOfWeek(weekAnchor || now, { weekStartsOn: 1 })
    return Array.from({ length: 7 }, (_, i) => addDays(start, i))
  }, [weekAnchor, now])

  // ARROW KEYS MOVE THE MONTH, `t` GOES TO TODAY. A calendar is one of the very
  // few surfaces where a keyboard shortcut is obvious rather than clever, and
  // the typing guard is what stops `t` doing it while somebody writes a poll.
  const monthRef = useRef(month)
  useEffect(() => { monthRef.current = month }, [month])

  // WHICH MONTH IS ON SCREEN, AND WHICH WAY IT ARRIVED.
  //
  // `monthKey` is what remounts the grid so its entrance keyframe plays again.
  // A keyframe runs when an element is CREATED, so re-rendering the same node
  // with new dates in it animates nothing - which is why "it only animates the
  // first time" is such a common shape.
  //
  // THE DIRECTION IS SET WHERE THE MONTH IS, NOT DERIVED DURING RENDER.
  // Deriving it by comparing against a ref is a ref written during render,
  // which the compiler's rules reject and are right to; deriving it in an
  // EFFECT is worse, because the effect runs after the new grid has already
  // mounted and started animating the wrong way. `goToMonth` is the one door,
  // and every route in - the chevrons, the swipe, the arrow keys, Today - goes
  // through it.
  const monthKey = `${month.getFullYear()}-${month.getMonth()}`
  const [monthDir, setMonthDir] = useState(1)
  const goToMonth = useCallback((next) => {
    setMonth((cur) => {
      const to = typeof next === 'function' ? next(cur) : next
      const a = cur.getFullYear() * 12 + cur.getMonth()
      const b = to.getFullYear() * 12 + to.getMonth()
      // "Today" from the month you are already on is not a direction; leave the
      // last one alone rather than snapping it to forwards.
      if (b !== a) setMonthDir(b > a ? 1 : -1)
      return to
    })
  }, [])
  useEffect(() => {
    if (view !== 'month') return undefined
    const onKey = (e) => {
      if (/^(INPUT|TEXTAREA)$/.test(e.target?.tagName) || e.target?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (e.key === 'ArrowLeft') goToMonth(addMonths(monthRef.current, -1))
      else if (e.key === 'ArrowRight') goToMonth(addMonths(monthRef.current, 1))
      else if (e.key === 't' || e.key === 'T') { goToMonth(new Date()); setSelectedDay(null) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view, goToMonth])

  const dayEvents = selectedDay ? eventsOn(selectedDay) : []
  const cardProps = {
    now,
    zone: tz.zone,
    rsvps,
    myId: user?.id,
    connectedIds,
    onEdit: (e) => { setEditingPersonal(e); setPersonalOpen(true) },
    onDeadlinePrefs: () => setDeadlinePrefsOpen(true),
  }

  // The Month / Week / Agenda switch. In the month view it sits at the head of
  // the calendar's own column (see below); in the others, on the controls row.
  const viewSwitch = (
    <div className="relative flex w-full rounded-full bg-cloud p-1 sm:w-auto">
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
            'relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors duration-200 sm:py-1.5',
            view === v.key ? 'text-ink' : 'text-smoke hover:text-ink',
          )}
        >
          <Icon name={v.icon} className="h-3.5 w-3.5" />
          {v.label}
        </button>
      ))}
    </div>
  )

  return (
    <div className="page">
      <PageHeader
        title={tr("Calendar")}
        action={
          /* THREE EQUAL ACTIONS ON ONE ROW, AT EVERY WIDTH.
             "Suggest an event" used to live at the foot of the page under its
             own heading; it is a primary action and it belongs with the other
             two. On a phone the three share the row equally (`flex-1
             basis-0`), so nothing wraps and no space is wasted, and the labels
             shorten rather than the buttons shrinking.
             MANAGE IS ONE ELEMENT THAT WRAPS, NOT TWO THAT HIDE. It is
             `basis-full` on a phone, so it takes a row of its own and fills it
             (a fourth column there would leave four cramped buttons); from
             `sm` it is `basis-auto` and sits on the end of the row, to the
             right of "Suggest an event", because a lone button on a second row
             of a wide header reads as a mistake.
             IT SITS ABOVE THE OTHER THREE, NOT BELOW. Ethan: "for the calendar
             for admins on mobile, I want the manage button to actually be the
             big button that appears above personal sync and suggest rather than
             below." It is the primary action and it is the widest thing in the
             row, so hanging it off the bottom made the header read as a list
             that had run out of space. `max-sm:order-first` moves it without
             moving it in the markup, so the desktop row is untouched - the same
             rule `ActionRow` applies everywhere else. */
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <button onClick={() => { setEditingPersonal(null); setPersonalOpen(true) }} className="btn-secondary !px-3 !py-2.5 flex-1 basis-0 justify-center whitespace-nowrap text-sm sm:flex-none sm:basis-auto sm:!px-4">
              <Icon name="plus" className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{tr("Personal event")}</span>
              <span className="sm:hidden">{tr("Personal")}</span>
            </button>
            {/* SUBSCRIBE, NOT DOWNLOAD. A file is out of date the moment
                anybody adds a date to it; a URL is not. */}
            <button onClick={() => setSubscribeOpen(true)} className="btn-secondary !px-3 !py-2.5 flex-1 basis-0 justify-center whitespace-nowrap text-sm sm:flex-none sm:basis-auto sm:!px-4">
              <Icon name="calendar" className="h-4 w-4 shrink-0" />
              {tr("Sync")}
            </button>
            <button onClick={() => setSuggestOpen(true)} className="btn-secondary !px-3 !py-2.5 flex-1 basis-0 justify-center whitespace-nowrap text-sm sm:flex-none sm:basis-auto sm:!px-4">
              <Icon name="pencil" className="h-4 w-4 shrink-0" />
              <span className="hidden sm:inline">{tr("Suggest an event")}</span>
              <span className="sm:hidden">{tr("Suggest")}</span>
            </button>
            {isAdmin && (
              <Link to="/admin/events" className="btn-primary basis-full justify-center whitespace-nowrap max-sm:order-first sm:basis-auto sm:!px-4">{tr("Manage")}</Link>
            )}
          </div>
        }
      />

      {loading ? (
        /* The calendar's own shape - the next-up strip, the view toggles and a
           month grid - rather than two rectangles. See components/PageSkeleton
           for why this matters more than the Suspense fallback does. */
        <PageSkeleton shape="calendar" />
      ) : (
        <>
          {/* THE PAGE ASSEMBLES, LIKE EVERY OTHER ONE (12 Sep 2026).
              Ethan: "on desktop I noticed the calendar page doesn't have any
              nice clean animations like the others, please build this in."
              It was the odd page out - it drew itself in a single frame while
              the hub, the markets, the challenges and the flight log all arrive
              through `Reveal`. Section by section, top to bottom, with the
              increasing `delay` the hub uses so the three above the fold do not
              all fire on the same frame and read as one block. It is CSS, which
              matters here more than most places: this route already carries
              date-fns and the whole calendar, and an entrance is not worth the
              Motion runtime on top. */}
          {/* ---------- On now ----------
              At the very top, above the next-up strip, because a thing that is
              happening beats a thing that is going to. */}
          {liveNow.length > 0 && (
            <Reveal as="section" className="mb-6 space-y-3" delay={0} stagger={0.06}>
              {liveNow.map((e) => <EventCard key={e.id} e={e} {...cardProps} live />)}
            </Reveal>
          )}

          {nextEvent && (
            <Reveal delay={0.06}>
              <NextUp e={nextEvent} now={now} zone={tz.zone} rsvps={rsvps} myId={user?.id} connectedIds={connectedIds} />
            </Reveal>
          )}

          {/* ---------- The controls ----------
              THE VIEW SWITCH SPANS THE WHOLE WIDTH ON A PHONE. Ethan: "rather
              than have this go across most of the screen, and then suddenly
              stop, it should be centred and go across it all like the big card
              above." It is a real segmented control with a sliding highlight,
              not three buttons that change colour; the slide is what tells you
              the three are one thing. */}
          {view !== 'month' && (
          <Reveal className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between" delay={0.12} row>
            {viewSwitch}

          </Reveal>
          )}

          {view === 'month' && (
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
              {/* THE TWO COLUMNS DO NOT ARRIVE THE SAME WAY. The grid rises and
                  the rail slides in from the edge it lives against, which is
                  the house pattern for a two-column page (see the `from` prop
                  in Reveal) and is what makes a layout read as composed rather
                  than merely animated. */}
              <Reveal className="lg:col-span-2" delay={0.12}>
              <div>
                {/* THE MONTH SITS ON THE CALENDAR (28 Sep 2026, evening). Ethan:
                    "the month is hard to see because the month is over on the
                    right. Maybe it should be directly above it ... and then
                    coming up can just be up on the right there." So the switch
                    and the month head the calendar's own column, the month in
                    large type, and Coming up rises to the top of the right
                    column beside them. */}
                <div className="mb-3">{viewSwitch}</div>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 key={monthKey} className="cal-label-in whitespace-nowrap text-[22px] font-bold tracking-tight tabular-nums sm:text-[28px]">
                    {format(month, 'MMMM')} <span className="font-semibold text-smoke">{format(month, 'yyyy')}</span>
                  </h2>
                  <div className="flex items-center gap-1 rounded-full border border-gray-100 bg-white p-1 shadow-card">
                    <button onClick={() => goToMonth(addMonths(month, -1))} aria-label={tr("Previous month")}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-smoke transition-all duration-200 hover:bg-cloud hover:text-ink active:scale-90">
                      <Icon name="chevronLeft" className="h-4 w-4" />
                    </button>
                    <button onClick={() => { goToMonth(new Date()); setSelectedDay(null) }}
                      className="rounded-full px-3 py-1.5 text-xs font-semibold text-smoke transition-all duration-200 hover:bg-cloud hover:text-ink active:scale-95">
                      {tr("Today")}
                    </button>
                    <button onClick={() => goToMonth(addMonths(month, 1))} aria-label={tr("Next month")}
                      className="flex h-8 w-8 items-center justify-center rounded-full text-smoke transition-all duration-200 hover:bg-cloud hover:text-ink active:scale-90">
                      <Icon name="chevronRight" className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                {/* A MONTH IS A PLACE YOU MOVE ALONG, AND THE GRID SAYS WHICH
                    WAY. Pressing "next" and pressing "previous" used to look
                    identical - the numbers in the cells simply became different
                    numbers - so the one fact the change carried was thrown
                    away. `monthKey` remounts the wrapper; `monthDir` picks the
                    side it comes in from. One wrapper, never per cell: 42 cells
                    each animating is 42 compositor layers for one press. */}
                <div key={monthKey} className={monthDir >= 0 ? 'cal-month-next' : 'cal-month-prev'}>
                <MonthGrid
                  days={days} month={month} eventsOn={eventsOn} travelDays={travelDays}
                  selectedDay={selectedDay} onSelect={setSelectedDay}
                  liveIds={liveIds}
                  onSwipe={(dir) => { goToMonth(addMonths(monthRef.current, dir)); setSelectedDay(null) }}
                />
                </div>
                <p className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-smoke">
                  <span>
                    <span className="font-semibold text-ink">{monthSummary.n}</span>
                    {monthSummary.n === 1 ? ' thing' : ' things'} in {format(month, 'MMMM')}
                    {monthSummary.deadlines > 0 && (
                      <span className="font-semibold text-brand">
                        {' · '}{monthSummary.deadlines} {monthSummary.deadlines === 1 ? 'deadline' : 'deadlines'}
                      </span>
                    )}
                  </span>
                  <span className="hidden text-gray-400 sm:inline">{tr("Swipe with two fingers or use the arrow keys to change month")}</span>
                  <span className="text-gray-400 sm:hidden">{tr("Swipe to change month")}</span>
                </p>

                {/* THE DAY OPENS AS A CARD OVER THE PAGE (26 Sep 2026). Ethan:
                    "When you click on it, it only shows something at the bottom,
                    so you can barely even notice it." It grew open under the
                    grid, below the fold on most screens. Now it is a modal: on
                    a phone a sheet from the bottom, on a desktop a centred
                    card, and the grid stays exactly where it was. */}
                <Modal open={!!selectedDay} onClose={() => setSelectedDay(null)} title={selectedDay ? format(selectedDay, 'EEEE d MMMM') : ''}>
                  {selectedDay && (
                    <div className="space-y-4">
                      {travelDays.get(dayKey(selectedDay)) && (
                        <p className="flex items-center gap-2 rounded-xl bg-brand-tint/60 px-3 py-2 text-xs font-semibold text-brand">
                          <Icon name="plane-tryp" className="h-3.5 w-3.5" />
                          You are in {travelDays.get(dayKey(selectedDay))}
                        </p>
                      )}
                      {dayEvents.length === 0 ? (
                        <p className="rounded-xl bg-cloud/60 px-4 py-6 text-center text-sm text-smoke">{tr("Nothing planned. A good day to film something.")}</p>
                      ) : (
                        <Reveal className="space-y-3" dense stagger={0.05}>
                          {dayEvents.map((e) => (
                            <EventCard key={e.id} e={e} {...cardProps} compact live={liveIds.has(e.id)} />
                          ))}
                        </Reveal>
                      )}
                      <button
                        onClick={() => { setEditingPersonal(null); setPersonalOpen(true) }}
                        className="btn-secondary w-full justify-center"
                      >
                        <Icon name="plus" className="h-4 w-4" /> {tr("Add something to this day")}
                      </button>
                    </div>
                  )}
                </Modal>
              </div>

              </Reveal>

              <Reveal as="aside" from="right" delay={0.18}>
                <div>
                  <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold lg:mt-1.5">
                    <Icon name="clock" className="h-5 w-5 text-brand" />
                    {tr("Coming up")}
                  </h2>
                  <UpcomingList rows={upcoming.slice(0, 6)} cardProps={cardProps} />
                </div>
              </Reveal>
            </div>
          )}

          {/* THE OTHER TWO VIEWS ARRIVE TOO, and they are keyed on `view` so
              that SWITCHING between them is a movement rather than a swap. The
              segmented control's highlight already slides; the panel under it
              used to change without acknowledging that anything had happened. */}
          {view === 'week' && (
            <Reveal key="week" delay={0.18}>
              <WeekView
                days={weekDays} eventsOn={eventsOn} travelDays={travelDays} liveIds={liveIds}
                cardProps={cardProps}
                onShift={(n) => setWeekAnchor(addDays(weekDays[0], n * 7))}
                onToday={() => setWeekAnchor(null)}
              />
            </Reveal>
          )}

          {view === 'agenda' && (
            <Reveal key="agenda" delay={0.18}>
              <Agenda rows={upcoming} cardProps={cardProps} liveIds={liveIds} />
            </Reveal>
          )}

          {/* Availability polls, creator event ideas, and (admins) post-event ratings */}
          <Reveal className="mt-12">
            <EventPolls />
            <SuggestEvent open={suggestOpen} onClose={() => setSuggestOpen(false)} />
            <EventRatingsAdmin />
          </Reveal>
        </>
      )}

      <PersonalEventModal
        open={personalOpen}
        editing={editingPersonal}
        onClose={() => { setPersonalOpen(false); setEditingPersonal(null) }}
        onSaved={reload}
      />
      <SubscribeCalendar open={subscribeOpen} onClose={() => setSubscribeOpen(false)} />

      {/* THE ONE-OFF "you have moved" QUESTION. Once per new device zone, on
          the page where it matters. `tzAsked` stops it reappearing within a
          single visit while the profile write is in flight. */}
      <TimezonePrompt
        open={tz.moved && !tzAsked}
        device={tz.device}
        previous={tz.pinned || tz.seen}
        onChange={() => { setTzAsked(true); tz.change() }}
        onKeep={() => { setTzAsked(true); tz.keep() }}
      />

      {/* The standing deadline lead-times, opened by the bell on a deadline.
          Same component Settings renders inline. */}
      <DeadlineReminderModal open={deadlinePrefsOpen} onClose={() => setDeadlinePrefsOpen(false)} />

      {/* "How was it?" for an event you said you were going to, ON THE CALENDAR
          PAGE. It used to be mounted in AppLayout, so it could interrupt
          somebody reading their DMs about a Q&A that finished last Tuesday. */}
      <EventRatingPrompt />
    </div>
  )
}

// ---------------------------------------------------------------- pieces

// THE NEXT THING, AND HOW LONG YOU HAVE.
//
// ON A PHONE IT IS A STRIP, NOT A POSTER. Ethan: "currently its taking up a lot
// of space and actually have to scroll down a lot to see the actual calendar."
// It was a 9-rem gradient panel with a description, a button row and an RSVP
// control inside it, which on a 375px screen is most of the first viewport
// spent on one event. The phone version keeps the two facts that earn their
// place - what it is and how soon - and everything else is one tap away in the
// day panel. The desktop card is unchanged, because there the space is free.
function NextUp({ e, now, zone, rsvps, myId, connectedIds }) {
  const tr = useT()
  const meta = metaFor(e.type)
  const date = new Date(e.date)
  const soon = whenLabel(date, now)
  const rows = rsvps?.get(e.id) || []
  return (
    <>
      {/* Phone */}
      <section className="relative mb-5 flex items-center gap-3 overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-3.5 text-white shadow-card sm:hidden">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/20">
          <Icon name={meta.icon} className="h-5 w-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-widest text-white/75">{tr("Next up")}</span>
          <span className="block truncate text-sm font-bold leading-tight">{e.title}</span>
          <span className="block text-xs text-white/85">
            {format(date, 'EEE d MMM')} · {format(date, 'HH:mm')}
          </span>
        </span>
        {soon && (
          <span className="shrink-0 rounded-full bg-white/20 px-2 py-1 text-[10px] font-bold uppercase tracking-wider">{soon}</span>
        )}
      </section>

      {/* Desktop */}
      <section className="relative z-10 mb-8 hidden overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-6 text-white shadow-lift sm:block sm:p-9">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-white/10 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-24 -left-10 h-64 w-64 rounded-full bg-black/5 blur-2xl" />
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3 py-1 text-[11px] font-bold uppercase tracking-widest">
            <Icon name={meta.icon} className="h-3.5 w-3.5" />
            {tr("Next up")}
          </span>
          <div className="mt-3 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h2 className="text-2xl font-bold leading-tight sm:text-3xl">{e.title}</h2>
              <p className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-white/85">
                <EventTime at={e.date} zone={zone} prefix={`${format(date, 'd MMM')}, `} />
                {soon && (
                  <span className="rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider">{soon}</span>
                )}
              </p>
              {e.description && <p className="mt-2.5 max-w-xl text-sm text-white/80">{e.description}</p>}
            </div>
            <div className="flex shrink-0 flex-wrap gap-3">
              {e.meetingUrl && (
                <a href={e.meetingUrl} target="_blank" rel="noopener noreferrer"
                  className="btn bg-white text-brand transition-transform duration-200 hover:scale-105 hover:bg-white">
                  {tr("Join the call")}
                </a>
              )}
              {e.link && (
                <Link to={e.link} className="btn border border-white/40 text-white transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/10">
                  {tr("View")}
                </Link>
              )}
            </div>
          </div>
          {rows.length > 0 && (
            <div className="mt-4 [&_p]:!text-white/85">
              <RsvpFaces rows={rows} myId={myId} connectedIds={connectedIds} />
            </div>
          )}
          {e.rsvpEnabled && <div className="mt-4"><EventRsvp eventId={e.id} /></div>}
        </div>
      </section>
    </>
  )
}

// THE GRID. Every cell is a button that lifts, every day with something on it
// carries one dot per event COLOURED BY TYPE, and today is a filled disc.
//
// TRAVEL DAYS ARE A WASH, NOT AN ENTRY. Ethan: "on the trip days between maybe
// the calendar boxes or weekly boxes should be highlighted in a light orange
// colour, showing that theyre travelling those days." A six-day trip written
// out as six cards buries everything else in the week; a tint says the same
// thing and leaves the cell free to carry what is actually happening on it.
//
// IT TAKES A HORIZONTAL SWIPE. Ethan: "this is the gesture people already try."
// The arrows stay. The guard is that the gesture must be more horizontal than
// vertical AND clear 45px, or every attempt to scroll the page past the grid
// would jump a month.
//
// AND A TWO-FINGER SWIPE ON A TRACKPAD (28 Sep 2026). Ethan: "whenever I swipe
// with two fingers on my Mac, I want it to move the calendar to the next
// month." A trackpad swipe arrives as horizontal `wheel` events. They are added
// up until they clear a threshold, then the month turns once and the gesture is
// spent until the fingers stop (a quiet gap), so one swipe is one month however
// long the momentum tail runs. `overscroll-behavior-x` stops Safari reading the
// same swipe as "go back a page".
// ONE SWIPE, ONE MONTH - MEASURED ACROSS THE REMOUNT (28 Sep 2026, evening).
// Ethan: "the scrolling with two fingers ... should only be able to do one page
// at a time, but currently, if I do it, it starts scrolling a bunch of pages and
// is a bit glitchy." The grid is KEYED ON THE MONTH (so the new month slides
// in), which means turning a month unmounts this component - and the gesture
// state lived inside it. The fresh grid attached a fresh listener with
// `spent = false` while the trackpad's momentum was still arriving, so it
// turned again, remounted again, and cascaded. The state lives out here now,
// where a remount cannot reset it: a gesture is spent until the wheel has been
// silent for a beat, whichever grid is on screen.
const wheelGesture = { sum: 0, spent: false, last: 0 }
const WHEEL_GAP_MS = 240

function MonthGrid({ days, month, eventsOn, travelDays, selectedDay, onSelect, liveIds, onSwipe }) {
  const startRef = useRef(null)
  const boxRef = useRef(null)
  const swipeRef = useRef(onSwipe)
  useEffect(() => { swipeRef.current = onSwipe }, [onSwipe])

  // THE FINGER MOVES THE GRID DIRECTLY, NOT THROUGH STATE. Every touchmove used
  // to set React state and re-render all 42 day buttons, sixty times a second,
  // which is the lag Ethan felt swiping on a phone. The offset is written to
  // the element's own style; React never hears about it.
  const setOffset = (px, animate = false) => {
    const el = boxRef.current
    if (!el) return
    el.style.transition = animate ? 'transform 260ms cubic-bezier(0.22, 1, 0.36, 1)' : 'none'
    el.style.transform = px ? `translate3d(${px}px, 0, 0)` : ''
  }

  useEffect(() => {
    const el = boxRef.current
    if (!el) return undefined
    let settle = null
    const onWheel = (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 1.2) return
      e.preventDefault()
      const now = performance.now()
      if (now - wheelGesture.last > WHEEL_GAP_MS) { wheelGesture.sum = 0; wheelGesture.spent = false }
      wheelGesture.last = now
      clearTimeout(settle)
      settle = setTimeout(() => setOffset(0, true), 120)
      if (wheelGesture.spent) return
      wheelGesture.sum += e.deltaX
      setOffset(Math.max(-40, Math.min(40, -wheelGesture.sum * 0.35)))
      if (Math.abs(wheelGesture.sum) > 70) {
        wheelGesture.spent = true
        setOffset(0)
        swipeRef.current(wheelGesture.sum > 0 ? 1 : -1)
      }
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => { el.removeEventListener('wheel', onWheel); clearTimeout(settle) }
  }, [])

  const onTouchStart = (e) => {
    const t = e.touches[0]
    startRef.current = { x: t.clientX, y: t.clientY, dx: 0, decided: null }
  }
  const onTouchMove = (e) => {
    const s = startRef.current
    if (!s) return
    const t = e.touches[0]
    const dx = t.clientX - s.x
    const dy = t.clientY - s.y
    // Decide ONCE, on the first move that is big enough to mean anything.
    if (s.decided === null && Math.abs(dx) + Math.abs(dy) > 10) {
      s.decided = Math.abs(dx) > Math.abs(dy) * 1.3 ? 'x' : 'y'
    }
    if (s.decided === 'x') {
      s.dx = dx
      // Follows the finger with resistance, so it reads as elastic.
      setOffset(dx * 0.45)
    }
  }
  const onTouchEnd = () => {
    const s = startRef.current
    startRef.current = null
    if (s?.decided === 'x' && Math.abs(s.dx) > 45) {
      // The new month mounts and slides in from the side; this one is replaced
      // on the same frame, so it does not need to travel back first.
      setOffset(0)
      onSwipe(s.dx < 0 ? 1 : -1)
    } else {
      setOffset(0, true)
    }
  }

  return (
    <div
      // `touch-action: pan-y`: a vertical drag still scrolls the page, and a
      // sideways one is handed to the swipe instead of to the browser.
      className="overflow-hidden rounded-card border border-gray-200/80 bg-white p-1.5 shadow-card [overscroll-behavior-x:contain] [touch-action:pan-y] sm:p-2"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      <div ref={boxRef} className="will-change-transform">
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
          <div key={d} className="py-2 text-center text-[10px] font-bold uppercase tracking-widest text-smoke">
            <span className="hidden sm:inline">{d}</span>
            <span className="sm:hidden">{d[0]}</span>
          </div>
        ))}
      </div>
      {/* ROUNDED DAY TILES ON A WHITE CARD (28 Sep 2026), not squares on a
          grey grid. Ethan: "I would round the corners ... for those ones that
          have events", and on a phone the grid looked "compact, a bit
          squared". Each day is its own rounded tile with a small gap, so a
          busy day is an orange rounded tile and the month reads as a set of
          days rather than a table. */}
      {/* MORE CONTRAST (28 Sep 2026, evening). Ethan: "maybe the rounded boxes
          are actually okay. You just need to make it more contrasting or make it
          stand out better." The empty days were cloud on white - two near-whites
          - so the month read as a pale haze. Each day is now a white tile with
          a real edge on a light grey card, the weekend a shade deeper, and
          today ringed in the brand. */}
      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {days.map((day) => {
          const list = eventsOn(day)
          const selected = selectedDay && isSameDay(day, selectedDay)
          const outside = !isSameMonth(day, month)
          const today = isToday(day)
          const away = travelDays.get(dayKey(day))
          const hasLive = list.some((e) => liveIds.has(e.id))
          const busy = list.length > 0
          return (
            <button
              key={day.toISOString()}
              onClick={() => onSelect(selected ? null : day)}
              aria-label={`${format(day, 'd MMMM')}${list.length ? `, ${list.length} events` : ''}${away ? `, travelling` : ''}`}
              aria-pressed={!!selected}
              // A DAY WITH SOMETHING ON IS AN ORANGE SQUARE (26 Sep 2026). Ethan:
              // "it only shows a dot and a little preview sentence ... if there's
              // an event on a day, that whole square should be orange-coloured,
              // and it should show the preview name on it." Busy days are the
              // brand gradient with the first title on them at every width;
              // empty days stay white, travelling days keep their wash.
              className={cx(
                'group relative flex min-h-[58px] flex-col items-center gap-0.5 overflow-hidden rounded-xl p-1 transition-all duration-200 sm:min-h-[92px] sm:gap-1.5 sm:rounded-2xl sm:p-2',
                'hover:z-10 active:scale-[0.96] hoverable:hover:-translate-y-0.5',
                busy
                  ? cx('bg-gradient-to-br text-white shadow-[0_6px_16px_-8px_rgba(217,68,7,0.7)] hover:brightness-105', outside ? 'from-brand/55 to-brand-light/55' : 'from-brand to-brand-light')
                  : cx(
                    'hover:border-brand/40 hover:bg-brand-tint/40',
                    away ? 'border border-brand-light/40 bg-brand-tint/70'
                      : outside ? 'border border-transparent bg-transparent'
                        : today ? 'border-2 border-brand/70 bg-white'
                          : isWeekend(day) ? 'border border-gray-200 bg-gray-50' : 'border border-gray-200 bg-white',
                  ),
                selected && 'z-10',
              )}
            >
              {/* THE SELECTED DAY IS A ROUNDED CARD INSIDE THE CELL, NOT THE
                  CELL PAINTED ORANGE. (1 Sep 2026.)

                  Ethan: "when you click on a square a date on the calendar it
                  shows up in an ugly orange colour and the corners look very
                  sharp, improve the design, colour and maybe round the corners
                  if you can make it look clean."

                  Both complaints have the same cause. The grid is `gap-px` over
                  a grey ground, so a cell IS a hard-edged square by
                  construction, and filling it means a full-bleed rectangle with
                  four right angles - which cannot be rounded, because rounding
                  the cell would cut holes in the grid lines. And `bg-brand-tint`
                  under a `ring-brand/50` is two different oranges a shade apart
                  covering the whole square, which is what makes it read as a
                  flat slab rather than a selection.

                  So the selection is its own element, inset by four pixels and
                  properly rounded: white ground, a clean brand border and a
                  soft brand shadow. The grid keeps its lines, the day number
                  and the event dots sit on white rather than on orange, and the
                  corners are round because the thing being drawn is round. */}
              {selected && (
                <span
                  aria-hidden
                  className={cx(
                    'pointer-events-none absolute inset-0 rounded-[inherit] border-2',
                    busy ? 'border-white/90' : 'border-brand bg-white shadow-[0_4px_14px_-4px_rgba(217,68,7,0.45)]',
                  )}
                />
              )}
              {/* The travelling wash gets a hairline at the top of the cell so a
                  run of days reads as one stay rather than six tinted squares. */}
              {away && <span className="absolute inset-x-2 top-0 h-0.5 rounded-full bg-brand-light/70" aria-hidden />}
              <span className={cx(
                'relative flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold tabular-nums transition-all duration-200 sm:h-7 sm:w-7 sm:text-xs',
                busy
                  ? (today ? 'bg-white text-brand shadow-card' : 'text-white')
                  : today ? 'bg-brand text-white shadow-card' : outside ? 'text-gray-300' : 'text-ink group-hover:bg-white',
                // On the selected day the number is the brand, so the cell says
                // "this one" twice without needing a second fill behind it.
                selected && !today && !busy && 'text-brand',
              )}>
                {format(day, 'd')}
              </span>

              {busy && (
                <span className="relative w-full px-0.5 text-center">
                  <span className={cx(
                    'line-clamp-2 text-[9px] font-semibold leading-tight [overflow-wrap:anywhere] sm:text-[11px]',
                    hasLive && 'animate-pulse',
                  )}>
                    {list[0].title}
                  </span>
                  {list.length > 1 && (
                    <span className="mt-0.5 inline-block rounded-full bg-white/25 px-1.5 text-[9px] font-bold leading-4">+{list.length - 1}</span>
                  )}
                </span>
              )}
            </button>
          )
        })}
      </div>
      </div>
    </div>
  )
}

// THE WEEK. Seven columns on a desktop, seven rows on a phone - a week view
// that keeps its columns at 375px gives every day 50 pixels, which fits a date
// and nothing else.
//
// THE DAY CARDS ARE TALLER. Ethan: "for weekly view i would make each day card
// slightly more vertical longer." They were `h-full` inside an auto-height row,
// so a week with one busy day gave every other column the height of its single
// line and the row read as a ragged strip. A `min-h` gives the week a shape
// before anything is in it, which is what a week view is for.
function WeekView({ days, eventsOn, travelDays, liveIds, cardProps, onShift, onToday }) {
  const tr = useT()
  const weekRows = days.flatMap((d) => eventsOn(d))
  return (
    <section>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-bold sm:text-lg">
          {format(days[0], 'd MMM')} &ndash; {format(days[6], 'd MMM yyyy')}
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={() => onShift(-1)} aria-label={tr("Previous week")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-smoke transition-all duration-200 hover:bg-cloud hover:text-ink active:scale-90">
            <Icon name="chevronLeft" className="h-4 w-4" />
          </button>
          <button onClick={onToday}
            className="rounded-full px-3 py-1.5 text-xs font-semibold text-smoke transition-all duration-200 hover:bg-cloud hover:text-ink active:scale-95">
            {tr("This week")}
          </button>
          <button onClick={() => onShift(1)} aria-label={tr("Next week")}
            className="flex h-9 w-9 items-center justify-center rounded-full text-smoke transition-all duration-200 hover:bg-cloud hover:text-ink active:scale-90">
            <Icon name="chevronRight" className="h-4 w-4" />
          </button>
        </div>
      </div>
      <Reveal className="grid gap-3 sm:grid-cols-2 lg:grid-cols-7" stagger={0.04}>
        {days.map((day) => {
          const list = eventsOn(day)
          const today = isToday(day)
          const away = travelDays.get(dayKey(day))
          return (
            <div key={day.toISOString()} className="h-full">
              <div className={cx(
                'flex h-full flex-col rounded-card border p-3 transition-all duration-200 lg:min-h-[15rem]',
                today ? 'border-brand bg-brand-tint/30' : away ? 'border-brand-light/40 bg-brand-tint/25' : 'border-gray-100 bg-white shadow-card',
                list.length > 0 && 'hover:-translate-y-0.5 hover:shadow-lift',
              )}>
                <div className="flex items-baseline justify-between">
                  <p className={cx('text-[10px] font-bold uppercase tracking-widest', today ? 'text-brand' : 'text-smoke')}>
                    {format(day, 'EEE')}
                  </p>
                  {away && (
                    <span title={`You are in ${away}`} className="text-brand">
                      <Icon name="plane-tryp" className="h-3.5 w-3.5" />
                    </span>
                  )}
                </div>
                <p className={cx('text-2xl font-bold tabular-nums leading-none', today ? 'text-brand' : 'text-ink')}>
                  {format(day, 'd')}
                </p>
                {away && <p className="mt-1 truncate text-[10px] font-semibold text-brand">{away}</p>}
                <div className="mt-3 space-y-2">
                  {list.length === 0 ? (
                    <p className="text-[11px] text-gray-300">&mdash;</p>
                  ) : list.map((e) => {
                    const meta = metaFor(e.type)
                    const body = (
                      <>
                        <span className={cx('mt-1 block h-1 w-6 rounded-full', TONE_DOT[meta.tone])} />
                        <span className="mt-1.5 block text-[11px] font-semibold leading-snug text-ink">{e.title}</span>
                        <span className="flex items-center gap-1 text-[10px] text-smoke">
                          {format(new Date(e.date), 'HH:mm')}
                          {liveIds.has(e.id) && (
                            <span className="inline-flex h-1.5 w-1.5 animate-ping rounded-full bg-brand motion-reduce:animate-none" />
                          )}
                        </span>
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
      </Reveal>
      {/* The week's own agenda underneath it, because seven narrow columns can
          hold a title and not a description, a link, an RSVP or a bell. */}
      {weekRows.length > 0 && (
        <div className="mt-8 space-y-3">
          {weekRows.map((e) => (
            <EventCard key={e.id} e={e} {...cardProps} live={liveIds.has(e.id)} />
          ))}
        </div>
      )}
    </section>
  )
}

// THE AGENDA, GROUPED BY DAY.
//
// It was a flat list of forty cards, which is a list of dates written out
// vertically and not an agenda: nothing told you where one day stopped and the
// next began, so two things on the same afternoon looked exactly like two
// things a fortnight apart. A sticky date rail on the left is the whole
// difference, and it costs one grid column.
function Agenda({ rows, cardProps, liveIds }) {
  const groups = useMemo(() => {
    const m = new Map()
    for (const e of rows.slice(0, 60)) {
      const k = dayKey(new Date(e.date))
      const list = m.get(k)
      if (list) list.push(e); else m.set(k, [e])
    }
    return [...m.entries()]
  }, [rows])

  if (rows.length === 0) return <EmptyCalendar />

  return (
    <section className="space-y-6">
      {groups.map(([key, list], gi) => {
        const day = new Date(`${key}T12:00:00`)
        return (
          <div key={key} className="grid gap-3 sm:grid-cols-[7rem_1fr] sm:gap-5">
            <div className="sm:sticky sm:top-24 sm:self-start">
              <p className={cx('text-xs font-bold uppercase tracking-widest', isToday(day) ? 'text-brand' : 'text-smoke')}>
                {isToday(day) ? 'Today' : format(day, 'EEE')}
              </p>
              <p className="text-xl font-bold tabular-nums leading-tight">{format(day, 'd MMM')}</p>
            </div>
            <Reveal className="space-y-3" dense stagger={0.05} delay={Math.min(gi * 0.04, 0.16)}>
              {list.map((e) => (
                <EventCard key={e.id} e={e} {...cardProps} live={liveIds.has(e.id)} />
              ))}
            </Reveal>
          </div>
        )
      })}
    </section>
  )
}

function UpcomingList({ rows, cardProps }) {
  const tr = useT()
  if (rows.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-gray-200 px-5 py-10 text-center text-sm text-smoke">
        {tr("Nothing scheduled yet.")}
      </p>
    )
  }
  return (
    <Reveal className="space-y-3" dense stagger={0.05}>
      {rows.map((e) => (
        <EventCard key={e.id} e={e} {...cardProps} compact />
      ))}
    </Reveal>
  )
}

function EmptyCalendar() {
  const tr = useT()
  return (
    <div className="rounded-card border border-dashed border-gray-200 px-6 py-16 text-center">
      <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-tint text-brand">
        <Icon name="calendar" className="h-6 w-6" />
      </span>
      <p className="text-sm font-semibold text-ink">{tr("Nothing coming up")}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-smoke">
        {tr("Challenge deadlines land here on their own, and so do your flights. Anything else is a date somebody has to put in, and there is a box at the foot of this page for asking.")}
      </p>
    </div>
  )
}
