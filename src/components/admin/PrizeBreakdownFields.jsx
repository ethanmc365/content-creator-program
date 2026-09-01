import Icon from '../Icon'

// THE PRIZE BREAKDOWN, ONCE, FOR A CHALLENGE OR FOR ONE OF ITS BOARDS.
//
// A challenge that runs two leaderboards can pay each of them differently, and
// until now "its own prize" meant two boxes - a pot and a number of winners -
// which is not a prize anybody can be told they have won. Ethan: "if you click
// 'its own prize', then that should mean you actually enter in the proper prize
// breakdown, reward for taking part, etcetera, for each group. Not just enter
// the prize pot and winners. It needs the actual proper data, and this would
// need to be synced to the database and everything so it works correctly."
//
// He is describing the gap between the two editors, and the gap was real all
// the way down: `award_challenge_prizes_internal` pays from
// `challenge_groups.prize_structure`, a column the form never wrote, so a group
// with "its own prize" of 300 euros and 3 winners fell straight through to the
// challenge's breakdown at payout time. The pot and the winner count are
// REPORTING figures - they are derived from the rows on save - and they were
// being asked for as though they were the prize.
//
// So there is one editor and both places use it. Whatever a challenge can
// promise, a board can promise.
//
// THE VALUE IS ITS OWN FIELD. "150 euros cash and a jacket" is the right thing
// to show a creator and an impossible thing to add up, so the number a row is
// worth is separate from the words, and every total on top of it is arithmetic
// rather than a second guess.

/** The pot and the winner count a set of rows adds up to. One definition. */
export function prizeTotals(prizes = []) {
  const rows = Array.isArray(prizes) ? prizes : []
  const pot = rows.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const winners = rows.filter((p) => p.place?.trim() && Number(p.amount) > 0).length
  return { pot, winners }
}

/**
 * What KIND of prize this is, read out of the words rather than asked for.
 * The reporting column on `challenges` has always been derived this way; a
 * group's is derived identically so the two can never mean different things.
 */
export function prizeKind(prizes = []) {
  const text = (Array.isArray(prizes) ? prizes : []).map((p) => p.prize || '').join(' ').toLowerCase()
  const hasVoucher = /voucher|credit|trip|travel/.test(text)
  const hasCash = (Array.isArray(prizes) ? prizes : []).some((p) => Number(p.amount) > 0)
  return hasCash && hasVoucher ? 'cash_voucher' : hasVoucher ? 'voucher' : 'cash'
}

/** Rows worth saving: a place and something to win. */
export const cleanPrizes = (prizes = []) =>
  (Array.isArray(prizes) ? prizes : []).filter((p) => p.place && p.prize)

export default function PrizeBreakdownFields({
  prizes = [],
  onPrizes,
  symbol = '',
  participationThreshold = '',
  participationPrize = '',
  onParticipation,
  idPrefix = 'prize',
  // The group editor sits inside a card inside a section, so it gets the
  // tighter spacing and smaller type. Nothing else differs.
  dense = false,
}) {
  const setPrize = (i, key, value) => {
    const next = [...prizes]
    next[i] = { ...next[i], [key]: value }
    onPrizes(next)
  }

  return (
    <div className={dense ? 'space-y-3' : 'space-y-5'}>
      {prizes.map((p, i) => (
        <div key={i} className="flex flex-wrap gap-2">
          <input
            type="text" className="input !w-28 sm:!w-32" placeholder="Place (e.g. 1st)"
            value={p.place ?? ''} onChange={(e) => setPrize(i, 'place', e.target.value)}
            aria-label={`Prize ${i + 1} place`}
          />
          <input
            type="text" className="input min-w-0 flex-1" placeholder={`What they get (e.g. ${symbol}150 cash)`}
            value={p.prize ?? ''}
            onChange={(e) => {
              const text = e.target.value
              setPrize(i, 'prize', text)
              // READ THE NUMBER OUT OF THE WORDS.
              //
              // Type "150 cash" and the value box fills in - but only while it
              // is still EMPTY. A guess that overwrites a figure somebody typed
              // is worse than no guess, because they have no reason to look at
              // it again.
              if (!String(p.amount ?? '').trim()) {
                const m = text.match(/(?:[£€$]\s*)?(\d[\d,]*(?:\.\d{1,2})?)/)
                if (m) setPrize(i, 'amount', m[1].replace(/,/g, ''))
              }
            }}
            aria-label={`Prize ${i + 1} description`}
          />
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-medium text-smoke">{symbol}</span>
            <input
              type="text" inputMode="decimal" className="input !w-24" placeholder="150"
              value={p.amount ?? ''}
              onInput={(e) => { e.target.value = e.target.value.replace(/[^0-9.]/g, '') }}
              onChange={(e) => setPrize(i, 'amount', e.target.value)}
              aria-label={`Prize ${i + 1} value`}
            />
          </div>
          <button
            type="button" aria-label={`Remove prize ${i + 1}`} className="btn-ghost !px-3"
            onClick={() => onPrizes(prizes.filter((_, j) => j !== i))}
          >
            ✕
          </button>
        </div>
      ))}

      {/* THE BUTTON GOES WHERE THE LIST ENDS, not up in a header beside the
          currency, which reads as page furniture rather than "add another row
          to this". */}
      <button
        type="button"
        className="inline-flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-2.5 text-sm font-medium text-smoke transition-all duration-200 hover:border-brand hover:text-brand"
        onClick={() => onPrizes([...prizes, { place: '', prize: '', amount: '' }])}
        id={`${idPrefix}-add`}
      >
        <Icon name="plus" className="h-4 w-4" /> Add a prize
      </button>

      {/* THE PARTICIPATION REWARD IS A PRIZE, so it sits with the prizes rather
          than in a tinted card of its own. A text field with `inputMode`
          instead of `type="number"`: number inputs draw browser spinners, snap
          on a scroll wheel over the field, and on some phones open a keypad
          with no way to correct a typo. */}
      {onParticipation && (
        <div className="border-t border-gray-100 pt-4">
          <p className="label">
            Reward for taking part <span className="font-normal normal-case tracking-normal text-smoke">(optional)</span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-smoke">Post</span>
            <input
              type="text" inputMode="numeric" className="input !w-16 text-center"
              value={participationThreshold}
              onInput={(e) => { e.target.value = e.target.value.replace(/[^0-9]/g, '') }}
              onChange={(e) => onParticipation({ threshold: e.target.value, prize: participationPrize })}
              placeholder="3" aria-label="Videos needed for the participation reward"
              id={`${idPrefix}-threshold`}
            />
            <span className="text-sm text-smoke">videos and everyone gets</span>
            <input
              type="text" className="input !w-auto min-w-[12rem] flex-1"
              value={participationPrize}
              onChange={(e) => onParticipation({ threshold: participationThreshold, prize: e.target.value })}
              placeholder={`e.g. ${symbol}10 Tryp.com voucher`}
              aria-label="Participation reward"
              id={`${idPrefix}-participation`}
            />
          </div>
        </div>
      )}
    </div>
  )
}
