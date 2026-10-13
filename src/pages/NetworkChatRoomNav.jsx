import { scopedKey, RoomOnBg } from './NetworkChatParts'
import { cx } from '../lib/utils'
import { Link } from 'react-router-dom'
import FlagTile from '../components/network/FlagTile'
import UnreadDot from '../components/UnreadDot'
import Icon from '../components/Icon'
import { Fragment } from 'react'
import Reorderable from '../components/network/Reorderable'

// Part of NetworkChat.jsx: every value it shows comes in as a prop from the page.
export default function NetworkChatRoomNav({
  active,
  community,
  orderedPlaces,
  roomKey,
  saveRoomOrder,
  tr,
  unread,
  vipFirst,
  vipPlaces,
}) {
  return (
    <nav aria-label={tr("Rooms")} className="hidden focus:outline-none lg:flex lg:w-60 lg:shrink-0 lg:flex-col lg:gap-3 lg:overflow-y-auto overscroll-contain lg:overscroll-contain lg:[scrollbar-width:none] lg:[&::-webkit-scrollbar]:hidden">
      {/* ONE CARD PER MARKET, IN YOUR ORDER.
          These were sub-headings inside a single "Your other rooms" box,
          which made six markets read as one long undifferentiated list -
          exactly the flat-list problem the /rooms page exists to solve,
          reproduced in the sidebar. Germany is a place. It gets a card.

          And the order is the reader's. Somebody who lives in the
          Portuguese room should not have to scroll past Germany and the
          Nordics to reach it every time, and there is no ordering we
          could pick centrally that would be right for everybody. Drag
          the grip; it is remembered on this device. */}
      <Reorderable
        items={orderedPlaces}
        onReorder={saveRoomOrder}
        handleLabel="Reorder this market"
        className="flex flex-col gap-3"
        // The lift lives on the CARD, not on Reorderable's wrapper. A
        // shadow on the wrapper is a shadow at the wrong corner radius,
        // and its four grey arcs poking past the card are what read as
        // an outline down this column.
        /* THE MARKET IS THE HEADING OF ITS OWN CARD (12 Sep 2026).
           Ethan: "the way the rooms appear on the left sidebar to choose
           from, I think you can make the UI better and market names and
           flags bigger and more clear there."

           They were `text-[11px] font-semibold text-smoke` with the flag
           emoji inline at that size - which is to say the name of the
           place was SMALLER and QUIETER than the names of the rooms
           underneath it (13px ink). The heading was the least legible
           thing on the card it was the heading of, and a column of six
           cards read as thirty rooms with grey captions between them.

           Now: a 28px flag tile, the name at 14px bold ink, and a hairline
           under it so the header is visibly the card's head rather than
           its first row. The rooms grow to 13.5px and get 2.5px more
           height each, because this column is 240px wide and was using
           about half of it. */
        renderItem={(place, { handleProps, dragging }) => {
          const here = place.id === community.id
          const roomBase = place.kind === 'network' ? '/global/chat' : `/c/${place.slug}/chat`
          const placeUnread = place.rooms.filter(
            (c) => scopedKey(place, c.key) !== roomKey && unread.has(scopedKey(place, c.key)),
          ).length
          return (
            <div className={cx(
              'group rounded-card border bg-white p-2 transition-shadow',
              dragging ? 'border-brand/40 shadow-lift' : 'border-gray-100 shadow-card',
            )}>
              <div className="mb-1.5 flex items-center gap-2 border-b border-gray-100 px-1 pb-2 pt-1">
                <Link
                  to={place.kind === 'network' ? '/global' : `/c/${place.slug}`}
                  className={cx(
                    'flex min-w-0 flex-1 items-center gap-2 transition-colors hover:text-brand',
                    here ? 'text-brand' : 'text-ink',
                  )}
                >
                  {/* EVERY FLAG THE MARKET HAS, IN A TILE THAT KEEPS ITS
                      HEIGHT. This drew one flag and hid the rest in the
                      title, which stopped the Nordics pushing the card's
                      own name out of it and left "UK & Ireland" wearing a
                      Union Jack and nothing else. FlagTile grows sideways
                      instead, so the badge tells the truth and the row is
                      still one height. */}
                  <FlagTile
                    codes={place.country_codes}
                    kind={place.kind}
                    size="h-7 w-7"
                    glyph="text-base"
                    className="rounded-lg"
                    title={place.name}
                  />
                  <span className="min-w-0 truncate text-sm font-bold tracking-[-0.01em]">{place.name}</span>
                </Link>
                {/* A card whose rooms are all further down the column
                    still says it has something in it. */}
                {placeUnread > 0 && <UnreadDot size="sm" />}
                <span
                  {...handleProps}
                  title={tr("Drag to reorder")}
                  className="flex h-6 w-5 shrink-0 items-center justify-center rounded-md text-gray-300 transition-opacity hover:text-smoke focus:opacity-100 focus:outline-none focus-visible:text-brand sm:opacity-40 sm:group-hover:opacity-100"
                >
                  <Icon name="grip" className="h-3.5 w-3.5" />
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                {place.rooms.map((c, ci) => {
                  // The row you are reading. Only ever a highlight - the
                  // row does not move, and neither does its card.
                  const on = here && active?.key === c.key
                  // The room you are IN is never unread, whatever the
                  // watermark has got round to writing. Without this the
                  // dot sits on the open room for the two and a half
                  // seconds the watermark throttle holds it back.
                  const key = scopedKey(place, c.key)
                  const isNew = key !== roomKey && unread.has(key)
                  return (
                    <Fragment key={c.id}>
                    {/* THE SPLIT BETWEEN EVERYDAY AND VIP ROOMS IS A QUIET GREY LINE (5 Oct 2026), not a black "VIP" pill on each row. */}
                    {c.visibility === 'vip' && ci > 0 && place.rooms[ci - 1].visibility !== 'vip' && (
                      <div role="separator" aria-hidden className="mx-3 my-1 h-px bg-gray-200" />
                    )}
                    <Link
                      to={`${roomBase}/${c.key}`}
                      aria-current={on ? 'page' : undefined}
                      className={cx(
                        'relative isolate flex items-center gap-2.5 rounded-xl px-3 py-2.5 active:scale-[0.99]',
                        on ? 'font-semibold text-white' : 'text-ink hover:bg-cloud',
                      )}
                    >
                      {on && <RoomOnBg />}
                      <Icon name={c.icon || 'chat'} className={cx('h-4 w-4 shrink-0', on ? 'text-white' : isNew ? 'text-brand' : 'text-smoke')} />
                      <span className={cx('min-w-0 flex-1 truncate text-[13.5px]', isNew && !on && 'font-bold')}>{tr(c.label)}</span>
                      {c.visibility === 'staff' && (
                        <span className="shrink-0 rounded-full bg-cloud px-1.5 py-0.5 text-[9px] font-medium text-smoke">{tr("Staff")}</span>
                      )}
                      {isNew && <UnreadDot size="sm" />}
                    </Link>
                    </Fragment>
                  )
                })}
              </div>
            </div>
          )
        }}
      />
      {vipPlaces.length > 0 && (
        <div className={cx('flex flex-col gap-3', vipFirst ? 'order-first' : '')}>
          <p className="px-1 pt-1 text-[10.5px] font-bold uppercase tracking-[0.14em] text-brand">{tr('VIP rooms')}</p>
          {vipPlaces.map((place) => {
            const here = place.id === community.id
            const roomBase = place.kind === 'network' ? '/global/chat' : `/c/${place.slug}/chat`
            return (
              // THE VIP CARDS ARE THEIR OWN MATERIAL (2 Oct 2026). Ethan: "you added a slight gradient on it but I
              // don't like the colour, I want it to be more different." The pale orange wash read as a
              // slightly-off market card. Now it is the dark VIP surface (index.css `.vip-surface`: ink into a
              // warm ember, an orange glow in the corner), the same material as the VIP application banner.
              <div key={place.id} className="rounded-card border border-gray-100 bg-white p-2 shadow-card animate-fade-up">
                <div className="mb-1.5 flex items-center gap-2 border-b border-gray-100 px-1 pb-2 pt-1">
                  <FlagTile codes={place.country_codes} kind={place.kind} size="h-7 w-7" glyph="text-base" className="rounded-lg" title={place.name} />
                  <span className="min-w-0 flex-1 truncate text-sm font-bold tracking-[-0.01em] text-ink">
                    {tr('VIP {m}', { m: place.name })}
                  </span>
                </div>
                <div className="flex flex-col gap-0.5">
                  {place.rooms.map((c) => {
                    const on = here && active?.key === c.key
                    const key = scopedKey(place, c.key)
                    const isNew = key !== roomKey && unread.has(key)
                    return (
                      <Link key={c.id} to={`${roomBase}/${c.key}`} aria-current={on ? 'page' : undefined}
                        className={cx('relative isolate flex items-center gap-2.5 rounded-xl px-3 py-2.5 active:scale-[0.99]', on ? 'font-semibold text-white' : 'text-ink hover:bg-cloud')}>
                        {on && <RoomOnBg />}
                        <Icon name={c.icon || 'chat'} className={cx('h-4 w-4 shrink-0', on ? 'text-white' : isNew ? 'text-brand' : 'text-smoke')} />
                        <span className={cx('min-w-0 flex-1 truncate text-[13.5px]', isNew && !on && 'font-bold')}>{tr(c.label)}</span>
                        {isNew && <UnreadDot size="sm" />}
                      </Link>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </nav>
  )
}
