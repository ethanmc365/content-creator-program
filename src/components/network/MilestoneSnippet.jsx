import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import { cx, formatViews } from '../../lib/utils'

// Where somebody is on the route, small enough for a profile or a rail card.
//
// The full flight path is a page. This is the sentence version of it: how far
// along, what is next, and a bar. It is what replaces the row of achievement
// badges on a profile - one line that means something, instead of nine icons
// that meant nothing.
//
// It fetches for itself rather than taking props because it appears on profiles
// belonging to OTHER people, where the parent has no reason to have loaded a
// milestone list. One RPC, cached by the browser for the length of the visit.
export default function MilestoneSnippet({ profileId, own = false, className }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    if (!profileId) return undefined
    let alive = true
    supabase.rpc('milestone_progress', { p_profile: profileId })
      .then(({ data }) => { if (alive) setRows(data || []) })
    return () => { alive = false }
  }, [profileId])

  if (!rows || rows.length === 0) return null

  const reached = rows.filter((r) => r.reached).length
  const next = rows.find((r) => !r.reached) || null
  const last = [...rows].reverse().find((r) => r.reached) || null
  const pct = Math.round((reached / rows.length) * 100)
  const nextPct = next
    ? Math.max(0, Math.min(100, (Number(next.value || 0) / Number(next.threshold || 1)) * 100))
    : 100

  return (
    <div className={cx('rounded-card border border-gray-100 bg-white p-5', className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon name="plane" className="h-4 w-4 text-brand" />
          {own ? 'Your route' : 'On the route'}
        </h3>
        <span className="text-xs font-semibold text-brand">{reached} / {rows.length}</span>
      </div>

      {/* Stops reached, as dots rather than a percentage. Eleven dots with four
          filled is instantly legible; "36%" needs converting back into
          something meaningful before it means anything. */}
      <div className="flex flex-wrap items-center gap-1">
        {rows.map((r, i) => (
          <span
            key={r.id}
            title={`${r.title}${r.reached ? ' · reached' : ''}`}
            className={cx(
              'h-2 flex-1 rounded-full transition-colors',
              r.reached ? 'bg-brand' : i === reached ? 'bg-brand/30' : 'bg-cloud',
            )}
          />
        ))}
      </div>

      <p className="mt-3 text-xs text-smoke">
        {last ? <>Last stop: <span className="font-medium text-ink">{last.title}</span></> : 'Not started yet'}
      </p>

      {next && (
        <div className="mt-3 rounded-xl bg-cloud/70 px-3 py-2.5">
          <p className="text-xs font-semibold">
            {own ? 'Next up' : 'Heading for'}: {next.title}
          </p>
          {own && (
            <>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${nextPct}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-smoke">
                {next.metric === 'views'
                  ? `${formatViews(Number(next.value))} of ${formatViews(Number(next.threshold))} views`
                  : `${Math.floor(Number(next.value))} of ${Number(next.threshold)}`}
                {next.reward ? ` · ${next.reward}` : ''}
              </p>
            </>
          )}
        </div>
      )}

      {own && (
        <Link to="/milestones" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand transition-transform duration-200 hover:translate-x-0.5">
          See the whole route <Icon name="chevronRight" className="h-3.5 w-3.5" />
        </Link>
      )}
      {!own && <p className="mt-2 text-[11px] text-smoke">{pct}% of the route so far.</p>}
    </div>
  )
}
