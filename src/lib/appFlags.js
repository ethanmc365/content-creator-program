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
//
// FAILING CLOSED IS NOT THE SAME AS BEING UNREADABLE, which is what the August
// 2026 audit found: see readFlag below.

const cache = new Map()

// THROUGH AN RPC, AND THAT IS THE WHOLE FIX FOR "THE WALKTHROUGH NEVER RAN".
//
// This used to select straight from `app_settings`. That table's only policy is
// `is_admin()` for ALL commands - correct, because it also holds the company's
// billing address - so a creator's read returned no rows, `readFlag` failed
// closed to false exactly as designed, and the two features gated on it could
// never start for ANYBODY. They were switched off in a way no row update could
// switch on, and nothing anywhere said so: a silent, permanent false.
//
// `public_flag` is a SECURITY DEFINER reader with a two-key allow-list
// (migration 108). It answers for the flags that are meant to be public and
// false for everything else, so opening this path did not open the table.
//
// FAILING CLOSED HAS TO INCLUDE FAILING TO ASK. The first version called
// `.then()` straight off the query builder, so anything that made `rpc` return
// something without a `.then` - an offline shim, a stubbed client, a future
// supabase-js - threw SYNCHRONOUSLY, out of `useAppFlag`'s effect, and took the
// whole React tree down with it. A switch that is off is fine; a switch that
// takes the app with it is not. Every path below ends at `false`.
export async function readFlag(key) {
  if (cache.has(key)) return cache.get(key)
  let p
  try {
    p = Promise.resolve(supabase.rpc('public_flag', { p_key: key }))
      .then((res) => res?.error ? false : res?.data === true)
      .catch(() => false)
  } catch {
    p = Promise.resolve(false)
  }
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
