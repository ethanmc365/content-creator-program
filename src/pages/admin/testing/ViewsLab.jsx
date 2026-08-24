import { useState } from 'react'
import { LabPage, Panel, Note, KeyVal, Code, Field, InfoList } from './kit'
import { Badge, Spinner } from '../../../components/ui'
import PlatformBadges from '../../../components/PlatformBadges'
import { formatViews } from '../../../lib/utils'
import { describeLink } from '../../../lib/videoLinks'
import { describeSyncError, probeLink } from '../../../lib/viewSync'

// Paste a link, see the number, on all four platforms.
//
// This is the SECOND lab that touches real data (HealthLab is the other), and
// like that one it is strictly READ ONLY: it calls `view-sync` in probe mode,
// which resolves the link, reports what it found and writes nothing at all. That
// is what lets it live in a harness whose first rule is that no lab may reach a
// real creator. `sandbox={false}` for the same reason HealthLab uses it - the
// generic "everyone here is invented" banner would be a lie on a page whose
// whole purpose is real numbers off real posts.
//
const HOW = [
  {
    t: 'TikTok, exact, no sign-in',
    d: 'The share link is followed to its canonical form and the id read off the embed endpoint, which carries the same stats as the video page in a third of the bytes. The id is cached on the entry, so every later read is one request.',
  },
  {
    t: 'YouTube, exact, via its own API',
    d: 'Watch links, youtu.be links, Shorts and embeds all reduce to the same eleven-character id. YouTube bot-blocks servers from reading its pages, so the count comes from the free Data API v3: one unit of a 10,000 a day quota per entry.',
  },
  {
    t: 'Facebook, exact under a thousand and close above it',
    d: 'The page title is the only place Facebook states a count. Below a thousand it gives a plain number and that is exact. Above it, it rounds to two figures: "5.7K" means somewhere between 5,650 and 5,749, so the number is within about 1% and never more than fifty out at that size. Good enough to rank on; the row still says it is rounded.',
  },
  {
    t: 'Instagram, exact, needs a session',
    d: 'Every public route answers require_login, so the sync signs in and asks by media id. A sessionid alone is not enough: Instagram answers that with a redirect to itself, so the request also carries the ds_user_id derived from the sessionid and the cookies a browser would have.',
  },
  {
    t: 'It reads what the page hides',
    d: 'A creator who has turned off like and view counts shows nobody their numbers, and the signed-in Instagram API still returns them. So the sync fills in entries you cannot read by opening the post yourself.',
  },
]

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
      subtitle="Paste a TikTok, Instagram, YouTube or Facebook link and see exactly what the automatic sync would read from it. This calls the live function against the live post, and writes nothing."
      aside={<PlatformBadges platforms={['Instagram', 'TikTok', 'YouTube', 'Facebook']} size="md" />}
    >
      <Panel title="Read a link" hint="The same code path the scheduled sweep uses, in probe mode." i={0}>
        <Field label="Video link">
          <input
            type="url"
            className="input"
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
        </div>

        {failed ? <Note tone="warn" icon="alert" className="mt-4">{failed}</Note> : null}

        {result ? (
          <div className="mt-6 space-y-4">
            <div className="flex flex-wrap items-center gap-4 rounded-card bg-cloud/60 px-5 py-4">
              <div>
                <p className="text-xs uppercase tracking-wide text-smoke">Views</p>
                <p className="mt-1 text-3xl font-bold tabular-nums">
                  {result.views != null
                    ? `${result.approx ? '~' : ''}${Number(result.views).toLocaleString()}`
                    : '-'}
                </p>
                {result.views != null ? (
                  <p className="text-xs text-smoke">
                    shown as {formatViews(result.views)} on the leaderboard
                  </p>
                ) : null}
              </div>
              <div className="ml-auto flex flex-col items-end gap-2">
                <Badge tone={result.views != null ? (result.approx ? 'amber' : 'green') : 'amber'}>
                  {result.views != null
                    ? result.approx ? 'Read, rounded' : 'Read cleanly'
                    : (errorMeta?.label ?? 'No count')}
                </Badge>
                <span className="text-xs tabular-nums text-smoke">{result.ms} ms</span>
              </div>
            </div>

            {result.error ? (
              <Note tone="warn" icon="alert">
                {result.detail ? <p className="font-medium text-ink">{result.detail}</p> : null}
                {errorMeta?.hint ? <p>{errorMeta.hint}</p> : null}
              </Note>
            ) : null}

            <KeyVal
              rows={[
                ['Platform', result.platform ?? '-'],
                ['Video id', result.videoId ?? '-'],
                [
                  'Exactness',
                  result.views == null
                    ? '-'
                    : result.approx
                      ? 'rounded to 2 figures'
                      : 'exact',
                  result.views == null
                    ? null
                    : result.approx
                      ? 'Facebook rounds above a thousand, so this is within about 1%'
                      : null,
                ],
                result.canonicalUrl
                  ? ['Resolved to', <span key="u" className="break-all text-xs font-normal">{result.canonicalUrl}</span>]
                  : null,
              ]}
            />

            <Code>{JSON.stringify(result, null, 2)}</Code>
          </div>
        ) : null}
      </Panel>

      <Panel title="How each platform is read" i={1}>
        <InfoList columns={2} items={HOW} />
      </Panel>

      <Panel title="The rules that keep a number honest" i={2}>
        <InfoList
          columns={2}
          items={[
            {
              t: 'It is asked for by id',
              d: 'Every platform is queried by the id in the link, never by position on a page, so the count always belongs to the entry it was read for.',
            },
            {
              t: 'The platform wins',
              d: 'Whatever the platform states is what gets saved, every time. Typing a number by hand is for the entries the platform cannot answer, not for outranking the ones it can.',
            },
            {
              t: 'Big programmes drain steadily',
              d: 'Staleness belongs to the entry, not the run. Each pass takes the oldest-read chunk it can finish, then hands the rest to a fresh one, so five hundred entries read at the same steady rate as forty.',
            },
            {
              t: 'Trial reels are called what they are',
              d: 'An Instagram trial reel is shown only to non-followers and never appears on the author’s profile, so it has no readable count and never will. It is reported as such rather than retried forever.',
            },
          ]}
        />
      </Panel>

      <Panel title="What this page does not do" i={3}>
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
