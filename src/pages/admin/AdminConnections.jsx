import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { PageHeader, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import PlatformBadges from '../../components/PlatformBadges'
import { timeAgo } from '../../lib/utils'
import { saveViewSyncSecret, viewSyncStatus } from '../../lib/viewSync'

// The two credentials automatic view counts need, on their own page.
//
// They used to sit on the challenge results page, which is the page you open
// every week, holding two values you touch about once a year. This is where they
// belong: platform settings, next to the other things that are true everywhere
// rather than true of one challenge.
//
// Neither value is ever readable back. `view_sync_status()` reports only whether
// each is PRESENT; the values themselves live in private.config, which is RLS-on
// with no policies and reachable only by the Edge Function's service role.

const PLATFORMS = [
  {
    name: 'instagram_sessionid',
    platform: 'Instagram',
    label: 'Instagram session',
    placeholder: 'sessionid',
    needs: 'A session cookie from a Tryp-owned Instagram account.',
    why: 'Every public Instagram route answers require_login, and a logged-out reel page shows likes and comments but no play count at all. Signed in, it reads the exact number, including for creators who have hidden their counts publicly.',
    life: 'Lasts months, usually close to a year. A password change or a "log out of all sessions" ends it early. When it goes, every Instagram entry says so.',
    how: 'In a browser signed in as that account, open developer tools, then Application, then Cookies for instagram.com, and copy the value of sessionid. A whole Cookie header works too and lasts a little longer.',
  },
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
  { platform: 'TikTok', text: 'Reads the exact count off the public embed endpoint. Nothing to connect.' },
  { platform: 'Facebook', text: 'Reads the count off the public page. Exact below a thousand views, rounded above it. Nothing to connect.' },
]

export default function AdminConnections() {
  const [status, setStatus] = useState(null)
  const [draft, setDraft] = useState({ instagram_sessionid: '', youtube_api_key: '' })
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
    instagram_sessionid: status?.instagram_session === true,
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
      <Link to="/admin" className="mb-6 inline-block text-sm font-medium text-smoke hover:text-brand">← Admin</Link>

      <PageHeader
        title="Platform connections"
        subtitle="What automatic view counts needs to read each platform. Two of the four need nothing at all."
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
      </div>

      <p className="mt-8 text-xs leading-relaxed text-smoke">
        Neither value can be read back once saved. To check one is working, paste a link into{' '}
        <Link to="/admin/testing/views" className="font-medium text-brand hover:underline">the view count tester</Link>.
      </p>
    </div>
  )
}
