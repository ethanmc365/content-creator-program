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
export function resolveThumbnail(url, { probe = false } = {}) {
  if (!url) return Promise.resolve(null)
  const key = `${probe ? 'p' : 'o'}:${url}`
  if (inFlight.has(key)) return inFlight.get(key)

  const run = (async () => {
    try {
      const mod = await import('./videoPreview')
      const preview = await mod.getVideoPreview(url)
      if (preview?.thumbnail) return preview.thumbnail
    } catch { /* oEmbed is best-effort by definition */ }
    if (!probe) return null
    try {
      return await fromProbe(url)
    } catch {
      return null
    }
  })()

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
