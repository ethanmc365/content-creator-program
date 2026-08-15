import { Link, useNavigate } from 'react-router-dom'
import { Avatar, Badge } from './ui'
import PlatformBadges, { platformsForProfile } from './PlatformBadges'
import ConnectButton from './ConnectButton'
import { useAuth } from '../context/AuthContext'
import { openConversation } from '../lib/dm'
import { cx } from '../lib/utils'

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
// SMALLER, TOO. `!p-4` and a `md` avatar rather than `lg`, so four fit across a
// desktop where three did - the grid is a directory you scan, and scanning is
// helped by seeing more of it at once.
export default function CreatorCard({ creator, relation, onRelationChange, currentTrip = null }) {
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
      className="card group flex h-full flex-col gap-3 !p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift active:-translate-y-0.5 active:shadow-lift"
    >
      <div className="flex items-start gap-3">
        <Avatar src={creator.photo_url} name={creator.name} size="md" />
        <div className="min-w-0 flex-1">
          {/* One line, always. `truncate` rather than wrap: a two-line name on
              one card and a one-line name on the next is the difference the
              whole grid was suffering from. */}
          <h3 className="truncate text-[15px] font-semibold leading-snug group-hover:text-brand">
            {creator.name}
          </h3>
          <p className="mt-0.5 truncate text-xs text-smoke">
            {[creator.city, creator.country].filter(Boolean).join(', ') || 'Somewhere out there'}
          </p>
        </div>
        {creator.is_admin && <Badge tone="light" className="shrink-0 !px-2 !py-0.5 !text-[10px]">Team</Badge>}
      </div>

      {/* A FIXED TWO-LINE BOX. `min-h` and `line-clamp-2` together: it can never
          be taller than two lines and never shorter, whatever is in it. */}
      <p className="line-clamp-2 min-h-[2.5rem] text-[13px] leading-snug text-smoke">
        {creator.bio || 'New to the programme.'}
      </p>

      {/* The meta row, also one line. The trip chip lives here now rather than
          beside the name, so it can never make the heading wrap. */}
      <div className="flex min-h-[1.5rem] flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-smoke">
        <PlatformBadges platforms={platformsForProfile(creator)} />
        <span className="inline-flex items-center gap-1">
          <Icon24Globe />
          {creator.countries_visited?.length || 0}
        </span>
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
          uniform box with the buttons floating at different heights inside. */}
      <div className="mt-auto border-t border-gray-100 pt-3">
        {isMe ? (
          <p className="py-1 text-center text-xs font-medium text-gray-400">This is you</p>
        ) : (
          <div className="flex gap-2">
            <ConnectButton
              myId={user.id}
              targetId={creator.id}
              relation={relation}
              onChange={(next) => onRelationChange?.(creator.id, next)}
              className="flex-1"
            />
            <button
              onClick={message}
              className={cx(
                'inline-flex flex-1 items-center justify-center rounded-full bg-cloud px-4 py-2 text-xs font-semibold text-ink',
                'transition-all duration-200 hover:-translate-y-0.5 hover:bg-gray-200 active:translate-y-0',
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

// The globe, inline. A one-glyph component rather than an emoji, because the
// meta row used "🌍 12 countries" and an emoji renders at a different size on
// every platform - which on a row this tight is enough to shift the baseline.
function Icon24Globe() {
  return (
    <svg viewBox="0 0 24 24" className="h-3 w-3 shrink-0 text-gray-400" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18" />
    </svg>
  )
}
