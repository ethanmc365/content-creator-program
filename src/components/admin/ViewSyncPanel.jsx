import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Spinner } from '../ui'
import { pickClass } from '../../lib/pick'
import { cx } from '../../lib/utils'
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

export default function ViewSyncPanel({ challengeId, submissions = [], onSynced, onShowEntries, onSaveViews }) {
  const [status, setStatus] = useState(null)
  const [backlog, setBacklog] = useState(null)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')
  // What the last press actually did, in words (see `finish`).
  const [outcome, setOutcome] = useState(null)
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
  //
  // FACEBOOK IS ONE GROUP (28 Sep 2026). Facebook now answers every server with
  // its login page, so "platform refused", "count hidden" and "no count" were
  // three cards saying one thing: a person has to type these in. They share one
  // card with a box per entry, so it is done without scrolling to the list.
  const FB_CODES = new Set(['blocked', 'count_hidden', 'no_count_in_page', 'no_video_id'])
  const keyFor = (s) => (s.platform === 'Facebook' && FB_CODES.has(s.views_sync_error) ? 'facebook' : s.views_sync_error)
  const problems = submissions.reduce((acc, s) => {
    if (!s.views_sync_error) return acc
    ;(acc[keyFor(s)] ??= []).push(s)
    return acc
  }, {})
  const problemList = Object.entries(problems)
    .map(([code, rows]) => ({
      code,
      rows,
      meta: code === 'facebook'
        ? {
          label: 'Facebook: type the views in',
          hint: 'Facebook shows its videos only to people who are signed in, so no server can read them. Open each one, read the views, and type them in here. A typed number is kept, and the entry stops being flagged.',
          needsAttention: true,
        }
        : describeSyncError(code),
    }))
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

  // ONE COUNT, SAID THE SAME WAY IN BOTH PLACES (28 Sep 2026). Ethan: "it says
  // 192 of 193 automatic, but then it says 187 of 193 videos: 6 cannot be
  // read." The first counted every entry that had EVER been read automatically,
  // including five that failed this time; the second counted this run. Both now
  // count entries that have a number and nothing wrong with them.
  const flagged = submissions.filter((s) => s.views_sync_error).length
  const readFine = submissions.length - flagged
  const typed = submissions.filter((s) => s.views_source === 'manual' && !s.views_sync_error).length
  const pct = running && run.total ? Math.round((run.done / run.total) * 100) : 0
  const queued = backlog?.stale ?? 0

  async function runNow() {
    setStarting(true)
    setError('')
    setOutcome(null)
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
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        {/* No eye badge (2 Oct 2026, Ethan: "not necessary"). Just the title and the line. */}
        <div className="flex min-w-0 items-start gap-3">
          <div className="min-w-0">
            <h2 className="text-base font-semibold">View counts</h2>
            <p className="mt-0.5 max-w-md text-sm leading-relaxed text-smoke">
              Read off each entry&apos;s link automatically. Type in any entry&apos;s box below to override it.
            </p>
          </div>
        </div>
        <button
          type="button"
          className="btn-primary inline-flex shrink-0 items-center justify-center gap-2 !px-6 !py-2.5 text-sm"
          onClick={runNow}
          disabled={starting || running}
        >
          {starting || running ? <Spinner className="h-4 w-4" /> : <Icon name="refresh" className="h-4 w-4" />}
          {running ? `Reading ${Math.min(run.done ?? 0, run.total ?? 0)} of ${run.total ?? 0}` : starting ? 'Starting…' : 'Sync now'}
        </button>
      </div>

      {/* HOW OFTEN, AS CHIPS AND NOT A DROPDOWN (22 Sep 2026). Ethan: "when you
          click this and it shows the selection drop down... the bottom of it is
          cut off." The menu opened inside this card's `overflow-hidden`, which
          the progress bar needs. Six options fit on one row, so there is no menu
          to clip: every choice is visible and one press picks it. */}
      <div className="flex flex-col gap-2 border-t border-gray-100 px-5 py-4 sm:flex-row sm:items-center sm:gap-4 sm:px-7">
        <p className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.12em] text-smoke">Sync automatically every</p>
        <div role="radiogroup" aria-label="How often view counts are read" className="flex flex-wrap gap-1.5">
          {CADENCES.map((c) => {
            const on = Number(settings.interval_hours ?? 24) === c.hours
            return (
              <button
                key={c.hours}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => !on && updateCadence(c.hours)}
                className={cx('rounded-full border px-3 py-1.5 text-xs font-semibold', pickClass(on))}
              >
                {c.short}
              </button>
            )
          })}
        </div>
      </div>

      {running ? (
        <div className="h-1 w-full bg-cloud">
          <div className="h-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} />
        </div>
      ) : null}

      {/* ---- Facts, evenly spaced instead of crowded to one side ---- */}
      <dl className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-gray-100 bg-cloud/40 px-5 py-5 sm:grid-cols-4 sm:px-7">
        <Stat label="Last read">{lastRun?.at ? timeAgo(lastRun.at) : 'never'}</Stat>
        <Stat label="Next">{nextDue(lastRun?.at, settings.interval_hours ?? 24)}</Stat>
        <Stat label="This challenge">
          <span className="tabular-nums">{readFine} of {submissions.length}</span> read
          {typed > 0 && <span className="block text-xs font-medium text-smoke">{typed} typed in by hand</span>}
        </Stat>
        <Stat label="Waiting to read">
          {queued > 0 ? <span className="tabular-nums">{queued} entries</span> : 'nothing'}
        </Stat>
      </dl>

      {error ? <p className="px-5 pb-5 text-sm text-brand sm:px-7">{error}</p> : null}

      {/* ONE LINE, AND IT SAYS WHETHER IT WORKED (22 Sep 2026). Ethan: it
          should just say it read all the videos; the "Jessica: 3,000 to 3,014"
          list under it was noise. A failure still says how many, and the
          reasons are grouped just below. */}
      {outcome ? (() => {
        // Never more than there are entries: an old run could count a re-read twice.
        const n = submissions.length
        const failed = flagged
        const ok = !failed
        return (
          <div className={cx('mx-5 mb-5 flex items-center gap-3 rounded-card px-4 py-3 animate-fade-up sm:mx-7', ok ? 'bg-green-50' : 'bg-cloud')}>
            <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-white', ok ? 'bg-green-600' : 'bg-brand')}>
              <Icon name={ok ? 'check' : 'alert'} className="h-3.5 w-3.5" />
            </span>
            <p className="min-w-0 text-sm font-semibold text-ink">
              {ok
                ? `All ${n} ${n === 1 ? 'video' : 'videos'} read successfully. Leaderboard updated.`
                : `${n - failed} of ${n} videos read. ${failed} ${failed === 1 ? 'needs' : 'need'} a look, see below.`}
            </p>
          </div>
        )
      })() : null}

      {/* ---- What needs a person ----
          REDRAWN 26 Sep 2026. Ethan: "The UI for these errors needs to be
          improved. I don't like the current colour." The amber wash is gone:
          each reason is a white card with a brand disc when it needs you and a
          grey one when it will sort itself out, and the entries under it are
          chips you can open or pin. "Show entry" no longer scrolls you a
          hundred rows down; it lifts every entry with that reason to the top
          of the list, where the list starts. */}
      {problemList.length > 0 ? (
        <div className="grid gap-3 border-t border-gray-100 bg-cloud/30 px-5 py-5 sm:px-7">
          {problemList.map(({ code, rows, meta }, i) => (
            <div
              key={code}
              style={{ animationDelay: `${i * 50}ms` }}
              className="animate-fade-up rounded-2xl border border-gray-100 bg-white p-4 shadow-card"
            >
              <div className="flex items-start gap-3">
                <span className={cx(
                  'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
                  meta.needsAttention ? 'bg-brand text-white' : 'bg-cloud text-smoke',
                )}>
                  <Icon name={meta.needsAttention ? 'alert' : 'clock'} className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-ink">
                    {meta.label}
                    <span className={cx(
                      'rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums',
                      meta.needsAttention ? 'bg-brand-tint text-brand' : 'bg-cloud text-smoke',
                    )}>
                      {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
                    </span>
                  </p>
                  {meta.hint ? <p className="mt-1 text-xs leading-relaxed text-smoke">{meta.hint}</p> : null}
                </div>
                {onShowEntries && (
                  <button
                    type="button"
                    onClick={() => onShowEntries(rows.map((r) => r.id), meta.label)}
                    className="hidden shrink-0 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white transition-transform duration-200 hoverable:hover:-translate-y-0.5 sm:inline-flex"
                  >
                    {rows.length === 1 ? 'Show entry' : 'Show entries'}
                  </button>
                )}
              </div>
              <ul className={cx('mt-3', code === 'facebook' ? 'grid gap-2' : 'flex flex-wrap gap-1.5')}>
                {rows.map((r) => (code === 'facebook' && onSaveViews ? (
                  <FacebookRow key={r.id} row={r} onSave={onSaveViews} onShow={onShowEntries} />
                ) : (
                  <li key={r.id} className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full border border-gray-100 bg-cloud/50 py-1 pl-1 pr-1 text-xs">
                    {/* THE NAME LIFTS THAT ONE ENTRY TO THE TOP (28 Sep 2026).
                        Ethan: "if I click on 'Antonio posted a TikTok there', it
                        should just bring it to the top." */}
                    <button
                      type="button"
                      onClick={() => onShowEntries?.([r.id], `${r.profiles?.name?.split(' ')[0] || 'Entry'}'s ${r.platform}`)}
                      className="flex min-w-0 items-center gap-1.5 rounded-full text-left transition-colors hover:text-brand"
                      title="Show this entry at the top of the list"
                    >
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-[10px] font-bold text-brand">
                        {r.profiles?.photo_url
                          ? <img src={r.profiles.photo_url} alt="" className="h-full w-full object-cover" />
                          : (r.profiles?.name || '?').slice(0, 1)}
                      </span>
                      <span className="min-w-0 truncate font-semibold text-ink hover:text-brand">{r.profiles?.name || 'Unknown creator'}</span>
                      <span className="shrink-0 text-smoke">{r.platform}</span>
                    </button>
                    <a
                      href={r.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="shrink-0 rounded-full bg-white px-2 py-0.5 font-semibold text-brand shadow-sm hover:underline"
                    >
                      Open
                    </a>
                  </li>
                )))}
              </ul>
              {onShowEntries && (
                <button
                  type="button"
                  onClick={() => onShowEntries(rows.map((r) => r.id), meta.label)}
                  className="mt-3 w-full rounded-xl bg-ink py-2 text-xs font-semibold text-white sm:hidden"
                >
                  {rows.length === 1 ? 'Show entry' : 'Show entries'}
                </button>
              )}
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

// ONE FACEBOOK ENTRY: who, the link, and a box for the number. Saving goes
// through the results page's own save, so it rebuilds the board like any other
// typed number does.
function FacebookRow({ row, onSave, onShow }) {
  const [val, setVal] = useState(row.logged_views == null ? '' : String(row.logged_views))
  const [busy, setBusy] = useState(false)
  async function save() {
    const raw = val.replace(/\D+/g, '')
    if (raw === '' || raw === String(row.logged_views ?? '')) return
    setBusy(true)
    await onSave(row, raw)
    setBusy(false)
  }
  return (
    <li className="flex min-w-0 flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-cloud/40 p-2 text-xs sm:flex-nowrap">
      <button
        type="button"
        onClick={() => onShow?.([row.id], `${row.profiles?.name?.split(' ')[0] || 'Entry'}'s Facebook`)}
        className="flex min-w-0 flex-1 items-center gap-2 text-left"
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-full bg-white text-[10px] font-bold text-brand">
          {row.profiles?.photo_url ? <img src={row.profiles.photo_url} alt="" className="h-full w-full object-cover" /> : (row.profiles?.name || '?').slice(0, 1)}
        </span>
        <span className="min-w-0 truncate font-semibold text-ink">{row.profiles?.name || 'Unknown creator'}</span>
      </button>
      <a href={row.video_url} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-full bg-white px-3 py-1.5 font-semibold text-brand shadow-sm hover:underline">
        Open post
      </a>
      <form
        onSubmit={(e) => { e.preventDefault(); save() }}
        className="flex shrink-0 items-center gap-1.5"
      >
        <input
          type="text"
          inputMode="numeric"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={save}
          placeholder="Views"
          aria-label={`Views for ${row.profiles?.name || 'this entry'}`}
          className="no-ios-zoom w-24 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-right text-sm font-semibold tabular-nums outline-none focus:border-brand focus:ring-2 focus:ring-brand/15"
        />
        <button type="submit" disabled={busy} className="rounded-lg bg-brand px-3 py-1.5 font-semibold text-white disabled:opacity-60">
          {busy ? <Spinner className="h-3.5 w-3.5" /> : 'Save'}
        </button>
      </form>
    </li>
  )
}
