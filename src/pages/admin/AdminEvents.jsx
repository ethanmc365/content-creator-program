import { useEffect, useMemo, useState } from 'react'
import { confirm, notice } from '../../lib/confirm'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useMarkets } from '../../lib/markets'
import { EmptyState, Modal, PageHeader, Skeleton, Spinner } from '../../components/ui'
import Icon from '../../components/Icon'
import MarketPicker from '../../components/calendar/MarketPicker'
import { announceToMarkets } from '../../lib/announce'
import { toast } from '../../lib/toast'
import { viewerZone, shortZoneName } from '../../lib/eventTime'
import { formatDateTime, parseDateTime, isoToDateInput, isoToTimeInput, cx } from '../../lib/utils'

// MANAGE EVENTS, REBUILT.
//
// Ethan: "The manage events page currently looks basic, it could be made more
// useful with filters and perhaps showing events grouped by global and market
// with easy buttons to access what you need without excessive scrolling."
//
// WHAT WAS WRONG
//
//   IT WAS ONE LIST, NEWEST FIRST, FOR EVER. Every event the programme had ever
//   run, in one column, so the thing you almost always want - what is coming up
//   - was under everything that had already happened.
//
//   THE TYPE PICKER WAS EMOJI. "📍 Event", on a platform whose written rule is
//   line icons and never emoji in chrome, and the list rendered the emoji as
//   its icon by splitting the label on a space.
//
//   "WHO SEES THIS" WAS A NATIVE SELECT THAT HELD ONE MARKET. Ethan asked for
//   several - Spain and Germany without Portugal - and the OS roller cannot do
//   it. See components/calendar/MarketPicker.
//
//   AND IT READ `useCommunity().chapters`, WHICH IS EMPTY ON THE LIVE SITE.
//   That provider is inert unless the network preview flag is on, so the market
//   picker on production offered exactly one option and the scoping it existed
//   for could never be used. `useMarkets` is the always-on answer.
//
// WHAT IT DOES NOW: upcoming first and open by default, past folded away,
// grouped by who they are for, with a search box and a market filter above.
// One event is one row; the row says everything without being opened.

// PRESET TYPES, AS LINE ICONS. Plus a "Custom" escape hatch, because an admin
// inventing a type is a feature the calendar already supports (its legend is
// built from the types that actually exist, not from a list).
const TYPES = [
  { value: 'event', label: 'Event', icon: 'pin' },
  { value: 'qa', label: 'Q&A', icon: 'chat' },
  { value: 'deadline', label: 'Deadline', icon: 'clock' },
  { value: 'milestone', label: 'Milestone', icon: 'sparkles' },
  { value: 'meetup', label: 'Meet-up', icon: 'users' },
  { value: 'workshop', label: 'Workshop', icon: 'bulb' },
]
const iconFor = (t) => TYPES.find((x) => x.value === t)?.icon || 'calendar'

const DURATIONS = [
  { minutes: 60, label: '1 hour' },
  { minutes: 90, label: '90 min' },
  { minutes: 120, label: '2 hours' },
  { minutes: 0, label: 'No end' },
]

const emptyForm = {
  title: '', description: '', dateStr: '', timeStr: '', type: 'event',
  meeting_url: '', location: '', rsvp_enabled: false, customType: false,
  duration: 60, community_ids: [], announce: false,
}

export default function AdminEvents() {
  const { user } = useAuth()
  const chapters = useMarkets()
  const [events, setEvents] = useState(null)
  const [editing, setEditing] = useState(null)   // null | 'new' | event row
  const [form, setForm] = useState(emptyForm)
  const [busy, setBusy] = useState(false)
  const [query, setQuery] = useState('')
  const [marketFilter, setMarketFilter] = useState('all')  // 'all' | 'global' | <id>
  const [showPast, setShowPast] = useState(false)
  const [now] = useState(() => Date.now())

  async function load() {
    // OWNED PERSONAL EVENTS ARE NOT MANAGEABLE HERE and cannot be read anyway:
    // the restrictive policy in migration 107 hides anybody's private rows from
    // everybody including admins. The filter is belt and braces, and it also
    // keeps an admin's OWN content days out of a programme-management list.
    const { data } = await supabase.from('events').select('*').is('owner_id', null).order('date', { ascending: false })
    setEvents(data ?? [])
  }

  useEffect(() => { load() }, [])

  const marketName = useMemo(() => {
    const m = new Map(chapters.map((c) => [c.id, c.name]))
    return (id) => m.get(id) || 'A market'
  }, [chapters])

  function scopeOf(ev) {
    const ids = ev.community_ids?.length ? ev.community_ids : (ev.community_id ? [ev.community_id] : [])
    return ids
  }

  const { upcoming, past } = useMemo(() => {
    const q = query.trim().toLowerCase()
    const rows = (events ?? []).filter((ev) => {
      if (q && !`${ev.title} ${ev.description || ''}`.toLowerCase().includes(q)) return false
      const ids = scopeOf(ev)
      if (marketFilter === 'global') return ids.length === 0
      if (marketFilter !== 'all') return ids.includes(marketFilter)
      return true
    })
    return {
      // Upcoming reads forwards (the next thing first) and past reads backwards
      // (the most recent thing first). They are two different questions and
      // sorting them the same way makes one of them useless.
      upcoming: rows.filter((e) => new Date(e.date).getTime() >= now).sort((a, b) => new Date(a.date) - new Date(b.date)),
      past: rows.filter((e) => new Date(e.date).getTime() < now),
    }
  }, [events, query, marketFilter, now])

  // GROUPED BY WHO THEY ARE FOR. Global first, then one group per market that
  // actually has something coming up - a heading for an empty market is a row
  // of nothing to scroll past, which is the problem this was meant to fix.
  const groups = useMemo(() => {
    const global = upcoming.filter((e) => scopeOf(e).length === 0)
    const byMarket = new Map()
    for (const e of upcoming) {
      for (const id of scopeOf(e)) {
        const list = byMarket.get(id)
        if (list) list.push(e); else byMarket.set(id, [e])
      }
    }
    const out = []
    if (global.length) out.push({ key: 'global', label: 'Everyone, every market', icon: 'globe', rows: global })
    for (const c of chapters) {
      const rows = byMarket.get(c.id)
      if (rows?.length) out.push({ key: c.id, label: c.name, icon: 'flag', rows })
    }
    return out
  }, [upcoming, chapters])

  function openEditor(event) {
    setEditing(event ?? 'new')
    if (event) {
      const known = TYPES.some((t) => t.value === event.type)
      const mins = event.ends_at ? Math.round((new Date(event.ends_at) - new Date(event.date)) / 60000) : 0
      setForm({
        ...emptyForm,
        ...event,
        dateStr: isoToDateInput(event.date),
        timeStr: isoToTimeInput(event.date),
        meeting_url: event.meeting_url || '',
        location: event.location || '',
        customType: !known,
        duration: DURATIONS.some((d) => d.minutes === mins) ? mins : 60,
        community_ids: event.community_ids?.length ? event.community_ids : (event.community_id ? [event.community_id] : []),
        // Announcing an EDIT would post the same line twice. It is offered on
        // creation only.
        announce: false,
      })
    } else {
      setForm(emptyForm)
    }
  }

  async function save(e) {
    e.preventDefault()
    const iso = parseDateTime(form.dateStr, form.timeStr)
    if (!iso) { notice('Enter the date as DD/MM/YYYY and the time as HH:MM (24h).'); return }
    setBusy(true)
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      date: iso,
      ends_at: form.duration ? new Date(new Date(iso).getTime() + form.duration * 60_000).toISOString() : null,
      type: form.type.trim() || 'event',
      meeting_url: form.meeting_url.trim() || null,
      location: form.location.trim() || null,
      rsvp_enabled: !!form.rsvp_enabled,
      community_ids: form.community_ids,
      // THE ZONE THE ADMIN SET IT IN. The calendar shows every creator their own
      // time with the host's underneath, and it can only do that if somebody
      // recorded whose clock the number came off. See lib/eventTime.
      timezone: viewerZone(),
    }
    const isNew = editing === 'new'
    const { data: saved, error } = isNew
      ? await supabase.from('events').insert({ ...payload, created_by: user.id }).select().single()
      : await supabase.from('events').update(payload).eq('id', editing.id).select().single()
    if (error) { setBusy(false); notice(`Could not save that: ${error.message}`); return }

    if (isNew && form.announce && saved) {
      const when = new Date(saved.date).toLocaleString([], {
        weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', hour12: false,
      })
      const { posted, error: annErr } = await announceToMarkets({
        communityIds: form.community_ids,
        senderId: user.id,
        body: `**${payload.title}**\n\n${when}${payload.meeting_url ? `\n\n${payload.meeting_url}` : ''}${payload.description ? `\n\n${payload.description}` : ''}\n\nIt is on the [calendar](/events).`,
      })
      if (annErr) toast('Saved, but the announcement failed')
      else if (posted) toast(`Announced in ${posted} room${posted === 1 ? '' : 's'}`)
    } else {
      toast(isNew ? 'Event added' : 'Saved')
    }
    setBusy(false)
    setEditing(null)
    load()
  }

  async function remove(event) {
    if (!await confirm(`Delete "${event.title}"?`)) return
    const { error } = await supabase.from('events').delete().eq('id', event.id)
    if (error) { notice(`Could not delete that: ${error.message}`); return }
    toast('Deleted')
    load()
  }

  const loading = events === null

  return (
    <div className="page max-w-4xl">
      <PageHeader
        title="Manage events"
        subtitle="Q&As, content days, milestones. Challenge dates show on the calendar automatically."
        action={
          <button onClick={() => openEditor(null)} className="btn-primary">
            <Icon name="plus" className="h-4 w-4" />
            New event
          </button>
        }
      />

      {/* ---------- Filters ----------
          A search box and a market strip. Two controls, both of which narrow a
          list you can already see, so neither can hide something you did not
          know was there. */}
      <div className="mb-6 space-y-3">
        <div className="relative">
          <Icon name="magnifier" className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-smoke" />
          <input
            className="input !pl-11"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events"
            aria-label="Search events"
          />
        </div>
        {/* Horizontal scroll rather than a wrap on a phone: seven markets
            wrapping to three rows pushes the list itself off the screen, which
            is the "excessive scrolling" the filters exist to remove. */}
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          <FilterPill on={marketFilter === 'all'} onClick={() => setMarketFilter('all')} icon="reorder" label="Everything" />
          <FilterPill on={marketFilter === 'global'} onClick={() => setMarketFilter('global')} icon="globe" label="Global" />
          {chapters.map((c) => (
            <FilterPill key={c.id} on={marketFilter === c.id} onClick={() => setMarketFilter(c.id)} icon="flag" label={c.name} />
          ))}
        </div>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}</div>
      ) : upcoming.length === 0 && past.length === 0 ? (
        <EmptyState
          icon={<Icon name="calendar" className="h-7 w-7" />}
          title={query || marketFilter !== 'all' ? 'Nothing matches' : 'No events yet'}
          hint={query || marketFilter !== 'all' ? 'Try a wider filter.' : 'Add your first one. A live Q&A is always a hit.'}
        />
      ) : (
        <div className="space-y-8">
          {groups.map((g) => (
            <section key={g.key}>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-smoke">
                <Icon name={g.icon} className="h-4 w-4 text-brand" />
                {g.label}
                <span className="rounded-full bg-cloud px-2 py-0.5 text-[10px] tabular-nums">{g.rows.length}</span>
              </h2>
              <div className="space-y-3">
                {g.rows.map((ev) => (
                  <EventRow key={`${g.key}-${ev.id}`} ev={ev} chapters={chapters} marketName={marketName}
                    onEdit={() => openEditor(ev)} onDelete={() => remove(ev)} />
                ))}
              </div>
            </section>
          ))}

          {upcoming.length === 0 && past.length > 0 && (
            <p className="rounded-card border border-dashed border-gray-200 px-5 py-8 text-center text-sm text-smoke">
              Nothing coming up. {past.length} past event{past.length === 1 ? '' : 's'} below.
            </p>
          )}

          {/* PAST IS FOLDED AWAY, NOT REMOVED. It is occasionally what you came
              for (to copy the details of last month's Q&A) and never what you
              came for first. */}
          {past.length > 0 && (
            <section>
              <button
                onClick={() => setShowPast((v) => !v)}
                className="flex w-full items-center gap-2 rounded-card border border-gray-100 bg-white px-4 py-3 text-sm font-semibold text-smoke transition-all duration-200 hover:-translate-y-0.5 hover:text-ink hover:shadow-card"
              >
                <Icon name="chevronRight" className={cx('h-4 w-4 transition-transform duration-200', showPast && 'rotate-90')} />
                {showPast ? 'Hide' : 'Show'} {past.length} past event{past.length === 1 ? '' : 's'}
              </button>
              {showPast && (
                <div className="mt-3 space-y-3">
                  {past.map((ev) => (
                    <EventRow key={ev.id} ev={ev} chapters={chapters} marketName={marketName} past
                      onEdit={() => openEditor(ev)} onDelete={() => remove(ev)} />
                  ))}
                </div>
              )}
            </section>
          )}
        </div>
      )}

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'New event' : 'Edit event'} wide>
        <form onSubmit={save} className="space-y-5">
          <div>
            <label htmlFor="ev-title" className="label">Title</label>
            <input id="ev-title" type="text" required className="input" value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Live Q&A with Ethan" />
          </div>

          {/* TYPE AS A ROW OF CHIPS. A select of six things you can see at once
              is a select for no reason, and on a phone it is a full-screen
              roller for no reason. */}
          <div>
            <span className="label">Type</span>
            {form.customType ? (
              <div className="flex gap-2">
                <input id="ev-type" type="text" required className="input" value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })} placeholder="Custom type" />
                <button type="button" onClick={() => setForm({ ...form, customType: false, type: 'event' })}
                  className="btn-ghost shrink-0 text-xs">Back</button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {TYPES.map((t) => (
                  <button
                    key={t.value} type="button" onClick={() => setForm({ ...form, type: t.value })}
                    className={cx(
                      'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition-all duration-200 active:scale-95',
                      form.type === t.value
                        ? 'border-brand bg-brand text-white shadow-card'
                        : 'border-gray-200 bg-white text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand',
                    )}
                  >
                    <Icon name={t.icon} className="h-3.5 w-3.5" />
                    {t.label}
                  </button>
                ))}
                <button type="button" onClick={() => setForm({ ...form, customType: true, type: '' })}
                  className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-gray-300 px-3.5 py-2 text-xs font-semibold text-smoke transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand">
                  <Icon name="plus" className="h-3.5 w-3.5" />
                  Custom
                </button>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="ev-date" className="label">Date</label>
              <input id="ev-date" type="text" inputMode="numeric" required className="input" value={form.dateStr}
                onChange={(e) => setForm({ ...form, dateStr: e.target.value })} placeholder="DD/MM/YYYY" />
            </div>
            <div>
              <label htmlFor="ev-time" className="label">Start</label>
              <input id="ev-time" type="text" inputMode="numeric" required className="input" value={form.timeStr}
                onChange={(e) => setForm({ ...form, timeStr: e.target.value })} placeholder="HH:MM" />
            </div>
          </div>

          {/* HOW LONG, WHICH IS WHAT MAKES "LIVE NOW" POSSIBLE. Without an end
              time the calendar cannot tell a thing that is on from a thing that
              finished an hour ago. */}
          <div>
            <span className="label">
              How long <span className="font-normal text-smoke">(this is what makes it show as on now)</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {DURATIONS.map((d) => (
                <button key={d.minutes} type="button" onClick={() => setForm({ ...form, duration: d.minutes })}
                  className={cx(
                    'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95',
                    form.duration === d.minutes
                      ? 'border-brand bg-brand text-white shadow-card'
                      : 'border-gray-200 bg-white text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand',
                  )}
                >{d.label}</button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-smoke">
              Times are set on your clock ({shortZoneName(viewerZone()) || 'your timezone'}) and every creator sees their own.
            </p>
          </div>

          <div>
            <label htmlFor="ev-desc" className="label">Description <span className="font-normal text-smoke">(optional)</span></label>
            <textarea id="ev-desc" rows={3} className="input" value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>

          {/* WHO SEES IT. A Spanish meetup on 43 UK creators' calendars is
              noise, and a network-wide Q&A that only shows up in one market is a
              Q&A half the programme misses. */}
          <div>
            <span className="label">Who sees this</span>
            <MarketPicker id="ev-scope" chapters={chapters} value={form.community_ids}
              onChange={(v) => setForm({ ...form, community_ids: v })} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="ev-meet" className="label">Meeting link <span className="font-normal text-smoke">(optional)</span></label>
              <input id="ev-meet" type="url" className="input" value={form.meeting_url}
                onChange={(e) => setForm({ ...form, meeting_url: e.target.value })} placeholder="https://meet.google.com/…" />
            </div>
            <div>
              <label htmlFor="ev-loc" className="label">Place <span className="font-normal text-smoke">(optional)</span></label>
              <input id="ev-loc" type="text" className="input" value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Lisbon, or online" />
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-cloud/60 p-3">
            <input type="checkbox" checked={!!form.rsvp_enabled}
              onChange={(e) => setForm({ ...form, rsvp_enabled: e.target.checked })} className="mt-0.5 h-4 w-4 accent-brand" />
            <span className="text-sm">
              <span className="font-medium">Ask creators to RSVP</span>
              <span className="block text-xs text-smoke">
                They mark whether they are going, and the card shows who else is. Leave off for deadlines and info-only dates.
              </span>
            </span>
          </label>

          {editing === 'new' && (
            <label className="flex cursor-pointer items-start gap-3 rounded-xl bg-cloud/60 p-3">
              <input type="checkbox" checked={!!form.announce}
                onChange={(e) => setForm({ ...form, announce: e.target.checked })} className="mt-0.5 h-4 w-4 accent-brand" />
              <span className="text-sm">
                <span className="font-medium">Announce it</span>
                <span className="block text-xs text-smoke">
                  {form.community_ids.length === 0
                    ? 'Posts in the worldwide announcements room, which notifies everybody.'
                    : `Posts in the announcements room of ${form.community_ids.length === 1 ? 'that market' : `all ${form.community_ids.length} markets`}.`}
                </span>
              </span>
            </label>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            {editing !== 'new' ? (
              <button type="button" onClick={() => { const ev = editing; setEditing(null); remove(ev) }}
                className="btn-ghost text-sm text-smoke hover:text-ink">Delete</button>
            ) : <span />}
            <button type="submit" disabled={busy} className="btn-primary">
              {busy ? <Spinner /> : editing === 'new' ? 'Add event' : 'Save changes'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  )
}

function FilterPill({ on, onClick, icon, label }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={cx(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95',
        on
          ? 'border-brand bg-brand text-white shadow-card'
          : 'border-gray-200 bg-white text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand',
      )}
    >
      <Icon name={icon} className="h-3.5 w-3.5" />
      {label}
    </button>
  )
}

// ONE ROW SAYS EVERYTHING WITHOUT BEING OPENED: what, when, who for, whether it
// asks for an RSVP, whether it has a call attached. The old row showed an emoji,
// a title, a date and a badge that said "Upcoming" - which the sort order
// already said.
function EventRow({ ev, marketName, past = false, onEdit, onDelete }) {
  const ids = ev.community_ids?.length ? ev.community_ids : (ev.community_id ? [ev.community_id] : [])
  return (
    <div className={cx(
      'group flex flex-wrap items-center gap-x-4 gap-y-3 rounded-card border bg-white p-4 transition-all duration-200 sm:flex-nowrap',
      'hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-lift',
      past ? 'border-gray-100 opacity-70 hover:opacity-100' : 'border-gray-100 shadow-card',
    )}>
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-brand-tint text-brand transition-transform duration-200 group-hover:scale-105">
        <Icon name={iconFor(ev.type)} className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1 basis-full sm:basis-auto">
        <p className="truncate text-sm font-semibold text-ink">{ev.title}</p>
        <p className="text-xs text-smoke">{formatDateTime(ev.date)}</p>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          {ids.length === 0 ? (
            <Chip icon="globe">Everyone</Chip>
          ) : ids.map((id) => <Chip key={id} icon="flag">{marketName(id)}</Chip>)}
          {ev.rsvp_enabled && <Chip icon="users">RSVP</Chip>}
          {ev.meeting_url && <Chip icon="video">Call</Chip>}
          {!ev.ends_at && !past && <Chip icon="clock">No end time</Chip>}
        </div>
      </div>

      <div className="flex shrink-0 gap-2">
        <button onClick={onEdit} className="btn-secondary !py-2 text-xs">Edit</button>
        <button onClick={onDelete} className="rounded-full border border-gray-200 px-3 py-2 text-xs font-semibold text-smoke transition-all duration-200 hover:-translate-y-0.5 hover:border-ink hover:text-ink">
          Delete
        </button>
      </div>
    </div>
  )
}

function Chip({ icon, children }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-cloud px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-smoke">
      <Icon name={icon} className="h-3 w-3" />
      {children}
    </span>
  )
}
