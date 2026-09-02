import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Avatar, Badge, EmptyState, PageHeader, Select, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import { cx, downloadCsv, formatDateTime, timeAgo } from '../../lib/utils'

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

const CATEGORIES = [
  { value: '', label: 'Everything', icon: 'clock', tone: 'text-smoke' },
  { value: 'people', label: 'People', icon: 'users', tone: 'text-sky-600' },
  { value: 'challenges', label: 'Challenges', icon: 'flag', tone: 'text-brand' },
  { value: 'money', label: 'Money', icon: 'money', tone: 'text-emerald-600' },
  { value: 'markets', label: 'Markets', icon: 'globe', tone: 'text-violet-600' },
  { value: 'content', label: 'Content', icon: 'book', tone: 'text-amber-600' },
  { value: 'moderation', label: 'Moderation', icon: 'shield', tone: 'text-red-500' },
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
    supabase.from('communities').select('id, name').eq('kind', 'chapter').order('name')
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
    if (!q) return rows ?? []
    return (rows ?? []).filter((r) =>
      `${r.actor_name ?? ''} ${r.action ?? ''} ${r.target_name ?? ''} ${r.detail ?? ''}`
        .toLowerCase().includes(q))
  }, [rows, search])

  function exportLog() {
    downloadCsv(
      `tryp-audit-${new Date().toISOString().slice(0, 10)}.csv`,
      shown.map((r) => ({
        when: formatDateTime(r.created_at),
        who: r.actor_name || 'System',
        action: r.action,
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

      {/* Category first and as a row of its own: it is the filter that changes
          the answer most, and a coloured dot per family means a scan of the list
          below reads without going back to the control. */}
      <div className="mb-3 flex flex-wrap gap-2">
        {CATEGORIES.map((c) => {
          const on = category === c.value
          return (
            <button
              key={c.value || 'all'}
              type="button"
              onClick={() => setCategory(c.value)}
              aria-pressed={on}
              className={cx(
                'inline-flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200',
                on ? 'border-brand bg-brand text-white'
                  : 'border-gray-200 bg-white text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand',
              )}
            >
              <Icon name={c.icon} className={cx('h-3.5 w-3.5', on ? 'text-white' : c.tone)} />
              {c.label}
            </button>
          )
        })}
      </div>

      <div className="mb-8 flex flex-wrap items-center gap-3">
        <input
          type="search"
          className="input sm:max-w-xs"
          placeholder="Search who, what or whom…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search the log"
        />
        <Select
          className="w-44" ariaLabel="Period" value={days} onChange={setDays} options={PERIODS}
        />
        <Select
          className="w-48" ariaLabel="Who" value={actor} onChange={setActor}
          options={[{ value: '', label: 'Anybody' }, ...actors.map((a) => ({ value: a.id, label: a.name }))]}
        />
        {markets.length > 0 && (
          <Select
            className="w-44" ariaLabel="Market" value={market} onChange={setMarket}
            options={[{ value: '', label: 'Every market' }, ...markets.map((m) => ({ value: m.id, label: m.name }))]}
          />
        )}
        <span className="text-xs text-smoke">{shown.length}{more ? '+' : ''} shown</span>
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
          <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
            {shown.map((e) => {
              const c = catOf(e)
              const who = people[e.actor_id]
              return (
                <div
                  key={e.id}
                  className="flex items-start gap-3 border-b border-gray-50 px-4 py-3.5 transition-colors last:border-0 hover:bg-cloud/50 sm:px-6"
                >
                  {/* The face, because "who did this" is the first thing you
                      want from an audit line and a name in grey text is not it. */}
                  {who
                    ? <Avatar src={who.photo_url} name={who.name} size="sm" className="!ring-0" />
                    : (
                      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cloud text-smoke">
                        <Icon name="device" className="h-4 w-4" />
                      </span>
                    )}

                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug">
                      <span className="font-semibold">{e.actor_name || 'System'}</span>
                      <span className="text-smoke"> {e.action?.toLowerCase()}</span>
                      {e.target_name && <> <span className="font-medium">{e.target_name}</span></>}
                    </p>
                    {e.detail && !e.meta && (
                      <p className="mt-0.5 text-xs text-smoke">{humanFields(e.detail)}</p>
                    )}
                    <ChangeChips meta={e.meta} />
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="whitespace-nowrap text-xs text-smoke" title={formatDateTime(e.created_at)}>
                      {timeAgo(e.created_at).replace(/^about /, '')}
                    </span>
                    {e.category && (
                      <Badge tone="grey" className="!px-2 !py-0 !text-[10px]">{c.label}</Badge>
                    )}
                  </div>
                </div>
              )
            })}
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
