import { useEffect, useState, useCallback } from 'react'
import { confirm } from '../../lib/confirm'
import { useParams, Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, EmptyState, Modal, PageHeader, Skeleton, Spinner, Toggle, Select } from '../../components/ui'
import Icon from '../../components/Icon'
import { cx, formatViews, formatMoney, formatDateTimeTz, timeAgo } from '../../lib/utils'
import { describeSyncError } from '../../lib/viewSync'
import WinnersPodium from '../../components/WinnersPodium'
import ViewSyncPanel from '../../components/admin/ViewSyncPanel'
import ShareLeaderboard from '../../components/admin/ShareLeaderboard'
import PrizeStandingsPanel, { usePrizeStandings } from '../../components/admin/PrizeStandingsPanel'
import { PLATFORM_ORDER } from '../../components/PlatformBadges'
import { groupByCreator, boardsFor, prizeForGroup } from '../../lib/challengeGroups'
import { pickClass } from '../../lib/pick'
import Reveal from '../../components/network/Reveal'

// Results entry for one challenge:
//  1. View counts arrive by themselves - the `view-sync` Edge Function reads
//     each entry off the link the creator submitted, daily by default. The box
//     on each row is still there and still wins: a number typed by hand is
//     never overwritten by a LOWER reading (views do not fall, so a lower one
//     means a bad read or a better source), and the row says where it came from.
//  2. "Sync this challenge now" in the panel above does the whole list on demand.
//  3. "Generate leaderboard" ranks creators by their best entry's views
//     and writes the final results table (which feeds the Wall of Fame).
export default function AdminResults() {
  const { id } = useParams()
  const [challenge, setChallenge] = useState(null)
  const [submissions, setSubmissions] = useState([])
  const [resultsCount, setResultsCount] = useState(0)
  // The saved board, one row per creator (and per group on a split challenge).
  const [results, setResults] = useState([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [sharing, setSharing] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [awarding, setAwarding] = useState(false)
  const [toast, setToast] = useState('')
  // SUBMISSION ORDER, OR HIGHEST VIEWS FIRST. The fetch itself stays ordered by
  // `submitted_at` (that is the order disqualify/reinstate/save all reason
  // about); this only re-sorts what is already loaded, so nothing about
  // syncing or saving a view count changes underneath it.
  const [viewSort, setViewSort] = useState('submitted')
  // POSTED BEFORE THE CHALLENGE OPENED (22 Sep 2026, migration 245). Ethan:
  // creators were entering old viral videos. `submissions.posted_at` is decoded
  // from the video's own id (TikTok, Instagram) or read from the platform
  // (YouTube); `challenge_starts_at` is midnight of the start date in the
  // challenge's own market timezone.
  const [startsAt, setStartsAt] = useState(null)
  const [onlyEarly, setOnlyEarly] = useState(false)
  const [disqualified, setDisqualified] = useState([])
  const [dq, setDq] = useState(null) // { sub, reason, notify, busy }

  // While the challenge is still running a leaderboard is an INTERIM snapshot;
  // once it has ended (or been archived) it's the FINAL ranking.
  const isLive = challenge?.status === 'active'
  // HAS IT FINISHED? (22 Sep 2026) Ethan: "the publish winners button should
  // only show up after the challenge has ended, the leaderboard updates
  // automatically anyway throughout." The deadline passing counts as ended even
  // before the archive cron has flipped the status, so the button is there the
  // moment entries close rather than up to five minutes later.
  const [nowMs] = useState(() => Date.now())
  const ended = !!challenge && (!isLive || (challenge.end_date && new Date(challenge.end_date).getTime() < nowMs))

  const load = useCallback(async () => {
    const [{ data: ch }, { data: subs }, { data: res }] = await Promise.all([
      supabase.from('challenges').select('*').eq('id', id).single(),
      supabase
        .from('submissions')
        .select('*, profiles:creator_id(id, name, photo_url)')
        .eq('challenge_id', id)
        .order('submitted_at'),
      supabase.from('results').select('creator_id, final_views, total_views, rank, group_id').eq('challenge_id', id),
    ])
    // THE SAVED RESULTS ARE READ AGAIN (21 Sep 2026), and they are the ranking.
    // They were dropped because they only changed when somebody pressed
    // "Generate" - no longer true: every view save, the hourly sync and every
    // points change rebuild them. Ranking here in the browser by each creator's
    // best single video was right for one scoring mode of three, and for the
    // Global Challenge (points) it previewed - and put in the shared picture -
    // a podium nobody had actually won. `rebuild_challenge_results` is the
    // one piece of code that decides who is first, ties included.
    const [{ data: start }, { data: dqs }] = await Promise.all([
      supabase.rpc('challenge_starts_at', { p_challenge: id }),
      supabase.from('submission_disqualifications')
        .select('id, creator_id, snapshot, reason, disqualified_at, profiles:creator_id(name, photo_url)')
        .eq('challenge_id', id).order('disqualified_at', { ascending: false }),
    ])
    setStartsAt(start ? new Date(start) : null)
    setDisqualified(dqs ?? [])
    setChallenge(ch)
    setSubmissions(subs ?? [])
    setResults(res ?? [])
    setResultsCount((res ?? []).length)
    setLoading(false)
  }, [id])
  const reloadResults = useCallback(async () => {
    const { data } = await supabase.from('results').select('creator_id, final_views, total_views, rank, group_id').eq('challenge_id', id)
    setResults(data ?? [])
    setResultsCount((data ?? []).length)
  }, [id])

  useEffect(() => { load() }, [load])

  function flash(msg) {
    setToast(msg)
    setTimeout(() => setToast(''), 3500)
  }

  // The bonus rules this challenge defines, and which entries already have one.
  const [bonusRules, setBonusRules] = useState([])
  const [awarded, setAwarded] = useState(new Set())
  // What the CREATORS claimed for themselves. A separate set from `awarded`
  // because the two are different facts: an admin's award is a decision, a
  // creator's claim is an answer to a question, and the page has to be able to
  // show which is which. See migration 155.
  const [claims, setClaims] = useState([])
  const [claimRules, setClaimRules] = useState([])
  const [groups, setGroups] = useState([])
  const [groupMembers, setGroupMembers] = useState([])
  // Bumped whenever something that moves the participation standings changes.
  const [standingsKey, setStandingsKey] = useState(0)
  const standings = usePrizeStandings(id, `${standingsKey}:${submissions.length}:${resultsCount}`)

  const loadBonuses = useCallback(async () => {
    const [{ data: rules }, { data: given }, { data: claimed }, { data: gs }, { data: gms }] = await Promise.all([
      supabase.from('point_rules').select('id, label, points, prompt, min_views, max_points')
        .eq('challenge_id', id).eq('kind', 'bonus').eq('is_active', true).order('position'),
      supabase.from('point_awards').select('submission_id, rule_id')
        .eq('challenge_id', id).eq('is_auto', false),
      supabase.from('submission_bonus_claims').select('submission_id, rule_id').eq('challenge_id', id),
      supabase.from('challenge_groups').select('*').eq('challenge_id', id).order('position'),
      supabase.from('challenge_group_members').select('group_id, creator_id').eq('challenge_id', id),
    ])
    // A bonus the ADMIN gives has no prompt; one the CREATOR claims does. The
    // two lists never overlap, so the row below can offer the right control for
    // each without asking which kind it is twice.
    setBonusRules((rules ?? []).filter((r) => !r.prompt))
    setClaimRules((rules ?? []).filter((r) => r.prompt))
    // AN ADMIN'S BONUS IS A CLAIM NOW (migration 233), made for the creator,
    // so the view gate and the cap hold whoever gave it. Legacy hand-given
    // rows still count as given.
    const unasked = new Set((rules ?? []).filter((r) => !r.prompt).map((r) => r.id))
    setAwarded(new Set([
      ...(given ?? []).filter((a) => a.submission_id).map((a) => `${a.submission_id}:${a.rule_id}`),
      ...(claimed ?? []).filter((c) => unasked.has(c.rule_id)).map((c) => `${c.submission_id}:${c.rule_id}`),
    ]))
    setClaims(claimed ?? [])
    setGroups(gs ?? [])
    setGroupMembers(gms ?? [])
  }, [id])
  useEffect(() => { loadBonuses() }, [loadBonuses])

  // WITHDRAWING A CLAIM, AND PUTTING IT BACK.
  //
  // Deleting the claim row is all it takes: the points are DERIVED from the
  // claim by `recalc_challenge_points_internal`, so there is no award to chase
  // and no way for the two to disagree. Re-ticking writes the row back with the
  // creator's own id, not the admin's - it is still their answer, an admin has
  // only agreed with it.
  async function toggleClaim(sub, rule, claimed) {
    setClaims((cur) => (claimed
      ? cur.filter((c) => !(c.submission_id === sub.id && c.rule_id === rule.id))
      : [...cur, { submission_id: sub.id, rule_id: rule.id }]))
    const { error } = claimed
      ? await supabase.from('submission_bonus_claims').delete()
        .eq('submission_id', sub.id).eq('rule_id', rule.id)
      : await supabase.from('submission_bonus_claims').insert({
        submission_id: sub.id, rule_id: rule.id, creator_id: sub.creator_id, challenge_id: id,
      })
    if (error) { flash(error.message); loadBonuses() }
    else reloadResults()
  }

  async function toggleBonus(sub, rule, given) {
    // Optimistic: the standings recalculate server-side and the button has to
    // answer immediately or it reads as having done nothing.
    setAwarded((prev) => {
      const next = new Set(prev)
      const key = `${sub.id}:${rule.id}`
      if (given) next.delete(key); else next.add(key)
      return next
    })
    const { error } = await supabase.rpc(given ? 'withdraw_bonus' : 'award_bonus', {
      p_submission: sub.id, p_rule: rule.id,
    })
    if (error) { flash(error.message) } else reloadResults()
    loadBonuses()
    setStandingsKey((k) => k + 1)
  }

  // Save one submission's logged views (on blur or Enter).
  async function saveViews(submission, raw) {
    const views = raw === '' ? null : parseInt(raw, 10)
    if (raw !== '' && (isNaN(views) || views < 0)) return
    if (views === submission.logged_views) return
    setSavingId(submission.id)
    await supabase
      .from('submissions')
      .update({ logged_views: views, views_source: 'manual', views_sync_error: null })
      .eq('id', submission.id)
    setSubmissions((prev) =>
      prev.map((s) => (s.id === submission.id ? { ...s, logged_views: views, views_source: 'manual', views_sync_error: null } : s)),
    )
    // The saved leaderboard follows the entries, always. Typing a number used
    // to change the preview on this page and leave the board creators actually
    // see untouched until somebody remembered to press Generate.
    await supabase.rpc('rebuild_challenge_results', { p_challenge: id })
    await reloadResults()
    setSavingId(null)
  }

  const isEarly = (sub) => !!(startsAt && sub.posted_at && new Date(sub.posted_at) < startsAt)
  const earlyCount = submissions.filter(isEarly).length

  async function confirmDisqualify() {
    if (!dq?.reason?.trim()) return
    setDq((d) => ({ ...d, busy: true }))
    const { error } = await supabase.rpc('disqualify_submission', {
      p_submission: dq.sub.id, p_reason: dq.reason.trim(), p_notify: dq.notify,
    })
    if (error) { setDq((d) => ({ ...d, busy: false })); flash(`Could not disqualify: ${error.message}`); return }
    setDq(null)
    flash(`${dq.sub.profiles?.name?.split(' ')[0] || 'That'} entry is disqualified and off the board.`)
    await load()
    loadBonuses()
    setStandingsKey((k) => k + 1)
  }

  async function reinstate(row) {
    if (!await confirm(`Put ${row.profiles?.name || 'this creator'}'s entry back into the challenge? It rejoins the board with the views it had.`)) return
    const { error } = await supabase.rpc('reinstate_submission', { p_submission: row.id })
    if (error) { flash(`Could not reinstate: ${error.message}`); return }
    flash('Entry reinstated.')
    await load()
    loadBonuses()
    setStandingsKey((k) => k + 1)
  }

  // Drop a leaderboard-update card into the announcements room this challenge
  // belongs to. This used to write `channel: 'announcements'` flat, which is the
  // LEGACY UK room - so a Spanish challenge's standings were posted to 43 UK
  // creators and to nobody in Spain. A global challenge (no community) goes to
  // the worldwide room, which is exactly what an empty market list means.

  // PUBLISHING THE WINNERS IS A SEPARATE, DELIBERATE ACT.
  //
  // Logging views writes `results`, and the challenge board used to read that
  // table directly - so the moment the archive cron flipped a challenge to
  // 'archived', an interim mid-challenge leaderboard was painted onto the board
  // as a finished podium. Nothing appears publicly until this button is pressed.
  async function togglePublished() {
    const already = !!challenge?.winners_published_at
    if (!already && resultsCount === 0) return flash('Log the final views and build the leaderboard first.')
    if (!already && !ended) return flash('The final leaderboard can be published once the challenge has ended.')
    if (!already && !await confirm(`Publish the final leaderboard and winners for "${challenge.title}"? Every creator in this market will see it on the challenge board.`)) return
    if (already && !await confirm('Hide the winners podium again? It disappears from the challenge board until you publish it once more.')) return

    setPublishing(true)
    const stamp = already ? null : new Date().toISOString()
    const patch = { winners_published_at: stamp }
    // Publishing the winners is also the moment the standings stop being a
    // snapshot, so the label on the public page catches up in the same write.
    if (!already) patch.results_status = 'final'
    const { error } = await supabase.from('challenges').update(patch).eq('id', id)
    setPublishing(false)
    if (error) return flash(`Couldn't update: ${error.message}`)
    setChallenge((c) => ({ ...c, ...patch }))
    flash(already ? 'Winners hidden again.' : 'Winners published. They are on the challenge board now - share them next.')
  }

  // AWARDING IS AUTOMATIC ON PUBLISH (the trigger on `winners_published_at`),
  // so this button is the manual re-run for the rare case something needs
  // redoing - it is idempotent, never pays anyone twice. What actually got
  // paid, and any invoice stuck on missing bank details, lives on Rewards &
  // Payouts now rather than a second copy of it here.
  async function awardPrizesNow() {
    setAwarding(true)
    const { data, error } = await supabase.rpc('award_challenge_prizes', { p_challenge_id: id, p_dry_run: false })
    setAwarding(false)
    if (error) return flash(`Could not award the prizes: ${error.message}`)
    const made = (data ?? []).filter((r) => r.outcome === 'created').length
    flash(made ? `${made} ${made === 1 ? 'prize' : 'prizes'} awarded. Check Rewards & Payouts.` : 'Everything was already awarded.')
  }

  // The podium exactly as creators will see it, drawn from the rows already
  // saved. Same component as the public board, so the preview cannot drift.
  const places = Math.max(1, challenge?.winners_count || (Array.isArray(challenge?.prize_structure) ? challenge.prize_structure.length : 0) || 3)
  const subCountByCreator = submissions.reduce((acc, sub) => {
    acc[sub.creator_id] = (acc[sub.creator_id] || 0) + 1
    return acc
  }, {})
  // WHO CLEARED THE TAKING-PART BAR, in the challenge's own basis (migration
  // 241): a video count, or on a points challenge that says so, the points
  // total on the saved board.
  const pointsByCreator = Object.fromEntries(results.map((r) => [r.creator_id, Number(r.final_views) || 0]))
  const partByPoints = challenge?.participation_basis === 'points' && challenge?.scoring === 'points'
  const cleared = (creatorId, threshold) => (partByPoints
    ? (pointsByCreator[creatorId] || 0) >= threshold
    : (subCountByCreator[creatorId] || 0) >= threshold)
  const bestByCreator = submissions.reduce((acc, sub) => {
    const cur = acc[sub.creator_id]
    if (!cur || (sub.logged_views ?? 0) > (cur.logged_views ?? 0)) acc[sub.creator_id] = sub
    return acc
  }, {})
  // THE PREVIEW IS THE SAVED BOARD (see `load`), falling back to ranking the
  // entries by their best video only before any board exists at all.
  // ONE PODIUM PER BOARD.
  //
  // A challenge with groups has more than one leaderboard, so it has more than
  // one set of winners - and the preview an admin publishes from has to show
  // all of them, or they publish a podium for Group A and never see Group B's.
  // A challenge with no groups produces exactly one board keyed on `null`,
  // which is the ranking this page has always drawn.
  const byCreator = groupByCreator(groupMembers)
  const boards = boardsFor(groups, byCreator, submissions)
  // From the saved board when there is one: `groupId` undefined is the whole
  // challenge, otherwise one group's board.
  const fromResults = (groupId) => results
    .filter((r) => groupId === undefined || (r.group_id ?? null) === groupId)
    .sort((a, b) => a.rank - b.rank)
    .map((r, i) => {
      const best = bestByCreator[r.creator_id]
      return {
        creator_id: r.creator_id,
        profiles: best?.profiles ?? { id: r.creator_id, name: 'Creator' },
        final_views: r.final_views ?? 0,
        total_views: r.total_views ?? 0,
        videoUrl: best?.video_url ?? null,
        platform: best?.platform ?? null,
        rank: i + 1,
      }
    })
  const rankIn = (rows, groupId) => (results.length > 0 ? fromResults(groupId) : rows
    .filter((sub) => sub.logged_views != null)
    .map((sub) => ({
      creator_id: sub.creator_id,
      profiles: sub.profiles,
      final_views: sub.logged_views ?? 0,
      videoUrl: sub.video_url ?? null,
      platform: sub.platform ?? null,
    }))
    .sort((a, b) => b.final_views - a.final_views)
    .map((r, i) => ({ ...r, rank: i + 1 })))

  const allBest = Object.values(bestByCreator)
  const liveRanking = rankIn(allBest)
  const outsidePrizes = challenge?.participation_scope === 'outside_prizes'
  const placed = new Set(liveRanking.slice(0, places).map((r) => r.creator_id))
  // WHO HAS EARNED THE TAKING-PART VOUCHER comes from the SERVER'S standings
  // (`challenge_prize_standings`), which know the scope. This used to be
  // counted here from entries, so on a challenge whose voucher is "outside the
  // prize places" the leader (7 entries, 23 points, 1st) was drawn as having
  // won the EUR 10 voucher on this page while the payout and the public board
  // correctly said nobody had (22 Sep 2026). Only with no standings at all
  // (an old challenge) does it fall back to counting, and then it still
  // honours the scope.
  const voucherWinners = standings && standings.some((r) => r.slot === 'participation')
    ? standings.filter((r) => r.slot === 'participation' && r.status === 'earned')
      .map((r) => ({ id: r.creator_id, name: r.creator_name, photo_url: r.photo_url }))
    : challenge?.participation_threshold
    ? submissions
        .filter((sub) => cleared(sub.creator_id, challenge.participation_threshold))
        .filter((sub) => !outsidePrizes || !placed.has(sub.creator_id))
        .map((sub) => sub.profiles)
        .filter((prof, i, arr) => prof && arr.findIndex((o) => o?.id === prof.id) === i)
    : []

  // [{ group, ranking, winners }] - one entry, or one per group.
  const podiums = boards.length > 0
    ? boards.map((g) => {
      const mine = allBest.filter((sub) => (byCreator.get(sub.creator_id) ?? null) === g.id)
      const ranking = rankIn(mine, g.id)
      const prize = prizeForGroup(g, challenge)
      const seats = Math.max(1, prize.winners_count || places)
      // THE FIGURES UNDER A GROUP'S PODIUM ARE THAT GROUP'S.
      // They were the challenge's - so both podiums read "4 entries, 22.9k
      // views", which is the total of the two boards printed under each of
      // them. A number under a podium is about the contest that podium
      // decided; the combined figure lives on the analytics page, where it is
      // labelled as combined.
      const groupSubs = submissions.filter((sub) => (byCreator.get(sub.creator_id) ?? null) === g.id)
      return {
        group: g,
        ranking,
        winners: ranking.slice(0, seats),
        entries: groupSubs.length,
        views: groupSubs.reduce((sum, sub) => sum + (sub.logged_views ?? 0), 0),
        // A GROUP'S OWN PRIZE AND ITS OWN VOUCHER, both through the same
        // fall-through the payout applies in SQL (`prizeForGroup`). The shared
        // picture reads these, so a board's picture can no longer promise the
        // other board's money.
        prizes: Array.isArray(prize.prize_structure) ? prize.prize_structure : [],
        voucherPrize: prize.participation_prize || '',
        voucherWinners: prize.participation_threshold
          ? groupSubs
            .filter((sub) => cleared(sub.creator_id, prize.participation_threshold))
            .filter((sub) => !outsidePrizes || !ranking.slice(0, seats).some((w) => w.creator_id === sub.creator_id))
            .map((sub) => sub.profiles)
            .filter((prof, i, arr) => prof && arr.findIndex((o) => o?.id === prof.id) === i)
          : [],
      }
    })
    : [{
      group: null,
      ranking: liveRanking,
      winners: liveRanking.slice(0, places),
      entries: submissions.length,
      views: submissions.reduce((sum, sub) => sum + (sub.logged_views ?? 0), 0),
      prizes: Array.isArray(challenge?.prize_structure) ? challenge.prize_structure : [],
      voucherPrize: challenge?.participation_prize || '',
      voucherWinners,
    }]

  const podiumWinners = liveRanking.slice(0, places)
  // Which platforms each creator actually submitted on, so the shared board
  // carries the same icons the public one does.
  const platformsByCreator = submissions.reduce((acc, sub) => {
    (acc[sub.creator_id] ||= new Set()).add(sub.platform)
    return acc
  }, {})
  const platformsFor = (creatorId) =>
    PLATFORM_ORDER.filter((p) => platformsByCreator[creatorId]?.has(p))
  if (loading) {
    return <div className="page space-y-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-96 w-full" /></div>
  }

  return (
    <div className="page max-w-4xl">
      <PageHeader
        back={{ to: `/challenges/${id}`, label: 'Challenge' }}
        title={`Results: ${challenge?.title}`}
        subtitle={
          isLive
            ? 'View counts are read off each entry automatically. Check anything flagged below and correct it.'
            : 'View counts are read off each entry automatically. Check anything flagged below and correct it.'
        }
        action={
          /* NO "PUBLISH THE LEADERBOARD" BUTTON (22 Sep 2026). Ethan: the board
             should update for creators every time views are synced, so there
             is nothing to publish. `rebuild_challenge_results` runs on every
             sync and every edit here and stamps `results_updated_at`; the
             creator page reads `results` directly. The "leaderboard live (8)
             view" link went with it - the board is on this page. */
          resultsCount > 0 ? (
            <button onClick={() => setSharing(true)} className="btn-secondary inline-flex items-center gap-2 !py-2 text-sm">
              <Icon name="share" className="h-4 w-4" />
              Share the result
            </button>
          ) : null
        }
      />

      {toast && <p className="mb-6 rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700 animate-fade-up">{toast}</p>}

      {/* THE CLOSE-ENTRIES CARD IS GONE (22 Sep 2026). Ethan: "I would remove
          the close entries button and card from here, it's not needed." Closing
          a challenge stays behind the "..." on the challenge itself. */}
      {/* THE PODIUM, BEFORE ANYBODY ELSE SEES IT.
          Publishing winners was previously invisible until it was already
          public: you logged views, a cron archived the challenge, and a podium
          you had never laid eyes on appeared on 43 people's challenge board.
          Now it is drawn here first, in the same component the board uses, and
          it goes out only when you say so. */}
      {(podiumWinners.length > 0 || isLive) && (
        <div className="mb-8 rounded-card border border-gray-100 p-5 shadow-card sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">
                {challenge?.winners_published_at
                  ? 'Final leaderboard published'
                  : ended ? 'Final leaderboard not published yet' : 'Live leaderboard'}
              </p>
              <p className="mt-0.5 text-xs text-smoke">
                {challenge?.winners_published_at
                  ? `Creators can see the winners. Published ${timeAgo(challenge.winners_published_at)}.`
                  : ended
                    ? 'The challenge has ended. Check it reads correctly, then publish the final leaderboard.'
                    : `Creators see this board update by itself after every view sync. Publishing the final leaderboard opens once the challenge ends${challenge?.end_date ? ` (${formatDateTimeTz(challenge.end_date)})` : ''}.`}
              </p>
            </div>
            {(ended || challenge?.winners_published_at) && (
              <div className="flex flex-wrap items-center gap-2">
                {resultsCount > 0 && (
                  <button onClick={awardPrizesNow} disabled={awarding} className="btn-secondary !py-2 text-xs">
                    {awarding ? <Spinner /> : 'Award prizes now'}
                  </button>
                )}
                <button
                  onClick={togglePublished}
                  disabled={publishing}
                  className={challenge?.winners_published_at ? 'btn-secondary !py-2 text-xs' : 'btn-primary !py-2 text-xs'}
                >
                  {publishing ? <Spinner /> : challenge?.winners_published_at ? 'Unpublish' : 'Publish final leaderboard'}
                </button>
              </div>
            )}
          </div>
          {/* THE SHARE DIALOG TAKES THE BOARDS, NOT ONE FLAT RANKING. A split
              challenge produces one entry per group here, each carrying its own
              prizes and its own voucher, so the admin picks which board they
              are publishing rather than sending a picture of a contest nobody
              competed in. */}
          <ShareLeaderboard
            open={sharing}
            onClose={() => setSharing(false)}
            challenge={challenge}
            boards={podiums}
            subCountByCreator={subCountByCreator}
            platformsFor={platformsFor}
            onDone={flash}
          />
          {/* ONE PODIUM PER BOARD, EACH LABELLED. On a challenge with no
              groups this is exactly the single podium that has always been
              here - `podiums` holds one entry with a null group. */}
          {podiums.map(({ group, winners, entries, views, prizes }) => (
            (winners.length > 0 || isLive) && (
              <div key={group?.id ?? 'all'} className={group ? 'mt-5 first:mt-0' : undefined}>
                {group && (
                  <p className="mb-2 flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-brand">
                    {group.name}
                    <span className="text-xs font-normal text-smoke">
                      {prizeForGroup(group, challenge).prize_amount != null
                        ? `playing for ${formatMoney(prizeForGroup(group, challenge).prize_amount, prizeForGroup(group, challenge).prize_currency)}`
                        : 'playing for the challenge prize'}
                    </span>
                  </p>
                )}
                <WinnersPodium
                  winners={winners}
                  entries={entries}
                  totalScore={views}
                  scoring={challenge?.scoring}
                  voucherWinners={group ? [] : voucherWinners}
                  voucherPrize={challenge?.participation_prize}
                  places={group ? Math.max(1, prizeForGroup(group, challenge).winners_count || places) : places}
                  prizes={prizes}
                />
              </div>
            )
          ))}
          {/* THE PARTICIPATION AWARD, BOLTED ON RATHER THAN ITS OWN CARD
              (23 Sep 2026). Ethan: "the participation award should be more
              compact and bolted on to the leaderboard card above rather than
              take up so much space." One summary line + a face cluster,
              expandable for the full per-person detail. Who actually got PAID
              lives on Rewards & Payouts, not here - see the link below. */}
          <PrizeStandingsPanel challenge={challenge} refreshKey={`${standingsKey}:${submissions.length}:${resultsCount}`} compact />
          {resultsCount > 0 && (
            <p className="mt-4 border-t border-gray-100 pt-3 text-xs text-smoke">
              <Link to="/admin/rewards" className="font-medium text-brand hover:underline">
                See who&apos;s been paid on Rewards &amp; Payouts →
              </Link>
            </p>
          )}
        </div>
      )}

      {submissions.length > 0 ? (
        <ViewSyncPanel challengeId={id} submissions={submissions} onSynced={load} />
      ) : null}

      {submissions.length === 0 ? (
        <EmptyState icon={<Icon name="video" className="h-7 w-7" />} title="No submissions to review" hint="Entries will appear here as creators submit their links." />
      ) : (
        <>
        {/* THE OLD-VIDEO CHECK, SAID ONCE ABOVE THE LIST. */}
        {startsAt && (
          <div className={cx(
            'mb-4 flex flex-wrap items-center gap-3 rounded-card border px-4 py-3 sm:px-5',
            earlyCount ? 'border-red-200 bg-red-50/70' : 'border-green-200 bg-green-50/60',
          )}>
            <Icon name={earlyCount ? 'alert' : 'check'} className={cx('h-5 w-5 shrink-0', earlyCount ? 'text-red-600' : 'text-green-700')} />
            <p className={cx('min-w-0 flex-1 text-sm', earlyCount ? 'text-red-900' : 'text-green-900')}>
              {earlyCount
                ? <><span className="font-semibold">{earlyCount} {earlyCount === 1 ? 'entry was' : 'entries were'} posted before the challenge opened</span> ({formatDateTimeTz(startsAt)}). Check and disqualify.</>
                : <>No entry was posted before the challenge opened ({formatDateTimeTz(startsAt)}).</>}
              <span className="block text-xs opacity-75">
                Read from each video&apos;s own id on TikTok and Instagram, and from YouTube. {submissions.filter((x) => !x.posted_at).length} not dated yet (short links date on their next sync).
              </span>
            </p>
            {earlyCount > 0 && (
              <button
                type="button"
                onClick={() => setOnlyEarly((v) => !v)}
                className={cx('rounded-full border px-3 py-1.5 text-xs font-semibold', pickClass(onlyEarly))}
              >
                {onlyEarly ? 'Show all entries' : `Show only these ${earlyCount}`}
              </button>
            )}
          </div>
        )}
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold">Entries ({submissions.length})</h2>
          <Select
            value={viewSort}
            onChange={setViewSort}
            variant="field"
            className="w-[11.5rem] shrink-0"
            ariaLabel="Order entries by"
            options={[
              { value: 'submitted', label: 'Submission order' },
              { value: 'views', label: 'Highest views' },
            ]}
          />
        </div>
        {/* `divide-y` ON THE CONTAINER, NOT `border-b ... last:border-0` ON THE
            ROW. Reveal wraps every child in its own `.reveal-item` div, which
            makes each row the last (and only) child of ITS OWN wrapper - a
            `last:` selector on the row itself would then match every row.
            `divide-y` targets direct children instead, so it still divides
            correctly around the wrappers Reveal adds. */}
        <Reveal as="div" className="divide-y divide-gray-50 overflow-hidden rounded-card border border-gray-100 shadow-card" stagger={0.03} maxStagger={10}>
          {submissions
            .filter((x) => !onlyEarly || isEarly(x))
            .slice()
            .sort((a, b) => (viewSort === 'views' ? (b.logged_views ?? -1) - (a.logged_views ?? -1) : 0))
            .map((s) => (
            <div
              key={s.id}
              className={cx(
                'flex flex-wrap items-center gap-4 px-5 py-4 sm:px-7',
                isEarly(s) && 'border-l-4 border-l-red-400 bg-red-50/50',
              )}
            >
              {/* CLICKING THE FACE OR THE NAME OPENS THEIR PROFILE (23 Sep
                  2026), matching the pattern the rest of the app uses. */}
              <Link to={`/profile/${s.creator_id}`} className="shrink-0">
                <Avatar src={s.profiles?.photo_url} name={s.profiles?.name} size="sm" />
              </Link>
              <div className="min-w-0 flex-1">
                <p className="flex min-w-0 items-center gap-2 text-sm font-semibold">
                  <Link to={`/profile/${s.creator_id}`} className="truncate hover:text-brand">{s.profiles?.name}</Link>
                  {isEarly(s) && (
                    <span className="shrink-0 rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                      Posted before start
                    </span>
                  )}
                </p>
                <p className="text-xs text-smoke">
                  {/* WHICH BOARD THIS ENTRY IS ON. Without it an admin reading
                      a list of forty entries cannot tell which leaderboard a
                      view count is going to move. */}
                  {groups.length > 0 && (
                    <span className="font-semibold text-brand">
                      {groups.find((g) => g.id === byCreator.get(s.creator_id))?.name || 'Not in a group'}
                      {' · '}
                    </span>
                  )}
                  {s.platform} · entered {formatDateTimeTz(s.submitted_at)}
                  {s.posted_at && (
                    <span className={isEarly(s) ? 'font-semibold text-red-700' : undefined}>
                      {' '}· posted {formatDateTimeTz(s.posted_at)}
                    </span>
                  )}
                  {s.views_sync_error ? (
                    <span className="text-brand" title={describeSyncError(s.views_sync_error)?.hint}>
                      {' '}· {describeSyncError(s.views_sync_error)?.label}
                    </span>
                  ) : null}
                </p>
              </div>
              <a href={s.video_url} target="_blank" rel="noopener noreferrer" className="btn-secondary !py-2 text-xs">
                Watch ↗
              </a>
              <button
                type="button"
                onClick={() => setDq({
                  sub: s,
                  reason: isEarly(s) ? 'This video was posted before the challenge opened, so it cannot be entered.' : '',
                  notify: true,
                  busy: false,
                })}
                className={cx('!py-2 text-xs', isEarly(s) ? 'btn-danger' : 'btn-secondary')}
                title="Take this entry out of the challenge"
              >
                Disqualify
              </button>
              <ViewCountField
                submission={s}
                saving={savingId === s.id}
                onSave={(raw) => saveViews(s, raw)}
              />

              {/* BONUS POINTS ARE GIVEN HERE, to this entry, by a person.
                  A bonus rule says what it is called and what it is worth; it
                  cannot say who earned it, because "this one was genuinely
                  brilliant" is a judgement. The button only exists on a points
                  challenge that HAS a bonus rule, so it is never a control
                  looking for a purpose. */}
              {/* WHAT THE CREATOR CLAIMED, AND THE WAY TO TAKE IT BACK.
                  Ethan: "it should show +1 point or plus x points on the entry
                  card, because then the admin can easily check and ensure that
                  it's correct and no one is cheating."
                  This is the checking surface. The claim sits beside the link
                  to the video, so verifying is watching ten seconds of it
                  rather than cross-referencing a spreadsheet - and if it does
                  not qualify, pressing the chip withdraws it and the points
                  come straight back off the leaderboard. A claim looks
                  different from an admin's own award below on purpose: green
                  and ticked is somebody's answer, orange is your decision. */}
              {claimRules.length > 0 && (
                <div className="flex w-full flex-wrap gap-1.5 pl-[52px] sm:w-auto sm:pl-0">
                  {claimRules.map((r) => {
                    const claimed = claims.some((c) => c.submission_id === s.id && c.rule_id === r.id)
                    // A GATED BONUS THAT HAS NOT PAID YET IS NOT THE SAME AS ONE
                    // THAT HAS (migration 181). This is the page an admin reads
                    // to answer "were the bonus points applied correctly", and a
                    // claim waiting on a view count drawn in the same green as a
                    // paid one answers that question wrongly - the leaderboard
                    // would not match what this screen appears to say.
                    const waiting = claimed && r.min_views > 0 && (s.logged_views ?? 0) < r.min_views
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleClaim(s, r, claimed)}
                        aria-pressed={claimed}
                        title={
                          waiting
                            ? `${r.prompt} - claimed, but this entry is on ${formatViews(s.logged_views ?? 0)} and the bonus is awarded at ${Number(r.min_views).toLocaleString()}. It lands by itself. Press to withdraw the claim.`
                            : claimed
                              ? `${r.prompt} - the creator said yes. Press to withdraw it.`
                              : `${r.prompt} - not claimed`
                        }
                        className={cx(
                          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all duration-200',
                          waiting
                            ? 'border-amber-200 bg-amber-50 text-amber-700 hover:border-red-300 hover:text-red-600'
                            : claimed
                              ? 'border-green-200 bg-green-50 text-green-700 hover:border-red-300 hover:text-red-600'
                              : 'border-dashed border-gray-200 text-gray-400',
                        )}
                      >
                        <Icon name={waiting ? 'clock' : claimed ? 'check' : 'close'} className="h-3 w-3" />
                        +{r.points} · {r.label}
                        {waiting && ` · at ${Number(r.min_views).toLocaleString()}`}
                      </button>
                    )
                  })}
                </div>
              )}

              {bonusRules.length > 0 && (
                <div className="flex w-full flex-wrap gap-1.5 pl-[52px] sm:w-auto sm:pl-0">
                  {bonusRules.map((r) => {
                    const given = awarded.has(`${s.id}:${r.id}`)
                    const waiting = given && r.min_views > 0 && (s.logged_views ?? 0) < r.min_views
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleBonus(s, r, given)}
                        aria-pressed={given}
                        title={waiting
                          ? `Awarded, but it counts once this entry passes ${Number(r.min_views).toLocaleString()} views. Press to take it back.`
                          : given ? `Take back ${r.label}` : `Award ${r.label}${r.min_views > 0 ? ` (counts once the entry passes ${Number(r.min_views).toLocaleString()} views)` : ''}`}
                        className={cx(
                          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all duration-200',
                          waiting
                            ? 'border-amber-200 bg-amber-50 text-amber-700'
                            : given
                              ? 'border-brand bg-brand text-white'
                              : 'border-gray-200 text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand',
                        )}
                      >
                        <Icon name={waiting ? 'clock' : given ? 'check' : 'plus'} className="h-3 w-3" />
                        {r.points} pt{r.points === 1 ? '' : 's'} · {r.label}
                        {waiting && ` · at ${Number(r.min_views).toLocaleString()}`}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </Reveal>
        </>
      )}

      {/* DISQUALIFIED, AND THE WAY BACK. */}
      {disqualified.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-base font-semibold">Disqualified ({disqualified.length})</h2>
          <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
            {disqualified.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-3 border-b border-gray-50 px-5 py-3 last:border-0 sm:px-7">
                <Avatar src={d.profiles?.photo_url} name={d.profiles?.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{d.profiles?.name}</p>
                  <p className="text-xs text-smoke">
                    {d.snapshot?.platform} · {Number(d.snapshot?.logged_views || 0).toLocaleString()} views · removed {timeAgo(d.disqualified_at)}
                  </p>
                  <p className="mt-0.5 text-xs text-ink/80">{d.reason}</p>
                </div>
                {d.snapshot?.video_url && (
                  <a href={d.snapshot.video_url} target="_blank" rel="noopener noreferrer" className="btn-secondary !py-2 text-xs">Watch ↗</a>
                )}
                <button type="button" onClick={() => reinstate(d)} className="btn-secondary !py-2 text-xs">Reinstate</button>
              </div>
            ))}
          </div>
        </section>
      )}

      <Modal open={!!dq} onClose={() => !dq?.busy && setDq(null)} title="Disqualify this entry">
        {dq && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 rounded-xl bg-cloud/60 p-3">
              <Avatar src={dq.sub.profiles?.photo_url} name={dq.sub.profiles?.name} size="sm" />
              <div className="min-w-0 text-sm">
                <p className="truncate font-semibold">{dq.sub.profiles?.name}</p>
                <p className="text-xs text-smoke">
                  {dq.sub.platform} · {Number(dq.sub.logged_views || 0).toLocaleString()} views
                  {dq.sub.posted_at && ` · posted ${formatDateTimeTz(dq.sub.posted_at)}`}
                </p>
              </div>
            </div>
            <p className="text-sm text-smoke">
              The entry comes off the board and its points and views stop counting. It is kept, with your reason,
              under Disqualified, and you can reinstate it.
            </p>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-smoke">Reason</span>
              <textarea
                className="input min-h-[5rem] no-ios-zoom"
                value={dq.reason}
                onChange={(e) => setDq((d) => ({ ...d, reason: e.target.value }))}
                placeholder="Why it does not count"
              />
            </label>
            {/* A SWITCH IN THE BRAND, NOT THE BROWSER'S BLUE TICK BOX (22 Sep 2026). */}
            <div className="flex items-center justify-between gap-3 rounded-xl border border-gray-100 bg-white px-3.5 py-3">
              <span className="min-w-0 text-sm">
                <span className="block font-semibold text-ink">Tell the creator</span>
                <span className="block text-xs text-smoke">They get a notification with this reason.</span>
              </span>
              <Toggle on={dq.notify} onChange={(v) => setDq((d) => ({ ...d, notify: v }))} label="Tell the creator" />
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn-secondary !py-2 text-sm" onClick={() => setDq(null)} disabled={dq.busy}>Cancel</button>
              <button type="button" className="btn-danger !py-2 text-sm" onClick={confirmDisqualify} disabled={dq.busy || !dq.reason.trim()}>
                {dq.busy ? <Spinner className="h-4 w-4" /> : 'Disqualify'}
              </button>
            </div>
          </div>
        )}
      </Modal>

    </div>
  )
}


// ONE BOX, AND IT IS ALWAYS THE CURRENT NUMBER (22 Sep 2026).
//
// Ethan: "it correctly updated the view number on the right side but in the
// text box still showed 787 even though the synced count was 2.3k." The box was
// an UNCONTROLLED input (`defaultValue`), which React reads exactly once, on
// mount - so a sync that moved `logged_views` repainted the label beside it and
// left the box on whatever it first drew. Two readouts of one number, one of
// them stale, is worse than one.
//
// Now there is ONE readout and it is the field: it follows `logged_views`
// whenever you are not typing in it, and a number typed in still wins (it is
// saved as a manual override, exactly as before). Under it, where the number
// came from, in words.
function ViewCountField({ submission: s, saving, onSave }) {
  const [draft, setDraft] = useState(null)
  const [justSaved, setJustSaved] = useState(false)
  const editing = draft !== null
  const shown = editing ? draft : (s.logged_views == null ? '' : Number(s.logged_views).toLocaleString('en-GB'))
  const manual = s.views_source === 'manual'

  async function commit() {
    if (draft === null) return
    const raw = draft.replace(/\D+/g, '')
    setDraft(null)
    if (raw === String(s.logged_views ?? '')) return
    await onSave(raw)
    setJustSaved(true)
    setTimeout(() => setJustSaved(false), 1600)
  }

  return (
    <div
      className="flex w-full flex-col items-stretch pl-[52px] sm:w-40 sm:pl-0"
      title={manual ? 'Typed in by hand. The next sync reads the link again.' : undefined}
    >
      <label className="sr-only" htmlFor={`views-${s.id}`}>Views for {s.profiles?.name}</label>
      <div
        className={cx(
          'group relative flex items-center rounded-xl border bg-white transition-all duration-200',
          editing
            ? 'border-brand ring-4 ring-brand/15'
            : manual
              ? 'border-amber-200 hover:border-amber-300'
              : 'border-gray-200 hover:border-gray-300',
        )}
      >
        <Icon name="eye" className={cx('ml-3 h-4 w-4 shrink-0', editing ? 'text-brand' : 'text-smoke')} />
        <input
          id={`views-${s.id}`}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          placeholder="Not read yet"
          value={shown}
          onFocus={() => setDraft(s.logged_views == null ? '' : String(s.logged_views))}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.currentTarget.blur()
            if (e.key === 'Escape') { setDraft(null); e.currentTarget.blur() }
          }}
          className="no-ios-zoom min-w-0 flex-1 bg-transparent py-2.5 pl-2 pr-3 text-right text-base font-semibold tabular-nums text-ink outline-none placeholder:text-sm placeholder:font-normal placeholder:text-smoke"
        />
        {(saving || justSaved) && (
          <span className="absolute -right-2 -top-2 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white shadow-card">
            {saving ? <Spinner className="h-3 w-3" /> : <Icon name="check" className="h-3 w-3" />}
          </span>
        )}
      </div>
      {/* NO "SYNCED X AGO" LINE UNDER EVERY BOX (22 Sep 2026) - Ethan: it
          takes a lot of space and is not necessary; the sync card above says
          when the last read was. A number typed by hand keeps its amber edge
          and says so on hover. */}
    </div>
  )
}
