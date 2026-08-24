import { useCallback, useEffect, useRef, useState } from 'react'
import { Select, Spinner } from '../ui'
import Icon from '../Icon'
import { timeAgo } from '../../lib/utils'
import {
  CADENCES,
  describeSyncError,
  saveViewSyncSecret,
  saveViewSyncSettings,
  startViewSync,
  viewSyncStatus,
} from '../../lib/viewSync'

// The controls for automatic view counts, above the entry list on the results
// page - which is exactly where an admin used to sit opening forty links and
// typing forty numbers.
//
// There is no on/off switch. Reading views off the link is how a view count
// arrives now, on every challenge, running and future; a per-challenge opt-in
// would only ever be a way to end up with a stale leaderboard nobody noticed.
// Typing a number by hand still wins on that row and marks it manual.
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

const CREDENTIALS = [
  { name: 'instagram_sessionid', label: 'Instagram session', placeholder: 'sessionid', platform: 'Instagram' },
  { name: 'youtube_api_key', label: 'YouTube API key', placeholder: 'AIza…', platform: 'YouTube' },
]

export default function ViewSyncPanel({ challengeId, submissions = [], onSynced }) {
  const [status, setStatus] = useState(null)
  const [starting, setStarting] = useState(false)
  const [showKeys, setShowKeys] = useState(false)
  // Once the admin has opened or closed this themselves, stop deciding for them.
  const [keysTouched, setKeysTouched] = useState(false)
  const [draft, setDraft] = useState({ instagram_sessionid: '', youtube_api_key: '' })
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')
  const pollRef = useRef(null)
  const wasRunning = useRef(false)

  const refresh = useCallback(async () => {
    try {
      const next = await viewSyncStatus()
      setStatus(next)
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

    if (running && !pollRef.current) {
      pollRef.current = setInterval(refresh, POLL_MS)
    }
    if (!running && pollRef.current) {
      clearInterval(pollRef.current)
      pollRef.current = null
      if (wasRunning.current) {
        wasRunning.current = false
        onSynced?.()
      }
    }
    return () => {
      if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null }
    }
  }, [status?.run?.running, refresh, onSynced])

  const settings = status?.settings ?? { interval_hours: 24 }
  const run = status?.run ?? {}
  const running = run.running === true
  const lastRun = status?.last_run ?? null

  const connected = {
    Instagram: status?.instagram_session === true,
    YouTube: status?.youtube_key === true,
  }

  const problems = submissions.reduce((acc, s) => {
    if (!s.views_sync_error) return acc
    ;(acc[s.views_sync_error] ??= []).push(s)
    return acc
  }, {})

  // A credential problem is the one thing here that needs a human, so the fields
  // open themselves when there is one and stay folded away when there is not.
  // Gated on `status` because before it loads nothing is "connected" yet, and
  // without that the block flashed open on every visit.
  const credentialTrouble =
    !!status && (
      !connected.Instagram || !connected.YouTube ||
      !!problems.session_expired || !!problems.youtube_key_rejected
    )
  useEffect(() => {
    if (status && !keysTouched) setShowKeys(credentialTrouble)
  }, [status, credentialTrouble, keysTouched])

  const automatic = submissions.filter((s) => s.views_source && s.views_source !== 'manual').length

  async function runNow() {
    setStarting(true)
    setError('')
    try {
      const r = await startViewSync({ challengeId })
      if (r.busy) setError('A sync is already running. Watch it below.')
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
    } catch (e) {
      setError(e.message ?? 'Could not save that setting.')
      refresh()
    }
  }

  async function storeSecret(name) {
    setSaving(name)
    setError('')
    try {
      await saveViewSyncSecret(name, draft[name].trim())
      setDraft((d) => ({ ...d, [name]: '' }))
      await refresh()
    } catch (e) {
      setError(e.message ?? 'Could not save that credential.')
    }
    setSaving('')
  }

  const pct = running && run.total ? Math.round((run.done / run.total) * 100) : 0

  return (
    <section className="mb-8 rounded-card border border-gray-100 p-5 shadow-card sm:p-7">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold">
          <Icon name="eye" className="h-5 w-5 text-brand" />
          View counts
        </h2>
        <p className="mt-1 text-sm text-smoke">
          Read off each entry&apos;s link automatically. Type a number in any row to override it.
        </p>
      </div>

      {/* Facts, deliberately not cards: a card is a promise of a destination. */}
      <dl className="mt-5 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-smoke">Last read</dt>
          <dd className="mt-0.5 font-medium">{lastRun?.at ? timeAgo(lastRun.at) : 'never'}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-smoke">Next</dt>
          <dd className="mt-0.5 font-medium">{nextDue(lastRun?.at, settings.interval_hours ?? 24)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-smoke">This challenge</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {automatic} of {submissions.length} automatic
          </dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button
          type="button"
          className="btn-primary !py-2 text-sm"
          onClick={runNow}
          disabled={starting || running}
        >
          {starting || running ? <Spinner className="h-4 w-4" /> : null}
          {running ? `Reading ${run.done ?? 0} of ${run.total ?? 0}` : starting ? 'Starting…' : 'Sync now'}
        </button>

        <span className="flex items-center gap-2 text-sm">
          <span className="text-smoke">Runs</span>
          <Select
            ariaLabel="How often view counts are read"
            className="w-auto"
            value={settings.interval_hours ?? 24}
            onChange={updateCadence}
            options={CADENCES.map((c) => ({ value: c.hours, label: c.label }))}
          />
        </span>
      </div>

      {running ? (
        <div className="mt-4">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-cloud">
            <div className="h-full rounded-full bg-brand transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      ) : null}

      {!running && run.finished_at ? (
        <p className="mt-4 text-sm">
          Read {run.total} {run.total === 1 ? 'entry' : 'entries'},{' '}
          <strong className="tabular-nums">{run.updated}</strong> refreshed
          {run.failed ? `, ${run.failed} need a look` : ''}.
        </p>
      ) : null}

      {error ? <p className="mt-4 text-sm text-brand">{error}</p> : null}

      {Object.keys(problems).length > 0 ? (
        <ul className="mt-5 space-y-3 border-t border-gray-100 pt-5">
          {Object.entries(problems).map(([code, rows]) => {
            const meta = describeSyncError(code)
            return (
              <li key={code} className="text-sm">
                <span className="font-medium">{meta.label}</span>
                <span className="text-smoke"> · {rows.length} {rows.length === 1 ? 'entry' : 'entries'}</span>
                {meta.hint ? <p className="mt-0.5 text-xs leading-relaxed text-smoke">{meta.hint}</p> : null}
              </li>
            )
          })}
        </ul>
      ) : null}

      {/* The credentials are touched about once a year, so they stay out of the
          way until one of them is actually the problem. */}
      <div className="mt-5 border-t border-gray-100 pt-5">
        <button
          type="button"
          className="flex items-center gap-2 text-sm text-smoke transition-colors hover:text-brand"
          onClick={() => { setKeysTouched(true); setShowKeys((v) => !v) }}
        >
          <span className={credentialTrouble ? 'font-medium text-brand' : ''}>
            {credentialTrouble
              ? 'Instagram or YouTube needs attention'
              : 'Instagram and YouTube connected'}
          </span>
          <Icon name="chevronRight" className={`h-3.5 w-3.5 transition-transform ${showKeys ? '-rotate-90' : 'rotate-90'}`} />
        </button>

        {showKeys ? (
          <div className="mt-4 max-w-xl space-y-4">
            {CREDENTIALS.map((f) => (
              <div key={f.name}>
                <div className="mb-1.5 flex items-baseline gap-2">
                  <span className="label !mb-0">{f.label}</span>
                  <span className={connected[f.platform] ? 'text-xs text-green-700' : 'text-xs text-brand'}>
                    {connected[f.platform] ? 'connected' : 'not set'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <input
                    type="password"
                    autoComplete="off"
                    className="input min-w-[16rem] flex-1 !w-auto"
                    placeholder={f.placeholder}
                    value={draft[f.name]}
                    onChange={(e) => setDraft((d) => ({ ...d, [f.name]: e.target.value }))}
                    onKeyDown={(e) => e.key === 'Enter' && draft[f.name].trim() && storeSecret(f.name)}
                  />
                  <button
                    type="button"
                    className="btn-secondary !py-2 text-sm"
                    onClick={() => storeSecret(f.name)}
                    disabled={saving === f.name || !draft[f.name].trim()}
                  >
                    {saving === f.name ? 'Saving…' : connected[f.platform] ? 'Replace' : 'Save'}
                  </button>
                </div>
              </div>
            ))}
            <p className="text-xs leading-relaxed text-smoke">
              The YouTube key does not expire. The Instagram session does, and the entries will say so when it
              has, at which point paste a fresh one.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
