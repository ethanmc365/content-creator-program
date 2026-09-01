import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import { Avatar } from '../ui'
import { scoringMode, isViewRanked, scoreForEntries } from '../../lib/scoring'
import { cx, formatViews } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// "How this one is won", on the challenge itself.
//
// A creator's first question about a challenge is what they have to do; their
// second is how it gets decided. Until now the second had no answer anywhere in
// the product: the mode was stored on the row and shown nowhere, so a points
// challenge and a best-video challenge looked identical to the person entering
// them. Somebody posting eight short videos into a best-video challenge is
// wasting their month, and nothing told them.
//
// The standings here are LIVE and provisional. Final placings come from the
// results table, which an admin fills in when the challenge closes; this is
// what the logged view counts say right now.

export default function ScoringPanel({ challenge, submissions = [], myId }) {
  const tr = useT()
  const mode = scoringMode(challenge.scoring)
  const [rules, setRules] = useState([])

  useEffect(() => {
    if (challenge.scoring !== 'points') { setRules([]); return }
    let alive = true
    supabase.from('point_rules').select('id, kind, label, points, threshold, max_points')
      .eq('challenge_id', challenge.id).order('position')
      .then(({ data }) => { if (alive) setRules(data || []) })
    return () => { alive = false }
  }, [challenge.id, challenge.scoring])

  const [points, setPoints] = useState([])
  useEffect(() => {
    if (challenge.scoring !== 'points') { setPoints([]); return }
    let alive = true
    supabase.from('challenge_standings')
      .select('creator_id, points, profiles:creator_id(id, name, photo_url, is_test)')
      .eq('challenge_id', challenge.id)
      .order('points', { ascending: false }).limit(10)
      .then(({ data }) => { if (alive) setPoints((data || []).filter((r) => !r.profiles?.is_test)) })
    return () => { alive = false }
  }, [challenge.id, challenge.scoring])

  // For the two view-ranked modes the standing is derivable from what is
  // already on the page, so it costs no round trip.
  const viewBoard = (() => {
    if (!isViewRanked(challenge.scoring)) return []
    const byCreator = new Map()
    for (const s of submissions) {
      const list = byCreator.get(s.creator_id) || []
      list.push(s)
      byCreator.set(s.creator_id, list)
    }
    return [...byCreator.entries()]
      .map(([creatorId, entries]) => ({
        creatorId,
        profile: entries[0]?.profiles,
        entries: entries.length,
        score: scoreForEntries(challenge.scoring, entries),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10)
  })()

  return (
    <section className="rounded-card border border-gray-100 bg-white p-5 shadow-card sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
          <Icon name={mode.icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-smoke">How this is won</p>
          <p className="mt-0.5 text-lg font-semibold">{mode.label}</p>
          <p className="mt-1 text-sm text-smoke">{mode.winner}</p>
        </div>
      </div>

      {/* Points: the rules, in the creator's words rather than the admin's. */}
      {challenge.scoring === 'points' && rules.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-smoke">What scores</p>
          {/* THE POINTS PILL IS THE LAST THING IN EVERY ROW, ALWAYS.
              (1 Sep 2026.)

              Ethan: "+1 is currently misaligned because of the max 10, i want
              it to be aligned with +2 etc."

              `max 10` was a SIBLING of the pill in the same flex row, so a rule
              that had a cap pushed its own pill left by the width of those five
              characters and a rule that did not left it flush right. Two rows,
              two different right edges, in a list whose whole job is comparing
              the numbers down that edge.

              The cap is a caption UNDER THE LABEL now - which is also where it
              belongs, because "max 10" qualifies the rule, not the score - and
              the pill sits in a fixed-width column so `+1` and `+10` are
              centred on the same axis too. */}
          <ul className="space-y-1.5">
            {rules.map((r) => (
              <li key={r.id} className="flex items-center gap-3 rounded-xl bg-cloud/60 px-3.5 py-2.5">
                <Icon name={r.kind === 'views_threshold' ? 'chart' : r.kind === 'bonus' ? 'star' : 'video'}
                  className="h-4 w-4 shrink-0 text-brand" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm">{r.label}</span>
                  {r.max_points != null && (
                    <span className="block text-[11px] text-smoke">
                      {tr('Up to {n} points from this', { n: Number(r.max_points) })}
                    </span>
                  )}
                </span>
                <span className="flex w-11 shrink-0 justify-end">
                  <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold tabular-nums text-white">
                    +{Number(r.points)}
                  </span>
                </span>
              </li>
            ))}
          </ul>
          {challenge.threshold_mode === 'cumulative' && (
            <p className="mt-2 text-xs text-smoke">
              A video that passes several milestones scores every one of them.
            </p>
          )}
        </div>
      )}

      {challenge.scoring === 'total_views' && (
        <p className="mt-4 rounded-xl bg-cloud/60 px-4 py-3 text-sm">
          Every entry counts, so posting more is worth it. Your total is all your videos added together.
        </p>
      )}
      {challenge.scoring === 'best_video' && (
        <p className="mt-4 rounded-xl bg-cloud/60 px-4 py-3 text-sm">
          Enter as many times as you like. Only your strongest video counts, so a weak entry can never hurt you.
        </p>
      )}

      {/* Live standing */}
      {(points.length > 0 || viewBoard.length > 0) && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-smoke">
            Where it stands right now
          </p>
          <div className="space-y-1.5">
            {(challenge.scoring === 'points' ? points : viewBoard).map((row, i) => {
              const id = row.creator_id ?? row.creatorId
              const p = row.profiles ?? row.profile
              const value = challenge.scoring === 'points'
                ? `${Number(row.points)} pts`
                : formatViews(row.score)
              return (
                <div key={id}
                  className={cx('flex items-center gap-3 rounded-xl border px-3.5 py-2',
                    id === myId ? 'border-brand/40 bg-brand-tint/25' : 'border-gray-100')}>
                  <span className={cx('w-4 shrink-0 text-xs font-bold', i === 0 ? 'text-brand' : 'text-smoke')}>
                    {i + 1}
                  </span>
                  <Avatar src={p?.photo_url} name={p?.name} size="xs" />
                  <Link to={`/profile/${id}`} className="min-w-0 flex-1 truncate text-sm font-medium hover:text-brand">
                    {p?.name || 'Creator'}{id === myId ? ' (you)' : ''}
                  </Link>
                  {row.entries > 1 && (
                    <span className="hidden shrink-0 text-[11px] text-smoke sm:inline">{row.entries} entries</span>
                  )}
                  <span className="shrink-0 text-sm font-bold text-brand">{value}</span>
                </div>
              )
            })}
          </div>
          <p className="mt-2 text-xs text-smoke">
            Provisional, from the view counts logged so far. Final placings are confirmed when the challenge closes.
          </p>
        </div>
      )}
    </section>
  )
}
