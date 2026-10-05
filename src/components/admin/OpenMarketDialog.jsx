import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Modal, Select, Spinner } from '../ui'
import Icon from '../Icon'
import FlagStack from '../network/FlagStack'
import { supabase } from '../../lib/supabase'
import { useCommunity } from '../../context/CommunityContext'
import { notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { cx } from '../../lib/utils'
import { vipRpc } from '../../lib/vip'
import { useT } from '../../lib/i18n'

// "OPEN ANOTHER" OPENS SOMETHING (2 Oct 2026).
//
// Ethan: "when I click open another beside markets, it just opens up the page with the markets. Here is where we should
// have the function to create a new community market or VIP market on the platform ... everything is automated and
// works correctly."
//
// So the link is a choice of two. A COMMUNITY MARKET goes to the existing five-step wizard (/global/settings, opened
// straight onto it): one `create_market` call makes the market, its rooms, its leads and its flag. A VIP MARKET is
// one short form here, because a VIP market lives INSIDE a community market: `vip_open_programme` makes the programme,
// its VIP room, its VIP announcements room and the current month (the worldwide VIP lounge is gone, 5 Oct 2026) - and the
// month-end, view-reading, nudges, digest, milestones and perks jobs pick it up on their next tick, because they
// walk every programme rather than naming them. The one VIP sign-up link already sends a creator to the VIP market of
// the country they live in, so a new market needs no link of its own.
const AUTOMATIC = [
  'A VIP room and a VIP announcements room for the market',
  'The worldwide VIP room and announcements, shared by every VIP market',
  'This month opened, with views read every few hours',
  'Month end: a final reading, statements drafted, invoices once approved',
  'Nudges, the weekly digest, milestones and perks, every day',
  'The one VIP sign-up link sends creators living there straight in',
]

export default function OpenMarketDialog({ open, onClose }) {
  const tr = useT()
  const navigate = useNavigate()
  const { chapters } = useCommunity()
  const [kind, setKind] = useState(null)
  const [taken, setTaken] = useState(null)
  const [f, setF] = useState({ market: '', name: '', cpm: '0.25', cap: '', budget: '', tagline: '', welcome: '' })
  const [busy, setBusy] = useState(false)
  const set = (patch) => setF((x) => ({ ...x, ...patch }))

  // Which markets already have a VIP market (one each).
  useEffect(() => {
    if (!open || kind !== 'vip' || taken) return
    supabase.from('vip_programmes').select('community_id').then(({ data }) => setTaken(new Set((data || []).map((r) => r.community_id))))
  }, [open, kind, taken])

  const free = (chapters || []).filter((c) => !c.retired_at && !taken?.has(c.id))
  const picked = free.find((c) => c.id === f.market) || null
  const cpm = Number(String(f.cpm).replace(',', '.'))
  const valid = !!picked && Number.isFinite(cpm) && cpm >= 0

  function close() { setKind(null); setBusy(false); onClose() }

  async function openVip() {
    setBusy(true)
    try {
      const num = (v) => (String(v).trim() === '' ? null : Number(String(v).replace(',', '.')))
      await vipRpc('vip_open_programme', {
        p_community: picked.id,
        p_name: f.name.trim() || `VIP ${picked.name}`,
        p_cpm: cpm,
        p_tiers: null,
        p_monthly_cap: num(f.cap),
        p_min_payout: 0,
        p_budget: num(f.budget),
        p_tagline: f.tagline.trim() || null,
        p_welcome: f.welcome.trim() || null,
      })
      toastSuccess(tr('{m} is open. Add VIPs from its Members tab.', { m: f.name.trim() || `VIP ${picked.name}` }))
      close()
      navigate('/vip?mode=tools&tab=members')
    } catch (e) { notice(e.message) } finally { setBusy(false) }
  }

  return (
    <Modal open={open} onClose={close} title={kind === 'vip' ? tr('Open a VIP market') : tr('Open another market')} wide={kind === 'vip'}>
      {kind !== 'vip' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { key: 'market', icon: 'globe', title: tr('A community market'), body: tr('A new country or region with its own rooms, challenges, leads and members. Creators living there can join it.') },
            { key: 'vip', icon: 'star', title: tr('A VIP market'), body: tr('Creators paid by the views they bring, inside one of your markets, with their own rooms, payouts and month end.') },
          ].map((o, i) => (
            <button
              key={o.key}
              type="button"
              onClick={() => (o.key === 'market' ? (close(), navigate('/global/settings?new=market')) : setKind('vip'))}
              className="group flex animate-fade-up flex-col items-start gap-3 rounded-2xl border border-gray-100 bg-white p-5 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lift"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-brand-light text-white shadow-card transition-transform duration-200 group-hover:scale-105">
                <Icon name={o.icon} className="h-5 w-5" />
              </span>
              <span className="text-[15px] font-bold text-ink">{o.title}</span>
              <span className="text-[13px] leading-relaxed text-smoke">{o.body}</span>
              <span className="mt-auto inline-flex items-center gap-1 text-xs font-semibold text-brand">{tr('Start')}<Icon name="chevronRight" className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" /></span>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4 animate-tab-in">
          <button type="button" onClick={() => setKind(null)} className="inline-flex items-center gap-1 text-xs font-semibold text-smoke transition-colors hover:text-brand">
            <Icon name="chevronLeft" className="h-3.5 w-3.5" />{tr('Back')}
          </button>
          <label className="block">
            <span className="label">{tr('In which market')}</span>
            {taken === null ? <div className="input flex items-center gap-2 text-smoke"><Spinner className="h-4 w-4" />{tr('Loading')}</div> : free.length === 0 ? (
              <p className="rounded-xl bg-cloud px-4 py-3 text-sm text-smoke">{tr('Every market already has a VIP market. Open a community market first.')}</p>
            ) : (
              <Select
                variant="field"
                portal
                value={f.market}
                placeholder={tr('Choose a market')}
                ariaLabel={tr('In which market')}
                onChange={(v) => { const c = free.find((x) => x.id === v); set({ market: v, name: f.name || (c ? `VIP ${c.name}` : '') }) }}
                options={free.map((c) => ({ value: c.id, label: c.name, icon: <FlagStack codes={c.country_codes} className="text-[14px]" />, hint: c.currency }))}
              />
            )}
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="label">{tr('Name')}</span><input className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={picked ? `VIP ${picked.name}` : 'VIP'} /></label>
            <label className="block"><span className="label">{tr('Rate per 1,000 views')} {picked ? `(${picked.currency || 'EUR'})` : ''}</span><input className="input" inputMode="decimal" value={f.cpm} onChange={(e) => set({ cpm: e.target.value })} /></label>
            <label className="block"><span className="label">{tr('Monthly cap per creator')}</span><input className="input" inputMode="decimal" value={f.cap} onChange={(e) => set({ cap: e.target.value })} placeholder={tr('None')} /></label>
            <label className="block"><span className="label">{tr('Monthly budget')}</span><input className="input" inputMode="decimal" value={f.budget} onChange={(e) => set({ budget: e.target.value })} placeholder={tr('Optional')} /></label>
          </div>
          <label className="block"><span className="label">{tr('Tagline')}</span><input className="input" maxLength={80} value={f.tagline} onChange={(e) => set({ tagline: e.target.value })} placeholder={tr('Optional, shown on the VIP page')} /></label>
          <label className="block"><span className="label">{tr('Welcome message')}</span><textarea className="input min-h-[4rem] resize-none" value={f.welcome} onChange={(e) => set({ welcome: e.target.value })} placeholder={tr('Optional, sent to each new VIP')} /></label>

          <div className="rounded-2xl bg-cloud/70 p-4">
            <p className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-gray-400">{tr('Set up automatically')}</p>
            <ul className="space-y-1.5">
              {AUTOMATIC.map((line, i) => (
                <li key={line} className="flex animate-fade-up items-start gap-2 text-[13px] text-ink" style={{ animationDelay: `${i * 40}ms` }}>
                  <Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand" strokeWidth={2.4} />{tr(line)}
                </li>
              ))}
            </ul>
            <p className="mt-3 text-[11px] text-smoke">{tr('Rates per creator, rate steps, bonuses, perks and terms can all be changed afterwards in the VIP tools.')}</p>
          </div>

          <button type="button" onClick={openVip} disabled={!valid || busy} className={cx('btn-primary w-full justify-center', (!valid || busy) && 'opacity-60')}>
            {busy ? <Spinner className="h-4 w-4" /> : <Icon name="star" className="h-4 w-4" />}{tr('Open the VIP market')}
          </button>
        </div>
      )}
    </Modal>
  )
}
