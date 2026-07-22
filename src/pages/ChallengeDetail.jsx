import { useEffect, useState, useCallback } from 'react'
import { confirm } from '../lib/confirm'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import CountdownTimer from '../components/CountdownTimer'
import Icon from '../components/Icon'
import PlatformBadges from '../components/PlatformBadges'
import VideoThumb from '../components/VideoThumb'
import VideoEmbedModal from '../components/VideoEmbedModal'
import { Avatar, Badge, Modal, PageHeader, Skeleton, EmptyState, Spinner } from '../components/ui'
import { formatDate, timeAgo, formatViews, detectPlatform, cx, challengeDeadline } from '../lib/utils'

const PLATFORM_ORDER = ['Instagram', 'TikTok', 'YouTube', 'Other']

// A challenge can carry a "participation" prize that rewards posting N videos
// (e.g. "Post +3 videos"). We read the threshold + reward straight out of the
// admin's own prize breakdown so the leaderboard tracks exactly what's shown.
function parseParticipationPrize(prizes) {
  for (const p of prizes) {
    const place = p.place || ''
    const m = place.match(/(\d+)\s*\+?\s*videos?/i)
    if (m) return { threshold: Math.max(1, parseInt(m[1], 10)), prize: p.prize || 'Voucher' }
    if (/all valid entries|participation|every valid entry/i.test(place)) {
      return { threshold: 1, prize: p.prize || 'Voucher' }
    }
  }
  return null
}

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
  const [playing, setPlaying] = useState(null) // submission being watched inline
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
    if (!caption.trim()) {
      setSubmitError('Please add a caption for your entry.')
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

  // Which platforms each creator actually SUBMITTED on (for real platform icons)
  // and how many videos they posted (for the participation voucher).
  const platformsByCreator = {}
  const subCountByCreator = {}
  for (const s of submissions) {
    (platformsByCreator[s.creator_id] ||= new Set()).add(s.platform)
    subCountByCreator[s.creator_id] = (subCountByCreator[s.creator_id] || 0) + 1
  }
  const submittedPlatforms = (creatorId) =>
    PLATFORM_ORDER.filter((p) => platformsByCreator[creatorId]?.has(p))
  // Prefer the structured participation reward (set on the challenge form); fall
  // back to parsing a "Post +N videos" prize row for older challenges.
  const participation =
    challenge.participation_threshold && challenge.participation_prize
      ? { threshold: challenge.participation_threshold, prize: challenge.participation_prize }
      : parseParticipationPrize(prizes)
  const earnedVoucherCount = participation
    ? Object.values(subCountByCreator).filter((n) => n >= participation.threshold).length
    : 0

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
              {participation && (
                <p className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-gray-50 pt-3 text-xs text-smoke">
                  <Icon name="ticket" className="h-4 w-4 shrink-0 text-brand" />
                  Post {participation.threshold}+ videos to earn {participation.prize}.
                  {earnedVoucherCount > 0 && <span className="font-semibold text-green-700">{earnedVoucherCount} earned so far.</span>}
                </p>
              )}
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
                <button type="button" onClick={() => setPlaying(s)} className="block w-full text-left" aria-label={`Play ${s.profiles?.name || 'this'} entry`}>
                  <VideoThumb url={s.video_url} platform={s.platform} />
                </button>
                <div className="flex flex-1 flex-col gap-3 p-4">
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
                    <a
                      href={s.video_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary inline-flex flex-1 items-center justify-center gap-1.5 !py-2 text-xs"
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                        <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                      </svg>
                      Open Link
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
                {/* Voucher badge: this creator posted enough videos to earn the
                    participation prize. */}
                {participation && (subCountByCreator[r.creator_id] || 0) >= participation.threshold && (
                  <span
                    title={`Posted ${participation.threshold}+ videos`}
                    className="hidden shrink-0 items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700 sm:inline-flex"
                  >
                    <Icon name="ticket" className="h-3.5 w-3.5" /> {participation.prize}
                  </span>
                )}
                {/* Only the platforms this creator actually submitted on. */}
                <PlatformBadges platforms={submittedPlatforms(r.creator_id)} className="hidden sm:flex" />
                <span className="w-24 text-right text-sm font-bold tabular-nums">{formatViews(r.final_views)}</span>
              </div>
            )
          })}
          </div>
        </div>
      )}

      {/* ---------- Inline video player ---------- */}
      {playing && (
        <VideoEmbedModal
          url={playing.video_url}
          platform={playing.platform}
          title={[playing.profiles?.name, playing.caption].filter(Boolean).join(' · ')}
          onClose={() => setPlaying(null)}
        />
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
            <label htmlFor="caption" className="label">Caption</label>
            <textarea
              id="caption" rows={3} required className="input"
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
