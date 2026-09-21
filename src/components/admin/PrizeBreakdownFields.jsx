import { useState } from 'react'
import Icon from '../Icon'
import { cx } from '../../lib/utils'

// THE PRIZE BREAKDOWN, ONCE, FOR A CHALLENGE OR FOR ONE OF ITS BOARDS.
//
// A challenge that runs two leaderboards can pay each of them differently, and
// both places use this one editor - whatever a challenge can promise, a board
// can promise. `award_challenge_prizes_internal` pays a group from its own
// `prize_structure`, so a second hand-written copy is how one of them ends up
// missing the field that gets people paid.
//
// THE VALUE IS ITS OWN FIELD. "150 euros cash and a jacket" is the right thing
// to show a creator and an impossible thing to add up, so the number a row is
// worth is separate from the words, and every total on top of it is arithmetic.
//
// THE REDESIGN OF 21 SEP 2026. Ethan: the bonus and prize parts looked
// "scattered and misaligned", the reward for taking part should match "how the
// other prizes look", Extra awards should be called "Most committed" and not
// show "unless someone actually clicks for it", and the totals did not count
// the vouchers at all. So: every prize is a row on ONE grid (place, what they
// get, value, cash or voucher), the two optional rewards are cards added with
// a button beside "Add a prize", and `prizeBudget` is the one definition of
// what the whole thing costs.

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

/** The first number in some words, as typed ("€1,500 cash" -> "1500"). */
export function numberIn(text) {
  const m = String(text ?? '').match(/(\d[\d,]*(?:\.\d{1,2})?)/)
  return m ? m[1].replace(/,/g, '') : ''
}

/**
 * THE VALUE FOLLOWS THE WORDS FOR AS LONG AS IT CAME FROM THE WORDS.
 *
 * Ethan: "let's say I type 20 cash into What they get... I would expect it to
 * then show up as 20 beside the euro symbol." It did not, because the value was
 * only ever filled while it was EMPTY - so once "150" had been read out of the
 * first draft, retyping the words never moved it again.
 *
 * The rule now: if the value box still says exactly what the OLD words said, it
 * was ours, so it follows the new words. If somebody typed a different number
 * into it by hand, that is theirs and it stays.
 */
export function followAmount(oldText, newText, amount) {
  const cur = String(amount ?? '').trim()
  if (cur === '' || cur === numberIn(oldText)) return numberIn(newText)
  return cur
}

/**
 * The migration-233 participation columns, ready to save. All null when there
 * is no participation prize, so a stale cap cannot outlive the prize it capped.
 */
export function participationExtras(form) {
  const on = !!(form?.participation_threshold && String(form?.participation_prize || '').trim())
  if (!on) {
    return { participation_cap: null, participation_reward_type: null, participation_amount: null, participation_scope: 'everyone', participation_basis: 'entries' }
  }
  return {
    // Migration 241: the threshold counts videos, or - on a points challenge
    // only - points. Anything else falls back to videos.
    participation_basis: form.participation_basis === 'points' && form.scoring === 'points' ? 'points' : 'entries',
    participation_cap: toInt(form.participation_cap),
    participation_reward_type: form.participation_reward_type === 'cash' ? 'cash' : 'voucher',
    participation_amount: toAmount(form.participation_amount) ?? toAmount(numberIn(form.participation_prize)),
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
      amount: toAmount(a.amount) ?? toAmount(numberIn(a.prize)),
      type: a.type === 'cash' ? 'cash' : 'voucher',
      exclude_top: toInt(a.exclude_top),
      scope: a.scope === 'anyone' ? 'anyone' : 'outside',
    }))
}

/**
 * WHAT THE WHOLE THING COSTS, SPLIT INTO CASH AND VOUCHERS.
 *
 * Ethan: "it's not counting the Trip.com vouchers, so it should also count
 * them... The total prize pot should show the total, and then it should be
 * split by cash and vouchers. For the participation vouchers, we should say
 * from €0 to €15 and highlight what it is if it's only the first 33, or if it's
 * for all."
 *
 * The places and the awards are FIXED costs - somebody wins each of them. The
 * participation reward is a RANGE: nobody may reach the threshold, or up to the
 * cap may. With no cap there is no top to the range, which `max: null` says
 * rather than inventing one.
 */
export function prizeBudget({ prizes = [], participation = null, awards = [], creators = null } = {}) {
  const rows = (Array.isArray(prizes) ? prizes : []).filter((p) => Number(p.amount) > 0)
  const places = { cash: 0, voucher: 0, count: 0 }
  for (const p of rows) {
    places[rowType(p)] += Number(p.amount)
    if (String(p.place || '').trim()) places.count += 1
  }
  const extra = (Array.isArray(awards) ? awards : [])
    .filter((a) => String(a?.prize || '').trim())
    .map((a) => ({
      label: String(a.label || '').trim() || 'Most committed',
      amount: toAmount(a.amount) ?? toAmount(numberIn(a.prize)) ?? 0,
      type: a.type === 'cash' ? 'cash' : 'voucher',
    }))

  let part = null
  if (participation && toInt(participation.threshold) && String(participation.prize || '').trim()) {
    const each = toAmount(participation.amount) ?? toAmount(numberIn(participation.prize)) ?? 0
    const cap = toInt(participation.cap)
    const scope = participation.scope === 'outside_prizes' ? 'outside_prizes' : 'everyone'
    // WITH NO CAP, THE CEILING IS THE ROSTER (21 Sep 2026). "No limit" still
    // has a limit: nobody who is not a creator in the market can earn it, and
    // outside-the-places cannot go to a place-winner either. So the most it
    // can cost is known, and Ethan wants it shown: "I would still show what
    // the maximum is, even if there's no limit." `null` only when the roster
    // is not known (the group editor passes no count).
    const n = toInt(creators)
    const reach = cap || (n ? Math.max(0, scope === 'outside_prizes' ? n - places.count : n) : null)
    part = {
      each,
      cap,
      reach,
      threshold: toInt(participation.threshold),
      basis: participation.basis === 'points' ? 'points' : 'entries',
      type: participation.type === 'cash' ? 'cash' : 'voucher',
      scope,
      max: reach != null ? each * reach : null,
    }
  }

  const fixed = { cash: places.cash, voucher: places.voucher }
  for (const a of extra) fixed[a.type] += a.amount
  const top = { ...fixed }
  if (part) {
    if (part.max == null) top[part.type] = null
    else top[part.type] += part.max
  }
  const sum = (o) => (o.cash == null || o.voucher == null ? null : o.cash + o.voucher)
  return {
    places,
    awards: extra,
    part,
    min: { ...fixed, total: fixed.cash + fixed.voucher },
    max: { ...top, total: sum(top) },
  }
}

// CASH OR VOUCHER, CHOSEN. Two halves, the picked one solid brand (the rule
// for every picked option on this form).
function TypeToggle({ value, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex h-[42px] shrink-0 items-stretch rounded-xl border border-gray-200 bg-white p-0.5">
      {['cash', 'voucher'].map((t) => (
        <button
          key={t} type="button" role="radio" aria-checked={value === t}
          onClick={() => onChange(t)}
          className={cx(
            'flex-1 rounded-[10px] px-3 text-xs font-semibold capitalize transition-all duration-200',
            value === t ? 'bg-brand text-white shadow-sm' : 'text-smoke hover:text-brand',
          )}
        >
          {t}
        </button>
      ))}
    </div>
  )
}

// TWO ANSWERS, THE PICKED ONE SOLID BRAND. Used for "who can earn it".
function Choice({ value, options, onChange, label }) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-xl border border-gray-200 bg-white p-0.5">
      {options.map((o) => (
        <button
          key={o.v} type="button" role="radio" aria-checked={value === o.v}
          onClick={() => onChange(o.v)}
          className={cx(
            'rounded-[10px] px-3 py-1.5 text-xs font-semibold transition-all duration-200',
            value === o.v ? 'bg-brand text-white shadow-sm' : 'text-smoke hover:text-brand',
          )}
        >
          {o.l}
        </button>
      ))}
    </div>
  )
}

// A NUMBER FIELD THAT KEEPS EVERY KEYSTROKE.
//
// Ethan: "I click in it, I type 2, and it shows up as nothing." Every number box
// here had an `onInput` that rewrote `e.target.value` to strip letters. React
// tracks an input's last value by intercepting that very setter, so writing the
// value in onInput told React the box ALREADY said "2" - its change event then
// saw nothing new, `onChange` never ran, state stayed empty, and the next render
// put the empty string back. Filtering belongs in onChange, and only there.
function NumberField({ value, onChange, placeholder, label, decimal = false, className = '', prefix = '', id }) {
  return (
    <label className={cx('flex h-[42px] items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 transition-colors focus-within:border-brand/60', className)}>
      {prefix && <span className="shrink-0 text-sm font-medium text-smoke">{prefix}</span>}
      <input
        id={id}
        type="text" inputMode={decimal ? 'decimal' : 'numeric'}
        className="no-ios-zoom w-full min-w-0 border-0 bg-transparent p-0 text-sm font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-gray-300 focus:ring-0"
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, ''))}
        placeholder={placeholder} aria-label={label}
      />
    </label>
  )
}

// ONE GRID FOR EVERY PRIZE, so the value and the cash/voucher toggle sit in the
// same column on the places, the taking-part reward and Most committed.
const GRID = 'grid grid-cols-[minmax(0,1fr)_6.5rem] gap-2 sm:grid-cols-[7.5rem_minmax(0,1fr)_7rem_9.5rem_2.25rem] sm:items-center'

function RemoveButton({ onClick, label }) {
  return (
    <button
      type="button" onClick={onClick} aria-label={label}
      className="flex h-9 w-9 items-center justify-center justify-self-end rounded-lg text-smoke transition-colors hover:bg-red-50 hover:text-red-600"
    >
      <Icon name="trash" className="h-4 w-4" />
    </button>
  )
}

// An optional reward, drawn as a card: an icon, what it is, one line on how it
// is won, then the same grid row every prize has.
function RewardCard({ icon, title, hint, onRemove, children }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-3.5 sm:p-4">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
          <Icon name={icon} className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="text-xs leading-snug text-smoke">{hint}</p>
        </div>
        <RemoveButton onClick={onRemove} label={`Remove ${title}`} />
      </div>
      {children}
    </div>
  )
}

function SettingRow({ label, children, note }) {
  return (
    <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <span className="text-xs font-semibold text-smoke sm:w-[7.5rem] sm:shrink-0">{label}</span>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {children}
        {note && <span className="text-xs text-smoke">{note}</span>}
      </div>
    </div>
  )
}

const money = (symbol, n) => `${symbol}${Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}`

const ADD_BTN = 'inline-flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-2.5 text-sm font-medium text-smoke transition-all duration-200 hoverable:hover:-translate-y-0.5 hover:border-brand hover:text-brand'

export default function PrizeBreakdownFields({
  prizes = [],
  onPrizes,
  symbol = '',
  participationThreshold = '',
  participationPrize = '',
  onParticipation,
  // Challenge-level only (the group editor leaves these out): the cap, the
  // cash/voucher choice, the value and who can earn it, plus Most committed.
  participationExtra = null,
  onParticipationExtra = null,
  // A points challenge can pay the taking-part reward on a points total
  // instead of a video count (migration 241). Off everywhere else.
  pointsBasisAllowed = false,
  extraAwards = null,
  onExtraAwards = null,
  idPrefix = 'prize',
  dense = false,
}) {
  // The taking-part card is open when it holds anything, or once "Add" has been
  // pressed and before anything is typed.
  const [partOpen, setPartOpen] = useState(false)
  const partShown = partOpen || !!String(participationThreshold || '').trim() || !!String(participationPrize || '').trim()

  const setPrize = (i, patch) => onPrizes(prizes.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const placeCount = prizes.filter((p) => String(p.place || '').trim()).length

  const mc = extraAwards || []
  const setAward = (i, patch) => onExtraAwards(mc.map((x, j) => (j === i ? { ...x, ...patch } : x)))

  const byPoints = pointsBasisAllowed && participationExtra?.basis === 'points'
  const partAmount = participationExtra
    ? (String(participationExtra.amount ?? '').trim() || numberIn(participationPrize))
    : numberIn(participationPrize)

  return (
    <div className={dense ? 'space-y-3' : 'space-y-4'}>
      {/* The column heads, once, on a screen wide enough for columns. */}
      {prizes.length > 0 && (
        <div className={cx(GRID, 'hidden px-0.5 text-[11px] font-semibold uppercase tracking-wide text-smoke sm:grid')}>
          <span>Place</span><span>What they get</span><span>Value</span><span>Paid as</span><span />
        </div>
      )}

      {prizes.map((p, i) => (
        <div key={i} className={GRID}>
          <input
            type="text" className="input order-1 !h-[42px] !py-0 sm:order-none" placeholder="1st"
            value={p.place ?? ''} onChange={(e) => setPrize(i, { place: e.target.value })}
            aria-label={`Prize ${i + 1} place`}
          />
          <input
            type="text" className="input order-3 col-span-2 !h-[42px] !py-0 sm:order-none sm:col-span-1"
            placeholder={`e.g. ${symbol}150 cash`}
            value={p.prize ?? ''}
            onChange={(e) => {
              const text = e.target.value
              setPrize(i, { prize: text, amount: followAmount(p.prize, text, p.amount) })
            }}
            aria-label={`Prize ${i + 1} description`}
          />
          <NumberField
            value={p.amount} onChange={(v) => setPrize(i, { amount: v })}
            className="order-2 sm:order-none" prefix={symbol} placeholder="150" decimal label={`Prize ${i + 1} value`}
          />
          <div className="order-4 col-span-2 flex items-center justify-between gap-2 sm:contents">
            <TypeToggle value={rowType(p)} onChange={(t) => setPrize(i, { type: t })} label={`Prize ${i + 1} type`} />
            <RemoveButton onClick={() => onPrizes(prizes.filter((_, j) => j !== i))} label={`Remove prize ${i + 1}`} />
          </div>
        </div>
      ))}

      {/* ADD A PRIZE SITS UNDER THE LAST PLACE (21 Sep 2026). Ethan: "I would
          still have it up above Reward for Taking Part and below the last main
          price. Obviously, that's what you're adding." A new place joins the
          list it is under; the two optional rewards keep their buttons at the
          foot, where the things they add appear. */}
      <div>
        <button
          type="button" className={ADD_BTN} id={`${idPrefix}-add`}
          onClick={() => onPrizes([...prizes, { place: '', prize: '', amount: '', type: 'cash' }])}
        >
          <Icon name="plus" className="h-4 w-4" /> Add a prize
        </button>
      </div>

      {/* THE REWARD FOR TAKING PART, AS A PRIZE. Same row as a place: the
          threshold where a place would be, then what they get, its value and
          how it is paid. The cap and who can earn it are the two settings
          underneath, because they are what turns "a voucher" into a budget. */}
      {onParticipation && partShown && (
        <RewardCard
          icon="video"
          title="Reward for taking part"
          hint={byPoints
            ? 'Earned by reaching enough points, paid automatically when the winners are published.'
            : 'Earned by posting enough videos, paid automatically when the winners are published.'}
          onRemove={() => {
            onParticipation({ threshold: '', prize: '' })
            if (onParticipationExtra) onParticipationExtra({ cap: '', amount: '', scope: 'everyone', reward_type: 'voucher', basis: 'entries' })
            setPartOpen(false)
          }}
        >
          <div className={GRID}>
            <NumberField
              id={`${idPrefix}-threshold`}
              value={participationThreshold}
              onChange={(v) => onParticipation({ threshold: v, prize: participationPrize })}
              className="order-1 sm:order-none"
              prefix={byPoints ? 'Reach' : 'Post'} placeholder={byPoints ? '20' : '6'}
              label={byPoints ? 'Points needed for the participation reward' : 'Videos needed for the participation reward'}
            />
            <input
              type="text" className="input order-3 col-span-2 !h-[42px] !py-0 sm:order-none sm:col-span-1"
              value={participationPrize}
              onChange={(e) => {
                const text = e.target.value
                onParticipation({ threshold: participationThreshold, prize: text })
                if (participationExtra && onParticipationExtra) {
                  onParticipationExtra({ amount: followAmount(participationPrize, text, participationExtra.amount) })
                }
              }}
              placeholder={`e.g. ${symbol}15 Tryp.com voucher`}
              aria-label="Participation reward"
              id={`${idPrefix}-participation`}
            />
            {participationExtra && onParticipationExtra ? (
              <>
                <NumberField
                  value={participationExtra.amount}
                  onChange={(v) => onParticipationExtra({ amount: v })}
                  className="order-2 sm:order-none" prefix={symbol} placeholder="15" decimal label="Participation reward value"
                />
                <div className="order-4 col-span-2 flex items-center sm:order-none sm:col-span-1">
                  <TypeToggle
                    value={participationExtra.reward_type === 'cash' ? 'cash' : 'voucher'}
                    onChange={(t) => onParticipationExtra({ reward_type: t })}
                    label="Participation reward type"
                  />
                </div>
              </>
            ) : (
              <span className="hidden text-xs text-smoke sm:col-span-2 sm:block">{byPoints ? 'points' : 'videos'}</span>
            )}
          </div>

          {participationExtra && onParticipationExtra && (
            <div className="mt-3 space-y-2.5 border-t border-gray-100 pt-3">
              {/* VIDEOS OR POINTS (21 Sep 2026). Ethan: "for the point system,
                  that if they reach, for example, 20 points, they'll get the
                  participation voucher." Only a points challenge has points. */}
              {pointsBasisAllowed && (
                <SettingRow
                  label="Earned by"
                  note={byPoints ? 'Their points total, from every rule on this challenge' : null}
                >
                  <Choice
                    label="What earns the participation reward"
                    value={byPoints ? 'points' : 'entries'}
                    onChange={(v) => onParticipationExtra({ basis: v })}
                    options={[
                      { v: 'entries', l: 'Videos posted' },
                      { v: 'points', l: 'Points scored' },
                    ]}
                  />
                </SettingRow>
              )}
              {/* THE CAP. Ethan: "only the first 30 creators can actually earn
                  that, so we're not giving out theoretically unlimited
                  vouchers." First = whoever's Nth entry went in first. */}
              <SettingRow
                label="How many"
                note={participationExtra.cap && Number(participationExtra.cap) > 0
                  ? (Number(partAmount) > 0 ? `At most ${money(symbol, Number(participationExtra.cap) * Number(partAmount))} in total` : null)
                  : 'Blank means everyone who gets there'}
              >
                <span className="text-sm text-smoke">The first</span>
                <NumberField
                  className="w-20"
                  value={participationExtra.cap}
                  onChange={(v) => onParticipationExtra({ cap: v })}
                  placeholder="all" label="Most creators who can earn the participation reward"
                />
                <span className="text-sm text-smoke">creators to get there</span>
              </SettingRow>
              <SettingRow label="Who can earn it">
                <Choice
                  label="Who can earn the participation reward"
                  value={participationExtra.scope === 'outside_prizes' ? 'outside_prizes' : 'everyone'}
                  onChange={(v) => onParticipationExtra({ scope: v })}
                  options={[
                    { v: 'outside_prizes', l: 'Outside the prize places' },
                    { v: 'everyone', l: 'Everyone, winners too' },
                  ]}
                />
              </SettingRow>
            </div>
          )}
        </RewardCard>
      )}

      {/* MOST COMMITTED. Ethan: rename "Extra awards" to "Most committed",
          because that is the only award there is, and it should not show "unless
          someone actually clicks for it". Worked out automatically at the end
          and paid with the other prizes. */}
      {onExtraAwards && mc.map((a, i) => {
        const scope = a.scope === 'anyone' ? 'anyone' : 'outside'
        return (
          <RewardCard
            key={a.id}
            icon="trophy"
            title="Most committed"
            hint={scope === 'outside'
              ? 'Whoever entered the most videos and finished outside the prize places.'
              : 'Whoever entered the most videos, wherever they finished.'}
            onRemove={() => onExtraAwards(mc.filter((_, j) => j !== i))}
          >
            <div className={GRID}>
              <span className="order-1 flex h-[42px] items-center rounded-xl bg-cloud px-3 text-sm font-medium text-smoke sm:order-none">Most videos</span>
              <input
                type="text" className="input order-3 col-span-2 !h-[42px] !py-0 sm:order-none sm:col-span-1" value={a.prize ?? ''}
                onChange={(e) => {
                  const text = e.target.value
                  setAward(i, { prize: text, amount: followAmount(a.prize, text, a.amount) })
                }}
                placeholder={`e.g. ${symbol}20 Tryp.com voucher`} aria-label="What the most committed creator gets"
              />
              <NumberField
                value={a.amount} onChange={(v) => setAward(i, { amount: v })}
                className="order-2 sm:order-none" prefix={symbol} placeholder="20" decimal label="Most committed value"
              />
              <div className="order-4 col-span-2 flex items-center sm:order-none sm:col-span-1">
                <TypeToggle value={a.type === 'cash' ? 'cash' : 'voucher'} onChange={(t) => setAward(i, { type: t })} label="Most committed type" />
              </div>
            </div>
            <div className="mt-3 space-y-2.5 border-t border-gray-100 pt-3">
              <SettingRow label="Who can win it">
                <Choice
                  label="Who can win Most committed"
                  value={scope}
                  onChange={(v) => setAward(i, { scope: v })}
                  options={[
                    { v: 'outside', l: 'Outside the prize places' },
                    { v: 'anyone', l: 'Anyone, winners too' },
                  ]}
                />
              </SettingRow>
              {scope === 'outside' && (
                <SettingRow label="Outside the top" note={`Blank means the ${placeCount || 0} paid places`}>
                  <NumberField
                    className="w-20"
                    value={a.exclude_top}
                    onChange={(v) => setAward(i, { exclude_top: v })}
                    placeholder={String(placeCount || 10)} label="Finished outside the top"
                  />
                </SettingRow>
              )}
              <p className="text-[11px] leading-snug text-smoke">
                A tie goes to the higher leaderboard position, then to whoever got there first. The results page shows who is leading.
              </p>
            </div>
          </RewardCard>
        )
      })}

      {/* THE TWO OPTIONAL REWARDS, where the list ends. Each only appears once
          asked for, and its button goes once it has. */}
      {((onParticipation && !partShown) || (onExtraAwards && mc.length === 0)) && (
      <div className="flex flex-wrap gap-2">
        {onParticipation && !partShown && (
          <button type="button" className={ADD_BTN} onClick={() => setPartOpen(true)}>
            <Icon name="plus" className="h-4 w-4" /> Reward for taking part
          </button>
        )}
        {onExtraAwards && mc.length === 0 && (
          <button type="button" className={ADD_BTN} onClick={() => onExtraAwards([newMostCommitted(symbol)])}>
            <Icon name="plus" className="h-4 w-4" /> Most committed
          </button>
        )}
      </div>
      )}
    </div>
  )
}

/**
 * THE TOTALS, DERIVED: what the challenge costs, split into cash and vouchers,
 * with the taking-part reward shown as the range it really is.
 */
export function PrizeSummary({ budget, symbol = '', cpmTarget, legacyPot = null }) {
  const { places, awards, part, min, max } = budget
  const ranged = !!part && part.each > 0
  const range = (lo, hi) => (hi == null ? `${money(symbol, lo)}+` : lo === hi ? money(symbol, lo) : `${money(symbol, lo)} to ${money(symbol, hi)}`)
  const lines = []
  if (places.cash + places.voucher > 0) {
    lines.push({
      icon: 'trophy',
      label: `${places.count} prize place${places.count === 1 ? '' : 's'}`,
      value: money(symbol, places.cash + places.voucher),
      note: places.voucher && places.cash ? `${money(symbol, places.cash)} cash, ${money(symbol, places.voucher)} vouchers` : places.voucher ? 'vouchers' : 'cash',
    })
  }
  for (const a of awards) {
    lines.push({ icon: 'star', label: a.label, value: money(symbol, a.amount), note: a.type === 'cash' ? 'cash' : 'voucher' })
  }
  if (part) {
    lines.push({
      icon: 'video',
      label: 'Taking part',
      value: range(0, part.max),
      note: `${money(symbol, part.each)} ${part.type === 'cash' ? 'cash' : 'voucher'} each, ${part.cap ? `first ${part.cap}` : part.reach != null ? `no cap, so at most ${part.reach} (every eligible creator)` : 'no limit'}${part.scope === 'outside_prizes' ? ' outside the prize places' : ', winners included'}`,
      highlight: true,
    })
  }
  const winnersNote = [
    `${places.count} place${places.count === 1 ? '' : 's'}`,
    awards.length ? `${awards.length} award${awards.length === 1 ? '' : 's'}` : null,
    part ? (part.cap ? `up to ${part.cap} taking part` : part.reach != null ? `up to ${part.reach} taking part` : 'everyone who takes part') : null,
  ].filter(Boolean).join(' + ')

  return (
    <div className="overflow-hidden rounded-2xl border border-brand/20 bg-white shadow-card">
      {/* THE HEADLINE IS THE HUB CARD'S GRADIENT (21 Sep 2026). Ethan: "a bit
          more colour on it because it should stand out more at the end, just
          like a summary of that information." It is the last thing above Save,
          so it reads as the answer to the whole form. */}
      <div className="relative grid gap-4 overflow-hidden bg-gradient-to-br from-brand to-brand-light p-4 text-white sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end sm:p-5">
        <span aria-hidden className="pointer-events-none absolute -right-14 -top-16 h-48 w-48 rounded-full bg-white/15 blur-2xl" />
        <div className="relative">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-white/85">Total prize pot</p>
          <p className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">
            {legacyPot != null ? money(symbol, legacyPot) : ranged ? range(min.total, max.total) : money(symbol, min.total)}
          </p>
          {ranged && legacyPot == null && (
            <p className="mt-1 text-xs text-white/85">
              {money(symbol, min.total)} is certain
              {max.total != null
                ? <>; at most {money(symbol, max.total)} if every eligible creator reaches the taking-part reward{part.cap ? '' : ' (no cap set, so the ceiling is the number of creators)'}.</>
                : '; the rest depends on how many creators reach the taking-part reward.'}
            </p>
          )}
        </div>
        <div className="relative flex gap-2">
          <div className="min-w-[7rem] rounded-xl bg-white/20 px-3.5 py-2.5 ring-1 ring-white/25 backdrop-blur-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/80">Cash</p>
            <p className="text-base font-bold tabular-nums">{range(min.cash, max.cash)}</p>
          </div>
          <div className="min-w-[7rem] rounded-xl bg-white/20 px-3.5 py-2.5 ring-1 ring-white/25 backdrop-blur-sm">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-white/80">Vouchers</p>
            <p className="text-base font-bold tabular-nums">{range(min.voucher, max.voucher)}</p>
          </div>
        </div>
      </div>

      {lines.length > 0 && (
        <ul className="divide-y divide-gray-100 border-t border-gray-100">
          {lines.map((l) => (
            <li key={l.label} className="flex items-center gap-3 px-4 py-2.5 text-sm sm:px-5">
              <span className={cx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', l.highlight ? 'bg-brand text-white' : 'bg-brand/10 text-brand')}>
                <Icon name={l.icon} className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="font-medium text-ink">{l.label}</p>
                <p className="text-xs text-smoke">{l.note}</p>
              </div>
              <span className="shrink-0 font-semibold tabular-nums text-ink">{l.value}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-gray-100 bg-cloud/50 px-4 py-2.5 text-xs sm:px-5">
        <span><span className="text-smoke">Winners </span><span className="font-semibold text-ink">{winnersNote || '0'}</span></span>
        <span><span className="text-smoke">CPM target </span><span className="font-semibold text-ink">{cpmTarget || '-'}</span></span>
      </div>
      {legacyPot != null && (
        <p className="border-t border-gray-100 px-4 py-2.5 text-xs text-smoke sm:px-5">
          Carried over from before values were itemised. Add a value to each prize row and this starts adding itself up.
        </p>
      )}
    </div>
  )
}
