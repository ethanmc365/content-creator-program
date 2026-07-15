import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import WorldMap from './WorldMap'
import Icon from './Icon'
import { Avatar } from './ui'

// A single creator, rotating daily (deterministic UTC-day index, so everyone
// sees the same person on a given day and it changes each day). Shows their
// photo, bio, travel map, and any travel photos they've uploaded. Slots on Home
// under "Creators on the move".
export default function CreatorSpotlight() {
  const [creator, setCreator] = useState(null)
  const [photos, setPhotos] = useState([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: pool } = await supabase
        .from('profiles')
        .select('id, name, photo_url, bio, about, city, country, countries_visited')
        .eq('status', 'active').eq('is_admin', false).eq('is_test', false)
        .is('deletion_requested_at', null)
        .order('created_at', { ascending: true })
      if (!alive) return
      const list = pool ?? []
      if (list.length === 0) { setLoaded(true); return }
      // Deterministic daily rotation: same creator for everyone on a given
      // (UTC) day, advancing by one each day.
      const dayIndex = Math.floor(Date.now() / 86_400_000)
      const pick = list[dayIndex % list.length]
      setCreator(pick)
      const { data: pics } = await supabase
        .from('creator_photos').select('id, photo_url, caption')
        .eq('creator_id', pick.id).order('sort_order').limit(4)
      if (!alive) return
      setPhotos(pics ?? [])
      setLoaded(true)
    })()
    return () => { alive = false }
  }, [])

  if (!loaded || !creator) return null
  const firstName = creator.name?.split(' ')[0] ?? 'This creator'

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon name="star" className="h-5 w-5 text-brand" /> Creator spotlight</h2>
        <span className="text-xs text-smoke">Featured today</span>
      </div>
      <div className="card !p-5 sm:!p-6">
        <div className="flex flex-col gap-5 sm:flex-row">
          {/* Identity + bio + photos */}
          <div className="min-w-0 flex-1">
            <Link to={`/profile/${creator.id}`} className="group flex items-center gap-4">
              <Avatar src={creator.photo_url} name={creator.name} size="lg" />
              <div className="min-w-0">
                <p className="truncate text-lg font-bold group-hover:text-brand">{creator.name}</p>
                {(creator.city || creator.country) && (
                  <p className="truncate text-sm text-smoke">{[creator.city, creator.country].filter(Boolean).join(', ')}</p>
                )}
              </div>
            </Link>
            {(creator.bio || creator.about) && (
              <p className="mt-4 text-sm leading-relaxed text-smoke line-clamp-4">{creator.bio || creator.about}</p>
            )}
            {photos.length > 0 && (
              <div className="mt-4 grid grid-cols-4 gap-2">
                {photos.map((p) => (
                  <img key={p.id} src={p.photo_url} alt={p.caption || 'Travel photo'} loading="lazy" className="aspect-square w-full rounded-xl object-cover" />
                ))}
              </div>
            )}
            <Link to={`/profile/${creator.id}`} className="btn-secondary mt-5 inline-flex !py-2 text-xs">View profile →</Link>
          </div>
          {/* Their travel map */}
          {creator.countries_visited?.length > 0 && (
            <div className="shrink-0 sm:w-80">
              <p className="mb-2 text-xs font-medium text-smoke">{firstName} has visited {creator.countries_visited.length} countries</p>
              <div className="overflow-hidden rounded-card border border-gray-100">
                <WorldMap selected={creator.countries_visited} />
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
