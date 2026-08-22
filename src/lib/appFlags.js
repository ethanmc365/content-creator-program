import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// PLATFORM-WIDE SWITCHES, READ FROM THE DATABASE.
//
// Two things now ship switched off and are turned on by updating a row rather
// than by a deploy: the guided walkthrough and the home-screen install ask.
// Both are features that change what a creator sees the moment they log in, and
// both had to be built, demonstrated and tested while forty five people were
// using the platform normally. A compiled-in constant would have meant a deploy
// to try either one, and a deploy to turn it back off again.
//
// EVERY ONE OF THESE FAILS CLOSED. A read that errors, a row that is missing,
// or any value that is not exactly true means off. There is no flag here whose
// absence should unlock something.

const cache = new Map()

export async function readFlag(key) {
  if (cache.has(key)) return cache.get(key)
  const p = supabase
    .from('app_settings').select('value').eq('key', key).maybeSingle()
    .then(({ data, error }) => {
      if (error || !data) return false
      return data.value === true || data.value === 'true'
    })
    .catch(() => false)
  cache.set(key, p)
  return p
}

export function clearFlagCache() { cache.clear() }

/**
 * A flag, as a hook.
 *
 * It starts FALSE rather than null and never renders a loading state, which is
 * the whole point: a gate that flickers into existence a beat after the app has
 * painted is worse than one that arrives a beat late. Everything guarded by
 * these is a full-screen interruption, so the safe default while we do not yet
 * know is "do not interrupt".
 */
export function useAppFlag(key) {
  const [on, setOn] = useState(false)
  useEffect(() => {
    let alive = true
    readFlag(key).then((v) => { if (alive) setOn(!!v) })
    return () => { alive = false }
  }, [key])
  return on
}
