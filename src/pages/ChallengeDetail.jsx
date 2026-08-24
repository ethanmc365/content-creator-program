import { useEffect, useState, useCallback, useRef } from 'react'
import { confirm } from '../lib/confirm'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import ChallengeLeaderboard from '../components/ChallengeLeaderboard'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import CountdownTimer from '../components/CountdownTimer'
import Icon from '../components/Icon'
import PlatformBadges, { PLATFORM_ORDER } from '../components/PlatformBadges'
import VideoThumb from '../components/VideoThumb'
import VideoEmbedModal from '../components/VideoEmbedModal'
import SubmissionSuccess from '../components/SubmissionSuccess'
import ScoringPanel from '../components/network/ScoringPanel'
import ParticipationBar from '../components/network/ParticipationBar'
import { EntryFeedbackNote, EntryFeedbackEditor, loadFeedback } from '../components/EntryFeedback'
import { Avatar, Badge, Modal, PageHeader, Skeleton, EmptyState, Spinner } from '../components/ui'
import { formatDate, timeAgo, formatViews, detectPlatform, cx, challengeDeadline } from '../lib/utils'


// The submit form does its own validation so problems are shown in the branded
// card, never in Chrome's grey "Please enter a URL" speech bubble (which sits
// outside our design and can be suppressed by the browser).
function urlProblem(raw) {
  const value = (raw || '').trim()
  if (!value) return 'Paste the link to your video to enter.'
  // Creators habitually paste "tiktok.com/@me/video/123" with no scheme, which
  // is a perfectly good link - accept it and normalise instead of rejecting.
  const withScheme = /^https?:\/\//i.test(value) ? value : `https://${value}`
  let parsed
  try {
    parsed = new URL(withScheme)
  } catch {
    return "That doesn't look like a link. Copy the share link from the app and paste the whole thing."
  }
  if (!parsed.hostname.includes('.') || /\s/.test(value)) {
    return "That doesn't look like a link. Copy the share link from the app and paste the whole thing."
  }
  return null
}

/** Same normalisation as above, for what we actually store. */
function normaliseUrl(raw) {
  const value = (raw || '').trim()
  return /^https?:\/\//i.test(value) ? value : `https://${value}`
}

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
//
// EMBEDDED MODE
//
// A market's Challenges tab used to show a second live card with a second
// button that took you here, which is a click and a page load to reach the
// thing you had already asked for twice. Passing `challengeId` and `embedded`
// renders this exact page inside that tab instead: same brief, same entries,
// same leaderboard, same submit flow, no duplicate implementation to drift.
//
// Everything below behaves identically when the props are absent, which is what
// keeps the live UK challenge on /challenges/:id untouched.
// `marketParticipation` is how much of a market has entered, and is NOT the
// same thing as the `participation` computed below, which is the voucher
// threshold ("post 3+ videos"). Two very different numbers that both wanted the
// same word.
export default function ChallengeDetail({ challengeId = null, embedded = false, marketParticipation = null }) {
  const { id: routeId } = useParams()
  const id = challengeId || routeId
  const [searchParams] = useSearchParams()
  const { user, isAdmin } = useAuth()

  const [challenge, setChallenge] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('brief') // brief | entries | leaderboard
  const [playing, setPlaying] = useState(null) // submission being watched inline
  const [feedback, setFeedback] = useState({}) // submission id -> the team's note
  // Captured once so it stays pure during render; a fresh page load re-reads it.
  const [nowMs] = useState(() => Date.now())


  // Submission form state
  const [showSubmit, setShowSubmit] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [caption, setCaption] = useState('')
  const [submitError, setSubmitError] = useState('')
  const [errorField, setErrorField] = useState('') // 'url' | 'caption' - rings the offending input
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(null) // { count, platform } once an entry lands
  const deepLinkedRef = useRef(false) // ?submit=/?tab= are consumed once, not on every reload

  // WHO THE CHALLENGE IS OPEN TO.
  //
  // The participation bar only ever appeared when a market's Challenges tab
  // handed one down, so it showed under a challenge opened from inside Spain
  // and vanished from the SAME challenge opened from /challenges. That reads as
  // the bar being broken, and it was reported that way. It is not a fact about
  // where you happened to click; it is a fact about the challenge.
  //
  // The denominator is the challenge's own audience: the roster of the
  // community it belongs to, or every active creator for a challenge that has
  // no community (the legacy UK contest) or belongs to Worldwide, which
  // everybody is in. Admins and QA accounts are excluded from both halves, the
  // same rule every other member count here follows.
  const [audience, setAudience] = useState(null)

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
        .select('*, profiles:creator_id(id, name, photo_url, instagram_url, tiktok_url, youtube_url, facebook_url)')
        .eq('challenge_id', id)
        .order('rank'),
    ])
    setChallenge(ch)
    setSubmissions(subs ?? [])
    setResults(res ?? [])
    setLoading(false)

    // The team's notes on these entries. The policy decides what comes back -
    // an admin gets every row, a creator gets only their own - so there is one
    // query here and no branch on who is asking.
    setFeedback(await loadFeedback((subs ?? []).map((s) => s.id)))

    // The size of the roster this challenge is running in front of.
    if (ch?.community_id) {
      // The join column is `profile_id`. Same query MarketChallenges runs for
      // its own bar, so the two can never disagree about who counts.
      const { count } = await supabase
        .from('community_members')
        .select('profile_id, profiles!inner(is_admin, is_test, status)', { count: 'exact', head: true })
        .eq('community_id', ch.community_id)
        .eq('status', 'active')
        .eq('profiles.is_admin', false)
        .eq('profiles.is_test', false)
        .eq('profiles.status', 'active')
      setAudience(count ?? 0)
    } else {
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('is_admin', false)
        .eq('is_test', false)
      setAudience(count ?? 0)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  // Jump straight to the leaderboard for finished challenges with results.
  useEffect(() => {
    if (challenge && challenge.status !== 'active' && results.length > 0) setTab('leaderboard')
  }, [challenge, results.length])

  // Deep links from the home hero: ?submit=1 opens the submit form,
  // ?tab= lands on a tab other than the brief.
  //
  // This runs ONCE, the first time the challenge loads. It used to key off
  // [challenge] alone, so the load() after a successful submit handed back a
  // fresh challenge object, the effect re-ran, ?submit=1 was still sitting in
  // the URL and the form re-opened behind the success card.
  useEffect(() => {
    if (!challenge || deepLinkedRef.current) return
    deepLinkedRef.current = true
    if (searchParams.get('submit')) setShowSubmit(true)
    const t = searchParams.get('tab')
    if (t === 'entries' || t === 'brief' || t === 'leaderboard') setTab(t)
  }, [challenge]) // eslint-disable-line react-hooks/exhaustive-deps

  function fail(field, message) {
    setErrorField(field)
    setSubmitError(message)
  }

  async function submitEntry(e) {
    e.preventDefault()
    setSubmitError('')
    setErrorField('')

    const urlError = urlProblem(videoUrl)
    if (urlError) return fail('url', urlError)

    const url = normaliseUrl(videoUrl)
    const platform = detectPlatform(url)
    if (!challenge.platforms.includes(platform)) {
      return fail(
        'url',
        platform === 'Other'
          ? `We couldn't tell which platform that link is from. This challenge accepts: ${challenge.platforms.join(', ')}.`
          : `That looks like a ${platform} link. This challenge accepts: ${challenge.platforms.join(', ')}.`
      )
    }
    if (!caption.trim()) return fail('caption', 'Please add a caption for your entry.')

    setSubmitting(true)
    const { error } = await supabase.from('submissions').insert({
      creator_id: user.id,
      challenge_id: id,
      platform,
      video_url: url,
      caption: caption.trim(),
    })
    setSubmitting(false)
    if (error) return fail('', error.message)

    setShowSubmit(false)
    setVideoUrl('')
    setCaption('')
    // The reload below hasn't landed yet, so count this entry in by hand.
    const mine = submissions.filter((s) => s.creator_id === user.id).length
    setSuccess({ count: mine + 1, platform })
    load()
  }

  function submitAnother() {
    setSuccess(null)
    setSubmitError('')
    setErrorField('')
    setShowSubmit(true)
  }

  async function removeMySubmission(subId) {
    if (!await confirm('Remove this entry?')) return
    await supabase.from('submissions').delete().eq('id', subId)
    load()
  }

  // `page` owns the max-width and gutters. Embedded, the market page has
  // already applied both, and applying them twice indents the brief inside its
  // own tab.
  const shellClass = embedded ? '' : 'page'

  if (loading) {
    return (
      <div className={cx(shellClass, 'space-y-6')}>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }

  if (!challenge) {
    return (
      <div className={shellClass}>
        <EmptyState icon={<Icon name="flag" className="h-7 w-7" />} title="Challenge not found" action={<Link to="/challenges" className="btn-primary">All challenges</Link>} />
      </div>
    )
  }

  // Live only while active AND before the deadline (midnight after the end date).
  const isLive = challenge.status === 'active' && nowMs < challengeDeadline(challenge.end_date).getTime()
  const myEntries = submissions.filter((s) => s.creator_id === user.id)

  // Given, or worked out. `audience` is null until the count lands, which is
  // why this is not simply an `||` with a zero default: a bar that says
  // "0 of 0" for a moment and then jumps is worse than a bar that arrives.
  const participationShown = marketParticipation
    ? { data: marketParticipation, where: 'here' }
    : audience != null && audience > 0
      ? {
          data: {
            posted: new Set(submissions.map((s) => s.creator_id)).size,
            total: audience,
          },
          where: 'in this challenge',
        }
      : null
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
    <div className={shellClass}>
      {!embedded && (
        <Link to="/challenges" className="mb-6 inline-block text-sm font-medium text-smoke hover:text-brand">← All challenges</Link>
      )}

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

      {/* A market's Challenges tab passes its own numbers down, because it has
          already counted its roster and can say "here". Everywhere else the
          page works them out for itself rather than showing nothing. */}
      {isLive && (participationShown ? (
        <ParticipationBar
          participation={participationShown.data}
          where={participationShown.where}
          className="mb-10"
        />
      ) : null)}

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
            {/* How it is decided, which until now was stored on the row and
                shown nowhere. Somebody posting eight short videos into a
                best-video challenge is wasting their month.

                Legacy 'prize' challenges are deliberately excluded. The live UK
                challenge is one, and adding a provisional leaderboard to a
                contest people are already halfway through is a product change
                nobody asked for. New challenges pick one of the three modes and
                get the panel. */}
            {challenge.scoring && challenge.scoring !== 'prize' && (
              <ScoringPanel challenge={challenge} submissions={submissions} myId={user?.id} />
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
            icon={<Icon name="video" className="h-7 w-7" />}
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
                  {/* THE TEAM'S NOTE. The creator sees it on their own entry;
                      an admin sees the editor on every entry. Nobody else sees
                      anything, because nobody else's query returns a row. */}
                  {s.creator_id === user.id && <EntryFeedbackNote feedback={feedback[s.id]} />}
                  {isAdmin && (
                    <EntryFeedbackEditor
                      submissionId={s.id}
                      creatorName={s.profiles?.name?.split(' ')[0]}
                      feedback={feedback[s.id]}
                      onSaved={(row) => setFeedback((f) => ({ ...f, [s.id]: row }))}
                    />
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

          <ChallengeLeaderboard
            rows={results}
            meId={user.id}
            participation={participation}
            subCountByCreator={subCountByCreator}
            platformsFor={submittedPlatforms}
          />
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
      {/* noValidate: we validate ourselves so every problem is shown in the
          branded card below, not in the browser's own popup bubble. */}
      <Modal open={showSubmit} onClose={() => setShowSubmit(false)} title="Submit your entry">
        <form onSubmit={submitEntry} noValidate className="space-y-5">
          <div>
            <label htmlFor="video_url" className="label">Video link</label>
            <input
              id="video_url"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={errorField === 'url'}
              aria-describedby={submitError ? 'submit-error' : undefined}
              className={cx('input', errorField === 'url' && '!border-red-300 !ring-2 !ring-red-100')}
              placeholder="Paste your Instagram, TikTok, YouTube or Facebook link…"
              value={videoUrl}
              onChange={(e) => {
                setVideoUrl(e.target.value)
                if (errorField === 'url') { setSubmitError(''); setErrorField('') }
              }}
            />
            {videoUrl.trim() && !urlProblem(videoUrl) && (
              <p className="mt-2 text-xs text-smoke">
                Detected platform: <span className="font-semibold text-ink">{detectPlatform(normaliseUrl(videoUrl))}</span>
              </p>
            )}
          </div>
          <div>
            <label htmlFor="caption" className="label">Caption</label>
            <textarea
              id="caption"
              rows={3}
              aria-invalid={errorField === 'caption'}
              aria-describedby={submitError ? 'submit-error' : undefined}
              className={cx('input', errorField === 'caption' && '!border-red-300 !ring-2 !ring-red-100')}
              placeholder="The caption you used, or a note for the team…"
              value={caption}
              onChange={(e) => {
                setCaption(e.target.value)
                if (errorField === 'caption') { setSubmitError(''); setErrorField('') }
              }}
            />
          </div>
          {submitError && (
            <div
              id="submit-error"
              role="alert"
              className="flex items-start gap-3 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-600"
            >
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}
          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? <Spinner /> : 'Enter the challenge'}
          </button>
        </form>
      </Modal>

      {/* ---------- Entry submitted ---------- */}
      <SubmissionSuccess
        open={!!success}
        count={success?.count ?? 1}
        platform={success?.platform}
        onDone={() => { setSuccess(null); setTab('entries') }}
        onAddAnother={submitAnother}
      />
    </div>
  )
}
