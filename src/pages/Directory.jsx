import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import CreatorCard from '../components/CreatorCard'
import CreatorMap from '../components/CreatorMap'
import { PageHeader, SkeletonCards, EmptyState } from '../components/ui'
import { platformsForProfile } from '../components/PlatformBadges'
import { loadRelationships } from '../lib/connections'

// The creator directory: a spacious grid of cards with search + filters
// (name, country visited, language, platform).
export default function Directory() {
  const { user } = useAuth()
  const [creators, setCreators] = useState([])
  const [relationships, setRelationships] = useState(new Map())
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [country, setCountry] = useState('')
  const [language, setLanguage] = useState('')
  const [platform, setPlatform] = useState('')

  useEffect(() => {
    async function load() {
      const [{ data: profiles }, rels] = await Promise.all([
        supabase.from('profiles').select('*').eq('status', 'active').eq('is_test', false).is('deletion_requested_at', null).order('created_at', { ascending: false }),
        loadRelationships(user.id),
      ])
      setCreators(profiles ?? [])
      setRelationships(rels)
      setLoading(false)
    }
    load()
  }, [user.id])

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
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    if (country && !(c.countries_visited || []).includes(country)) return false
    if (language && !(c.languages || []).includes(language)) return false
    if (platform && !platformsForProfile(c).includes(platform)) return false
    return true
  })

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
          <CreatorMap creators={creators} />
        )}
      </section>

      {/* Search + filters */}
      <div className="mb-10 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <input
          type="search" className="input" placeholder="Search by name…"
          value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search creators by name"
        />
        <select className="input" value={country} onChange={(e) => setCountry(e.target.value)} aria-label="Filter by country visited">
          <option value="">Any country visited</option>
          {allCountries.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select className="input" value={language} onChange={(e) => setLanguage(e.target.value)} aria-label="Filter by language">
          <option value="">Any language</option>
          {allLanguages.map((l) => <option key={l}>{l}</option>)}
        </select>
        <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value)} aria-label="Filter by platform">
          <option value="">Any platform</option>
          <option>Instagram</option>
          <option>TikTok</option>
          <option>YouTube</option>
        </select>
      </div>

      {loading ? (
        <SkeletonCards count={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          emoji="🔍"
          title="No creators match those filters"
          hint="Try removing a filter or searching a different name."
          action={
            <button onClick={() => { setSearch(''); setCountry(''); setLanguage(''); setPlatform('') }} className="btn-secondary">
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
