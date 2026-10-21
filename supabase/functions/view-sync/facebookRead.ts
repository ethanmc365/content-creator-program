// Facebook: reading a reel or video, hopping regions when one meets the login wall. The parsing is in ./facebook.ts.
import { FB_CRAWLER_UAS, facebookCountFor, facebookCoverFrom, facebookIdCandidates, facebookIdFrom, facebookPostFrom, facebookTitleCount, isFacebookWall, pluginVideoId, regionOrder, facebookPostedAt } from './facebook.ts'
import { SUPABASE_URL, WEBHOOK_SECRET, UA, MOBILE_UA, FETCH_TIMEOUT_MS, checkedFetch, type Resolved, fail } from './shared.ts'

// ----------------------------------------------------------------- facebook
//
// REBUILT 28 Sep 2026. The parsing lives in ./facebook.ts (pure, tested); this
// half does the fetching. See the header of facebook.ts for what was measured.
//
// The shape, and why:
//   1. RESOLVE the link to a video id. Straight off the URL when it says so;
//      otherwise Facebook's own embed plugin (the one route that resolves
//      story.php/pfbid links signed out), then the crawler's redirect, then the
//      old phone bounce for /share/ links. The id is stored on the entry, so
//      this happens once per video.
//   2. READ `/reel/<id>/` as a crawler and take the count bound to our id.
//      Classic videos fall back to the watch page's og:title.
//   3. FAIL OVER ACROSS REGIONS. Facebook walls crawler traffic per server IP,
//      so a read that meets the login wall is handed to this same function in
//      another Supabase region (the `x-region` header) until one answers.
//      Measured: with one region walled, eight of ten others read the count.

export async function fbFetch(url: string, ua: string): Promise<{ html: string; url: string; status: number } | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS * 2)
  try {
    const { res, url: landed } = await checkedFetch(url, {
      headers: { 'User-Agent': ua, 'Accept-Language': 'en-GB,en;q=0.9' },
      redirect: 'follow',
      signal: ctrl.signal,
    })
    return { html: await res.text(), url: landed, status: res.status }
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

// A /share/ link answers a phone with an 836-byte shell whose only content is
// a JavaScript bounce back to ITSELF carrying `?hpir=1`. Fetching that second
// URL returns the real page, whose og:url names the reel.
export async function resolveFacebookShareOnce(url: string): Promise<{ html: string; url: string } | null> {
  let current = url
  for (let hop = 0; hop < 3; hop++) {
    const page = await fbFetch(current, MOBILE_UA)
    if (!page) return null
    const jump = page.html.match(/location\.replace\("([^"]+)"\)/)?.[1]
    if (jump && page.html.length < 4000) {
      current = jump.replace(/\\\//g, '/')
      continue
    }
    return { html: page.html, url: page.url }
  }
  return null
}

// Where a /share/ link sends a crawler, read off the redirect itself (never followed), as a post and its owner.
export async function facebookShareTarget(url: string): Promise<{ post: string; owner: string } | null> {
  if (!/facebook\.com\/share\//.test(url)) return null
  for (const ua of FB_CRAWLER_UAS) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
    try {
      const { res } = await checkedFetch(url, { headers: { 'User-Agent': ua, 'Accept-Language': 'en-GB,en;q=0.9' }, redirect: 'manual', signal: ctrl.signal })
      await res.body?.cancel()
      const found = facebookPostFrom(res.headers.get('location') ?? '')
      if (found) return found
    } catch {
      // try the next agent
    } finally {
      clearTimeout(timer)
    }
  }
  return null
}

// WHERE A POST SENDS YOU, read off the redirect and never followed (15 Oct 2026). Roxana's VIP reel was shared from her
// Page as `/share/r/`, which lands on `story.php` - a login wall from every server - and the embed plugin draws nothing
// for that post, so the entry sat "blocked" holding the POST id. But Facebook answers `/<owner>/posts/<post>/` and
// `/<post>` with a redirect to `/<owner>/videos/<slug>/<video id>/` before any wall, and that video reads like any reel.
// `isPost`: Facebook sent the post to `/<owner>/posts/...` rather than to a video - a photo or text post (15 Oct 2026:
// Evelin's `/share/p/` entry was eighteen photos and sat "blocked" for eleven days, because from a server the post page
// itself is a login wall).
export async function facebookPostRedirectId(post: { post: string; owner: string | null }): Promise<{ id: string | null; isPost: boolean }> {
  let isPost = false
  const urls = [
    ...(post.owner ? [`https://www.facebook.com/${post.owner}/posts/${post.post}/`] : []),
    `https://www.facebook.com/${post.post}`,
  ]
  for (const u of urls) {
    for (const ua of FB_CRAWLER_UAS) {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
      try {
        const { res } = await checkedFetch(u, { headers: { 'User-Agent': ua, 'Accept-Language': 'en-GB,en;q=0.9' }, redirect: 'manual', signal: ctrl.signal })
        await res.body?.cancel()
        const location = res.headers.get('location') ?? ''
        if (/facebook\.com\/(?:login|checkpoint)/.test(location)) continue
        const id = facebookIdFrom(location)
        if (id && id !== post.post) return { id, isPost: false }
        if (/facebook\.com\/[^/?#]+\/posts\//.test(location)) isPost = true
      } catch {
        // try the next agent
      } finally {
        clearTimeout(timer)
      }
    }
  }
  return { id: null, isPost }
}

export type FbLocal = Resolved & { walled?: boolean; region?: string | null }

// Every route that can turn a link into a video id, cheapest first. Returns as
// soon as one names an id; `walled` says a login page got in the way.
export async function facebookResolveIds(url: string): Promise<{ ids: string[]; walled: boolean; photo?: boolean }> {
  let walled = false
  // A post whose attachments are all photos (11 Oct 2026: a /share/p/ link entered in Spain) has no view count to find,
  // and used to end as "blocked" after every region was asked for a video that does not exist.
  let photo = false
  const ids: string[] = []
  const add = (v: string | null | undefined) => { if (v && !ids.includes(v)) ids.push(v) }

  // The embed plugin: resolves story.php/pfbid, /share/, /watch and /videos.
  const plugin = await fbFetch(
    `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&width=500`, UA)
  if (plugin) add(pluginVideoId(plugin.html))
  if (ids.length) return { ids, walled }
  // A post Facebook redirects to `/posts/` and whose embed player (which answered) names no video is not a video.
  let notVideo = false

  // A POST FROM A PERSONAL PROFILE (13 Oct 2026). Its share link redirects to story.php, a login wall from every
  // region, so two VIP videos sat "blocked" for days. The redirect names the post and its owner before any wall, and
  // the embed plugin for that post names the video - as it does for an ordinary browser agent.
  const post = facebookPostFrom(url) ?? await facebookShareTarget(url)
  if (post) {
    const href = `https://www.facebook.com/${post.owner}/posts/${post.post}/`
    const viaPost = await fbFetch(`https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(href)}&show_text=false&width=500`, UA)
    if (viaPost) add(pluginVideoId(viaPost.html))
    if (ids.length) return { ids, walled }
    const redirect = await facebookPostRedirectId(post)
    add(redirect.id)
    if (ids.length) return { ids, walled }
    notVideo = redirect.isPost && !!plugin && plugin.status === 200 && !!viaPost && viaPost.status === 200
  }

  // A crawler is REDIRECTED from a share link straight to /reel/<id>/.
  for (const ua of FB_CRAWLER_UAS) {
    const page = await fbFetch(url, ua)
    if (!page) continue
    if (isFacebookWall(page.url, page.html)) { walled = true; continue }
    if (/"__typename":"Photo"/.test(page.html) && !/"__typename":"Video"/.test(page.html) && !facebookIdFrom(page.url)) {
      photo = true
      return { ids: [], walled: false, photo }
    }
    add(facebookIdFrom(page.url))
    for (const c of facebookIdCandidates(page.html).slice(0, 2)) add(c)
    if (ids.length) return { ids, walled }
  }

  // The phone bounce, for /share/ links.
  const bounced = await resolveFacebookShareOnce(url)
  if (bounced) {
    if (isFacebookWall(bounced.url, bounced.html)) walled = true
    else {
      add(facebookIdFrom(bounced.url))
      for (const c of facebookIdCandidates(bounced.html).slice(0, 3)) add(c)
    }
  }
  if (!ids.length && notVideo) return { ids, walled: false, photo: true }
  return { ids, walled }
}

// One id, every agent. `walled` when nothing answered but a login page.
//
// THE COVER RIDES ALONG, and it costs nothing (28 Sep 2026). The reel page read
// here for the view count carries the video's own cover frame in it. A Facebook
// entry had no picture at all before this - the card drew Facebook's embedded
// PLAYER where the picture goes, which is where the circle play button Ethan
// could not get rid of came from - and the answer was in this response all
// along. See `facebookCoverFrom` for what is taken and why the host is checked.
export async function facebookReadId(id: string): Promise<{ views: number; approx: boolean; thumbnail: string | null; postedAt?: string | null } | { walled: boolean }> {
  let walled = false
  for (const ua of FB_CRAWLER_UAS) {
    const page = await fbFetch(`https://www.facebook.com/reel/${id}/`, ua)
    if (!page) continue
    if (isFacebookWall(page.url, page.html)) { walled = true; continue }
    const n = facebookCountFor(page.html, id)
    // THE DATE IT WAS POSTED IS ON THE SAME PAGE (11 Oct 2026), and Facebook entries had none, so an old Facebook video
    // could be entered and nobody would know. It is what lets migration 382 disqualify one posted before the start.
    if (n != null) return { views: n, approx: false, thumbnail: facebookCoverFrom(page.html), postedAt: facebookPostedAt(page.html, id) }
  }
  // A classic video states its count in the watch page's title.
  const watch = await fbFetch(`https://www.facebook.com/watch/?v=${id}`, UA)
  if (watch) {
    if (isFacebookWall(watch.url, watch.html)) walled = true
    else {
      const t = facebookTitleCount(watch.html)
      if (t) return { ...t, thumbnail: facebookCoverFrom(watch.html) }
    }
  }
  return { walled }
}

// The whole read, in THIS region. Called directly when there is nowhere else to
// go, and by the region hop below.
export async function facebookReadHere(url: string, knownId: string | null): Promise<FbLocal> {
  const base = { platform: 'Facebook' as const, region: Deno.env.get('SB_REGION') ?? null }
  let walled = false
  const tried = new Set<string>()

  const attempt = async (ids: string[]): Promise<FbLocal | null> => {
    for (const id of ids) {
      if (tried.has(id) || tried.size >= 5) continue
      tried.add(id)
      const r = await facebookReadId(id)
      if ('views' in r) {
        return {
          ...base,
          videoId: id,
          canonicalUrl: `https://www.facebook.com/reel/${id}/`,
          views: r.views,
          approx: r.approx,
          thumbnail: r.thumbnail,
          postedAt: r.postedAt ?? null,
          error: null,
        }
      }
      if (r.walled) walled = true
    }
    return null
  }

  // What we already know first: a stored id, or one in the link itself.
  const quick = await attempt([knownId, facebookIdFrom(url)].filter((v): v is string => !!v))
  if (quick) return quick

  // A stored id can be wrong (an old resolver once kept a PAGE id), so an id
  // that reads nothing sends us back to the link.
  const resolved = await facebookResolveIds(url)
  if (resolved.photo) {
    return fail({ ...base, canonicalUrl: url }, 'not_a_video', 'That Facebook post is a photo, so it has no view count.')
  }
  if (resolved.walled) walled = true
  const found = await attempt(resolved.ids)
  if (found) return found

  const videoId = resolved.ids[0] ?? knownId ?? facebookIdFrom(url)
  if (walled) {
    return { ...fail({ ...base, videoId, canonicalUrl: url }, 'blocked',
      'Facebook showed a login page instead of the video from every place we asked. It will be read again on the next sync.'), walled: true }
  }
  if (!videoId) {
    return fail({ ...base, canonicalUrl: url }, 'no_video_id',
      'That Facebook link does not lead to a video. It may be a photo or text post, or not public.')
  }
  return fail({ ...base, videoId, canonicalUrl: url }, 'no_count_in_page',
    'Facebook served the post but stated no view count. Photo and text posts have none.')
}

// Regions that answered recently, most recent first. Module scope, so it lasts
// as long as the isolate - a sweep keeps using the region that is working.
export const fbGoodRegions: string[] = []
// Every region before giving up (11 Oct 2026): a walled region answers in about a second, and with six hops a reel
// that read fine from Ethan's Mac was left "blocked" all day.
export const FB_MAX_HOPS = 16

export async function facebookViews(url: string, knownId: string | null): Promise<Resolved> {
  // No secret, no hop: read here and say what happened.
  if (!WEBHOOK_SECRET) return facebookReadHere(url, knownId)

  let last: FbLocal | null = null
  const order = regionOrder(fbGoodRegions).slice(0, FB_MAX_HOPS)
  for (const region of order) {
    let r: FbLocal | null = null
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 45_000)
      const res = await fetch(`${SUPABASE_URL}/functions/v1/view-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET, 'x-region': region },
        body: JSON.stringify({ facebook_read: { url, knownId } }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timer))
      if (res.ok) r = (await res.json()) as FbLocal
      else await res.body?.cancel()
    } catch {
      r = null
    }
    if (!r) continue
    last = r
    if (r.views != null) {
      const at = fbGoodRegions.indexOf(region)
      if (at >= 0) fbGoodRegions.splice(at, 1)
      fbGoodRegions.unshift(region)
      return r
    }
    // A wall is this region's problem; anything else is the video's answer and
    // asking elsewhere would only get the same one.
    if (!r.walled) return r
    const bad = fbGoodRegions.indexOf(region)
    if (bad >= 0) fbGoodRegions.splice(bad, 1)
  }
  // Every hop failed at the transport, so try once from here before giving up.
  return last ?? facebookReadHere(url, knownId)
}
