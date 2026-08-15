import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import CreatorMap from '../CreatorMap'
import Icon from '../Icon'
import MapSkeleton from './MapSkeleton'

// Where this market's creators actually are.
//
// The worldwide map answers "how far does this thing reach"; at 13 nations it
// is a scatter you read as a shape. This answers a different and more useful
// question for somebody inside a market: who is near me, and which cities are
// we actually covering. Spain at world zoom is a smudge; Spain at its own zoom
// is Madrid, Valencia and a gap where Seville should be.
//
// It is the same CreatorMap, given a narrower set and permission to zoom in
// further. Building a second map component would have meant a second set of
// projection constants and a second answer to the pin-clustering question.

export default function MarketMap({ marketId, marketName, showOnMapOnly = true }) {
  const [creators, setCreators] = useState(null)

  useEffect(() => {
    if (!marketId) return
    let alive = true
    supabase
      .from('community_members')
      .select('profiles!inner(id, name, photo_url, city, country, city_lat, city_lng, is_admin, is_test, status, show_on_map, countries_visited)')
      .eq('community_id', marketId)
      .eq('status', 'active')
      .eq('profiles.status', 'active')
      .eq('profiles.is_test', false)
      // CREATORS, NOT STAFF. The programme lead is a member of every market so
      // that the rooms and standings work, and their pin is wherever they live.
      // Without this filter "Where we are in Germany" drew one pin on the UK,
      // which is a map of the person reading it rather than of the market.
      .eq('profiles.is_admin', false)
      .then(({ data }) => {
        if (!alive) return
        setCreators(
          (data || [])
            .map((r) => r.profiles)
            // The privacy opt-out is honoured here exactly as it is on the
            // public map. A creator who hid themselves did not mean "except
            // from my own market".
            .filter((p) => (showOnMapOnly ? p.show_on_map !== false : true)),
        )
      })
    return () => { alive = false }
  }, [marketId, showOnMapOnly])

  if (creators === null) return <MapSkeleton />

  const located = creators.filter((c) => c.city_lat != null || c.city || c.country)

  if (located.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-gray-200 px-6 py-10 text-center">
        <Icon name="pin" className="mx-auto h-7 w-7 text-gray-200" />
        <p className="mt-3 text-sm font-medium">No pins in {marketName} yet</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-smoke">
          Creators appear here once they add their town. Yours is in your profile.
        </p>
      </div>
    )
  }

  return (
    <CreatorMap
      // Everybody, not just the ones with a pin. A creator with no town still
      // has a travel list, and tapping Japan should find them.
      creators={creators}
      // Much closer than the world map's ceiling: a single-country market wants
      // city separation, not continent shape.
      maxFitZoom={22}
      controls={false}
    />
  )
}
