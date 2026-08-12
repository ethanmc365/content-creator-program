import { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { openConversation } from '../lib/dm'
import { countryFacts } from '../lib/countryFacts'
import { Avatar } from './ui'
import Icon from './Icon'
import { cx } from '../lib/utils'

// WHAT HAPPENS WHEN YOU TAP A COUNTRY.
//
// Before this, tapping the land did nothing at all: the maps answered "where is
// everybody" and stopped there. But the question a creator actually arrives
// with is the other way round - "I am going to Japan in March, has anyone been"
// - and the map already knows the answer. This is that answer.
//
// THE ORDER OF THE LIST IS THE WHOLE POINT. Somebody who LIVES in a country
// knows which neighbourhood to stay in and what a taxi should cost; somebody
// who spent nine days there knows the good version of the tourist route. Both
// are worth asking, they are not worth the same, and a single alphabetical list
// would bury the resident at position 14. So: lives here first, been there
// second, always, with the counts on the headings so you can see at a glance
// whether this is a country the community actually knows.
//
// And if nobody has: say so plainly and make it an invitation rather than an
// empty state. "No creators found" is a dead end. "You could be the first" is
// the same fact pointed at something to do.
//
// NO MOTION IMPORT IN HERE. CreatorMap is rendered by the public landing page,
// which is eagerly routed, so anything this file imports lands in the first
// paint of every visitor. Transitions are CSS.

const firstName = (n = '') => (n.trim().split(' ')[0] || 'They')

function CreatorRow({ creator, onMessage, onCreatorClick, busy, subtitle }) {
  const { user } = useAuth()
  const isMe = creator.id === user?.id
  const inner = (
    <>
      <Avatar src={creator.photo_url} name={creator.name} size="sm" />
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate text-sm font-medium text-ink">{creator.name}</span>
        {subtitle && <span className="block truncate text-xs text-smoke">{subtitle}</span>}
      </span>
    </>
  )
  return (
    <div className="flex items-center gap-2">
      {onCreatorClick ? (
        <button
          type="button"
          onClick={() => onCreatorClick(creator)}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-cloud"
        >
          {inner}
        </button>
      ) : (
        <Link
          to={`/profile/${creator.id}`}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1.5 transition-colors hover:bg-cloud"
        >
          {inner}
        </Link>
      )}
      {/* The DM button is the reason this panel exists, so it is a real button
          with a word on it, not an icon somebody has to guess at. Hidden on
          your own row: messaging yourself is not a feature. */}
      {onMessage && !isMe && (
        <button
          type="button"
          onClick={() => onMessage(creator)}
          disabled={busy}
          className="shrink-0 rounded-full bg-brand-tint px-3 py-1.5 text-xs font-semibold text-brand transition-transform hover:scale-105 active:scale-95 disabled:opacity-50"
        >
          {busy ? '…' : 'Message'}
        </button>
      )}
    </div>
  )
}

function Group({ title, hint, creators, subtitleFor, onMessage, onCreatorClick, busyId, showCount = true }) {
  if (!creators.length) return null
  return (
    <div>
      <p className="mb-1 flex items-baseline gap-2 px-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-widest text-smoke">{title}</span>
        {/* A count next to "Lives here" is the answer to a question. A count
            next to a heading that can only ever describe one person is a "1"
            sitting there looking like it means something. */}
        {showCount && <span className="text-[11px] font-semibold text-brand">{creators.length}</span>}
      </p>
      {hint && <p className="mb-1.5 px-1.5 text-[11px] text-smoke">{hint}</p>}
      <div className="flex flex-col gap-0.5">
        {creators.map((c) => (
          <CreatorRow
            key={c.id}
            creator={c}
            subtitle={subtitleFor?.(c)}
            onMessage={onMessage}
            onCreatorClick={onCreatorClick}
            busy={busyId === c.id}
          />
        ))}
      </div>
    </div>
  )
}

export default function CountryPanel({
  country,
  lives = [],
  visited = [],
  onClose,
  onCreatorClick = null,
  // 'community' lists everybody; 'personal' is one creator's own map, where the
  // only person the country can tell you about is whose map it is - so the
  // panel is facts about the place plus a way to reach THEM, whether or not
  // they have been.
  variant = 'community',
  // Personal variant only: whose map this is, and what the country means to
  // them ('lives' | 'visited' | 'none').
  owner = null,
  ownerState = 'none',
  className,
}) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [busyId, setBusyId] = useState(null)
  const facts = useMemo(() => countryFacts(country), [country])
  const total = lives.length + visited.length

  async function message(creator) {
    if (!user?.id) return
    setBusyId(creator.id)
    const id = await openConversation(user.id, creator.id)
    setBusyId(null)
    if (id) navigate(`/messages/${id}`)
  }
  // On the public map there is no "you" to send a message from, so the whole
  // row becomes the join prompt the page already owns.
  const onMessage = user?.id && !onCreatorClick ? message : null

  const meta = [facts.continent, facts.currency && `${facts.currency}${facts.symbol ? ` (${facts.symbol})` : ''}`]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      // NO max-height HERE, DELIBERATELY.
      //
      // It had `max-h-[min(26rem,70%)]`, and the 70% never applied: a percentage
      // height resolves against the containing block, the containing block was
      // an absolutely positioned div with `bottom/left/right` and no height, and
      // a percentage against an auto height is indeterminate - so the whole
      // min() fell back to no limit and a country with thirty visitors rendered
      // a 1400px card that ran off the top of the map.
      //
      // Instead the CALLER gives us a definite box (a flex column pinned to all
      // four insets of the map) and this shrinks inside it: `overflow-hidden`
      // makes min-height compute to 0, so flex is free to squeeze it, and the
      // list below scrolls. One rule, correct at every map size.
      className={cx(
        // The 26rem ceiling is kept (a panel that fills a whole desktop map
        // hides the thing it is describing) - it is only the percentage that
        // was broken. Flex shrink still takes it below this on a small map.
        'pointer-events-auto flex max-h-[26rem] min-h-0 w-full flex-col overflow-hidden rounded-card border border-gray-100 bg-white shadow-lift',
        className,
      )}
    >
      <div className="flex shrink-0 items-start gap-3 border-b border-gray-100 px-4 py-3">
        <span className="text-2xl leading-none" aria-hidden>{facts.flag || '🌍'}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{country}</p>
          {meta && <p className="truncate text-xs text-smoke">{meta}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-smoke transition-colors hover:bg-cloud hover:text-ink"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-3 py-3">
        {facts.knownFor.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1.5">
            {facts.knownFor.map((k) => (
              <span key={k} className="rounded-full bg-cloud px-2.5 py-1 text-[11px] font-medium text-smoke">{k}</span>
            ))}
          </div>
        )}

        {variant === 'personal' ? (
          owner && (
            <Group
              title={ownerState === 'lives' ? 'Lives here' : ownerState === 'visited' ? 'Been there' : 'Not been yet'}
              hint={
                ownerState === 'lives'
                  ? `${firstName(owner.name)} is based here, so ask about the parts a visitor never finds.`
                  : ownerState === 'visited'
                    ? `${firstName(owner.name)} has been. Ask them anything about it.`
                    : `${firstName(owner.name)} has not been to ${country} yet. Somewhere to go together?`
              }
              creators={[owner]}
              onMessage={onMessage}
              onCreatorClick={onCreatorClick}
              subtitleFor={(c) => [(c.city || '').trim(), (c.country || '').trim()].filter(Boolean).join(', ') || undefined}
              busyId={busyId}
              showCount={false}
            />
          )
        ) : (
          <>
            <Group
              title="Lives here"
              creators={lives}
              onMessage={onMessage}
              onCreatorClick={onCreatorClick}
              subtitleFor={(c) => (c.city || '').trim() || undefined}
              busyId={busyId}
            />
            <Group
              title="Been there"
              creators={visited}
              onMessage={onMessage}
              onCreatorClick={onCreatorClick}
              subtitleFor={(c) => [(c.city || '').trim(), (c.country || '').trim()].filter(Boolean).join(', ') || undefined}
              busyId={busyId}
            />
          </>
        )}

        {total === 0 && variant !== 'personal' && (
          <div className="px-1.5 py-4 text-center">
            <div className="mx-auto mb-2 flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-tint text-brand">
              <Icon name="pin" className="h-5 w-5" />
            </div>
            <p className="text-sm font-semibold text-ink">Nobody has been to {country} yet</p>
            <p className="mx-auto mt-1 max-w-[15rem] text-xs text-smoke">
              You could be the first to explore it. Add it to your travels once you go, and the next creator planning
              this trip will find you here.
            </p>
            {user?.id && !onCreatorClick && (
              <Link
                to="/collab"
                className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-xs font-semibold text-white transition-transform hover:scale-105 active:scale-95"
              >
                Plan a trip there
              </Link>
            )}
          </div>
        )}
      </div>

      <span className="sr-only" role="status">{busyId ? 'Opening the conversation' : ''}</span>
    </div>
  )
}
