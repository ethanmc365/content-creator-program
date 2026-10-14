import { useEffect, useState, useCallback, useRef } from 'react'
import { PrizeText } from '../lib/prizeText'
import { confirm, notice, saved } from '../lib/confirm'
import { toastSuccess } from '../lib/toast'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { SendPushButton } from '../components/admin/ChallengePush'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import CountdownTimer from '../components/CountdownTimer'
import Icon from '../components/Icon'
import { PLATFORM_ORDER } from '../components/PlatformBadges'
import SocialMark from '../components/SocialMark'
import ChallengeKickers, { JoinBonusCallout, OfferRotator, VoucherDayCallout } from '../components/challenge/ChallengeKickers'
import { useVoucherDays, voucherDayState } from '../lib/voucherDays'
import EntryPreview from '../components/challenge/EntryPreview'
import { dailyStreaksByCreator } from '../lib/dailyStreak'
import SwapIn, { SLOT, SLOT_ICON } from '../components/challenge/SwapIn'
import RecapBanner from '../components/challenge/RecapBanner'
import { useEntryPoints } from '../lib/entryPoints'
import { previewLink, storeThumbnail } from '../lib/videoThumbs'
import VideoEmbedModal from '../components/VideoEmbedModal'
import { playsInline } from '../lib/videoPreview'
import SubmissionSuccess from '../components/SubmissionSuccess'
import CollapsibleRich from '../components/CollapsibleRich'
import TranslatedText from '../components/TranslatedText'
import { useMyScopes } from '../lib/scope'
import ScoringPanel, { usePointRules } from '../components/network/ScoringPanel'
import BonusPointsCard, { LiveBonusCallout, OfferDetail } from '../components/network/BonusPointsCard'
import HookButton from '../components/HookButton'
import ParticipationBar from '../components/network/ParticipationBar'
import CountryBoard from '../components/challenge/CountryBoard'
import CollabCard from '../components/challenge/CollabCard'
import BoostCallout, { useBoost } from '../components/challenge/BoostBanner'
import { usePrizeStandings } from '../components/admin/PrizeStandingsPanel'
import { loadFeedback } from '../components/EntryFeedback'
import { Badge, PageHeader, Skeleton, EmptyState } from '../components/ui'
import { formatDate, timeAgo, formatViews, formatMoney, detectPlatform, cx, challengeDeadline } from '../lib/utils'
import { groupByCreator, boardsFor, prizeForGroup } from '../lib/challengeGroups'
import { readPageCache, writePageCache } from '../lib/pageCache'
import { ordinalFor, podiumTier, placeNumber } from '../lib/podiumTiers'
import { useIsMobile } from '../lib/useKeyboardInset'
import { useT } from '../lib/i18n'
import { testFlags } from '../lib/testData'
import { ruleOpenAt } from '../lib/scoring'
import { safeUrl } from '../lib/safeUrl'
import { challengesApi } from '../api/challenges'
import { submissionsApi } from '../api/submissions'
import { profilesApi } from '../api/profiles'
import { marketsApi } from '../api/markets'
import ChallengeDetailSubmitModal from './ChallengeDetailSubmitModal'
import ChallengeDetailLeaderboard from './ChallengeDetailLeaderboard'
import ChallengeDetailEntryBody from './ChallengeDetailEntryBody'


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
export default function ChallengeDetail({ challengeId = null, embedded = false, marketParticipation = null, initialTab = null, boardOnly = false }) {
  const tr = useT()
  const { id: routeId } = useParams()
  const id = challengeId || routeId
  const [searchParams] = useSearchParams()
  const { user, isAdmin } = useAuth()
  const { networkId } = useMyScopes()

  // THE LAST COPY OF THIS CHALLENGE PAINTS FIRST (slow wifi): a second visit draws what it drew last time while the
  // queries run, the same stale-while-revalidate the bottom tabs use. See lib/pageCache.
  const cacheKey = `challenge:${id}`
  const [seed] = useState(() => readPageCache(cacheKey))
  const [challenge, setChallenge] = useState(seed?.challenge ?? null)
  const [groups, setGroups] = useState(seed?.groups ?? [])
  // The admin push composer, which lives behind the button beside Edit.
  // Who is earning the capped participation prize (migration 233). Same
  // function the payout reads, so "you have earned it" is never a promise the
  // payout then breaks.
  const capped = (x) => !!(x?.participation_cap || x?.participation_scope === 'outside_prizes')
  const prizeStandings = usePrizeStandings(capped(challenge) || groups.some(capped) ? challenge?.id : null)
  const [submissions, setSubmissions] = useState(seed?.submissions ?? [])
  const [results, setResults] = useState(seed?.results ?? [])
  const [loading, setLoading] = useState(!seed)
  const [tab, setTab] = useState(initialTab || 'brief') // brief | leaderboard | entries | countries
  // THE PAGE KEEPS ITS HEIGHT WHILE A TAB SWAPS (14 Oct 2026). Opening the Country leaderboard from far down the page
  // briefly showed a short skeleton; the page got shorter, the browser pulled the scroll up, then the board landed and
  // it went back down. The page is held at its old height until the new tab has had time to draw.
  const pageRef = useRef(null)
  const [holdH, setHoldH] = useState(0)
  const holdTimer = useRef(null)
  const switchTab = (next) => {
    if (next === tab) return
    const h = pageRef.current?.offsetHeight || 0
    if (h) setHoldH(h)
    clearTimeout(holdTimer.current)
    holdTimer.current = setTimeout(() => setHoldH(0), 1200)
    setTab(next)
  }
  useEffect(() => () => clearTimeout(holdTimer.current), [])
  // The offer whose card is open from the dark callout beside the tabs (joining bonus, boost, voucher day).
  const [offerOpen, setOfferOpen] = useState(null)
  // MY ENTRIES AND A NAME SEARCH ON THE ENTRIES TAB.
  const [entryScope, setEntryScope] = useState('all') // all | mine
  const [entryQuery, setEntryQuery] = useState('')
  // How the entries are ordered and which platform.
  const [entrySort, setEntrySort] = useState('newest') // newest | views | points | oldest
  const [entryPlatform, setEntryPlatform] = useState('')
  const [allPrizes, setAllPrizes] = useState(false) // a phone shows five places until asked
  // Which of the two running orders the brief tab renders. See the note there.
  const isMobile = useIsMobile()
  const [playing, setPlaying] = useState(null) // submission being watched inline

  // PRESSING AN ENTRY OPENS THE THING, whichever way that has to happen.
  //
  // The lightbox used to open for everything, and for a carousel that meant a
  // black rectangle with a Close button - a worse outcome than the link the
  // reader was expecting. `playsInline` decides, and it decides SYNCHRONOUSLY,
  // inside the click, which matters: opening a tab from a later callback is
  // what a popup blocker stops.
  const openEntry = useCallback((s) => {
    if (playsInline(s.video_url)) { setPlaying(s); return }
    { const u = safeUrl(s.video_url); if (u) window.open(u, '_blank', 'noopener,noreferrer') }
  }, [])
  const [feedback, setFeedback] = useState({}) // submission id -> the team's note
  // The scoring rules, fetched once: the view ladder (ScoringPanel) and the
  // bonus card in the rail both read them. See usePointRules.
  const pointRules = usePointRules(challenge)
  // Captured once so it stays pure during render; a fresh page load re-reads it.
  const [nowMs] = useState(() => Date.now())


  // Submission form state
  const [showSubmit, setShowSubmit] = useState(false)
  const [videoUrl, setVideoUrl] = useState('')
  const [caption, setCaption] = useState('')
  // PASTE AND CONFIRM.
  //
  // `null` is "we have not looked", `{ loading: true }` is "we are looking".
  // See `previewLink` in lib/videoThumbs for what each platform will say
  // without a key - and for why the view count is deliberately not asked for.
  const [linkMeta, setLinkMeta] = useState(null)
  // HAS THE CREATOR TOUCHED THE CAPTION. An auto-fill that overwrites something
  // somebody typed is worse than no auto-fill, and the two are indistinguishable
  // from "is the field empty" the moment they clear it on purpose.
  const [captionTouched, setCaptionTouched] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [errorField, setErrorField] = useState('') // 'url' | 'caption' - rings the offending input
  // A video that is already in a challenge: { title, same } - drawn as its own card, not a red line.
  const [dupInfo, setDupInfo] = useState(null)
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
  const [audience, setAudience] = useState(seed?.audience ?? null)

  // ---- MORE THAN ONE LEADERBOARD, AND CLAIMABLE BONUSES -------------------
  // Both are opt-in per challenge and both are empty on almost every one, so
  // every read path below falls through to exactly the behaviour that existed
  // before them. See lib/challengeGroups and migration 155.
  const [groupMembers, setGroupMembers] = useState(seed?.groupMembers ?? [])
  const [bonusRules, setBonusRules] = useState(seed?.bonusRules ?? [])
  const [bonusClaims, setBonusClaims] = useState(seed?.bonusClaims ?? [])
  // Which bonuses the creator has ticked in the submit form, before they send.
  const [claiming, setClaiming] = useState([])
  const boost = useBoost(challenge?.id, challenge?.status === 'active' && challenge?.scoring === 'points')
  const { days: voucherDays } = useVoucherDays(challenge?.id)
  // The board being read on the leaderboard tab. Null means "mine", which is
  // the question a leaderboard is opened to answer.
  const [board, setBoard] = useState(null)
  // STAFF ONLY, ON A SPLIT CHALLENGE: whose eyes the page is seen through.
  // Null is "every group at once"; a group id is that group's creator view.
  const [viewAs, setViewAs] = useState(null)
  // Points each entry has earned, for the chip on its cover (points challenges only).
  const entryPoints = useEntryPoints(id, challenge?.scoring === 'points', `${challenge?.results_updated_at ?? ''}:${submissions.length}`)

  const load = useCallback(async () => {
    // THE GROUPS AND BONUSES ARE ASKED FOR AT THE SAME TIME AS THE CHALLENGE. They only need the id, and waiting for the
    // first round before starting the second was a whole extra round trip - on a slow connection, a second or more with
    // the prizes still blank.
    const sideReads = Promise.all([
      challengesApi.challengeGroups().select('*').eq('challenge_id', id).order('position'),
      challengesApi.challengeGroupMembers().select('group_id, creator_id').eq('challenge_id', id),
      challengesApi.pointRules()
        .select('id, label, points, prompt, min_views, starts_at, ends_at')
        .eq('challenge_id', id).eq('kind', 'bonus').eq('is_active', true)
        .not('prompt', 'is', null).order('position'),
      submissionsApi.submissionBonusClaims().select('submission_id, rule_id, creator_id').eq('challenge_id', id),
    ])
    const [{ data: ch }, { data: subs }, { data: res }] = await Promise.all([
      challengesApi.challenges().select('*').eq('id', id).single(),
      submissionsApi
        .submissions()
        .select('*, profiles:creator_id(id, name, photo_url)')
        .eq('challenge_id', id)
        .order('submitted_at', { ascending: false }),
      challengesApi
        .results()
        .select('*, profiles:creator_id(id, name, photo_url, instagram_url, tiktok_url, youtube_url, facebook_url)')
        .eq('challenge_id', id)
        .order('rank'),
    ])
    setChallenge(ch)
    setSubmissions(subs ?? [])
    setResults(res ?? [])
    setLoading(false)

    // The size of the roster this challenge is running in front of. STARTED
    // NOW, IN PARALLEL: it used to wait behind the groups read and the feedback read, so the participation card was the
    // last thing on the page to know its numbers and it arrived a second after everything else. Nothing below depends on
    // it.
    ;(async () => {
      if (ch?.community_id) {
        // The join column is `profile_id`. Same query MarketChallenges runs for
        // its own bar, so the two can never disagree about who counts.
        const { count } = await marketsApi
          .communityMembers()
          .select('profile_id, profiles!inner(is_admin, is_test, status)', { count: 'exact', head: true })
          .eq('community_id', ch.community_id)
          .eq('status', 'active')
          .eq('profiles.is_admin', false)
          .in('profiles.is_test', testFlags())
          .eq('profiles.status', 'active')
        setAudience(count ?? 0)
      } else {
        const { count } = await profilesApi
          .profiles()
          .select('id', { count: 'exact', head: true })
          .eq('status', 'active')
          .eq('is_admin', false)
          .in('is_test', testFlags())
        setAudience(count ?? 0)
      }
    })()

    // THE GROUPS, IF THIS CHALLENGE HAS ANY.
    //
    // Four small reads rather than one big one, because three of them are
    // usually empty: most challenges have no groups and no claimable bonuses,
    // and an empty table returns nothing rather than costing a join on every
    // challenge page in the platform. See lib/challengeGroups.
    const [{ data: gs }, { data: gms }, { data: brules }, { data: claims }] = await sideReads
    setGroups(gs ?? [])
    setGroupMembers(gms ?? [])
    setBonusRules(brules ?? [])
    setBonusClaims(claims ?? [])

    // The team's notes on these entries. The policy decides what comes back -
    // an admin gets every row, a creator gets only their own - so there is one
    // query here and no branch on who is asking.
    setFeedback(await loadFeedback((subs ?? []).map((s) => s.id)))

  }, [id])

  useEffect(() => { load() }, [load])

  // Keep the copy the next visit paints from.
  useEffect(() => {
    if (!challenge || challenge.id !== id) return
    writePageCache(cacheKey, { challenge, submissions, results, audience, groups, groupMembers, bonusRules, bonusClaims })
  }, [cacheKey, id, challenge, submissions, results, audience, groups, groupMembers, bonusRules, bonusClaims])

  // THE BOARD FOLLOWS THE SYNC WITHOUT A RELOAD. The team: the leaderboard should update for creators every time views
  // are synced, with no "publish" step. A sync writes `submissions` (which is on the realtime publication) and rebuilds
  // `results` in the same transaction, so any entry changing on this challenge means the board has moved. Reads are
  // batched with a short debounce because a sync writes twenty rows in a second. Coming back to the tab refreshes it as
  // well.
  const refreshBoard = useCallback(async () => {
    const [{ data: ch }, { data: res }, { data: subs }] = await Promise.all([
      challengesApi.challenges().select('*').eq('id', id).single(),
      challengesApi
        .results()
        .select('*, profiles:creator_id(id, name, photo_url, instagram_url, tiktok_url, youtube_url, facebook_url)')
        .eq('challenge_id', id)
        .order('rank'),
      submissionsApi
        .submissions()
        .select('*, profiles:creator_id(id, name, photo_url)')
        .eq('challenge_id', id)
        .order('submitted_at', { ascending: false }),
    ])
    if (ch) setChallenge(ch)
    if (res) setResults(res)
    if (subs) setSubmissions(subs)
  }, [id])
  useEffect(() => {
    let timer = null
    const soon = () => { clearTimeout(timer); timer = setTimeout(refreshBoard, 1200) }
    const ch = supabase
      .channel(`challenge-board-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'submissions', filter: `challenge_id=eq.${id}` }, soon)
      // An edit to the brief (prizes, places, dates) redraws the board too.
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'challenges', filter: `id=eq.${id}` }, soon)
      .subscribe()
    const onVisible = () => { if (document.visibilityState === 'visible') soon() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      supabase.removeChannel(ch)
    }
  }, [id, refreshBoard])

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
    if (['entries', 'brief', 'leaderboard', 'countries'].includes(searchParams.get('tab'))) return
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
    if (t === 'entries' || t === 'brief' || t === 'leaderboard' || t === 'countries') setTab(t)
  }, [challenge]) // eslint-disable-line react-hooks/exhaustive-deps

  function fail(field, message) {
    setDupInfo(null)
    setErrorField(field)
    setSubmitError(message)
  }

  // ASK THE PLATFORM WHAT THIS IS, A BEAT AFTER THE TYPING STOPS.
  //
  // 500ms, and it is a debounce rather than a paste handler on purpose: a link
  // arrives by paste, by autofill, by typing and by the share sheet, and only
  // one of those fires `paste`. The dialog closing cancels it, and every result
  // is checked against the URL that is in the box NOW - a slow lookup for a
  // link that has since been replaced must not overwrite the fast one that
  // followed it.
  useEffect(() => {
    if (!showSubmit) { setLinkMeta(null); return undefined }
    const raw = videoUrl.trim()
    if (!raw || urlProblem(videoUrl)) { setLinkMeta(null); return undefined }
    const url = normaliseUrl(videoUrl)
    let alive = true
    setLinkMeta({ loading: true })
    const t = setTimeout(() => {
      previewLink(url).then((meta) => {
        if (!alive) return
        setLinkMeta(meta ? { ...meta, url } : null)
        // The caption is a SUGGESTION, not an answer: it fills an untouched
        // field and never replaces a word anybody has written.
        if (meta?.caption && !captionTouched) setCaption(meta.caption)
      })
    }, 500)
    return () => { alive = false; clearTimeout(t) }
    // `captionTouched` deliberately absent: touching the caption must not
    // re-run the lookup, it only changes what the NEXT result is allowed to do.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [videoUrl, showSubmit])

  async function submitEntry(e) {
    e.preventDefault()
    setSubmitError(''); setDupInfo(null)
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

    // THE ENTRY CARRIES THE VIDEO'S REAL ID WHEN WE KNOW IT.
    //
    // TikTok mints a NEW vm.tiktok.com code every time Share is pressed, so the
    // same video submitted twice arrives as two links with nothing in common.
    // `trg_one_video_one_entry` keys on the URL, so it could not see that, and a
    // repeat was only caught a day or two later when view-sync resolved the
    // link - after it had been scoring. Taking those points back is what
    // Natalia saw as thirty becoming twenty-one, and she had no way to know why.
    //
    // The preview that fills the cover and the caption has already followed the
    // link by then, so the id is sitting in `linkMeta`. Writing it with the row
    // lets the guard that was always there fire NOW, with a sentence she can act
    // on, and no points are ever given to a repeat.
    //
    // Only when the preview is for the link actually being submitted: a stale
    // meta from a URL since replaced would stamp the wrong video's id on it.
    const resolvedId = linkMeta && linkMeta.url === url && !linkMeta.loading ? linkMeta.videoId : null

    // `select().single()` because the bonus claims below have to point at the
    // row that was just written, and a second read to find it would be a race
    // with anything else this creator is doing.
    const { data: entry, error } = await submissionsApi.submissions().insert({
      creator_id: user.id,
      challenge_id: id,
      platform,
      video_url: url,
      caption: caption.trim(),
      ...(resolvedId ? { platform_video_id: resolvedId } : {}),
    }).select('id, collab_of').single()
    if (error) {
      setSubmitting(false)
      // The guard raises 23505 with its own sentence. Say it against the link,
      // which is the field they can do something about.
      // migration 328: DETAIL is the title of the challenge it is already in, HINT is 'same' or 'other'.
      if (error.code === '23505' && /already been (submitted|entered)/i.test(error.message)) {
        setSubmitError('')
        setErrorField('url')
        setDupInfo({ title: error.details || '', same: error.hint !== 'other' })
        return
      }
      // POSTED BEFORE THE CHALLENGE STARTED (migration 382). The database refuses it and says when each happened; the
      // creator gets a pop-up there and then, instead of an entry that is quietly removed a day later.
      if (/POSTED_BEFORE_START/.test(error.message || '')) {
        setSubmitError('')
        setErrorField('url')
        const day = (iso) => (iso ? formatDate(iso) : '')
        notice(tr('This video was posted on {posted}, before the challenge started on {start}, so it cannot be entered. Post a new video and enter that one.', {
          posted: day(error.details), start: day(error.hint),
        }), { title: tr('This video is too old for this challenge') })
        return
      }
      return fail('', error.message)
    }

    // THE COVER IS STORED THE MOMENT THE ROW EXISTS, NOT THE FIRST TIME
    // SOMEBODY LOOKS AT IT.
    //
    // `VideoThumb` would have resolved it eventually - it asks `thumb-cache`
    // for any entry that has no cover - but "eventually" means the first person
    // to open the board waits for it, and the first person to open the board is
    // usually the creator who just posted. Doing it here costs one call at the
    // one moment somebody is already waiting, and `src` is the frame the
    // preview above already found, so the platform is asked once rather than
    // twice.
    //
    // Deliberately not awaited and deliberately not fatal: the entry is IN, and
    // a missing picture is a card that resolves itself on the next view.
    storeThumbnail(url, linkMeta?.thumbnail || undefined)

    // THE CLAIMS ARE WRITTEN AFTER THE ENTRY AND THEY ARE NOT FATAL.
    //
    // If this insert fails the video is still entered, which is the thing that
    // matters and the thing that is hard to redo. A claim that did not land can
    // be ticked again from the entry card, so the failure is recoverable in
    // place; losing the entry would not be. The points follow from the claim
    // through `recalc_challenge_points_internal`, so nothing here awards
    // anything directly.
    // SAID OUT LOUD WHEN IT FAILS. From 6 to 7 Oct every claim failed in the database (migration 347) and this one
    // failed silently: the entry went in, the ticked bonus did not, and nobody was told. Now the creator is, and told
    // the fix - the entry card can claim it again.
    let claimFailed = false
    if (entry && claiming.length > 0) {
      const { error: claimErr } = await submissionsApi.submissionBonusClaims().insert(
        claiming.map((rule_id) => ({
          submission_id: entry.id, rule_id, creator_id: user.id, challenge_id: id,
        })),
      )
      claimFailed = !!claimErr
    }
    setSubmitting(false)
    // The same Instagram post entered by both creators: the database linked this entry to the first and both earn the collab points.
    if (entry?.collab_of) toastSuccess(tr('You both entered the same collab post, so you both earn the collab points. Its views count once.'))

    setShowSubmit(false)
    setVideoUrl('')
    setCaption('')
    setCaptionTouched(false)
    setLinkMeta(null)
    setClaiming([])
    // The reload below hasn't landed yet, so count this entry in by hand.
    const mine = submissions.filter((s) => s.creator_id === user.id).length
    setSuccess({ count: mine + 1, platform })
    load()
    if (claimFailed) notice(tr('Your entry is in, but the bonus could not be claimed. Tick it again on your entry card.'))
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
    const { error } = await submissionsApi.submissionBonusClaims().insert({
      submission_id: sub.id, rule_id: rule.id, creator_id: user.id, challenge_id: id,
    })
    if (error) {
      setBonusClaims((cur) => cur.filter((c) => !(c.submission_id === sub.id && c.rule_id === rule.id)))
      await notice(tr('Could not claim that bonus. Please try again.'))
    }
  }

  // TAKING A BONUS BACK. Jacob ticked a bonus on a video that did not qualify and had to ask the team to undo it. The
  // creator may delete their own claim (RLS since 155) and the delete rescoring trigger takes the points off.
  async function unclaimBonus(sub, rule) {
    if (!await confirm(tr('Take the "{b}" bonus off this video? The {n} points come off your score.', { b: rule.label.replace(/^\+?\d+\s*/, ''), n: rule.points }), { confirmLabel: tr('Take it off') })) return
    const before = bonusClaims
    setBonusClaims((cur) => cur.filter((c) => !(c.submission_id === sub.id && c.rule_id === rule.id)))
    const { error } = await submissionsApi.submissionBonusClaims().delete()
      .eq('submission_id', sub.id).eq('rule_id', rule.id).eq('creator_id', user.id)
    if (error) { setBonusClaims(before); await notice(tr('Could not remove that bonus. Please try again.')) }
  }

  async function removeMySubmission(subId) {
    if (!await confirm('Remove this entry?')) return
    await saved(submissionsApi.submissions().delete().eq('id', subId))
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
        <EmptyState icon={<Icon name="flag" className="h-7 w-7" />} title={tr("Challenge not found")} action={<Link to="/challenges" className="btn-primary">{tr("All challenges")}</Link>} />
      </div>
    )
  }

  // Live only while active AND before the deadline (midnight after the end date).
  const isLive = challenge.status === 'active' && nowMs < challengeDeadline(challenge.end_date).getTime()
  const isGlobalChallenge = !!networkId && challenge.community_id === networkId
  const myEntries = submissions.filter((s) => s.creator_id === user.id)
  // The joining bonus is on offer to somebody who has not entered a live points challenge (migration 383).
  const joinOffer = isLive && challenge.scoring === 'points' && myEntries.length === 0 ? (Number(challenge.join_bonus_points) || 0) : 0
  const vdayToday = isLive ? voucherDays.filter((d) => voucherDayState(d, nowMs) === 'today') : []
  const streaks = dailyStreaksByCreator(submissions, nowMs, challenge?.start_date ? Date.parse(challenge.start_date) : null)
  const normName = (v) => (v || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const entryQ = normName(entryQuery.trim())
  // FILTERS FOR THE ENTRIES. Sorting and a platform pick apply to whichever list is showing (everyone's or mine); the
  // name search stays on everyone's.
  const entryPlatforms = [...new Set(submissions.map((s) => s.platform).filter(Boolean))]
  const shownEntries = (() => {
    let list = entryScope === 'mine'
      ? myEntries
      : entryQ ? submissions.filter((s) => normName(s.profiles?.name).includes(entryQ)) : submissions
    if (entryPlatform) list = list.filter((s) => s.platform === entryPlatform)
    const views = (s) => Number(s.logged_views) || 0
    const pts = (s) => entryPoints.get(s.id)?.total ?? 0
    const when = (s) => Date.parse(s.submitted_at) || 0
    if (entrySort === 'views') return [...list].sort((a, b) => views(b) - views(a) || when(b) - when(a))
    if (entrySort === 'points') return [...list].sort((a, b) => pts(b) - pts(a) || views(b) - views(a))
    if (entrySort === 'oldest') return [...list].sort((a, b) => when(a) - when(b))
    return list
  })()

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
  const ownGroupId = byCreator.get(user.id) ?? null
  // THE TEAM IS ON NO BOARD, SO IT SEES EVERY BOARD.
  //
  // So for staff on a split challenge: `viewAs` null is ALL GROUPS (every
  // group's prizes, each under its name), and a group id is exactly what a
  // creator in that group is shown - the same `myGroup` every line below reads.
  const staffView = isAdmin && groups.length > 0 && !ownGroupId
  const previewGroup = staffView && viewAs ? groups.find((g) => g.id === viewAs) || null : null
  const allGroupsView = staffView && !previewGroup
  const myGroupId = previewGroup?.id ?? ownGroupId
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
  // BY VIDEOS OR BY POINTS (migration 241). The number is read in the
  // challenge's basis, a group's own threshold included.
  const partBasis = challenge?.participation_basis === 'points' && challenge?.scoring === 'points' ? 'points' : 'entries'
  const participationOf = (p) => (p?.participation_threshold && p?.participation_prize
    ? { threshold: p.participation_threshold, prize: p.participation_prize, basis: partBasis, scope: p.participation_scope ?? challenge?.participation_scope, cap: p.participation_cap ?? null, ownPart: !!p.own_part }
    : parseParticipationPrize(Array.isArray(p?.prize_structure) ? p.prize_structure : []))
  const participation = participationOf(myPrize)
  // Where I stand against that number: my entries, or my points on the board.
  const myPoints = Number(results.find((r) => r.creator_id === user.id)?.final_views) || 0
  const partHave = participation?.basis === 'points' ? myPoints : myEntries.length
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
      ? { threshold: shownPrize.participation_threshold, prize: shownPrize.participation_prize, basis: partBasis, scope: shownPrize.participation_scope ?? challenge?.participation_scope, cap: shownPrize.participation_cap ?? null, ownPart: !!shownPrize.own_part }
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
  // Five steps when the board pays five or more places (the team, 21 Sep).
  const podiumDepth = boardPrizeAt.size >= 5 || boardRows.length >= 5 ? 5 : 3
  const podiumPlaces = Array.from({ length: podiumDepth }, (_, i) => i + 1).map((rank) => {
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
      // Singular when it is one, for the same reason as the board: a unit
      // under a number is read as part of the number.
      unit: challenge.scoring === 'points'
        ? (Number(row.final_views) === 1 ? tr('point') : tr('points'))
        : tr('views'),
      // The reach behind the score. Only on a points board - on a views board
      // the score already IS this number and printing it twice says nothing.
      sub: challenge.scoring === 'points' && row.total_views > 0
        ? `${formatViews(row.total_views)} ${tr('views')}`
        : null,
      prize,
    }
  })

  // ---- BONUSES A CREATOR CLAIMS ------------------------------------------
  const claimsBySubmission = new Map()
  for (const c of bonusClaims) {
    if (!claimsBySubmission.has(c.submission_id)) claimsBySubmission.set(c.submission_id, new Set())
    claimsBySubmission.get(c.submission_id).add(c.rule_id)
  }
  const bonusById = new Map(bonusRules.map((r) => [r.id, r]))
  // A BONUS CAN RUN FOR PART OF THE CHALLENGE (migration 256). The submit form
  // offers only the ones open right now; an entry can claim one only if it was
  // submitted inside that bonus's dates, which is also what the database checks.
  const openBonusRules = bonusRules.filter((r) => ruleOpenAt(r, nowMs))
  const claimableFor = (s) => bonusRules.filter((r) => !claimsBySubmission.get(s.id)?.has(r.id) && ruleOpenAt(r, s.submitted_at))

  // THE LEADERBOARD TAB IS ALWAYS THERE.
  //
  // It used to appear only once a result row existed, so the board a creator
  // most wants to see - the empty one, on day one, with every prize still up
  // for grabs - was the one board the page refused to draw. The component fills
  // itself from the prize structure now (see ChallengeLeaderboard), so there is
  // always something to show.
  //
  // THE LEADERBOARD COMES BEFORE THE ENTRIES. The board is the question people open a challenge to answer; the gallery
  // is browsing.
  const TABS = [
    { key: 'brief', label: tr('The brief'), icon: 'book' },
    { key: 'leaderboard', label: tr('Leaderboard'), icon: 'trophy' },
    { key: 'entries', label: tr('Entries'), icon: 'video', count: submissions.length },
    // COUNTRY AGAINST COUNTRY, FOR THE GLOBAL CHALLENGE ONLY.
    ...(isGlobalChallenge ? [{ key: 'countries', label: tr('Country leaderboard'), icon: 'globe' }] : []),
  ]

  const leaderboardEl = (
    <ChallengeDetailLeaderboard
      boardCounts={boardCounts}
      boardParticipation={boardParticipation}
      boardPrizes={boardPrizes}
      boardRows={boardRows}
      boards={boards}
      challenge={challenge}
      isLive={isLive}
      myEntries={myEntries}
      myGroupId={myGroupId}
      podiumPlaces={podiumPlaces}
      results={results}
      setBoard={setBoard}
      setShowSubmit={setShowSubmit}
      shownBoard={shownBoard}
      shownPrize={shownPrize}
      streaks={streaks}
      subCountByCreator={subCountByCreator}
      submittedPlatforms={submittedPlatforms}
      tr={tr}
      user={user}
    />
  )

  // ONLY THE BOARD (15 Oct 2026, the challenge's analytics page): "all I wanted to show is the actual leaderboard here,
  // not an exact duplicate of that page" - no header buttons, brief, entries or offers; the country board beside it on a
  // global challenge.
  if (boardOnly) {
    return (
      <div className="space-y-4">
        {isGlobalChallenge && (
          <div className="flex gap-1 rounded-full bg-cloud p-1 sm:inline-flex">
            {[['leaderboard', tr('Leaderboard'), 'trophy'], ['countries', tr('Country leaderboard'), 'globe']].map(([k, l, ic]) => (
              <button key={k} type="button" onClick={() => setTab(k)} aria-pressed={tab === k}
                className={cx('flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-colors', tab === k ? 'bg-brand text-white shadow-card' : 'text-smoke hover:text-ink')}>
                <Icon name={ic} className="h-3.5 w-3.5" />{l}
              </button>
            ))}
          </div>
        )}
        <div key={tab} className="animate-tab-in">
          {tab === 'countries' && isGlobalChallenge
            ? <CountryBoard challenge={challenge} refreshKey={`${challenge.results_updated_at || ''}:${results.length}:${submissions.length}`} meId={user.id} />
            : leaderboardEl}
        </div>
      </div>
    )
  }

  return (
    <div ref={pageRef} className={shellClass} style={holdH ? { minHeight: holdH } : undefined}>
      {!embedded && (
        <Link to="/challenges" className="mb-6 inline-block text-sm font-medium text-smoke hover:text-brand">← {tr("All challenges")}</Link>
      )}

      <PageHeader
        title={challenge.title}
        subtitle={`${formatDate(challenge.start_date)} → ${formatDate(challenge.end_date)}`}
        action={
          <div className="flex flex-wrap items-center gap-3">
            {/* RUNNING A CHALLENGE HAPPENS ON THE CHALLENGE. Publish, close and archive used to live on a separate
                "Manage challenges" list, which meant the page showing you a challenge could not change its state and the
                page that could change it did not show you the challenge. The team asked for that page to go; these are
                the controls that were worth keeping, on the page they are about. */}
            {/* THREE FLAT BUTTONS BECAME A RANK.

                RESULTS IS THE JOB, so it is the only solid button.

                AND IT NO LONGER SAYS "INTERIM". they are right, and the reason is worth keeping: EVERY live challenge is
                interim. Results rows exist from the first logged view, so the chip read "interim" on every unfinished
                challenge in the product - a label that is true of everything tells you nothing, and it was sitting
                inside the one button a country manager presses every day. FINAL is the state worth a word, because it is
                the one that has stopped changing, so that is the only one that gets one.

                CLOSING A CHALLENGE IS NOT A TOOLBAR ACTION. It ends the thing
                and it cannot be undone from here, so it sits behind the "..."
                with Publish and Archive - one press away, not one slip away -
                and it is on the RESULTS PAGE as a proper control, which is
                where a manager already is when they decide entries are over.
                See AdminResults' lifecycle card. */}
            {isAdmin && (
              <>
                {/* A PUSH ABOUT THIS CHALLENGE, FROM THIS CHALLENGE. The platform could already notify a whole market,
                    but only by posting in an announcements room - which is a different act: a room post is a message
                    people reply to and it lives there forever. "Two days left" is neither. */}
                <SendPushButton challenge={challenge} label={tr("Send a push")} />
                <Link to={`/admin/challenges/${id}/edit`} className="btn-secondary !py-2 text-xs">{tr("Edit")}</Link>
                <Link
                  to={`/admin/challenges/${id}/results`}
                  className="btn-primary inline-flex items-center gap-1.5 !py-2 text-xs"
                >
                  <Icon name="trophy" className="h-3.5 w-3.5" />
                  {tr("Results")}
                  {challenge.results_status === 'final' && (
                    <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[10px] font-semibold">
                      {tr("final")}
                    </span>
                  )}
                </Link>
              </>
            )}
            {/* NO "LIVE" BADGE HERE ANY MORE. The countdown card right under this header already says so; a second badge
                repeating it was the only thing this row said for a live challenge. A non-live one still gets its status,
                which nothing else on the page states. */}
            {!isLive && <Badge tone="grey">{challenge.status}</Badge>}
          </div>
        }
      />

      {/* SEE IT AS EACH GROUP SEES IT - staff only, split challenges only. "All groups" shows every group's prizes side
          by side; a group shows the page exactly as a creator in it gets it. */}
      {staffView && (
        <div className="mb-6 flex flex-col gap-2 rounded-card border border-brand/20 bg-white px-4 py-3 shadow-card sm:flex-row sm:items-center sm:gap-4">
          <p className="flex shrink-0 items-center gap-2 text-xs font-semibold uppercase tracking-wider text-smoke">
            <Icon name="eye" className="h-4 w-4 text-brand" />
            {tr("View as")}
          </p>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" role="radiogroup" aria-label={tr("View as")}>
            {[{ id: null, name: tr('All groups') }, ...groups].map((g) => {
              const on = (viewAs ?? null) === g.id
              return (
                <button
                  key={g.id ?? 'all'}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => { setViewAs(g.id); setBoard(g.id ?? null) }}
                  className={cx(
                    'flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-all duration-200',
                    on ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hover:-translate-y-0.5 hover:text-ink',
                  )}
                >
                  {g.name}
                  {g.id && (
                    <span className={cx('rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums', on ? 'bg-white/25' : 'bg-white text-smoke')}>
                      {boardCounts.get(g.id) || 0}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
          <p className="text-xs text-smoke sm:ml-auto sm:text-right">
            {previewGroup
              ? tr("What a creator in {g} sees.", { g: previewGroup.name })
              : tr("Every group's prizes and boards. Creators only see their own group.")}
          </p>
        </div>
      )}

      {/* THE DEADLINE CARD, WHICH IS THE ONE THING ON THIS PAGE THAT MOVES.

          THE EMOJI IS GONE. It was a clapperboard, which renders as Apple's own
          artwork on an iPhone - a piece of somebody else's icon set inside our
          only orange button. The house rule already says line icons, never
          emoji, in chrome; this button now says what it does and nothing else.

          IT IS ORANGE, NOT BLACK. It was solid ink for a week - the only dark block on a white page, which certainly
          stood out, and which So it is the LiveChallengeCard's own gradient, its own blooms and its own white-on-brand
          button. The card a creator meets on /challenges and the card they meet inside the brief are now the same object
          seen twice, which is what makes the second one recognisable.

          THE ANIMATION IS ONE PASS OF LIGHT (`challenge-sheen`, index.css - the
          live challenge card already carries it) plus a slow breathing glow
          behind the button. Both are decoration on a static layout, so
          `prefers-reduced-motion` can drop them and nothing moves position. */}
      {isLive && (
        <div className={cx(
          'challenge-card relative mb-10 overflow-hidden rounded-card p-6 text-white shadow-lift sm:p-8',
          // The worldwide brief wears the global card's darker ground here too, as it does on /challenges and in the
          // Live now row.
          isGlobalChallenge ? 'bg-gradient-to-br from-[#8f2a04] via-brand to-brand-light' : 'bg-gradient-to-br from-brand to-brand-light',
        )}>
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
                {/* JUST THE DOT, NO RING - see the note on `LiveDot` in network/Motion.jsx. This page is eagerly routed,
                    so it matches that component's look with a plain `animate-pulse` rather than importing motion for one
                    dot. */}
                <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-white" />
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
                <button
                  type="button"
                  onClick={() => { setTab('entries'); setEntryScope('mine') }}
                  className="mt-2 block w-full text-center text-xs text-white/85 underline-offset-2 hover:underline sm:text-right"
                >
                  {myEntries.length === 1 ? tr('1 entry in') : tr('{n} entries in', { n: myEntries.length })} · {tr('see them')}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* WHICH BOARD YOU ARE ON, SAID PLAINLY AND SAID EARLY. It sits directly under the countdown, above the tabs,
          because it changes the meaning of everything below it - the entries you are compared against, the leaderboard
          you appear on and the prize you are playing for are all your group's, not the challenge's. It only draws at all
          on a challenge that has groups. */}
      {groups.length > 0 && !allGroupsView && (
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
      {/* HELD FROM THE FIRST PAINT: `pending` draws the card at its full height while the audience count is still on its
          way, so its arrival fills a bar in rather than shoving the tabs down. */}
      {isLive && (participationShown || audience == null) && (
        <ParticipationBar
          participation={participationShown?.data ?? null}
          pending={!participationShown}
          where={participationShown?.where ?? 'in this challenge'}
          className="mb-10"
        />
      )}

      {/* THE RECAP, ONCE IT IS OVER. A finished challenge you entered opens with your own story of it - see
          pages/ChallengeRecap. */}
      {!isLive && challenge.status !== 'draft' && myEntries.length > 0 && (
        <RecapBanner to={`/challenges/${challenge.id}/recap`} className="mb-8" />
      )}

      {/* THE TABS ARE BUTTONS, NOT UNDERLINED WORDS. A 2px underline under grey text is the quietest control this app
          draws, and it was the switch between the three things the page is for. They are pressable pills now - a glyph,
          the word, and the entry count as a chip - so the choice reads as a choice. They still lift on hover rather than
          changing colour, which is the house rule. */}
      {/* `pt-1.5 -mt-1.5`: the row scrolls sideways, and a box that scrolls on one axis clips on both - so a pill
          lifting 2px on hover had its top sliced off (the team, 21 Sep). The padding is the room to lift into. */}
      {/* THE TABS, AND BESIDE THEM WHAT THE BOARD IS. The team: clicking Leaderboard showed a full-width "Current
          leaderboard" card; "rather than have this go across the full screen I would have it to the right of the three
          buttons, it would fit nicely, more compact." It is a badge on the same row from `sm` up (under the tabs on a
          phone), and it slides in when the Leaderboard tab opens. */}
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
      {/* `sm:overflow-visible shrink-0`: with the roomier pills the four tabs plus the board badge no longer fit one
          line, and a scrolling row beside the badge was clipping the last tab ("Clasific..."). The row now keeps its
          full width and the BADGE wraps underneath instead. */}
      <div className="-mx-4 -mt-1.5 flex gap-1.5 overflow-x-auto px-4 pb-1.5 pt-1.5 sm:mx-0 sm:shrink-0 sm:gap-2 sm:overflow-visible sm:px-0" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => switchTab(t.key)}
            className={cx(
              // ROOM ON EITHER SIDE OF THE WORDS: the four tabs were crowded - wider pills, more air between glyph, word
              // and count.
              'flex shrink-0 grow basis-auto items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-semibold transition-all duration-200 sm:grow-0 sm:gap-2 sm:px-6 sm:text-sm',
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
      <OfferDetail offer={offerOpen} onClose={() => setOfferOpen(null)} />
      <SwapIn swapKey={tab === 'leaderboard' || tab === 'countries' ? 'board' : 'bonus'}>
        {tab !== 'leaderboard' && tab !== 'countries' ? (() => {
          const toBonus = () => {
            setTab('brief')
            setTimeout(() => document.getElementById('bonus-points')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 60)
          }
          // EVERY OFFER ON NOW TAKES A TURN IN THE DARK CARD: a running boost, today's voucher day, the joining bonus
          // for somebody who has not entered. A boost that has not started yet comes after those.
          const offers = []
          // EACH ONE OPENS ITS OWN CARD: "a pop-up should show more info on that... the double points, when you click on
          // it, should show a pop-up with more info too".
          if (boost?.live) offers.push(<BoostCallout key="boost" boost={boost} onOpen={() => setOfferOpen({ kind: 'boost', boost })} />)
          for (const d of vdayToday) offers.push(<VoucherDayCallout key={d.id} day={d} now={nowMs} onOpen={() => setOfferOpen({ kind: 'vday', day: d })} />)
          if (joinOffer) offers.push(<JoinBonusCallout key="join" points={joinOffer} from={challenge.join_bonus_from} onOpen={() => setOfferOpen({ kind: 'join', points: joinOffer, from: challenge.join_bonus_from })} />)
          if (boost && !boost.live) offers.push(<BoostCallout key="boost-next" boost={boost} onOpen={() => setOfferOpen({ kind: 'boost', boost })} />)
          return offers.length ? <OfferRotator items={offers} /> : <LiveBonusCallout rules={pointRules} now={nowMs} onOpen={toBonus} />
        })() : (
          <BoardStatus
            key={challenge.results_status}
            status={challenge.results_status}
            points={challenge.scoring === 'points'}
            updatedAt={challenge.results_updated_at}
            empty={results.length === 0}
            tr={tr}
          />
        )}
      </SwapIn>
      </div>

      {/* ---------- Tab: brief ---------- */}
      {/* TWO RUNNING ORDERS OVER NAMED SECTIONS, chosen with `useIsMobile()`.

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
          {/* BIGGER THAN ANY HEADING INSIDE IT, IN INK, AND FOLDED. And it opens on its first paragraph with Read all,
              so the points table below is not a long scroll away. */}
          <section className="card">
            <TranslatedText text={challenge.description || ''} heading={<h2 className="text-2xl font-bold tracking-tight">{tr("The brief")}</h2>}>{(md) => <CollapsibleRich md={md} />}</TranslatedText>
          </section>
          </>
        )
        const rulesCard = (
          <>
          {challenge.rules && (
            <section className="card">
              <TranslatedText text={challenge.rules} heading={<h2 className="text-2xl font-bold tracking-tight">{tr("Rules")}</h2>}>{(md) => <CollapsibleRich md={md} />}</TranslatedText>
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
            <ScoringPanel challenge={challenge} rules={pointRules} />
          )}
          </>
        )
        // ONE PRIZE CARD, DRAWN ONCE FOR A CREATOR AND ONCE PER GROUP FOR THE TEAM.
        const prizeCardFor = ({ key, list, potLabel, part, groupName = null, showProgress = true, withAwards = true, awards = null }) => (
          <section key={key} className="card !p-0 overflow-hidden">
            <div className="flex items-center gap-2.5 border-b border-gray-100 px-5 py-4">
              <Icon name="trophy" className="h-5 w-5 shrink-0 text-brand" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-ink">{tr("Prizes")}</h2>
              {groupName && (
                <span className="truncate rounded-md bg-cloud px-2 py-0.5 text-xs font-semibold text-ink">{groupName}</span>
              )}
              {potLabel && (
                <span className="ml-auto shrink-0 rounded-full bg-brand px-2.5 py-1 text-xs font-bold tabular-nums text-white">
                  {tr("{n} to win", { n: potLabel })}
                </span>
              )}
            </div>

            {list.length === 0 ? (
              <p className="px-5 py-6 text-sm text-smoke">{tr("Prize details coming soon.")}</p>
            ) : (
              <ul className="divide-y divide-gray-50">
                {(isMobile && !allPrizes ? list.slice(0, 5) : list).map((p, i) => {
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
                      <span className="min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-smoke">{placeNumber(p.place) ? ordinalFor(placeNumber(p.place)) : p.place}</span>
                      <span className="shrink-0 text-sm font-bold text-ink"><PrizeText text={p.prize} /></span>
                    </li>
                  )
                })}
              </ul>
            )}
            {/* Five places on a phone, the rest one tap away. */}
            {isMobile && list.length > 5 && (
              <button
                type="button"
                onClick={() => setAllPrizes((v) => !v)}
                className="flex w-full items-center justify-center gap-1.5 border-t border-gray-50 px-5 py-3 text-sm font-semibold text-brand"
              >
                {allPrizes ? tr('Show less') : (list.length - 5 === 1 ? tr('+1 more prize') : tr('+{n} more prizes', { n: list.length - 5 }))}
                <Icon name="chevronDown" className={cx('h-4 w-4 transition-transform duration-300', allPrizes && 'rotate-180')} />
              </button>
            )}

            {/* THE TAKING-PART REWARD, TIDIED. The prize is the headline, the condition is the line under it, and the
                bar says how far along YOU are in numbers. */}
            {part && (() => {
              const participation = part
              const byPoints = participation.basis === 'points'
              const pct = Math.min(100, Math.round((partHave / participation.threshold) * 100))
              const mine = prizeStandings?.find((r) => r.slot === 'participation' && r.creator_id === user?.id)
              // A board with its own reward has its own queue, so only its own earners count against its cap.
              const onThisBoard = (r) => !(participation.ownPart && groupName) || r.label === `Participation - ${groupName}`
              const earned = prizeStandings?.filter((r) => r.slot === 'participation' && r.status === 'earned' && onThisBoard(r)).length ?? 0
              const cap = participation.cap ?? null
              const left = cap ? Math.max(0, cap - earned) : null
              const short = participation.threshold - partHave
              let status
              if (partHave >= participation.threshold) {
                status = mine?.status === 'waitlisted' ? tr("You got there after the first {n} places were taken.", { n: cap })
                  : mine?.status === 'excluded' ? tr("You are in the prize places, so this one goes to someone else.")
                    : tr("You have earned it.")
              } else {
                const togo = byPoints
                  ? (short === 1 ? tr("1 more point to go.") : tr("{n} more points to go.", { n: short }))
                  : tr("{n} more videos to go.", { n: short })
                status = left === 0 ? tr("All {n} places have been taken.", { n: cap })
                  : left != null ? `${togo} ${tr("{n} places left.", { n: left })}` : togo
              }
              return (
                <div className="border-t border-gray-100 px-5 py-4">
                  <div className="flex items-start gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white">
                      <Icon name="ticket" className="h-[18px] w-[18px]" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">{tr("Reward for taking part")}</p>
                      <p className="mt-0.5 text-[15px] font-bold leading-snug text-ink"><PrizeText text={participation.prize} /></p>
                      <p className="mt-0.5 text-xs leading-snug text-ink/70">
                        {byPoints
                          ? tr("Reach {n} points", { n: participation.threshold })
                          : tr("Post {n} videos", { n: participation.threshold })}
                        {participation.scope === 'outside_prizes' ? ` · ${tr("outside the prize places")}` : ''}
                        {cap ? ` · ${tr("first {n} creators", { n: cap })}` : ''}
                      </p>
                    </div>
                  </div>
                  {isLive && showProgress && (
                    <div className="mt-3">
                      <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
                        <span className="font-semibold text-ink">{status}</span>
                        <span className="shrink-0 font-bold tabular-nums text-brand">
                          {Math.min(partHave, participation.threshold)}/{participation.threshold}
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-cloud">
                        <div className="h-full rounded-full bg-brand transition-[width] duration-700" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  )}
                </div>
              )
            })()}
            {withAwards && (Array.isArray(awards) ? awards : (Array.isArray(challenge?.extra_awards) ? challenge.extra_awards : [])).filter((a) => a?.prize).map((a) => (
              <div key={a.id} className="border-t border-gray-100 px-5 py-4">
                <div className="flex items-start gap-3">
                  <Icon name="trophy" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-brand">{tr(a.label || 'Most committed')}</p>
                    <p className="text-sm font-semibold text-ink"><PrizeText text={a.prize} /></p>
                    <p className="mt-0.5 text-xs text-smoke">
                      {a.scope === 'anyone' ? tr("For whoever enters the most videos.") : tr("For whoever enters the most videos and finishes outside the top {n}.", {
                        n: a.exclude_top || (Array.isArray(challenge.prize_structure) ? challenge.prize_structure.length : 0) || 10,
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </section>
        )
        const prizesCard = (
          <>
          {/* THE PRIZES ARE THE POINT OF THE PAGE - BUT THEY ARE STILL A
              CARD ON THIS PAGE.

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
          {allGroupsView ? (
            <div className="space-y-5">
              {groups.map((g, i) => {
                const gp = prizeForGroup(g, challenge)
                const pot = Number(gp.prize_amount) || 0
                return prizeCardFor({
                  key: g.id,
                  list: Array.isArray(gp.prize_structure) ? gp.prize_structure : [],
                  potLabel: pot > 0 ? formatMoney(pot, gp.prize_currency || 'EUR') : '',
                  part: participationOf(gp),
                  groupName: g.name,
                  // The team is on no board, so there is no "your progress" to draw.
                  showProgress: false,
                  // A board's own Most committed on its own card; the challenge's once, on the first board that has none.
                  awards: gp.own_awards ? gp.extra_awards : (i === groups.findIndex((x) => !(x.extra_awards || []).length) ? gp.extra_awards : []),
                })
              })}
            </div>
          ) : prizeCardFor({
            key: 'mine',
            list: prizes,
            potLabel: prizePotLabel,
            part: participation,
            groupName: myGroup?.name ?? null,
            awards: myPrize?.extra_awards ?? null,
          })}
          </>
        )
        const platformsCard = (
          <>
          {/* "PLATFORMS YOU CAN POST ON", IN THE PLATFORMS' OWN COLOURS.

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

        // THE PHONE'S ORDER, SHORTER. Prizes, then the brief (folded), then straight into how points are scored - the
        // part a creator comes back to check - with the platforms and the (folded) rules last.
        // THE RULES ARE BACK UNDER THE BRIEF, on both widths, above how points are scored. They fold exactly like the
        // brief (CollapsibleRich), so the points are still close by.
        const bonusCard = <BonusPointsCard rules={pointRules} now={nowMs} boost={boost} joinPts={joinOffer} joinFrom={challenge.join_bonus_from} voucherDays={voucherDays} />
        // THE COLLAB BONUS, WHEN THE CHALLENGE RUNS ONE: claimed on your own entry with a creator you are connected to.
        const collabRule = (pointRules || []).find((r) => r.kind === 'collab' && r.is_active !== false)
        const collabCard = collabRule ? <CollabCard challenge={challenge} rule={collabRule} meId={user.id} /> : null
        // THE HOOK BUTTON (moved 26 Sep): first thing in the rail and first thing on a phone, above the prizes. Not on a
        // finished challenge.
        const hookCard = challenge.status !== 'archived' ? <HookButton /> : null
        // THE JOINING BONUS AND THE VOUCHER DAYS (migration 383) lead the page: they exist to get somebody posting.
        const kickersCard = <ChallengeKickers challenge={challenge} meId={user.id} />
        if (isMobile) {
          return (
            <div className="space-y-6">
              {kickersCard}
              {hookCard}
              {prizesCard}
              {briefCard}
              {rulesCard}
              {scoringCard}
              {bonusCard}
              {collabCard}
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
              {kickersCard}
              {hookCard}
              {prizesCard}
              {bonusCard}
              {collabCard}
              {platformsCard}
            </div>
          </div>
        )
      })()}

      {/* ---------- Tab: entries gallery ---------- */}
      {tab === 'entries' && submissions.length > 0 && (
        <div className="mb-5 flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="flex shrink-0 gap-1 rounded-full bg-cloud p-1" role="radiogroup" aria-label={tr('Whose entries')}>
            {[
              { key: 'all', label: tr('All entries'), icon: 'video', n: submissions.length },
              { key: 'mine', label: tr('My entries'), icon: 'user', n: myEntries.length },
            ].map((o) => (
              <button
                key={o.key}
                type="button"
                role="radio"
                aria-checked={entryScope === o.key}
                onClick={() => setEntryScope(o.key)}
                className={cx(
                  'flex flex-1 items-center justify-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition-all duration-200 sm:flex-none sm:text-sm',
                  entryScope === o.key ? 'bg-brand text-white shadow-card' : 'text-smoke hover:text-ink',
                )}
              >
                <Icon name={o.icon} className="h-3.5 w-3.5" />
                {o.label}
                <span className={cx('rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums', entryScope === o.key ? 'bg-white/25' : 'bg-white')}>{o.n}</span>
              </button>
            ))}
          </div>
          {entryScope === 'all' && (
            <div className="relative min-w-0 flex-1 animate-fade-up">
              <Icon name="magnifier" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-smoke" />
              <input
                type="search"
                value={entryQuery}
                onChange={(e) => setEntryQuery(e.target.value)}
                placeholder={tr('Search by name')}
                aria-label={tr('Search entries by name')}
                className="input no-ios-zoom !rounded-full !py-2 !pl-10"
              />
            </div>
          )}
        </div>
      )}
      {tab === 'entries' && submissions.length > 1 && (
        <div className="-mx-4 -mt-2 mb-4 flex items-center gap-1.5 overflow-x-auto scroll-px-4 px-4 pb-1 sm:mx-0 sm:px-0" role="group" aria-label={tr('Sort and filter entries')}>
          <Icon name="sliders" className="mr-0.5 h-4 w-4 shrink-0 text-smoke" />
          {[
            { key: 'newest', label: tr('Newest'), icon: 'clock' },
            { key: 'views', label: tr('Most views'), icon: 'eye' },
            ...(challenge.scoring === 'points' ? [{ key: 'points', label: tr('Most points'), icon: 'trophy' }] : []),
            { key: 'oldest', label: tr('First posted'), icon: 'flag' },
          ].map((o) => (
            <button
              key={o.key}
              type="button"
              aria-pressed={entrySort === o.key}
              onClick={() => setEntrySort(o.key)}
              className={cx(
                'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors',
                entrySort === o.key ? 'bg-brand text-white' : 'border border-gray-200 bg-white text-smoke hover:text-ink',
              )}
            >
              <Icon name={o.icon} className="h-3.5 w-3.5" />{o.label}
            </button>
          ))}
          {entryPlatforms.length > 1 && <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-gray-200" />}
          {entryPlatforms.length > 1 && entryPlatforms.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={entryPlatform === p}
              onClick={() => setEntryPlatform(entryPlatform === p ? '' : p)}
              className={cx(
                'flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1.5 text-[13px] font-semibold transition-colors',
                entryPlatform === p ? 'bg-ink text-white' : 'border border-gray-200 bg-white text-smoke hover:text-ink',
              )}
            >
              <SocialMark brand={SOCIAL_BRAND[p] || p.toLowerCase()} className="h-3.5 w-3.5" colored={entryPlatform !== p} />{p}
            </button>
          ))}
        </div>
      )}
      {tab === 'entries' && submissions.length > 0 && shownEntries.length === 0 && (
        entryScope === 'mine' ? (
          <EmptyState
            icon={<Icon name="video" className="h-7 w-7" />}
            title={tr('You have no entries yet')}
            hint={isLive ? tr('Post a video, paste the link, and it shows up here.') : tr('You did not enter this challenge.')}
            action={isLive && <button onClick={() => setShowSubmit(true)} className="btn-primary">{tr('Submit your video')}</button>}
          />
        ) : (
          <p className="py-10 text-center text-sm text-smoke">{entryQuery.trim() ? tr('No entries from anyone called "{q}".', { q: entryQuery.trim() }) : tr('No entries match these filters.')}</p>
        )
      )}
      {tab === 'entries' && (submissions.length === 0 || shownEntries.length > 0) && (
        submissions.length === 0 ? (
          <EmptyState
            icon={<Icon name="video" className="h-7 w-7" />}
            title={tr("No submissions yet. Be the first to enter!")}
            hint={isLive ? 'Paste your video link and claim the early-bird bragging rights.' : 'This challenge closed without entries.'}
            action={isLive && <button onClick={() => setShowSubmit(true)} className="btn-primary">{tr("Submit your video")}</button>}
          />
        ) : (
          // FOUR ACROSS ON A DESKTOP. Two on a phone, three on a tablet, four from lg.
          <div key={`${entryScope}:${entryQuery}:${entrySort}:${entryPlatform}`} className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
            {shownEntries.map((s, i) => (
              <div key={s.id} style={{ animationDelay: `${Math.min(i, 9) * 40}ms` }} className={cx(
                'animate-fade-up',
                'card group flex flex-col overflow-hidden !p-0 transition-all duration-300 hoverable:hover:-translate-y-1 hoverable:hover:shadow-lift',
                s.creator_id === user.id && 'ring-2 ring-brand/30',
              )}>
                <EntryPreview
                  submission={s}
                  points={challenge.scoring === 'points' ? (entryPoints.get(s.id) ?? { total: 0 }) : null}
                  onPlay={() => openEntry(s)}
                />
                <ChallengeDetailEntryBody
                  bonusById={bonusById}
                  challenge={challenge}
                  claimBonus={claimBonus}
                  claimableFor={claimableFor}
                  claimsBySubmission={claimsBySubmission}
                  entryPoints={entryPoints}
                  feedback={feedback}
                  isAdmin={isAdmin}
                  isLive={isLive}
                  removeMySubmission={removeMySubmission}
                  s={s}
                  setFeedback={setFeedback}
                  tr={tr}
                  unclaimBonus={unclaimBonus}
                  user={user}
                />
              </div>
            ))}
          </div>
        )
      )}

      {/* ---------- Tab: leaderboard ---------- */}
      {tab === 'countries' && isGlobalChallenge && (
        <div className="animate-fade-up">
          <CountryBoard challenge={challenge} refreshKey={`${challenge.results_updated_at || ''}:${results.length}:${submissions.length}`} meId={user.id} />
        </div>
      )}

      {tab === 'leaderboard' && leaderboardEl}

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
      <ChallengeDetailSubmitModal
        caption={caption}
        claiming={claiming}
        dupInfo={dupInfo}
        errorField={errorField}
        linkMeta={linkMeta}
        normaliseUrl={normaliseUrl}
        openBonusRules={openBonusRules}
        setCaption={setCaption}
        setCaptionTouched={setCaptionTouched}
        setClaiming={setClaiming}
        setDupInfo={setDupInfo}
        setErrorField={setErrorField}
        setShowSubmit={setShowSubmit}
        setSubmitError={setSubmitError}
        setVideoUrl={setVideoUrl}
        showSubmit={showSubmit}
        submitEntry={submitEntry}
        submitError={submitError}
        submitting={submitting}
        tr={tr}
        urlProblem={urlProblem}
        videoUrl={videoUrl}
      />

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

// WHAT THE BOARD IS, IN ONE BADGE BESIDE THE TABS.
//
// Three states, the same three the full-width card used to spell out: live
// (still moving, and when it last moved), final, and not started. The detail
// sentence is still there, in the badge's title and for screen readers; what is
// gone is a card the width of the page to say "these can still change".
function BoardStatus({ status, points, updatedAt, empty, tr }) {
  const live = status === 'interim'
  const final = status === 'final'
  const label = live ? tr('Current leaderboard') : final ? tr('Final results') : empty ? tr('Every place is still open') : tr('Standings so far')
  const detail = live
    ? `${points ? tr('Points earned so far') : tr('Views logged so far')}${updatedAt ? ` · ${tr('updated')} ${timeAgo(updatedAt)}` : ''}`
    : final ? tr('The challenge has closed and these standings are final.')
      : empty ? (points ? tr('Nobody has scored yet. Post a video and you take the top spot.') : tr('Nobody has a logged view count yet. Post a video and you take the top spot.'))
        : tr("Views are counted automatically off each entry's link, a few times a day.")
  const long = live ? `${detail}. ${tr('These can still change. Final results are counted after the challenge closes.')}` : detail
  // FULL WIDTH, LIKE ANOTHER CARD IN THE ROW - REVERSING THE 22 SEP DECISION ABOVE. And for a phone: "it should extend
  // the full way, from the brief to the end of entries" - the same instruction, both widths. `flex-1` fills whatever the
  // tabs row does not use on `sm` and up; `w-full` does the same thing stacked on a phone. The pill becomes a card shape
  // (`rounded-2xl`, not `rounded-full`) because a shape built to hug a few words looks stretched rather than spacious
  // once it is asked to fill a row.
  return (
    <div
      title={long}
      className={cx(
        'board-status', SLOT,
        live || final ? 'bg-gradient-to-r from-brand to-brand-light text-white shadow-card' : 'border border-dashed border-brand/30 bg-white text-ink',
      )}
    >
      <span className={cx(SLOT_ICON, live || final ? 'text-white' : 'text-brand')}>
        {live
          // JUST THE DOT, NO RING. Matches `LiveDot` in network/Motion.jsx, reimplemented with a plain `animate-pulse`
          // because this page is eagerly routed and motion is reserved for lazy ones.
          ? <span className="inline-flex h-2 w-2 animate-pulse rounded-full bg-white" />
          : <Icon name={final ? 'trophy' : 'sparkles'} className={cx('h-4 w-4', final ? 'text-white' : 'text-brand')} />}
      </span>
      <span className="min-w-0 leading-tight">
        <span className="block truncate text-[13px] font-semibold">{label}</span>
        <span className={cx('block truncate text-[11px]', live || final ? 'text-white/85' : 'text-smoke')}>{detail}</span>
      </span>
      <span className="sr-only">{long}</span>
    </div>
  )
}
