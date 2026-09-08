import { useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Skeleton, StatCard } from '../../components/ui'
import Icon from '../../components/Icon'
import MarketScope, { useScopedMarkets } from '../../components/admin/MarketScope'
import { confirm, notice } from '../../lib/confirm'
import { cx, formatMoney, formatViews } from '../../lib/utils'
import {
  deleteHistory, historyMetrics, historyOnly, loadHistory, rollUp,
} from '../../lib/challengeHistory'
import HistoryForm from '../../components/admin/HistoryForm'
import { useT } from '../../lib/i18n'

// THE CHALLENGE LOG: EVERYTHING THAT RAN, INCLUDING BEFORE ANY OF THIS EXISTED.
//
// Ethan: "we'll need the ability under challenges for the past ones to edit the
// results, especially the ones that have been imported and any ones that are
// currently going to be ongoing... For example the Spanish community is
// currently running a challenge, but obviously we're starting a new platform -
// let's still finish that challenge. So they need to be able to add in the data
// super easily. Build that functionality in as well for any challenges run
// externally, so it can keep all the analytics in one place."
//
// So this page has two jobs and they are the same job: it is the spreadsheet,
// on the platform. Forty-nine rows arrived from the old tracker (migration 198)
// and the next one is typed in here - a challenge run in a market that is not
// on the platform yet, a challenge finishing on WhatsApp this month, a
// challenge whose views somebody finally got round to counting.
//
// IT IS DELIBERATELY NOT THE CHALLENGE EDITOR. A `challenges` row is a live
// machine - submissions, a leaderboard, a prize engine that raises real
// invoices. These are AGGREGATES: what it cost, how many people entered, how
// many views it got. Nothing here can pay anybody, and that is the point. See
// migration 197.
//
// THE FORM IS FOUR NUMBERS AND THE REST IS OPTIONAL, because "super easily" is
// the requirement and the four are what every ratio on the analytics page is
// made of: prize, views, creators, posts.
export default function AdminChallengeHistory() {
  const tr = useT()
  const { user } = useAuth()
  const { markets } = useScopedMarkets()
  const [rows, setRows] = useState(null)
  const [market, setMarket] = useState('')
  const [editing, setEditing] = useState(null)
  const [err, setErr] = useState('')

  async function load() {
    const { rows: r, error } = await loadHistory()
    setErr(error || '')
    setRows(r)
  }
  useEffect(() => { load() }, [])

  const scoped = useMemo(
    () => (rows || []).filter((r) => !market || r.community_id === market),
    [rows, market],
  )
  // The roll-up drops anything that is also a live challenge here, or the same
  // contest is counted twice. See lib/challengeHistory.
  const totals = useMemo(() => rollUp(historyOnly(scoped)), [scoped])

  async function remove(row) {
    if (!await confirm(`Delete "${row.title || row.ref}" from the challenge log? This does not touch any live challenge.`)) return
    const { error } = await deleteHistory(row.id)
    if (error) { notice(`Could not delete: ${error}`); return }
    load()
  }

  return (
    <div className="page">
      <PageHeader
        back="/admin"
        title={tr('Challenge log')}
        subtitle={tr('Every challenge the programme has run, including the ones before this platform. Analytics reads this.')}
        action={
          <button type="button" onClick={() => setEditing({})} className="btn-primary">
            <Icon name="plus" className="h-4 w-4" strokeWidth={2.4} />
            {tr('Log a challenge')}
          </button>
        }
      />

      {err && <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{err}</p>}

      <MarketScope markets={markets} value={market} onChange={setMarket}
        note={rows ? `${scoped.length} logged` : ''} />

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label={tr('Challenges')} value={rows ? totals.challenges : '—'}
          hint={totals.unmeasured ? `${totals.unmeasured} with no views logged` : null} />
        <StatCard label={tr('Prize money')} value={rows ? formatMoney(totals.prize, 'EUR') : '—'} />
        <StatCard label={tr('Views')} value={rows ? formatViews(totals.views) : '—'}
          hint={totals.measured ? `across ${totals.measured} measured` : null} />
        <StatCard label={tr('CPM')} accent
          value={totals.cpm != null ? formatMoney(totals.cpm, 'EUR') : '—'}
          hint={tr('Measured challenges only')} />
      </div>

      {!rows && <div className="space-y-2">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full rounded-card" />)}</div>}

      {rows && scoped.length === 0 && (
        <p className="rounded-card border border-dashed border-gray-200 px-6 py-14 text-center text-sm text-smoke">
          {tr('Nothing logged for this market yet.')}
        </p>
      )}

      {/* A TABLE ON A DESKTOP AND CARDS ON A PHONE. Nineteen columns of numbers
          do not survive 375px, and a horizontally scrolling table is a table
          nobody reads the right-hand half of. */}
      {rows && scoped.length > 0 && (
        <div className="space-y-2">
          {scoped.map((r) => {
            const m = historyMetrics(r)
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setEditing(r)}
                className="flex w-full flex-col gap-3 rounded-card border border-gray-100 bg-white p-4 text-left shadow-card transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/30 hoverable:hover:shadow-lift sm:flex-row sm:items-center"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold">{r.title || r.ref}</span>
                    <StatusPill status={r.status} />
                    {r.cohort && r.cohort !== 'General' && (
                      <span className="rounded-full bg-cloud px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-smoke">{r.cohort}</span>
                    )}
                    {/* The one row that is also a live challenge here. Saying so
                        is the only way somebody reading the log can tell why
                        its figures are not in the totals above. */}
                    {r.challenge_id && (
                      <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">
                        {tr('On the platform')}
                      </span>
                    )}
                  </span>
                  <span className="mt-1 block truncate text-xs text-smoke">
                    {r.ref} · {r.starts_at} → {r.ends_at} · {m.days ?? '—'} {tr('days')}
                    {r.notes ? ` · ${r.notes}` : ''}
                  </span>
                </span>
                <span className="grid shrink-0 grid-cols-4 gap-4 text-right sm:w-[22rem]">
                  <Cell label={tr('Prize')} value={r.prize_total != null ? formatMoney(Number(r.prize_total), 'EUR') : '—'} />
                  <Cell label={tr('Views')} value={r.total_views != null ? formatViews(r.total_views) : '—'} dim={r.total_views == null} />
                  <Cell label={tr('Posts')} value={r.posts ?? '—'} dim={r.posts == null} />
                  <Cell label={tr('CPM')} value={m.cpm != null ? formatMoney(m.cpm, 'EUR') : '—'} dim={m.cpm == null} />
                </span>
              </button>
            )
          })}
        </div>
      )}

      {editing && (
        <HistoryForm
          row={editing}
          markets={markets}
          userId={user.id}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
          onDelete={editing.id ? () => { setEditing(null); remove(editing) } : null}
        />
      )}
    </div>
  )
}

function Cell({ label, value, dim }) {
  return (
    <span className="block">
      <span className={cx('block text-sm font-semibold tabular-nums', dim && 'text-gray-300')}>{value}</span>
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
    </span>
  )
}

function StatusPill({ status }) {
  const tone = { done: 'bg-green-50 text-green-700', running: 'bg-brand-tint text-brand', planned: 'bg-cloud text-smoke' }[status]
  return <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', tone)}>{status}</span>
}
