import Icon from '../Icon'
import { Select, Toggle } from '../ui'
import { cx, formatMoney } from '../../lib/utils'
import { pickClass } from '../../lib/pick'
import { cleanRoundEnds, challengeSpan, weeklyRounds } from '../../lib/weekly'
import { addDays, dayLabel } from '../../lib/zonedDate'

// VIDEO OF THE WEEK, ON THE CHALLENGE FORM (19 Oct 2026, rebuilt 20 Oct). Off until it has an amount. The most viewed
// video posted in each round wins it; on a split challenge each group has its own.
//
// 20 Oct, Ethan: the switch was broken AGAIN ("a recurring issue... ensure that this doesn't happen again"). This card
// had its own copy of the switch, with a knob that had no `left`, so it sat wherever the button centred it and slid off
// the end of the track. It uses the ONE `Toggle` now, and `switches.test.js` fails the build if anybody hand-rolls one.
//
// "I like how you show round 1, round 2, round 3, round 4, but I would make it even clearer and have the ability to
// adjust how it is." So every round is a row with its own days and prize, and "Custom" lets you move where each round
// ends, add one or merge one away. Rounds are whole days in the challenge's clock (migration 442).
//
// "At the end of the week, it will pay out the reward or create the reward that I can then pay out." `auto_award`:
// when a round is frozen (its views read one last time) the reward is created by itself, owed on Rewards & Payouts.

const STEPS = [
  { key: 7, label: 'Every week' },
  { key: 5, label: 'Every 5 days' },
  { key: 'custom', label: 'Custom rounds' },
]

export default function WeeklyPrizeFields({ value, onChange, symbol = '€', currency = 'EUR', start, end, tz = 'Europe/London', boards = 1, live = false }) {
  const on = !!value
  const w = value || { amount: 10, type: 'voucher', every_days: 7, auto_award: true }
  const span = challengeSpan(start, end, tz)
  const custom = Array.isArray(w.round_ends)
  const rounds = on ? weeklyRounds(start, end, w.every_days, { tz, roundEnds: custom ? w.round_ends : null }) : []
  const set = (patch) => onChange({ ...w, currency, ...patch })
  const amount = Number(w.amount) || 0
  const total = amount * rounds.length * Math.max(1, boards)
  const autoAward = w.auto_award !== false

  // Custom rounds are stored as the last day of every round but the final one.
  const ends = custom ? cleanRoundEnds(w.round_ends, span) : []
  const setEnds = (next) => set({ round_ends: [...new Set(next)].sort() })
  function pickStep(k) {
    if (k === 'custom') {
      // Start from what is on screen, so switching to Custom changes nothing until you move a day.
      set({ round_ends: rounds.slice(0, -1).map((r) => r.lastDay) })
    } else {
      const rest = { ...w }
      delete rest.round_ends
      onChange({ ...rest, currency, every_days: k })
    }
  }
  function addRound() {
    // Split the longest round in two.
    const longest = rounds.reduce((a, b) => (b.days > a.days ? b : a), rounds[0])
    if (!longest || longest.days < 2) return
    setEnds([...ends, addDays(longest.startDay, Math.floor(longest.days / 2) - 1)])
  }
  const stepKey = custom ? 'custom' : Number(w.every_days) === 5 ? 5 : 7

  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name="fire" className="h-4 w-4 text-brand" />Video of the Week</p>
          <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-smoke">
            The most viewed video posted in each round wins a prize on top of everything else.{boards > 1 ? ' Each group has its own winner.' : ''} Views are read one last time when a round ends.
          </p>
        </div>
        <Toggle on={on} onChange={(next) => onChange(next ? { ...w, currency } : null)} label="Video of the Week" className="mt-0.5" />
      </div>

      {on && (
        <div className="mt-4 space-y-4 animate-fade-up">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[auto_minmax(0,1fr)]">
            <div>
              <p className="mb-1 text-[11px] font-semibold text-smoke">Prize each round</p>
              <div className="flex flex-wrap items-center gap-2">
                <label className="flex h-9 items-center gap-1 rounded-xl border border-gray-200 bg-white px-3 text-sm font-semibold focus-within:border-brand">
                  <span className="text-smoke">{symbol}</span>
                  <input
                    className="w-12 bg-transparent text-center tabular-nums outline-none" inputMode="decimal" aria-label="Prize per round"
                    value={w.amount ?? ''} onChange={(e) => set({ amount: e.target.value.replace(/[^\d.]/g, '').slice(0, 6) })}
                  />
                </label>
                {[['voucher', 'Tryp.com voucher', 'Voucher'], ['cash', 'Cash', 'Cash']].map(([k, label, short]) => (
                  <button key={k} type="button" aria-pressed={w.type === k} onClick={() => set({ type: k })} className={cx('h-9 rounded-xl border px-3.5 text-xs font-semibold', pickClass(w.type === k))}>
                    <span className="sm:hidden">{short}</span><span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="mb-1 text-[11px] font-semibold text-smoke">Rounds</p>
              <div className="flex flex-wrap gap-2">
                {STEPS.map((s) => (
                  <button key={s.key} type="button" aria-pressed={stepKey === s.key} onClick={() => pickStep(s.key)} className={cx('h-9 rounded-xl border px-3.5 text-xs font-semibold', pickClass(stepKey === s.key))}>{s.label}</button>
                ))}
              </div>
            </div>
          </div>

          {rounds.length > 0 ? (
            <div className="overflow-hidden rounded-xl border border-gray-100">
              <ol className="divide-y divide-gray-100">
                {rounds.map((r, i) => {
                  const last = i === rounds.length - 1
                  // A round's last day can move between the day after the previous round starts and the day before the
                  // next round ends, so no round is ever empty.
                  const lo = r.startDay
                  const hi = last ? null : addDays(rounds[i + 1].lastDay, -1)
                  const options = []
                  if (custom && !last) {
                    for (let d = lo; d <= hi; d = addDays(d, 1)) options.push({ value: d, label: dayLabel(d) })
                  }
                  return (
                    <li key={r.round} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 py-2.5 sm:px-4">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-brand text-xs font-bold text-white">{r.round}</span>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-1.5 text-sm font-semibold text-ink">
                          <span>{dayLabel(r.startDay)}</span>
                          <Icon name="chevronRight" className="h-3.5 w-3.5 text-smoke" />
                          {custom && !last ? (
                            <Select
                              variant="chip" search={false} ariaLabel={`Last day of round ${r.round}`}
                              value={r.lastDay} options={options}
                              onChange={(d) => setEnds(ends.map((e) => (e === r.lastDay ? d : e)))}
                            />
                          ) : <span>{dayLabel(r.lastDay)}</span>}
                        </div>
                        <p className="text-xs text-smoke">{r.days === 1 ? '1 day' : `${r.days} days`} · winner picked {dayLabel(addDays(r.lastDay, 1))}</p>
                      </div>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-ink">{amount > 0 ? formatMoney(amount, currency) : '-'}</span>
                      {custom && !last && rounds.length > 1 && (
                        <button type="button" onClick={() => setEnds(ends.filter((e) => e !== r.lastDay))} aria-label={`Merge round ${r.round} into the next`} title="Merge into the next round"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-smoke transition-colors hover:bg-red-50 hover:text-red-600">
                          <Icon name="close" className="h-4 w-4" />
                        </button>
                      )}
                    </li>
                  )
                })}
              </ol>
              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 bg-cloud/50 px-3 py-2.5 sm:px-4">
                <p className="text-xs text-smoke">
                  <span className="font-semibold text-ink">{rounds.length} {rounds.length === 1 ? 'round' : 'rounds'}</span>
                  {span && <> over {span.days} days</>}
                  {amount > 0 && <> · <span className="font-semibold text-ink">{formatMoney(total, currency)}</span> in all{boards > 1 ? ` (${boards} groups)` : ''}</>}
                </p>
                {custom && (
                  <button type="button" onClick={addRound} disabled={!rounds.some((r) => r.days >= 2)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-brand transition-colors hover:bg-brand-tint disabled:opacity-40">
                    <Icon name="plus" className="h-3.5 w-3.5" />Add a round
                  </button>
                )}
              </div>
            </div>
          ) : (
            <p className="rounded-xl border border-dashed border-gray-200 px-3 py-3 text-xs text-smoke">Set the start and end dates to see the rounds.</p>
          )}
          {live && custom && <p className="text-xs text-smoke">The challenge is running: only move rounds that have not ended yet, or the winners already chosen stop matching their round.</p>}

          <div className="flex items-start justify-between gap-3 rounded-xl bg-cloud/60 px-3 py-3 sm:px-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-ink">Create the reward by itself</p>
              <p className="mt-0.5 text-xs leading-relaxed text-smoke">
                {autoAward
                  ? 'When a round ends and its views are read, the winner gets the reward straight away. It waits on Rewards & Payouts as owed, for you to pay out, and you get a notification.'
                  : 'Off: the winner waits on the results page until you check the video and press Award.'}
              </p>
            </div>
            <Toggle on={autoAward} onChange={(next) => set({ auto_award: next })} label="Create the reward by itself" className="mt-0.5" />
          </div>
        </div>
      )}
    </div>
  )
}
