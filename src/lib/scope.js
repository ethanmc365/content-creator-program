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
    // "NOBODY IS SIGNED IN YET" IS NOT "THIS PERSON IS IN NO MARKETS", AND THE
    // DIFFERENCE EMPTIED THE CHALLENGES PAGE.
    //
    // THE BUG THIS FIXES. This returned `ids: new Set()` - an empty set, which
    // `inScope` reads as "in scope for nothing", so every challenge carrying a
    // `community_id` was filtered out and the page drew "No challenges yet".
    // Ethan: "on mobile the challenges aren't appearing at all... even though on
    // desktop it shows the live Spanish challenge and the past challenges."
    //
    // Nothing about it was width-dependent. It is a RACE, and a phone loses it
    // far more often: `getUser()` can resolve before the session has been
    // rehydrated from storage on a cold start over a slow connection. Worse,
    // the answer went into a module-level promise, so one unlucky first call
    // poisoned every page in the session and only a full reload cleared it.
    //
    // So: fail OPEN like the read-error branch below (`ids: null` means "we
    // could not tell", which behaves like the pre-markets world), and DROP THE
    // CACHE so the next caller actually asks again instead of being handed the
    // same wrong answer for the rest of the session.
    if (!user) {
      cache = null
      return { ids: null, homeId: null, networkId: null, rows: [] }
    }
    const [{ data, error }, { data: net }] = await Promise.all([
      supabase
        .from('community_members')
        .select('community_id, role, is_home')
        .eq('profile_id', user.id)
        .eq('status', 'active'),
      // The network's id, so a page can tell a GLOBAL challenge from a market
      // one without carrying the whole community list around.
      supabase.from('communities').select('id').eq('kind', 'network').maybeSingle(),
    ])
    // A read failure must fail OPEN. If the membership tables are unreadable for
    // any reason, showing a creator every challenge is the behaviour they had
    // before markets existed; showing them none would empty the page they use
    // to enter the live challenge.
    // Not cached either, for the same reason as the no-user branch above: a
    // one-off network failure should not decide what this session is allowed to
    // see until the tab is reloaded.
    if (error || !data) {
      cache = null
      return { ids: null, homeId: null, networkId: net?.id ?? null, rows: [] }
    }
    return {
      ids: new Set(data.map((r) => r.community_id)),
      homeId: data.find((r) => r.is_home)?.community_id ?? null,
      networkId: net?.id ?? null,
      rows: data,
    }
  })()
  return cache
}

export function clearScopeCache() {
  cache = null
}

export function useMyScopes() {
  const [state, setState] = useState({ ids: null, homeId: null, networkId: null, rows: [], loading: true })
  useEffect(() => {
    let alive = true
    // ONE RETRY WHEN THE ANSWER WAS "COULD NOT TELL".
    //
    // `ids === null` is the fail-open answer, and on a cold start it usually
    // means the session had not been rehydrated when we asked rather than
    // anything being wrong. Failing open is safe - the page shows everything -
    // but it is not RIGHT: an admin in seven markets should be scoped to seven
    // markets, not to all of them. Both indeterminate branches drop the cache,
    // so asking again is a real second attempt and not the same promise.
    const ask = (retriesLeft) => {
      loadMyScopes().then((s) => {
        if (!alive) return
        if (s.ids === null && retriesLeft > 0) {
          setTimeout(() => { if (alive) ask(retriesLeft - 1) }, 400)
          // Still report what we have, so the page renders fail-open meanwhile
          // rather than sitting on a skeleton.
          setState({ ...s, loading: false })
          return
        }
        setState({ ...s, loading: false })
      })
    }
    ask(2)
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
