import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import { cx } from '../../lib/utils'
import { SheetLabel } from './creatorSheet'

// HAS THIS CREATOR TAKEN PART? (11 Oct 2026)
//
// Ethan: "I want to more easily see who has taken part in a challenge. As an admin, when clicking on their profile, in the
// space at the top, 'participated' or 'not participated' in the Global Challenge or whatever the challenge is called. It
// should only show the challenges for the markets they are in."
//
// SCOPE IS THEIR MARKETS PLUS WORLDWIDE. A challenge belongs to a community (`challenges.community_id`); somebody is
// eligible for the ones of every community they are an active member of, and the Worldwide network is everybody's.
// Only LIVE challenges are listed: a finished one answers a different question (did they win), and the old ones would
// bury the one that is open now. VIP and official creators are fenced out of community challenges by design, so they get
// one sentence saying so instead of a row of "not participated" that could never become true.
//
// "PARTICIPATED" = at least one entry on that challenge, whatever its state; the entry count rides along. TWO PLACES COUNT
// (11 Oct 2026, Xenia): a creator's entry form writes `submissions`, but the team also adds a creator's video straight
// into the video tracker (`tracked_videos`, linked to their account and a challenge, with no submission behind it). Xenia
// had one of those on the Global Challenge and no submission, so a block that read only `submissions` called her absent.
// A tracked video that came FROM a submission carries `submission_id` and is not counted twice.
export default function ChallengeParticipation({ profileId, isVip = false }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    if (!profileId || isVip) { setRows([]); return undefined }
    let alive = true
    ;(async () => {
      const [{ data: mem }, { data: net }] = await Promise.all([
        supabase.from('community_members').select('community_id').eq('profile_id', profileId).eq('status', 'active'),
        supabase.from('communities').select('id').eq('kind', 'network'),
      ])
      const ids = [...new Set([...(mem ?? []), ...(net ?? [])].map((r) => r.community_id ?? r.id))]
      if (!ids.length) { if (alive) setRows([]); return }
      const [{ data: chs }, { data: subs }, { data: tracked }] = await Promise.all([
        supabase.from('challenges').select('id, title, community_id, end_date, communities(name, kind)')
          .eq('status', 'active').in('community_id', ids).order('end_date', { ascending: true }),
        supabase.from('submissions').select('challenge_id').eq('creator_id', profileId),
        supabase.from('tracked_videos').select('challenge_id').eq('creator_id', profileId).is('submission_id', null),
      ])
      if (!alive) return
      const entries = {}
      for (const s of [...(subs ?? []), ...(tracked ?? [])]) entries[s.challenge_id] = (entries[s.challenge_id] || 0) + 1
      setRows((chs ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        market: c.communities?.kind === 'network' ? 'Worldwide' : c.communities?.name,
        entries: entries[c.id] || 0,
      })))
    })()
    return () => { alive = false }
  }, [profileId, isVip])

  if (rows && rows.length === 0 && !isVip) return null
  return (
    <div>
      <SheetLabel>Challenges</SheetLabel>
      {isVip ? (
        <p className="rounded-xl bg-cloud px-3.5 py-2.5 text-xs text-smoke">
          VIP and official creators are not part of the community challenges.
        </p>
      ) : rows === null ? (
        <div className="space-y-1.5" aria-hidden>
          <div className="h-[58px] animate-pulse rounded-xl bg-cloud" />
          <div className="h-[58px] animate-pulse rounded-xl bg-cloud" style={{ animationDelay: '120ms' }} />
        </div>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((r, i) => (
            <li
              key={r.id}
              className="flex animate-fade-up items-center gap-3 rounded-xl border border-gray-100 px-3.5 py-2.5"
              style={{ animationDelay: `${i * 70}ms`, animationFillMode: 'both' }}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{r.title}</p>
                <p className="truncate text-[11px] text-smoke">{r.market}</p>
              </div>
              <span
                className={cx(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold',
                  r.entries > 0
                    ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-500/30'
                    : 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-500/30',
                )}
              >
                <Icon name={r.entries > 0 ? 'check' : 'clock'} className="h-3 w-3 animate-pop-in" />
                {r.entries > 0 ? `Participated${r.entries > 1 ? ` · ${r.entries} entries` : ''}` : 'Not participated'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
