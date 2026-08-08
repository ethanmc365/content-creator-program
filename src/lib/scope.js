import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Which markets is the signed-in creator in?
//
// This is deliberately NOT CommunityContext. That provider is inert unless the
// network preview flag is on, because it exists to power the new shell. This
// hook is the opposite: it is tiny, always on, and exists so the pages 43 live
// creators use every day (challenges, most obviously) can scope themselves to
// the viewer's own market.
//
// WHY THE CLIENT FILTERS AT ALL WHEN RLS ALREADY DOES
//
// The `challenges` select policy ends in `or is_admin()`. That is correct: an
// admin genuinely does need to read every market's challenges to run the
// programme. But it means an admin opening /challenges sees Spain's live card
// sitting above the UK one, and any "how many creators have posted" maths
// computed over the whole list attaches itself to the wrong challenge. RLS
// decides what you MAY read; this decides what this PAGE is about.
//
// Cached in a module-level promise: the answer cannot change inside a session
// without a membership write, and three pages asking at once should be one
// round trip.
let cache = null

export function loadMyScopes() {
  if (cache) return cache
  cache = (async () => {
    const { data: { user } = {} } = await supabase.auth.getUser()
    if (!user) return { ids: new Set(), homeId: null, rows: [] }
    const { data, error } = await supabase
      .from('community_members')
      .select('community_id, role, is_home')
      .eq('profile_id', user.id)
      .eq('status', 'active')
    // A read failure must fail OPEN. If the membership tables are unreadable for
    // any reason, showing a creator every challenge is the behaviour they had
    // before markets existed; showing them none would empty the page they use
    // to enter the live challenge.
    if (error || !data) return { ids: null, homeId: null, rows: [] }
    return {
      ids: new Set(data.map((r) => r.community_id)),
      homeId: data.find((r) => r.is_home)?.community_id ?? null,
      rows: data,
    }
  })()
  return cache
}

export function clearScopeCache() {
  cache = null
}

export function useMyScopes() {
  const [state, setState] = useState({ ids: null, homeId: null, rows: [], loading: true })
  useEffect(() => {
    let alive = true
    loadMyScopes().then((s) => { if (alive) setState({ ...s, loading: false }) })
    return () => { alive = false }
  }, [])
  return state
}

// `ids === null` means "we could not tell", which must behave like the
// pre-markets world: everything is in scope. An unscoped row (community_id
// null) is always in scope, so a challenge created by a code path that forgets
// the column degrades to the old behaviour instead of vanishing.
export function inScope(scopeIds, communityId) {
  if (!communityId) return true
  if (!scopeIds) return true
  return scopeIds.has(communityId)
}
