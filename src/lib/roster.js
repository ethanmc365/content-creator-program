import { profilesApi } from '../api/profiles'
import { testFlags } from './testData'

// THE CREATOR ROSTER, READ ONCE.
//
// The home page used to read the whole profiles table four times on one visit, each card with its own columns: the map
// (146 kB), "who to meet" (158 kB), the spotlight (125 kB) and the DM people warm-up (102 kB). On 21 Oct that was 530 kB
// of the ~1 MB an admin's app open downloaded, and the same people every time. This is one read with the union of the
// columns those cards use; each card filters and sorts its own copy. A creator's long `about` text is NOT here (60 kB
// across everybody, and only the spotlight shows it, for one person): the spotlight asks for that one row.
//
// Same visibility rules the cards had: active, not deleted, demo people only for the viewers allowed to see them
// (lib/testData). Admins are included; cards that never show admins drop them.
export const ROSTER_COLUMNS = 'id, name, photo_url, bio, is_admin, city, country, country_code, city_lat, city_lng, show_on_map, '
  + 'languages, countries_visited, instagram_url, tiktok_url, youtube_url, facebook_url, last_seen_at, created_at'

// Five minutes: long enough that every card on a visit and a quick hop away and back share it, short enough that a new
// creator turns up without a reload.
const MAX_AGE = 5 * 60 * 1000

let memo = { key: null, at: 0, promise: null }

/** Everyone the viewer may see, as `{ data, error }` like a supabase read. Callers must not mutate the rows. */
export function loadRoster({ now = Date.now() } = {}) {
  const key = testFlags().join(',')
  if (memo.promise && memo.key === key && now - memo.at < MAX_AGE) return memo.promise
  const promise = Promise.resolve(
    profilesApi.profiles().select(ROSTER_COLUMNS)
      .eq('status', 'active').in('is_test', testFlags()).is('deletion_requested_at', null),
  ).then(({ data, error }) => {
    // A failed read is not remembered, so the next card asks again.
    if (error && memo.promise === promise) memo = { key: null, at: 0, promise: null }
    return { data: error ? null : (data ?? []), error: error ?? null }
  })
  memo = { key, at: now, promise }
  return promise
}

/** Forget the roster (sign-out, or after an edit that changes who is listed). */
export function clearRoster() { memo = { key: null, at: 0, promise: null } }
