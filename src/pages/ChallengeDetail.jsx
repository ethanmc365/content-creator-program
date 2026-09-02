import { useEffect, useState, useCallback, useRef } from 'react'
import { confirm, notice } from '../lib/confirm'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import ChallengeLeaderboard from '../components/ChallengeLeaderboard'
import Podium from '../components/Podium'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import CountdownTimer from '../components/CountdownTimer'
import Icon from '../components/Icon'
import { PLATFORM_ORDER } from '../components/PlatformBadges'
import SocialMark from '../components/SocialMark'
import VideoThumb from '../components/VideoThumb'
import VideoEmbedModal from '../components/VideoEmbedModal'
import SubmissionSuccess from '../components/SubmissionSuccess'
import ScoringPanel from '../components/network/ScoringPanel'
import ParticipationBar from '../components/network/ParticipationBar'
import { EntryFeedbackNote, EntryFeedbackEditor, loadFeedback } from '../components/EntryFeedback'
import { Avatar, Badge, Modal, PageHeader, Skeleton, EmptyState, Spinner } from '../components/ui'
import { formatDate, formatDateTimeTz, timeAgo, formatViews, formatMoney, detectPlatform, cx, challengeDeadline } from '../lib/utils'
import { groupByCreator, boardsFor, prizeForGroup } from '../lib/challengeGroups'
import { podiumTier, placeNumber } from '../lib/podiumTiers'
import { mdToHtml } from '../lib/richEditor'
import { useIsMobile } from '../lib/useKeyboardInset'
import { useT } from '../lib/i18n'
import { testFlags } from '../lib/testData'


// The platform's own key in SocialMark's table. Two spellings of one list is
// how a Facebook pill ends up with a broken glyph, so the map is explicit - and
// it is the SAME map AdminChallengeForm uses to draw the picker these come from.
const SOCIAL_BRAND = { Instagram: 'instagram', TikTok: 'tiktok', YouTube: 'youtube', Facebook: 'facebook' }

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
  const [tab, setTab] = useState('brief') // brief | leaderboard | entries
  // Which of the two running orders the brief tab renders. See the note there.
  const isMobile = useIsMobile()
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
        .in('profiles.is_test', testFlags())
        .eq('profiles.status', 'active')
      setAudience(count ?? 0)
    } else {
      const { count } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active')
        .eq('is_admin', false)
        .in('is_test', testFlags())
      setAudience(count ?? 0)
    }
  }, [id])

  useEffect(() => { load() }, [load])

  // Jump straight to the leaderboard for finished challenges with results -
  // UNLESS THE URL ASKED FOR A TAB.
  //
  // This effect keys on `results.length`, which arrives after the deep-link
  // effect below has run, so it was overwriting an explicit `?tab=brief` a
  // moment later: the page opened on the brief and then flipped itself to the
  // leaderboard. That matters because those links are what the share dialog
  // and the announcement cards hand out.
  //
  // Reading `searchParams` rather than a flag: the question is "did the URL
  // name a tab", and the URL is the thing that knows.
  useEffect(() => {
    if (['entries', 'brief', 'leaderboard'].includes(searchParams.get('tab'))) return
    if (challenge && challenge.status !== 'active' && results.length > 0) setTab('leaderboard')
  }, [challenge, results.length, searchParams])

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

  // THE HEADLINE NUMBER ON THE PRIZES CARD, and it is the admin's own figure,
  // never a sum of the prize strings. A prize is free text ("EUR 105 cash", "a
  // weekend in Lisbon"), so adding them up is guesswork; `prize_amount` is the
  // column the payout reads and the one the form makes an admin state.
  const prizePot = Number(myPrize?.prize_amount) || 0
  const prizePotLabel = prizePot > 0 ? formatMoney(prizePot, myPrize?.prize_currency || 'EUR') : ''

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
  // The prize breakdown for the board being LOOKED at, which on a split
  // challenge is that group's own and not the challenge's. This is what lays
  // the leaderboard out (every paid place is a row, taken or open), so getting
  // it wrong would show one group the other group's money.
  const boardPrizes = shownPrize
    ? (Array.isArray(shownPrize.prize_structure) ? shownPrize.prize_structure : [])
    : prizes
  const boardParticipation = shownPrize
    ? (shownPrize.participation_threshold && shownPrize.participation_prize
      ? { threshold: shownPrize.participation_threshold, prize: shownPrize.participation_prize }
      : parseParticipationPrize(shownPrize.prize_structure ?? []))
    : participation
  // THE TOP THREE, AS A PODIUM. Built from `boardRows` and `boardPrizes` - the
  // same two arrays the list under it is built from, so the two can never
  // disagree and neither has to be refreshed separately. A place nobody has
  // taken is still a step, holding what it is worth.
  const boardPrizeAt = new Map(
    (boardPrizes || [])
      .map((p) => [placeNumber(p.place), p.prize])
      .filter(([n]) => n != null),
  )
  const rowAtRank = new Map(boardRows.map((r) => [Number(r.rank), r]))
  const podiumPlaces = [1, 2, 3].map((rank) => {
    const row = rowAtRank.get(rank)
    const prize = boardPrizeAt.get(rank) || null
    if (!row) return { rank, empty: true, name: tr('Up for grabs'), prize }
    return {
      rank,
      id: row.profiles?.id ?? row.creator_id,
      name: row.profiles?.name?.split(' ')[0] || tr('Creator'),
      photo_url: row.profiles?.photo_url,
      score: challenge.scoring === 'points'
        ? Number(row.final_views || 0).toLocaleString()
        : formatViews(row.final_views),
      unit: challenge.scoring === 'points' ? tr('points') : tr('views'),
      prize,
    }
  })

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

  // THE LEADERBOARD TAB IS ALWAYS THERE (1 Sep 2026).
  //
  // Ethan: "I would improve the leaderboard and have that as a tab that is
  // permanently there, even when no one has entered yet."
  //
  // It used to appear only once a result row existed, so the board a creator
  // most wants to see - the empty one, on day one, with every prize still up
  // for grabs - was the one board the page refused to draw. The component fills
  // itself from the prize structure now (see ChallengeLeaderboard), so there is
  // always something to show.
  //
  // THE LEADERBOARD COMES BEFORE THE ENTRIES (2 Sep 2026). Ethan: "move the
  // leaderboard tab to the left and the entries to the right." The board is the
  // question people open a challenge to answer; the gallery is browsing.
  const TABS = [
    { key: 'brief', label: tr('The brief'), icon: 'book' },
    { key: 'leaderboard', label: tr('Leaderboard'), icon: 'trophy' },
    { key: 'entries', label: tr('Entries'), icon: 'video', count: submissions.length },
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

      {/* THE DEADLINE CARD, WHICH IS THE ONE THING ON THIS PAGE THAT MOVES.
          (1 Sep 2026.)

          Ethan: "the closes in 'time' card with the submit your video button
          should be improved and i dont want that apple icon, it should be a
          normal button without it... make it stand out more and have
          animations."

          THE EMOJI IS GONE. It was a clapperboard, which renders as Apple's own
          artwork on an iPhone - a piece of somebody else's icon set inside our
          only orange button. The house rule already says line icons, never
          emoji, in chrome; this button now says what it does and nothing else.

          IT IS ORANGE, NOT BLACK (2 Sep 2026). It was solid ink for a week -
          the only dark block on a white page, which certainly stood out, and
          which Ethan then read as a foreign object: "I don't like the new block
          card for the submit your video, revert it back to a nice orange colour
          similar to the main challenge card, with the submit your video button
          still standing out and a nice animation."
          So it is the LiveChallengeCard's own gradient, its own blooms and its
          own white-on-brand button. The card a creator meets on /challenges and
          the card they meet inside the brief are now the same object seen
          twice, which is what makes the second one recognisable.

          THE ANIMATION IS ONE PASS OF LIGHT (`challenge-sheen`, index.css - the
          live challenge card already carries it) plus a slow breathing glow
          behind the button. Both are decoration on a static layout, so
          `prefers-reduced-motion` can drop them and nothing moves position. */}
      {isLive && (
        <div className="challenge-card relative mb-10 overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-6 text-white shadow-lift sm:p-8">
          <span aria-hidden className="challenge-sheen pointer-events-none absolute inset-y-0" />
          {/* The same two blooms the live card carries, so the orange is never
              flat orange. The dark one is desktop-only: 288px of black-10%
              behind a 40px blur inside an `overflow-hidden` card covers most of
              a 375px screen's bottom-left quadrant and the clip squares off its
              soft edge. */}
          <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
          <span aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 hidden h-56 w-56 rounded-full bg-black/10 blur-2xl sm:block" />

          <div className="relative flex flex-col items-start gap-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="w-full sm:w-auto">
              <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/80">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                </span>
                {tr('Closes in')}
              </p>
              <CountdownTimer endDate={challenge.end_date} />
            </div>

            <div className="relative w-full sm:w-auto">
              {/* The breathing glow behind the button is WHITE now: an orange
                  bloom behind an orange card is invisible, and the button is
                  the one white object on it. */}
              <span aria-hidden className="absolute inset-0 -z-10 animate-cta-glow rounded-xl bg-white blur-lg" />
              <button
                onClick={() => setShowSubmit(true)}
                className="btn w-full justify-center bg-white !px-7 !py-3.5 text-base !text-brand shadow-[0_10px_30px_-8px_rgba(0,0,0,0.35)] hover:bg-white/90 sm:w-auto"
              >
                <Icon name="video" className="h-5 w-5" />
                {myEntries.length > 0 ? tr('Add another entry') : tr('Submit your video')}
              </button>
              {myEntries.length > 0 && (
                <p className="mt-2 text-center text-xs text-white/80 sm:text-right">
                  {myEntries.length === 1 ? tr('1 entry in') : tr('{n} entries in', { n: myEntries.length })}
                </p>
              )}
            </div>
          </div>
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

      {/* THE TABS ARE BUTTONS, NOT UNDERLINED WORDS (2 Sep 2026).
          Ethan: "make the brief and entries tabs more visual, more clickable."
          A 2px underline under grey text is the quietest control this app
          draws, and it was the switch between the three things the page is
          for. They are pressable pills now - a glyph, the word, and the entry
          count as a chip - so the choice reads as a choice. They still lift on
          hover rather than changing colour, which is the house rule. */}
      <div className="-mx-4 mb-8 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setTab(t.key)}
            className={cx(
              'flex shrink-0 items-center gap-1.5 rounded-full px-3 py-2.5 text-[13px] font-semibold transition-all duration-200 sm:gap-2 sm:px-4 sm:text-sm',
              tab === t.key
                ? 'bg-brand text-white shadow-card'
                : 'bg-cloud text-smoke hover:-translate-y-0.5 hover:text-ink',
            )}
          >
            <Icon name={t.icon} className="h-4 w-4 shrink-0" />
            {t.label}
            {t.count != null && (
              <span className={cx(
                'rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                tab === t.key ? 'bg-white/25' : 'bg-white text-smoke',
              )}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ---------- Tab: brief ---------- */}
      {/* TWO RUNNING ORDERS OVER NAMED SECTIONS, chosen with `useIsMobile()`
          (2 Sep 2026).

          Ethan, of the brief on a phone: "it should show the prizes at the very
          top, and then the brief, the rules, the section on how this is won,
          and then the platforms you can post on."

          On a desktop the page is two columns and the prizes are already at eye
          level in the rail. Collapsed to one column that rail simply falls to
          the BOTTOM, so the one fact that decides whether somebody enters
          arrived after everything else - and moving it up with `order-first`
          brings the platforms card up with it, because they are one wrapper.

          Not `hidden`: a hidden twin still MOUNTS, and ScoringPanel fetches
          (this is the same trap the profile's photo board paid for). One
          instance of each section, arranged twice. */}

      {tab === 'brief' && (() => {
        const briefCard = (
          <>
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
          </>
        )
        const rulesCard = (
          <>
          {challenge.rules && (
            <section className="card">
              <h2 className="mb-3 text-lg font-semibold">{tr("Rules")}</h2>
              <div
                className="rt-editor leading-relaxed text-smoke"
                dangerouslySetInnerHTML={{ __html: mdToHtml(challenge.rules) }}
              />
            </section>
          )}
          </>
        )
        const scoringCard = (
          <>
          {/* How it is decided, which until now was stored on the row and
              shown nowhere. Somebody posting eight short videos into a
              best-video challenge is wasting their month.

              Legacy 'prize' challenges are deliberately excluded. The live UK
              challenge is one, and adding a provisional leaderboard to a
              contest people are already halfway through is a product change
              nobody asked for. New challenges pick one of the three modes and
              get the panel. */}
          {challenge.scoring && challenge.scoring !== 'prize' && (
            <ScoringPanel challenge={challenge} />
          )}
          </>
        )
        const prizesCard = (
          <>
          {/* THE PRIZES ARE THE POINT OF THE PAGE - BUT THEY ARE STILL A
              CARD ON THIS PAGE (2 Sep 2026).

              Ethan: "I like how it stands out more, although it looks like it
              doesn't really fit in - it looks very different from the other
              cards. I don't like how first place is a really big font size
              and the others are smaller on the right; they should all be the
              same as second and third, with the cash on the right and it just
              says first, second, third. Change the colours of the one, two,
              three to match the podium colours. And I don't like the beige
              background."

              So: the same white `card` surface, border and shadow as the
              brief, the rules and the platforms card beside it, with the
              brand carried by the heading rule and the place chips instead of
              by a gradient banner and a wash. THE ROWS ARE ALL ONE ROW: a
              chip in that place's own podium tone, the ordinal, and the prize
              right-aligned at one size. First place used to be a separate
              block with the money at heading size, which made a five-place
              breakdown read as one prize and four footnotes - and put the
              money on two different axes on one card.

              THE PARTICIPATION PRIZE IS STILL ITS OWN BLOCK, because "post 3
              videos and everybody gets a voucher" is the offer that reaches
              the creators who will never come first, which is most of them.
              Its ticket is a BARE ICON now - it was a glyph on a white disc
              with a shadow, which on a white card is a circle drawn around
              nothing. */}
          <section className="card !p-0 overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-gray-100 px-5 py-4">
              <Icon name="trophy" className="h-5 w-5 shrink-0 text-brand" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink">{tr("Prizes")}</h2>
              {prizePot > 0 && (
                <span className="ml-auto rounded-full bg-brand px-2.5 py-1 text-xs font-bold tabular-nums text-white">
                  {tr("{n} to win", { n: prizePotLabel })}
                </span>
              )}
            </div>

            {prizes.length === 0 ? (
              <p className="px-5 py-6 text-sm text-smoke">{tr("Prize details coming soon.")}</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {prizes.map((p, i) => {
                  // The ordinal on the row is the admin's own text ("1st",
                  // and sometimes "3+ videos"), but the CHIP has to be a
                  // number, so it reads the digits off it and falls back to
                  // the position in the list.
                  const n = placeNumber(p.place) ?? i + 1
                  const tier = podiumTier(n)
                  return (
                    <li key={i} className="flex items-center gap-3 px-5 py-3">
                      <span
                        className={cx(
                          'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums',
                          n > 3 && 'bg-cloud text-smoke',
                        )}
                        style={n <= 3 ? { background: tier.disc, color: tier.ink } : undefined}
                      >
                        {n}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-smoke">{p.place}</span>
                      <span className="shrink-0 text-sm font-bold text-ink">{p.prize}</span>
                    </li>
                  )
                })}
              </ul>
            )}

            {participation && (
              <div className="border-t border-gray-100 px-5 py-4">
                <div className="flex items-start gap-3">
                  <Icon name="ticket" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">{tr("Everyone can win this")}</p>
                    <p className="text-sm font-semibold text-ink">
                      {tr("Post {n}+ videos and earn {prize}", { n: participation.threshold, prize: participation.prize })}
                    </p>
                    {/* HOW CLOSE *YOU* ARE, not just how many other people got
                        there. The old line counted everybody else's vouchers
                        at the reader, which is the least motivating true fact
                        available. */}
                    {isLive && (
                      <div className="mt-2.5">
                        <div className="h-1.5 overflow-hidden rounded-full bg-cloud">
                          <div
                            className="h-full rounded-full bg-brand transition-[width] duration-500"
                            style={{ width: `${Math.min(100, Math.round((myEntries.length / participation.threshold) * 100))}%` }}
                          />
                        </div>
                        <p className="mt-1.5 text-xs text-smoke">
                          {myEntries.length >= participation.threshold
                            ? tr("You have earned it.")
                            : tr("{n} more to go.", { n: participation.threshold - myEntries.length })}
                          {earnedVoucherCount > 0 && ` · ${tr("{n} earned so far", { n: earnedVoucherCount })}`}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>
          </>
        )
        const platformsCard = (
          <>
          {/* "PLATFORMS YOU CAN POST ON", IN THE PLATFORMS' OWN COLOURS.

              Ethan: "for the 'platforms that count' rename it to 'platforms
              you can post on' and rather than a greyed out social media icon,
              have the actual colourful social media icon for each."

              `PlatformBadges` draws a grey glyph on a grey disc, which is the
              universal look of a DISABLED control - so the row listing the
              four places you are allowed to post read as four places you are
              not. `SocialMark colored` is the set the challenge FORM already
              uses for exactly this choice, so the admin picking them and the
              creator reading them now see the same marks. */}
          <section className="card !p-6">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-smoke">{tr("Platforms you can post on")}</h2>
            <div className="flex flex-wrap gap-2.5">
              {(challenge.platforms || []).map((p) => (
                <span
                  key={p}
                  className="inline-flex items-center gap-2 rounded-full border border-gray-100 bg-white py-1.5 pl-2 pr-3.5 text-xs font-semibold shadow-card transition-transform duration-200 hover:-translate-y-0.5"
                >
                  <SocialMark brand={SOCIAL_BRAND[p] || 'link'} colored className="h-5 w-5 shrink-0" />
                  {p}
                </span>
              ))}
              {(challenge.platforms || []).length === 0 && (
                <p className="text-sm text-smoke">{tr("Any platform.")}</p>
              )}
            </div>
          </section>
          </>
        )

        if (isMobile) {
          return (
            <div className="space-y-6">
              {prizesCard}
              {briefCard}
              {rulesCard}
              {scoringCard}
              {platformsCard}
            </div>
          )
        }
        return (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
            <div className="space-y-8 lg:col-span-2">
              {briefCard}
              {rulesCard}
              {scoringCard}
            </div>
            <div className="space-y-6">
              {prizesCard}
              {platformsCard}
            </div>
          </div>
        )
      })()}

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
        <div className="space-y-5">
          {/* WHERE THE BOARD CAME FROM, IN ONE LINE, ALWAYS.
              Three states, and the third one is the one that used to be nothing
              at all: a challenge that has opened and has no logged views yet is
              not an error, it is the starting line, and saying so is what makes
              the empty board readable. */}
          {/* AND IT SAYS WHAT THE BOARD IS ACTUALLY COUNTING. A points challenge
              ranks on posts, view thresholds and claimed bonuses, so a banner
              reading "Views logged so far" over a column headed POINTS was
              describing the wrong contest - and it is the first line under the
              heading, so it is the sentence somebody reads before the numbers.
              Spain's is the first points challenge the platform has run; see
              migration 173 for the other half of what that turned up. */}
          {challenge.results_status === 'interim' ? (
            <div className="flex items-start gap-3 rounded-card border border-brand/20 bg-brand-tint/60 px-5 py-4">
              <Icon name="clock" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              <div>
                <p className="text-sm font-semibold text-brand">{tr("Current leaderboard")}</p>
                <p className="text-xs text-smoke">
                  {challenge.scoring === 'points' ? tr("Points earned so far") : tr("Views logged so far")}{challenge.results_updated_at ? ` · ${tr("updated")} ${timeAgo(challenge.results_updated_at)}` : ''}. {tr("These can still change. Final results are counted after the challenge closes.")}
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
          ) : (
            <div className="flex items-start gap-3 rounded-card border border-dashed border-brand/25 bg-brand-tint/25 px-5 py-4">
              <Icon name="sparkles" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              <div>
                <p className="text-sm font-semibold text-brand">
                  {results.length === 0 ? tr("Every place is still open") : tr("Standings so far")}
                </p>
                <p className="text-xs text-smoke">
                  {results.length === 0
                    ? (challenge.scoring === 'points'
                      ? tr("Nobody has scored yet. Post a video and you take the top spot.")
                      : tr("Nobody has a logged view count yet. Post a video and you take the top spot."))
                    : tr("Views are counted automatically off each entry's link, a few times a day.")}
                </p>
              </div>
            </div>
          )}

          {/* ONE TAB PER BOARD, AND IT OPENS ON YOURS.
              A challenge with groups has more than one leaderboard and they are
              not a ranking of each other - they are separate races for separate
              prizes. Stacking them would make the second one look like the
              bottom of the first. It opens on the creator's own board because
              "how am I doing" is the question a leaderboard is opened to
              answer; the others are one press away.

              THE TAB CARRIES THE BOARD'S SIZE, so switching to another group is
              a decision made with the number visible rather than a guess. */}
          {boards.length > 1 && (
            <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
              {boards.map((g) => (
                <button
                  key={g.id ?? 'ungrouped'}
                  type="button"
                  onClick={() => setBoard(g.id)}
                  aria-pressed={shownBoard === g.id}
                  className={cx(
                    'flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-all duration-200',
                    shownBoard === g.id
                      ? 'bg-brand text-white shadow-card'
                      : 'bg-cloud text-smoke hover:-translate-y-0.5 hover:text-ink',
                  )}
                >
                  {g.name}
                  <span className={cx('rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums',
                    shownBoard === g.id ? 'bg-white/25' : 'bg-white text-smoke')}>
                    {boardCounts.get(g.id) || 0}
                  </span>
                  {g.id === myGroupId && (
                    <span className={cx('text-[10px] font-bold uppercase tracking-wider',
                      shownBoard === g.id ? 'text-white/80' : 'text-brand')}>{tr("you")}</span>
                  )}
                </button>
              ))}
            </div>
          )}

          {/* WHAT THE BOARD ON SHOW IS PLAYING FOR. On a split challenge this is
              the group's own pot, which is not the challenge's - reading the
              brief's figure against another group's board is the single
              easiest mistake this page can invite. */}
          {boards.length > 1 && shownPrize?.prize_amount != null && (
            <div className="flex flex-wrap items-center gap-2 rounded-card bg-cloud/50 px-4 py-3 text-sm">
              <Icon name="trophy" className="h-4 w-4 shrink-0 text-brand" />
              <span className="font-semibold">{boards.find((g) => g.id === shownBoard)?.name}</span>
              <span className="text-smoke">{tr("is playing for")}</span>
              <span className="font-bold text-brand">{formatMoney(shownPrize.prize_amount, shownPrize.prize_currency)}</span>
              {shownPrize.winners_count ? (
                <span className="text-smoke">
                  {tr("across {n} places", { n: shownPrize.winners_count })}
                </span>
              ) : null}
            </div>
          )}

          {/* THE BOARD ON SHOW, WHICH IS NOT ALWAYS MINE. The voucher badge on
              a leaderboard row means "this creator earned the reward", and on
              another group's tab that reward is that group's - so is the prize
              on each place, which is why `boardPrizes` and not `prizes`. */}
          {/* THE PODIUM LEADS THE BOARD, AND IT MOVES ON ITS OWN (2 Sep 2026).

              Ethan: "whenever I click on the leaderboard tab I want the visual
              podium at the top that's automatically updating, and then the rest
              of the leaderboard as the list below."

              It is built from the SAME rows the list is built from, so there is
              nothing to keep in step: view counts are read off each entry's
              link a few times a day and written to `submissions`, this page
              subscribes to that table, and the podium and the list re-rank
              together because they are one array. Places nobody has taken yet
              are drawn as open steps carrying their prize rather than left out,
              which is the promise the rows below already make.

              The list then starts at FOURTH (`startAt`), or the top three would
              be on the page twice in two different shapes. */}
          <Podium
            className="pt-2"
            meId={user.id}
            places={podiumPlaces}
          />

          <ChallengeLeaderboard
            rows={boardRows}
            prizes={boardPrizes}
            meId={user.id}
            participation={boardParticipation}
            subCountByCreator={subCountByCreator}
            platformsFor={submittedPlatforms}
            scoreLabel={challenge.scoring === 'points' ? 'points' : 'views'}
            startAt={4}
          />

          {/* A challenge with no prize breakdown at all has no places to lay
              out, so the component draws nothing and this says why.

              ONLY WHEN THE BANNER HAS NOT ALREADY SAID IT. On a challenge that
              has no results anywhere, the banner above already reads "Nobody
              has a logged view count yet" - printing this underneath it was the
              same sentence twice in two boxes. It is worth saying only when
              OTHER boards have results and this one does not, which is the
              split-challenge case it was written for. */}
          {boardRows.length === 0 && boardPrizes.length === 0 && results.length > 0 && (
            <p className="rounded-card border border-dashed border-gray-200 px-5 py-6 text-center text-sm text-smoke">
              {tr("Nobody on this board has a logged view count yet.")}
            </p>
          )}

          {isLive && (
            <div className="flex justify-center pt-1">
              <button onClick={() => setShowSubmit(true)} className="btn-primary">
                <Icon name="video" className="h-5 w-5" />
                {myEntries.length > 0 ? tr('Add another entry') : tr('Submit your video')}
              </button>
            </div>
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
