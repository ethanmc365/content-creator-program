import { useState } from 'react'

/**
 * THE PAGE YOU WERE JUST LOOKING AT IS STILL THERE WHEN YOU COME BACK.
 *
 * Ethan, for the FIFTH time (4 Sep 2026): "that loading screen shows up every
 * single time between clicks, from worldwide to challenges to DMs. I don't want
 * any loading screen. All I want is the skeleton, placeholder cards that show
 * the content is loading in. There is none for desktop."
 *
 * Four previous rounds all went at the PLACEHOLDER - move the Suspense
 * boundary, delay the fallback, prefetch the chunk, make each page's own
 * placeholder the shape of the page. Every one of them made the grey screen
 * nicer and none of them made it rarer, because they were all answers to "what
 * do we draw while we wait" when the report is "why am I waiting AGAIN".
 *
 * MEASURED ON PRODUCTION, on a phone, signed in, tapping the bottom tabs: the
 * chunk never suspends (it is prefetched) and no plane is drawn anywhere. What
 * happens on every single tap is that the page mounts with empty state, fires
 * its queries, and paints a full screen of grey shapes for 700-1200ms - and it
 * does it on the SECOND visit to a tab exactly as it did on the first, because
 * a page component that unmounts takes its data with it. On a desktop the same
 * queries land in ~150ms over a fixed line and you never see it, which is
 * exactly why he sees this on his phone and not on his laptop.
 *
 * So: keep the data. This is stale-while-revalidate, in about forty lines and
 * with no dependency:
 *
 *   FIRST visit to a tab   -> no cache, skeleton, query, paint. Unchanged, and
 *                             that is the skeleton he actually wants.
 *   EVERY visit after that -> the last data paints on the FIRST frame, the
 *                             query still runs, and the page updates in place
 *                             when it lands. No placeholder at all.
 *
 * WHAT THIS IS NOT. It is not a query cache with invalidation rules, and it
 * must not become one - it never SKIPS a fetch, so nothing it holds can be more
 * than one paint out of date, and a page that writes something still refetches
 * like it always did. The cache only decides what is on screen while that
 * happens.
 *
 * IT IS PER SIGNED-IN PERSON AND IT DIES WITH THE TAB. A module-level Map, not
 * localStorage: a creator's rooms, DMs and challenge list are not things to
 * leave on a shared device, and a cache that survives a reload would also
 * survive a deploy. `clearPageCache()` runs on sign-out and on entering or
 * leaving creator preview, which are the two moments the same key means a
 * different person.
 */

const store = new Map()

/** Whatever was last stored under `key`, or undefined. */
export function readPageCache(key) {
  return key ? store.get(key) : undefined
}

/** Keep `value` for the next visit to this page. */
export function writePageCache(key, value) {
  if (key) store.set(key, value)
}

/**
 * Empty it. Called when the identity behind the data changes - sign out, sign
 * in as somebody else, enter or leave creator preview. A stale row is
 * survivable; another account's rows are not.
 */
export function clearPageCache() {
  store.clear()
}

/**
 * WHAT THIS PAGE HAD LAST TIME, READ ONCE, AT MOUNT.
 *
 * A lazy `useState` initialiser rather than a bare call in the render body: it
 * runs exactly once per mount, which is both what we want and what keeps the
 * purity lint happy (same escape hatch the clock captures use).
 *
 * Returns `undefined` on the first ever visit, which is the one visit that
 * should draw a skeleton. Every page below uses it the same way:
 *
 *   const cached = useCachedPage(KEY)
 *   const [rows, setRows] = useState(cached?.rows ?? [])
 *   const [loading, setLoading] = useState(!cached)
 *   ... and `writePageCache(KEY, { rows })` when the query lands.
 */
export function useCachedPage(key) {
  return useState(() => readPageCache(key))[0]
}
