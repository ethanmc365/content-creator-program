import { Suspense, useEffect, useState } from 'react'
import { lazyRoute } from '../../lib/lazyRoute'
import { createPortal } from 'react-dom'
import { format } from 'date-fns'
import Icon from '../Icon'
import { dateLocale } from '../../lib/utils'
import { lockScroll } from '../../lib/scrollLock'
import { useT } from '../../lib/i18n'

// THE RECAP IS COMING (1 Oct 2026).
//
// Ethan: the Wrapped-style recap is built "but we don't have a place where we'll actually show it
// to the creators yet ... on their actual profile page ... above the About section and the Your
// Local Time section, so it's spanning across both those columns ... a nice Tryp.com gradient
// that's constantly animated and glowing ... clicking on it will just show a pop-up with the lock
// symbol on it, the way we designed it ... to create some awareness of it before then."
//
// So: one banner on every creator's profile, the brand gradient drifting and breathing, with a
// bar that fills through the year towards the day it opens. Pressing it opens the locked card
// from the recap itself (`YearInReviewLocked`, loaded only when asked for, so the profile does
// not carry the recap's code). After OPENS_ON it is still a banner; turning it into the real
// recap is the December release.
const YEAR = 2026
const OPENS_ON = new Date(YEAR, 11, 3) // 3 December
const YEAR_START = new Date(YEAR, 0, 1)

// WHEN CREATORS SEE IT (2 Oct 2026): from 18 November, about two weeks of build-up before it opens
// on 3 December, until the end of the year. 'before' | 'on' | 'after'.
const SHOW_FROM = new Date(YEAR, 10, 18)
const SHOW_UNTIL = new Date(YEAR + 1, 0, 1)
export function recapTeaserWindow(now = new Date()) {
  if (now < SHOW_FROM) return 'before'
  if (now >= SHOW_UNTIL) return 'after'
  return 'on'
}

const Locked = lazyRoute(() => import('./YearInReview').then((m) => (m ? { default: m.YearInReviewLocked } : m)))

export default function RecapTeaser({ name, isMe, preview = false }) {
  const tr = useT()
  const [open, setOpen] = useState(false)
  const [now] = useState(() => Date.now())
  const pct = Math.min(1, Math.max(0.02, (now - YEAR_START) / (OPENS_ON - YEAR_START)))
  const opensOn = format(OPENS_ON, 'd MMMM', { locale: dateLocale() })
  const first = (name || '').split(' ')[0]

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="recap-teaser group relative block w-full overflow-hidden rounded-card px-4 py-3 text-left text-white sm:px-5 sm:py-3.5"
      >
        <span aria-hidden className="recap-sheen pointer-events-none absolute inset-0" />
        <span className="relative flex items-center gap-3">
          <span className="recap-lock flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20 ring-1 ring-white/35 backdrop-blur-sm">
            <Icon name="lock" className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] font-bold uppercase tracking-[0.16em] text-white/80">
              {tr('Year in review')} · {YEAR}
              {preview && <span className="ml-2 rounded bg-white/25 px-1.5 py-0.5 normal-case tracking-normal">{tr('Preview: creators see this from 18 November')}</span>}
            </span>
            <span className="block text-sm font-bold leading-snug sm:text-[15px]">
              {isMe ? tr('Your {y} recap is loading', { y: YEAR }) : tr("{name}'s {y} recap is loading", { name: first, y: YEAR })}
            </span>
            <span className="mt-1.5 flex items-center gap-2.5">
              <span className="h-1.5 max-w-[14rem] flex-1 overflow-hidden rounded-full bg-white/25">
                <span className="recap-bar block h-full rounded-full bg-white" style={{ width: `${Math.round(pct * 100)}%` }} />
              </span>
              <span className="shrink-0 text-[11px] font-semibold text-white/90">{tr('Available on {d}', { d: opensOn })}</span>
            </span>
          </span>
          <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-white/80 transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
      </button>
      {open && <LockedPopup onClose={() => setOpen(false)} opensOn={opensOn} />}
    </>
  )
}

function LockedPopup({ onClose, opensOn }) {
  const tr = useT()
  const [vh, setVh] = useState(() => window.innerHeight)
  useEffect(() => {
    const release = lockScroll()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    const onResize = () => setVh(window.innerHeight)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onResize)
    return () => { release(); document.removeEventListener('keydown', onKey); window.removeEventListener('resize', onResize) }
  }, [onClose])
  // The card is 9:16; it is as big as fits the screen, never more than 400 wide.
  const w = Math.min(400, Math.round((vh - 120) * (9 / 16)))
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={tr('Year in review')}>
      <button type="button" aria-label={tr('Close')} onClick={onClose} className="scrim-in absolute inset-0 bg-ink/70 backdrop-blur-sm" />
      <div className="relative animate-pop-in" style={{ width: w }}>
        <div className="overflow-hidden rounded-[28px] shadow-2xl">
          <Suspense fallback={<div className="brand-drift aspect-[9/16] w-full" />}>
            <Locked year={YEAR} opensOn={opensOn} />
          </Suspense>
        </div>
      </div>
    </div>,
    document.body,
  )
}
