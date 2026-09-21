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
  // What the last press actually did, in words (see `finish`).
  const [outcome, setOutcome] = useState(null)
  const [before, setBefore] = useState(null)
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

  // A PRESS ALWAYS FINISHES VISIBLY (21 Sep 2026).
  //
  // Ethan, the night the Global Challenge opened: "I tried to sync the view
  // counts of the 1 video that has been submitted so far but it didn't seem to
  // work at all." It HAD worked - TikTok read 200, which is what the entry
  // already said - but the page never showed it. The rebuild and the reload
  // only ran when a poll had SEEN `running: true`, and one video is read in
  // under a second, inside the first 1.5s poll, so a small sync finished
  // unseen: no rebuilt board, no refreshed numbers, nothing on screen. Now
  // `runNow` finishes it itself when the run is already over, and the finish
  // says in words what was read and what moved.
  const finish = useCallback((st) => {
    const lr = st?.last_run || {}
    return supabase.rpc('rebuild_challenge_results', { p_challenge: challengeId })
      .then(() => onSynced?.())
      .finally(() => setOutcome({ ran: lr.ran ?? null, failed: lr.failed ?? 0 }))
  }, [challengeId, onSynced])


  // Poll only while a run is going, and finish the moment it stops.
  //
  // THIS NEVER FINISHED BEFORE (found 21 Sep 2026). It cleared the interval
  // in its cleanup and then, in the body, only finished if the interval was
  // still set - but React runs the cleanup first on the very render where
  // `running` flips to false, so that check was always false and the rebuild
  // and reload below never ran after ANY sync. `wasRunning` is the only
  // signal the body needs.
  const runningNow = status?.run?.running === true
  const lastRunNow = status?.last_run ?? null
  useEffect(() => {
    if (runningNow) {
      wasRunning.current = true
      const t = setInterval(refresh, POLL_MS)
      return () => clearInterval(t)
    }
    if (wasRunning.current) {
      wasRunning.current = false
      // REBUILD THE SAVED BOARD THE INSTANT THE RUN ENDS. A minute-by-minute
      // reconciler in the database catches every path eventually; a person
      // who just pressed "Sync now" is looking at the podium right now.
      finish({ last_run: lastRunNow })
    }
    return undefined
  }, [runningNow, lastRunNow, refresh, finish])

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
    setOutcome(null)
    setBefore(new Map(submissions.map((x) => [x.id, x.logged_views])))
    try {
      // force: pressing this means "read these now". Without it the sweep's
      // staleness rule applies, and a button that does nothing because
      // everything was read four hours ago is a button that looks broken.
      const r = await startViewSync({ challengeId, force: true })
      if (r.busy) setError('A sync is already running.')
      const st = await refresh()
      // Already over (a handful of videos): finish here, because no poll will.
      if (!r.busy && st && st.run?.running !== true) {
        wasRunning.current = false
        await finish(st)
      }
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

      {outcome ? (() => {
        const was = before
        const moved = was ? submissions.filter((x) => was.has(x.id) && was.get(x.id) !== x.logged_views) : []
        const n = outcome.ran ?? submissions.length
        return (
          <div className="mx-5 mb-5 flex items-start gap-3 rounded-card bg-brand-tint/50 px-4 py-3 sm:mx-7">
            <Icon name={outcome.failed ? 'alert' : 'check'} className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <div className="min-w-0 text-sm">
              <p className="font-semibold text-ink">
                Read {n} {n === 1 ? 'video' : 'videos'} just now{outcome.failed ? `, ${outcome.failed} could not be read` : ''}. Leaderboard rebuilt.
              </p>
              <p className="mt-0.5 text-xs text-ink/70">
                {moved.length === 0
                  ? 'No count had moved since the last read, so the numbers stay as they were.'
                  : moved.slice(0, 6).map((x) => `${x.profiles?.name?.split(' ')[0] || 'Entry'}: ${(was.get(x.id) ?? 0).toLocaleString()} to ${(x.logged_views ?? 0).toLocaleString()}`).join(' · ')}
              </p>
            </div>
          </div>
        )
      })() : null}

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
            {' '}{igRows.length} bad links. It usually means Instagram has renumbered the query we read
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
