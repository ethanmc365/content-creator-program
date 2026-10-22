import { useEffect, useState } from 'react'
import Icon from '../Icon'
import { Spinner, Toggle } from '../ui'
import { notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { formatMoney } from '../../lib/utils'
import { settingsApi } from '../../api/settings'
import { bonusFor, useVoucherBonus, VOUCHER_BONUS_KEY as KEY } from '../../lib/voucherBonus'

// THE BONUS FOR TAKING A VOUCHER INSTEAD OF CASH (migration 453, app_settings 'voucher_choice_bonus').
//
// A creator who wins a cash prize is offered a Tryp.com voucher worth the cash plus a bonus, so the voucher is the better
// deal. The bonus is the one on the HIGHEST tier whose "from" is at or below the cash amount: with 0 -> 5 and 100 -> 10,
// EUR 30 and EUR 99 get +5 and EUR 100 and above get +10. The server works the numbers out, so what you save here is
// what creators are offered from the next page load.
const euro = (n) => formatMoney(n, 'EUR').replace(/\.00$/, '')

export default function VoucherBonusCard() {
  const [saved, setSaved] = useVoucherBonus()
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  useEffect(() => { if (saved && !draft) setDraft(JSON.parse(JSON.stringify(saved))) }, [saved, draft])
  if (!draft) return <div className="card mb-6 h-24 animate-pulse" />

  const dirty = JSON.stringify(draft) !== JSON.stringify(saved)
  const setTier = (i, patch) => setDraft((d) => ({ ...d, tiers: d.tiers.map((t, j) => (j === i ? { ...t, ...patch } : t)) }))

  async function save() {
    const tiers = draft.tiers
      .map((t) => ({ from: Number(t.from), bonus: Number(t.bonus) }))
      .sort((a, b) => a.from - b.from)
    if (tiers.some((t) => !Number.isFinite(t.from) || !Number.isFinite(t.bonus) || t.from < 0 || t.bonus < 0)) {
      notice('Every tier needs a "from" amount and a bonus, neither below 0.')
      return
    }
    if (new Set(tiers.map((t) => t.from)).size !== tiers.length) {
      notice('Two tiers start at the same amount. Each "from" amount can only appear once.')
      return
    }
    setBusy(true)
    const value = { enabled: !!draft.enabled, tiers }
    const { error } = await settingsApi.appSettings().upsert({ key: KEY, value, updated_at: new Date().toISOString() })
    setBusy(false)
    if (error) { notice(`Could not save: ${error.message}`); return }
    setSaved(value)
    setDraft(JSON.parse(JSON.stringify(value)))
    toastSuccess('Saved. Creators see the new amounts straight away.')
  }

  // A worked example per tier, so "from 100, +10" reads as what a creator sees.
  const examples = [30, 40, 50, 100, 150].map((n) => ({ n, b: bonusFor(draft, n) }))

  return (
    <section className="card mb-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-base font-semibold"><Icon name="ticket" className="h-4 w-4 text-brand" />Voucher instead of cash</h2>
          <p className="mt-1 text-sm text-smoke">
            A creator who wins a cash prize can take a Tryp.com voucher instead, worth the cash plus a bonus. Switching it off hides the offer; you can still convert a prize by hand on the Cash tab at any value.
          </p>
        </div>
        <Toggle on={draft.enabled} onChange={(v) => setDraft((d) => ({ ...d, enabled: v }))} label="Offer a voucher instead of cash" />
      </div>

      <div className={draft.enabled ? 'mt-4' : 'mt-4 opacity-50'}>
        <div className="space-y-2">
          {draft.tiers.map((t, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-smoke">Prizes from</span>
              <span className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-smoke">€</span>
                <input type="number" min="0" step="1" inputMode="decimal" className="input !w-28 !pl-7" value={t.from} onChange={(e) => setTier(i, { from: e.target.value })} aria-label="From amount" />
              </span>
              <span className="text-smoke">get a bonus of</span>
              <span className="relative"><span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-smoke">+€</span>
                <input type="number" min="0" step="1" inputMode="decimal" className="input !w-28 !pl-9" value={t.bonus} onChange={(e) => setTier(i, { bonus: e.target.value })} aria-label="Bonus" />
              </span>
              <button type="button" onClick={() => setDraft((d) => ({ ...d, tiers: d.tiers.filter((_, j) => j !== i) }))} className="btn-ghost !px-2 !py-1 text-xs" aria-label="Remove tier">Remove</button>
            </div>
          ))}
        </div>
        <button type="button" onClick={() => setDraft((d) => ({ ...d, tiers: [...d.tiers, { from: '', bonus: '' }] }))} className="btn-secondary mt-3 !py-2 text-xs">+ Add a tier</button>

        <div className="mt-4 flex flex-wrap gap-2">
          {examples.map(({ n, b }) => (
            <span key={n} className="rounded-full bg-cloud px-3 py-1 text-xs font-medium tabular-nums text-ink">{euro(n)} cash → <strong>{euro(n + b)}</strong> voucher</span>
          ))}
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button type="button" onClick={save} disabled={!dirty || busy} className="btn-primary !py-2 text-sm">{busy ? <Spinner className="h-4 w-4" /> : 'Save'}</button>
        {dirty && <button type="button" onClick={() => setDraft(JSON.parse(JSON.stringify(saved)))} className="btn-ghost !py-2 text-sm">Undo</button>}
      </div>
    </section>
  )
}
