import Icon from './Icon'
import { BADGES, earnedBadges } from '../lib/badges'
import { cx } from '../lib/utils'

// A single brand-orange medallion with a hover tooltip showing the requirement.
function Medallion({ badge, on }) {
  return (
    <div className="group relative flex w-[72px] flex-col items-center gap-1.5 text-center">
      <div
        className={cx(
          'flex h-14 w-14 items-center justify-center rounded-full ring-1 transition-transform',
          on
            ? 'bg-gradient-to-br from-brand to-brand-light text-white shadow-card ring-white/40 group-hover:-translate-y-0.5'
            : 'bg-gray-100 text-gray-300 ring-gray-100'
        )}
      >
        <Icon name={badge.icon} className="h-6 w-6" strokeWidth={2} />
      </div>
      <span className={cx('text-[11px] font-medium leading-tight', on ? 'text-ink' : 'text-gray-300')}>{badge.name}</span>
      {/* Tooltip: the requirement, shown for earned and locked alike. */}
      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden w-44 -translate-x-1/2 rounded-lg bg-ink px-3 py-2 text-[11px] font-medium leading-snug text-white shadow-lift group-hover:block">
        <span className="block font-semibold">{badge.name}</span>
        <span className="text-white/80">{on ? 'Earned · ' : ''}{badge.desc}</span>
      </div>
    </div>
  )
}

// Grid of achievement badges. By default shows only earned ones; pass showLocked
// (e.g. on your own profile) to show the full set with locked ones greyed out.
export default function AchievementBadges({ stats, showLocked = false }) {
  const earned = earnedBadges(stats)
  if (earned.length === 0 && !showLocked) return null
  const list = showLocked ? BADGES.map((b) => ({ badge: b, on: b.earned(stats) })) : earned.map((b) => ({ badge: b, on: true }))
  return (
    <div className="grid grid-cols-4 justify-items-center gap-y-5 sm:grid-cols-7">
      {list.map(({ badge, on }) => <Medallion key={badge.key} badge={badge} on={on} />)}
    </div>
  )
}
