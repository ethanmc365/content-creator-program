// WHAT A CHALLENGE HAS COST SO FAR, AND WHAT EACH 1,000 VIEWS COST.
//
// cash      the challenge's cash prize pot (every paid place, won or not yet)
// vouchers  taking-part rewards EARNED so far (challenge_prize_standings)
// awards    extra awards (Most committed etc.) earned so far
// extras    rewards ALREADY CREATED while it runs: Video of the Week and voucher days (`rewards.prize_slot` 'weekly' /
//           'voucher_day'). 20 Oct 2026, Ethan: "Ensure that the CPM calculation with the views is also considering the
//           vouchers and not just the cash." The taking-part vouchers always were; these two were not, so a running
//           challenge with a weekly prize looked cheaper than it was. Pass the challenge's reward rows to count them.
// pot       cash + awards; spend = pot + vouchers + extras
// cpm       spend / (views / 1000), or null with no views - "not measured" is
//           never "measured as zero" (see the analytics notes).
export const EXTRA_SLOTS = new Set(['weekly', 'voucher_day'])

export function challengeSpend(challenge, standings = [], totalViews = 0, rewards = []) {
  const cash = Number(challenge?.prize_amount) || 0
  const earned = (standings || []).filter((r) => r?.status === 'earned')
  const sum = (rows) => rows.reduce((n, r) => n + (Number(r.amount) || 0), 0)
  const partRows = earned.filter((r) => r.slot === 'participation')
  const awardRows = earned.filter((r) => typeof r.slot === 'string' && r.slot.startsWith('award:'))
  // A standings row may carry no amount (a legacy free-text prize); fall back
  // to the challenge's structured voucher amount.
  const each = Number(challenge?.participation_amount) || 0
  const vouchers = partRows.reduce((n, r) => n + (Number(r.amount) || each), 0)
  const awards = sum(awardRows)
  const live = (rewards || []).filter((r) => EXTRA_SLOTS.has(r?.prize_slot) && r?.status !== 'cancelled')
  const weekly = sum(live.filter((r) => r.prize_slot === 'weekly'))
  const voucherDays = sum(live.filter((r) => r.prize_slot === 'voucher_day'))
  const extras = weekly + voucherDays
  const pot = cash + awards
  const spend = pot + vouchers + extras
  const views = Number(totalViews) || 0
  return {
    cash,
    awards,
    pot,
    vouchers,
    voucherCount: partRows.length,
    weekly,
    voucherDays,
    extras,
    spend,
    cpm: views > 0 ? spend / (views / 1000) : null,
  }
}
