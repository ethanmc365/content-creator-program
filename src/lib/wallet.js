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

/** Handed over, but with nothing on it to redeem yet. */
export const awaitingCode = (r) => isWalletVoucher(r) && !r.voucher_code?.trim()

/**
 * Split a creator's rewards into the two halves of the wallet.
 * Spendable first (newest first), then the record of what has been used.
 */
export function walletTickets(rewards) {
  const newestFirst = (a, b) =>
    new Date(b.distributed_at || 0) - new Date(a.distributed_at || 0)
  const tickets = (rewards || []).filter(isWalletVoucher)
  return {
    toSpend: tickets.filter((r) => !r.used_at).sort(newestFirst),
    spent: tickets.filter((r) => r.used_at).sort(newestFirst),
  }
}
