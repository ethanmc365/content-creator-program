import { useEffect, useState } from 'react'
import Icon from '../Icon'
import { cx } from '../../lib/utils'
import { SheetLabel } from './creatorSheet'
import { challengesApi } from '../../api/challenges'
import { submissionsApi } from '../../api/submissions'
import { marketsApi } from '../../api/markets'
import { contentApi } from '../../api/content'

// HAS THIS CREATOR TAKEN PART?
//
// SCOPE IS THEIR MARKETS PLUS WORLDWIDE. A challenge belongs to a community (`challenges.community_id`); somebody is
// eligible for the ones of every community they are an active member of, and the Worldwide network is everybody's.
// Only LIVE challenges are listed: a finished one answers a different question (did they win), and the old ones would
// bury the one that is open now. VIP and official creators are fenced out of community challenges by design, so they get
// one sentence saying so instead of a row of "not participated" that could never become true.
//
// "PARTICIPATED" = at least one entry that still exists on that challenge; the count rides along.
//
// A REMOVED ENTRY IS NOT PARTICIPATION (Xenia). The video tracker keeps a row for a video even after its entry is
// deleted (`tracked_videos.submission_id` goes NULL), so Xenia's TikTok still sits in the tracker with 143k views while
// she has no entry and no score. Counting that as taking part was wrong; instead, when there is no entry, the row says
// WHY: "Disqualified" (a record in submission_disqualifications) or "Entry removed" (the tracker remembers a video that
// no longer has an entry: she took it out herself, or the team did).
export default function ChallengeParticipation({ profileId, isVip = false }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    if (!profileId || isVip) { setRows([]); return undefined }
    let alive = true
    ;(async () => {
      const [{ data: mem }, { data: net }] = await Promise.all([
        marketsApi.communityMembers().select('community_id').eq('profile_id', profileId).eq('status', 'active'),
        marketsApi.communities().select('id').eq('kind', 'network'),
      ])
      const ids = [...new Set([...(mem ?? []), ...(net ?? [])].map((r) => r.community_id ?? r.id))]
      if (!ids.length) { if (alive) setRows([]); return }
      const [{ data: chs }, { data: subs }, { data: tracked }, { data: dqs }] = await Promise.all([
        challengesApi.challenges().select('id, title, community_id, end_date, communities(name, kind)')
          .eq('status', 'active').in('community_id', ids).order('end_date', { ascending: true }),
        submissionsApi.submissions().select('challenge_id').eq('creator_id', profileId),
        contentApi.trackedVideos().select('challenge_id').eq('creator_id', profileId).is('submission_id', null),
        submissionsApi.submissionDisqualifications().select('challenge_id').eq('creator_id', profileId),
      ])
      if (!alive) return
      const entries = {}
      for (const s of subs ?? []) entries[s.challenge_id] = (entries[s.challenge_id] || 0) + 1
      const dq = new Set((dqs ?? []).map((d) => d.challenge_id))
      const gone = new Set((tracked ?? []).map((t) => t.challenge_id))
      setRows((chs ?? []).map((c) => ({
        id: c.id,
        title: c.title,
        market: c.communities?.kind === 'network' ? 'Worldwide' : c.communities?.name,
        entries: entries[c.id] || 0,
        why: entries[c.id] ? null : dq.has(c.id) ? 'dq' : gone.has(c.id) ? 'removed' : null,
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
              // 12 Oct 2026: on a phone the status pill took the row and cut the title to "Global Challe...". It wraps
              // under the name there instead.
              className="flex animate-fade-up flex-col items-start gap-2 rounded-xl border border-gray-100 px-3.5 py-2.5 sm:flex-row sm:items-center sm:gap-3"
              style={{ animationDelay: `${i * 70}ms`, animationFillMode: 'both' }}
            >
              <div className="w-full min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug [overflow-wrap:anywhere] sm:truncate">{r.title}</p>
                <p className="truncate text-[11px] text-smoke">{r.market}</p>
              </div>
              <span
                className={cx(
                  'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold',
                  r.entries > 0
                    ? 'bg-green-50 text-green-700 ring-1 ring-inset ring-green-500/30'
                    : r.why === 'dq'
                      ? 'bg-red-50 text-red-700 ring-1 ring-inset ring-red-500/30'
                      : 'bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-500/30',
                )}
              >
                <Icon name={r.entries > 0 ? 'check' : 'clock'} className="h-3 w-3 animate-pop-in" />
                {r.entries > 0 ? `Participated${r.entries > 1 ? ` · ${r.entries} entries` : ''}` : r.why === 'dq' ? 'Disqualified' : r.why === 'removed' ? 'Entry removed' : 'Not participated'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
