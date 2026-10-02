import { useLayoutEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useCommunity } from '../../context/CommunityContext'
import { RailCard } from './NetworkLayout'
import Reorderable from './Reorderable'
import FlagStack from './FlagStack'
import Icon from '../Icon'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// "YOUR MARKETS", ONE CARD FOR EVERY NETWORK PAGE (2 Oct 2026).
//
// Ethan: "whenever you click on a market in that tab it brings you to the page, but I still want that card on
// the right column on the market page." It lived inside GlobalHome, so the moment you used it you lost it. It is
// its own component now, drawn in the rail of the Worldwide hub AND of every market page, with the page you are
// on picked out - so it works as the switcher it looks like.
//
// THE PICKED ROW IS A GRADIENT. Ethan: "when you're clicked on one it shows that light orange colour, I don't
// like it, instead have an orange to light gradient." Solid brand into brand-light with white on it, the house
// rule for a picked option, and it fades in rather than snapping (`selected-in`).
//
// The saved order is the same localStorage key the hub always used, so nobody's arrangement is lost.
// THE CARD TRAVELS WITH YOU (2 Oct 2026). Ethan: "on the worldwide page, whenever I click on for example Spain,
// the your markets card should animate up nicely from where it is." On Worldwide it sits under "Live now"; on a
// market page it is the first card in the rail, so it used to vanish and slide in again from the right a few
// hundred pixels higher. A press inside it now notes where it stood on screen, and the copy on the next page starts
// at that spot and glides to its own (a FLIP), skipping the rail's slide-in so the two motions do not fight.
let carried = null
const CARRY_MS = 4000
const CARRY_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)'

export const MARKET_ORDER_KEY = 'network-market-order'

export function loadMarketOrder() {
  try { return JSON.parse(localStorage.getItem(MARKET_ORDER_KEY)) || [] } catch { return [] }
}

// A saved order is a preference over the markets you had THEN. Markets you join later fall in at the end
// rather than disappearing, and markets you leave drop out without leaving a hole.
export function orderMarkets(markets, order, homeId) {
  if (!order.length) return markets
  const rank = new Map(order.map((id, i) => [id, i]))
  return [...markets].sort(
    (a, b) => (rank.has(a.id) ? rank.get(a.id) : 1e9) - (rank.has(b.id) ? rank.get(b.id) : 1e9)
      || (b.id === homeId) - (a.id === homeId)
      || a.name.localeCompare(b.name),
  )
}

// The picked look, shared with the VIP communities card so the two lists answer "where am I" the same way.
export const PICKED_ROW = 'bg-gradient-to-r from-brand to-brand-light text-white shadow-card animate-selected-in'
export const ROW_BASE = 'group flex items-center gap-1 rounded-xl transition-all duration-200'
// The moment of the press shows the same gradient, so the row answers the click before the next page lands.
export const PRESS_ROW = 'active:bg-gradient-to-r active:from-brand active:to-brand-light active:text-white'

// The grip is its own target, never the link (pressing a market used to be a press on a drag handle first).
const GRIP_CLASS = 'mr-1 flex h-8 w-6 shrink-0 items-center justify-center rounded-md transition-opacity focus:opacity-100 focus:outline-none sm:opacity-40 sm:group-hover:opacity-100'

function MarketLinkRow({ market, live, picked, handleProps, dragging }) {
  const tr = useT()
  return (
    <div className={cx(ROW_BASE, picked ? PICKED_ROW : dragging ? 'bg-white shadow-card' : cx('hoverable:hover:bg-cloud', PRESS_ROW))}>
      <Link
        to={`/c/${market.slug}`}
        aria-current={picked ? 'page' : undefined}
        className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl px-3 py-2 text-sm"
      >
        <FlagStack codes={market.country_codes} className="text-[13px]" />
        <span className={cx('min-w-0 flex-1 truncate', picked && 'font-semibold')}>{market.name}</span>
        {live && <span className={cx('h-1.5 w-1.5 shrink-0 rounded-full', picked ? 'bg-white' : 'bg-brand')} title={tr('Challenge running')} />}
      </Link>
      <span {...handleProps} title={tr('Drag to reorder')} className={cx(GRIP_CLASS, picked ? 'text-white/70 hover:text-white' : 'text-gray-300 hover:text-smoke focus-visible:text-brand')}>
        <Icon name="grip" className="h-4 w-4" />
      </span>
    </div>
  )
}

/**
 * @param current  'worldwide' on the hub, a market id on a market page, null anywhere else
 * @param live     { [marketId]: challenge } when the page already knows which markets are running one
 */
export default function MarketsRailCard({ current = null, live = null, className }) {
  const tr = useT()
  const { network, myChapters } = useCommunity()
  const [order, setOrder] = useState(loadMarketOrder)
  const home = myChapters.find((c) => c.membership?.is_home)
  const mine = myChapters.slice().sort((a, b) => (b.id === home?.id) - (a.id === home?.id) || a.name.localeCompare(b.name))
  const ordered = orderMarkets(mine, order, home?.id)
  const worldwidePicked = current === 'worldwide'

  const root = useRef(null)
  useLayoutEffect(() => {
    const el = root.current
    const from = carried
    carried = null
    if (!el || !from || performance.now() - from.at > CARRY_MS) return
    const dy = from.top - el.getBoundingClientRect().top
    const item = el.closest('.reveal-item')
    item?.classList.add('reveal-carry')
    if (Math.abs(dy) < 2 || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    el.animate?.([{ transform: `translate3d(0, ${dy}px, 0)` }, { transform: 'translate3d(0, 0, 0)' }], { duration: 560, easing: CARRY_EASE })
  }, [])
  function noteCarry() {
    const r = root.current?.getBoundingClientRect()
    if (r) carried = { top: r.top, at: performance.now() }
  }

  function save(next) {
    const ids = next.map((m) => m.id)
    setOrder(ids)
    try { localStorage.setItem(MARKET_ORDER_KEY, JSON.stringify(ids)) } catch { /* private mode */ }
  }

  return (
    <div ref={root} onClickCapture={noteCarry}>
    <RailCard
      className={cx('hidden lg:block', className)}
      icon={<Icon name="globe" className="h-3.5 w-3.5 text-brand" />}
      title={tr('Your markets')}
      action={
        <Link to="/global/markets" className="text-[11px] font-medium text-brand transition-transform duration-200 hover:scale-105">
          {tr('Explore')}
        </Link>
      }
    >
      {/* Worldwide is pinned and NOT reorderable: it is the one place everybody is in and the parent of all the
          others. Only the markets move. */}
      <Link
        to="/global"
        aria-current={worldwidePicked ? 'page' : undefined}
        className={cx(
          'mb-1 flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm transition-all duration-200',
          worldwidePicked ? cx(PICKED_ROW, 'font-semibold') : cx('font-medium text-ink hoverable:hover:bg-cloud', PRESS_ROW),
        )}
      >
        <Icon name="globe" className={cx('h-4 w-4 shrink-0', worldwidePicked ? 'text-white' : 'text-brand')} />
        <span className="min-w-0 truncate">{network?.name || 'Worldwide'}</span>
      </Link>
      <Reorderable
        items={ordered}
        onReorder={save}
        handleLabel="Reorder this market"
        renderItem={(c, { handleProps, dragging }) => (
          <MarketLinkRow market={c} live={!!live?.[c.id]} picked={current === c.id} handleProps={handleProps} dragging={dragging} />
        )}
      />
      {mine.length === 0 && (
        <Link to="/global/markets" className="block rounded-xl border border-dashed border-gray-200 px-3 py-3 text-xs text-smoke transition-colors hover:border-brand hover:text-brand">
          {tr('You have not joined a market yet. Find yours →')}
        </Link>
      )}
    </RailCard>
    </div>
  )
}
