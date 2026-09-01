import { useEffect, useState, useCallback, useRef } from 'react'
import { confirm, notice } from '../lib/confirm'
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
import { formatDate, formatDateTimeTz, timeAgo, formatViews, formatMoney, detectPlatform, cx, challengeDeadline } from '../lib/utils'
import { groupByCreator, boardsFor, prizeForGroup } from '../lib/challengeGroups'
import { mdToHtml } from '../lib/richEditor'
import { useT } from '../lib/i18n'


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
  const tr = useT()
  const { id: routeId } = useParams()
  const id = challengeId || routeId
  const [searchParams] = useSearchParams()
  const { user, isAdmin } = useAuth()
  const [lifecycleBusy, setLifecycleBusy] = useState(false)

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

  // ---- MORE THAN ONE LEADERBOARD, AND CLAIMABLE BONUSES -------------------
  // Both are opt-in per challenge and both are empty on almost every one, so
  // every read path below falls through to exactly the behaviour that existed
  // before them. See lib/challengeGroups and migration 155.
  const [groups, setGroups] = useState([])
  const [groupMembers, setGroupMembers] = useState([])
  const [bonusRules, setBonusRules] = useState([])
  const [bonusClaims, setBonusClaims] = useState([])
  // Which bonuses the creator has ticked in the submit form, before they send.
  const [claiming, setClaiming] = useState([])
  // The board being read on the leaderboard tab. Null means "mine", which is
  // the question a leaderboard is opened to answer.
  const [board, setBoard] = useState(null)

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

    // THE GROUPS, IF THIS CHALLENGE HAS ANY.
    //
    // Four small reads rather than one big one, because three of them are
    // usually empty: most challenges have no groups and no claimable bonuses,
    // and an empty table returns nothing rather than costing a join on every
    // challenge page in the platform. See lib/challengeGroups.
    const [{ data: gs }, { data: gms }, { data: brules }, { data: claims }] = await Promise.all([
      supabase.from('challenge_groups').select('*').eq('challenge_id', id).order('position'),
      supabase.from('challenge_group_members').select('group_id, creator_id').eq('challenge_id', id),
      supabase.from('point_rules')
        .select('id, label, points, prompt')
        .eq('challenge_id', id).eq('kind', 'bonus').eq('is_active', true)
        .not('prompt', 'is', null).order('position'),
      supabase.from('submission_bonus_claims').select('submission_id, rule_id, creator_id').eq('challenge_id', id),
    ])
    setGroups(gs ?? [])
    setGroupMembers(gms ?? [])
    setBonusRules(brules ?? [])
    setBonusClaims(claims ?? [])

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
    // `select().single()` because the bonus claims below have to point at the
    // row that was just written, and a second read to find it would be a race
    // with anything else this creator is doing.
    const { data: entry, error } = await supabase.from('submissions').insert({
      creator_id: user.id,
      challenge_id: id,
      platform,
      video_url: url,
      caption: caption.trim(),
    }).select('id').single()
    if (error) { setSubmitting(false); return fail('', error.message) }

    // THE CLAIMS ARE WRITTEN AFTER THE ENTRY AND THEY ARE NOT FATAL.
    //
    // If this insert fails the video is still entered, which is the thing that
    // matters and the thing that is hard to redo. A claim that did not land can
    // be ticked again from the entry card, so the failure is recoverable in
    // place; losing the entry would not be. The points follow from the claim
    // through `recalc_challenge_points_internal`, so nothing here awards
    // anything directly.
    if (entry && claiming.length > 0) {
      await supabase.from('submission_bonus_claims').insert(
        claiming.map((rule_id) => ({
          submission_id: entry.id, rule_id, creator_id: user.id, challenge_id: id,
        })),
      )
    }
    setSubmitting(false)

    setShowSubmit(false)
    setVideoUrl('')
    setCaption('')
    setClaiming([])
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

  // Claiming a bonus on an entry that is already in. Optimistic, because the
  // points recalculate server-side and a button that waits for that reads as
  // having done nothing.
  async function claimBonus(sub, rule) {
    setBonusClaims((cur) => [...cur, { submission_id: sub.id, rule_id: rule.id, creator_id: user.id }])
    const { error } = await supabase.from('submission_bonus_claims').insert({
      submission_id: sub.id, rule_id: rule.id, creator_id: user.id, challenge_id: id,
    })
    if (error) {
      setBonusClaims((cur) => cur.filter((c) => !(c.submission_id === sub.id && c.rule_id === rule.id)))
      await notice('Could not claim that bonus. Please try again.')
    }
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

  // draft -> active -> ended -> archived. The same four states the manage list
  // moved a challenge through, minus the list.
  async function setChallengeStatus(status) {
    const verb = { active: 'publish', ended: 'close entries on', archived: 'archive' }[status]
    if (!await confirm(`Really ${verb} "${challenge.title}"?`)) return
    setLifecycleBusy(true)
    const { error } = await supabase.from('challenges').update({ status }).eq('id', id)
    setLifecycleBusy(false)
    if (error) { notice(`Could not update: ${error.message}`); return }
    setChallenge((c) => ({ ...c, status }))
  }

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
        <EmptyState icon={<Icon name="flag" className="h-7 w-7" />} title={tr("Challenge not found")} action={<Link to="/challenges" className="btn-primary">{tr("All challenges")}</Link>} />
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
  // ---- WHICH BOARD AM I ON ------------------------------------------------
  const byCreator = groupByCreator(groupMembers)
  const boards = boardsFor(groups, byCreator, results.length ? results : submissions)
  const myGroupId = byCreator.get(user.id) ?? null
  const myGroup = groups.find((g) => g.id === myGroupId) || null
  // The prize this viewer is actually racing for. `prizeForGroup` returns the
  // challenge itself for somebody in no group, so everything downstream reads
  // one shape whether or not the challenge is split.
  const myPrize = myGroup ? prizeForGroup(myGroup, challenge) : challenge
  // How many creators are on each board. From the MEMBERSHIP, not from who has
  // entered: "you are ranked against 21 creators" is a fact about the group,
  // and counting entrants instead would make the number climb all month.
  const boardCounts = new Map()
  for (const m of groupMembers) boardCounts.set(m.group_id, (boardCounts.get(m.group_id) || 0) + 1)
  // `board` is declared with the other hooks, above the loading guard - this
  // whole block runs after an early return.
  const shownBoard = board ?? myGroupId ?? boards[0]?.id ?? null
  const shownPrize = boards.length > 1
    ? prizeForGroup(boards.find((g) => g.id === shownBoard) || {}, challenge)
    : null
  const boardRows = boards.length > 0
    ? results.filter((r) => (byCreator.get(r.creator_id) ?? null) === shownBoard)
    : results
  // Ranks are stored per board (migration 154), so a group's rows already read
  // 1, 2, 3 and nothing has to be renumbered here.

  // WHAT *YOU* ARE PLAYING FOR, WHICH IS NOT ALWAYS WHAT THE CHALLENGE SAYS.
  //
  // A challenge split into boards can pay each of them differently (migrations
  // 154, 158, 159), and this page was printing the CHALLENGE's breakdown to
  // everybody: a creator in a group racing for its own 300 euros read the
  // brief's prize list and saw the other board's prizes. `prizeForGroup` is the
  // same fall-through the payout applies in SQL, so what is promised here is
  // what actually gets awarded - which is the only version of this worth
  // shipping.
  const prizes = Array.isArray(myPrize?.prize_structure) ? myPrize.prize_structure : []

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
    myPrize?.participation_threshold && myPrize?.participation_prize
      ? { threshold: myPrize.participation_threshold, prize: myPrize.participation_prize }
      : parseParticipationPrize(prizes)
  // COUNTED ON MY OWN BOARD, not across the challenge. The sentence this feeds
  // is "post 3+ videos to earn X - 4 earned so far", and X is my board's
  // reward: totalling the other board's creators into it would be counting
  // people who are earning something else.
  // And the same answer for whichever board is being LOOKED at, which is only
  // different from mine while somebody is reading another group's tab.
  const boardParticipation = shownPrize
    ? (shownPrize.participation_threshold && shownPrize.participation_prize
      ? { threshold: shownPrize.participation_threshold, prize: shownPrize.participation_prize }
      : parseParticipationPrize(shownPrize.prize_structure ?? []))
    : participation
  const earnedVoucherCount = participation
    ? Object.entries(subCountByCreator)
      .filter(([cid, n]) => n >= participation.threshold
        && (boards.length === 0 || (byCreator.get(cid) ?? null) === myGroupId))
      .length
    : 0

  // ---- BONUSES A CREATOR CLAIMS ------------------------------------------
  const claimsBySubmission = new Map()
  for (const c of bonusClaims) {
    if (!claimsBySubmission.has(c.submission_id)) claimsBySubmission.set(c.submission_id, new Set())
    claimsBySubmission.get(c.submission_id).add(c.rule_id)
  }
  const bonusById = new Map(bonusRules.map((r) => [r.id, r]))

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
            {/* RUNNING A CHALLENGE HAPPENS ON THE CHALLENGE.
                Publish, close and archive used to live on a separate
                "Manage challenges" list, which meant the page showing you a
                challenge could not change its state and the page that could
                change it did not show you the challenge. Ethan asked for that
                page to go; these are the controls that were worth keeping, on
                the page they are about. */}
            {isAdmin && (
              <>
                <Link to={`/admin/challenges/${id}/edit`} className="btn-secondary !py-2 text-xs">{tr("Edit")}</Link>
                <Link to={`/admin/challenges/${id}/results`} className="btn-secondary !py-2 text-xs">{tr("Results")}</Link>
                {challenge.status === 'draft' && (
                  <button onClick={() => setChallengeStatus('active')} disabled={lifecycleBusy} className="btn-primary !py-2 text-xs">
                    {tr("Publish")}
                  </button>
                )}
                {challenge.status === 'active' && (
                  <button onClick={() => setChallengeStatus('ended')} disabled={lifecycleBusy} className="btn-secondary !py-2 text-xs">
                    {tr("Close entries")}
                  </button>
                )}
                {challenge.status === 'ended' && (
                  <button onClick={() => setChallengeStatus('archived')} disabled={lifecycleBusy} className="btn-secondary !py-2 text-xs">
                    {tr("Archive")}
                  </button>
                )}
              </>
            )}
            {isLive ? <Badge tone="brand">{tr("Live")}</Badge> : <Badge tone="grey">{challenge.status}</Badge>}
          </div>
        }
      />

      {/* Countdown + enter CTA for live challenges */}
      {isLive && (
        <div className="mb-10 flex flex-col items-start gap-6 rounded-card bg-brand-tint/60 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-8">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-brand">{tr("Closes in")}</p>
            <CountdownTimer endDate={challenge.end_date} />
          </div>
          <button onClick={() => setShowSubmit(true)} className="btn-primary">
            {myEntries.length > 0 ? '+ Add another entry' : 'Submit your video 🎬'}
          </button>
        </div>
      )}

      {/* WHICH BOARD YOU ARE ON, SAID PLAINLY AND SAID EARLY.
          Ethan: "the creator would need to know what group they're in clearly."
          It sits directly under the countdown, above the tabs, because it
          changes the meaning of everything below it - the entries you are
          compared against, the leaderboard you appear on and the prize you are
          playing for are all your group's, not the challenge's. It only draws
          at all on a challenge that has groups. */}
      {groups.length > 0 && (
        <div className={cx(
          'mb-10 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-card border px-5 py-4',
          myGroup ? 'border-brand/25 bg-brand-tint/40' : 'border-dashed border-gray-200 bg-cloud/40',
        )}>
          <Icon name={myGroup ? 'trophy' : 'alert'} className={cx('h-5 w-5 shrink-0', myGroup ? 'text-brand' : 'text-smoke')} />
          {myGroup ? (
            <>
              <p className="text-sm">
                {tr("You are in")} <span className="font-bold text-brand">{myGroup.name}</span>.
                {' '}You are ranked against the {boardCounts.get(myGroup.id) || 0} {(boardCounts.get(myGroup.id) || 0) === 1 ? 'creator' : 'creators'} in it, not the whole market.
              </p>
              {myPrize?.prize_amount != null && (
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-brand shadow-card">
                  {myGroup.name} prize: {formatMoney(myPrize.prize_amount, myPrize.prize_currency)}
                  {myPrize.winners_count ? ` · ${myPrize.winners_count} ${myPrize.winners_count === 1 ? 'winner' : 'winners'}` : ''}
                </span>
              )}
            </>
          ) : (
            <p className="text-sm text-smoke">
              This challenge runs {groups.length} separate leaderboards and you have not been put
              in one yet. You can still enter - ask the team which group you are in.
            </p>
          )}
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
            {/* THE BRIEF IS RENDERED, NOT PRINTED.
                It was `whitespace-pre-line` over the raw column, which is what
                a brief looked like before there was an editor - and the admin
                form has had a full WYSIWYG for months. So every heading a
                writer set arrived here as a line beginning with hashes, every
                bold run as asterisks, and every bullet as a hyphen. The one
                thing the toolbar promises is that the brief looks the way it
                looked while you were writing it.
                `mdToHtml` is the same function the editor seeds itself with -
                so this is literally the editor's own output - and it escapes
                its input before it builds any tag (see the note in
                lib/richEditor; the attacker there is a creator and the victim
                is the team). `rt-editor` is the stylesheet those tags are
                already written for. */}
            <section className="card">
              <h2 className="mb-3 text-lg font-semibold">{tr("The brief")}</h2>
              <div
                className="rt-editor leading-relaxed text-smoke"
                dangerouslySetInnerHTML={{ __html: mdToHtml(challenge.description || '') }}
              />
            </section>
            {challenge.rules && (
              <section className="card">
                <h2 className="mb-3 text-lg font-semibold">{tr("Rules")}</h2>
                <div
                  className="rt-editor leading-relaxed text-smoke"
                  dangerouslySetInnerHTML={{ __html: mdToHtml(challenge.rules) }}
                />
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
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-smoke">{tr("Prizes")}</h2>
              <ul className="space-y-3">
                {prizes.map((p, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 text-sm">
                    <span className={cx('font-medium', i === 0 && 'text-brand')}>
                      {i === 0 && '🥇 '}{i === 1 && '🥈 '}{i === 2 && '🥉 '}{p.place}
                    </span>
                    <span className="text-smoke">{p.prize}</span>
                  </li>
                ))}
                {prizes.length === 0 && <li className="text-sm text-smoke">{tr("Prize details coming soon.")}</li>}
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
              <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-smoke">{tr("Platforms that count")}</h2>
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
            title={tr("No submissions yet. Be the first to enter!")}
            hint={isLive ? 'Paste your video link and claim the early-bird bragging rights.' : 'This challenge closed without entries.'}
            action={isLive && <button onClick={() => setShowSubmit(true)} className="btn-primary">{tr("Submit your video")}</button>}
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
                      {/* THE DATE AND THE TIME, NOT "1 DAY AGO".
                          Ethan: "on challenges, show the date and time a video
                          was submitted, not just 1 day ago or about 1 month
                          ago." A relative stamp is arithmetic the reader has to
                          undo, and on a challenge it is the one fact that
                          settles a deadline argument - "about 1 month ago" is
                          not evidence of anything. Shown in the reader's own
                          zone, with the zone named. */}
                      <p className="text-xs text-smoke">{formatDateTimeTz(s.submitted_at)}</p>
                    </div>
                  </div>
                  {s.caption && <p className="text-sm text-smoke line-clamp-3">{s.caption}</p>}
                  {s.logged_views != null && (
                    <p className="text-sm font-semibold text-brand">{formatViews(s.logged_views)} logged views</p>
                  )}

                  {/* ---- WHAT THIS ENTRY CLAIMED ----
                      Ethan: "it should show +1 point or plus x points on the
                      entry card, because then the admin can easily check and
                      ensure that it's correct and no one is cheating."
                      That is the whole answer to trusting a creator with a tick
                      box: the claim sits beside the video on a page an admin
                      already reads, so checking is looking rather than
                      auditing. Everybody sees these, not just the team - a
                      claim made in public is a claim people are careful about.
                      An admin can take one back from /admin/challenges/:id/results. */}
                  {(claimsBySubmission.get(s.id)?.size > 0) && (
                    <div className="flex flex-wrap gap-1.5">
                      {[...claimsBySubmission.get(s.id)].map((ruleId) => {
                        const r = bonusById.get(ruleId)
                        if (!r) return null
                        return (
                          <span key={ruleId} title={r.prompt || r.label}
                            className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700">
                            <Icon name="check" className="h-3 w-3" /> +{r.points} {r.label}
                          </span>
                        )
                      })}
                    </div>
                  )}

                  {/* A BONUS ADDED AFTER YOU ENTERED IS STILL CLAIMABLE.
                      "Admins can do this at the beginning or in the middle of a
                      challenge, it should always update correctly." A rule
                      created on the fifteenth cannot have been offered to
                      anybody who submitted on the third, and asking them to
                      delete and re-post their video to claim it would be
                      absurd. So an unclaimed bonus shows on your OWN entries
                      while the challenge is live. */}
                  {isLive && s.creator_id === user.id
                    && bonusRules.some((r) => !claimsBySubmission.get(s.id)?.has(r.id)) && (
                    <div className="rounded-xl border border-dashed border-brand/30 bg-brand-tint/20 p-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-brand">
                        {tr("Bonus points you can still claim")}
                      </p>
                      <div className="space-y-1.5">
                        {bonusRules.filter((r) => !claimsBySubmission.get(s.id)?.has(r.id)).map((r) => (
                          <button
                            key={r.id}
                            type="button"
                            onClick={() => claimBonus(s, r)}
                            className="flex w-full items-center gap-2 rounded-lg bg-white px-3 py-2 text-left text-xs transition-transform duration-200 hover:-translate-y-0.5"
                          >
                            <span className="min-w-0 flex-1">{r.prompt}</span>
                            <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">+{r.points}</span>
                          </button>
                        ))}
                      </div>
                    </div>
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
                      {tr("Open Link")}
                    </a>
                    {s.creator_id === user.id && isLive && (
                      <button onClick={() => removeMySubmission(s.id)} className="btn-danger !py-2 text-xs">{tr("Remove")}</button>
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
                <p className="text-sm font-semibold text-brand">{tr("Current leaderboard")}</p>
                <p className="text-xs text-smoke">
                  Views logged so far{challenge.results_updated_at ? ` · updated ${timeAgo(challenge.results_updated_at)}` : ''}. These can still change. Final results are counted after the challenge closes.
                </p>
              </div>
            </div>
          ) : challenge.results_status === 'final' ? (
            <div className="flex items-start gap-3 rounded-card border border-green-200 bg-green-50 px-5 py-4">
              <Icon name="trophy" className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />
              <div>
                <p className="text-sm font-semibold text-green-700">{tr("Final results")}</p>
                <p className="text-xs text-green-700/80">{tr("The challenge has closed and these standings are final.")}</p>
              </div>
            </div>
          ) : null}

          {/* ONE TAB PER BOARD, AND IT OPENS ON YOURS.
              A challenge with groups has more than one leaderboard and they are
              not a ranking of each other - they are separate races for separate
              prizes. Stacking them would make the second one look like the
              bottom of the first. It opens on the creator's own board because
              "how am I doing" is the question a leaderboard is opened to
              answer; the others are one press away. */}
          {boards.length > 1 && (
            <div className="flex flex-wrap gap-2">
              {boards.map((g) => (
                <button
                  key={g.id ?? 'ungrouped'}
                  type="button"
                  onClick={() => setBoard(g.id)}
                  aria-pressed={shownBoard === g.id}
                  className={cx(
                    'rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200',
                    shownBoard === g.id
                      ? 'bg-brand text-white shadow-card'
                      : 'bg-cloud text-smoke hover:-translate-y-0.5 hover:text-ink',
                  )}
                >
                  {g.name}
                  {g.id === myGroupId && <span className="ml-1.5 text-xs font-medium opacity-80">you</span>}
                </button>
              ))}
            </div>
          )}

          {boards.length > 1 && shownPrize?.prize_amount != null && (
            <p className="text-xs text-smoke">
              {boards.find((g) => g.id === shownBoard)?.name} is playing for{' '}
              <span className="font-semibold text-brand">{formatMoney(shownPrize.prize_amount, shownPrize.prize_currency)}</span>
              {shownPrize.winners_count ? ` across ${shownPrize.winners_count} ${shownPrize.winners_count === 1 ? 'place' : 'places'}` : ''}.
            </p>
          )}

          {/* THE BOARD ON SHOW, WHICH IS NOT ALWAYS MINE. The voucher badge on
              a leaderboard row means "this creator earned the reward", and on
              another group's tab that reward is that group's. */}
          <ChallengeLeaderboard
            rows={boardRows}
            meId={user.id}
            participation={boardParticipation}
            subCountByCreator={subCountByCreator}
            platformsFor={submittedPlatforms}
          />
          {boardRows.length === 0 && (
            <p className="rounded-card border border-dashed border-gray-200 px-5 py-6 text-center text-sm text-smoke">
              {tr("Nobody on this board has a logged view count yet.")}
            </p>
          )}
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
      <Modal open={showSubmit} onClose={() => setShowSubmit(false)} title={tr("Submit your entry")}>
        <form onSubmit={submitEntry} noValidate className="space-y-5">
          <div>
            <label htmlFor="video_url" className="label">{tr("Video link")}</label>
            <input
              id="video_url"
              type="text"
              inputMode="url"
              autoComplete="off"
              spellCheck={false}
              aria-invalid={errorField === 'url'}
              aria-describedby={submitError ? 'submit-error' : undefined}
              className={cx('input', errorField === 'url' && '!border-red-300 !ring-2 !ring-red-100')}
              placeholder={tr("Paste your Instagram, TikTok, YouTube or Facebook link…")}
              value={videoUrl}
              onChange={(e) => {
                setVideoUrl(e.target.value)
                if (errorField === 'url') { setSubmitError(''); setErrorField('') }
              }}
            />
            {videoUrl.trim() && !urlProblem(videoUrl) && (
              <p className="mt-2 text-xs text-smoke">
                {tr("Detected platform:")} <span className="font-semibold text-ink">{detectPlatform(normaliseUrl(videoUrl))}</span>
              </p>
            )}
          </div>
          <div>
            <label htmlFor="caption" className="label">{tr("Caption")}</label>
            <textarea
              id="caption"
              rows={3}
              aria-invalid={errorField === 'caption'}
              aria-describedby={submitError ? 'submit-error' : undefined}
              className={cx('input', errorField === 'caption' && '!border-red-300 !ring-2 !ring-red-100')}
              placeholder={tr("The caption you used, or a note for the team…")}
              value={caption}
              onChange={(e) => {
                setCaption(e.target.value)
                if (errorField === 'caption') { setSubmitError(''); setErrorField('') }
              }}
            />
          </div>
          {/* ---- THE BONUSES THIS VIDEO MIGHT HAVE EARNED ----
              Ethan: "there should be a check box asking them if they posted a
              video on the certain thing to get the bonus point. Ticking the box
              would then automatically update the points and this would mean the
              points system is fully automated again, no manual checking."
              Only bonuses the admin wrote a QUESTION for appear here - see
              migration 155 and the prompt field in PointRulesEditor. A bonus
              with no question is still awarded by an admin by hand, exactly as
              bonuses have always worked.
              The points are stated on every line. A tick box that does not say
              what it is worth is a tick box people leave alone. */}
          {bonusRules.length > 0 && (
            <div className="rounded-xl border border-gray-200 bg-cloud/40 p-4">
              <p className="text-sm font-semibold">{tr("Bonus points")}</p>
              <p className="mb-3 text-xs text-smoke">
                {tr("Tick anything this video qualifies for. The team can see what you ticked next to the video.")}
              </p>
              <div className="space-y-2">
                {bonusRules.map((r) => (
                  <label key={r.id} className="flex cursor-pointer items-start gap-3 rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 transition-colors hover:border-brand/40">
                    <input
                      type="checkbox"
                      checked={claiming.includes(r.id)}
                      onChange={(e) => setClaiming((cur) => (
                        e.target.checked ? [...cur, r.id] : cur.filter((x) => x !== r.id)
                      ))}
                      className="mt-0.5 h-4 w-4 shrink-0 accent-[#d94407]"
                    />
                    <span className="min-w-0 flex-1 text-sm text-ink">{r.prompt}</span>
                    <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">
                      +{r.points}
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

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
