import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Select, Spinner } from '../ui'
import Icon from '../Icon'
import { timeAgo } from '../../lib/utils'
import { supabase } from '../../lib/supabase'
import {
  CADENCES,
  describeSyncError,
  saveViewSyncSettings,
  startViewSync,
  viewSyncBacklog,
  viewSyncStatus,
} from '../../lib/viewSync'

// The controls for automatic view counts, above the entry list on the results
// page - which is exactly where an admin used to sit opening forty links and
// typing forty numbers.
//
// There is no on/off switch, and no per-challenge opt in. Reading views off the
// link is how a view count arrives now, on every challenge, running and future.
//
// A run is STARTED, not awaited. The first version held the request open for the
// whole sweep, so the button sat there doing nothing visible, the browser gave
// up, and pressing it again started a second overlapping run. Now the function
// answers immediately and this polls the progress it publishes.

const POLL_MS = 1500

function nextDue(lastRunAt, intervalHours) {
  if (!lastRunAt) return 'due now'
  const mins = Math.round((new Date(lastRunAt).getTime() + intervalHours * 3600_000 - Date.now()) / 60000)
  if (mins <= 0) return 'due now'
  if (mins < 60) return `in ${mins} min`
  const hrs = Math.round(mins / 60)
  return hrs < 48 ? `in ${hrs} hours` : `in ${Math.round(hrs / 24)} days`
}

function Stat({ label, children }) {
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-smoke">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{children}</p>
    </div>
  )
}

export default function ViewSyncPanel({ challengeId, submissions = [], onSynced }) {
  const [status, setStatus] = useState(null)
  const [backlog, setBacklog] = useState(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  const pollRef = useRef(null)
  const wasRunning = useRef(false)

  const refresh = useCallback(async () => {
    try {
      const [next, queue] = await Promise.all([viewSyncStatus(), viewSyncBacklog().catch(() => null)])
      setStatus(next)
      if (queue) setBacklog(queue)
      return next
    } catch (e) {
      setError(e.message ?? 'Could not read the sync status.')
      return null
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  // Poll only while a run is going, and reload the entries the moment it stops.
  useEffect(() => {
    const running = status?.run?.running === true
    if (running) wasRunning.current = true

    if (running && !pollRef.current) pollRef.current = setInterval(refresh, POLL_MS)
    if (!running && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
      if (wasRunning.current) {
        wasRunning.current = false
        // REBUILD THE SAVED BOARD THE INSTANT THE RUN ENDS.
        //
        // A minute-by-minute reconciler in the database catches every path
        // eventually, which is what stops this drifting again. But a person who
        // just pressed "Sync now" is looking at the podium right now, and "it
        // said it synced and nothing changed" is exactly the bug this fixes -
        // so the one path with a human waiting on it does not wait.
        supabase.rpc('rebuild_challenge_results', { p_challenge: challengeId })
          .then(() => onSynced?.())
      }
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [status?.run?.running, refresh, onSynced, challengeId])

  const settings = status?.settings ?? { interval_hours: 24 }
  const run = status?.run ?? {}
  const running = run.running === true
  const lastRun = status?.last_run ?? null

  // Instagram is deliberately absent: it needs no credential at all since the
  // reader moved to the public reels tab, so there is nothing here that can be
  // missing or expired for it.
  const connected = {
    YouTube: status?.youtube_key === true,
  }

  // Grouped by REASON rather than listed row by row: an admin needs to know
  // "one of these is a photo post" once, not once per entry.
  const problems = submissions.reduce((acc, s) => {
    if (!s.views_sync_error) return acc
    ;(acc[s.views_sync_error] ??= []).push(s)
    return acc
  }, {})
  const problemList = Object.entries(problems)
    .map(([code, rows]) => ({ code, rows, meta: describeSyncError(code) }))
    .sort((a, b) => Number(b.meta.needsAttention) - Number(a.meta.needsAttention))

  // A missing or rejected credential is the one thing here a person has to go
  // and fix, and the place to fix it is /admin/connections. Everything else on
  // this page is about THIS challenge.
  const credentialTrouble =
    !!status && (!connected.YouTube || !!problems.youtube_key_rejected)

  // WHEN EVERY INSTAGRAM ENTRY FAILS AT ONCE, THE LINKS ARE NOT THE PROBLEM.
  //
  // Instagram view counts come from one of Meta's saved queries, and Meta
  // renumbers those from time to time. When it happens every Instagram entry
  // stops reading in the same sweep and each one reports, individually, that its
  // link goes nowhere - which reads as forty broken links rather than one broken
  // query, and sends an admin chasing creators for numbers that are fine.
  //
  // One post failing is a post. All of them failing is the query. The panel is
  // the only place that can tell the difference, because it is the only place
  // that sees them together.
  const igRows = submissions.filter((s) => s.platform === 'Instagram')
  const igFailed = igRows.filter((s) => s.views_sync_error === 'no_video_id' || s.views_sync_error === 'not_on_reels_tab')
  const instagramLooksBroken = igRows.length >= 3 && igFailed.length === igRows.length

  const automatic = submissions.filter((s) => s.views_source && s.views_source !== 'manual').length
  const pct = running && run.total ? Math.round((run.done / run.total) * 100) : 0
  const queued = backlog?.stale ?? 0

  async function runNow() {
    setStarting(true)
    setError('')
    try {
      // force: pressing this means "read these now". Without it the sweep's
      // staleness rule applies, and a button that does nothing because
      // everything was read four hours ago is a button that looks broken.
      const r = await startViewSync({ challengeId, force: true })
      if (r.busy) setError('A sync is already running.')
      await refresh()
    } catch (e) {
      setError(e.message ?? 'The sync could not be started.')
    }
    setStarting(false)
  }

  async function updateCadence(intervalHours) {
    setStatus((s) => ({ ...s, settings: { ...(s?.settings ?? {}), interval_hours: intervalHours } }))
    try {
      await saveViewSyncSettings({ intervalHours })
      refresh()
    } catch (e) {
      setError(e.message ?? 'Could not save that setting.')
      refresh()
    }
  }

  return (
    <section className="mb-8 overflow-hidden rounded-card border border-gray-100 shadow-card">
      {/* ---- The action, given the room an action deserves ---- */}
      <div className="flex flex-col gap-5 border-b border-gray-100 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Icon name="eye" className="h-5 w-5 shrink-0 text-brand" />
            View counts
          </h2>
          <p className="mt-1 max-w-sm text-sm leading-relaxed text-smoke">
            Read off each entry&apos;s link automatically.
            <br />
            Type in number at the end to override the automation.
          </p>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-smoke">Every</span>
            <Select
              ariaLabel="How often view counts are read"
              value={settings.interval_hours ?? 24}
              onChange={updateCadence}
              options={CADENCES.map((c) => ({ value: c.hours, label: c.short }))}
            />
          </label>
          <button
            type="button"
            className="btn-primary !px-6 !py-2.5 text-sm"
            onClick={runNow}
            disabled={starting || running}
          >
            {starting || running ? <Spinner className="h-4 w-4" /> : null}
            {running ? `Reading ${run.done ?? 0} of ${run.total ?? 0}` : starting ? 'Starting…' : 'Sync now'}
          </button>
        </div>
      </div>

      {running ? (
        <div className="h-1 w-full bg-cloud">
          <div className="h-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      ) : null}

      {/* ---- Facts, evenly spaced instead of crowded to one side ---- */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 px-5 py-5 sm:grid-cols-4 sm:px-7">
        <Stat label="Last read">{lastRun?.at ? timeAgo(lastRun.at) : 'never'}</Stat>
        <Stat label="Next">{nextDue(lastRun?.at, settings.interval_hours ?? 24)}</Stat>
        <Stat label="This challenge">
          <span className="tabular-nums">{automatic} of {submissions.length}</span> automatic
        </Stat>
        <Stat label="Waiting to read">
          {queued > 0 ? <span className="tabular-nums">{queued} entries</span> : 'nothing'}
        </Stat>
      </dl>

      {error ? <p className="px-5 pb-5 text-sm text-brand sm:px-7">{error}</p> : null}

      {/* ---- What needs a person, said loudly enough to notice ---- */}
      {problemList.length > 0 ? (
        <div className="space-y-3 border-t border-gray-100 px-5 py-5 sm:px-7">
          {problemList.map(({ code, rows, meta }) => (
            <div
              key={code}
              className={
                meta.needsAttention
                  ? 'flex items-start gap-3 rounded-card border border-amber-200 bg-amber-50/70 px-4 py-3'
                  : 'flex items-start gap-3 rounded-card bg-cloud/60 px-4 py-3'
              }
            >
              <Icon
                name={meta.needsAttention ? 'alert' : 'clock'}
                className={`mt-0.5 h-4 w-4 shrink-0 ${meta.needsAttention ? 'text-amber-700' : 'text-smoke'}`}
              />
              <div className="min-w-0">
                <p className={`text-sm font-semibold ${meta.needsAttention ? 'text-amber-900' : 'text-ink'}`}>
                  {meta.label}
                  <span className="ml-2 font-normal text-smoke">
                    {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
                  </span>
                </p>
                {meta.hint ? (
                  <p className={`mt-1 text-xs leading-relaxed ${meta.needsAttention ? 'text-amber-800' : 'text-smoke'}`}>
                    {meta.hint}
                  </p>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {instagramLooksBroken ? (
        <div className="border-t border-gray-100 bg-amber-50/60 px-5 py-4 sm:px-7">
          <p className="text-sm font-semibold text-amber-800">
            Every Instagram entry failed to read
          </p>
          <p className="mt-0.5 text-xs leading-relaxed text-amber-900/80">
            {igRows.length} of {igRows.length} could not be read in the same run. That is almost never
            {' '}{igRows.length} bad links — it usually means Instagram has renumbered the query we read
            view counts from. Pasting the new id fixes every entry at once.
          </p>
          <Link
            to="/admin/connections"
            className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline"
          >
            <Icon name="link" className="h-4 w-4" />
            Update the Instagram query id
          </Link>
        </div>
      ) : null}

      {credentialTrouble ? (
        <div className="border-t border-gray-100 px-5 py-4 sm:px-7">
          <Link
            to="/admin/connections"
            className="inline-flex items-center gap-2 text-sm font-semibold text-brand hover:underline"
          >
            <Icon name="alert" className="h-4 w-4" />
            YouTube needs reconnecting
          </Link>
        </div>
      ) : null}
    </section>
  )
}
