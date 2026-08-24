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

const CREDENTIALS = [
  { name: 'instagram_sessionid', label: 'Instagram session', placeholder: 'sessionid', platform: 'Instagram' },
  { name: 'youtube_api_key', label: 'YouTube API key', placeholder: 'AIza…', platform: 'YouTube' },
]

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
  const [showKeys, setShowKeys] = useState(false)
  const [keysTouched, setKeysTouched] = useState(false)
  const [draft, setDraft] = useState({ instagram_sessionid: '', youtube_api_key: '' })
  const [saving, setSaving] = useState('')
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

  const credentialTrouble =
    !!status && (
      !connected.Instagram || !connected.YouTube ||
      !!problems.session_expired || !!problems.youtube_key_rejected
    )
  useEffect(() => {
    if (status && !keysTouched) setShowKeys(credentialTrouble)
  }, [status, credentialTrouble, keysTouched])

  const automatic = submissions.filter((s) => s.views_source && s.views_source !== 'manual').length
  const pct = running && run.total ? Math.round((run.done / run.total) * 100) : 0
  const queued = backlog?.stale ?? 0

  async function runNow() {
    setStarting(true)
    setError('')
    try {
      const r = await startViewSync({ challengeId })
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
            Read off each entry&apos;s link automatically. Type a number in any row to override.
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

      {/* ---- Credentials: touched about once a year, so kept out of the way ---- */}
      <div className="border-t border-gray-100 px-5 py-4 sm:px-7">
        <button
          type="button"
          className="flex items-center gap-2 text-sm text-smoke transition-colors hover:text-brand"
          onClick={() => { setKeysTouched(true); setShowKeys((v) => !v) }}
        >
          <span className={credentialTrouble ? 'font-semibold text-brand' : ''}>
            {credentialTrouble ? 'Instagram or YouTube needs attention' : 'Instagram and YouTube connected'}
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
              The YouTube key does not expire. The Instagram session lasts months, and the entries will say so
              when it stops working.
            </p>
          </div>
        ) : null}
      </div>
    </section>
  )
}
