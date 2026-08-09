import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import CreatorCard from '../components/CreatorCard'
import CreatorMap from '../components/CreatorMap'
import WorldMap from '../components/WorldMap'
import Combobox from '../components/Combobox'
import Icon from '../components/Icon'
import { PageHeader, SkeletonCards, EmptyState } from '../components/ui'
import { platformsForProfile } from '../components/PlatformBadges'
import { loadRelationships } from '../lib/connections'

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

  const filtered = creators.filter((c) => {
    if (connectionsOnly && !myConnectionIds.has(c.id)) return false
    if (travelOnly && !travellerIds.has(c.id)) return false
    if (nearMe && !nearIds.has(c.id)) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    if (country && !(c.countries_visited || []).includes(country)) return false
    if (language && !(c.languages || []).includes(language)) return false
    if (platform && !platformsForProfile(c).includes(platform)) return false
    return true
  })
  // While "near me" is on, the closest creators come first.
  if (nearMe) filtered.sort((a, b) => (nearDist.get(a.id) ?? Infinity) - (nearDist.get(b.id) ?? Infinity))

  return (
    <div className="page">
      <PageHeader
        title="Creators"
        subtitle="Meet the community. Connect, message, and find your next collab partner."
      />

      {/* Creator map: where everyone in the community is based. The creator
          count sits on the right, directly above the map. */}
      <section className="mb-10">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-semibold text-ink sm:text-2xl">Creator map</h2>
          {!loading && (
            <div className="inline-flex items-center gap-2.5 rounded-full border border-brand/20 bg-brand-tint/40 px-4 py-2 text-sm">
              <Icon name="users" className="h-4 w-4 shrink-0 text-brand" />
              <span className="font-semibold text-brand">{creators.length}</span>
              <span className="text-smoke">creator{creators.length === 1 ? '' : 's'} from around the world</span>
            </div>
          )}
        </div>
        {loading ? (
          <div className="h-[340px] w-full animate-pulse rounded-card bg-cloud/70 sm:h-[420px]" />
        ) : (
          <CreatorMap
            creators={creators}
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
            myId={user.id}
          />
        )}
      </section>

      {/* Search + filters */}
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          type="search" className="input" placeholder="Search by name…"
          value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search creators by name"
        />
        <Combobox value={country} onChange={setCountry} options={allCountries} placeholder="Any country visited" ariaLabel="Filter by country visited" />
        <Combobox value={language} onChange={setLanguage} options={allLanguages} placeholder="Any language" ariaLabel="Filter by language" />
        <Combobox value={platform} onChange={setPlatform} options={['Instagram', 'TikTok', 'YouTube']} placeholder="Any platform" ariaLabel="Filter by platform" />
      </div>

      {/* Active "who's travelling" note, so it's obvious why the grid is filtered. */}
      {travelOnly && (
        <div className="mb-6 flex items-center gap-2 text-sm text-smoke">
          <svg viewBox="0 0 24 24" className="h-4 w-4 text-brand" fill="currentColor" aria-hidden>
            <path d="M12 1.55 C13.05 1.55 13.71 3.45 13.71 6.11 L13.71 7.82 L21.5 12.95 L21.5 14.95 L13.71 11.81 L13.71 16.75 L16.18 19.22 L16.18 20.74 L12 19.32 L7.82 20.74 L7.82 19.22 L10.29 16.75 L10.29 11.81 L2.5 14.95 L2.5 12.95 L10.29 7.82 L10.29 6.11 C10.29 3.45 10.95 1.55 12 1.55 Z" />
          </svg>
          Showing the {travellerIds.size} creator{travellerIds.size === 1 ? '' : 's'} with an upcoming trip.
          <button onClick={() => setTravelOnly(false)} className="font-medium text-brand hover:underline">Show everyone</button>
        </div>
      )}

      {/* Active near-me note, so it's obvious why the grid is filtered. */}
      {nearMe && (
        <div className="mb-6 flex items-center gap-2 text-sm text-smoke">
          <Icon name="pin" className="h-4 w-4 text-brand" />
          Showing the {nearIds.size} creator{nearIds.size === 1 ? '' : 's'} nearest to you, closest first.
          <button onClick={() => setNearMe(false)} className="font-medium text-brand hover:underline">Show everyone</button>
        </div>
      )}

      {/* Active "my connections" note. */}
      {connectionsOnly && (
        <div className="mb-6 flex items-center gap-2 text-sm text-smoke">
          <Icon name="users" className="h-4 w-4 text-brand" />
          {myConnectionIds.size > 0
            ? `Showing your ${myConnectionIds.size} connection${myConnectionIds.size === 1 ? '' : 's'}.`
            : "You haven't connected with anyone yet - browse creators and send a request."}
          <button onClick={() => setConnectionsOnly(false)} className="font-medium text-brand hover:underline">Show everyone</button>
        </div>
      )}

      {loading ? (
        <SkeletonCards count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Icon name="magnifier" className="h-7 w-7" />}
          title="No creators match those filters"
          hint="Try removing a filter or searching a different name."
          action={
            <button onClick={() => { setSearch(''); setCountry(''); setLanguage(''); setPlatform(''); setNearMe(false); setTravelOnly(false); setConnectionsOnly(false) }} className="btn-secondary">
              Clear filters
            </button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((c) => (
            <CreatorCard
              key={c.id}
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
        </div>
      )}

      {/* ---------- Where we have been, together ----------
          Moved here from the Worldwide hub, which now carries the creator map
          instead. A hub is for finding people; a directory is already about the
          community, so a picture of everywhere that community has been belongs
          at the end of it rather than in place of the people. */}
      {allCountries.length > 0 && (
        <section className="mt-14">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Icon name="globe" className="h-5 w-5 text-brand" /> Where we have been, together
          </h2>
          <p className="mb-4 mt-1 text-sm text-smoke">
            Every country somebody in the network has filmed in. {allCountries.length} so far.
          </p>
          <WorldMap selected={allCountries} />
        </section>
      )}
    </div>
  )
}
