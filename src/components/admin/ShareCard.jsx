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
  table: { width: 1000, scale: 3 },
}

export default function ShareCard({
  cardRef, what, challenge, boardName = null, prizes = [], winners = [], ranking = [],
  entries = 0, totalViews = 0, voucherWinners = [], voucherPrize = '',
  subCountByCreator = {}, platformsFor = () => [],
}) {
  const participation = voucherPrize
    ? {
        threshold: challenge?.participation_threshold || 1,
        prize: voucherPrize,
        basis: challenge?.participation_basis === 'points' && challenge?.scoring === 'points' ? 'points' : 'entries',
        // THE SCOPE TRAVELS WITH THE TERMS (22 Sep 2026). Without it the
        // picture gave the leader of the Global Challenge the voucher badge -
        // she is 1st, so she wins a place prize and the voucher is only for
        // creators OUTSIDE the paid places.
        scope: challenge?.participation_scope,
      }
    : null
  const isFinal = challenge?.results_status === 'final'
  // THE PICTURE HOLDS THE TOP TEN, OR EVERY PAID PLACE IF THERE ARE MORE
  // (21 Sep 2026). It used to hold the whole ranking - on a worldwide board of a
  // hundred creators that is a 1000px-wide scroll nobody reads in a chat. The
  // top three still get the podium styling inside the board; everybody past
  // the cut is one line underneath, and the full board is one tap away.
  const paid = (prizes || []).filter((p) => String(p?.place || '').trim()).length
  const cut = Math.max(10, paid)
  const shownRows = ranking.slice(0, cut)
  const moreRows = Math.max(0, ranking.length - shownRows.length)

  return (
    <div
      ref={cardRef}
      // A PHOTOGRAPH IS ONE FRAME (21 Sep 2026). The podium it borrows fades
      // its columns in on a delay, and the picture was taken the moment the
      // card mounted - so the preview, and a quick download, showed "Winners"
      // over an empty box. `.snapshot-still` finishes every animation inside.
      className="snapshot-still"
      style={{ width: (SHARE_LAYOUT[what] ?? SHARE_LAYOUT.podium).width, background: '#ffffff', fontFamily: 'Poppins, system-ui, sans-serif' }}
    >
      <div className="bg-gradient-to-br from-brand to-brand-light px-10 py-7 text-center text-white">
        <p className="text-[30px] font-extrabold leading-tight tracking-tight">{challenge?.title || 'Challenge'}</p>
        <p className="mt-1 text-sm font-medium text-white/85">
          {/* THE BOARD'S OWN NAME, when there is more than one. A picture of
              Group B's podium captioned only "Final winners" is a picture that
              says the wrong thing to every creator in Group A. */}
          {boardName ? `${boardName} · ` : ''}
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
              rows={shownRows}
              prizes={prizes}
              scoreLabel={challenge?.scoring === 'points' ? 'points' : 'views'}
              participation={participation}
              subCountByCreator={subCountByCreator}
              platformsFor={platformsFor}
              linkProfiles={false}
              wide
            />
            {moreRows > 0 && (
              <p className="mt-4 text-center text-sm font-semibold text-smoke">
                + {moreRows} more {moreRows === 1 ? 'creator' : 'creators'} on the full leaderboard in the app
              </p>
            )}
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
