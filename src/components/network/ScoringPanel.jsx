import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import { scoringMode, ruleWindowState } from '../../lib/scoring'
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

const dm = (iso) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

// "Runs Mon 21 Sep to Sun 27 Sep" - the dates a bonus counts for (migration 256).
export function bonusWindowLine(r, tr) {
  const state = ruleWindowState(r)
  if (state === 'ended') return tr('Ended {d}', { d: dm(r.ends_at) })
  if (r.starts_at && r.ends_at) return tr('Runs {a} to {b}', { a: dm(r.starts_at), b: dm(r.ends_at) })
  if (r.ends_at) return tr('Until {d}', { d: dm(r.ends_at) })
  return tr('From {d}', { d: dm(r.starts_at) })
}

// THE RULES, FETCHED ONCE FOR THE WHOLE PAGE. The challenge page draws them in
// two places now (the view milestones here, the bonuses in their own card in
// the rail), and two components fetching the same rows is how two halves of a
// page end up disagreeing.
export function usePointRules(challenge) {
  const [rules, setRules] = useState([])
  const id = challenge?.id
  const points = challenge?.scoring === 'points'
  useEffect(() => {
    if (!id || !points) { setRules([]); return undefined }
    let alive = true
    supabase.from('point_rules').select('id, kind, label, points, threshold, max_points, min_views, period_days, prompt, starts_at, ends_at')
      .eq('challenge_id', id).eq('is_active', true).order('position')
      .then(({ data }) => { if (alive) setRules(data || []) })
    return () => { alive = false }
  }, [id, points])
  return rules
}

// VIEWS ON THE LEFT, EVERYTHING ELSE IN ITS OWN CARD (24 Sep 2026).
// Ethan: "the points leaderboard looks quite cluttered and hard to understand.
// Anything related to bonus points... should have a separate column on the
// right, just below Platforms you can post on... The regular points board
// should only be for the view-related points, because there are a lot of
// them, and the other ones can stand out."
export const VIEW_KINDS = new Set(['views_threshold', 'total_views_threshold'])
export const isBonusKind = (r) => !VIEW_KINDS.has(r?.kind)

const compact = (n) => {
  const v = Number(n) || 0
  if (v >= 1000000) return `${+(v / 1000000).toFixed(1)}M`
  if (v >= 1000) return `${+(v / 1000).toFixed(1)}K`
  return String(v)
}

export default function ScoringPanel({ challenge, rules: given }) {
  const tr = useT()
  const mode = scoringMode(challenge.scoring)
  const fetched = usePointRules(given ? null : challenge)
  const all = given ?? fetched
  // Only the view milestones here; the bonus kinds live in BonusPointsCard.
  const rules = all.filter((r) => VIEW_KINDS.has(r.kind))
  const perVideo = rules.filter((r) => r.kind === 'views_threshold').sort((a, b) => a.threshold - b.threshold)
  const totals = rules.filter((r) => r.kind === 'total_views_threshold').sort((a, b) => a.threshold - b.threshold)

  return (
    <section className="rounded-card border border-gray-100 bg-white p-5 shadow-card sm:p-6">
      <div className="flex items-start gap-3">
        {/* SOLID TRYP.COM ORANGE, NOT A PALE TILE (21 Sep 2026, Ethan). */}
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white shadow-card">
          <Icon name={mode.icon} className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-widest text-brand">{tr("How this is won")}</p>
          <p className="mt-0.5 text-xl font-bold tracking-tight">{mode.label}</p>
          <p className="mt-1 text-sm text-ink/80">{mode.winner}</p>
        </div>
      </div>

      {/* THE VIEW LADDER, AS A GRID OF STEPS (24 Sep 2026). Eleven full-width
          rows reading "Passed 1,000 views ... +1" were most of the clutter
          Ethan reported. Each milestone is one small tile now - the view count
          big, its points under it - so the whole ladder fits in the space two
          rows used to take, and the eye reads it left to right as it climbs. */}
      {challenge.scoring === 'points' && rules.length > 0 && (
        <div className="mt-5 space-y-4">
          {perVideo.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-smoke">{tr("Views on one video")}</p>
              <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {perVideo.map((r) => (
                  <li
                    key={r.id}
                    className="flex flex-col items-center justify-center rounded-xl bg-cloud/70 px-2 py-2.5 text-center"
                  >
                    <span className="text-[15px] font-bold tabular-nums leading-none text-ink">{compact(r.threshold)}</span>
                    <span className="mt-1 text-[11px] text-smoke">{tr("views")}</span>
                    <span className="mt-1.5 rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">
                      +{Number(r.points)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-smoke">
                {challenge.threshold_mode === 'cumulative'
                  ? tr("A video that passes several milestones scores every one of them.")
                  : tr("Each video scores its highest milestone. Every video you post counts.")}
              </p>
            </div>
          )}
          {totals.length > 0 && (
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-smoke">{tr("Views across all your videos")}</p>
              <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-4">
                {totals.map((r) => (
                  <li key={r.id} className="flex flex-col items-center justify-center rounded-xl bg-cloud/70 px-2 py-2.5 text-center">
                    <span className="text-[15px] font-bold tabular-nums leading-none text-ink">{compact(r.threshold)}</span>
                    <span className="mt-1 text-[11px] text-smoke">{tr("in total")}</span>
                    <span className="mt-1.5 rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold tabular-nums text-white">+{Number(r.points)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {/* The rule migration 239 enforces, said where the scoring is. */}
          <p className="text-xs text-smoke">
            {tr("Level on points? The creator with more total views across their videos takes the higher place.")}
          </p>
        </div>
      )}
      {challenge.scoring === 'points' && rules.length === 0 && all.length > 0 && (
        <p className="mt-4 rounded-xl bg-cloud/60 px-4 py-3 text-sm">
          {tr("Points on this one come from the bonuses listed beside the prizes.")}
        </p>
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
