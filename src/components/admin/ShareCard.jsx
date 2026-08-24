import WinnersPodium from '../WinnersPodium'
import ChallengeLeaderboard from '../ChallengeLeaderboard'

// WHAT GETS PHOTOGRAPHED.
//
// Not a drawing of the result - the result itself, the same two components
// creators open, with a band across the top naming the challenge. `domSnapshot`
// turns this node into a PNG, so whatever is fixed in the podium or the board is
// fixed in the shared picture on the same day.
//
// 760 CSS pixels wide, photographed at 3x - 2280px, sharp full screen on any
// phone. The WIDTH IS NOT A RESOLUTION CHOICE: everything inside the podium is
// a fixed size (a 5rem avatar, a 6rem column), so a wider card does not draw a
// bigger podium, it draws the same podium with more white around it. 760 is the
// width at which the winners fill the picture.
// The two pictures want different widths for the same reason: the podium's
// parts are fixed-size and stop filling a wide card, while a leaderboard ROW
// needs room - at 760 the names truncated to "Lisa Bur..." next to a voucher
// pill, which is the picture telling you less than the page it came from.
export const SHARE_LAYOUT = {
  podium: { width: 760, scale: 3 },
  table: { width: 1000, scale: 2 },
}

export default function ShareCard({
  cardRef, what, challenge, winners = [], ranking = [], entries = 0, totalViews = 0,
  voucherWinners = [], voucherPrize = '', subCountByCreator = {}, platformsFor = () => [],
}) {
  const participation = challenge?.participation_threshold && challenge?.participation_prize
    ? { threshold: challenge.participation_threshold, prize: challenge.participation_prize }
    : null
  const isFinal = challenge?.results_status === 'final'

  return (
    <div
      ref={cardRef}
      style={{ width: (SHARE_LAYOUT[what] ?? SHARE_LAYOUT.podium).width, background: '#ffffff', fontFamily: 'Poppins, system-ui, sans-serif' }}
    >
      <div className="bg-gradient-to-br from-brand to-brand-light px-10 py-7 text-center text-white">
        <p className="text-[30px] font-extrabold leading-tight tracking-tight">{challenge?.title || 'Challenge'}</p>
        <p className="mt-1 text-sm font-medium text-white/85">
          {what === 'podium'
            ? (isFinal ? 'Final winners' : 'Current winners')
            : (isFinal ? 'Final leaderboard' : 'Current leaderboard')}
        </p>
      </div>

      <div className="px-6 py-7">
        {what === 'podium' ? (
          <WinnersPodium
            winners={winners}
            entries={entries}
            totalScore={totalViews}
            scoring={challenge?.scoring}
            voucherWinners={voucherWinners}
            voucherPrize={voucherPrize}
          />
        ) : (
          <>
            <ChallengeLeaderboard
              rows={ranking}
              participation={participation}
              subCountByCreator={subCountByCreator}
              platformsFor={platformsFor}
              linkProfiles={false}
              wide
            />
            <div className="mt-6 flex items-center justify-center gap-10 border-t border-gray-200/70 pt-4 text-center">
              <div>
                <p className="text-lg font-bold tabular-nums text-ink">{entries}</p>
                <p className="text-[11px] font-medium uppercase tracking-wide text-smoke">Entries</p>
              </div>
              <div>
                <p className="text-lg font-bold tabular-nums text-ink">{ranking.length}</p>
                <p className="text-[11px] font-medium uppercase tracking-wide text-smoke">Ranked</p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
