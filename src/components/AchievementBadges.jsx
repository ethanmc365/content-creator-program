import Icon from './Icon'
import { BADGES, earnedBadges } from '../lib/badges'
import { cx } from '../lib/utils'

// A single brand-orange medallion.
function Medallion({ badge, on }) {
  return (
    <div className="flex w-[72px] flex-col items-center gap-1.5 text-center" title={badge.desc}>
      <div
        className={cx(
          'flex h-14 w-14 items-center justify-center rounded-full ring-1 transition-transform',
          on
            ? 'bg-gradient-to-br from-brand to-brand-light text-white shadow-card ring-white/40 hover:-translate-y-0.5'
            : 'bg-gray-100 text-gray-300 ring-gray-100'
        )}
      >
        <Icon name={badge.icon} className="h-6 w-6" strokeWidth={2} />
      </div>
      <span className={cx('text-[11px] font-medium leading-tight', on ? 'text-ink' : 'text-gray-300')}>{badge.name}</span>
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
    <div className="flex flex-wrap gap-4">
      {list.map(({ badge, on }) => <Medallion key={badge.key} badge={badge} on={on} />)}
    </div>
  )
}
