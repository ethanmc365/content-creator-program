import { settingsApi } from '../api/settings'

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
  const p = settingsApi
    .appSettings().select('value').eq('key', key).maybeSingle()
    .then(({ data, error }) => {
      if (error || !data) return false
      return data.value === true || data.value === 'true'
    })
    .catch(() => false)
  cache.set(key, p)
  return p
}
