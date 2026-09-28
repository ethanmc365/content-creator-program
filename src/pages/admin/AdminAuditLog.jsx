import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Avatar, EmptyState, PageHeader, Select, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import { cx, downloadCsv, formatDateTime } from '../../lib/utils'

// Everything the team does, in the order it happened.
//
// WHAT THIS PAGE WAS. One flat scroll of every row ever written, three hundred
// at a time, with no way to narrow it and nothing to look at but a sentence and
// a timestamp. It also only ever held six kinds of entry, because each existed
// where somebody had hand-written a log line into one function - so the log was
// simultaneously unreadable and nearly empty, which is a hard combination to
// achieve.
//
// The recording side is fixed in the database (migration 123): triggers watch
// the tables, so a change is recorded because it happened rather than because a
// developer remembered. That turns this page's problem from "there is nothing
// here" into "there is far too much here", which is the problem a log is
// supposed to have and the one filters solve.
//
// WHAT A PERSON ACTUALLY ASKS A LOG. Three questions, and each is a control:
// what kind of thing (category), who did it (actor), and when (period). They
// compose, they are all in the URL, and the default answers the fourth question
// nobody has to ask - "what just happened" - by showing the last week of
// everything.

// ONE COLOUR (24 Sep 2026). Ethan: "these icons... different colours. Let's
// clean up the design." Every family had its own hue (sky, emerald, violet,
// amber, red) - five colours that belong to no palette on a page that is
// otherwise Tryp.com orange and ink. The icon says which family; the brand
// says which one is picked.
const CATEGORIES = [
  { value: '', label: 'Everything', icon: 'clock' },
  { value: 'people', label: 'People', icon: 'users' },
  { value: 'challenges', label: 'Challenges', icon: 'flag' },
  { value: 'money', label: 'Money', icon: 'money' },
  { value: 'markets', label: 'Markets', icon: 'globe' },
  { value: 'content', label: 'Content', icon: 'book' },
  { value: 'moderation', label: 'Moderation', icon: 'shield' },
  { value: 'settings', label: 'Settings', icon: 'key' },
]

const PERIODS = [
  { value: '7', label: 'Last 7 days' },
  { value: '30', label: 'Last 30 days' },
  { value: '90', label: 'Last 3 months' },
  { value: '', label: 'All time' },
]

const PAGE = 100

const catOf = (row) => CATEGORIES.find((c) => c.value === row.category) ?? CATEGORIES[0]

// "status, role_title" is what the trigger stores; a person reads
// "status and title". Small, and it is the difference between a log that reads
// like English and one that reads like a column list.
const FIELD_WORDS = {
  is_admin: 'admin rights',
  platform_role: 'permissions',
  role_title: 'title',
  deletion_requested_at: 'deletion',
  winners_published_at: 'published winners',
  prize_structure: 'prizes',
  participation_threshold: 'participation target',
  prize_amount: 'prize budget',
  is_active: 'open/closed',
  retired_at: 'retirement',
  join_policy: 'who can join',
  cpm_target: 'CPM target',
  sent_at: 'sent',
  paid_at: 'paid',
  deleted: 'deletion',
  start_date: 'start date',
  end_date: 'end date',
}
const humanFields = (detail) =>
  String(detail || '')
    .split(', ')
    .filter(Boolean)
    .map((f) => FIELD_WORDS[f] ?? f.replace(/_/g, ' '))
    .join(', ')

/** "pending → active", when the change is a simple one worth reading. */
function ChangeChips({ meta }) {
  if (!meta || typeof meta !== 'object') return null
  const entries = Object.entries(meta).filter(([, v]) => v && typeof v === 'object' && 'from' in v)
  if (entries.length === 0) return null
  const short = (v) => {
    if (v === null || v === undefined || v === '') return '—'
    const s = typeof v === 'object' ? JSON.stringify(v) : String(v)
    // A whole prize structure is not a chip. Say it changed and stop.
    return s.length > 28 ? `${s.slice(0, 27)}…` : s
  }
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      {entries.slice(0, 3).map(([field, v]) => (
        <span key={field} className="inline-flex items-center gap-1 rounded-full bg-cloud px-2 py-0.5 text-[11px] text-smoke">
          <span className="font-medium text-ink">{FIELD_WORDS[field] ?? field.replace(/_/g, ' ')}</span>
          <span className="tabular-nums">{short(v.from)}</span>
          <Icon name="chevronRight" className="h-3 w-3" />
          <span className="tabular-nums font-medium text-ink">{short(v.to)}</span>
        </span>
      ))}
      {entries.length > 3 && (
        <span className="text-[11px] text-gray-400">+{entries.length - 3} more</span>
      )}
    </span>
  )
}

// OLDER ROWS, SAID PROPERLY. Migration 259 writes whole sentences from now on;
// these are the lines written before it, rewritten at read time with what the
// row does carry (its market, its changed fields).
function sentence(e, marketName, isTeam) {
  const a = e.action || ''
  const m = marketName(e.community_id)
  if (a === 'Created market membership') {
    // A creator who is not on the team adding a membership is joining.
    if (!isTeam(e.actor_id) && e.actor_id) return m ? `joined ${m}` : 'joined a market'
    return m ? `added a member to ${m}` : 'added a market member'
  }
  if (a === 'Deleted market membership') {
    if (!isTeam(e.actor_id) && e.actor_id) return m ? `left ${m}` : 'left a market'
    return m ? `removed a member from ${m}` : 'removed a market member'
  }
  if (a === 'Changed market membership') return m ? `changed a membership of ${m}` : 'changed a market membership'
  if (a === 'Changed message') return e.meta?.deleted?.to ? 'removed a message' : 'moderated a message'
  if (a === 'Approved creator') return 'approved'
  if (a === 'update') return 'changed'
  // "Created reward" -> "created a reward": the generic trigger lines.
  const generic = a.match(/^(Created|Deleted|Changed) (reward|invoice|entry|resource|point rule|KPI target|challenge template)$/)
  if (generic) {
    const noun = generic[2]
    return `${generic[1].toLowerCase()} ${/^[aeiou]/i.test(noun) ? 'an' : 'a'} ${noun}`
  }
  return a.charAt(0).toLowerCase() + a.slice(1)
}

// The trigger's own "status: pending -> active" line on a profile is the same
// event as the approval the RPC logs a millisecond later; one line, not two.
// THE PLATFORM'S OWN BOOKKEEPING (26 Sep 2026). The view sync writes its
// progress into app_settings on every chunk of every run - 280 "Changed the
// setting" rows a fortnight, a third of the whole log - and none of it is a
// decision anybody made.
const isBookkeeping = (e) => e.entity === 'app_settings'
  && ['view_sync_run', 'view_sync_last_run', 'fx_rates'].includes(e.target_name)

const isApprovalEcho = (e) => e.action === 'Changed creator' && e.meta?.status?.from === 'pending'
  && e.meta?.status?.to === 'active' && Object.keys(e.meta).length === 1

// Worth a second look: money, permissions, anything deleted or disqualified.
const isSensitive = (e) => e.category === 'money'
  || /admin rights|promoted|deleted|removed|disqualified|lead|declined/i.test(e.action || '')

function dayLabel(iso, now) {
  const d = new Date(iso)
  const today = new Date(now)
  const startOf = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((startOf(today) - startOf(d)) / 86400000)
  if (diff === 0) return 'Today'
  if (diff === 1) return 'Yesterday'
  return d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })
}

export default function AdminAuditLog() {
  const [rows, setRows] = useState(null)
  const [people, setPeople] = useState({})
  const [markets, setMarkets] = useState([])
  const [category, setCategory] = useState('')
  const [actor, setActor] = useState('')
  const [market, setMarket] = useState('')
  const [days, setDays] = useState('7')
  const [search, setSearch] = useState('')
  const [more, setMore] = useState(false)
  const [loadingMore, setLoadingMore] = useState(false)
  const since = useRef(0)

  // The window is captured once per load rather than read in render, so the
  // list cannot shift under a re-render and the lint rule about clock reads in
  // render stays satisfied.
  const load = useCallback(async (append = false) => {
    if (!append) setRows(null)
    let q = supabase
      .from('admin_audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(PAGE)

    if (category) q = q.eq('category', category)
    if (actor) q = q.eq('actor_id', actor)
    if (market) q = q.eq('community_id', market)
    if (days) q = q.gte('created_at', new Date(since.current - Number(days) * 86400000).toISOString())
    if (append && rows?.length) q = q.lt('created_at', rows[rows.length - 1].created_at)

    const { data } = await q
    const batch = data ?? []
    setMore(batch.length === PAGE)
    setRows((prev) => (append && prev ? [...prev, ...batch] : batch))
  }, [category, actor, market, days, rows])

  useEffect(() => {
    since.current = Date.now()
    // Names and photos for the actor filter and the row avatars. Admins only:
    // nobody else can write to this table.
    supabase.from('profiles').select('id, name, photo_url').eq('is_admin', true)
      .then(({ data }) => setPeople(Object.fromEntries((data ?? []).map((p) => [p.id, p]))))
    supabase.from('communities').select('id, name, kind').order('name')
      .then(({ data }) => setMarkets(data ?? []))
  }, [])

  useEffect(() => {
    since.current = since.current || Date.now()
    load(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, actor, market, days])

  // Search is applied here rather than in the query: it matches across three
  // columns and the page size is a hundred, so filtering in the browser is
  // instant and avoids a round trip per keystroke.
  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    const base = (rows ?? []).filter((r) => !isApprovalEcho(r) && !isBookkeeping(r))
    if (!q) return base
    return base.filter((r) =>
      `${r.actor_name ?? ''} ${r.action ?? ''} ${r.target_name ?? ''} ${r.detail ?? ''}`
        .toLowerCase().includes(q))
  }, [rows, search])

  function exportLog() {
    downloadCsv(
      `tryp-audit-${new Date().toISOString().slice(0, 10)}.csv`,
      shown.map((r) => ({
        when: formatDateTime(r.created_at),
        who: (r.actor_id && r.actor_name) || 'Tryp.com platform',
        action: sentence(r, marketName, isTeam),
        category: r.category || '',
        target: r.target_name || '',
        changed: humanFields(r.detail),
      })),
      [
        { key: 'when', label: 'When' },
        { key: 'who', label: 'Who' },
        { key: 'action', label: 'Action' },
        { key: 'category', label: 'Category' },
        { key: 'target', label: 'Target' },
        { key: 'changed', label: 'What changed' },
      ],
    )
  }

  const marketName = useCallback((id) => markets.find((m) => m.id === id)?.name || '', [markets])
  const isTeam = useCallback((id) => !!people[id], [people])
  const chapterMarkets = markets.filter((m) => m.kind === 'chapter')
  const [nowMs] = useState(() => Date.now())

  // ONE LINE FOR A RUN OF THE SAME THING (26 Sep 2026). Cleaning the hook bank
  // wrote 1,207 "Changed hook" rows in a second; read as 1,207 lines they are
  // the whole log. The same person doing the same action to the same kind of
  // thing back to back is one line with a count, and it opens to the list.
  const days_ = useMemo(() => {
    const out = []
    for (const e of shown) {
      const label = dayLabel(e.created_at, nowMs)
      if (!out.length || out[out.length - 1].label !== label) out.push({ label, rows: [] })
      const day = out[out.length - 1]
      const prev = day.rows[day.rows.length - 1]
      if (prev && prev.actor_id === e.actor_id && prev.action === e.action && prev.entity === e.entity && !e.target_name) {
        prev.group = [...(prev.group || [prev]), e]
      } else {
        day.rows.push({ ...e })
      }
    }
    return out
  }, [shown, nowMs])
  const [openId, setOpenId] = useState(null)

  const actors = useMemo(
    () => Object.values(people).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [people],
  )

  return (
    // WIDER THAN A READING COLUMN, because this is a table of events and not
    // prose: who, what, what changed and when all want to sit on one line.
    <div className="page max-w-6xl">
      <PageHeader
        back="/admin"
        title="Audit log"
        action={
          <button onClick={exportLog} disabled={!shown.length} className="btn-secondary disabled:opacity-40">
            <Icon name="download" className="h-4 w-4" /> Export CSV
          </button>
        }
      />

      {/* THE CONTROLS, AS ONE PANEL (24 Sep 2026) - the same shape as the KPI
          tracker's and the analytics filter bar, instead of a loose row of
          multicoloured pills over a loose row of fields. */}
      {/* COMPACT (28 Sep 2026): smaller chips, tighter padding, the fields on
          one line from a tablet up. Ethan: "too much space there". */}
      <div className="mb-5 space-y-2.5 rounded-card border border-gray-100 bg-white p-2.5 shadow-card sm:p-3">
        <div className="pick-row -mx-1 flex gap-1 overflow-x-auto px-1">
          {CATEGORIES.map((c) => {
            const on = category === c.value
            return (
              <button
                key={c.value || 'all'}
                type="button"
                onClick={() => setCategory(c.value)}
                aria-pressed={on}
                className={cx(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-200 sm:text-[13px]',
                  on ? 'bg-brand text-white shadow-card'
                    : 'border border-gray-200 text-smoke hoverable:hover:border-brand/40 hoverable:hover:text-brand',
                )}
              >
                <Icon name={c.icon} className="h-3.5 w-3.5" />
                {c.label}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="relative w-full sm:w-auto sm:flex-1">
            <Icon name="magnifier" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
            <input
              type="search"
              className="input !py-2 !pl-9 text-sm"
              placeholder="Search who, what or whom"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search the log"
            />
          </div>
          <Select variant="chip" className="w-40" ariaLabel="Period" value={days} onChange={setDays} options={PERIODS} />
          <Select
            variant="chip" className="w-44" ariaLabel="Who" value={actor} onChange={setActor}
            options={[{ value: '', label: 'Anybody' }, ...actors.map((a) => ({ value: a.id, label: a.name }))]}
          />
          {chapterMarkets.length > 0 && (
            <Select
              variant="chip" className="w-44" ariaLabel="Market" value={market} onChange={setMarket}
              options={[{ value: '', label: 'Every market' }, ...chapterMarkets.map((m) => ({ value: m.id, label: m.name }))]}
            />
          )}
        </div>
      </div>

      {rows === null ? (
        <div className="space-y-2">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<Icon name="clock" className="h-7 w-7" />}
          title="Nothing in that window"
          hint="Widen the period, or clear the filters."
        />
      ) : (
        <>
          {/* NO SUMMARY TILES (28 Sep 2026). Ethan: "you don't need to say
              'Worth a look,' and you don't need the money card, the five
              changes, or the two people. It's unnecessary." */}
          <div className="space-y-6">
            {days_.map((day) => (
              <section key={day.label}>
                <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">{day.label}</p>
                <div className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
                  <ul className="divide-y divide-gray-50">
                    {day.rows.map((e) => {
                      const c = catOf(e)
                      const who = people[e.actor_id]
                      const flag = isSensitive(e)
                      const open = openId === e.id
                      const count = e.group?.length || 1
                      const changes = e.meta && typeof e.meta === 'object'
                        ? Object.entries(e.meta).filter(([, v]) => v && typeof v === 'object' && 'from' in v)
                        : []
                      return (
                        <li key={e.id} className={cx('transition-colors', open ? 'bg-cloud/40' : 'hover:bg-cloud/30')}>
                          <button type="button" onClick={() => setOpenId(open ? null : e.id)} aria-expanded={open} className="flex w-full items-start gap-3 px-4 py-3 text-left sm:px-5">
                            {/* WHO DID IT, AS A FACE (26 Sep 2026). Ethan: "It should
                                show the profile picture of whoever actually logged
                                it, as in, the side where it currently shows just a
                                computer icon." A person is their photo; a change the
                                platform made by itself - a scheduled job, the sync, a
                                database update - is the Tryp.com mark, labelled. */}
                            {who
                              ? <Avatar src={who.photo_url} name={who.name} size="sm" className="!ring-0" />
                              : (
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white" title="Done automatically by the platform">
                                  <Icon name="plane-tryp" className="h-4 w-4" />
                                </span>
                              )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm leading-snug">
                                <span className="font-semibold">{who?.name || (e.actor_id && e.actor_name) || 'Tryp.com platform'}</span>
                                <span className="text-ink/80"> {sentence(e, marketName, isTeam)}</span>
                                {e.target_name && <> <span className="font-semibold">{e.target_name}</span></>}
                                {count > 1 && <span className="ml-1.5 rounded-full bg-ink px-2 py-0.5 text-[10px] font-bold text-white">× {count.toLocaleString()}</span>}
                              </p>
                              {!open && e.detail && !e.meta && (
                                <p className="mt-0.5 text-xs text-smoke">{humanFields(e.detail)}</p>
                              )}
                              {!open && <ChangeChips meta={e.meta} />}
                            </div>
                            <div className="flex shrink-0 flex-col items-end gap-1">
                              <span className="whitespace-nowrap text-xs tabular-nums text-smoke" title={formatDateTime(e.created_at)}>
                                {new Date(e.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                              <span className={cx(
                                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold',
                                flag ? 'bg-brand text-white' : 'bg-cloud text-smoke',
                              )}>
                                <Icon name={c.icon} className="h-3 w-3" />
                                {e.category ? c.label : 'Other'}
                              </span>
                            </div>
                          </button>
                          <div className={cx('grid transition-[grid-template-rows] duration-300 ease-out', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                            <div className="overflow-hidden">
                              <div className="mx-4 mb-3 space-y-3 rounded-xl border border-gray-100 bg-white p-3.5 text-xs sm:mx-5 sm:ml-[4.25rem]">
                                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                                  <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-smoke">When</dt><dd className="font-medium">{formatDateTime(e.created_at)}</dd></div>
                                  <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-smoke">Who</dt><dd className="font-medium">{who?.name || (e.actor_id ? (e.actor_name || 'A creator') : 'The platform, automatically')}</dd></div>
                                  <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-smoke">Area</dt><dd className="font-medium">{e.category ? c.label : 'Other'}{e.entity ? ` · ${String(e.entity).replace(/_/g, ' ')}` : ''}</dd></div>
                                  {marketName(e.community_id) && <div><dt className="text-[10px] font-semibold uppercase tracking-wide text-smoke">Market</dt><dd className="font-medium">{marketName(e.community_id)}</dd></div>}
                                </dl>
                                {changes.length > 0 && (
                                  <div>
                                    <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wide text-smoke">What changed</p>
                                    <ul className="space-y-1">
                                      {changes.map(([field, v]) => (
                                        <li key={field} className="grid grid-cols-[8rem_minmax(0,1fr)] gap-2">
                                          <span className="font-semibold text-ink">{FIELD_WORDS[field] ?? field.replace(/_/g, ' ')}</span>
                                          <span className="min-w-0 [overflow-wrap:anywhere] text-smoke">
                                            <span className="line-through decoration-gray-300">{v.from == null || v.from === '' ? 'empty' : typeof v.from === 'object' ? JSON.stringify(v.from) : String(v.from)}</span>
                                            <span className="mx-1.5 text-gray-300">→</span>
                                            <span className="font-medium text-ink">{v.to == null || v.to === '' ? 'empty' : typeof v.to === 'object' ? JSON.stringify(v.to) : String(v.to)}</span>
                                          </span>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                                {e.detail && changes.length === 0 && <p className="text-smoke">{humanFields(e.detail)}</p>}
                                {count > 1 && (
                                  <p className="text-smoke">{count.toLocaleString()} of these in a row, between {new Date(e.group[e.group.length - 1].created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })} and {new Date(e.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}.</p>
                                )}
                              </div>
                            </div>
                          </div>
                        </li>
                      )
                    })}
                  </ul>
                </div>
              </section>
            ))}
          </div>

          {more && (
            <div className="mt-6 text-center">
              <button
                type="button"
                className="btn-secondary"
                disabled={loadingMore}
                onClick={async () => { setLoadingMore(true); await load(true); setLoadingMore(false) }}
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
