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


/**
 * A prize row's kind: what the admin chose, or read out of the words for a row
 * written before the choice existed. The payout reads `type` first and falls
 * back to the same reading in SQL (`prize_kind_of`).
 */
export function rowType(p) {
  if (p?.type === 'cash' || p?.type === 'voucher') return p.type
  return /voucher|gift ?card|credit/i.test(p?.prize || '') ? 'voucher' : 'cash'
}

const toInt = (v) => {
  const n = parseInt(String(v ?? '').replace(/[^0-9]/g, ''), 10)
  return Number.isFinite(n) && n > 0 ? n : null
}
const toAmount = (v) => {
  const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

/**
 * The migration-233 participation columns, ready to save. All null when there
 * is no participation prize, so a stale cap cannot outlive the prize it capped.
 */
export function participationExtras(form) {
  const on = !!(form?.participation_threshold && String(form?.participation_prize || '').trim())
  if (!on) {
    return { participation_cap: null, participation_reward_type: null, participation_amount: null, participation_scope: 'everyone' }
  }
  return {
    participation_cap: toInt(form.participation_cap),
    participation_reward_type: form.participation_reward_type === 'cash' ? 'cash' : 'voucher',
    participation_amount: toAmount(form.participation_amount),
    participation_scope: form.participation_scope === 'outside_prizes' ? 'outside_prizes' : 'everyone',
  }
}

let awardSeq = 0
/** A fresh "most committed" award, with a stable id the payout keys on. */
export function newMostCommitted(symbol = '') {
  awardSeq += 1
  return {
    id: `mc-${Date.now().toString(36)}-${awardSeq}`,
    kind: 'most_committed',
    label: 'Most committed',
    prize: `${symbol}20 Tryp.com voucher`,
    amount: '20',
    type: 'voucher',
    exclude_top: '',
    scope: 'outside',
  }
}

/** Extra awards worth saving: something to win, typed numbers as numbers. */
export function cleanExtraAwards(list = []) {
  return (Array.isArray(list) ? list : [])
    .filter((a) => a && a.id && String(a.prize || '').trim())
    .map((a) => ({
      id: String(a.id),
      kind: a.kind || 'most_committed',
      label: String(a.label || '').trim() || 'Most committed',
      prize: String(a.prize).trim(),
      amount: toAmount(a.amount) ?? toAmount(String(a.prize).match(/\d[\d,]*(?:\.\d+)?/)?.[0]),
      type: a.type === 'cash' ? 'cash' : 'voucher',
      exclude_top: toInt(a.exclude_top),
      scope: a.scope === 'anyone' ? 'anyone' : 'outside',
    }))
}

// CASH OR VOUCHER, CHOSEN. Two halves, the picked one solid brand (the rule
// for every picked option on this form). Ethan: "this doesn't have to be a
// voucher, this could also be a cash prize, so I should have the option."
function TypeToggle({ value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex shrink-0 rounded-xl border border-gray-200 bg-white p-0.5">
      {['cash', 'voucher'].map((t) => (
        <button
          key={t} type="button" role="radio" aria-checked={value === t}
          onClick={() => onChange(t)}
          className={
            'rounded-[10px] px-3 py-1.5 text-xs font-semibold capitalize transition-all duration-200 '
            + (value === t ? 'bg-brand text-white shadow-sm' : 'text-smoke hover:text-brand')
          }
        >
          {t}
        </button>
      ))}
    </div>
  )
}

function SmallNumber({ value, onChange, placeholder, label, width = '!w-16' }) {
  return (
    <input
      type="text" inputMode="numeric" className={`input ${width} text-center`}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
      placeholder={placeholder} aria-label={label}
    />
  )
}

export default function PrizeBreakdownFields({
  prizes = [],
  onPrizes,
  symbol = '',
  participationThreshold = '',
  participationPrize = '',
  onParticipation,
  // Challenge-level only (the group editor leaves these out): the cap, the
  // cash/voucher choice, the value and who can earn it, plus extra awards.
  participationExtra = null,
  onParticipationExtra = null,
  extraAwards = null,
  onExtraAwards = null,
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
          <TypeToggle value={rowType(p)} onChange={(t) => setPrize(i, 'type', t)} label={`Prize ${i + 1} type`} />
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
        onClick={() => onPrizes([...prizes, { place: '', prize: '', amount: '', type: 'cash' }])}
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
            <span className="text-sm text-smoke">videos and they get</span>
            <input
              type="text" className="input !w-auto min-w-[12rem] flex-1"
              value={participationPrize}
              onChange={(e) => {
                const text = e.target.value
                onParticipation({ threshold: participationThreshold, prize: text })
                // Same courtesy as a prize row: read the value and the kind
                // out of the words while they have not been set by hand.
                if (participationExtra && onParticipationExtra && !String(participationExtra.amount ?? '').trim()) {
                  const m = text.match(/(\d[\d,]*(?:\.\d{1,2})?)/)
                  if (m) onParticipationExtra({ amount: m[1].replace(/,/g, '') })
                }
              }}
              placeholder={`e.g. ${symbol}15 Tryp.com voucher`}
              aria-label="Participation reward"
              id={`${idPrefix}-participation`}
            />
          </div>

          {participationExtra && onParticipationExtra && String(participationPrize || '').trim() && participationThreshold && (
            <div className="mt-3 space-y-3 rounded-xl border border-gray-100 bg-white p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-24 shrink-0 text-xs font-medium text-smoke">Paid as</span>
                <TypeToggle
                  value={participationExtra.reward_type === 'cash' ? 'cash' : 'voucher'}
                  onChange={(t) => onParticipationExtra({ reward_type: t })}
                  label="Participation reward type"
                />
                <span className="ml-2 text-xs font-medium text-smoke">worth</span>
                <span className="text-xs font-medium text-smoke">{symbol}</span>
                <input
                  type="text" inputMode="decimal" className="input !w-20" placeholder="15"
                  value={participationExtra.amount ?? ''}
                  onChange={(e) => onParticipationExtra({ amount: e.target.value.replace(/[^0-9.]/g, '') })}
                  aria-label="Participation reward value"
                />
              </div>
              {/* THE CAP. Ethan: "only the first 30 creators can actually earn
                  that, so we're not giving out theoretically unlimited
                  vouchers." First = whoever's Nth entry went in first. */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-24 shrink-0 text-xs font-medium text-smoke">Limit</span>
                <span className="text-sm text-smoke">Only the first</span>
                <SmallNumber
                  value={participationExtra.cap}
                  onChange={(v) => onParticipationExtra({ cap: v })}
                  placeholder="all" label="Most creators who can earn the participation reward"
                />
                <span className="text-sm text-smoke">creators to get there</span>
                <span className="basis-full pl-[6.5rem] text-[11px] text-smoke">
                  {participationExtra.cap && Number(participationExtra.cap) > 0 && Number(participationExtra.amount) > 0
                    ? `At most ${symbol}${(Number(participationExtra.cap) * Number(participationExtra.amount)).toLocaleString()} in total. Leave blank for no limit.`
                    : 'Leave blank and everyone who gets there earns it.'}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="w-24 shrink-0 text-xs font-medium text-smoke">Who can earn it</span>
                <div role="radiogroup" aria-label="Who can earn the participation reward" className="inline-flex flex-wrap rounded-xl border border-gray-200 bg-white p-0.5">
                  {[
                    { v: 'everyone', l: 'Everyone, winners too' },
                    { v: 'outside_prizes', l: 'Only creators outside the prize places' },
                  ].map((o) => (
                    <button
                      key={o.v} type="button" role="radio" aria-checked={participationExtra.scope === o.v}
                      onClick={() => onParticipationExtra({ scope: o.v })}
                      className={
                        'rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-all duration-200 '
                        + (participationExtra.scope === o.v ? 'bg-brand text-white shadow-sm' : 'text-smoke hover:text-brand')
                      }
                    >
                      {o.l}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* EXTRA AWARDS. The first kind is "most committed": the creator who
          entered the most videos and finished outside the paid places. It is
          worked out automatically at the end and paid with the other prizes. */}
      {extraAwards && onExtraAwards && (
        <div className="border-t border-gray-100 pt-4">
          <p className="label">
            Extra awards <span className="font-normal normal-case tracking-normal text-smoke">(optional)</span>
          </p>
          <div className="space-y-3">
            {extraAwards.map((a, i) => {
              const setA = (patch) => onExtraAwards(extraAwards.map((x, j) => (j === i ? { ...x, ...patch } : x)))
              return (
                <div key={a.id} className="space-y-2.5 rounded-xl border border-gray-100 bg-white p-3.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
                      <Icon name="trophy" className="h-4 w-4" />
                    </span>
                    <input
                      type="text" className="input !w-44" value={a.label ?? ''}
                      onChange={(e) => setA({ label: e.target.value })} aria-label="Award name"
                    />
                    <input
                      type="text" className="input min-w-[10rem] flex-1" value={a.prize ?? ''}
                      onChange={(e) => {
                        const text = e.target.value
                        const patch = { prize: text }
                        if (!String(a.amount ?? '').trim()) {
                          const m = text.match(/(\d[\d,]*(?:\.\d{1,2})?)/)
                          if (m) patch.amount = m[1].replace(/,/g, '')
                        }
                        setA(patch)
                      }}
                      placeholder={`e.g. ${symbol}20 Tryp.com voucher`} aria-label="What they get"
                    />
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-medium text-smoke">{symbol}</span>
                      <input
                        type="text" inputMode="decimal" className="input !w-20" placeholder="20"
                        value={a.amount ?? ''}
                        onChange={(e) => setA({ amount: e.target.value.replace(/[^0-9.]/g, '') })}
                        aria-label="Award value"
                      />
                    </div>
                    <TypeToggle value={a.type === 'cash' ? 'cash' : 'voucher'} onChange={(t) => setA({ type: t })} label="Award type" />
                    <button
                      type="button" aria-label={`Remove ${a.label || 'award'}`} className="btn-ghost !px-3"
                      onClick={() => onExtraAwards(extraAwards.filter((_, j) => j !== i))}
                    >
                      ✕
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-10">
                    <span className="text-xs font-medium text-smoke">Who can win it</span>
                    <div role="radiogroup" aria-label="Who can win this award" className="inline-flex flex-wrap rounded-xl border border-gray-200 bg-white p-0.5">
                      {[
                        { v: 'outside', l: 'Outside the prize places' },
                        { v: 'anyone', l: 'Anyone, winners too' },
                      ].map((o) => (
                        <button
                          key={o.v} type="button" role="radio" aria-checked={(a.scope || 'outside') === o.v}
                          onClick={() => setA({ scope: o.v })}
                          className={
                            'rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-all duration-200 '
                            + ((a.scope || 'outside') === o.v ? 'bg-brand text-white shadow-sm' : 'text-smoke hover:text-brand')
                          }
                        >
                          {o.l}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pl-10 text-sm text-smoke">
                    {(a.scope || 'outside') === 'outside' ? (
                      <>
                        <span>Goes to whoever entered the most videos and finished outside the top</span>
                        <SmallNumber
                          value={a.exclude_top}
                          onChange={(v) => setA({ exclude_top: v })}
                          placeholder={String(prizes.length || 10)} label="Finished outside the top"
                        />
                      </>
                    ) : (
                      <span>Goes to whoever entered the most videos, wherever they finished.</span>
                    )}
                    <span className="basis-full text-[11px]">
                      {(a.scope || 'outside') === 'outside' ? `Blank means outside the paid places (${prizes.length || 0} now). ` : ''}
                      Worked out automatically; a tie goes to the higher leaderboard position, then to whoever got
                      there first. The results page shows who is leading.
                    </span>
                  </div>
                </div>
              )
            })}
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-2.5 text-sm font-medium text-smoke transition-all duration-200 hover:border-brand hover:text-brand"
              onClick={() => onExtraAwards([...extraAwards, newMostCommitted(symbol)])}
            >
              <Icon name="plus" className="h-4 w-4" /> Add a "most committed" award
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
