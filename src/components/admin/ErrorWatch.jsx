import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Skeleton } from '../ui'
import Icon from '../Icon'
import { cx, timeAgo } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// IS ANYTHING BROKEN RIGHT NOW.
//
// Ethan: "did you build something into analytics to track errors from it, or do
// I have to actually check the Sentry website?"
//
// Sentry is kept and is the right tool for DEBUGGING one crash: stack traces,
// breadcrumbs, which release it started in. It is the wrong tool for the
// question an admin has while looking at the panel, which is the one above -
// that needs no login, no second tab, and no reading of stack frames.
//
// SO THIS IS A LIST OF PROBLEMS, NOT A LIST OF EVENTS. `report_client_error`
// fingerprints on the message and the route with ids and numbers filed off
// (migration 199), so one fault that hit forty creators is one row saying forty,
// not forty rows to scroll past. That is the difference between a thing you
// glance at and a thing you avoid opening.
//
// TICKING ONE OFF IS NOT DELETING IT. `resolved_at` hides it, and the RPC clears
// that the moment the same fingerprint arrives again - so a fault you thought
// you had fixed comes back to the top of the list rather than staying hidden.
export default function ErrorWatch() {
  const tr = useT()
  const { user } = useAuth()
  const [rows, setRows] = useState(null)
  const [showResolved, setShowResolved] = useState(false)

  async function load() {
    const { data } = await supabase
      .from('client_errors')
      .select('*')
      .order('last_seen_at', { ascending: false })
      .limit(50)
    setRows(data ?? [])
  }
  useEffect(() => { load() }, [])

  async function resolve(row, done) {
    setRows((prev) => prev.map((r) => (r.fingerprint === row.fingerprint
      ? { ...r, resolved_at: done ? new Date().toISOString() : null } : r)))
    const { error } = await supabase.from('client_errors')
      .update({ resolved_at: done ? new Date().toISOString() : null, resolved_by: done ? user.id : null })
      .eq('fingerprint', row.fingerprint)
    // The result is read: a refused update resolves like a successful one in
    // supabase-js, and a fault silently un-ticked is one nobody looks at again.
    if (error) load()
  }

  const open = (rows || []).filter((r) => !r.resolved_at)
  const done = (rows || []).filter((r) => r.resolved_at)
  const shown = showResolved ? done : open

  return (
    <section className="mt-10">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{tr('Errors creators hit')}</h2>
          <p className="mt-0.5 text-sm text-smoke">
            {tr('Every crash that showed somebody the "Mayday" screen, grouped by fault. Full stack traces are in Sentry.')}
          </p>
        </div>
        {done.length > 0 && (
          <button
            type="button"
            onClick={() => setShowResolved((v) => !v)}
            className="btn-secondary !py-2 text-xs"
          >
            {showResolved ? tr('Show open') : `${tr('Show ticked off')} (${done.length})`}
          </button>
        )}
      </div>

      {!rows && <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-16 w-full rounded-card" />)}</div>}

      {rows && shown.length === 0 && (
        <div className="flex items-center gap-3 rounded-card border border-green-200 bg-green-50 px-5 py-4">
          <Icon name="check" className="h-5 w-5 shrink-0 text-green-700" />
          <p className="text-sm font-medium text-green-800">
            {showResolved ? tr('Nothing ticked off yet.') : tr('Nothing has crashed. This is the state you want it in.')}
          </p>
        </div>
      )}

      <div className="space-y-2">
        {shown.map((r) => (
          <div
            key={r.fingerprint}
            className={cx(
              'flex flex-col gap-3 rounded-card border p-4 sm:flex-row sm:items-center',
              // MORE THAN ONE PERSON IS A DIFFERENT PROBLEM FROM ONE PERSON, and
              // it is the only distinction on this list worth a colour: one is a
              // bug, the other is often one creator's extension or a stale tab.
              r.people > 1 ? 'border-red-200 bg-red-50/50' : 'border-gray-100 bg-white',
            )}
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{r.message}</p>
              <p className="mt-1 truncate text-xs text-smoke">
                <code className="rounded bg-cloud px-1.5 py-0.5">{r.route || '/'}</code>
                {' · '}{tr('last')} {timeAgo(r.last_seen_at)}
                {r.release ? ` · ${r.release.slice(0, 7)}` : ''}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-4">
              <span className="text-center">
                <span className="block text-sm font-bold tabular-nums">{r.people}</span>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">
                  {r.people === 1 ? tr('person') : tr('people')}
                </span>
              </span>
              <span className="text-center">
                <span className="block text-sm font-bold tabular-nums">{r.hits}</span>
                <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">{tr('times')}</span>
              </span>
              <button
                type="button"
                onClick={() => resolve(r, !r.resolved_at)}
                className="btn-secondary !py-2 !px-3 text-xs"
              >
                {r.resolved_at ? tr('Reopen') : tr('Tick off')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
