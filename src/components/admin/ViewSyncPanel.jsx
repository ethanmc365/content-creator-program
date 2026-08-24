import { useCallback, useEffect, useState } from 'react'
import { Select, Spinner } from '../ui'
import Icon from '../Icon'
import { timeAgo } from '../../lib/utils'
import {
  CADENCES,
  describeSyncError,
  saveViewSyncSecret,
  saveViewSyncSettings,
  syncViews,
  viewSyncStatus,
} from '../../lib/viewSync'

// The controls for automatic view counts, shown above the entry list on the
// results page - which is exactly where an admin used to sit opening forty links
// and typing forty numbers.
//
// There is no on/off switch. Reading views off the link is simply how a view
// count arrives now, on every challenge, running and future, and a per-challenge
// opt-in would only ever be a way to end up with a stale leaderboard nobody
// noticed. Typing a number by hand still wins on that row.
//
// The cadence and the two platform credentials are programme-wide even though
// the panel lives on one challenge's page: they are settings only ever thought
// about while looking at a leaderboard, and a separate admin route for them
// would be a page nobody remembers exists.

function nextDue(lastRunAt, intervalHours) {
  if (!lastRunAt) return 'due now'
  const mins = Math.round((new Date(lastRunAt).getTime() + intervalHours * 3600_000 - Date.now()) / 60000)
  if (mins <= 0) return 'due now'
  if (mins < 60) return `in ${mins} min`
  const hrs = Math.round(mins / 60)
  return hrs < 48 ? `in ${hrs} hours` : `in ${Math.round(hrs / 24)} days`
}

export default function ViewSyncPanel({ challengeId, submissions = [], onSynced }) {
  const [status, setStatus] = useState(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [showKeys, setShowKeys] = useState(false)
  const [draft, setDraft] = useState({ instagram_sessionid: '', youtube_api_key: '' })
  const [saving, setSaving] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setStatus(await viewSyncStatus())
    } catch (e) {
      setError(e.message ?? 'Could not read the sync status.')
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const settings = status?.settings ?? { interval_hours: 24 }
  const lastRun = status?.last_run ?? null
  const hasSession = status?.instagram_session === true
  const hasYoutubeKey = status?.youtube_key === true
  const missing = [!hasSession && 'Instagram', !hasYoutubeKey && 'YouTube'].filter(Boolean)

  // Grouped by REASON rather than listed row by row: an admin needs to know
  // "Instagram is not signed in" once, not seventeen times.
  const problems = submissions.reduce((acc, s) => {
    if (!s.views_sync_error) return acc
    ;(acc[s.views_sync_error] ??= []).push(s)
    return acc
  }, {})

  const automatic = submissions.filter((s) => s.views_source && s.views_source !== 'manual').length

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

  return (
    <section className="mb-8 rounded-card border border-gray-100 p-5 shadow-card sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Icon name="eye" className="h-5 w-5 text-brand" />
            View counts
          </h2>
          <p className="mt-1 text-sm text-smoke">
            Read off each entry&apos;s link automatically. Type a number in any row to override it.
          </p>
        </div>
      </div>

      {/* Facts, deliberately not cards: a card is a promise of a destination. */}
      <dl className="mt-5 grid gap-x-8 gap-y-3 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs uppercase tracking-wide text-smoke">Last read</dt>
          <dd className="mt-0.5 font-medium">
            {lastRun?.at ? timeAgo(lastRun.at) : 'never'}
          </dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-smoke">Next</dt>
          <dd className="mt-0.5 font-medium">{nextDue(lastRun?.at, settings.interval_hours ?? 24)}</dd>
        </div>
        <div>
          <dt className="text-xs uppercase tracking-wide text-smoke">This challenge</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {automatic} of {submissions.length} automatic
            {missing.length ? (
              <span className="ml-2 font-normal text-brand">{missing.join(' and ')} not connected</span>
            ) : null}
          </dd>
        </div>
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-4">
        <button type="button" className="btn-primary !py-2 text-sm" onClick={runNow} disabled={busy}>
          {busy ? <Spinner className="h-4 w-4" /> : null}
          {busy ? 'Reading entries…' : 'Sync now'}
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

      {result ? (
        <p className="mt-4 text-sm">
          Read {result.ran} {result.ran === 1 ? 'entry' : 'entries'},{' '}
          <strong className="tabular-nums">{result.updated}</strong> refreshed
          {result.failed ? `, ${result.failed} need a look` : ''}.
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

      <div className="mt-5 border-t border-gray-100 pt-5">
        <button
          type="button"
          className="text-sm font-medium text-brand hover:underline"
          onClick={() => setShowKeys((v) => !v)}
        >
          {showKeys ? 'Hide connections' : 'Instagram and YouTube connections'}
        </button>

        {showKeys ? (
          <div className="mt-4 max-w-xl space-y-4">
            {[
              { name: 'instagram_sessionid', label: 'Instagram session', placeholder: 'sessionid', has: hasSession },
              { name: 'youtube_api_key', label: 'YouTube Data API key', placeholder: 'AIza…', has: hasYoutubeKey },
            ].map((f) => (
              <div key={f.name}>
                <div className="mb-1.5 flex items-baseline gap-2">
                  <span className="label !mb-0">{f.label}</span>
                  <span className={f.has ? 'text-xs text-green-700' : 'text-xs text-smoke'}>
                    {f.has ? 'connected' : 'not set'}
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
                    {saving === f.name ? 'Saving…' : f.has ? 'Replace' : 'Save'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}
