import { useNavigate } from 'react-router-dom'
import { cx } from '../../../lib/utils'

// THE ANALYTICS TABS, ON A CHALLENGE'S OWN PAGE TOO (14 Oct 2026). Opening a challenge from the Challenges tab used to
// drop the tab strip, so the only way back was Back. The page's tabs stay, with Challenges lit, and each one returns to
// /admin/analytics on that tab (the overview's data is kept for the session, so nothing reloads).
export default function AnalyticsTabs({ tabs, active = 'programme' }) {
  const navigate = useNavigate()
  return (
    <div className="mb-5 border-b border-gray-100">
      <div className="-mb-px flex gap-1 overflow-x-auto [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => navigate(t.key === 'overview' ? '/admin/analytics' : `/admin/analytics?tab=${t.key}`)}
            className={cx(
              'relative shrink-0 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors sm:px-4',
              active === t.key ? 'border-brand text-brand' : 'border-transparent text-smoke hover:text-ink',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}
