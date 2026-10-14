import { useEffect, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Skeleton, StatCard } from '../../../components/ui'
import Segmented from '../../../components/network/Segmented'
import { cx } from '../../../lib/utils'
import { FILL } from '../../../components/charts/chartTheme'
import { teamApi } from '../../../api/team'

// DID THE PUSH GO OUT, AND DID ANYONE OPEN IT? (migration 283)
//
// The funnel reads left to right and every step is a different fact:
//   Notifications   rows created for creators in the window (the bell always gets one)
//   Sent            handed to a device's push service. Apple says yes even for a dead device
//   Shown           the phone's service worker woke up and displayed it
//   Tapped          they tapped it
//   Opened          the bell item was read, on any device, however they got there
// "No device" and "Muted" are why a notification did NOT go out; "Refused" is the push service
// saying no. Shown and Tapped only exist from the day tracking began (`tracking_since`), which is
// said out loud rather than letting a young ledger read as a bad week.

const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : null)
const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const pushCache = new Map()

// WHAT EACH NUMBER MEANS, in the words the team asked for: not "land"; a push goes to a DEVICE (a phone or a laptop);
// "Tapped" is somebody pressing the push itself; "Read in the app" is the bell item being read, however they got there.
// The funnel only counts from the moment the ledger started, which the RPC now does itself (migration 286), so the steps
// add up.
export default function PushDelivery() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  // SWITCHING 7 / 30 / 90 KEEPS THE PAGE. It blanked to a skeleton on every press. Now the numbers already on screen
  // stay (dimmed) until the new ones are in, a window seen once paints at once from memory, and the other two are
  // fetched ahead.
  const [fetching, setFetching] = useState(false)
  useEffect(() => {
    let alive = true
    const hit = pushCache.get(days)
    if (hit) setData(hit); else setFetching(true)
    // ONE READ, ON REQUEST (15 Oct 2026). It also fetched the two other windows ahead and a per-notification list of
    // fifty; the team asked whether that strained the database and did not need the list, so neither is read now.
    teamApi.adminPushAnalytics({ p_days: days, p_recent: 0, p_offset: 0 }).then(({ data: d, error }) => {
      if (!alive) return
      setFetching(false)
      if (error) setErr(error.message); else { setErr(''); pushCache.set(days, d); setData(d) }
    })
    return () => { alive = false }
  }, [days])

  const t = data?.totals
  // "SHOWN" IS ONLY MEASURED WHERE IT CAN BE (migration 309). They were whole people, not stray pushes: creators who
  // have not opened the app since delivery tracking began still run the old service worker, which never reports a push
  // shown. Those sends are now "Not confirmed yet" (they may well have arrived), and "Shown" is a share of the sends to
  // people whose phones do report.
  const sentReporting = t?.sent_reporting ?? t?.sent ?? 0
  const steps = t ? [
    ['Notifications', t.notifications, null, 'created for creators'],
    ['Sent to a device', t.sent, pct(t.sent, t.notifications), 'push accepted for a phone or laptop'],
    ['Shown on the device', t.delivered, pct(t.delivered, sentReporting), 'of sends to devices that report back'],
    ['Tapped', t.clicked, pct(t.clicked, t.delivered || t.sent), 'opened by pressing the push'],
    ['Read in the app', t.opened, pct(t.opened, t.notifications), 'read in the bell, any way'],
  ] : []
  const max = t ? Math.max(1, t.notifications) : 1
  // When tracking began inside the window, the window starts there (the RPC returns the same instant).
  const fromLater = !!data?.counted_from && data.counted_from === data.tracking_since

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Were the notifications sent?</h2>
          {fromLater && (
            <p className="mt-0.5 text-xs text-smoke">Counted from {day(data.counted_from)}, when delivery tracking began.</p>
          )}
        </div>
        <Segmented size="sm" value={days} onChange={setDays} options={[{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }]} />
      </div>

      {err ? (
        <p className="rounded-card border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{err}</p>
      ) : !data ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <div className={cx('space-y-4 transition-opacity duration-200', fetching && 'opacity-60')}>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="rounded-card border border-gray-100 bg-white p-4 shadow-card sm:p-5">
              <div className="space-y-3.5">
                {steps.map(([label, n, , hint], i) => (
                  <div key={label}>
                    <div className="mb-1 flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-medium text-ink">{label} <span className="hidden text-[11px] font-normal text-smoke sm:inline">· {hint}</span></span>
                      <span className="shrink-0 text-sm font-bold tabular-nums">{n.toLocaleString()}</span>
                    </div>
                    <div className="h-2.5 overflow-hidden rounded-full bg-cloud">
                      <div className="kpi-fill h-full rounded-full bg-gradient-to-r from-brand-light to-brand" style={{ width: `${Math.max(n > 0 ? 2 : 0, Math.round((n / max) * 100))}%`, animationDelay: `${i * 70}ms` }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Shown rate" value={pct(t.delivered, sentReporting) || '-'} hint="where the device reports" />
              <StatCard label="Tap rate" value={pct(t.clicked, t.delivered || t.sent) || '-'} hint="of those shown" />
              <StatCard
                label="Not confirmed yet"
                value={t.unconfirmed ?? 0}
                hint={t.people_unconfirmed ? `${t.people_unconfirmed} ${t.people_unconfirmed === 1 ? 'person' : 'people'} on an older app` : 'every device reports'}
              />
              <StatCard label="No device" value={t.no_device} hint="push not switched on" />
              <StatCard label="Refused" value={t.failed} hint="push service said no" />
            </div>
          </div>

          {data.daily.length > 1 && (
            <div className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
              <p className="mb-2 text-sm font-semibold">Per day</p>
              <div className="h-44">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.daily.map((d) => ({ ...d, name: day(d.d) }))} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#F1F1F2" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #F1F1F2', fontSize: 12 }} cursor={false} />
                    <Bar dataKey="sent" name="Sent" fill={FILL.pale} radius={[5, 5, 0, 0]} maxBarSize={28} animationDuration={500} />
                    <Bar dataKey="delivered" name="Shown" fill={FILL.light} radius={[5, 5, 0, 0]} maxBarSize={28} animationDuration={500} />
                    <Bar dataKey="clicked" name="Tapped" fill={FILL.brand} radius={[5, 5, 0, 0]} maxBarSize={28} animationDuration={500} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {data.failures.length > 0 && (
            <div className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
              <p className="mb-2 text-sm font-semibold text-ink">Refused or removed</p>
              <ul className="space-y-1.5 text-xs text-smoke">
                {data.failures.map((f, i) => <li key={i}><strong>{f.n}&times;</strong> {f.host || 'unknown host'} · status {f.status ?? '?'} · {f.detail || 'no reason given'}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
