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
    <section id="bonus-points" className={cx('scroll-mt-24 overflow-hidden rounded-card bg-brand text-white shadow-card', className)}>
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
              className={cx('flex items-start gap-3 rounded-xl px-3 py-2.5', done ? 'bg-white/10 opacity-70' : 'bg-white/[0.14]')}
            >
              <Icon name={ICON[r.kind] || 'star'} className="mt-0.5 h-4 w-4 shrink-0 text-white/90" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold leading-snug [overflow-wrap:anywhere]">{r.label.trim()}</p>
                <p className="mt-0.5 text-xs leading-snug text-white/80">{howToEarn(r, tr)}</p>
                {(r.max_points != null || (r.kind === 'bonus' && Number(r.min_views) > 0)) && (
                  <p className="mt-0.5 text-[11px] text-white/70">
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
                    done ? 'bg-white/15 text-white/80' : 'bg-white text-brand',
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
                done ? 'bg-white/20 text-white' : 'bg-white text-brand',
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
  return (
    <button
      type="button"
      onClick={onOpen}
      className="animate-fade-up group flex w-full min-w-0 items-center gap-3 rounded-2xl bg-ink px-3.5 py-2 text-left text-white shadow-card transition-transform duration-200 hover:-translate-y-0.5 sm:w-auto sm:max-w-[26rem]"
    >
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand">
        <Icon name="star" className="h-4 w-4" />
        <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-brand/40 [animation-duration:2.4s]" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-brand-light">
          {tr('Bonus running until {d}', { d: dm(r.ends_at) })}
        </span>
        <span className="block truncate text-[13px] font-semibold">{r.label.trim()}</span>
      </span>
      <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-xs font-bold tabular-nums">+{Number(r.points)}</span>
      {live.length > 1 && (
        <span className="shrink-0 text-[11px] font-semibold text-white/70">{tr('+{n} more', { n: live.length - 1 })}</span>
      )}
    </button>
  )
}
