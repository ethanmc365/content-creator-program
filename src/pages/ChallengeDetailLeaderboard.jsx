import { formatMoney, cx } from '../lib/utils'
import Icon from '../components/Icon'
import Podium from '../components/Podium'
import ChallengeLeaderboard from '../components/ChallengeLeaderboard'

// Part of ChallengeDetail.jsx: every value it shows comes in as a prop from the page.
export default function ChallengeDetailLeaderboard({
  boardCounts,
  boardParticipation,
  boardPrizes,
  boardRows,
  boards,
  challenge,
  isLive,
  myEntries,
  myGroupId,
  podiumPlaces,
  results,
  setBoard,
  setShowSubmit,
  shownBoard,
  shownPrize,
  streaks,
  subCountByCreator,
  submittedPlatforms,
  tr,
  user,
}) {
  return (
    <div className="space-y-5 animate-fade-up">
      {/* WHERE THE BOARD CAME FROM is the badge beside the tabs now
          (`BoardStatus`); the full-width card that said it is gone. */}
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
      {/* THE PODIUM LEADS THE BOARD, AND IT MOVES ON ITS OWN.

          It is built from the SAME rows the list is built from, so there is
          nothing to keep in step: view counts are read off each entry's
          link a few times a day and written to `submissions`, this page
          subscribes to that table, and the podium and the list re-rank
          together because they are one array. Places nobody has taken yet
          are drawn as open steps carrying their prize rather than left out,
          which is the promise the rows below already make.

          THE LIST UNDER IT HOLDS EVERYBODY, FIRST PLACE INCLUDED.

          It started at FOURTH, on the reasoning that drawing the top three
          twice was a duplicate. That reasoning was wrong about what a
          leaderboard IS. A board is a ranked list and a podium is a
          PICTURE of its head; cutting the first three rows out of the list
          to avoid repeating them leaves a table that begins at 4 with no
          explanation, and it means the columns a creator scans for - the
          prize on each place, the platforms, the score - are missing for
          exactly the three places they care most about. A scoreboard shows
          the leader in the list AND on the screen above it; nobody has ever
          found that confusing. */}
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
        streaks={streaks}
        showStreaks={isLive}
        showVideos
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
  )
}
