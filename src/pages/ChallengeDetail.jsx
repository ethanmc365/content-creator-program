import { useEffect, useState, useCallback } from 'react'
import { confirm } from '../lib/confirm'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import CountdownTimer from '../components/CountdownTimer'
import Icon from '../components/Icon'
import PlatformBadges from '../components/PlatformBadges'
import VideoThumb from '../components/VideoThumb'
import { Avatar, Badge, Modal, PageHeader, Skeleton, EmptyState, Spinner } from '../components/ui'
import { formatDate, timeAgo, formatViews, detectPlatform, cx, challengeDeadline } from '../lib/utils'

// One challenge: full brief, prizes, live countdown, the submissions gallery,
// a "submit your link" flow, and (once results are in) the leaderboard.
export default function ChallengeDetail() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const { user, isAdmin } = useAuth()

  const [challenge, setChallenge] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('brief') // brief | entries | leaderboard
  // Captured once so it stays pure during render; a fresh page load re-reads it.
  const [nowMs] = useState(() => Date.now())

  // Submission form state
  const [showSubmit, setShowSubmit] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const load = useCallback(async () => {
    const [{ data: ch }, { data: subs }, { data: res }] = await Promise.all([
      supabase.from('challenges').select('*').eq('id', id).single(),
      supabase
        .from('submissions')
        .select('*, profiles:creator_id(id, name, photo_url)')
        .eq('challenge_id', id)
        .order('submitted_at', { ascending: false }),
      supabase
        .from('results')
        .select('*, profiles:creator_id(id, name, photo_url, instagram_url, tiktok_url, youtube_url)')
        .eq('challenge_id', id)
        .order('rank'),
    ])
    setChallenge(ch)
    setSubmissions(subs ?? [])
    setResults(res ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => { load() }, [load])

  // Jump straight to the leaderboard for finished challenges with results.
  useEffect(() => {
    if (challenge && challenge.status !== 'active' && results.length > 0) setTab('leaderboard')
  }, [challenge, results.length])

  // ?submit=1 (the Home quick action) opens the submit form immediately.
  useEffect(() => {
    if (challenge && searchParams.get('submit')) setShowSubmit(true)
  }, [challenge]) // eslint-disable-line react-hooks/exhaustive-deps

  async function submitEntry(e) {
    e.preventDefault()
    setSubmitError('')
    const platform = detectPlatform(videoUrl)
    if (!challenge.platforms.includes(platform)) {
      setSubmitError(`That looks like a ${platform} link. This challenge accepts: ${challenge.platforms.join(', ')}.`)
      return
    }
    setSubmitting(true)
    const { error } = await supabase.from('submissions').insert({
      creator_id: user.id,
      challenge_id: id,
      platform,
      video_url: videoUrl.trim(),
      caption: caption.trim(),
    })
    setSubmitting(false)
    if (error) {
      setSubmitError(error.message)
      return
    }
    setShowSubmit(false)
    setVideoUrl('')
    setCaption('')
    load()
  }

  async function removeMySubmission(subId) {
    if (!await confirm('Remove this entry?')) return
    await supabase.from('submissions').delete().eq('id', subId)
    load()
  }

  if (loading) {
    return (
      <div className="page space-y-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!challenge) {
    return (
      <div className="page">
        <EmptyState emoji="🧭" title="Challenge not found" action={<Link to="/challenges" className="btn-primary">All challenges</Link>} />
      </div>
    )
  }

  // Live only while active AND before the deadline (midnight after the end date).
  const isLive = challenge.status === 'active' && nowMs < challengeDeadline(challenge.end_date).getTime()
  const myEntries = submissions.filter((s) => s.creator_id === user.id)
  const prizes = Array.isArray(challenge.prize_structure) ? challenge.prize_structure : []

  const TABS = [
    { key: 'brief', label: 'The brief' },
    { key: 'entries', label: `Entries (${submissions.length})` },
    ...(results.length > 0 ? [{ key: 'leaderboard', label: '🏆 Leaderboard' }] : []),
  ]

  return (
    <div className="page">
      <Link to="/challenges" className="mb-6 inline-block text-sm font-medium text-smoke hover:text-brand">← All challenges</Link>

      <PageHeader
        title={challenge.title}
        subtitle={`${formatDate(challenge.start_date)} → ${formatDate(challenge.end_date)}`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            {isAdmin && (
              <>
                <Link to={`/admin/challenges/${id}/edit`} className="btn-secondary !py-2 text-xs">Edit</Link>
                <Link to={`/admin/challenges/${id}/results`} className="btn-secondary !py-2 text-xs">Enter results</Link>
              </>
            )}
            {isLive ? <Badge tone="brand">Live</Badge> : <Badge tone="grey">{challenge.status}</Badge>}
          </div>
        }
      />

      {/* Countdown + enter CTA for live challenges */}
      {isLive && (
        <div className="mb-10 flex flex-col items-start gap-6 rounded-card bg-brand-tint/60 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand">Closes in</p>
            <CountdownTimer endDate={challenge.end_date} />
          </div>
          <button onClick={() => setShowSubmit(true)} className="btn-primary">
            {myEntries.length > 0 ? '+ Add another entry' : 'Submit your video 🎬'}
          </button>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-8 flex gap-2 border-b border-gray-100" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cx(
              '-mb-px border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              tab === t.key ? 'border-brand text-brand' : 'border-transparent text-smoke hover:text-ink'
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ---------- Tab: brief ---------- */}
      {tab === 'brief' && (
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          <div className="space-y-8 lg:col-span-2">
            <section className="card">
              <h2 className="mb-3 text-lg font-semibold">The brief</h2>
              <p className="whitespace-pre-line leading-relaxed text-smoke">{challenge.description}</p>
            </section>
            {challenge.rules && (
              <section className="card">
                <h2 className="mb-3 text-lg font-semibold">Rules</h2>
                <p className="whitespace-pre-line leading-relaxed text-smoke">{challenge.rules}</p>
              </section>
            )}
          </div>

          <div className="space-y-6">
            <section className="card !p-6">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-smoke">Prizes</h2>
              <ul className="space-y-3">
                {prizes.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 text-sm">
                    <span className={cx('font-medium', i === 0 && 'text-brand')}>
                      {i === 0 && '🥇 '}{i === 1 && '🥈 '}{i === 2 && '🥉 '}{p.place}
                    </span>
                    <span className="text-smoke">{p.prize}</span>
                  </li>
                ))}
                {prizes.length === 0 && <li className="text-sm text-smoke">Prize details coming soon.</li>}
              </ul>
            </section>

            <section className="card !p-6">
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-smoke">Platforms that count</h2>
              <PlatformBadges platforms={challenge.platforms} size="md" />
            </section>

          </div>
        </div>
      )}

      {/* ---------- Tab: entries gallery ---------- */}
      {tab === 'entries' && (
        submissions.length === 0 ? (
          <EmptyState
            emoji="🎬"
            title="No submissions yet. Be the first to enter!"
            hint={isLive ? 'Paste your video link and claim the early-bird bragging rights.' : 'This challenge closed without entries.'}
            action={isLive && <button onClick={() => setShowSubmit(true)} className="btn-primary">Submit your video</button>}
          />
        ) : (
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {submissions.map((s) => (
              <div key={s.id} className="card group flex flex-col overflow-hidden !p-0">
                <a href={s.video_url} target="_blank" rel="noopener noreferrer" className="block">
                  <VideoThumb url={s.video_url} platform={s.platform} className="rounded-b-none" />
                </a>
                <div className="flex flex-1 flex-col gap-4 p-6">
                  <div className="flex items-center gap-3">
                    <Link to={`/profile/${s.profiles?.id}`}>
                      <Avatar src={s.profiles?.photo_url} name={s.profiles?.name} size="sm" />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <Link to={`/profile/${s.profiles?.id}`} className="block truncate text-sm font-semibold hover:text-brand">
                        {s.profiles?.name}
                      </Link>
                      <p className="text-xs text-smoke">{timeAgo(s.submitted_at)}</p>
                    </div>
                  </div>
                  {s.caption && <p className="text-sm text-smoke line-clamp-3">{s.caption}</p>}
                  {s.logged_views != null && (
                    <p className="text-sm font-semibold text-brand">{formatViews(s.logged_views)} logged views</p>
                  )}
                  <div className="mt-auto flex gap-2">
                    <a href={s.video_url} target="_blank" rel="noopener noreferrer" className="btn-secondary flex-1 !py-2 text-xs">
                      Watch ↗
                    </a>
                    {s.creator_id === user.id && isLive && (
                      <button onClick={() => removeMySubmission(s.id)} className="btn-danger !py-2 text-xs">Remove</button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )
      )}

      {/* ---------- Tab: leaderboard ---------- */}
      {tab === 'leaderboard' && (
        <div className="space-y-4">
          {/* Interim vs final banner so creators know if these standings are live. */}
          {challenge.results_status === 'interim' ? (
            <div className="flex items-start gap-3 rounded-card border border-brand/20 bg-brand-tint/60 px-5 py-4">
              <Icon name="clock" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              <div>
                <p className="text-sm font-semibold text-brand">Current leaderboard</p>
                <p className="text-xs text-smoke">
                  Views logged so far{challenge.results_updated_at ? ` · updated ${timeAgo(challenge.results_updated_at)}` : ''}. These can still change. Final results are counted after the challenge closes.
                </p>
              </div>
            </div>
          ) : challenge.results_status === 'final' ? (
            <div className="flex items-start gap-3 rounded-card border border-green-200 bg-green-50 px-5 py-4">
              <Icon name="trophy" className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              <div>
                <p className="text-sm font-semibold text-green-700">Final results</p>
                <p className="text-xs text-green-700/80">The challenge has closed and these standings are final.</p>
              </div>
            </div>
          ) : null}

          <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
          {results.map((r) => {
            const mine = r.creator_id === user.id
            const medal = { 1: '🥇', 2: '🥈', 3: '🥉' }[r.rank]
            return (
              <div
                key={r.id}
                className={cx(
                  'flex items-center gap-4 border-b border-gray-50 px-5 py-4 last:border-0 sm:px-8',
                  mine && 'bg-brand-tint/60'
                )}
              >
                <span className={cx('w-10 text-center text-lg font-bold', r.rank <= 3 ? '' : 'text-smoke')}>
                  {medal || r.rank}
                </span>
                <Link to={`/profile/${r.profiles?.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar src={r.profiles?.photo_url} name={r.profiles?.name} size="sm" />
                  <span className="truncate text-sm font-semibold hover:text-brand">
                    {r.profiles?.name} {mine && <span className="ml-1 text-xs font-medium text-brand">(you)</span>}
                  </span>
                </Link>
                <PlatformBadges
                  platforms={['instagram_url', 'tiktok_url', 'youtube_url']
                    .filter((k) => r.profiles?.[k])
                    .map((k) => ({ instagram_url: 'Instagram', tiktok_url: 'TikTok', youtube_url: 'YouTube' }[k]))}
                  className="hidden sm:flex"
                />
                <span className="w-24 text-right text-sm font-bold tabular-nums">{formatViews(r.final_views)}</span>
              </div>
            )
          })}
          </div>
        </div>
      )}

      {/* ---------- Submit modal ---------- */}
      <Modal open={showSubmit} onClose={() => setShowSubmit(false)} title="Submit your entry">
        <form onSubmit={submitEntry} className="space-y-5">
          <div>
            <label htmlFor="video_url" className="label">Video link</label>
            <input
              id="video_url" type="url" required className="input"
              placeholder="Paste your Instagram or TikTok link…"
              value={videoUrl} onChange={(e) => setVideoUrl(e.target.value)}
            />
            {videoUrl && (
              <p className="mt-2 text-xs text-smoke">
                Detected platform: <span className="font-semibold text-ink">{detectPlatform(videoUrl)}</span>
              </p>
            )}
          </div>
          <div>
            <label htmlFor="caption" className="label">Caption <span className="font-normal text-smoke">(optional)</span></label>
            <textarea
              id="caption" rows={3} className="input"
              placeholder="The caption you used, or a note for the team…"
              value={caption} onChange={(e) => setCaption(e.target.value)}
            />
          </div>
          {submitError && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{submitError}</p>}
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? <Spinner /> : 'Enter the challenge'}
          </button>
        </form>
      </Modal>
    </div>
  )
}
