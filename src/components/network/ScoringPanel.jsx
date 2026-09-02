import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import { scoringMode } from '../../lib/scoring'
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
// IT DOES NOT CARRY A LEADERBOARD (2 Sep 2026).
//
// It used to end with "Where it stands right now" - a provisional top ten off
// the logged view counts. Ethan: "I don't get why it's showing the standings
// here. It seems to be just a bigger burden, and it doesn't make sense for it
// to show when you already have a dedicated leaderboard tab, so remove that
// from there."
//
// He is right, and it was worse than redundant: the tab next door lays every
// paid place out from the prize structure, ranks WITHIN a creator's own group
// on a split challenge, and marks the participation vouchers. This panel's copy
// did none of that, so the two disagreed on a page where they sat two clicks
// apart. One board, on the tab called Leaderboard.

export default function ScoringPanel({ challenge }) {
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

  return (
    <section className="rounded-card border border-gray-100 bg-white p-5 shadow-card sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
          <Icon name={mode.icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-smoke">{tr("How this is won")}</p>
          <p className="mt-0.5 text-lg font-semibold">{mode.label}</p>
          <p className="mt-1 text-sm text-smoke">{mode.winner}</p>
        </div>
      </div>

      {/* Points: the rules, in the creator's words rather than the admin's. */}
      {challenge.scoring === 'points' && rules.length > 0 && (
        <div className="mt-5">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-smoke">{tr("What scores")}</p>
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
              {tr("A video that passes several milestones scores every one of them.")}
            </p>
          )}
        </div>
      )}

      {challenge.scoring === 'total_views' && (
        <p className="mt-4 rounded-xl bg-cloud/60 px-4 py-3 text-sm">
          {tr("Every entry counts, so posting more is worth it. Your total is all your videos added together.")}
        </p>
      )}
      {challenge.scoring === 'best_video' && (
        <p className="mt-4 rounded-xl bg-cloud/60 px-4 py-3 text-sm">
          {tr("Enter as many times as you like. Only your strongest video counts, so a weak entry can never hurt you.")}
        </p>
      )}

    </section>
  )
}
