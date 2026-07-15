import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import CreatorCard from '../components/CreatorCard'
import CreatorMap from '../components/CreatorMap'
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

  const [trips, setTrips] = useState({}) // creator_id -> next collab trip

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
      const byCreator = {}
      for (const t of tripRows ?? []) {
        if (!byCreator[t.creator_id]) byCreator[t.creator_id] = { ...t, current: t.start_date <= today }
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

      {/* Creator map: where everyone in the community is based */}
      <section className="mb-10">
        <div className="mb-3 flex items-baseline justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">Creator map</h2>
          <p className="text-sm text-smoke">
            {loading ? 'Loading…' : `${creators.length} creator${creators.length === 1 ? '' : 's'} around the world`}
          </p>
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
            onToggleNearMe={() => setNearMe((v) => !v)}
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

      {/* Active near-me note, so it's obvious why the grid is filtered. */}
      {nearMe && (
        <div className="mb-6 flex items-center gap-2 text-sm text-smoke">
          <Icon name="pin" className="h-4 w-4 text-brand" />
          Showing the {nearIds.size} creator{nearIds.size === 1 ? '' : 's'} nearest to you, closest first.
          <button onClick={() => setNearMe(false)} className="font-medium text-brand hover:underline">Show everyone</button>
        </div>
      )}

      {loading ? (
        <SkeletonCards count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          emoji="🔍"
          title="No creators match those filters"
          hint="Try removing a filter or searching a different name."
          action={
            <button onClick={() => { setSearch(''); setCountry(''); setLanguage(''); setPlatform(''); setNearMe(false) }} className="btn-secondary">
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
              currentTrip={trips[c.id]?.current ? trips[c.id] : null}
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
    </div>
  )
}
