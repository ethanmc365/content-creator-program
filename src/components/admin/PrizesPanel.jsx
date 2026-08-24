import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Badge, Spinner } from '../ui'
import Icon from '../Icon'
import { formatMoney } from '../../lib/utils'

// WHO GOT PAID, ON THE PAGE WHERE THEY WERE DECIDED.
//
// Publishing the winners now awards the prizes and drafts the invoices by
// itself (migration 114). This is the receipt for that: what the challenge owes,
// what has been awarded, and - the part that was missing entirely - whether
// anything is stuck. The whole failure it exists to prevent was silent: the
// challenge ended, the winners went up, and nothing at all happened next.
//
// The dry run is the source of truth for "what SHOULD exist", so this panel and
// the automatic award can never disagree about who is owed what.
export default function PrizesPanel({ challengeId, onFlash }) {
  const [rows, setRows] = useState(null)
  const [invoices, setInvoices] = useState([])
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const [{ data, error }, { data: inv }] = await Promise.all([
      supabase.rpc('award_challenge_prizes', { p_challenge_id: challengeId, p_dry_run: true }),
      supabase
        .from('invoices')
        .select('id, number, stage, amount, currency, creator_name, payment, rewards:reward_id!inner(challenge_id)')
        .eq('rewards.challenge_id', challengeId),
    ])
    if (error) return setRows([])
    setRows(data ?? [])
    setInvoices(inv ?? [])
  }, [challengeId])

  useEffect(() => { load() }, [load])

  async function awardNow() {
    setBusy(true)
    const { data, error } = await supabase.rpc('award_challenge_prizes', {
      p_challenge_id: challengeId, p_dry_run: false,
    })
    setBusy(false)
    if (error) return onFlash?.(`Could not award the prizes: ${error.message}`)
    const made = (data ?? []).filter((r) => r.outcome === 'created').length
    onFlash?.(made ? `${made} ${made === 1 ? 'prize' : 'prizes'} awarded. Cash prizes are drafts in the invoice queue.` : 'Everything was already awarded.')
    load()
  }

  if (!rows) return null
  if (!rows.length) return null

  const blocked = rows.find((r) => r.outcome === 'blocked')
  const missing = rows.filter((r) => r.outcome === 'would create')
  const skipped = rows.filter((r) => r.outcome === 'skipped')
  const cash = rows.filter((r) => r.reward_type === 'cash' && r.outcome !== 'skipped' && r.outcome !== 'blocked')
  const vouchers = rows.filter((r) => r.reward_type === 'voucher' && r.outcome !== 'skipped' && r.outcome !== 'blocked')
  const sum = (list) => list.reduce((n, r) => n + Number(r.amount || 0), 0)
  // An invoice whose payment block has no name is waiting on the creator, not
  // on us - and "approve" will refuse it, so it is worth saying here.
  const noDetails = invoices.filter((i) => !(i.payment?.name || '').trim())

  const TONE = {
    'would create': 'amber', 'already awarded': 'green', created: 'green', skipped: 'grey', blocked: 'red',
  }

  return (
    <div className="mb-8 rounded-card border border-gray-100 p-5 shadow-card sm:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">Prizes and invoices</p>
          <p className="mt-0.5 text-xs text-smoke">
            {blocked
              ? blocked.detail
              : missing.length
                ? `${missing.length} ${missing.length === 1 ? 'prize has' : 'prizes have'} not been awarded yet.`
                : `Everything is awarded: ${formatMoney(sum(cash))} in cash and ${formatMoney(sum(vouchers))} in vouchers.`}
          </p>
        </div>
        {missing.length > 0 && (
          <button onClick={awardNow} disabled={busy} className="btn-primary !py-2 text-xs">
            {busy ? <Spinner /> : `Award ${missing.length === 1 ? 'it' : 'them'} now`}
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100">
        {rows.filter((r) => r.outcome !== 'blocked').map((r, i) => (
          <div key={`${r.place}-${r.creator_id}-${i}`} className="flex items-center gap-3 border-b border-gray-50 px-4 py-2.5 last:border-0">
            <span className="w-24 shrink-0 text-xs font-semibold text-smoke">{r.place}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{r.creator_name ?? '-'}</span>
            <span className="shrink-0 text-sm font-bold tabular-nums">
              {formatMoney(Number(r.amount || 0), r.currency)}
            </span>
            <Badge tone={TONE[r.outcome] ?? 'grey'} className="!px-2 !py-0.5 !text-[10px]">
              {r.outcome === 'would create' ? 'not awarded' : r.outcome}
            </Badge>
          </div>
        ))}
      </div>

      {skipped.length > 0 && (
        <p className="mt-3 text-xs text-smoke">
          {skipped.length} skipped: {[...new Set(skipped.map((s) => s.detail))].join(' ')}
        </p>
      )}

      {invoices.length > 0 && (
        <div className="mt-4 border-t border-gray-100 pt-3">
          <p className="text-xs text-smoke">
            {invoices.length} {invoices.length === 1 ? 'invoice' : 'invoices'} raised automatically
            {' '}({invoices.map((i) => `#${i.number}`).join(', ')}) — nothing is sent until it is approved.{' '}
            <Link to="/admin/rewards" className="font-medium text-brand hover:underline">Open the queue →</Link>
          </p>
          {noDetails.length > 0 && (
            <p className="mt-2 flex items-start gap-1.5 text-xs font-medium text-brand">
              <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {noDetails.length === 1
                ? `${noDetails[0].creator_name} has not saved payment details, so their invoice cannot be approved yet.`
                : `${noDetails.map((i) => i.creator_name).join(', ')} have not saved payment details, so those invoices cannot be approved yet.`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
