import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Icon from './Icon'
import { claimNag, finishNag, onNagChange, onTourRunning, releaseNag, tourRunning } from '../lib/appNag'
import { lockScroll } from '../lib/scrollLock'
import { useT } from '../lib/i18n'
import { cx, formatMoney } from '../lib/utils'

// "A VOUCHER DAY IS ON", THE FIRST TIME YOU OPEN THE APP THAT DAY (12 Oct 2026).
//
// Ethan: "anyone that takes part gets a 5 euro Tryp.com voucher for achieving over 5,000 views ... There should be a pop-up
// for the creators as well ... to really motivate the creators to join." The sibling of BoostPrompt: once per voucher day on
// this device, only while the day is open, only for a challenge the creator can see (RLS keeps VIPs out). A creator who has
// not entered that challenge yet is told about the joining bonus on the same card. It waits its turn in lib/appNag and for
// the walkthrough, and is never drawn on a challenge page, which already shows the day.
const KEY = (id) => `tryp_vday_prompt_${id}`
const shown = (id) => { try { return !!localStorage.getItem(KEY(id)) } catch { return true } }
const markShown = (id) => { try { localStorage.setItem(KEY(id), '1') } catch { /* private mode */ } }

export default function VoucherDayPrompt() {
  const { user, profile } = useAuth()
  const { pathname } = useLocation()
  const [card, setCard] = useState(null)
  const [turn, setTurn] = useState(0)
  useEffect(() => onNagChange(() => setTurn((n) => n + 1)), [])
  useEffect(() => onTourRunning(() => setTurn((n) => n + 1)), [])

  const blocked = /^\/(login|signup|onboarding|admin|challenges\/|vip)/.test(pathname)
  useEffect(() => {
    if (card || blocked) return undefined
    if (!user?.id || !profile || profile.status !== 'active' || profile.is_vip || profile.is_test || !profile.tour_completed_at) return undefined
    let alive = true
    const id = setTimeout(async () => {
      const nowIso = new Date().toISOString()
      const { data } = await supabase.from('challenge_voucher_days')
        .select('id, day, min_views, reward_type, amount, currency, max_winners, starts_at, ends_at, challenge:challenges!inner(id, title, status, scoring, join_bonus_points)')
        .eq('is_active', true).lte('starts_at', nowIso).gt('ends_at', nowIso)
        .eq('challenge.status', 'active').order('ends_at').limit(5)
      if (!alive) return
      const day = (data || []).find((d) => d.challenge && !shown(d.id))
      if (!day) return
      if (tourRunning()) return
      if (document.querySelector('[role="dialog"]')) { setTimeout(() => alive && setTurn((n) => n + 1), 8000); return }
      if (!claimNag('voucher-day')) return
      const { count } = await supabase.from('submissions').select('id', { count: 'exact', head: true }).eq('challenge_id', day.challenge.id).eq('creator_id', user.id)
      if (!alive) { releaseNag('voucher-day'); return }
      markShown(day.id)
      setCard({ ...day, entered: (count || 0) > 0 })
    }, 2400)
    return () => { alive = false; clearTimeout(id) }
  }, [user?.id, profile, turn, card, blocked])

  const close = useCallback(() => { setCard(null); finishNag('voucher-day') }, [])
  if (!card) return null
  return <DayCard day={card} name={(profile?.name || '').split(' ')[0]} onClose={close} />
}

function DayCard({ day, name, onClose }) {
  const tr = useT()
  const [leaving, setLeaving] = useState(false)
  useEffect(() => lockScroll(), [])
  const leave = () => { setLeaving(true); setTimeout(onClose, 220) }
  const [now] = useState(() => Date.now())
  const mins = Math.max(1, Math.ceil((Date.parse(day.ends_at) - now) / 60000))
  const leftText = mins >= 60 ? tr('{h}h {m}m left', { h: Math.floor(mins / 60), m: mins % 60 }) : tr('{m}m left', { m: mins })
  const prize = formatMoney(day.amount, day.currency)
  const join = !day.entered && day.challenge.scoring === 'points' ? Number(day.challenge.join_bonus_points) || 0 : 0
  const views = Number(day.min_views).toLocaleString()

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={tr('Voucher day')} className="fixed inset-0 z-[90] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div className={cx('absolute inset-0 bg-ink/60 backdrop-blur-[2px] transition-opacity duration-200', leaving ? 'opacity-0' : 'opacity-100')} onClick={leave} />
      <div className={cx('relative w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-lift transition-all duration-200', leaving ? 'translate-y-4 opacity-0' : 'animate-rise')}>
        <div className="relative overflow-hidden bg-gradient-to-br from-ink via-[#2b160c] to-[#6a2a08] px-6 pb-7 pt-6 text-white">
          <span aria-hidden className="boost-prompt-glow pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand/40 blur-3xl" />
          <span aria-hidden className="challenge-sheen pointer-events-none absolute inset-y-0" />
          <div className="relative flex items-start justify-between gap-4">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-light"><Icon name="ticket" className="h-4 w-4" />{day.reward_type === 'cash' ? tr('Cash day') : tr('Voucher day')}</p>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold tabular-nums">{leftText}</span>
          </div>
          <div className="relative mt-4 flex items-center gap-4">
            <span className="boost-prompt-pop flex h-20 w-20 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#ffb36b] via-brand-light to-brand text-[24px] font-black tabular-nums shadow-[0_0_0_4px_rgba(245,133,63,0.35),0_10px_28px_-6px_rgba(217,68,7,0.9)]">
              {prize.replace(/\.00$/, '')}
            </span>
            <div className="min-w-0">
              <h2 className="text-[26px] font-extrabold leading-[1.05] tracking-tight">
                {name ? tr('{who}, post today and win {p}', { who: name, p: prize }) : tr('Post today and win {p}', { p: prize })}
              </h2>
              <p className="mt-1.5 text-sm text-white/85">{tr('In {c}: any video you post today that reaches {v} views wins it.', { c: day.challenge.title, v: views })}</p>
            </div>
          </div>
        </div>
        <div className="space-y-4 px-6 py-5">
          <ul className="space-y-2 text-sm text-ink">
            <li className="flex items-start gap-2.5"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{tr('Views it reaches after today still count.')}</li>
            {day.reward_type !== 'cash' && <li className="flex items-start gap-2.5"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{tr('The voucher adds to any other Tryp.com vouchers you have.')}</li>}
            {day.max_winners ? <li className="flex items-start gap-2.5"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{tr('The first {n} to pass it win, so post early.', { n: day.max_winners })}</li> : null}
            {join > 0 && <li className="flex items-start gap-2.5"><Icon name="userPlus" className="mt-0.5 h-4 w-4 shrink-0 text-brand" /><span><strong>{tr('Not entered yet?')}</strong> {tr('Your first video also earns a joining bonus of {n} points.', { n: join })}</span></li>}
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Link to={`/challenges/${day.challenge.id}`} onClick={leave} className="btn-primary flex-1 justify-center">
              {tr('Go to the challenge')}<Icon name="chevronRight" className="h-4 w-4" />
            </Link>
            <button type="button" onClick={leave} className="btn-secondary flex-1 justify-center">{tr('Maybe later')}</button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
