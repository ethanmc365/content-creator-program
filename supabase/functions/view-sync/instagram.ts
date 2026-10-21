// Instagram: play counts from the creator's public reels tab, no account. Hops regions when this one is refused.
import { regionOrder } from './facebook.ts'
import { SUPABASE_URL, WEBHOOK_SECRET, secrets, UA, sleep, FETCH_TIMEOUT_MS, HttpError, type Resolved, fail, IG_GAP_MS } from './shared.ts'

// ---------------------------------------------------------------- instagram
//
// NO CREDENTIAL. Instagram warned the Tryp.com UK account for "automated
// behaviour" and threatened to disable it, so the session cookie was removed
// on 25 Aug 2026 and nothing replaced it. What replaced the ROUTE is the same
// data a signed-out visitor sees: the public reels tab of a public profile
// states a view count under every reel, and Meta's own logged-out desktop query
// is what puts it there.
//
// Two things make this work and neither is obvious:
//
//   1. The endpoint is `/api/graphql`, NOT `/graphql/query`. The same doc_id
//      posted to `/graphql/query` answers `xig_user_by_username: null` for the
//      reels tab, and 403s the post lookup unless a csrftoken cookie is sent.
//   2. The one header that matters is `Sec-Fetch-Site: same-origin`. Without
//      it Instagram hands the POST to the page router and returns the 617 kB
//      app shell instead of JSON. No cookie, no csrftoken, no lsd, no app id is
//      required - that was bisected, not guessed. A 600 kB HTML body is the
//      signature of this header having gone missing.
//
// Cost is per CREATOR, not per video: one page carries twelve reels, so a
// creator's whole set of entries is usually one request. That keeps the
// programme's footprint on Instagram in single digits per sweep.

// Meta rotates persisted-query ids. Both are stored as comma-separated lists so
// a rotation is a paste into the connections panel rather than a redeploy, and
// each is tried in order until one answers.
export const IG_REELS_DOC_IDS_DEFAULT = '27838951732404191'
export const IG_POST_DOC_IDS_DEFAULT = '27128499623469141'

export const IG_PAGE_SIZE = 12
export const IG_MAX_PAGES = 8 // 96 reels back on the first pass
export const IG_DEEP_PAGES = 30 // 360 back, read only for a known owner's reel the first pass missed (igReelsDeeper)

export function igShortcodeFrom(url: string): string | null {
  return url.match(/instagram\.com\/(?:[^/]+\/)?(?:reels?|p|tv)\/([A-Za-z0-9_-]{5,})/)?.[1] ?? null
}

// A profile URL, or a post URL of the `/{username}/reel/{code}/` form, names its
// owner - which saves a lookup. Anything in the reserved set is a route, not a
// person, so it must not be mistaken for a handle.
export const IG_RESERVED = new Set(['p', 'reel', 'reels', 'tv', 'explore', 'stories', 'accounts', 'direct', 'api', 'graphql', 's'])
export function igHandleFrom(url: string | null | undefined): string | null {
  if (!url) return null
  let path: string
  try {
    const u = new URL(url.trim())
    if (!/(^|\.)instagram\.com$/i.test(u.hostname)) return null
    path = u.pathname
  } catch {
    // A bare handle, with or without the @.
    const bare = String(url).trim().replace(/^@/, '')
    return /^[A-Za-z0-9._]{1,30}$/.test(bare) ? bare.toLowerCase() : null
  }
  const first = path.split('/').filter(Boolean)[0]
  if (!first || IG_RESERVED.has(first.toLowerCase())) return null
  return /^[A-Za-z0-9._]{1,30}$/.test(first) ? first.toLowerCase() : null
}

// (`igMediaId` lived here: the shortcode base64-decoded to Instagram's numeric
// media id. Removed 18 Sep 2026 - nothing called it, here or anywhere in the
// repo, and the comment justifying it was wrong: `platform_video_id` stores the
// SHORTCODE for Instagram, not the numeric id. The browser keeps its own tested
// copy in `src/lib/videoLinks.js` if the conversion is ever needed again.)

// Instagram calls the number "views" on a reel; the field behind it is the play
// count. `video_view_count` is deliberately NOT read anywhere: it is a legacy
// metric worth about a third of the displayed figure (1123 against a displayed
// 4245 on a checked reel) and would quietly wreck a leaderboard.
export function igPlayCount(item: Record<string, unknown> | null | undefined): number | null {
  if (!item) return null
  for (const key of ['play_count', 'ig_play_count']) {
    const v = item[key]
    if (typeof v === 'number' && v >= 0) return v
  }
  return null
}

export class IgShellError extends Error {}
// Instagram ANSWERED, and the answer was "no such profile" (gone, private, or a wrong handle). Not a refusal.
export class IgNoProfileError extends Error {}
export const IG_FAILED: unique symbol = Symbol('instagram refused')

// One POST, browser-shaped. Returns parsed JSON, or throws IgShellError when
// Instagram answered with the app shell (see the Sec-Fetch-Site note above).
//
// BOTH queries go to `/api/graphql`. `/graphql/query` serves the same doc_ids
// but demands a csrftoken cookie - it answered 403 to every cookieless call and
// is what made the first deploy report a carousel as a dead link.
export async function igGraphql(
  docId: string,
  variables: Record<string, unknown>,
  referer: string,
): Promise<Record<string, unknown>> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const res = await fetch('https://www.instagram.com/api/graphql', {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': '*/*',
        'Accept-Language': 'en-GB,en;q=0.9',
        // The line that makes Instagram treat this as an API call.
        'Sec-Fetch-Site': 'same-origin',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Dest': 'empty',
        'Origin': 'https://www.instagram.com',
        'Referer': referer,
        'x-ig-app-id': '936619743392459',
      },
      body: new URLSearchParams({ doc_id: docId, variables: JSON.stringify(variables) }),
      signal: ctrl.signal,
    })
    if (!res.ok) {
      await res.body?.cancel()
      throw new HttpError(res.status)
    }
    const text = await res.text()
    try {
      return JSON.parse(text) as Record<string, unknown>
    } catch {
      throw new IgShellError(`instagram returned ${text.length} bytes of html`)
    }
  } finally {
    clearTimeout(timer)
  }
}

// Per-RUN state. It must not outlive the request: an isolate is reused between
// invocations and a cached page would serve yesterday's counts as today's.
// A tab read so far: the counts, and where to carry on from if a reel is further back than the first pass went.
export type IgTab = { map: Map<string, number>; after: string | null; more: boolean; pages: number }
export type IgCache = {
  reels: Map<string, Promise<IgTab>>
  owners: Map<string, Promise<IgOwner | null | typeof IG_FAILED>>
}
export const newIgCache = (): IgCache => ({ reels: new Map(), owners: new Map() })

export type IgOwner = {
  username: string | null
  mediaType: number | null
  productType: string | null
  // Best-effort, and read from a response that was going to be fetched anyway.
  // See the note in `igFetchOwner`.
  caption?: string | null
  thumbnail?: string | null
  takenAt?: string | null
}

export async function igDocIds(which: 'reels' | 'post'): Promise<string[]> {
  const s = await secrets()
  const raw = which === 'reels'
    ? (s.instagram_reels_doc_id || IG_REELS_DOC_IDS_DEFAULT)
    : (s.instagram_post_doc_id || IG_POST_DOC_IDS_DEFAULT)
  const ids = raw.split(',').map((x) => x.trim()).filter((x) => /^\d{6,}$/.test(x))
  return ids.length ? ids : [which === 'reels' ? IG_REELS_DOC_IDS_DEFAULT : IG_POST_DOC_IDS_DEFAULT]
}

// Every reel on a profile's public tab, code -> play count, paging until the
// tab runs out or IG_MAX_PAGES. Pinned reels come first, so the order is not
// chronological and there is no early exit on "we have gone far enough back".
// `tab` carries on from a previous read (see `igReelsDeeper`); `untilCode` stops as soon as that reel turns up.
export async function igFetchReels(username: string, tab: IgTab | null = null, maxPages = IG_MAX_PAGES, untilCode: string | null = null): Promise<IgTab> {
  const out = tab?.map ?? new Map<string, number>()
  const docIds = await igDocIds('reels')
  const referer = `https://www.instagram.com/${username}/reels/`

  let after: string | null = tab?.after ?? null
  let more = true
  let page = tab?.pages ?? 0
  for (; page < maxPages; page++) {
    let user: Record<string, unknown> | null = null
    for (const docId of docIds) {
      const json = await igGraphql(docId, { after, first: IG_PAGE_SIZE, username }, referer)
      const data = json.data as Record<string, unknown> | undefined
      const u = (data?.xig_user_by_username ?? null) as Record<string, unknown> | null
      if (u) { user = u; break }
      // A null user on the FIRST page with a working doc_id means the profile is
      // gone or private; a null user on every doc_id means the ids have rotated.
      // Both look the same here, so try the next id before giving up.
    }
    if (!user) {
      if (page === 0) throw new IgNoProfileError('instagram returned no profile for that handle')
      more = false
      break
    }
    const conn = (user.polaris_clips_connection ?? {}) as Record<string, unknown>
    const edges = (conn.edges ?? []) as { node?: Record<string, unknown> }[]
    for (const e of edges) {
      const node = e?.node
      const code = typeof node?.code === 'string' ? node.code : null
      const views = igPlayCount(node)
      if (code && views != null) out.set(code, views)
    }
    const info = (conn.page_info ?? {}) as { end_cursor?: string; has_next_page?: boolean }
    if (!info.has_next_page || !info.end_cursor || edges.length === 0) { more = false; page++; break }
    after = info.end_cursor
    if (untilCode && out.has(untilCode)) { page++; break }
    await sleep(IG_GAP_MS)
  }
  return { map: out, after, more, pages: page }
}

export function igReels(cache: IgCache, username: string): Promise<IgTab> {
  const key = username.toLowerCase()
  const hit = cache.reels.get(key)
  if (hit) return hit
  // The PROMISE is cached, not the result, so eight entries by one creator
  // arriving at once make one request rather than eight.
  const p = igFetchReels(key).catch((e) => { cache.reels.delete(key); throw e })
  cache.reels.set(key, p)
  return p
}

// A PROLIFIC CREATOR'S REEL CAN BE MORE THAN 96 BACK (14 Oct 2026). Kimberly posts several reels a day, and her Global
// Challenge entry from 27 Sep was the 100th on her tab, so it read "not on the public reels tab" while it was plainly
// there. When the owner is known and the reel was not in the first pass, the same tab is read on from where it stopped,
// up to IG_DEEP_PAGES, stopping the moment the reel turns up. Only the creators who need it pay for it.
export async function igReelsDeeper(cache: IgCache, username: string, code: string): Promise<number | null> {
  const key = username.toLowerCase()
  const tab = await igReels(cache, key)
  if (tab.map.has(code)) return tab.map.get(code) ?? null
  if (!tab.more || tab.pages >= IG_DEEP_PAGES) return null
  const p = igFetchReels(key, tab, IG_DEEP_PAGES, code)
  cache.reels.set(key, p.catch(() => tab))
  return (await p).map.get(code) ?? null
}

// Who owns this shortcode, and is it even a video. Works logged out, and is the
// authority when the creator's saved handle is wrong or they entered somebody
// else's post. It does NOT state a view count - Meta stripped counts from
// single-post lookups in 2026 - which is exactly why the reels tab is the route.
export async function igFetchOwner(shortcode: string): Promise<IgOwner | null> {
  for (const docId of await igDocIds('post')) {
    const json = await igGraphql(docId, {
      shortcode,
      fetch_tagged_user_count: null,
      hoisted_comment_id: null,
      hoisted_reply_id: null,
      __relay_internal__pv__PolarisAIGMMediaWebLabelEnabledrelayprovider: false,
    }, `https://www.instagram.com/reel/${shortcode}/`)
    const data = json.data as Record<string, unknown> | undefined
    const info = data?.xdt_api__v1__media__shortcode__web_info as { items?: Record<string, unknown>[] } | undefined
    const item = info?.items?.[0]
    if (!item) continue
    const user = (item.user ?? {}) as Record<string, unknown>
    // THE CAPTION AND THE POSTER FRAME, WHICH THIS RESPONSE ALREADY CARRIES.
    // `igFetchOwner` was written to answer "who posted this and is it a video",
    // and the same item states what was written with it and when. Reading them
    // costs nothing here - the request has already been made and paid for - so
    // they ride along and the caller decides whether to use them.
    const cap = (item.caption ?? null) as Record<string, unknown> | null
    const images = (item.image_versions2 ?? null) as { candidates?: { url?: string }[] } | null
    return {
      username: typeof user.username === 'string' ? user.username : null,
      mediaType: typeof item.media_type === 'number' ? item.media_type : null,
      productType: typeof item.product_type === 'string' ? item.product_type : null,
      caption: typeof cap?.text === 'string' ? cap.text : null,
      thumbnail: typeof images?.candidates?.[0]?.url === 'string' ? images.candidates[0].url : null,
      takenAt: typeof item.taken_at === 'number' ? new Date(item.taken_at * 1000).toISOString() : null,
    }
  }
  return null
}

export function igOwner(cache: IgCache, shortcode: string): Promise<IgOwner | null | typeof IG_FAILED> {
  const hit = cache.owners.get(shortcode)
  if (hit) return hit
  // A refused request is IG_FAILED, not null: null means Instagram answered and has no such post, and treating a refusal
  // as that is how one walled server IP turned fourteen live reels into "Instagram has no post with that code".
  const p = igFetchOwner(shortcode).catch((): typeof IG_FAILED => IG_FAILED)
  cache.owners.set(shortcode, p)
  return p
}

export type IgLocal = Resolved & { walled?: boolean }

export async function instagramReadHere(
  url: string,
  cache: IgCache,
  handleHint: string | null = null,
  meta = false,
): Promise<IgLocal> {
  const code = igShortcodeFrom(url)
  const canonicalUrl = code ? `https://www.instagram.com/reel/${code}/` : null
  const base = { platform: 'Instagram' as const, approx: false, videoId: code, canonicalUrl }
  if (!code) return fail({ platform: 'Instagram', approx: false }, 'no_video_id', 'No Instagram post code in that link.')

  // Cheapest handle first: the link itself, then the creator's saved profile.
  // Either avoids a lookup for the common case, and neither is trusted - if the
  // code is not on that profile's tab we go and ask who really owns it.
  const guess = igHandleFrom(url) ?? igHandleFrom(handleHint)

  let refused = false
  // Whether the creator's own public tab was READ (not refused, not missing). See "DELETED, OR A BAD LINK" below.
  let guessTabRead = false
  const lookIn = async (username: string): Promise<number | null> => {
    try {
      const tab = await igReels(cache, username)
      if (username === guess) guessTabRead = !tab.more
      return tab.map.get(code) ?? null
    } catch (e) {
      if (!(e instanceof IgNoProfileError)) refused = true
      return null
    }
  }

  if (guess) {
    const views = await lookIn(guess)
    if (views != null) {
      // THE FAST PATH STAYS FAST UNLESS SOMEBODY ASKED FOR MORE. The reels tab
      // gave us the number in one request and knows nothing about the caption,
      // so the post lookup below is a SECOND request - worth it for one video
      // being added by hand, never worth it for four hundred on a cron.
      if (!meta) return { ...base, views, error: null }
      const got = await igOwner(cache, code)
      const extra = got === IG_FAILED ? null : got
      return {
        ...base,
        views,
        error: null,
        caption: extra?.caption ?? null,
        author: extra?.username ?? guess,
        thumbnail: extra?.thumbnail ?? null,
        postedAt: extra?.takenAt ?? null,
      }
    }
  }

  const owner = await igOwner(cache, code)
  if (owner === IG_FAILED) {
    return { ...fail(base, 'blocked',
      'Instagram did not answer from this server. It will be asked again from another region, and on the next sync.'), walled: true }
  }
  if (!owner) {
    if (refused) {
      return { ...fail(base, 'blocked',
        'Instagram did not answer from this server. It will be asked again from another region, and on the next sync.'), walled: true }
    }
    // DELETED, OR A BAD LINK (19 Oct 2026). The team: "you should know if that's actually been deleted or it's just the
    // link that doesn't work". When Instagram says no post has this code AND the creator's own public reels tab was read
    // to the end without it, the reel is gone: deleted or archived. Only when we could not see their tab is it still a
    // question (a private account, or a link to somebody else's post).
    if (guessTabRead) {
      return fail(base, 'removed',
        `Instagram has no post with that code and it is not on @${guess}'s public reels: the reel was deleted or archived.`)
    }
    return fail(base, 'no_video_id',
      'Instagram has no post with that code. Deleted, or the account is private.')
  }
  // Everything from here on already HAS the owner lookup in hand, so the
  // metadata is free on every one of these paths - `extras` is spread into each
  // return rather than repeated field by field.
  const extras = meta
    ? { caption: owner.caption ?? null, author: owner.username, thumbnail: owner.thumbnail ?? null, postedAt: owner.takenAt ?? null }
    : {}

  // A photo (1) or a carousel (8) has no plays because it is not a video, which
  // is a different thing from a video whose plays we could not read.
  if (owner.mediaType === 1 || owner.mediaType === 8) {
    return fail(base, 'not_a_video', 'That Instagram post is a photo or a carousel, so it has no view count.')
  }
  if (!owner.username) {
    return fail(base, 'no_video_id', 'Instagram would not say who posted that.')
  }
  if (!guess || owner.username.toLowerCase() !== guess) {
    const views = await lookIn(owner.username)
    if (views != null) return { ...base, views, error: null, ...extras }
  }
  // A reel, by its owner, not in the first 96: read further back before calling it missing.
  if (!refused && (!owner.productType || owner.productType === 'clips')) {
    try {
      const deep = await igReelsDeeper(cache, owner.username, code)
      if (deep != null) return { ...base, views: deep, error: null, ...extras }
    } catch (e) {
      if (!(e instanceof IgNoProfileError)) refused = true
    }
  }
  // The reels tab was refused rather than read, so "not on the tab" would be a guess.
  if (refused) {
    return { ...fail(base, 'blocked',
      'Instagram did not answer from this server. It will be asked again from another region, and on the next sync.'), walled: true, ...extras }
  }

  // We know who posted it and we read their tab. If it is not there, it is
  // either not a reel (a feed video does not appear on the reels tab) or the
  // account is private. Both need a person, and neither is a "trial reel".
  if (owner.productType && owner.productType !== 'clips') {
    return fail(base, 'not_on_reels_tab',
      'That is a feed video, not a reel, so Instagram does not show its views publicly. Enter the number by hand.')
  }
  return fail(base, 'not_on_reels_tab',
    `That reel is not on @${owner.username}'s public reels tab. A private account, or a reel too far back to reach.`)
}

// INSTAGRAM FAILS OVER ACROSS REGIONS TOO (11 Oct 2026). On 11 Oct every Instagram read from the usual region failed for
// six hours (78 alerts), while the same doc_ids answered from anywhere else: Instagram, like Facebook, refuses a server IP
// for a while after a burst. So a refused read is handed to this function in another Supabase region, the same way
// Facebook's are, and once this region has been refused the rest of the run goes straight to a region that answered
// (each hop is one video, so the per-creator reels cache only helps while this region is answering).
// Measured 11 Oct 2026 across all sixteen regions: three answered (eu-west-2, eu-west-3, eu-west-1), thirteen were
// refused. Which ones changes, so they only lead the order; every region is tried before giving up, and a refused one
// answers in about a second.
export const igGoodRegions: string[] = ['eu-west-2', 'eu-west-3', 'eu-west-1']
export const IG_MAX_HOPS = 16
export let igHereRefusedUntil = 0

export async function instagramViews(url: string, cache: IgCache, handleHint: string | null = null, meta = false): Promise<Resolved> {
  let here: IgLocal | null = null
  if (Date.now() >= igHereRefusedUntil) {
    here = await instagramReadHere(url, cache, handleHint, meta)
    if (!here.walled || !WEBHOOK_SECRET) return here
    igHereRefusedUntil = Date.now() + 10 * 60_000
  }
  if (!WEBHOOK_SECRET) return here ?? instagramReadHere(url, cache, handleHint, meta)

  let last: IgLocal | null = here
  for (const region of regionOrder(igGoodRegions).slice(0, IG_MAX_HOPS)) {
    let r: IgLocal | null = null
    try {
      const ctrl = new AbortController()
      const timer = setTimeout(() => ctrl.abort(), 30_000)
      const res = await fetch(`${SUPABASE_URL}/functions/v1/view-sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET, 'x-region': region },
        body: JSON.stringify({ instagram_read: { url, handle: handleHint, meta } }),
        signal: ctrl.signal,
      }).finally(() => clearTimeout(timer))
      if (res.ok) r = (await res.json()) as IgLocal
      else await res.body?.cancel()
    } catch {
      r = null
    }
    if (!r) continue
    last = r
    if (!r.walled) {
      const at = igGoodRegions.indexOf(region)
      if (at >= 0) igGoodRegions.splice(at, 1)
      igGoodRegions.unshift(region)
      return r
    }
    const bad = igGoodRegions.indexOf(region)
    if (bad >= 0) igGoodRegions.splice(bad, 1)
  }
  return last ?? instagramReadHere(url, cache, handleHint, meta)
}
