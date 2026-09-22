// WHAT A CHALLENGE HAS COST SO FAR, AND WHAT EACH 1,000 VIEWS COST.
//
// cash      the challenge's cash prize pot (every paid place, won or not yet)
// vouchers  taking-part rewards EARNED so far (challenge_prize_standings)
// awards    extra awards (Most committed etc.) earned so far
// pot       cash + awards; spend = pot + vouchers
// cpm       spend / (views / 1000), or null with no views - "not measured" is
//           never "measured as zero" (see the analytics notes).
export function challengeSpend(challenge, standings = [], totalViews = 0) {
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
  const pot = cash + awards
  const spend = pot + vouchers
  const views = Number(totalViews) || 0
  return {
    cash,
    awards,
    pot,
    vouchers,
    voucherCount: partRows.length,
    spend,
    cpm: views > 0 ? spend / (views / 1000) : null,
  }
}
