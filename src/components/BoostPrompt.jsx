import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Icon from './Icon'
import { BoostDisc, boostMult } from './challenge/BoostBanner'
import { claimNag, finishNag, onNagChange, onTourRunning, releaseNag, tourRunning } from '../lib/appNag'
import { lockScroll } from '../lib/scrollLock'
import { windowPhrase } from '../lib/boostWindow'
import { useT } from '../lib/i18n'
import { cx } from '../lib/utils'

// "DOUBLE POINTS ARE LIVE", THE FIRST TIME YOU OPEN THE APP EACH DAY (7 Oct 2026).
//
// Ethan: "The creator should get a popup whenever they enter the platform for the first time each day while a 2x thing
// is live ... We're kind of encouraging them to post, with a quick link to the challenge page."
//
// Once per boost per calendar day on this device, only while the boost is running, only for a challenge the creator
// can see (RLS hides challenges from VIPs, so they never get it). It joins the one-ask-per-open queue in lib/appNag,
// waits for the walkthrough, and is never drawn on the challenge page itself, which already shows the boost.
const KEY = (id) => `tryp_boost_prompt_${id}`
const today = () => new Date().toDateString()
const shownToday = (id) => { try { return localStorage.getItem(KEY(id)) === today() } catch { return true } }
const markShown = (id) => { try { localStorage.setItem(KEY(id), today()) } catch { /* private mode */ } }

export default function BoostPrompt() {
  const { user, profile } = useAuth()
  const { pathname } = useLocation()
  const [card, setCard] = useState(null)
  const [turn, setTurn] = useState(0)
  useEffect(() => onNagChange(() => setTurn((n) => n + 1)), [])
  useEffect(() => onTourRunning(() => setTurn((n) => n + 1)), [])

  const blocked = /^\/(login|signup|onboarding|admin|challenges\/|vip)/.test(pathname)
  useEffect(() => {
    if (card || blocked) return undefined
    if (!user?.id || !profile || profile.status !== 'active' || profile.is_vip || profile.is_test) return undefined
    let alive = true
    const id = setTimeout(async () => {
      const nowIso = new Date().toISOString()
      const { data } = await supabase.from('challenge_boosts')
        .select('id, label, multiplier, starts_at, ends_at, max_extra_points, challenge:challenges!inner(id, title, status, scoring)')
        .eq('is_active', true).lte('starts_at', nowIso).gt('ends_at', nowIso)
        .eq('challenge.status', 'active').eq('challenge.scoring', 'points')
        .order('ends_at').limit(5)
      if (!alive) return
      const boost = (data || []).find((b) => b.challenge && !shownToday(b.id))
      if (!boost) return
      if (tourRunning()) return
      if (document.querySelector('[role="dialog"]')) { setTimeout(() => alive && setTurn((n) => n + 1), 8000); return }
      if (!claimNag('boost')) return
      if (!alive) { releaseNag('boost'); return }
      markShown(boost.id)
      setCard(boost)
    }, 1600)
    return () => { alive = false; clearTimeout(id) }
  }, [user?.id, profile, turn, card, blocked])

  const close = useCallback(() => { setCard(null); finishNag('boost') }, [])
  if (!card) return null
  return <BoostCard boost={card} name={(profile?.name || '').split(' ')[0]} onClose={close} />
}

function BoostCard({ boost, name, onClose }) {
  const tr = useT()
  const [leaving, setLeaving] = useState(false)
  useEffect(() => lockScroll(), [])
  const leave = () => { setLeaving(true); setTimeout(onClose, 220) }
  const n = boostMult(boost.multiplier)
  const [now] = useState(() => Date.now())
  const left = Math.max(0, Date.parse(boost.ends_at) - now)
  const hours = Math.floor(left / 3600000)
  const mins = Math.max(1, Math.ceil((left % 3600000) / 60000))
  const leftText = hours >= 24 ? tr('{d}d {h}h left', { d: Math.floor(hours / 24), h: hours % 24 }) : hours > 0 ? tr('{h}h {m}m left', { h: hours, m: mins }) : tr('{m}m left', { m: mins })

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={tr('{n} points are live', { n })} className="fixed inset-0 z-[90] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div className={cx('absolute inset-0 bg-ink/60 backdrop-blur-[2px] transition-opacity duration-200', leaving ? 'opacity-0' : 'opacity-100')} onClick={leave} />
      <div className={cx('relative w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-lift transition-all duration-200', leaving ? 'translate-y-4 opacity-0' : 'animate-rise')}>
        <div className="relative overflow-hidden bg-gradient-to-br from-ink via-[#2b160c] to-[#6a2a08] px-6 pb-7 pt-6 text-white">
          <span aria-hidden className="boost-prompt-glow pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-brand/40 blur-3xl" />
          <span aria-hidden className="challenge-sheen pointer-events-none absolute inset-y-0" />
          <div className="relative flex items-start justify-between gap-4">
            <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-brand-light"><Icon name="fire" className="h-4 w-4" />{tr('Live now')}</p>
            <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-bold tabular-nums">{leftText}</span>
          </div>
          <div className="relative mt-4 flex items-center gap-4">
            <span className="boost-prompt-pop">
              <BoostDisc multiplier={boost.multiplier} live className="h-20 w-20 text-[30px]" />
            </span>
            <div className="min-w-0">
              <h2 className="text-[26px] font-extrabold leading-[1.05] tracking-tight">
                {name ? tr('{who}, {n} points are live', { who: name, n }) : tr('{n} points are live', { n })}
              </h2>
              <p className="mt-1.5 text-sm text-white/85">{tr('Videos posted {d} count {n} in {c}.', { d: windowPhrase(boost.starts_at, boost.ends_at, tr), n, c: boost.challenge.title })}</p>
            </div>
          </div>
        </div>
        <div className="space-y-4 px-6 py-5">
          <ul className="space-y-2 text-sm text-ink">
            <li className="flex items-start gap-2.5"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{tr('Everything the video earns is multiplied: its view points and the bonuses you claim on it.')}</li>
            {boost.max_extra_points ? <li className="flex items-start gap-2.5"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{tr('Up to {p} extra points each, then your points carry on as normal.', { p: boost.max_extra_points })}</li> : null}
            <li className="flex items-start gap-2.5"><Icon name="check" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />{tr('Post it, then enter the link on the challenge page.')}</li>
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Link to={`/challenges/${boost.challenge.id}`} onClick={leave} className="btn-primary flex-1 justify-center">
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
