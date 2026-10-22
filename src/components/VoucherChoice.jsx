import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useAuth } from '../context/AuthContext'
import Icon from './Icon'
import { Spinner } from './ui'
import { claimNag, finishNag, onNagChange, onTourRunning, releaseNag, tourRunning } from '../lib/appNag'
import { lockScroll } from '../lib/scrollLock'
import { notice } from '../lib/confirm'
import { toastSuccess } from '../lib/toast'
import { useT } from '../lib/i18n'
import { cx, formatMoney } from '../lib/utils'
import { moneyApi } from '../api/money'

// A CASH PRIZE CAN BE TAKEN AS A TRIP.COM VOUCHER WORTH A LITTLE MORE (migration 453).
//
// The server works out the value (`my_voucher_offers`, tiers the team edits in Money > Vouchers) and does the swap
// (`convert_reward_to_voucher`); this only shows the choice. The unpaid cash row is replaced by a voucher the team then
// prepares, so it lands in the same wallet as every other voucher.

export function useVoucherOffers(enabled = true) {
  const [offers, setOffers] = useState(null)
  const load = useCallback(async () => {
    const { data, error } = await moneyApi.myVoucherOffers()
    setOffers(error ? [] : data ?? [])
  }, [])
  useEffect(() => { if (enabled) load() }, [enabled, load])
  return { offers, reload: load }
}

const placeOf = (o) => (o.note || '').replace(/\s*-\s*Global Challenge$/i, '') || null

// ONE OFFER, WITH BOTH WAYS OUT. "Keep the cash" is not a button on the page card (the cash is the default, nothing to do).
function OfferBody({ offer, onDone, onKeep, busy, setBusy }) {
  const tr = useT()
  const cash = formatMoney(offer.cash_amount, offer.currency).replace(/\.00$/, '')
  const voucher = formatMoney(offer.voucher_amount, offer.currency).replace(/\.00$/, '')
  const extra = formatMoney(offer.bonus, offer.currency).replace(/\.00$/, '')

  async function take() {
    setBusy(true)
    const { error } = await moneyApi.convertRewardToVoucher({ p_reward: offer.reward_id })
    setBusy(false)
    if (error) { notice(error.message); return }
    toastSuccess(tr('Done. Your {v} voucher is being prepared.', { v: voucher }))
    onDone()
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-card border border-gray-100 bg-white px-4 py-3.5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-smoke"><Icon name="cash" className="h-4 w-4 text-brand" />{tr('Cash')}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{cash}</p>
          <p className="mt-0.5 text-xs text-smoke">{tr('Paid to your bank account by invoice.')}</p>
        </div>
        <div className="rounded-card border-2 border-brand bg-brand/5 px-4 py-3.5">
          <p className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand"><Icon name="ticket" className="h-4 w-4" />{tr('Tryp.com voucher')}</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-brand">{voucher}</p>
          <p className="mt-0.5 text-xs text-smoke">{tr('{x} more than the cash, to spend on trip.com.', { x: extra })}</p>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row-reverse">
        <button type="button" onClick={take} disabled={busy} className="btn-primary flex-1 justify-center">
          {busy ? <Spinner className="h-4 w-4" /> : tr('Take the {v} voucher', { v: voucher })}
        </button>
        <button type="button" onClick={onKeep} disabled={busy} className="btn-secondary flex-1 justify-center">{tr('Keep the cash')}</button>
      </div>
    </div>
  )
}

/** On the Rewards page: one card per cash prize that can still be swapped. Hidden when there is none. */
export function VoucherOfferCards({ offers, reload, onChanged }) {
  const tr = useT()
  const [busy, setBusy] = useState(false)
  const [kept, setKept] = useState(() => new Set())
  const list = (offers || []).filter((o) => !kept.has(o.reward_id))
  if (!list.length) return null
  return (
    <section className="mb-10 space-y-4">
      {list.map((o) => (
        <div key={o.reward_id} className="overflow-hidden rounded-card border border-brand/25 bg-white shadow-card">
          <div className="flex items-center gap-2.5 bg-gradient-to-r from-brand to-brand-light px-5 py-3 text-white">
            <Icon name="ticket" className="h-5 w-5" />
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-semibold">{tr('Prefer a voucher? You get more.')}</p>
              <p className="truncate text-xs text-white/85">{[placeOf(o), o.challenge_title].filter(Boolean).join(' · ')}</p>
            </div>
          </div>
          <div className="px-5 py-4">
            <OfferBody
              offer={o} busy={busy} setBusy={setBusy}
              onKeep={() => setKept((s) => new Set(s).add(o.reward_id))}
              onDone={() => { reload(); onChanged?.() }}
            />
          </div>
        </div>
      ))}
    </section>
  )
}

// THE END-OF-CHALLENGE ASK. Once per prize on this device, after the walkthrough, in the same queue as the other prompts.
const KEY = (id) => `tryp_voucher_choice_${id}`
const seen = (id) => { try { return !!localStorage.getItem(KEY(id)) } catch { return true } }
const markSeen = (id) => { try { localStorage.setItem(KEY(id), '1') } catch { /* private mode */ } }

export default function VoucherChoicePrompt() {
  const { user, profile } = useAuth()
  const [offer, setOffer] = useState(null)
  const [turn, setTurn] = useState(0)
  useEffect(() => onNagChange(() => setTurn((n) => n + 1)), [])
  useEffect(() => onTourRunning(() => setTurn((n) => n + 1)), [])

  useEffect(() => {
    if (offer) return undefined
    if (!user?.id || !profile || profile.status !== 'active' || profile.is_admin || profile.is_test || !profile.tour_completed_at) return undefined
    let alive = true
    const id = setTimeout(async () => {
      const { data } = await moneyApi.myVoucherOffers()
      if (!alive) return
      const next = (data || []).find((o) => !seen(o.reward_id))
      if (!next || tourRunning()) return
      if (document.querySelector('[role="dialog"]')) { setTimeout(() => alive && setTurn((n) => n + 1), 8000); return }
      if (!claimNag('voucher-choice')) return
      if (!alive) { releaseNag('voucher-choice'); return }
      markSeen(next.reward_id)
      setOffer(next)
    }, 3000)
    return () => { alive = false; clearTimeout(id) }
  }, [user?.id, profile, turn, offer])

  const close = useCallback(() => { setOffer(null); finishNag('voucher-choice') }, [])
  if (!offer) return null
  return <ChoiceCard offer={offer} onClose={close} />
}

function ChoiceCard({ offer, onClose }) {
  const tr = useT()
  const [leaving, setLeaving] = useState(false)
  const [busy, setBusy] = useState(false)
  useEffect(() => lockScroll(), [])
  const leave = () => { setLeaving(true); setTimeout(onClose, 220) }
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={tr('Choose your prize')} className="fixed inset-0 z-[90] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div className={cx('absolute inset-0 bg-ink/60 backdrop-blur-[2px] transition-opacity duration-200', leaving ? 'opacity-0' : 'opacity-100')} onClick={busy ? undefined : leave} />
      <div className={cx('relative w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-lift transition-all duration-200', leaving ? 'translate-y-4 opacity-0' : 'animate-rise')}>
        <div className="bg-gradient-to-br from-brand to-brand-light px-6 pb-5 pt-6 text-white">
          <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em]"><Icon name="trophy" className="h-4 w-4" />{offer.challenge_title || tr('Your prize')}</p>
          <h2 className="mt-2 text-[24px] font-extrabold leading-[1.1] tracking-tight">{tr('You won a prize. How would you like it?')}</h2>
          {placeOf(offer) && <p className="mt-1 text-sm text-white/90">{placeOf(offer)}</p>}
        </div>
        <div className="px-6 py-5">
          <OfferBody offer={offer} busy={busy} setBusy={setBusy} onKeep={leave} onDone={leave} />
          <p className="mt-3 text-center text-xs text-smoke">{tr('You can change your mind later from Rewards, until the cash has been sent.')}</p>
        </div>
      </div>
    </div>,
    document.body,
  )
}
