import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import { cx } from '../../lib/utils'
import { fractionOf, requirementLine } from './MilestoneLadder'

// HOW FAR UP THE LADDER SOMEBODY IS, SMALL ENOUGH FOR A PROFILE.
//
// The full ladder is a page. This is the sentence version of it: how many,
// what is next, and a bar. It replaced the row of achievement badges on a
// profile - one line that means something instead of nine icons that meant
// nothing.
//
// It fetches for itself rather than taking props because it appears on profiles
// belonging to OTHER people, where the parent has no reason to have loaded a
// milestone list. One RPC, cached by the browser for the length of the visit.
//
// TWO THINGS CHANGED WITH THE REST OF THE FEATURE:
//
//   IT IS CALLED MILESTONES. It said "Your route", which was a name invented
//   for a drawing that no longer exists.
//
//   THE NEXT ONE IS THE FIRST UNREACHED ONE, NOT `rows[reachedCount]`. Same
//   arithmetic bug the drawing had: milestones are ordered by sort_order and
//   measured on five metrics that move at five speeds, so the ones somebody has
//   reached are not the first n in the list. On a profile that showed up as
//   "heading for" a milestone the creator had already got.
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

  const reached = rows.filter((r) => r.reached)
  const next = rows.find((r) => !r.reached) || null
  const last = [...reached].pop() || null
  const pct = Math.round((reached.length / rows.length) * 100)
  const nextPct = next ? Math.round(fractionOf(next) * 100) : 100

  return (
    <div className={cx('rounded-card border border-gray-100 bg-white p-5', className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon name="flag" className="h-4 w-4 text-brand" />
          Milestones
        </h3>
        <span className="text-xs font-semibold text-brand">{reached.length} / {rows.length}</span>
      </div>

      {/* Reached ones as blocks rather than a percentage. Eleven blocks with
          four filled is instantly legible; "36%" has to be converted back into
          something meaningful before it means anything. */}
      <div className="flex items-center gap-1">
        {rows.map((r) => (
          <span
            key={r.id}
            title={`${r.title}${r.reached ? ' · reached' : ''}`}
            className={cx(
              'h-2 flex-1 rounded-full transition-colors',
              r.reached ? 'bg-brand' : next && r.id === next.id ? 'bg-brand/30' : 'bg-cloud',
            )}
          />
        ))}
      </div>

      <p className="mt-3 text-xs text-smoke">
        {last ? <>Last one reached: <span className="font-medium text-ink">{last.title}</span></> : 'Not started yet'}
      </p>

      {next && (
        <div className="mt-3 rounded-xl bg-cloud/70 px-3 py-2.5">
          <p className="text-xs font-semibold">
            {own ? 'Next up' : 'Working towards'}: {next.title}
          </p>
          {own && (
            <>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${nextPct}%` }} />
              </div>
              <p className="mt-1.5 text-[11px] text-smoke">
                {requirementLine(next.metric, next.value, next.threshold)}
                {next.reward ? ` · ${next.reward}` : ''}
              </p>
            </>
          )}
        </div>
      )}

      {own && (
        <Link to="/milestones" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand transition-transform duration-200 hover:translate-x-0.5">
          See every milestone <Icon name="chevronRight" className="h-3.5 w-3.5" />
        </Link>
      )}
      {!own && <p className="mt-2 text-[11px] text-smoke">{pct}% of the ladder so far.</p>}
    </div>
  )
}
