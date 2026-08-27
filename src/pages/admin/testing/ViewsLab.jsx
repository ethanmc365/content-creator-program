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
// HOW EACH PLATFORM IS ACTUALLY READ.
//
// One row per platform, and the same three questions answered for each, so they
// can be compared down a column instead of read as four paragraphs. "Exact"
// matters more than it sounds: a leaderboard ranks on these numbers.
const PLATFORMS = [
  {
    name: 'TikTok',
    how: 'The share link is followed to its canonical form and the video id read off TikTok\u2019s own oEmbed endpoint, which states the same stats as the video page in a third of the bytes.',
    exact: 'Exact',
    cost: 'One request per entry, and the id is cached on the entry so every later read is a single call. No account, no key.',
  },
  {
    name: 'YouTube',
    how: 'Watch links, youtu.be links, Shorts and embeds all reduce to the same eleven-character id, then the count comes from the official Data API v3. YouTube bot-blocks servers from reading its pages, so there is no scraping here at all.',
    exact: 'Exact',
    cost: 'One unit of a 10,000-a-day free quota per entry. A 500-video challenge is 5% of one day.',
  },
  {
    name: 'Instagram',
    how: 'Read off the creator\u2019s PUBLIC reels tab - which states a view count under every reel to anybody signed out - and matched to the entry by its shortcode. This is the scraper: it fetches a public page and reads a number out of it.',
    exact: 'Exact',
    cost: 'One request per CREATOR, not per video: a page of the reels tab carries twelve reels, so a creator with eight entries costs one call.',
  },
  {
    name: 'Facebook',
    how: 'The page title is the only place Facebook states a count, so that is what is read.',
    exact: 'Exact below 1,000; rounded above it',
    cost: 'One request per entry. Above a thousand Facebook rounds to two figures - "5.7K" is somewhere between 5,650 and 5,749 - so it is within about 1%, and the row says it is rounded.',
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
      title="View counts"
      icon="eye"
      sandbox={false}
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
        <div className="space-y-3">
          {PLATFORMS.map((p) => (
            <div key={p.name} className="rounded-card border border-gray-100 bg-white p-4">
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="text-[15px] font-semibold">{p.name}</span>
                <span className={
                  p.exact === 'Exact'
                    ? 'rounded-full bg-green-50 px-2.5 py-0.5 text-[11px] font-semibold text-green-700'
                    : 'rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700'
                }>
                  {p.exact}
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-smoke">{p.how}</p>
              <p className="mt-2 border-t border-gray-50 pt-2 text-xs leading-relaxed text-smoke">
                <span className="font-semibold text-ink">What it costs · </span>{p.cost}
              </p>
            </div>
          ))}
        </div>
        <Note icon="shield" className="mt-3">
          Only Instagram involves anything like a scraper, and it reads a page any signed-out visitor can
          open. It used to need a session cookie from a Tryp-owned account; Instagram warned that account
          for suspected automated behaviour, so the cookie was deleted and this replaced it. Nothing here
          can get a Tryp.com account flagged. It also reads what the post itself hides - a creator who has
          turned view counts off still shows them on their reels tab.
        </Note>
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
              t: 'A failure says which failure it was',
              d: 'A photo or carousel is called a photo or carousel. A reel that is not on the public tab \u2014 a private account, or a feed video rather than a reel \u2014 says exactly that. Neither is dressed up as the other, and neither is retried forever.',
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
