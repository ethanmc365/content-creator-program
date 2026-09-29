import { useEffect, useState } from 'react'
import { Bar, CartesianGrid, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { supabase } from '../../../lib/supabase'
import { Skeleton, StatCard } from '../../../components/ui'
import Segmented from '../../../components/network/Segmented'
import { cx, timeAgo } from '../../../lib/utils'

// DID THE PUSH GO OUT, AND DID ANYONE OPEN IT? (30 Sep 2026, migration 283)
//
// Ethan: "can we see who actually opened them, clicked on them etc, or ensure they were all sent
// correctly to everyone that has push enabled."
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
const TYPE = { challenge: 'Challenge', announcement: 'Announcement', results: 'Results', reward: 'Reward', deadline: 'Deadline', connection: 'Connection', dm: 'Message', event: 'Event', application: 'Application', chat: 'Chat', mention: 'Mention', reaction: 'Reaction' }
const PAGE = 50
const pushCache = new Map()

// WHAT EACH NUMBER MEANS, in the words Ethan asked for (1 Oct 2026): not "land"; a push goes to a
// DEVICE (a phone or a laptop); "Tapped" is somebody pressing the push itself; "Read in the app"
// is the bell item being read, however they got there. The funnel only counts from the moment the
// ledger started, which the RPC now does itself (migration 286), so the steps add up.
export default function PushDelivery() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [more, setMore] = useState([])
  const [loadingMore, setLoadingMore] = useState(false)
  const [err, setErr] = useState('')

  // SWITCHING 7 / 30 / 90 KEEPS THE PAGE (2 Oct 2026). Ethan: "Clicking between 7 days and 30
  // days causes a weird glitch where it temporarily disappears and then comes back". It blanked to a
  // skeleton on every press. Now the numbers already on screen stay (dimmed) until the new ones are
  // in, a window seen once paints at once from memory, and the other two are fetched ahead.
  const [fetching, setFetching] = useState(false)
  useEffect(() => {
    let alive = true
    setMore([])
    const hit = pushCache.get(days)
    if (hit) setData(hit); else setFetching(true)
    supabase.rpc('admin_push_analytics', { p_days: days, p_recent: PAGE, p_offset: 0 }).then(({ data: d, error }) => {
      if (!alive) return
      setFetching(false)
      if (error) setErr(error.message); else { setErr(''); pushCache.set(days, d); setData(d) }
      for (const other of [7, 30, 90]) {
        if (other !== days && !pushCache.has(other)) {
          supabase.rpc('admin_push_analytics', { p_days: other, p_recent: PAGE, p_offset: 0 }).then(({ data: o }) => { if (o) pushCache.set(other, o) })
        }
      }
    })
    return () => { alive = false }
  }, [days])

  async function loadMore() {
    setLoadingMore(true)
    const offset = (data?.recent?.length || 0) + more.length
    const { data: d } = await supabase.rpc('admin_push_analytics', { p_days: days, p_recent: PAGE, p_offset: offset })
    setMore((m) => [...m, ...(d?.recent || [])])
    setLoadingMore(false)
  }

  const t = data?.totals
  const steps = t ? [
    ['Notifications', t.notifications, null, 'created for creators'],
    ['Sent to a device', t.sent, pct(t.sent, t.notifications), 'push accepted for a phone or laptop'],
    ['Shown on the device', t.delivered, pct(t.delivered, t.sent), 'the device reported showing it'],
    ['Tapped', t.clicked, pct(t.clicked, t.delivered || t.sent), 'opened by pressing the push'],
    ['Read in the app', t.opened, pct(t.opened, t.notifications), 'read in the bell, any way'],
  ] : []
  const max = t ? Math.max(1, t.notifications) : 1
  const recent = [...(data?.recent || []), ...more]
  const total = data?.recent_total ?? recent.length
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
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
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
              <StatCard label="No device" value={t.no_device} hint="push not switched on" />
              <StatCard label="Muted" value={t.muted} hint="turned that kind off" />
              <StatCard label="Refused" value={t.failed} hint="push service said no" />
              <StatCard label="Tap rate" value={pct(t.clicked, t.delivered || t.sent) || '-'} hint="of those shown" accent />
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
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #F1F1F2', fontSize: 12 }} />
                    <Bar dataKey="sent" name="Sent" fill="#fde3d1" radius={[5, 5, 0, 0]} maxBarSize={28} animationDuration={500} />
                    <Bar dataKey="delivered" name="Shown" fill="#f5853f" radius={[5, 5, 0, 0]} maxBarSize={28} animationDuration={500} />
                    <Bar dataKey="clicked" name="Tapped" fill="#d94407" radius={[5, 5, 0, 0]} maxBarSize={28} animationDuration={500} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          {/* FIVE IN VIEW, FIFTY IN THE BOX, MORE ON REQUEST (1 Oct 2026). */}
          <div className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
            <div className="flex items-center justify-between border-b border-gray-50 px-4 py-3 sm:px-5">
              <p className="text-sm font-semibold">Latest notifications</p>
              <span className="text-xs text-smoke">{recent.length} of {total}</span>
            </div>
            {recent.length === 0 ? <p className="px-5 py-6 text-sm text-smoke">Nothing sent in this window yet.</p> : (
              <div className="max-h-[21rem] overflow-y-auto overscroll-contain">
                <ul className="divide-y divide-gray-50">
                  {recent.map((r, i) => (
                    <li key={i} className="flex items-center gap-3 px-4 py-2.5 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{r.title}</p>
                        <p className="text-[11px] text-smoke">{TYPE[r.type] || r.type} · {timeAgo(r.at)} · to {r.recipients}</p>
                      </div>
                      <div className="grid shrink-0 grid-cols-4 gap-1 text-center">
                        {[['Sent', r.sent], ['Shown', r.delivered], ['Tapped', r.clicked], ['Read', r.opened]].map(([l, v]) => (
                          <div key={l} className="w-12 rounded-md bg-cloud/70 px-1 py-1">
                            <p className={cx('text-xs font-bold tabular-nums', v > 0 ? 'text-ink' : 'text-gray-300')}>{v}</p>
                            <p className="text-[9px] font-semibold uppercase tracking-wide text-gray-400">{l}</p>
                          </div>
                        ))}
                      </div>
                    </li>
                  ))}
                </ul>
                {recent.length < total && (
                  <button type="button" onClick={loadMore} disabled={loadingMore} className="w-full border-t border-gray-50 py-2.5 text-xs font-semibold text-brand transition-colors hover:bg-cloud/50 disabled:opacity-60">
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                )}
              </div>
            )}
          </div>

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
