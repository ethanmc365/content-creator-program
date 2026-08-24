import { useState } from 'react'
import { LabPage, Panel, Note, KeyVal, Code, Field, InfoList } from './kit'
import { Badge, Spinner } from '../../../components/ui'
import { formatViews } from '../../../lib/utils'
import { describeLink } from '../../../lib/videoLinks'
import { describeSyncError, probeLink } from '../../../lib/viewSync'

// Paste a link, see the number.
//
// This is the SECOND lab that touches real data (HealthLab is the other), and
// like that one it is strictly READ ONLY: it calls `view-sync` in probe mode,
// which resolves the link, reports what it found and writes nothing at all. That
// is what lets it live in a harness whose first rule is that no lab may reach a
// real creator. `sandbox={false}` for the same reason HealthLab uses it - the
// generic "everyone here is invented" banner would be a lie on a page whose
// whole purpose is real numbers off real posts.
//
// The sample is TikTok's OWN corporate account, never a creator's entry: these
// lab chunks are fetchable by URL like any JS asset.
const SAMPLE = 'https://www.tiktok.com/@tiktok/video/7106594312292453675'

export default function ViewsLab() {
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState(null)
  const [failed, setFailed] = useState('')

  const preview = url.trim() ? describeLink(url.trim()) : null

  async function run(target) {
    const value = (target ?? url).trim()
    if (!value) return
    setBusy(true)
    setResult(null)
    setFailed('')
    try {
      setResult(await probeLink(value))
    } catch (e) {
      setFailed(e.message ?? 'The probe could not be run.')
    }
    setBusy(false)
  }

  const errorMeta = result?.error ? describeSyncError(result.error) : null

  return (
    <LabPage
      title="View counts, off the link"
      icon="eye"
      sandbox={false}
      subtitle="Paste a TikTok or Instagram link and see exactly what the automatic sync would read from it. This calls the live function against the live post, and writes nothing."
    >
      <Panel
        title="Read a link"
        hint="The same code path the daily sweep uses, in probe mode."
        i={0}
      >
        <Field label="Video link" hint="A share-sheet short link is fine. It gets followed to the real video.">
          <input
            type="url"
            className="input"
            placeholder="https://vm.tiktok.com/... or https://www.instagram.com/reel/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
          />
        </Field>

        {/* What can be known without a request, said before one is made. */}
        {preview ? (
          <p className="mt-2 text-xs text-smoke">
            {preview.platform ? (
              <>
                <span className="font-semibold text-ink">{preview.platform}</span>
                {preview.id ? <span className="tabular-nums"> · {preview.id}</span> : null} · {preview.note}
              </>
            ) : (
              preview.note
            )}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-3">
          <button type="button" className="btn-primary !py-2 text-sm" onClick={() => run()} disabled={busy || !url.trim()}>
            {busy ? <Spinner className="h-4 w-4" /> : null}
            {busy ? 'Reading…' : 'Read the view count'}
          </button>
          <button
            type="button"
            className="btn-secondary !py-2 text-sm"
            onClick={() => { setUrl(SAMPLE); run(SAMPLE) }}
            disabled={busy}
          >
            Try a known TikTok
          </button>
        </div>

        {failed ? <Note tone="warn" icon="alert" className="mt-4">{failed}</Note> : null}

        {result ? (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center gap-4 rounded-card bg-cloud/60 px-5 py-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-smoke">Views</p>
                <p className="mt-1 text-3xl font-bold tabular-nums">
                  {result.views != null ? Number(result.views).toLocaleString() : '-'}
                </p>
                {result.views != null ? (
                  <p className="text-xs text-smoke">shown as {formatViews(result.views)} on the leaderboard</p>
                ) : null}
              </div>
              <div className="ml-auto flex flex-col items-end gap-2">
                <Badge tone={result.views != null ? 'green' : 'amber'}>
                  {result.views != null ? 'Read cleanly' : (errorMeta?.label ?? 'No count')}
                </Badge>
                <span className="text-xs text-smoke tabular-nums">{result.ms} ms</span>
              </div>
            </div>

            {errorMeta?.hint ? <Note tone="warn" icon="alert">{errorMeta.hint}</Note> : null}

            <KeyVal
              rows={[
                ['Platform', result.platform ?? '-'],
                ['Video id', result.videoId ?? '-'],
                ['Instagram session', result.instagram_session === 'set' ? 'stored' : 'not set'],
                result.canonicalUrl ? ['Resolved to', <span key="u" className="break-all text-xs font-normal">{result.canonicalUrl}</span>] : null,
              ]}
            />

            <Code>{JSON.stringify(result, null, 2)}</Code>
          </div>
        ) : null}
      </Panel>

      <Panel title="How each platform is read" i={1}>
        <InfoList
          columns={2}
          items={[
            {
              t: 'TikTok, no sign-in',
              d: 'The share link is followed to its canonical form, and the numeric id read off the embed endpoint, which carries the same stats as the video page in a third of the bytes. The id is cached on the entry, so every later read is one request.',
            },
            {
              t: 'Instagram, sign-in required',
              d: 'Every public Instagram endpoint now answers require_login, and a logged-out reel page shows likes and comments but no play count at all. So the sync uses a Tryp account session, stored where only it can read it.',
            },
            {
              t: 'A number never falls',
              d: 'A reading below what is already saved is flagged, not written. Views do not go down, so a lower one means a bad read or a number typed from a better source, and the saved one stands.',
            },
            {
              t: 'Every reading is kept',
              d: 'Each successful read is written to view_snapshots whether or not it reaches the leaderboard, so a wrong number is obvious next to the ones either side of it.',
            },
          ]}
        />
      </Panel>

      <Panel title="What this page does not do" i={2}>
        <Note icon="shield">
          This is the only lab besides platform health that reaches real data, and it is read only. Probing a
          link resolves it and reports what it saw. It does not write a view count, touch a submission, or
          record a snapshot. The numbers on a leaderboard only ever change from the scheduled sweep or from
          Sync now on a challenge&apos;s results page.
        </Note>
      </Panel>
    </LabPage>
  )
}
