import WinnersPodium from '../WinnersPodium'

// The winners of a finished challenge, from lib/winners: one podium, or one per board when the challenge ran as
// several leaderboards (ranks are stored per board, so one podium over all of them would show two firsts).
// Used by the main challenges page and each market's challenges tab. `podium` adds props to the single podium.
export default function PastWinners({ challenge: c, gallery, podium = {} }) {
  if (gallery.boards?.length > 0) {
    return (
      <div className="pointer-events-auto mt-5 space-y-4">
        {gallery.boards.map((b) => (
          <div key={b.id ?? 'all'}>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-brand">{b.name}</p>
            <WinnersPodium
              winners={b.winners}
              entries={b.entries}
              totalScore={b.totalScore}
              scoring={c.scoring}
              voucherWinners={[]}
              voucherPrize={c.participation_prize}
            />
          </div>
        ))}
      </div>
    )
  }
  return (
    <WinnersPodium
      className="pointer-events-auto mt-5"
      {...podium}
      winners={gallery.winners}
      entries={c.submissions?.[0]?.count ?? 0}
      totalScore={gallery.totalScore}
      scoring={c.scoring}
      voucherWinners={gallery.voucherWinners}
      voucherPrize={c.participation_prize}
    />
  )
}
