import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import PlatformBadges from '../../components/PlatformBadges'
import { timeAgo } from '../../lib/utils'
import { saveViewSyncSecret, viewSyncStatus } from '../../lib/viewSync'

// What automatic view counts needs to read each platform - which, since 25 Aug
// 2026, is one free API key and nothing else.
//
// Instagram used to want a session cookie from a Tryp-owned account. Instagram
// then warned that account for suspected automated behaviour and threatened to
// disable it, so the cookie was deleted and the reader was rebuilt on the public
// reels tab, which states a view count under every reel to anybody signed out.
// Do not add a session field back.
//
// The YouTube key is never readable back. `view_sync_status()` reports only
// whether it is PRESENT; the value lives in private.config, which is RLS-on with
// no policies and reachable only by the Edge Function's service role.

const PLATFORMS = [
  {
    name: 'youtube_api_key',
    platform: 'YouTube',
    label: 'YouTube Data API key',
    placeholder: 'AIza…',
    needs: 'A free YouTube Data API v3 key.',
    why: 'YouTube bot-blocks servers from reading its pages: the watch page comes back as an empty shell and every internal client answers "Sign in to confirm you are not a bot". The API answers properly.',
    life: 'Does not expire. Replace it only if it leaks.',
    how: 'Google Cloud console, enable YouTube Data API v3, create an API key. No billing account and no review. One entry costs 1 unit of a 10,000 a day quota.',
  },
]

const NO_CREDENTIAL = [
  {
    platform: 'Instagram',
    text: 'Reads the exact count off the creator\'s public reels tab, the same number a signed-out visitor sees, including for creators who have hidden their counts on the post itself. No account, no cookie, nothing to connect - and nothing that can get a Tryp.com account flagged.',
  },
  { platform: 'TikTok', text: 'Reads the exact count off the public embed endpoint. Nothing to connect.' },
  { platform: 'Facebook', text: 'Reads the count off the public page. Exact below a thousand views, rounded above it. Nothing to connect.' },
]

// Meta gives each of its saved queries a numeric id and rotates them. The reader
// ships with working ids, so these are empty almost always; they exist so that a
// rotation is a paste here rather than a redeploy. Both take a comma-separated
// list and try each in turn, so a new id can be added before the old one dies.
const QUERY_IDS = [
  {
    name: 'instagram_reels_doc_id',
    label: 'Reels tab query',
    hint: 'The query behind a public profile\'s reels tab, which is where every Instagram view count comes from.',
  },
  {
    name: 'instagram_post_doc_id',
    label: 'Post lookup query',
    hint: 'Used only to find out who posted a reel when the creator\'s saved Instagram handle does not match.',
  },
]

export default function AdminConnections() {
  const [status, setStatus] = useState(null)
  const [draft, setDraft] = useState({ youtube_api_key: '', instagram_reels_doc_id: '', instagram_post_doc_id: '' })
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saving, setSaving] = useState('')
  const [saved, setSaved] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    try {
      setStatus(await viewSyncStatus())
    } catch (e) {
      setError(e.message ?? 'Could not read the connection status.')
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const connected = {
    youtube_api_key: status?.youtube_key === true,
  }

  async function store(name) {
    setSaving(name)
    setError('')
    setSaved('')
    try {
      await saveViewSyncSecret(name, draft[name].trim())
      setDraft((d) => ({ ...d, [name]: '' }))
      await refresh()
      setSaved(name)
    } catch (e) {
      setError(e.message ?? 'Could not save that credential.')
    }
    setSaving('')
  }

  if (!status && !error) {
    return <div className="page max-w-3xl space-y-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-64 w-full" /></div>
  }

  return (
    <div className="page max-w-3xl">

      <PageHeader
        back="/admin"
        title="Platform connections"
        subtitle="What automatic view counts needs to read each platform. Three of the four need nothing at all."
        action={<PlatformBadges platforms={['Instagram', 'TikTok', 'YouTube', 'Facebook']} size="md" />}
      />

      {status?.last_run?.at && (
        <p className="mb-8 text-sm text-smoke">
          Views were last read <span className="font-medium text-ink">{timeAgo(status.last_run.at)}</span>
          {status.last_run.updated != null ? `, ${status.last_run.updated} refreshed` : ''}.
        </p>
      )}

      {error ? <p className="mb-6 text-sm text-brand">{error}</p> : null}

      <div className="space-y-6">
        {PLATFORMS.map((p) => (
          <section key={p.name} className="rounded-card border border-gray-100 p-5 shadow-card sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold">{p.label}</h2>
              <span
                className={
                  connected[p.name]
                    ? 'inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700'
                    : 'inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1 text-xs font-medium text-brand'
                }
              >
                <Icon name={connected[p.name] ? 'check' : 'alert'} className="h-3.5 w-3.5" />
                {connected[p.name] ? 'Connected' : 'Not set'}
              </span>
            </div>

            <p className="mt-2 text-sm text-smoke">{p.needs}</p>

            <div className="mt-5 flex flex-wrap gap-2">
              <input
                type="password"
                autoComplete="off"
                className="input min-w-[16rem] flex-1 !w-auto"
                placeholder={p.placeholder}
                value={draft[p.name]}
                onChange={(e) => { setDraft((d) => ({ ...d, [p.name]: e.target.value })); setSaved('') }}
                onKeyDown={(e) => e.key === 'Enter' && draft[p.name].trim() && store(p.name)}
              />
              <button
                type="button"
                className="btn-primary !py-2 text-sm"
                onClick={() => store(p.name)}
                disabled={saving === p.name || !draft[p.name].trim()}
              >
                {saving === p.name ? 'Saving…' : connected[p.name] ? 'Replace' : 'Save'}
              </button>
            </div>
            {saved === p.name ? <p className="mt-2 text-xs text-green-700">Saved. It is in use from the next read.</p> : null}

            <dl className="mt-5 space-y-3 border-t border-gray-100 pt-5 text-xs leading-relaxed">
              <div>
                <dt className="font-semibold text-ink">Why it is needed</dt>
                <dd className="mt-0.5 text-smoke">{p.why}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">How long it lasts</dt>
                <dd className="mt-0.5 text-smoke">{p.life}</dd>
              </div>
              <div>
                <dt className="font-semibold text-ink">Where to get it</dt>
                <dd className="mt-0.5 text-smoke">{p.how}</dd>
              </div>
            </dl>
          </section>
        ))}

        <section className="rounded-card bg-cloud/60 p-5 sm:p-7">
          <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-smoke">Nothing to connect</h2>
          <dl className="mt-4 space-y-3 text-sm">
            {NO_CREDENTIAL.map((n) => (
              <div key={n.platform}>
                <dt className="font-semibold text-ink">{n.platform}</dt>
                <dd className="mt-0.5 text-xs leading-relaxed text-smoke">{n.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="rounded-card border border-gray-100 p-5 shadow-card sm:p-7">
          <button
            type="button"
            onClick={() => setShowAdvanced((v) => !v)}
            className="flex w-full items-center justify-between gap-3 text-left"
          >
            <span>
              <span className="block text-base font-semibold">Instagram query ids</span>
              <span className="mt-0.5 block text-sm text-smoke">
                {status?.instagram_query_pinned
                  ? 'Pinned to an id saved here.'
                  : 'Using the built-in ids. Nothing to do unless Instagram entries suddenly stop reading.'}
              </span>
            </span>
            <Icon
              name="chevronRight"
              className={`h-5 w-5 shrink-0 text-smoke transition-transform duration-200 ${showAdvanced ? 'rotate-90' : ''}`}
            />
          </button>

          {showAdvanced ? (
            <div className="mt-5 space-y-5 border-t border-gray-100 pt-5">
              <p className="text-xs leading-relaxed text-smoke">
                Instagram gives each of its saved queries a numeric id and changes them from time to
                time. When that happens every Instagram entry stops reading at once, and the fix is
                the new id rather than a new deploy. Leave both empty to use the built-in ones. Each
                accepts several ids separated by commas and tries them in order, so a new id can be
                added before the old one dies.
              </p>
              {QUERY_IDS.map((q) => (
                <div key={q.name}>
                  <label className="block text-sm font-semibold text-ink" htmlFor={q.name}>{q.label}</label>
                  <p className="mt-0.5 text-xs leading-relaxed text-smoke">{q.hint}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input
                      id={q.name}
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      className="input min-w-[16rem] flex-1 !w-auto font-mono no-ios-zoom sm:text-sm"
                      placeholder="Built-in id in use"
                      value={draft[q.name]}
                      onChange={(e) => { setDraft((d) => ({ ...d, [q.name]: e.target.value })); setSaved('') }}
                      onKeyDown={(e) => e.key === 'Enter' && store(q.name)}
                    />
                    <button
                      type="button"
                      className="btn-secondary !py-2 text-sm"
                      onClick={() => store(q.name)}
                      disabled={saving === q.name}
                    >
                      {saving === q.name ? 'Saving…' : draft[q.name].trim() ? 'Save' : 'Clear'}
                    </button>
                  </div>
                  {saved === q.name ? (
                    <p className="mt-2 text-xs text-green-700">Saved. It is in use from the next read.</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      <p className="mt-8 text-xs leading-relaxed text-smoke">
        Nothing saved here can be read back. To check any platform is working, paste a link into{' '}
        <Link to="/admin/testing/views" className="font-medium text-brand hover:underline">the view count tester</Link>.
      </p>
    </div>
  )
}
