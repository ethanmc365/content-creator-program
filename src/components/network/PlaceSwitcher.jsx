import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { motion, AnimatePresence, useDragControls } from 'motion/react'
import { useCommunity } from '../../context/CommunityContext'
import Icon from '../Icon'
import { flagFromIso } from '../../lib/flags'
import { cx } from '../../lib/utils'
import { lockScroll } from '../../lib/scrollLock'

// Re-exported for the market components that already import it from here.
// The definition lives in lib/flags.js: this module pulls in `motion`, and
// anything eagerly routed that imports a flag helper from here would drag the
// whole motion runtime into the initial bundle.
export { flagFromIso }

// Where am I, and where else do I belong.
//
// WHAT CHANGED AND WHY
//
// The first version listed every market on the platform. That is a directory,
// not a switcher: a UK creator was shown a Spain pill they could not join, could
// not read and had no reason to think about, and the one place they actually
// live was buried among countries that meant nothing to them.
//
// The second version fixed that but grew a fourth control, an admin-only "All
// markets" pill, which put three different doors to the same place on one strip
// (Explore, All markets, and the rail's Your places). Admins now reach closed
// markets through Explore itself, which already groups them, so the strip is
// back to one job: you are here, and here is where else you belong.
//
// ON A PHONE it is not a strip at all. A horizontal scroller of pills above the
// content is a row you have to discover by dragging; a single button that says
// where you are, opening a sheet, is one tap and always legible.


function Row({ to, onPick, active, flags, name, badge, hint }) {
  return (
    <Link
      to={to}
      onClick={onPick}
      className={cx(
        'flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-colors',
        active ? 'bg-brand-tint' : 'hover:bg-cloud',
      )}
    >
      <span className="w-7 shrink-0 text-center text-lg leading-none" aria-hidden>{flags || '🌍'}</span>
      <span className="min-w-0 flex-1">
        <span className={cx('flex items-center gap-2 truncate font-semibold', active && 'text-brand')}>
          {name}
          {badge && (
            <span className="shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">
              {badge}
            </span>
          )}
        </span>
        {hint && <span className="block truncate text-xs text-smoke">{hint}</span>}
      </span>
      {active && <Icon name="check" className="h-4 w-4 shrink-0 text-brand" />}
    </Link>
  )
}

export default function PlaceSwitcher() {
  const {network, chapters, myChapters} = useCommunity()
  const { pathname } = useLocation()
  const [sheet, setSheet] = useState(false)
  const dragControls = useDragControls()

  // Any navigation closes it. Without this, tapping a market leaves the sheet
  // sitting over the page it just took you to.
  useEffect(() => { setSheet(false) }, [pathname])

  // The body must not scroll behind an open sheet, or a flick on the backdrop
  // scrolls the page underneath and the sheet appears to be stuck to nothing.
  useEffect(() => {
    if (!sheet) return
    const release = lockScroll()
    const onKey = (e) => e.key === 'Escape' && setSheet(false)
    document.addEventListener('keydown', onKey)
    return () => {
      release()
      document.removeEventListener('keydown', onKey)
    }
  }, [sheet])

  // Ordering only. See CommunityContext - there is no home market setting.
  const home = myChapters.find((c) => c.membership?.is_home)
  const mine = myChapters
    .slice()
    .sort((a, b) => (b.id === home?.id) - (a.id === home?.id) || a.name.localeCompare(b.name))
  const joinable = chapters.filter((c) => c.is_active && !myChapters.some((m) => m.id === c.id))

  const onGlobal = pathname === '/global'
  const currentSlug = pathname.startsWith('/c/') ? pathname.split('/')[2] : null
  const current = mine.find((c) => c.slug === currentSlug)
    || chapters.find((c) => c.slug === currentSlug)
  const currentFlags = current
    ? (current.country_codes || []).map(flagFromIso).join('')
    : ''

  return (
    <>
      {/* ---------- Phone: one bar, one sheet ----------
          FULL WIDTH, BUT STILL ONE LINE.
          The first version was a full-width two-line card 68px tall, spending a
          tenth of an 812px screen restating what the bottom tab bar says, so it
          was cut down to a small inline pill. It is a bar again now, because it
          took on a second job: "Your markets" is gone from the hub on a phone
          and this is the only way to a market from there, so it has to read as
          the door it is rather than as a label you might not press. The height
          lesson survives - one line, ~44px, not the 68px card. */}
      <div className="mb-4 lg:hidden">
        <button
          type="button"
          onClick={() => setSheet(true)}
          aria-haspopup="dialog"
          aria-expanded={sheet}
          className="flex w-full items-center gap-2.5 rounded-2xl border border-gray-200 bg-white py-2.5 pl-3.5 pr-3 text-left transition-transform duration-200 active:scale-[0.98]"
        >
          <span className="shrink-0 text-base leading-none" aria-hidden>
            {onGlobal || !current ? '🌍' : currentFlags || '📍'}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-semibold">
            {onGlobal || !current ? (network?.name || 'Worldwide') : current.name}
          </span>
          {/* The word, not just the chevron. A bare arrow on a bar this wide
              reads as "open this page", which is the one thing it does not do. */}
          <span className="shrink-0 text-xs font-semibold text-brand">Switch</span>
          <Icon name="chevronRight" className="h-3.5 w-3.5 shrink-0 rotate-90 text-gray-400" />
        </button>
      </div>

      <AnimatePresence>
        {sheet && (
          <div className="fixed inset-0 z-[60] lg:hidden" role="dialog" aria-modal="true" aria-label="Switch place">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              onClick={() => setSheet(false)}
              className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
            />
            {/* SWIPE IT AWAY, AND SCROLL IT WITHOUT MOVING THE PAGE.
                Two faults, one shape. The sheet WAS the scroller, so a flick
                that ran past its last row chained straight through to the
                document and scrolled the page behind it - the sheet looked
                stuck to nothing. And there was no way to dismiss it by
                gesture at all: the only exits were the backdrop and picking
                somewhere, so a phone user who opened it to look had to tap
                something to get out.

                So the sheet no longer scrolls; the list inside it does, with
                `overscroll-contain` to stop the chaining at its own edges.
                And the sheet drags, but ONLY from the grabber - dragListener
                is off and the gesture is started by hand from the handle, or
                every attempt to scroll the list would drag the whole sheet
                down instead. That is the same "two gestures need two targets"
                rule the reorder grip follows. */}
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 36 }}
              drag="y"
              dragListener={false}
              dragControls={dragControls}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.5 }}
              onDragEnd={(_, info) => {
                // Distance OR speed. A slow deliberate pull past a third of the
                // handle's travel is a dismissal, and so is a quick flick that
                // barely moved - insisting on distance alone makes the sheet
                // feel like it is resisting you.
                if (info.offset.y > 90 || info.velocity.y > 600) setSheet(false)
              }}
              className="absolute inset-x-0 bottom-0 flex max-h-[82vh] flex-col rounded-t-[28px] bg-white pb-[calc(1.5rem+env(safe-area-inset-bottom))] shadow-lift"
            >
              <div
                onPointerDown={(e) => dragControls.start(e)}
                style={{ touchAction: 'none' }}
                className="flex shrink-0 cursor-grab flex-col items-center bg-white pb-2 pt-3 active:cursor-grabbing"
              >
                <span aria-hidden className="h-1.5 w-11 rounded-full bg-gray-300" />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-2">
                <p className="px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-widest text-smoke">
                  The network
                </p>
                <Row
                  to="/global"
                  onPick={() => setSheet(false)}
                  active={onGlobal}
                  flags="🌍"
                  name={network?.name || 'Worldwide'}
                  hint="Everyone, everywhere. Your people layer."
                />

                {mine.length > 0 && (
                  <p className="px-4 pb-1 pt-4 text-[11px] font-semibold uppercase tracking-widest text-smoke">
                    Your markets
                  </p>
                )}
                {mine.map((c) => (
                  <Row
                    key={c.id}
                    to={`/c/${c.slug}`}
                    onPick={() => setSheet(false)}
                    active={c.slug === currentSlug}
                    flags={(c.country_codes || []).map(flagFromIso).join('')}
                    name={c.name}
                    badge={c.id === home?.id ? 'Home' : null}
                    hint={c.tagline}
                  />
                ))}

              </div>

              {/* ALL MARKETS, ALWAYS, AND PINNED TO THE BOTTOM OF THE SHEET.
                  This used to be a row in the list, and only when there was
                  something joinable - so an admin already in every market had
                  no door to the markets page at all, and everyone else had to
                  scroll past their own markets to find it. The hub's "Your
                  markets" section is gone on a phone, which makes this sheet
                  the only route to the rest of the network: it cannot be
                  conditional and it cannot be somewhere you have to look for.
                  Ethan: "at the bottom of this popup it should show an all
                  markets button, and clicking that brings you to the all
                  markets page where you can see the other markets and request
                  to join them." */}
              <div className="shrink-0 border-t border-gray-100 px-3 pt-2">
                <Link
                  to="/global/markets"
                  onClick={() => setSheet(false)}
                  className="flex items-center justify-center gap-2 rounded-2xl bg-brand-tint px-4 py-3 text-sm font-semibold text-brand transition-transform duration-200 active:scale-[0.98]"
                >
                  <Icon name="globe" className="h-4 w-4 shrink-0" />
                  All markets
                  {joinable.length > 0 && (
                    <span className="rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-semibold text-white">
                      {joinable.length} to join
                    </span>
                  )}
                </Link>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* THE DESKTOP STRIP IS GONE.
          It was a row of pills across the top of every network page - Worldwide,
          UK & Ireland, Germany, the Nordics, Portugal - and the rail already
          carries "Your places" on the right of the same page. Two lists of the
          same destinations, one of them eating a full row of vertical space at
          the top of every single page, on the device with the most horizontal
          room and the least vertical. The rail keeps the job.

          The MOBILE sheet above stays and is untouched: a phone has no rail
          (it renders below the article, screens away), so there the switcher is
          the only way to change place. */}
    </>
  )
}
