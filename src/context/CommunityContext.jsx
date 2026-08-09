import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'
import { isNetworkPreviewOn, setNetworkPreview, subscribeToFlags } from '../lib/featureFlags'

// Who am I, in which communities, and which one am I looking at right now.
//
// This provider is DELIBERATELY INERT until the network preview flag is on. With
// the flag off it does not issue a single query, so mounting it around the whole
// app costs a live UK creator nothing at all and cannot introduce a new failure
// mode on a page they use today.
const CommunityContext = createContext(null)

// The two platform roles that can run the network. Kept as a function rather
// than inlined so there is exactly one place to add a third.
export function isGlobalRole(role) {
  return role === 'global_admin' || role === 'owner'
}

export function CommunityProvider({ children }) {
  const { session, profile, isAdmin } = useAuth()
  // The flag AND admin, matching NetworkRoute. A creator with a hand-set
  // localStorage key gets an inert provider that issues no queries and shows no
  // preview pill, rather than a half-rendered shell.
  const [flag, setFlag] = useState(isNetworkPreviewOn)
  const preview = flag && isAdmin
  const [memberships, setMemberships] = useState([])
  const [communities, setCommunities] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => subscribeToFlags(() => setFlag(isNetworkPreviewOn())), [])

  const load = useCallback(async () => {
    if (!session?.user || !preview) {
      setMemberships([])
      setCommunities([])
      return
    }
    setLoading(true)
    setError('')
    // Two reads rather than one embedded select. The membership roster and the
    // community list have different RLS shapes (you can see every ACTIVE
    // community, but only the rosters of the ones you are in), and an embedded
    // join would silently return the intersection of the two.
    const [{ data: mems, error: memErr }, { data: comms, error: commErr }] = await Promise.all([
      supabase
        .from('community_members')
        .select('community_id, role, is_home, status')
        .eq('profile_id', session.user.id)
        .eq('status', 'active'),
      supabase
        .from('communities')
        .select('id, slug, name, kind, country_codes, currency, timezone, language, is_active, cpm_target, prize_baseline, tagline, join_policy, settings, lead_id, retired_at')
        .order('kind', { ascending: false })
        .order('name'),
    ])
    if (memErr || commErr) {
      // The most likely cause by far is that migration 073/074 has not been
      // applied yet, so the tables are still deny-all. Say so plainly instead of
      // rendering an empty shell that looks like a bug in the UI.
      setError(memErr?.message || commErr?.message || 'Could not load communities.')
      setLoading(false)
      return
    }
    setMemberships(mems || [])
    setCommunities(comms || [])
    setLoading(false)
  }, [session, preview])

  useEffect(() => { load() }, [load])

  const byId = new Map(communities.map((c) => [c.id, c]))
  const myCommunities = memberships
    .map((m) => (byId.get(m.community_id) ? { ...byId.get(m.community_id), membership: m } : null))
    .filter(Boolean)

  const network = communities.find((c) => c.kind === 'network') || null
  // A RETIRED market keeps all its data and disappears from the lists creators
  // browse. It stays visible to the team, because the reason to retire rather
  // than delete is being able to look at what happened afterwards.
  const chapters = communities.filter(
    (c) => c.kind === 'chapter' && (!c.retired_at || isGlobalRole(profile?.platform_role)),
  )
  const myChapters = myCommunities.filter((c) => c.kind === 'chapter')
  const home = myCommunities.find((c) => c.membership.is_home) || null

  const value = {
    preview,
    enterPreview: () => setNetworkPreview(true),
    exitPreview: () => setNetworkPreview(false),
    loading,
    error,
    reload: load,
    communities,
    memberships,
    myCommunities,
    myChapters,
    chapters,
    network,
    home,
    // Platform role, not a membership. `is_admin` is the old boolean and is still
    // what gates the admin routes; this is what the new shell reads.
    //
    // `owner` is a global admin AND MORE. Testing for equality with
    // 'global_admin' is the trap here: the moment the programme lead's row was
    // given its own role, every admin surface in the shell would have vanished
    // for the one person who runs the platform. Read it through the helper.
    isGlobalAdmin: isGlobalRole(profile?.platform_role),
    isOwner: profile?.platform_role === 'owner',
    roleTitle: profile?.role_title || null,
    manages: (communityId) =>
      isGlobalRole(profile?.platform_role)
      || memberships.some((m) => m.community_id === communityId && m.role === 'manager'),
    bySlug: (slug) => communities.find((c) => c.slug === slug) || null,
  }

  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>
}

export function useCommunity() {
  const ctx = useContext(CommunityContext)
  if (!ctx) throw new Error('useCommunity must be used inside <CommunityProvider>')
  return ctx
}
