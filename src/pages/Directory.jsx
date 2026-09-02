import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import CreatorCard from '../components/CreatorCard'
import CreatorMap from '../components/CreatorMap'
import MapSkeleton from '../components/network/MapSkeleton'
import BackLink from '../components/BackLink'
import Reveal from '../components/network/Reveal'
import Combobox from '../components/Combobox'
import Icon from '../components/Icon'
import { PageHeader, SkeletonCards, EmptyState } from '../components/ui'
import { platformsForProfile } from '../components/PlatformBadges'
import { loadRelationships } from '../lib/connections'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

const norm = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '')
function distanceKm(aLat, aLng, bLat, bLng) {
  const R = 6371, toRad = (d) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat), dLng = toRad(bLng - aLng)
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(s))
}

// The creator directory: a spacious grid of cards with search + filters
// (name, country visited, language, platform).
export default function Directory() {
  const tr = useT()
  const { user, profile } = useAuth()
  const [creators, setCreators] = useState([])
  const [relationships, setRelationships] = useState(new Map())
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [country, setCountry] = useState('')
  const [language, setLanguage] = useState('')
  const [platform, setPlatform] = useState('')
  const [nearMe, setNearMe] = useState(false)
  // "Who's travelling" filter: when on, the grid shows only creators the map
  // marks as travelling. The map reports that exact set via onTravellersChange.
  const [travelOnly, setTravelOnly] = useState(false)
  const [travellerIds, setTravellerIds] = useState(() => new Set())
  // "My connections" filter: when on, the map + grid show only the viewer's
  // accepted connections. Mutually exclusive with the travel view for clarity.
  const [connectionsOnly, setConnectionsOnly] = useState(false)
  // WHO YOU HAVE AND HAVE NOT MET, AS A FILTER OF ITS OWN (2 Sep 2026).
  //
  // Ethan: "on the filters I want the option to filter by my connections, or by
  // people I haven't connected with before, or just everyone. It doesn't seem
  // to be an option here."
  //
  // Half of it existed and was reachable only from the MAP's view stack (the
  // `connectionsOnly` toggle above) - so the answer to "show me my connections"
  // was a control on a different object, and the other half, "show me everybody
  // I have NOT met", had no answer at all. Which is the more useful of the two:
  // a directory is a place you go to find somebody new.
  //
  // '' | 'connected' | 'new'. It is a separate piece of state from the map's
  // toggle rather than a rename of it, because the map's three views are
  // mutually exclusive with each other and this is not - "my connections who
  // are travelling" is a perfectly good question.
  const [connection, setConnection] = useState('')
  // "Where we have been, together", as a paint layer on the one map rather
  // than as a second map at the foot of the page. See the note at the bottom.
  const [exploredOn, setExploredOn] = useState(false)

  const [trips, setTrips] = useState({}) // creator_id -> upcoming collab trips, soonest first

  useEffect(() => {
    async function load() {
      const today = new Date().toISOString().slice(0, 10)
      const [{ data: profiles }, rels, { data: tripRows }] = await Promise.all([
        // Surface the most recently active creators first, so dormant profiles
        // sink to the bottom.
        supabase.from('profiles').select('*').eq('status', 'active').eq('is_test', false).is('deletion_requested_at', null)
          .order('last_seen_at', { ascending: false, nullsFirst: false })
          .order('created_at', { ascending: false }),
        loadRelationships(user.id),
        // Current + upcoming collab trips drive the map's "travelling now"
        // animation and the "Currently in" chips on the cards.
        supabase.from('collab_posts').select('creator_id, city, country, start_date, end_date')
          .gte('end_date', today).order('start_date'),
      ])
      setCreators(profiles ?? [])
      setRelationships(rels)
      // Keep EVERY upcoming trip per creator (soonest first). The map draws only
      // one journey per creator - its next trip that actually leaves the home
      // country - so someone currently travelling at home (e.g. Belfast while
      // living in Belfast) still shows their next real flight.
      const byCreator = {}
      for (const t of tripRows ?? []) {
        (byCreator[t.creator_id] ||= []).push({ ...t, current: t.start_date <= today })
      }
      setTrips(byCreator)
      setLoading(false)
    }
    load()
  }, [user.id])

  // My location, for the "near me" filter. Prefer my own row in the list; fall
  // back to the auth profile.
  const me = creators.find((c) => c.id === user.id) || profile
  const myLat = me?.city_lat, myLng = me?.city_lng, myCountry = me?.country
  const hasMyLocation = (myLat != null && myLng != null) || !!myCountry

  // Creators near me: within ~1500km if we both have coordinates, otherwise the
  // same country. Excludes me. Keeps the distance so the cards can sort
  // nearest-first while the filter is on.
  const nearDist = useMemo(() => {
    const dist = new Map()
    for (const c of creators) {
      if (c.id === user.id) continue
      if (myLat != null && myLng != null && c.city_lat != null && c.city_lng != null) {
        const d = distanceKm(myLat, myLng, c.city_lat, c.city_lng)
        if (d <= 1500) dist.set(c.id, d)
      } else if (myCountry && c.country && norm(c.country) === norm(myCountry)) {
        dist.set(c.id, 0)
      }
    }
    return dist
  }, [creators, myLat, myLng, myCountry, user.id])
  const nearIds = useMemo(() => new Set(nearDist.keys()), [nearDist])

  // The viewer's accepted connections, from the relationship map.
  const myConnectionIds = useMemo(() => {
    const s = new Set()
    for (const [id, rel] of relationships) if (rel?.relation === 'connected') s.add(id)
    return s
  }, [relationships])
  // The three map views are mutually exclusive: pressing one turns the other
  // two off, so you can never have (say) "my connections" and "who's
  // travelling" filtering the map and the grid at the same time. Pressing the
  // active one again clears it and shows everyone.
  const setView = (view) => {
    setConnectionsOnly(view === 'connections' && !connectionsOnly)
    setTravelOnly(view === 'travel' && !travelOnly)
    setNearMe(view === 'near' && !nearMe)
  }
  const toggleTravel = () => setView('travel')
  const toggleConnections = () => setView('connections')
  const toggleNearMe = () => setView('near')

  // Build the filter dropdowns from real data so they never go stale.
  const allCountries = useMemo(
    () => [...new Set(creators.flatMap((c) => c.countries_visited || []))].sort(),
    [creators]
  )
  const allLanguages = useMemo(
    () => [...new Set(creators.flatMap((c) => c.languages || []))].sort(),
    [creators]
  )

  // THE TRYP.COM TEAM, IN THE DIRECTORY RATHER THAN ON A PAGE OF THEIR OWN.
  //
  // There was a /team page. It should not have existed: the team are people in
  // this community with a job title, and a creator looking for somebody to ask
  // should find them in the same place they find everyone else - with a Connect
  // and a Message button, like everyone else. A separate page is a page you have
  // to be told about, and it made the team feel like staff rather than members.
  //
  // They lead the grid because "who runs this" is a question new creators ask on
  // day one, and they are labelled so nobody has to guess.
  const team = useMemo(
    () => creators
      .filter((c) => c.is_admin && c.id !== user.id)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [creators, user.id],
  )

  // A FILTER FILTERS THE MAP TOO.
  //
  // Ethan: "any filters you add should filter not just the creators below but
  // also the map above." The four fields used to apply to the card grid only,
  // so choosing "Filter by language: Portuguese" left a map of all 43 pins
  // sitting above six cards - and the map is the half of this page that answers
  // "where are the Portuguese speakers", which is the question you were asking
  // when you picked the filter.
  //
  // Only the FIELD filters go through here. Who is travelling, near me and my
  // connections are already the map's own controls (it takes them as props and
  // draws their journeys), so applying them a second time to its input would
  // filter a filtered list.
  //
  // YOU STAY ON THE MAP. The grid-only rules below - drop your own card, drop
  // the team into their own row - deliberately are not applied here: a map of
  // where everyone is with you missing from it is a map that is wrong.
  const fieldFilterOn = !!(search || country || language || platform)
  const matchesFields = (c) => {
    if (search && !c.name?.toLowerCase().includes(search.toLowerCase())) return false
    if (country && !(c.countries_visited || []).includes(country)) return false
    if (language && !(c.languages || []).includes(language)) return false
    if (platform && !platformsForProfile(c).includes(platform)) return false
    return true
  }
  const mapCreators = useMemo(
    () => (fieldFilterOn ? creators.filter(matchesFields) : creators),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [creators, fieldFilterOn, search, country, language, platform],
  )

  const filtered = creators.filter((c) => {
    // YOU ARE NOT IN YOUR OWN DIRECTORY.
    //
    // The grid is ordered by `last_seen_at`, and the person reading the page is
    // by definition the most recently seen creator on it - so the first card in
    // the directory was always your own, every single time you opened it. A
    // directory is a list of other people; there is nothing to do with your own
    // card here (no Connect, no Message) and it pushes a real creator off the
    // first row.
    //
    // The MAP still shows you, deliberately: a map of where everyone is with
    // you missing from it is a map that is wrong, and your own pin is how you
    // find yourself among the others. `creators` is untouched, so the map, the
    // count pill, the near-me distances and the filter dropdowns all still see
    // the whole roster - only the card grid drops you.
    if (c.id === user.id) return false
    // Admins appear in the team row above the grid. They come BACK into the
    // grid the moment a filter is on, because a search that hides a match is a
    // search that is lying.
    if (c.is_admin && !search && !country && !language && !platform && !connection && !connectionsOnly && !travelOnly && !nearMe) return false
    if (connectionsOnly && !myConnectionIds.has(c.id)) return false
    if (connection === 'connected' && !myConnectionIds.has(c.id)) return false
    if (connection === 'new' && myConnectionIds.has(c.id)) return false
    if (travelOnly && !travellerIds.has(c.id)) return false
    if (nearMe && !nearIds.has(c.id)) return false
    return matchesFields(c)
  })
  // While "near me" is on, the closest creators come first.
  if (nearMe) filtered.sort((a, b) => (nearDist.get(a.id) ?? Infinity) - (nearDist.get(b.id) ?? Infinity))

  return (
    <div className="page">
      <BackLink />
      {/* NO "MY CONNECTIONS" BUTTON. It was put here as a door to a page
          nothing pointed at, which was a real problem at the time and is not
          one any more: Connections is its own page in its own right, reachable
          from the avatar menu and from every empty state that has a reason to
          send you there. Ethan: "we can remove the My connections button at the
          top - we have its own page for it, we don't need it at the top of the
          map." A header button that duplicates navigation is a second answer to
          a question the nav already answers. The map's own "My connections"
          FILTER stays; that is a different thing, and it narrows this page
          rather than leaving it. */}
      <PageHeader
        title={tr("Creator Network")}
        subtitle={tr("Discover the community. Connect with creators, start conversations, make friends, plan trips together and collab.")}
      />

      {/* THE MAP HAS NO HEADING OF ITS OWN.
          It had "Creator map" over it in 24px type, which is a label on the one
          object on the page that needs no label. Ethan: "we don't need a
          separate title saying creator map, you can remove it. Instead the 45
          creators from around the world could be a small but long horizontal
          card above the map, same width."

          THE COUNT IS PART OF THE MAP CARD, NOT A STRIP ABOVE IT. It used to be
          this page's own brand-tinted bar with `rounded-t-card border-b-0`,
          stacked on a map that draws its own white card with its own grey
          border - two borders, two colours, two corner radii meeting in the
          middle. Ethan: "the card above the map where it shows 45 creators
          around the world does not look right, it's a different colour and it
          doesn't sit cleanly integrated with the map card." It is passed INTO
          the map now and drawn inside its frame, so there is one card.

          It still counts WHAT IS ON THE MAP: it used to say "43 creators from
          around the world" over a map showing six of them, which is a caption
          contradicting its own picture. */}
      <section className="mb-10">
        {loading ? (
          <MapSkeleton header />
        ) : (
          <CreatorMap
            header={
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand">
                  <Icon name="users" className="h-4 w-4" />
                </span>
                {/* ONE SENTENCE, WITH THE NUMBER IN IT. It was a bold count
                    followed by a fragment assembled from two ternaries, which
                    is exactly the shape lib/i18n cannot translate: a translator
                    handed " creators from around the world" has no sentence to
                    put it in, and Spanish would not agree the verb the same
                    way. The number keeps its weight through a nested span. */}
                <span className="text-sm text-smoke">
                  {fieldFilterOn
                    ? (mapCreators.length === 1
                      ? tr('1 creator matches your filters')
                      : tr('{n} creators match your filters', { n: mapCreators.length }))
                    : (mapCreators.length === 1
                      ? tr('1 creator from around the world')
                      : tr('{n} creators from around the world', { n: mapCreators.length }))}
                </span>
                {exploredOn && (
                  <span className="ml-auto text-xs font-medium text-brand">
                    {tr('{n} countries filmed in between us', { n: allCountries.length })}
                  </span>
                )}
              </div>
            }
            creators={mapCreators}
            trips={trips}
            highlightIds={nearMe ? nearIds : null}
            nearMe={nearMe}
            nearCount={nearIds.size}
            nearMeDisabled={!hasMyLocation}
            onToggleNearMe={toggleNearMe}
            travelActive={travelOnly}
            onToggleTravel={toggleTravel}
            onTravellersChange={setTravellerIds}
            connectionsActive={connectionsOnly}
            onToggleConnections={toggleConnections}
            connectionIds={myConnectionIds}
            exploredCountries={allCountries}
            exploredActive={exploredOn}
            onToggleExplored={() => setExploredOn((v) => !v)}
            myId={user.id}
          />
        )}
      </section>

      {/* Search + filters */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          type="search" className="input" placeholder={tr("Search by name…")}
          value={search} onChange={(e) => setSearch(e.target.value)} aria-label={tr("Search creators by name")}
        />
        <Combobox value={country} onChange={setCountry} options={allCountries} placeholder={tr("Any country visited")} ariaLabel="Filter by country visited" />
        <Combobox value={language} onChange={setLanguage} options={allLanguages} placeholder={tr("Any language")} ariaLabel="Filter by language" />
        <Combobox value={platform} onChange={setPlatform} options={['Instagram', 'TikTok', 'YouTube']} placeholder={tr("Any platform")} ariaLabel="Filter by platform" />
      </div>

      {/* WHO YOU HAVE MET, UNDER THE FOUR FIELDS RATHER THAN INSIDE THEM.
          Ethan asked for the option and asked for the four-card filter row not
          to be altered, so it is its own strip: three states, one of them on,
          in the same pill language the leaderboard's market chips and the
          challenge board's group tabs already use. A dropdown would have been a
          fifth cell in a grid built for four. */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5 rounded-card border border-gray-100 bg-white p-1.5 shadow-card">
        {[
          { key: '', label: tr('Everyone') },
          { key: 'connected', label: tr('My connections') },
          { key: 'new', label: tr('Not connected yet') },
        ].map((o) => (
          <button
            key={o.key || 'all'}
            type="button"
            onClick={() => setConnection(o.key)}
            aria-pressed={connection === o.key}
            className={cx(
              'rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
              connection === o.key ? 'bg-brand text-white' : 'text-smoke hover:bg-cloud hover:text-ink',
            )}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* Active "who's travelling" note, so it's obvious why the grid is filtered. */}
      {travelOnly && (
        <div className="mb-6 flex items-center gap-2 text-sm text-smoke">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-brand" fill="currentColor" aria-hidden>
            <path d="M12 1.55 C13.05 1.55 13.71 3.45 13.71 6.11 L13.71 7.82 L21.5 12.95 L21.5 14.95 L13.71 11.81 L13.71 16.75 L16.18 19.22 L16.18 20.74 L12 19.32 L7.82 20.74 L7.82 19.22 L10.29 16.75 L10.29 11.81 L2.5 14.95 L2.5 12.95 L10.29 7.82 L10.29 6.11 C10.29 3.45 10.95 1.55 12 1.55 Z" />
          </svg>
          Showing the {travellerIds.size} creator{travellerIds.size === 1 ? '' : 's'} with an upcoming trip.
          <button onClick={() => setTravelOnly(false)} className="font-medium text-brand hover:underline">{tr("Show everyone")}</button>
        </div>
      )}

      {/* Active near-me note, so it's obvious why the grid is filtered. */}
      {nearMe && (
        <div className="mb-6 flex items-center gap-2 text-sm text-smoke">
          <Icon name="pin" className="h-4 w-4 text-brand" />
          Showing the {nearIds.size} creator{nearIds.size === 1 ? '' : 's'} nearest to you, closest first.
          <button onClick={() => setNearMe(false)} className="font-medium text-brand hover:underline">{tr("Show everyone")}</button>
        </div>
      )}

      {/* Active "my connections" note. */}
      {connectionsOnly && (
        <div className="mb-6 flex items-center gap-2 text-sm text-smoke">
          <Icon name="users" className="h-4 w-4 text-brand" />
          {myConnectionIds.size > 0
            ? `Showing your ${myConnectionIds.size} connection${myConnectionIds.size === 1 ? '' : 's'}.`
            : "You haven't connected with anyone yet - browse creators and send a request."}
          <button onClick={() => setConnectionsOnly(false)} className="font-medium text-brand hover:underline">{tr("Show everyone")}</button>
        </div>
      )}

      {!loading && team.length > 0 && !search && !country && !language && !platform && !connection && !connectionsOnly && !travelOnly && !nearMe && (
        <section className="mb-10">
          <div className="mb-3">
            <h2 className="text-lg font-semibold">{tr("The Tryp.com team")}</h2>
            <p className="mt-0.5 text-sm text-smoke">
              {tr("We are in the community too. Connect or message any of us.")}
            </p>
          </div>
          <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2" stagger={0.05}>
            {team.map((c) => (
              <CreatorCard
                key={c.id}
                creator={c}
                relation={relationships.get(c.id) || null}
                onRelationChange={(id, next) =>
                  setRelationships((prev) => {
                    const map = new Map(prev)
                    next ? map.set(id, next) : map.delete(id)
                    return map
                  })
                }
              />
            ))}
          </Reveal>
        </section>
      )}

      {loading ? (
        <SkeletonCards count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Icon name="magnifier" className="h-7 w-7" />}
          title={tr("No creators match those filters")}
          hint={tr("Try removing a filter or searching a different name.")}
          action={
            <button onClick={() => { setSearch(''); setCountry(''); setLanguage(''); setPlatform(''); setConnection(''); setNearMe(false); setTravelOnly(false); setConnectionsOnly(false) }} className="btn-secondary">
              {tr("Clear filters")}
            </button>
          }
        />
      ) : (
        /* TWO ACROSS, NOT FOUR. See the long note in CreatorCard: at four
           across a card is 260px wide and everything in it is a compression.
           `sm:grid-cols-2` and nothing above it, so the card gets the width at
           every size where there is width to give. */
        <Reveal className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {/* The FIRST card carries the walkthrough anchor. Highlighting the
              whole card rather than the Connect button inside it is deliberate:
              the button is three components deep and threading an attribute
              down to it would break the moment somebody reorders the card, and
              a highlighted card with "press Connect on anybody here" reads
              exactly as well. See lib/tour.js. */}
          {filtered.map((c, cardIndex) => (
            <CreatorCard
              key={c.id}
              data-tour={cardIndex === 0 ? 'creator-card' : undefined}
              creator={c}
              currentTrip={trips[c.id]?.[0]?.current ? trips[c.id][0] : null}
              relation={relationships.get(c.id) || null}
              onRelationChange={(id, next) =>
                setRelationships((prev) => {
                  const map = new Map(prev)
                  next ? map.set(id, next) : map.delete(id)
                  return map
                })
              }
            />
          ))}
        </Reveal>
      )}

      {/* "WHERE WE HAVE BEEN, TOGETHER" IS NOT A SECOND MAP ANY MORE.
          There was a whole extra WorldMap here, three screens below the creator
          map, painting every country anybody in the network has filmed in.
          Ethan asked for it to become a button on the map that is already on
          the page, and that is what `exploredOn` drives - see the "Been
          together" toggle in CreatorMap's filter stack. One atlas, one map, and
          the answer appears where you are already looking. */}
    </div>
  )
}
