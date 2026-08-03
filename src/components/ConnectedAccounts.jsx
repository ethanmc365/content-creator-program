import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { notice } from '../lib/confirm'
import { Spinner } from './ui'
import Icon from '../components/Icon'
import { timeAgo, cx } from '../lib/utils'

// Connected accounts, in Settings.
//
// Linking TikTok lets the platform read the view count of the videos you
// submitted to a challenge, so the leaderboards update themselves instead of an
// admin opening every entry and typing the number in by hand.
//
// The OAuth round trip is handled entirely by the `tiktok-oauth` edge function
// (TikTok will only redirect to one registered HTTPS URI, so it lands there and
// bounces back here with ?tiktok=connected or ?tiktok=error&reason=...).
// Tokens never touch the browser: they're written to private.social_tokens by
// the callback and only ever read by the service role.

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`

// Why a connect might have failed, in words a creator can act on.
const REASONS = {
  not_configured: 'TikTok syncing is not switched on yet. The Tryp.com team is finishing the setup.',
  bad_state: 'That link had expired. Please try connecting again.',
  expired: 'That link had expired. Please try connecting again.',
  token_exchange: "TikTok wouldn't complete the connection. Please try again.",
  save_failed: "We couldn't save the connection. Please try again.",
  missing_code: 'The connection was cancelled.',
  access_denied: 'The connection was cancelled.',
}

const PROVIDERS = [
  {
    key: 'tiktok',
    label: 'TikTok',
    blurb: 'Let us read the view count on the videos you enter into challenges.',
  },
]

export default function ConnectedAccounts() {
  const [params, setParams] = useSearchParams()
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [msg, setMsg] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.rpc('my_social_connections')
    setRows(data ?? [])
  }, [])

  useEffect(() => { load() }, [load])

  // Read the result of the OAuth round trip out of the URL, then clean it up so
  // a refresh doesn't replay the message.
  useEffect(() => {
    const result = params.get('tiktok')
    if (!result) return
    if (result === 'connected') setMsg('TikTok connected. Your view counts will start updating shortly.')
    else setMsg(REASONS[params.get('reason') ?? ''] ?? "That didn't work. Please try connecting again.")
    const next = new URLSearchParams(params)
    next.delete('tiktok'); next.delete('reason')
    setParams(next, { replace: true })
    load()
  }, [params, setParams, load])

  async function connect(provider) {
    setBusy(provider); setMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${FN_BASE}/${provider}-oauth?action=start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({}),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok || !body?.url) {
        setBusy('')
        return setMsg(REASONS[body?.code ?? ''] ?? body?.error ?? "Couldn't start the connection. Please try again.")
      }
      // Full-page redirect: TikTok blocks its auth screen inside an iframe.
      // assign() rather than `location.href =`: react-hooks/immutability reads the
      // assignment as mutating a value defined outside the component.
      window.location.assign(body.url)
    } catch (e) {
      setBusy('')
      setMsg(e.message || "Couldn't start the connection.")
    }
  }

  async function disconnect(provider) {
    setBusy(provider); setMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${FN_BASE}/${provider}-oauth?action=disconnect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({}),
      })
      if (!res.ok) throw new Error('disconnect failed')
      setMsg('TikTok disconnected. Your logged views stay as they are.')
      await load()
    } catch {
      notice("Couldn't disconnect. Please try again.")
    }
    setBusy('')
  }

  // Pull the latest numbers now rather than waiting for the hourly job.
  async function syncNow() {
    setSyncing(true); setMsg('')
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch(`${FN_BASE}/social-sync`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token ?? ''}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({}),
      })
      const body = await res.json().catch(() => ({}))
      const r = body?.results?.[0]
      if (r?.error) setMsg(`Sync problem: ${r.error}`)
      else if (r) setMsg(`Synced. ${r.matched} of your entries matched, ${r.updated} updated.`)
      else setMsg('Nothing to sync yet.')
      await load()
    } catch {
      setMsg("Couldn't sync right now. Please try again.")
    }
    setSyncing(false)
  }

  return (
    <section className="card">
      <div className="mb-1 flex items-center gap-2">
        <Icon name="link" className="h-5 w-5 text-brand" />
        <h2 className="text-lg font-semibold">Connected accounts</h2>
      </div>
      <p className="text-sm text-smoke">
        Link the accounts you post from and your challenge view counts update by themselves, so you
        never wait on us to score an entry. You can disconnect any time.
      </p>

      {msg && (
        <p className="mt-4 rounded-xl bg-cloud px-4 py-3 text-xs leading-relaxed text-smoke">{msg}</p>
      )}

      <div className="mt-5 space-y-4 border-t border-gray-100 pt-5">
        {rows === null ? (
          <div className="flex justify-center py-4"><Spinner /></div>
        ) : (
          PROVIDERS.map((p) => {
            const conn = rows.find((r) => r.provider === p.key)
            return (
              <div key={p.key} className="flex flex-wrap items-center gap-4">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-ink text-white" aria-hidden>
                  <TikTokGlyph className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                    {p.label}
                    {conn && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-2 py-0.5 text-[11px] font-semibold text-green-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                        Connected
                      </span>
                    )}
                  </p>
                  <p className="text-xs leading-relaxed text-smoke">
                    {!conn ? p.blurb : (
                      <>
                        {conn.username ? `@${conn.username}` : conn.display_name || 'Your account'}
                        {' · '}
                        {conn.last_synced_at ? `synced ${timeAgo(conn.last_synced_at)}` : 'first sync on its way'}
                        {conn.videos_matched > 0 && ` · ${conn.videos_matched} ${conn.videos_matched === 1 ? 'entry' : 'entries'} tracked`}
                      </>
                    )}
                  </p>
                  {conn?.last_sync_error && (
                    <p className="mt-1 text-xs text-amber-600">
                      Last sync had a problem. Try disconnecting and connecting again.
                    </p>
                  )}
                </div>
                <div className={cx('flex shrink-0 gap-2', !conn && 'w-full sm:w-auto')}>
                  {conn ? (
                    <>
                      <button type="button" onClick={syncNow} disabled={syncing} className="btn-ghost !py-2 text-xs">
                        {syncing ? <Spinner className="h-4 w-4" /> : 'Sync now'}
                      </button>
                      <button type="button" onClick={() => disconnect(p.key)} disabled={busy === p.key} className="btn-secondary !py-2 text-xs">
                        {busy === p.key ? <Spinner className="h-4 w-4" /> : 'Disconnect'}
                      </button>
                    </>
                  ) : (
                    <button type="button" onClick={() => connect(p.key)} disabled={busy === p.key} className="btn-primary !py-2.5 text-sm">
                      {busy === p.key ? <Spinner /> : `Connect ${p.label}`}
                    </button>
                  )}
                </div>
              </div>
            )
          })
        )}

        {/* Instagram is not self-serve yet: its API needs a business account and
            an app review, so say so rather than showing a button that fails. */}
        <div className="flex flex-wrap items-center gap-4 border-t border-gray-100 pt-4 opacity-70">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cloud text-smoke" aria-hidden>
            <Icon name="image" className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Instagram</p>
            <p className="text-xs leading-relaxed text-smoke">
              Coming soon. Instagram only shares view counts for professional accounts, so this one
              takes a little longer to set up. Keep entering Reels as normal.
            </p>
          </div>
        </div>
      </div>

      <p className="mt-5 border-t border-gray-100 pt-4 text-xs leading-relaxed text-smoke">
        We only ever read the view, like and comment counts of your own videos. We never post, never
        read your messages, and never see your password.
      </p>
    </section>
  )
}

// TikTok's mark as a single-colour glyph, so it sits in the icon set rather than
// pulling in a coloured logo asset.
function TikTokGlyph({ className }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
      <path d="M16.6 5.82A4.28 4.28 0 0 1 15.54 3h-3.09v12.4a2.59 2.59 0 1 1-1.84-2.48V9.77a5.67 5.67 0 1 0 4.93 5.62V8.87a7.35 7.35 0 0 0 4.3 1.38V7.16a4.29 4.29 0 0 1-3.24-1.34z" />
    </svg>
  )
}
