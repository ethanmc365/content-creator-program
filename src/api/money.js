// Rewards, vouchers, invoices and the bank details behind them: the Supabase tables and functions this feature owns. Pages call these instead of
// naming tables, so a schema rename or a backend move is a change in this folder. Each accessor returns the same
// query builder / `{ data, error }` as before.
import { supabase } from '../lib/supabase'

export const makeMoneyApi = (db = supabase) => ({
  creatorPrivate: () => db.from('creator_private'),
  invoices: () => db.from('invoices'),
  rewards: () => db.from('rewards'),
  adminCombineVouchers: (args, opts) => db.rpc('admin_combine_vouchers', args, opts),
  adminSetVoucherCode: (args, opts) => db.rpc('admin_set_voucher_code', args, opts),
  adminSetVoucherUsed: (args, opts) => db.rpc('admin_set_voucher_used', args, opts),
  adminSplitVouchers: (args, opts) => db.rpc('admin_split_vouchers', args, opts),
  decideInvoice: (args, opts) => db.rpc('decide_invoice', args, opts),
  setRewardUsed: (args, opts) => db.rpc('set_reward_used', args, opts),
  submitInvoice: (args, opts) => db.rpc('submit_invoice', args, opts),
  voucherDayBoard: (args, opts) => db.rpc('voucher_day_board', args, opts),
  deleteInvoice: (args, opts) => db.rpc('delete_invoice', args, opts),
  nextInvoiceNumber: (args, opts) => db.rpc('next_invoice_number', args, opts),
  adminSetPaymentDetails: (args, opts) => db.rpc('admin_set_payment_details', args, opts),
  /** An invoice function chosen at run time (the invoice sheet's actions). */
  call: (fn, args, opts) => db.rpc(fn, args, opts),
  voucherDaysAward: (args, opts) => db.rpc('voucher_days_award', args, opts),
})

export const moneyApi = makeMoneyApi()
