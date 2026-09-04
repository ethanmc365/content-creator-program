import { useEffect, useState, useCallback } from 'react'
import { confirm } from '../../lib/confirm'
import { Link, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, EmptyState, PageHeader, Skeleton, Spinner } from '../../components/ui'
import Icon from '../../components/Icon'
import { cx, formatViews, formatMoney, formatDateTimeTz, timeAgo } from '../../lib/utils'
import { describeSyncError } from '../../lib/viewSync'
import WinnersPodium from '../../components/WinnersPodium'
import ViewSyncPanel from '../../components/admin/ViewSyncPanel'
import ShareLeaderboard from '../../components/admin/ShareLeaderboard'
import PrizesPanel from '../../components/admin/PrizesPanel'
import { PLATFORM_ORDER } from '../../components/PlatformBadges'
import { groupByCreator, boardsFor, prizeForGroup } from '../../lib/challengeGroups'

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
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState(null)
  const [generating, setGenerating] = useState(false)
  const [sharing, setSharing] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [lifecycleBusy, setLifecycleBusy] = useState(false)
  const [toast, setToast] = useState('')

  // While the challenge is still running a leaderboard is an INTERIM snapshot;
  // once it has ended (or been archived) it's the FINAL ranking.
  const isLive = challenge?.status === 'active'
  const phase = isLive ? 'interim' : 'final'

  // CLOSING ENTRIES BELONGS HERE (4 Sep 2026).
  //
  // Ethan: "move the close entries button inside the results page."
  //
  // It was behind the "..." on the challenge itself, which is one press away
  // from a slip but is also nowhere near the moment the decision is actually
  // made. A manager decides a challenge is over while looking at the entries
  // and the standings - on THIS page - and then had to navigate back to the
  // challenge to say so. Closing is now a labelled control in the state card
  // below, next to a plain statement of what the challenge currently is.
  //
  // Both places still exist and both call the same update, because a lifecycle
  // that can only be reached from one screen is a lifecycle somebody cannot
  // find. What changed is that the one on the results page is a BUTTON WITH A
  // SENTENCE rather than an item in a menu of three.
  async function setChallengeStatus(status) {
    const verb = { active: 'publish', ended: 'close entries on', archived: 'archive' }[status]
    if (!await confirm(`Really ${verb} "${challenge.title}"?`)) return
    setLifecycleBusy(true)
    const { error } = await supabase.from('challenges').update({ status }).eq('id', id)
    setLifecycleBusy(false)
    if (error) { flash(`Could not update: ${error.message}`); return }
    setChallenge((c) => ({ ...c, status }))
    flash(status === 'ended' ? 'Entries are closed. The board stays visible.' : `Challenge ${status}.`)
  }

  const load = useCallback(async () => {
    const [{ data: ch }, { data: subs }, { count }] = await Promise.all([
      supabase.from('challenges').select('*').eq('id', id).single(),
      supabase
        .from('submissions')
        .select('*, profiles:creator_id(id, name, photo_url)')
        .eq('challenge_id', id)
        .order('submitted_at'),
      supabase.from('results').select('id', { count: 'exact', head: true }).eq('challenge_id', id),
    ])
    // The saved `results` rows are NOT read here any more. The podium preview is
    // built from the entries themselves, so it reflects the view counts on this
    // page rather than whatever was saved the last time somebody pressed
    // "Generate leaderboard". Only the COUNT is still needed, for the "leaderboard
    // live (N)" link.
    setChallenge(ch)
    setSubmissions(subs ?? [])
    setResultsCount(count ?? 0)
    setLoading(false)
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

  const loadBonuses = useCallback(async () => {
    const [{ data: rules }, { data: given }, { data: claimed }, { data: gs }, { data: gms }] = await Promise.all([
      supabase.from('point_rules').select('id, label, points, prompt, min_views')
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
    setAwarded(new Set((given ?? []).filter((a) => a.submission_id).map((a) => `${a.submission_id}:${a.rule_id}`)))
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
    if (error) { flash(error.message); loadBonuses() }
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
    setSavingId(null)
  }

  // Build the final leaderboard from the logged views.
  //
  // THE RANKING IS DONE IN THE DATABASE, by `rebuild_challenge_results`, so that
  // exactly one piece of code decides who is first. This function used to rank
  // on a creator's best single entry no matter what the challenge said, which is
  // right for "Best single video" and wrong for "Total views", where every entry
  // is supposed to add up. It is also what the hourly view sync now calls, so
  // the board cannot drift away from the numbers under it.
  async function generateLeaderboard() {
    const withViews = submissions.filter((s) => s.logged_views != null)
    if (withViews.length === 0) return flash('Log views on at least one submission first.')
    if (!await confirm(`Generate the leaderboard from ${withViews.length} reviewed submissions? This replaces any existing results for this challenge.`)) return

    setGenerating(true)
    const { data: written, error } = await supabase.rpc('rebuild_challenge_results', { p_challenge: id })
    if (error) { setGenerating(false); return flash(`Couldn't save results: ${error.message}`) }
    const ranked = { length: written ?? 0 }

    // Stamp the challenge so the public page can label the standings correctly.
    const updatedAt = new Date().toISOString()
    await supabase.from('challenges').update({ results_status: phase, results_updated_at: updatedAt }).eq('id', id)
    setChallenge((c) => (c ? { ...c, results_status: phase, results_updated_at: updatedAt } : c))
    setGenerating(false)
    setResultsCount(ranked.length)
    flash(
      phase === 'interim'
        ? `Current leaderboard published. ${ranked.length} creators ranked and live on the challenge page. Re-log views and publish again any time; publish once more after the challenge closes for the final result.`
        : `Final results saved. ${ranked.length} creators ranked and now live on the challenge page.`
    )
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
    if (!already && !await confirm(`Publish the winners podium for "${challenge.title}"? Every creator in this market will see it on the challenge board.`)) return
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

  // The podium exactly as creators will see it, drawn from the rows already
  // saved. Same component as the public board, so the preview cannot drift.
  const places = Math.max(1, challenge?.winners_count || (Array.isArray(challenge?.prize_structure) ? challenge.prize_structure.length : 0) || 3)
  const subCountByCreator = submissions.reduce((acc, sub) => {
    acc[sub.creator_id] = (acc[sub.creator_id] || 0) + 1
    return acc
  }, {})
  const bestByCreator = submissions.reduce((acc, sub) => {
    const cur = acc[sub.creator_id]
    if (!cur || (sub.logged_views ?? 0) > (cur.logged_views ?? 0)) acc[sub.creator_id] = sub
    return acc
  }, {})
  // THE PREVIEW IS BUILT FROM THE ENTRIES, NOT FROM THE SAVED RESULTS.
  //
  // It used to read the `results` table, which only changes when somebody
  // presses "Generate leaderboard" - so a sync could refresh every view count on
  // the page and the podium above them would still be showing last week's order
  // and last week's numbers. This is a preview; it should show what the
  // leaderboard WOULD be right now. Generating still writes the saved results,
  // which is what creators see.
  // ONE PODIUM PER BOARD.
  //
  // A challenge with groups has more than one leaderboard, so it has more than
  // one set of winners - and the preview an admin publishes from has to show
  // all of them, or they publish a podium for Group A and never see Group B's.
  // A challenge with no groups produces exactly one board keyed on `null`,
  // which is the ranking this page has always drawn.
  const byCreator = groupByCreator(groupMembers)
  const boards = boardsFor(groups, byCreator, submissions)
  const rankIn = (rows) => rows
    .filter((sub) => sub.logged_views != null)
    .map((sub) => ({
      creator_id: sub.creator_id,
      profiles: sub.profiles,
      final_views: sub.logged_views ?? 0,
      videoUrl: sub.video_url ?? null,
      platform: sub.platform ?? null,
    }))
    .sort((a, b) => b.final_views - a.final_views)
    .map((r, i) => ({ ...r, rank: i + 1 }))

  const allBest = Object.values(bestByCreator)
  const liveRanking = rankIn(allBest)
  // [{ group, ranking, winners }] - one entry, or one per group.
  const podiums = boards.length > 0
    ? boards.map((g) => {
      const mine = allBest.filter((sub) => (byCreator.get(sub.creator_id) ?? null) === g.id)
      const ranking = rankIn(mine)
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
            .filter((sub) => subCountByCreator[sub.creator_id] >= prize.participation_threshold)
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
      voucherWinners: challenge?.participation_threshold
        ? submissions
          .filter((sub) => subCountByCreator[sub.creator_id] >= challenge.participation_threshold)
          .map((sub) => sub.profiles)
          .filter((prof, i, arr) => prof && arr.findIndex((o) => o?.id === prof.id) === i)
        : [],
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
  // EVERYONE who cleared the participation threshold, podium included. Podium
  // creators used to be filtered out, which made a row headed "for everyone
  // here" leave out the three people most obviously here. Placing first does not
  // un-earn the voucher for turning up.
  const voucherWinners = challenge?.participation_threshold
    ? submissions
        .filter((sub) => subCountByCreator[sub.creator_id] >= challenge.participation_threshold)
        .map((sub) => sub.profiles)
        .filter((prof, i, arr) => prof && arr.findIndex((o) => o?.id === prof.id) === i)
    : []

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
          <div className="flex flex-col items-end gap-2">
            <button onClick={generateLeaderboard} disabled={generating} className="btn-primary">
              {generating ? <Spinner /> : isLive ? 'Publish current leaderboard' : 'Publish final results'}
            </button>
            {resultsCount > 0 && (
              <>
                <button onClick={() => setSharing(true)} className="btn-secondary !py-2 text-xs">
                  Share the result
                </button>
                <Link to={`/challenges/${id}`} className="text-xs font-medium text-brand hover:underline">
                  {challenge?.results_status === 'interim' ? 'Current' : 'Final'} leaderboard live ({resultsCount}) → view
                </Link>
              </>
            )}
          </div>
        }
      />

      {toast && <p className="mb-6 rounded-xl bg-green-50 px-4 py-3 text-sm font-medium text-green-700 animate-fade-up">{toast}</p>}

      {/* WHAT THIS CHALLENGE CURRENTLY IS, AND THE ONE PRESS THAT CHANGES IT.
          The state was only ever legible on the challenge page - a Badge in the
          header - so a manager working through the entries here had no way of
          telling whether creators could still add to them. It says so plainly
          now, and the action that follows from it sits next to the sentence
          rather than inside a menu on another screen. */}
      <LifecycleCard
        status={challenge?.status}
        busy={lifecycleBusy}
        onSet={setChallengeStatus}
      />

      {/* THE PODIUM, BEFORE ANYBODY ELSE SEES IT.
          Publishing winners was previously invisible until it was already
          public: you logged views, a cron archived the challenge, and a podium
          you had never laid eyes on appeared on 43 people's challenge board.
          Now it is drawn here first, in the same component the board uses, and
          it goes out only when you say so. */}
      {podiumWinners.length > 0 && (
        <div className="mb-8 rounded-card border border-gray-100 p-5 shadow-card sm:p-6">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-ink">
                {challenge?.winners_published_at ? 'Published to the challenge board' : 'Not published yet'}
              </p>
              <p className="mt-0.5 text-xs text-smoke">
                {challenge?.winners_published_at
                  ? `Creators can see this podium. Published ${timeAgo(challenge.winners_published_at)}.`
                  : 'Only you can see this. Check it reads correctly, then publish it.'}
              </p>
            </div>
            <button
              onClick={togglePublished}
              disabled={publishing}
              className={challenge?.winners_published_at ? 'btn-secondary !py-2 text-xs' : 'btn-primary !py-2 text-xs'}
            >
              {publishing ? <Spinner /> : challenge?.winners_published_at ? 'Unpublish' : 'Publish the winners'}
            </button>
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
          {podiums.map(({ group, winners, entries, views }) => (
            winners.length > 0 && (
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
                />
              </div>
            )
          ))}
        </div>
      )}

      {resultsCount > 0 ? <PrizesPanel challengeId={id} onFlash={flash} /> : null}

      {submissions.length > 0 ? (
        <ViewSyncPanel challengeId={id} submissions={submissions} onSynced={load} />
      ) : null}

      {submissions.length === 0 ? (
        <EmptyState icon={<Icon name="video" className="h-7 w-7" />} title="No submissions to review" hint="Entries will appear here as creators submit their links." />
      ) : (
        <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
          {submissions.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-4 border-b border-gray-50 px-5 py-4 last:border-0 sm:px-7">
              <Avatar src={s.profiles?.photo_url} name={s.profiles?.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{s.profiles?.name}</p>
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
                  {s.platform} · {formatDateTimeTz(s.submitted_at)}
                  {s.views_source !== 'manual' && s.views_synced_at ? (
                    <span className="text-green-700"> · read {timeAgo(s.views_synced_at)}</span>
                  ) : null}
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
              <div className="flex items-center gap-2">
                <label className="sr-only" htmlFor={`views-${s.id}`}>Logged views for {s.profiles?.name}</label>
                {/* Plain text + inputMode numeric rather than type="number": the
                    view count is always typed in full, so the stepper arrows were
                    only clutter (and one stray scroll could change a saved figure).
                    Non-digits are stripped as you type; mobile still gets a number pad. */}
                <input
                  id={`views-${s.id}`}
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  className="input !w-32 text-right tabular-nums"
                  placeholder="views"
                  defaultValue={s.logged_views ?? ''}
                  onInput={(e) => { e.target.value = e.target.value.replace(/\D+/g, '') }}
                  onBlur={(e) => saveViews(s, e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && e.target.blur()}
                />
                <span className="w-14 text-xs text-smoke">
                  {savingId === s.id
                    ? 'Saving…'
                    : s.logged_views != null
                      ? `${s.views_approx ? '~' : ''}${formatViews(s.logged_views)}`
                      : '-'}
                </span>
              </div>

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
                            ? `${r.prompt} - claimed, but this entry is on ${formatViews(s.logged_views ?? 0)} and the bonus pays at ${Number(r.min_views).toLocaleString()}. It lands by itself. Press to withdraw the claim.`
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
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => toggleBonus(s, r, given)}
                        aria-pressed={given}
                        title={given ? `Take back ${r.label}` : `Award ${r.label}`}
                        className={cx(
                          'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-semibold transition-all duration-200',
                          given
                            ? 'border-brand bg-brand text-white'
                            : 'border-gray-200 text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand',
                        )}
                      >
                        <Icon name={given ? 'check' : 'plus'} className="h-3 w-3" />
                        {r.points} pt{r.points === 1 ? '' : 's'} · {r.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

    </div>
  )
}


// THE CHALLENGE'S STATE, AS A SENTENCE AND A BUTTON.
//
// Three states, three next steps, and only ever ONE of them offered - a
// lifecycle is a line, not a set of choices, and drawing all three at once is
// what made the old toolbar look like three equally likely things to do.
//
// The destructive one carries its consequence in the copy rather than in a
// colour: "no new entries" is what a manager needs to have read, and a red
// button is a warning that does not say what about.
const LIFECYCLE = {
  draft: {
    now: 'Draft. Nobody in the market can see this challenge yet.',
    to: 'active',
    label: 'Publish challenge',
    hint: 'Creators in this market are notified.',
    icon: 'megaphone',
    primary: true,
  },
  active: {
    now: 'Live. Creators can still add entries.',
    to: 'ended',
    label: 'Close entries',
    hint: 'No new entries after this. The board stays visible to everyone.',
    icon: 'ban',
    primary: false,
  },
  ended: {
    now: 'Closed. No new entries; the board is still on the challenge.',
    to: 'archived',
    label: 'Archive',
    hint: 'Moves it into the archive.',
    icon: 'bucket',
    primary: false,
  },
  archived: {
    now: 'Archived.',
    to: null,
  },
}

function LifecycleCard({ status, busy, onSet }) {
  const step = LIFECYCLE[status]
  if (!step) return null
  return (
    <div className="mb-8 flex flex-wrap items-center justify-between gap-4 rounded-card border border-gray-100 bg-white px-5 py-4 shadow-card">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">{step.now}</p>
        {step.hint && <p className="mt-0.5 text-xs text-smoke">{step.hint}</p>}
      </div>
      {step.to && (
        <button
          type="button"
          onClick={() => onSet(step.to)}
          disabled={busy}
          className={cx(
            'inline-flex shrink-0 items-center gap-1.5 !py-2 text-xs',
            step.primary ? 'btn-primary' : 'btn-secondary',
          )}
        >
          {busy ? <Spinner /> : <Icon name={step.icon} className="h-3.5 w-3.5" />}
          {step.label}
        </button>
      )}
    </div>
  )
}
