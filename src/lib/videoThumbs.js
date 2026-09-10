// A STILL FRAME FOR EVERY VIDEO, INCLUDING THE ONES THAT DO NOT VOLUNTEER ONE.
//
// Ethan, 9 Sep 2026: "for some of them, like the TikTok one, you have the nice
// preview that shows up. But for Instagram this doesn't seem to work. Make sure
// you can build this preview into all of them that shows up in the card,
// because it looks good."
//
// THREE SOURCES, TRIED IN ORDER OF WHAT THEY COST.
//
//  1. `thumbnail_url` on the row. Free, instant, and where the answer ends up.
//  2. `getVideoPreview` - TikTok's and YouTube's own tokenless oEmbed, called
//     straight from the browser. No key, CORS-open, ~100ms. This is the one
//     that already worked, and it is why TikTok cards have always had a frame.
//  3. The `view-sync` edge function in PROBE mode. Instagram has no tokenless
//     oEmbed at all - that is the whole of "this doesn't seem to work" - so the
//     only way to a frame is the same server-side read that gets the view
//     count, which returns `thumbnail` alongside it. Admin-only by the
//     function's own check, which is exactly who is looking at this page.
//
// AND SINCE 10 SEP 2026 THE ANSWER IS COPIED INTO OUR OWN STORAGE.
//
// Ethan: "copy video thumbnails into our own storage - is this necessary?
// Ensure everything's working correctly. We don't want it to take up an insane
// amount of storage, but even with thousands of videos it probably won't."
//
// It is, and not really because of the expiry. The probe in step 3 is
// ADMIN-ONLY - `view-sync` holds the Instagram session cookies and refuses
// anybody else, which is correct - so the two pages that most want a frame, a
// challenge board and a creator's profile, could never have had one for an
// Instagram entry however many times they asked. A stored file is the only
// version of this that works for the people those pages are FOR.
//
// `thumb-cache` (supabase/functions) copies whatever was resolved into the
// `video-thumbs` bucket and writes the permanent URL back onto BOTH
// `submissions` and `tracked_videos`. From then on every viewer, signed in or
// not, gets one URL from our own origin: no probe, no expiry, no CDN host in
// the CSP. A 640px cover is 20-60KB, so a thousand videos is about 40MB.
//
// AND IT IS SELF-HEALING, WHICH IS NOT OPTIONAL FOR INSTAGRAM.
//
// The URL Instagram hands back is a SIGNED CDN url, and signatures expire -
// days, sometimes hours. So a cached one is a picture that works today and is a
// broken image icon next month, which is worse than no picture at all: a blank
// tile reads as "no preview available" and a broken one reads as "this page is
// broken".
//
// The `<img>` says so when it happens (`onError`), and that is the trigger to
// re-resolve and re-cache. Caching an expiring URL is therefore correct rather
// than sloppy: it makes the common case instant, and the uncommon case costs
// one probe and fixes itself. The alternative - copying every frame into our
// own storage - is the permanent fix and it is a change to an edge function on
// an hourly cron for two rows of data. Not today, and noted in the tracker's
// memory as the thing to do when this list is fifty.
//
// ONE FLIGHT PER URL. Two cards for the same video, a re-render, or a React
// strict-mode double effect must not become two probes; the promise is shared.

import { supabase } from './supabase'

/** url -> Promise<string|null>, for the lifetime of the page. */
const inFlight = new Map()

/** Where a stored frame lives. Anything else is a platform URL that will rot. */
const STORE = '/storage/v1/object/public/video-thumbs/'

/** True for a URL this app has already copied into its own bucket. */
export function isStored(url) {
  return typeof url === 'string' && url.includes(STORE)
}

// THREE AT A TIME, AND THAT IS NOT A PERFORMANCE TWEAK.
//
// A challenge board is forty entries. Without a queue, opening it as an admin
// fires forty probes at Instagram inside one frame - which is a rate limit, a
// row of failures, and forty cards that decide there is no picture. It only
// has to be slow ONCE: everything resolved here is copied into storage, so the
// second visit reads forty rows and asks nothing.
const MAX_IN_FLIGHT = 3
let running = 0
const queue = []
function pump() {
  while (running < MAX_IN_FLIGHT && queue.length) {
    const job = queue.shift()
    running += 1
    job().finally(() => { running -= 1; pump() })
  }
}
function enqueue(fn) {
  return new Promise((resolve) => {
    queue.push(() => fn().then(resolve, () => resolve(null)))
    pump()
  })
}

/**
 * Copy a resolved frame into our own storage and return the permanent URL.
 *
 * Never throws and never blocks the picture: the caller already has something
 * to draw, and this is about the NEXT reader rather than this one. A failure
 * (an expired source, a host we do not trust, a video that is not ours) simply
 * means the platform URL is used for now and asked for again next time.
 *
 * @param {string} videoUrl the post's URL - the key everything is filed under
 * @param {string} [src] a frame already resolved by the caller. Required for
 *        Instagram, whose covers only the admin probe can find; TikTok and
 *        YouTube the function can resolve for itself.
 * @returns {Promise<string|null>} the permanent URL, or null
 */
export async function storeThumbnail(videoUrl, src) {
  if (!videoUrl) return null
  try {
    const { data, error } = await supabase.functions.invoke('thumb-cache', {
      body: src ? { url: videoUrl, src } : { url: videoUrl },
    })
    if (error) return null
    return typeof data?.url === 'string' && data.url ? data.url : null
  } catch {
    return null
  }
}

async function fromProbe(url) {
  const { data, error } = await supabase.functions.invoke('view-sync', { body: { probe: url } })
  if (error) return null
  return typeof data?.thumbnail === 'string' && data.thumbnail ? data.thumbnail : null
}

/**
 * Find a still frame for a video URL. Never throws - a missing picture is a
 * design state on the card, not an error anybody needs to be told about.
 *
 * @param {string} url
 * @param {{ probe?: boolean }} [opts] `probe` allows the edge-function call.
 *        Off by default so a non-admin surface can use this safely.
 * @returns {Promise<string|null>}
 */
export function resolveThumbnail(url, { probe = false, store = true } = {}) {
  if (!url) return Promise.resolve(null)
  const key = `${probe ? 'p' : 'o'}:${url}`
  if (inFlight.has(key)) return inFlight.get(key)

  const run = enqueue(async () => {
    let found = null
    try {
      const mod = await import('./videoPreview')
      const preview = await mod.getVideoPreview(url)
      if (preview?.thumbnail) found = preview.thumbnail
    } catch { /* oEmbed is best-effort by definition */ }
    if (!found && probe) {
      try { found = await fromProbe(url) } catch { found = null }
    }
    if (!found) return null
    // KEEP IT. The permanent URL is better than the one we just found in every
    // way there is, so it wins when it arrives - and when the copy fails, the
    // platform URL still draws a picture today.
    if (store) {
      const kept = await storeThumbnail(url, found)
      if (kept) return kept
    }
    return found
  })

  inFlight.set(key, run)
  return run
}

/**
 * Forget a URL's cached lookup so the next call really goes and asks again.
 * Called when an <img> reports the frame no longer loads - see the note above.
 */
export function forgetThumbnail(url) {
  inFlight.delete(`p:${url}`)
  inFlight.delete(`o:${url}`)
}
