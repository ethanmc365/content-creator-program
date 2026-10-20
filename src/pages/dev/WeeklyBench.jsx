// DEV-ONLY: the Video of the Week card at the widths it is drawn at (phone 375, the brief's rail 340), filled with REAL
// entries from the last Global Challenge so the thumbnails, names and photos are the real shapes. Two decided rounds,
// one running, one still to come. Open /__preview?bench=weekly. Mounted under import.meta.env.DEV only (see Preview.jsx).
import { useEffect, useState } from 'react'
import { WeeklyPrizeCard } from '../../components/challenge/WeeklyPrize'
import { supabase } from '../../lib/supabase'

const DAY = 86400_000

export default function WeeklyBench() {
  const [rows, setRows] = useState(null)
  const [now] = useState(() => Date.now())
  useEffect(() => {
    supabase.from('submissions')
      .select('id, creator_id, logged_views, platform, video_url, thumbnail_url, platform_video_id, profiles:creator_id(name, photo_url), challenges!inner(title)')
      .eq('challenges.title', 'Global Challenge').not('thumbnail_url', 'is', null)
      .order('logged_views', { ascending: false }).limit(12)
      .then(({ data }) => {
        const subs = data || []
        const row = (round, state, place, s, startsAt, endsAt) => ({
          round, starts_at: new Date(startsAt).toISOString(), ends_at: new Date(endsAt).toISOString(), group_id: null, group_name: null,
          state, place, submission_id: s?.id || null, creator_id: s?.creator_id || null, name: s?.profiles?.name || null,
          photo_url: s?.profiles?.photo_url || null, views: s?.logged_views ?? null, platform: s?.platform || null,
          video_url: s?.video_url || null, thumbnail_url: s?.thumbnail_url || null, platform_video_id: s?.platform_video_id || null,
          row_id: null, reward_id: null, awarded_at: null,
        })
        const start = now - 15 * DAY
        setRows([
          row(1, 'awarded', 1, subs[0], start, start + 7 * DAY),
          row(2, 'awarded', 1, subs[1], start + 7 * DAY, start + 14 * DAY),
          ...subs.slice(2, 7).map((s, i) => row(3, 'live', i + 1, s, start + 14 * DAY, start + 21 * DAY)),
          row(4, 'upcoming', null, null, start + 21 * DAY, start + 30 * DAY),
        ])
      })
  }, [now])
  const challenge = { id: 'bench', weekly_prize: { amount: 10, currency: 'EUR', type: 'voucher', every_days: 7 }, timezone: 'Europe/London' }
  if (!rows) return <p style={{ padding: 24 }}>Loading entries...</p>
  return (
    <div style={{ padding: 24, background: '#f6f6f6', display: 'flex', gap: 32, flexWrap: 'wrap', alignItems: 'flex-start' }}>
      {[375, 340].map((w) => (
        <div key={w} style={{ width: w }} data-bench-width={w}>
          <p style={{ font: '700 12px ui-monospace', marginBottom: 8 }}>{w}px</p>
          <WeeklyPrizeCard challenge={challenge} boardRows={rows} meId={rows[4]?.creator_id} onPlay={(e) => console.log('play', e.video_url)} />
        </div>
      ))}
      <div style={{ width: 340 }}>
        <p style={{ font: '700 12px ui-monospace', marginBottom: 8 }}>Before round 1</p>
        <WeeklyPrizeCard challenge={challenge} boardRows={rows.map((r) => ({ ...r, state: 'upcoming', submission_id: null, starts_at: new Date(now + 2 * DAY).toISOString() }))} />
      </div>
    </div>
  )
}
