import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import { cx } from '../../lib/utils'
import { criterionLabel, criterionNeed, milestoneFraction, routeState } from '../../lib/milestones'

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

  const { reached, total, next, last, blocked } = routeState(rows)
  // The "N% of the route so far" line is gone. The dot row directly above it
  // already draws exactly that fraction, at a glance and without arithmetic,
  // and "36%" has to be converted back into something meaningful before it
  // means anything. Ethan: "it's not needed, we can visually see the progress
  // bar."
  // How far into the NEXT stop, across all of its requirements rather than the
  // one metric a milestone used to carry.
  const nextPct = next ? Math.round(milestoneFraction(next) * 100) : 100

  return (
    <div className={cx('rounded-card border border-gray-100 bg-white p-5', className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <Icon name="plane" className="h-4 w-4 text-brand" />
          {own ? 'Your milestones' : 'Milestones'}
        </h3>
        <span className="text-xs font-semibold text-brand">{reached} / {total}</span>
      </div>

      {/* Stops reached, as dots rather than a percentage. Eleven dots with four
          filled is instantly legible; "36%" needs converting back into
          something meaningful before it means anything.
          A stop that is EARNED but gated behind an earlier one gets its own
          shade - it is neither done nor untouched, and flattening it into
          "not done" is what made the old ladder look arbitrary. */}
      <div className="flex flex-wrap items-center gap-1">
        {rows.map((r, i) => (
          <span
            key={r.id}
            title={`${r.title}${r.reached ? ' · reached' : r.blocked ? ' · earned, waiting on an earlier stop' : ''}`}
            className={cx(
              'h-2 flex-1 rounded-full transition-colors',
              r.reached ? 'bg-brand' : r.blocked ? 'bg-amber-300' : i === reached ? 'bg-brand/30' : 'bg-cloud',
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
          {own ? (
            <>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white">
                <div className="h-full rounded-full bg-brand transition-all duration-700" style={{ width: `${nextPct}%` }} />
              </div>
              <ul className="mt-2 space-y-1">
                {(next.criteria || []).map((c) => (
                  <li key={c.metric} className="flex items-start gap-1.5 text-[11px] leading-tight">
                    <Icon
                      name={c.done ? 'check' : 'clock'}
                      className={cx('mt-px h-3 w-3 shrink-0', c.done ? 'text-green-600' : 'text-gray-300')}
                    />
                    <span className={c.done ? 'text-smoke line-through decoration-green-600/40' : 'text-smoke'}>
                      {criterionLabel(c)}
                    </span>
                  </li>
                ))}
              </ul>
              {next.reward && <p className="mt-1.5 text-[11px] font-medium text-brand">{next.reward}</p>}
            </>
          ) : (
            /* Somebody else's profile shows what the stop ASKS for and not how
               close they are to it. How many views a creator has is theirs to
               publish on the route page, not something a profile visitor gets
               itemised down to the video. */
            <p className="mt-1 text-[11px] text-smoke">
              {(next.criteria || []).map(criterionNeed).join(' · ')}
            </p>
          )}
        </div>
      )}

      {own && blocked.length > 0 && (
        <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-tight text-amber-700">
          <Icon name="alert" className="mt-px h-3 w-3 shrink-0" />
          {blocked.length} {blocked.length === 1 ? 'stop is' : 'stops are'} already earned and waiting behind this one.
        </p>
      )}

      {own && (
        <Link to="/milestones" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-brand transition-transform duration-200 hover:translate-x-0.5">
          See the whole route <Icon name="chevronRight" className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  )
}
