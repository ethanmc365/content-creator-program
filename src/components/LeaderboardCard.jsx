import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Icon from './Icon'
import { Avatar } from './ui'
import { formatViews } from '../lib/utils'

// An inline challenge-leaderboard card inside a chat message. Admins post these
// to #announcements from the results page as a mid-challenge (interim) or final
// standings update. Shows the current top 3 + a link to the full board.
// (Mirrors ResourceCard / GameEventCard / PollCard.)
const MEDAL = ['🥇', '🥈', '🥉']

export default function LeaderboardCard({ challengeId }) {
  const [challenge, setChallenge] = useState(null)
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let alive = true
    Promise.all([
      supabase.from('challenges').select('id, title, status, results_status').eq('id', challengeId).single(),
      supabase
        .from('results')
        .select('rank, final_views, profiles:creator_id(id, name, photo_url)')
        .eq('challenge_id', challengeId)
        .order('rank')
        .limit(3),
    ]).then(([{ data: ch }, { data: res }]) => {
      if (!alive) return
      setChallenge(ch)
      setRows(res ?? [])
    })
    return () => { alive = false }
  }, [challengeId])

  if (!challenge) return null
  const isFinal = challenge.results_status === 'final'

  return (
    <div className="mt-1 w-72 max-w-full overflow-hidden rounded-2xl border border-brand/20 bg-white sm:w-80">
      <div className="bg-gradient-to-br from-brand to-brand-light px-4 py-3 text-white">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/80">
          <Icon name="trophy" className="h-3.5 w-3.5" /> {isFinal ? 'Final results' : 'Current leaderboard'}
        </p>
        <p className="text-sm font-bold leading-snug">{challenge.title}</p>
      </div>
      <div className="p-3">
        {rows && rows.length > 0 ? (
          <ul className="mb-3 space-y-2">
            {rows.map((r) => (
              <li key={r.rank} className="flex items-center gap-2.5">
                <span className="w-5 text-center text-sm">{MEDAL[r.rank - 1] ?? r.rank}</span>
                <Avatar src={r.profiles?.photo_url} name={r.profiles?.name} size="xs" />
                <span className="min-w-0 flex-1 truncate text-xs font-semibold">{r.profiles?.name}</span>
                <span className="shrink-0 text-xs font-bold tabular-nums text-brand">{formatViews(r.final_views)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-3 text-center text-xs text-smoke">Standings coming soon.</p>
        )}
        {!isFinal && <p className="mb-2 text-center text-[10px] text-smoke">Current leaderboard, still changing.</p>}
        <Link to={`/challenges/${challengeId}`} className="btn-primary block w-full !py-2 text-center text-xs">
          View full leaderboard →
        </Link>
      </div>
    </div>
  )
}
