import { Fragment, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { openConversation } from '../lib/dm'
import { countryFacts } from '../lib/countryFacts'
import { flagForCountry } from '../lib/flags'
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

export function CreatorRow({ creator, onMessage, onCreatorClick, busy, subtitle }) {
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

// Opening a DM from a map panel. Shared by both panels so "Message" behaves
// identically wherever it appears, and so the public map - where there is no
// "you" to send from - degrades to the join prompt the page already owns.
export function useMessageCreator(onCreatorClick) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [busyId, setBusyId] = useState(null)

  async function message(creator) {
    if (!user?.id) return
    setBusyId(creator.id)
    const id = await openConversation(user.id, creator.id)
    setBusyId(null)
    if (id) navigate(`/messages/${id}`)
  }

  return { onMessage: user?.id && !onCreatorClick ? message : null, busyId }
}

// The card both map panels are made of.
//
// NO max-height HERE, DELIBERATELY. It had `max-h-[min(26rem,70%)]` once, and
// the 70% never applied: a percentage height resolves against the containing
// block, that block was an absolutely positioned div with no height of its own,
// and a percentage against an auto height is indeterminate - so the whole min()
// fell back to no limit and a city with thirty creators drew a card off the top
// of the map. The CALLER gives us a definite box and this shrinks inside it;
// `overflow-hidden` makes min-height 0 so flex is allowed to squeeze it.
export function MapPanel({ badge, title, subtitle, onClose, className, children }) {
  return (
    <div
      className={cx(
        'pointer-events-auto flex max-h-[26rem] min-h-0 w-full flex-col overflow-hidden rounded-card border border-gray-100 bg-white shadow-lift',
        className,
      )}
    >
      <div className="flex shrink-0 items-start gap-3 border-b border-gray-100 px-4 py-3">
        {badge}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{title}</p>
          {subtitle && <p className="truncate text-xs text-smoke">{subtitle}</p>}
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
        {children}
      </div>
    </div>
  )
}

// EVERYBODY IN ONE CITY.
//
// This is what the map pin's orange number is a promise about. The pin shows one
// face because eight faces stacked on one coordinate cannot be read; the roster
// is where you actually see who is there, and - the part the old town card was
// missing - message them without going via their profile first.
export function TownPanel({ town, onClose, onCreatorClick = null, className }) {
  const { onMessage, busyId } = useMessageCreator(onCreatorClick)
  const people = town?.creators ?? []
  const city = (people[0]?.city || '').trim() || 'Here'
  const country = (people[0]?.country || '').trim()
  const flag = flagForCountry(country)

  return (
    <MapPanel
      className={className}
      badge={<span className="text-2xl leading-none" aria-hidden>{flag || '\ud83d\udccd'}</span>}
      title={city}
      subtitle={[country, `${people.length} creator${people.length === 1 ? '' : 's'}`].filter(Boolean).join(' \u00b7 ')}
      onClose={onClose}
    >
      <div className="flex flex-col gap-0.5">
        {people.map((c) => (
          <CreatorRow
            key={c.id}
            creator={c}
            onMessage={onMessage}
            onCreatorClick={onCreatorClick}
            busy={busyId === c.id}
            subtitle={
              (c.countries_visited?.length || c.countries)
                ? `${c.countries_visited?.length || c.countries} countries visited`
                : undefined
            }
          />
        ))}
      </div>
    </MapPanel>
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
  const { onMessage, busyId } = useMessageCreator(onCreatorClick)
  const facts = useMemo(() => countryFacts(country), [country])
  const total = lives.length + visited.length

  const meta = [facts.continent, facts.currency && `${facts.currency}${facts.symbol ? ` (${facts.symbol})` : ''}`]
    .filter(Boolean)
    .join(' · ')

  // WHAT THE PANEL SAYS ABOUT THE PLACE.
  //
  // This used to be six chips - "New York", "Statue of Liberty", "Hollywood" -
  // lifted from the geography game's clue lists. They are clues, written to be
  // guessed at, and as a description of a country they say almost nothing: a
  // reader already knows the Statue of Liberty is in America. Facts you can
  // actually use, and repeat, are the capital, how many people live there, how
  // big it is, and one thing that is genuinely surprising.
  const rows = [
    facts.capital && ['Capital', facts.capital],
    facts.populationLabel && ['Population', `${facts.populationLabel} (approx)`],
    facts.areaLabel && ['Size', facts.areaLabel],
  ].filter(Boolean)

  return (
    <MapPanel
      className={className}
      badge={<span className="text-2xl leading-none" aria-hidden>{facts.flag || '🌍'}</span>}
      title={country}
      subtitle={meta || undefined}
      onClose={onClose}
    >
        {rows.length > 0 && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 px-1.5">
            {rows.map(([label, value]) => (
              <Fragment key={label}>
                <dt className="text-[11px] font-semibold uppercase tracking-widest text-smoke">{label}</dt>
                <dd className="min-w-0 text-xs font-medium text-ink">{value}</dd>
              </Fragment>
            ))}
          </dl>
        )}

        {facts.fact && (
          <p className="mx-1.5 rounded-xl bg-brand-tint/40 px-3 py-2 text-xs leading-relaxed text-ink">
            <span className="font-semibold text-brand">Did you know </span>
            {facts.fact}
          </p>
        )}

        {/* No written row for this place: fall back to the landmarks the
            geography game knows, rather than an empty card. */}
        {rows.length === 0 && !facts.fact && facts.knownFor.length > 0 && (
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

      <span className="sr-only" role="status">{busyId ? 'Opening the conversation' : ''}</span>
    </MapPanel>
  )
}
