import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence, useDragControls } from 'motion/react'
import { useUnread, scopedChannel } from '../../context/UnreadContext'
import FlagTile from '../network/FlagTile'
import UnreadDot, { UnreadCount } from '../UnreadDot'
import Icon from '../Icon'
import { stripMarkup } from '../../lib/richText'
import { cx, shortAgo } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// EVERY ROOM, ONE TAP FROM ANY ROOM, ON A PHONE (2 Oct 2026).
//
// Ethan: "this set up with rooms looks good on desktop but on mobile it can be hard to navigate, especially if in
// multiple rooms ... research how other popular chats work and rebuild the mobile version."
//
// Inside a room a phone had one way across: a sideways strip of the CURRENT market's tabs. Getting from Spain's
// General to Worldwide's Announcements meant backing out to the Rooms tab and scrolling for it. The chat apps that
// have solved this on a phone all keep the conversation's own header small and put every other room behind a single
// tap on it - Slack bubbles the conversations that need you to the top, WhatsApp filters to "Unread", Telegram's
// folders group by place. This is that: the room's name in the header opens this sheet, which leads with the rooms
// that have something new (a preview of what was said, and when), then every place you are in with its rooms, the
// VIP rooms last on their own material. The room you are in is the gradient row.
export default function RoomSwitcherSheet({ open, onClose, places, vipPlaces = [], currentPlaceId, activeKey }) {
  const tr = useT()
  const { unread, lastByChannel } = useUnread()
  const drag = useDragControls()
  const [allNew, setAllNew] = useState(false)

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const base = (p) => (p.kind === 'network' ? '/global/chat' : `/c/${p.slug}/chat`)
  const isHere = (p, r) => p.id === currentPlaceId && r.key === activeKey
  const fresh = []
  for (const p of [...places, ...vipPlaces]) {
    for (const r of p.rooms) {
      const k = scopedChannel(p, r.key)
      if (unread.has(k) && !isHere(p, r)) fresh.push({ p, r, last: lastByChannel.get(k) })
    }
  }
  fresh.sort((a, b) => String(b.last?.created_at || '').localeCompare(String(a.last?.created_at || '')))

  let i = 0
  const step = () => Math.min(i++, 14) * 0.025

  const row = (p, r, { vip = false, showPlace = false, last = null } = {}) => {
    const k = scopedChannel(p, r.key)
    const on = isHere(p, r)
    const isNew = !on && unread.has(k)
    return (
      <motion.div key={`${p.id}-${r.id}`} initial={{ opacity: 0.4, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, delay: step(), ease: 'easeOut' }}>
        <Link
          to={`${base(p)}/${r.key}`}
          onClick={onClose}
          aria-current={on ? 'page' : undefined}
          className={cx(
            'flex items-center gap-3 rounded-2xl px-3 py-2.5 transition-[transform,background-color] duration-200 active:scale-[0.99]',
            on ? 'bg-gradient-to-r from-brand to-brand-light text-white shadow-card'
              : vip ? 'text-white/90 active:bg-white/10' : 'text-ink active:bg-cloud',
          )}
        >
          <span className={cx(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            on ? 'bg-white/20 text-white' : vip ? 'bg-white/10 text-brand-light' : 'bg-brand-tint text-brand',
          )}>
            <Icon name={r.icon || 'chat'} className="h-[18px] w-[18px]" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className={cx('truncate text-[15px] leading-tight', isNew ? 'font-bold' : 'font-semibold')}>{tr(r.label)}</span>
              {r.visibility === 'vip' && !vip && <span className="shrink-0 rounded-full bg-ink px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">VIP</span>}
              {r.visibility === 'staff' && <span className={cx('shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold', on ? 'bg-white/20 text-white' : 'bg-cloud text-smoke')}>{tr('Staff')}</span>}
            </span>
            {(showPlace || last) && (
              <span className={cx('mt-0.5 block truncate text-[12.5px]', on ? 'text-white/85' : vip ? 'text-white/60' : isNew ? 'font-medium text-ink/75' : 'text-smoke')}>
                {showPlace && <>{p.kind === 'network' ? tr('Worldwide') : p.name}{last ? ' · ' : ''}</>}
                {last ? `${last.profiles?.name?.split(' ')[0] || tr('Someone')}: ${stripMarkup(last.body || '') || tr('a photo')}` : ''}
              </span>
            )}
          </span>
          {last?.created_at && <span className={cx('shrink-0 self-start pt-0.5 text-[11px] tabular-nums', isNew ? 'font-semibold text-brand' : 'text-gray-400')}>{shortAgo(last.created_at)}</span>}
          {isNew && <UnreadDot size="sm" />}
          {on && <Icon name="check" className="h-4 w-4 shrink-0 text-white" />}
        </Link>
      </motion.div>
    )
  }

  const placeHead = (p, { vip = false } = {}) => {
    const n = p.rooms.filter((r) => !isHere(p, r) && unread.has(scopedChannel(p, r.key))).length
    return (
      <div className="flex items-center gap-2.5 px-2 pb-1.5 pt-1">
        <FlagTile codes={p.country_codes} kind={p.kind} size="h-7 w-7" glyph="text-base" className="rounded-lg" title={p.name} />
        <span className={cx('min-w-0 flex-1 truncate text-[15px] font-bold tracking-[-0.01em]', 'text-ink')}>
          {vip ? tr('VIP {m}', { m: p.name }) : p.name}
        </span>
        {n > 0 && <UnreadCount n={n} />}
      </div>
    )
  }

  if (typeof document === 'undefined') return null
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[80] lg:hidden" role="dialog" aria-modal="true" aria-label={tr('Switch room')}>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}
            onClick={onClose}
            className="absolute inset-0 bg-ink/40 backdrop-blur-[2px]"
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', stiffness: 380, damping: 36 }}
            drag="y" dragListener={false} dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, info) => { if (info.offset.y > 90 || info.velocity.y > 600) onClose() }}
            className="absolute inset-x-0 bottom-0 flex max-h-[86vh] flex-col rounded-t-[28px] bg-white pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lift"
          >
            <div onPointerDown={(e) => drag.start(e)} style={{ touchAction: 'none' }} className="flex shrink-0 cursor-grab flex-col items-center pb-1 pt-3">
              <span aria-hidden className="h-1.5 w-11 rounded-full bg-gray-300" />
              <div className="mt-2 flex w-full items-center justify-between px-5">
                <h2 className="text-lg font-bold tracking-tight">{tr('Rooms')}</h2>
                <Link to="/rooms" onClick={onClose} className="text-xs font-semibold text-brand">{tr('All rooms')}</Link>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-3 pb-2 pt-2">
              {fresh.length > 0 && (
                <section className="rounded-3xl bg-brand-tint/50 p-1.5">
                  <p className="flex items-center gap-2 px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-brand">
                    <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-brand" /></span>
                    {tr('New since you looked')}
                  </p>
                  {(allNew ? fresh : fresh.slice(0, 4)).map(({ p, r, last }) => row(p, r, { showPlace: true, last, vip: false }))}
                  {!allNew && fresh.length > 4 && (
                    <button type="button" onClick={() => setAllNew(true)} className="w-full rounded-2xl py-2 text-center text-xs font-semibold text-brand active:bg-white/60">
                      {tr('Show {n} more', { n: fresh.length - 4 })}
                    </button>
                  )}
                </section>
              )}
              {places.map((p) => (
                <section key={p.id}>
                  {placeHead(p)}
                  <div className="space-y-0.5">{p.rooms.map((r) => row(p, r))}</div>
                </section>
              ))}
              {vipPlaces.map((p) => (
                <section key={`vip-${p.id}`}>
                  {placeHead(p, { vip: true })}
                  <div className="space-y-0.5">{p.rooms.map((r) => row(p, r))}</div>
                </section>
              ))}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  )
}
