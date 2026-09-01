import { Link, useNavigate } from 'react-router-dom'
import { Avatar, Badge } from './ui'
import PlatformBadges, { platformsForProfile } from './PlatformBadges'
import ConnectButton from './ConnectButton'
import { useAuth } from '../context/AuthContext'
import { openConversation } from '../lib/dm'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

// One creator in the Creator Network grid. The whole card links to the profile;
// Connect and Message are quick actions in the foot.
//
// EVERY CARD IS THE SAME HEIGHT, AND THAT WAS THE BUG.
//
// Ethan: "the creator cards showing below the map can be improved. They can be
// made slightly smaller and they should all be the same size, currently some
// are different sizes."
//
// Three separate things were making them differ, and all three are fixed by
// giving the variable parts a FIXED number of lines rather than by hoping the
// content behaves:
//
//   * THE BIO WAS `line-clamp-2` WITH NO MINIMUM. A creator with no bio got the
//     one-line fallback, a creator with a paragraph got two - so the card under
//     them started at a different height. It is a fixed two-line box now, empty
//     space and all.
//   * THE NAME WRAPPED WHEN A TRIP CHIP WAS BESIDE IT. "Currently in Lisbon"
//     shares the heading line, so a long name plus a chip took two lines and a
//     short name took one. The chip moved down to the meta row, where it is one
//     of several small facts and cannot push anything.
//   * THE FOOT DISAPPEARED ON YOUR OWN CARD. `!isMe` removed the whole action
//     row, so your own card was ~60px shorter than everybody else's, in a grid
//     where it is usually the first one you see. It renders a quiet "This is
//     you" strip instead, which costs the same height and says something true.
//
// AND THEN IT WENT THE OTHER WAY, ON PURPOSE. It was `!p-4` with an `md`
// avatar so FOUR fitted across a desktop, on the argument that a directory is
// something you scan. Four across is 260px a card, and at 260px a name, a
// place, two lines of bio, a row of platform marks, a countries chip and two
// buttons are not a card, they are a compression. Ethan: "when you scroll down
// the creator cards I don't like how they look - it looks extremely crowded,
// the connected button, the message button, everything looks really compact...
// I think go for two cards and really improve the design of the information
// they show."
//
// So: two across (see Directory), and the extra 240px is spent on the two
// things that were suffering - the person at the top of the card, and the
// actions at the foot. The fixed heights all stay, because the reason for them
// (a grid of cards that are not the same size) has not changed.
export default function CreatorCard({ creator, relation, onRelationChange, currentTrip = null, ...rest }) {
  const tr = useT()
  const { user } = useAuth()
  const navigate = useNavigate()
  const isMe = creator.id === user?.id

  // Open (or create) the 1:1 conversation, then jump into it.
  async function message(e) {
    e.preventDefault()
    const id = await openConversation(user.id, creator.id)
    if (id) navigate(`/messages/${id}`)
  }

  return (
    <Link
      to={`/profile/${creator.id}`}
      className="card group flex h-full flex-col gap-3.5 !p-5 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/25 hover:shadow-lift active:-translate-y-0.5 active:shadow-lift"
      {...rest}
    >
      <div className="flex items-start gap-3.5">
        <Avatar src={creator.photo_url} name={creator.name} size="lg" />
        <div className="min-w-0 flex-1">
          {/* One line, always. `truncate` rather than wrap: a two-line name on
              one card and a one-line name on the next is the difference the
              whole grid was suffering from. */}
          <h3 className="truncate text-base font-semibold leading-snug group-hover:text-brand">
            {creator.name}
          </h3>
          <p className="mt-0.5 flex items-center gap-1.5 truncate text-[13px] text-smoke">
            <Icon24Pin />
            {[creator.city, creator.country].filter(Boolean).join(', ') || 'Somewhere out there'}
          </p>
        </div>
        {creator.is_admin && <Badge tone="light" className="shrink-0 !px-2 !py-0.5 !text-[10px]">{tr("Team")}</Badge>}
      </div>

      {/* A BOX THAT IS EXACTLY TWO LINES TALL, AND THAT IS THE WHOLE FIX.
          THE BUG THIS FIXES: it was `line-clamp-2 min-h-[2.5rem] leading-snug`,
          and those two numbers do not agree. `leading-snug` on 13px type is
          17.9px a line, so two lines is 35.8px - but the minimum height is 40px,
          which leaves four pixels of a THIRD line showing under the clamp.
          `-webkit-line-clamp` stops the ellipsis, it does not stop the paint, so
          what a reader sees is the top sliver of the next row of glyphs: the
          flat-topped ones vanish and the tall ones (emoji, capitals, accents)
          leave a row of chopped-off heads. Ethan: "on some creator cards like
          kiera's you say some text or emojis cut off, obviously can't fit all
          the text but don't cut just bottom half off."
          `leading-5` is 20px exactly and `h-10` is 40px exactly, so the box is
          two whole lines and there is no room for a third to peek. The height is
          fixed rather than a minimum for the same reason it was there at all:
          every card in the grid has to be the same height.
          A bio with a hard line break in it would still lay out as three lines
          and clamp at two, which is the correct outcome - the clamp is now the
          only thing deciding what is visible. */}
      {/* The bio is COLLAPSED to flowing text first. A creator who wrote their
          bio as four short lines would otherwise lay out as four lines and the
          clamp would show the first two with no ellipsis, which reads as the
          card having eaten the rest rather than as a summary. */}
      <p className="line-clamp-2 h-10 overflow-hidden text-[13.5px] leading-5 text-smoke">
        {(creator.bio || 'New to the programme.').replace(/\s+/g, ' ').trim()}
      </p>

      {/* The meta row, also one line, and it never wraps: `overflow-hidden` on a
          nowrap row is what stops a creator with four platforms and a live trip
          adding a second line to their card and nobody else's. `h-6` rather than
          a minimum, for the same reason the bio box is a fixed height. */}
      <div className="flex h-6 items-center gap-x-2 overflow-hidden whitespace-nowrap text-[11px] text-smoke">
        <PlatformBadges platforms={platformsForProfile(creator)} />
        {/* THE ONE PIECE OF COLOUR ON THE CARD.
            This was a grey globe and a bare number sitting in a row of grey
            platform glyphs, so the single most interesting fact about a travel
            creator - how much of the world they have actually been to - read as
            a piece of metadata. Ethan: "they're missing something in tryp.com
            orange beside the social media icons saying like 25 countries or
            whatever they've been to, just to bring some colour and make it look
            good."
            It is a brand-tint chip now, the same object as the live-trip chip
            beside it, and it says the unit out loud. Nothing at all when the
            count is zero: "0 countries" is a worse thing to print about
            somebody than silence, and the row is a fixed height so the card
            does not change shape either way. */}
        {creator.countries_visited?.length > 0 && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 font-semibold text-brand"
            title={`${creator.countries_visited.length} countries visited`}
          >
            <Icon24Globe />
            {creator.countries_visited.length} {creator.countries_visited.length === 1 ? 'country' : 'countries'}
          </span>
        )}
        {currentTrip && (
          <span className="inline-flex min-w-0 items-center gap-1 rounded-full bg-brand-tint px-2 py-0.5 font-semibold text-brand">
            <svg viewBox="0 0 24 24" className="h-2.5 w-2.5 shrink-0" fill="currentColor" aria-hidden>
              <path d="M21.5 15.5v-2l-8.5-5V3.25a1.5 1.5 0 0 0-3 0V8.5l-8.5 5v2l8.5-2.5v5.25L7.75 20v1.5L12 20.25l4.25 1.25V20L14 18.25V13z" />
            </svg>
            <span className="truncate">{currentTrip.city || currentTrip.country}</span>
          </span>
        )}
      </div>

      {/* `mt-auto` pins the foot to the bottom whatever is above it, which is
          what makes `h-full` produce a genuinely uniform card rather than a
          uniform box with the buttons floating at different heights inside.

          THE BRAND MOVES TO MESSAGE ONCE YOU ARE CONNECTED, and that is the
          answer to "if you're connected with a lot of creators we still need
          some Tryp.com orange somewhere". Connected is a finished state - the
          button is only there to undo it - so it goes quiet (see ConnectButton)
          and the loud one becomes the thing there is actually left to do. On a
          grid of people you have not met yet, Connect is orange and Message is
          the quiet one; on a grid of people you know, it is the other way
          round. Either way exactly one button on the card is orange. */}
      <div className="mt-auto border-t border-gray-100 pt-3.5">
        {isMe ? (
          <p className="py-1.5 text-center text-xs font-medium text-gray-400">{tr("This is you")}</p>
        ) : (
          <div className="flex gap-2.5">
            <ConnectButton
              myId={user.id}
              targetId={creator.id}
              targetName={creator.name}
              relation={relation}
              onChange={(next) => onRelationChange?.(creator.id, next)}
              className="flex-1 !py-2.5 text-[13px]"
            />
            <button
              onClick={message}
              className={cx(
                'inline-flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-semibold',
                'transition-all duration-200 hover:-translate-y-0.5 active:translate-y-0',
                relation?.relation === 'connected'
                  ? 'bg-brand text-white ring-1 ring-brand hover:shadow-card'
                  : 'bg-cloud text-ink hover:bg-gray-200',
              )}
            >
              Message
            </button>
          </div>
        )}
      </div>
    </Link>
  )
}

// A pin, inline, for the same reason as the globe below: an emoji renders at a
// different size on every platform, and this one sits on a baseline beside 13px
// text.
function Icon24Pin() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0 text-gray-300" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M12 21s7-5.686 7-11a7 7 0 10-14 0c0 5.314 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  )
}

// The globe, inline. A one-glyph component rather than an emoji, because the
// meta row used "🌍 12 countries" and an emoji renders at a different size on
// every platform - which on a row this tight is enough to shift the baseline.
function Icon24Globe() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
    </svg>
  )
}
