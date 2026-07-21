import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { loadRelationship } from '../lib/connections'
import ConnectButton from './ConnectButton'
import WorldMap from './WorldMap'
import Icon from './Icon'
import { Avatar } from './ui'

// A single creator, rotating daily (deterministic UTC-day index, so everyone
// sees the same person on a given day and it changes each day). Shows their
// photo, bio, travel map, and any travel photos they've uploaded. Slots on Home
// under "Creators on the move".
export default function CreatorSpotlight() {
  const { user } = useAuth()
  const [creator, setCreator] = useState(null)
  const [photos, setPhotos] = useState([])
  const [relation, setRelation] = useState(null) // my connection status with the featured creator
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
      // My connection status with today's featured creator (skip if it's me).
      if (user?.id && pick.id !== user.id) {
        const rel = await loadRelationship(user.id, pick.id)
        if (!alive) return
        setRelation(rel)
      }
      setLoaded(true)
    })()
    return () => { alive = false }
  }, [user?.id])

  if (!loaded || !creator) return null
  const firstName = creator.name?.split(' ')[0] ?? 'This creator'
  const isMe = user?.id === creator.id

  return (
    <section>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon name="star" className="h-5 w-5 text-brand" /> Creator spotlight</h2>
        <span className="text-xs text-smoke">Featured today</span>
      </div>
      <div className="card !p-5 sm:!p-6">
        <div className="flex flex-col gap-6 lg:flex-row">
          {/* Identity + bio + photos */}
          <div className="flex min-w-0 flex-1 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Link to={`/profile/${creator.id}`} className="group flex min-w-0 items-center gap-4">
                <Avatar src={creator.photo_url} name={creator.name} size="lg" />
                <div className="min-w-0">
                  <p className="truncate text-lg font-bold group-hover:text-brand">{creator.name}</p>
                  {(creator.city || creator.country) && (
                    <p className="truncate text-sm text-smoke">{[creator.city, creator.country].filter(Boolean).join(', ')}</p>
                  )}
                </div>
              </Link>
              <div className="hidden items-center gap-2 sm:flex">
                {!isMe && (
                  <ConnectButton myId={user.id} targetId={creator.id} relation={relation} onChange={setRelation} className="!py-2 text-xs" />
                )}
                <Link to={`/profile/${creator.id}`} className="btn-secondary !py-2 text-xs">View profile →</Link>
              </div>
            </div>
            {(creator.bio || creator.about) && (
              <p className="mt-4 max-w-2xl text-sm leading-relaxed text-smoke line-clamp-3">{creator.bio || creator.about}</p>
            )}
            {photos.length > 0 && (
              <div className="mt-5 grid grid-cols-4 gap-2.5">
                {photos.map((p) => (
                  <img key={p.id} src={p.photo_url} alt={p.caption || 'Travel photo'} loading="lazy" className="aspect-square w-full rounded-xl object-cover" />
                ))}
              </div>
            )}
            <div className="mt-5 flex items-center gap-2 self-start sm:hidden">
              {!isMe && (
                <ConnectButton myId={user.id} targetId={creator.id} relation={relation} onChange={setRelation} className="!py-2 text-xs" />
              )}
              <Link to={`/profile/${creator.id}`} className="btn-secondary inline-flex !py-2 text-xs">View profile →</Link>
            </div>
          </div>

          {/* Their travel map: zoomed to the countries they've actually
              visited (fitSelected) so it fills the panel instead of floating
              small in an empty world. Vertically centred against the card. */}
          {creator.countries_visited?.length > 0 && (
            <div className="shrink-0 self-center lg:w-[26rem]">
              <div className="relative overflow-hidden rounded-card border border-gray-100">
                <WorldMap selected={creator.countries_visited} fitSelected />
                <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between gap-3 bg-gradient-to-b from-white/95 via-white/70 to-transparent px-4 pb-6 pt-3">
                  <p className="text-xs font-semibold text-ink">{firstName}'s travel map</p>
                  <span className="rounded-full bg-brand-tint px-2.5 py-1 text-[11px] font-bold text-brand">
                    {creator.countries_visited.length} {creator.countries_visited.length === 1 ? 'country' : 'countries'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
