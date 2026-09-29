import { rewardsTotal } from './programme'

// WHAT IS IN A CREATOR'S VOUCHER WALLET.
//
// This lived inline on the Rewards page as a filter with four conditions, one
// of which was wrong: it required `voucher_code`, so a voucher the team had
// awarded but not yet typed a code into was in no list at all. Six were in
// that state in production on 29 Sep 2026 - six creators told they had won a
// voucher, opening Rewards, and not finding it.
//
// It is a function with a test now because that failure was invisible: the
// page rendered perfectly, the rows existed, and the only symptom was an
// absence. Nothing about the old code looked wrong while reading it.

/** Awarded, so it belongs to the creator - whether or not the code is written yet. */
export const isWalletVoucher = (r) =>
  !!r && r.reward_type === 'voucher' && r.status === 'distributed'

/** Handed over, but with nothing on it to redeem yet - and not one that was sent by chat,
 *  which never will have a code here and is not a job to do. */
export const awaitingCode = (r) =>
  isWalletVoucher(r) && !r.voucher_code?.trim() && r.issued_via !== 'chat'

/**
 * COMBINED VOUCHERS DRAW AS ONE TICKET (29 Sep 2026).
 *
 * Ethan: two EUR 10 vouchers from two challenges become ONE EUR 20 voucher. The
 * rows keep their own challenge and amount (so what each challenge paid out never
 * moves) and share a `voucher_group` and a code; the wallet shows the group as a
 * single ticket worth the sum, with `parts` saying what it is made of.
 * `rewardIds` is every row behind it, which is what a local state update needs.
 */
export function ticketsOf(rewards) {
  const vouchers = (rewards || []).filter(isWalletVoucher)
  const byGroup = new Map()
  const out = []
  for (const r of vouchers) {
    if (!r.voucher_group) { out.push({ ...r, rewardIds: [r.id], parts: null }); continue }
    if (!byGroup.has(r.voucher_group)) byGroup.set(r.voucher_group, [])
    byGroup.get(r.voucher_group).push(r)
  }
  for (const rows of byGroup.values()) {
    const first = [...rows].sort((a, b) => new Date(a.distributed_at || 0) - new Date(b.distributed_at || 0))[0]
    // A GROUP IN TWO CURRENCIES (1 Oct 2026: one of Jacob's vouchers is in pounds and one in
    // euros) is worth its euro total, marked as converted, never a pounds-plus-euros sum.
    const mixed = new Set(rows.map((r) => r.currency || 'EUR')).size > 1
    const total = mixed ? rewardsTotal(rows) : null
    out.push({
      ...first,
      ...(mixed ? { currency: 'EUR', converted: true } : {}),
      amount: mixed ? total.amount : rows.reduce((sum, r) => sum + Number(r.amount || 0), 0),
      rewardIds: rows.map((r) => r.id),
      parts: rows.length > 1 ? rows.map((r) => ({ id: r.id, amount: r.amount, currency: r.currency, title: r.challenges?.title || null })) : null,
      distributed_at: rows.map((r) => r.distributed_at).sort().pop(),
    })
  }
  return out
}

/**
 * Split a creator's rewards into the two halves of the wallet.
 * Spendable first (newest first), then the record of what has been used.
 */
export function walletTickets(rewards) {
  const newestFirst = (a, b) =>
    new Date(b.distributed_at || 0) - new Date(a.distributed_at || 0)
  const tickets = ticketsOf(rewards)
  return {
    toSpend: tickets.filter((r) => !r.used_at).sort(newestFirst),
    spent: tickets.filter((r) => r.used_at).sort(newestFirst),
  }
}
