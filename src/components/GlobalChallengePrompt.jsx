import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useLocation } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import Icon from './Icon'
import FlagTile from './network/FlagTile'
import { claimNag, finishNag, onNagChange, onTourRunning, releaseNag, tourRunning } from '../lib/appNag'
import { lockScroll } from '../lib/scrollLock'
import { formatMoney, formatViews, cx } from '../lib/utils'
import { useT } from '../lib/i18n'

// "THE GLOBAL CHALLENGE IS ON", WHEN YOU OPEN THE APP (4 Oct 2026).
//
// Ethan, on getting the global challenge past 50 creators: "Maybe we should have a pop-up that shows up whenever they first open the app,
// prompting them to participate in the global challenge." 82 creators had been on the platform since it started and had not posted.
//
// It shows for a creator who has NOT entered the live worldwide challenge, at most once a day and no more than six times in all, and it
// stops for good the moment they enter. It joins the same one-ask-per-open queue as the home-screen, notifications, bank-details and
// survey asks (lib/appNag) so nobody gets two dialogs, never while the walkthrough is running, and never on the challenge page itself.
// The card says what is in it for them: where their country stands, what ends when, and - when the team has switched it on - the
// welcome voucher for a first video that passes the views.
const KEY = (id) => `tryp_gc_prompt_${id}`
const MAX_SHOWS = 6
// A ONE-TIME LOOK FOR THE TEAM (4 Oct 2026). Ethan: "push that to me one time whenever I next open the app, so I can see it and how it looks."
// The prompt is for creators who have not entered, so an admin never saw it. Once per browser, an admin sees it too (and nothing is recorded).
const ADMIN_PREVIEW = 'tryp_gc_prompt_admin_preview_v1'
const adminPreviewDone = () => { try { return !!localStorage.getItem(ADMIN_PREVIEW) } catch { return true } }
const GAP_MS = 20 * 3600 * 1000

function seen(id) { try { return JSON.parse(localStorage.getItem(KEY(id)) || 'null') || { n: 0, last: 0 } } catch { return { n: 0, last: 0 } } }
function mark(id, patch) { try { const cur = seen(id); localStorage.setItem(KEY(id), JSON.stringify({ ...cur, ...patch })) } catch { /* private mode */ } }

export default function GlobalChallengePrompt() {
  const { user, profile } = useAuth()
  const { pathname } = useLocation()
  const [card, setCard] = useState(null)
  const [turn, setTurn] = useState(0)
  useEffect(() => onNagChange(() => setTurn((n) => n + 1)), [])
  useEffect(() => onTourRunning(() => setTurn((n) => n + 1)), [])

  const blocked = /^\/(login|signup|onboarding|admin|challenges\/)/.test(pathname)
  useEffect(() => {
    if (card || blocked) return undefined
    const preview = !!profile?.is_admin && !profile?.is_test && !adminPreviewDone()
    if (!user?.id || !profile || profile.status !== 'active' || (profile.is_admin && !preview) || profile.is_test || (!preview && !profile.tour_completed_at)) return undefined
    let alive = true
    const id = setTimeout(async () => {
      // Which worldwide challenge is live?
      const { data: net } = await supabase.from('communities').select('id').eq('kind', 'network').maybeSingle()
      if (!alive || !net) return
      const { data: ch } = await supabase.from('challenges')
        .select('id, title, end_date, scoring, prize_amount, prize_currency, welcome_amount, welcome_views, status, community_id')
        .eq('community_id', net.id).eq('status', 'active').order('end_date', { ascending: false }).limit(1).maybeSingle()
      if (!alive || !ch) return
      const s = seen(ch.id)
      if (!preview && (s.stop || s.n >= MAX_SHOWS || Date.now() - s.last < GAP_MS)) return
      if (new Date(ch.end_date).getTime() < Date.now()) return
      const { count } = await supabase.from('submissions').select('id', { count: 'exact', head: true }).eq('challenge_id', ch.id).eq('creator_id', user.id)
      if (!alive) return
      if (count > 0 && !preview) { mark(ch.id, { stop: true }); return }
      if (tourRunning()) return
      if (document.querySelector('[role="dialog"]')) { setTimeout(() => alive && setTurn((n) => n + 1), 8000); return }
      if (!claimNag('global-challenge')) return
      // Where the creator's country stands, for the card. A failure only costs the line.
      const { data: board } = await supabase.rpc('challenge_market_board', { p_challenge: ch.id })
      if (!alive) { releaseNag('global-challenge'); return }
      if (preview) { try { localStorage.setItem(ADMIN_PREVIEW, '1') } catch { /* private mode */ } } else mark(ch.id, { n: s.n + 1, last: Date.now() })
      setCard({ ch, board, left: Math.max(0, Math.ceil((new Date(ch.end_date).getTime() - Date.now()) / 86400000)) })
    }, 2200)
    return () => { alive = false; clearTimeout(id) }
  }, [user?.id, profile, turn, card, blocked])

  const close = useCallback((entered) => {
    if (entered && card) mark(card.ch.id, { stop: false })
    setCard(null)
    finishNag('global-challenge')
  }, [card])

  if (!card) return null
  return <PromptCard card={card} name={(profile?.name || '').split(' ')[0]} onClose={close} />
}

function PromptCard({ card, name, onClose }) {
  const tr = useT()
  const { ch, board, left } = card
  const [leaving, setLeaving] = useState(false)
  useEffect(() => lockScroll(), [])
  const leave = (entered) => { setLeaving(true); setTimeout(() => onClose(entered), 220) }

  const markets = (board?.markets || []).filter((m) => Number(m.creators) > 0)
  const ranked = [...(board?.markets || [])].sort((a, b) => (Number(b.points) - Number(a.points)) || (Number(b.views) - Number(a.views)))
  const mine = ranked.findIndex((m) => m.mine)
  const mineRow = mine >= 0 ? ranked[mine] : null
  const total = (board?.markets || []).reduce((n, m) => n + (Number(m.creators) || 0), 0)
  const welcome = Number(ch.welcome_amount) > 0

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={ch.title} className="fixed inset-0 z-[90] flex items-end justify-center p-3 sm:items-center sm:p-6">
      <div className={cx('absolute inset-0 bg-ink/55 backdrop-blur-[2px] transition-opacity duration-200', leaving ? 'opacity-0' : 'opacity-100')} onClick={() => leave(false)} />
      <div className={cx('relative w-full max-w-md overflow-hidden rounded-[28px] bg-white shadow-lift transition-all duration-200', leaving ? 'translate-y-4 opacity-0' : 'animate-rise')}>
        <div className="brand-drift relative px-6 pb-6 pt-6 text-white">
          <span aria-hidden className="survey-orb pointer-events-none absolute -right-10 -top-12 h-44 w-44 rounded-full bg-white/20 blur-2xl" />
          <p className="relative flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-white/90"><Icon name="globe" className="h-4 w-4" />{tr('Worldwide')}</p>
          <h2 className="relative mt-2 text-[28px] font-extrabold leading-[1.05] tracking-tight">
            {name ? tr('{n}, the Global Challenge is on', { n: name }) : tr('The Global Challenge is on')}
          </h2>
          <p className="relative mt-2 text-sm text-white/90">
            {total > 0 ? tr('{n} creators have already entered, and you can feel the leaderboard moving.', { n: total }) : tr('Be the first to put your country on the board.')}
          </p>
          <div className="relative mt-4 flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full bg-white/20 px-3 py-1">{left === 1 ? tr('1 day left') : tr('{n} days left', { n: left })}</span>
            {Number(ch.prize_amount) > 0 && <span className="rounded-full bg-white/20 px-3 py-1">{tr('{a} in prizes', { a: formatMoney(ch.prize_amount, ch.prize_currency || 'EUR') })}</span>}
            <span className="rounded-full bg-white/20 px-3 py-1">{tr('Points for every video')}</span>
          </div>
        </div>

        <div className="space-y-4 px-6 py-5">
          {markets.length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Country against country')}</p>
              <ul className="space-y-1.5">
                {ranked.slice(0, 3).map((m, i) => (
                  <li key={m.id} className={cx('flex items-center gap-2.5 rounded-xl px-3 py-2', m.mine ? 'bg-brand-tint/60' : 'bg-cloud/60')}>
                    <span className="w-4 text-center text-xs font-extrabold tabular-nums text-gray-400">{i + 1}</span>
                    <FlagTile codes={m.codes} size="h-6 w-6" glyph="text-sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{m.name}{m.mine ? <span className="ml-1.5 text-[10px] font-bold uppercase text-brand">{tr('You')}</span> : null}</span>
                    <span className="shrink-0 text-xs font-bold tabular-nums text-smoke">{ch.scoring === 'points' ? `${Math.round(Number(m.points)).toLocaleString()} ${tr('pts')}` : `${formatViews(m.views)}`}</span>
                  </li>
                ))}
                {mineRow && mine > 2 && (
                  <li className="flex items-center gap-2.5 rounded-xl bg-brand-tint/60 px-3 py-2">
                    <span className="w-4 text-center text-xs font-extrabold tabular-nums text-gray-400">{mine + 1}</span>
                    <FlagTile codes={mineRow.codes} size="h-6 w-6" glyph="text-sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{mineRow.name}<span className="ml-1.5 text-[10px] font-bold uppercase text-brand">{tr('You')}</span></span>
                    <span className="shrink-0 text-xs font-bold tabular-nums text-smoke">{ch.scoring === 'points' ? `${Math.round(Number(mineRow.points)).toLocaleString()} ${tr('pts')}` : formatViews(mineRow.views)}</span>
                  </li>
                )}
              </ul>
              {mineRow && <p className="mt-2 text-xs text-smoke">{tr('{c} has {a} of {b} members in. One video from you moves it up.', { c: mineRow.name, a: mineRow.creators, b: mineRow.members || mineRow.creators })}</p>}
            </div>
          )}
          {welcome && (
            <div className="flex items-start gap-3 rounded-xl border border-brand/20 bg-brand-tint/40 px-3.5 py-3">
              <Icon name="ticket" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
              <p className="text-[13px] leading-snug text-ink">{tr('New to challenges? Your first video that passes {v} views earns a {a} Tryp.com voucher.', { v: Number(ch.welcome_views).toLocaleString(), a: formatMoney(ch.welcome_amount, ch.prize_currency || 'EUR') })}</p>
            </div>
          )}
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <Link to={`/challenges/${ch.id}?tab=brief&submit=1`} onClick={() => leave(true)} className="btn-primary flex-1 justify-center">
              <Icon name="plus" className="h-4 w-4" strokeWidth={2.4} />{tr('Add my video')}
            </Link>
            <Link to={`/challenges/${ch.id}`} onClick={() => leave(false)} className="btn-secondary flex-1 justify-center">{tr('See how it works')}</Link>
          </div>
          <button type="button" onClick={() => leave(false)} className="mx-auto block text-xs font-semibold text-smoke hover:text-ink">{tr('Maybe later')}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
