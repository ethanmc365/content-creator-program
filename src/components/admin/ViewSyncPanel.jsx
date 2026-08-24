import { useCallback, useEffect, useState } from 'react'
import { Badge, Spinner, Toggle } from '../ui'
import Icon from '../Icon'
import { timeAgo } from '../../lib/utils'
import {
  CADENCES,
  describeSyncError,
  saveInstagramSession,
  saveViewSyncSettings,
  syncViews,
  viewSyncStatus,
} from '../../lib/viewSync'

// The controls for automatic view counts, shown above the entry list on the
// results page - which is exactly where an admin used to sit opening forty links
// and typing forty numbers.
//
// The schedule and the Instagram session are PROGRAMME-WIDE even though the
// panel lives on one challenge's page. That is deliberate: they are two settings
// that are only ever thought about while looking at a leaderboard, and a
// separate admin route for them would be a page nobody remembers exists.

function relative(iso) {
  if (!iso) return 'never'
  return timeAgo(iso)
}

function nextDue(lastRunAt, intervalHours) {
  if (!lastRunAt) return 'due now'
  const due = new Date(lastRunAt).getTime() + intervalHours * 3600_000
  const mins = Math.round((due - Date.now()) / 60000)
  if (mins <= 0) return 'due now'
  if (mins < 60) return `in ${mins} min`
  const hrs = Math.round(mins / 60)
  return hrs < 48 ? `in ${hrs} hours` : `in ${Math.round(hrs / 24)} days`
}

export default function ViewSyncPanel({ challengeId, submissions = [], onSynced }) {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [showSession, setShowSession] = useState(false)
  const [session, setSession] = useState('')
  const [savingSession, setSavingSession] = useState(false)
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setStatus(await viewSyncStatus())
    } catch (e) {
      setError(e.message ?? 'Could not read the sync status.')
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const settings = status?.settings ?? { enabled: true, interval_hours: 24 }
  const lastRun = status?.last_run ?? null
  const hasSession = status?.instagram_session === true

  // Group what went wrong by REASON rather than listing forty rows: an admin
  // needs to know "Instagram is not signed in" once, not seventeen times.
  const problems = submissions.reduce((acc, s) => {
    if (!s.views_sync_error) return acc
    ;(acc[s.views_sync_error] ??= []).push(s)
    return acc
  }, {})

  async function runNow() {
    setBusy(true)
    setResult(null)
    setError('')
    try {
      const r = await syncViews({ challengeId })
      setResult(r)
      await refresh()
      onSynced?.()
    } catch (e) {
      setError(e.message ?? 'The sync could not be run.')
    }
    setBusy(false)
  }

  async function updateSettings(patch) {
    const next = { enabled: settings.enabled, intervalHours: settings.interval_hours, ...patch }
    setStatus((s) => ({ ...s, settings: { enabled: next.enabled, interval_hours: next.intervalHours } }))
    try {
      await saveViewSyncSettings(next)
    } catch (e) {
      setError(e.message ?? 'Could not save that setting.')
      refresh()
    }
  }

  async function storeSession() {
    setSavingSession(true)
    setError('')
    try {
      await saveInstagramSession(session.trim())
      setSession('')
      setShowSession(false)
      await refresh()
    } catch (e) {
      setError(e.message ?? 'Could not save the session.')
    }
    setSavingSession(false)
  }

  return (
    <section className="mb-8 rounded-card border border-gray-100 p-5 shadow-card sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Icon name="eye" className="h-5 w-5 text-brand" />
            Automatic view counts
          </h2>
          <p className="mt-1 text-sm text-smoke">
            Reads each entry&apos;s view count off the link the creator submitted, so you do not have to open them.
          </p>
        </div>
        <Badge tone={settings.enabled ? 'green' : 'grey'}>{settings.enabled ? 'On' : 'Paused'}</Badge>
      </div>

      {/* Facts, deliberately not cards: a card is a promise of a destination. */}
      <dl className="mt-5 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-smoke">Last read</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {relative(lastRun?.at)}
            {lastRun ? <span className="ml-2 font-normal text-smoke">{lastRun.updated} updated</span> : null}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-smoke">Next</dt>
          <dd className="mt-0.5 font-medium">
            {settings.enabled ? nextDue(lastRun?.at, settings.interval_hours) : 'paused'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-smoke">Instagram</dt>
          <dd className="mt-0.5 font-medium">
            {hasSession ? 'signed in' : <span className="text-brand">needs a session</span>}
          </dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button type="button" className="btn-primary !py-2 text-sm" onClick={runNow} disabled={busy}>
          {busy ? <Spinner className="h-4 w-4" /> : null}
          {busy ? 'Reading entries…' : 'Sync this challenge now'}
        </button>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-smoke">Runs</span>
          <select
            className="input !w-auto !py-1.5 text-sm"
            value={settings.interval_hours}
            onChange={(e) => updateSettings({ intervalHours: Number(e.target.value) })}
          >
            {CADENCES.map((c) => (
              <option key={c.hours} value={c.hours}>{c.label}</option>
            ))}
          </select>
        </label>

        <span className="flex items-center gap-2 text-sm">
          <Toggle
            on={!!settings.enabled}
            onChange={(on) => updateSettings({ enabled: on })}
            label="Run on a schedule"
          />
          <span className="text-smoke">on a schedule</span>
        </span>
      </div>

      {result ? (
        <p className="mt-4 text-sm">
          Read {result.ran} {result.ran === 1 ? 'entry' : 'entries'},{' '}
          <strong className="tabular-nums">{result.updated}</strong> refreshed
          {result.failed ? `, ${result.failed} could not be read` : ''}.
        </p>
      ) : null}

      {error ? <p className="mt-4 text-sm text-brand">{error}</p> : null}

      {Object.keys(problems).length > 0 ? (
        <ul className="mt-5 space-y-2 border-t border-gray-100 pt-5">
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

      {/* Instagram is the only thing here that ever needs a human, so it stays
          folded away until it does. */}
      <div className="mt-5 border-t border-gray-100 pt-5">
        <button
          type="button"
          className="text-sm font-medium text-brand hover:underline"
          onClick={() => setShowSession((v) => !v)}
        >
          {showSession ? 'Hide' : hasSession ? 'Replace the Instagram session' : 'Add an Instagram session'}
        </button>

        {showSession ? (
          <div className="mt-3 max-w-xl">
            <p className="text-xs leading-relaxed text-smoke">
              Instagram only shows view counts to a signed-in account, so this needs the{' '}
              <code className="rounded bg-gray-50 px-1">sessionid</code> cookie from a Tryp-owned Instagram
              login. In a browser signed in as that account, open developer tools, go to Application then
              Cookies for instagram.com, and copy the value of <code className="rounded bg-gray-50 px-1">sessionid</code>.
              It is stored where only the sync can read it and is never shown again.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                type="password"
                autoComplete="off"
                className="input flex-1 !w-auto min-w-[16rem]"
                placeholder="sessionid value"
                value={session}
                onChange={(e) => setSession(e.target.value)}
              />
              <button
                type="button"
                className="btn-secondary !py-2 text-sm"
                onClick={storeSession}
                disabled={savingSession || !session.trim()}
              >
                {savingSession ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  )
}
