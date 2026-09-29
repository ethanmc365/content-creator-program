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

const pct = (a, b) => (b > 0 ? `${Math.round((a / b) * 100)}%` : '-')
const day = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const TYPE = { challenge: 'Challenge', announcement: 'Announcement', results: 'Results', reward: 'Reward', deadline: 'Deadline', connection: 'Connection', dm: 'Message', event: 'Event', application: 'Application', chat: 'Chat' }

export default function PushDelivery() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    setData(null)
    supabase.rpc('admin_push_analytics', { p_days: days }).then(({ data: d, error }) => {
      if (!alive) return
      if (error) setErr(error.message); else { setErr(''); setData(d) }
    })
    return () => { alive = false }
  }, [days])

  const t = data?.totals
  const steps = t ? [
    ['Notifications', t.notifications, null],
    ['Sent to a phone', t.sent, pct(t.sent, t.notifications)],
    ['Shown on the phone', t.delivered, pct(t.delivered, t.sent)],
    ['Tapped', t.clicked, pct(t.clicked, t.sent)],
    ['Opened in the app', t.opened, pct(t.opened, t.notifications)],
  ] : []
  const max = t ? Math.max(1, t.notifications) : 1

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">Did the notifications land?</h2>
        <Segmented value={days} onChange={setDays} options={[{ value: 7, label: '7 days' }, { value: 30, label: '30 days' }, { value: 90, label: '90 days' }]} />
      </div>
      <p className="mb-4 text-xs text-smoke">
        Every push is tracked from the server to the phone. &ldquo;Sent&rdquo; means the push service accepted it;
        &ldquo;Shown&rdquo; and &ldquo;Tapped&rdquo; are reported by the phone itself
        {data?.tracking_since ? `, and have only been recorded since ${day(data.tracking_since)}` : ''}.
      </p>

      {err ? (
        <p className="rounded-card border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600">{err}</p>
      ) : !data ? (
        <Skeleton className="h-72 w-full" />
      ) : (
        <div className="space-y-6">
          <div className="rounded-card border border-gray-100 bg-white p-5 shadow-card">
            <div className="space-y-3">
              {steps.map(([label, n, rate], i) => (
                <div key={label} className="grid grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-3 sm:grid-cols-[11rem_1fr_auto]">
                  <span className="truncate text-sm font-medium text-ink">{label}</span>
                  <div className="h-3 overflow-hidden rounded-full bg-cloud">
                    <div className="kpi-fill h-full rounded-full bg-gradient-to-r from-brand-light to-brand" style={{ width: `${Math.max(n > 0 ? 2 : 0, Math.round((n / max) * 100))}%`, animationDelay: `${i * 70}ms` }} />
                  </div>
                  <span className="min-w-[5.5rem] text-right text-sm tabular-nums"><strong>{n.toLocaleString()}</strong>{rate && <span className="ml-1.5 text-xs text-smoke">{rate}</span>}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="grid auto-rows-fr grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="No device" value={t.no_device} hint="bell only, push not enabled" />
            <StatCard label="Muted" value={t.muted} hint="switched that kind off" />
            <StatCard label="Refused" value={t.failed} hint="push service said no" />
            <StatCard label="Tap rate" value={pct(t.clicked, t.delivered || t.sent)} hint="of those shown" accent />
          </div>

          {data.daily.length > 1 && (
            <div className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
              <p className="mb-2 text-sm font-semibold">Per day</p>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={data.daily.map((d) => ({ ...d, name: day(d.d) }))} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="#F1F1F2" />
                    <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#6B7280' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip contentStyle={{ borderRadius: 12, border: '1px solid #F1F1F2', fontSize: 12 }} />
                    <Bar dataKey="sent" name="Sent" fill="#fde3d1" radius={[5, 5, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="delivered" name="Shown" fill="#f5853f" radius={[5, 5, 0, 0]} maxBarSize={28} />
                    <Bar dataKey="clicked" name="Tapped" fill="#d94407" radius={[5, 5, 0, 0]} maxBarSize={28} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}

          <div className="rounded-card border border-gray-100 bg-white shadow-card">
            <p className="border-b border-gray-50 px-5 py-3 text-sm font-semibold">Latest notifications</p>
            {data.recent.length === 0 ? <p className="px-5 py-6 text-sm text-smoke">Nothing sent in this window.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px] text-left text-sm">
                  <thead><tr className="text-[11px] uppercase tracking-wide text-smoke">
                    {['Notification', 'To', 'Sent', 'Shown', 'Tapped', 'Opened'].map((h, i) => <th key={h} className={cx('px-4 py-2 font-semibold', i > 0 && 'text-right')}>{h}</th>)}
                  </tr></thead>
                  <tbody>
                    {data.recent.map((r, i) => (
                      <tr key={i} className="border-t border-gray-50">
                        <td className="max-w-[16rem] px-4 py-2.5"><span className="block truncate font-medium">{r.title}</span><span className="text-[11px] text-smoke">{TYPE[r.type] || r.type} · {timeAgo(r.at)}</span></td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.recipients}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.sent}<span className="ml-1 text-[11px] text-smoke">{pct(r.sent, r.recipients)}</span></td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.delivered}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.clicked}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{r.opened}<span className="ml-1 text-[11px] text-smoke">{pct(r.opened, r.recipients)}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {data.failures.length > 0 && (
            <div className="rounded-card border border-amber-200 bg-amber-50/60 p-4">
              <p className="mb-2 text-sm font-semibold text-amber-800">Refused or removed</p>
              <ul className="space-y-1.5 text-xs text-amber-900">
                {data.failures.map((f, i) => <li key={i}><strong>{f.n}&times;</strong> {f.host || 'unknown host'} · status {f.status ?? '?'} · {f.detail || 'no reason given'}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
