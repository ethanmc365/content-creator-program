import Icon from '../Icon'
import { useT } from '../../lib/i18n'
import { cx } from '../../lib/utils'
import { ruleWindowState } from '../../lib/scoring'
import { isBonusKind } from './ScoringPanel'

// THE EXTRA POINTS, IN THEIR OWN CARD, IN THE RAIL (24 Sep 2026).
//
// Ethan: "anything that's related to bonus points - just posting a video, or
// post at least one video in all 4 weeks, or bonus points - should have a
// little separate column on the right side, just below 'Platforms you can post
// on'. This should be a different UI that stands out more than the regular
// points."
//
// WHITE CARDS INSIDE THE ORANGE (26 Sep 2026). Ethan: "I like the nice orange
// card that makes it stand out, but I would make the card inside it maybe white
// ... it seems to be too much orange, and it's quite hard to read."
//
// So it is the one SOLID BRAND card on the page. The view ladder on the left is
// the steady part of the scoring and reads as a table; these are the offers,
// the things a creator can go and do this week to jump a place, and they are
// drawn as offers. A bonus with dates (migration 256) says when it runs, and
// one that has finished drops to the foot, dimmed, saying the points are kept.

const ICON = { per_post: 'video', platform_spread: 'share', consistency: 'calendar', bonus: 'star' }

const dm = (iso) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

function howToEarn(r, tr) {
  if (r.kind === 'per_post') return tr('For every video you post')
  if (r.kind === 'platform_spread') return tr('For each platform you post on')
  if (r.kind === 'consistency') {
    const d = Number(r.period_days) || 7
    return d === 1 ? tr('Post at least one video every day')
      : d === 7 ? tr('Post at least one video every week')
        : tr('Post at least one video every {n} days', { n: d })
  }
  if (r.prompt) return tr('Tick the box when you submit the video')
  return tr('Given by the team')
}

export default function BonusPointsCard({ rules, now = 0, className }) {
  const tr = useT()
  const bonuses = (rules || []).filter(isBonusKind)
  if (bonuses.length === 0) return null
  const stateOf = (r) => ruleWindowState(r, now || undefined)
  const current = bonuses.filter((r) => stateOf(r) !== 'ended')
  const ended = bonuses.filter((r) => stateOf(r) === 'ended')

  return (
    <section id="bonus-points" className={cx('scroll-mt-24 overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light text-white shadow-card', className)}>
      <div className="flex items-center gap-2.5 px-5 pb-3 pt-4">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/20">
          <Icon name="star" className="h-4 w-4" />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold uppercase tracking-wider">{tr('Bonus points')}</h2>
          <p className="text-xs text-white/80">{tr('On top of your view points')}</p>
        </div>
      </div>
      <ul className="space-y-1.5 px-3 pb-3">
        {[...current, ...ended].map((r) => {
          const state = stateOf(r)
          const done = state === 'ended'
          return (
            <li
              key={r.id}
              className={cx('flex items-start gap-3 rounded-xl px-3 py-3 shadow-sm transition-transform duration-200', done ? 'bg-white/70 opacity-70' : 'bg-white hoverable:hover:-translate-y-0.5')}
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand"><Icon name={ICON[r.kind] || 'star'} className="h-4 w-4" /></span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug text-ink [overflow-wrap:anywhere]">{r.label.trim()}</p>
                <p className="mt-0.5 text-xs leading-snug text-smoke">{howToEarn(r, tr)}</p>
                {(r.max_points != null || (r.kind === 'bonus' && Number(r.min_views) > 0)) && (
                  <p className="mt-0.5 text-[11px] text-smoke">
                    {[
                      r.max_points != null ? tr('Up to {n} points', { n: Number(r.max_points) }) : null,
                      r.kind === 'bonus' && Number(r.min_views) > 0
                        ? tr('Counts once the video passes {n} views', { n: Number(r.min_views).toLocaleString() }) : null,
                    ].filter(Boolean).join(' · ')}
                  </p>
                )}
                {state !== 'always' && (
                  <span className={cx(
                    'mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
                    done ? 'bg-cloud text-smoke' : 'bg-brand text-white',
                  )}>
                    <Icon name="clock" className="h-3 w-3" />
                    {state === 'ended' ? tr('Ended {d}, points kept', { d: dm(r.ends_at) })
                      : state === 'upcoming' ? tr('Starts {d}', { d: dm(r.starts_at) })
                        : r.ends_at ? tr('Until {d}', { d: dm(r.ends_at) }) : tr('Running now')}
                  </span>
                )}
              </div>
              <span className={cx(
                'shrink-0 rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums',
                done ? 'bg-cloud text-smoke' : 'bg-brand text-white',
              )}>
                +{Number(r.points)}
              </span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// THE BONUS RUNNING RIGHT NOW, BESIDE THE TABS. Only a bonus with DATES earns a
// place here - one that runs all challenge is already in the card; a bonus for
// this week alone is news, and news goes at the top.
export function LiveBonusCallout({ rules, now, onOpen }) {
  const tr = useT()
  const live = (rules || []).filter((r) => isBonusKind(r) && r.ends_at && ruleWindowState(r, now) === 'live')
  if (live.length === 0) return null
  const r = live[0]
  // AS WIDE AS THE ROW, AND IT ARRIVES LIKE THE LEADERBOARD BADGE (26 Sep
  // 2026). Ethan: "you have more space to widen it on desktop ... start from
  // that right and go as far as the entries button ... make it stand out more"
  // and "show up ... with that same animation, so it looks clean, like
  // expanding in and out." `sm:flex-1` fills the row beside the tabs exactly as
  // BoardStatus does, and `board-status` is that badge's own entrance.
  return (
    <button
      type="button"
      onClick={onOpen}
      className="board-status group relative flex w-full min-w-0 items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-ink via-[#2b160c] to-[#5a2308] py-2.5 pl-2.5 pr-3.5 text-left text-white shadow-card transition-transform duration-200 hoverable:hover:-translate-y-0.5 sm:flex-1"
    >
      <span aria-hidden className="challenge-sheen pointer-events-none absolute inset-y-0" />
      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand">
        <Icon name="star" className="hook-sparkles h-4 w-4" />
        <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-brand/40 [animation-duration:2.4s]" />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-brand-light">
          {tr('Bonus running until {d}', { d: dm(r.ends_at) })}
        </span>
        <span className="block truncate text-[13px] font-semibold">{r.label.trim()}</span>
      </span>
      {live.length > 1 && (
        <span className="relative hidden shrink-0 text-[11px] font-semibold text-white/70 sm:inline">{tr('+{n} more', { n: live.length - 1 })}</span>
      )}
      <span className="relative shrink-0 rounded-full bg-brand px-2.5 py-1 text-xs font-bold tabular-nums shadow-card">+{Number(r.points)}</span>
      <Icon name="chevronRight" className="relative hidden h-4 w-4 shrink-0 text-white/70 transition-transform duration-200 group-hover:translate-x-0.5 sm:block" />
    </button>
  )
}
