// What every platform reader shares: settings, the browser identity, fetching with redirect checks, and the shape
// of a reading. Split out of index.ts on 21 Oct 2026 (moved, not rewritten).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { type Platform, fetchHostAllowed } from './hosts.ts'

export const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
export const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
export const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET') ?? ''
export const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)

// Settings live in private.config, read through a definer RPC only service_role
// may execute, so each can be replaced from the admin panel without a redeploy.
// The env vars stay as fallbacks.
//
// There is NO Instagram credential here any more, and there must not be one
// again: a session cookie is what got the Tryp.com UK account warned for
// automated behaviour. The two doc_id fields are not secrets, they are Meta's
// persisted-query ids, kept here so a rotation is a paste rather than a deploy.
export type Secrets = {
  youtube_api_key: string
  instagram_reels_doc_id: string
  instagram_post_doc_id: string
}
export let secretsCache: Secrets | null = null
export async function secrets(): Promise<Secrets> {
  if (secretsCache) return secretsCache
  const { data } = await supabase.rpc('get_view_sync_secrets')
  const row = (data ?? {}) as Record<string, string>
  secretsCache = {
    youtube_api_key: (row.youtube_api_key ?? Deno.env.get('YOUTUBE_API_KEY') ?? '').trim(),
    instagram_reels_doc_id: (row.instagram_reels_doc_id ?? '').trim(),
    instagram_post_doc_id: (row.instagram_post_doc_id ?? '').trim(),
  }
  return secretsCache
}

// One browser identity for every request. TikTok serves a bot shell to anything
// that looks automated, so this stays fixed and looks like a real browser.
export const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36'

// Facebook answers a /share/ link with a 400 to the desktop agent and follows it
// properly for a phone, so link RESOLUTION is done as a phone. Reading the count
// is still done as the desktop agent, because that is the response that carries
// og:title.
export const MOBILE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export const FETCH_TIMEOUT_MS = 10_000

// The pause after each Instagram / Facebook read: a polite rate is what keeps a public route public.
export const IG_GAP_MS = 120
export const FB_GAP_MS = 600

export class HttpError extends Error {
  constructor(public status: number) { super(`http ${status}`) }
}

export async function checkedFetch(url: string, init: RequestInit): Promise<{ res: Response; url: string }> {
  const manual = init.redirect === 'manual'
  let current = url
  for (let hop = 0; hop <= 6; hop++) {
    if (!fetchHostAllowed(current)) throw new Error('blocked_host')
    const res = await fetch(current, { ...init, redirect: 'manual' })
    const next = res.headers.get('location')
    if (manual || res.status < 300 || res.status >= 400 || !next) return { res, url: current }
    await res.body?.cancel()
    current = new URL(next, current).toString()
  }
  throw new Error('too_many_redirects')
}

export async function getText(url: string, headers: Record<string, string> = {}, redirect: RequestRedirect = 'follow'): Promise<string> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const { res } = await checkedFetch(url, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'en-GB,en;q=0.9', ...headers },
      redirect,
      signal: ctrl.signal,
    })
    if (!res.ok) {
      await res.body?.cancel()
      throw new HttpError(res.status)
    }
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

export type Resolved = {
  platform: Platform | null
  // THE WORDS ON THE VIDEO (9 Oct 2026). Ethan: "you have pulled the hooks from these videos because they're visibly on
  // the screen, but they're in a different language - you could actually pull the text from it." TikTok keeps every text
  // sticker a creator typed in its editor as `stickerText`, in the same embed page that carries the play count, so the
  // hook is free on TikTok and needs no OCR. Other platforms burn the text into pixels and give nothing.
  screenText?: string | null
  videoId: string | null
  canonicalUrl: string | null
  views: number | null
  approx: boolean
  error: string | null
  detail?: string
  // WHAT THE POST SAYS, NOT JUST HOW MANY WATCHED IT (9 Sep 2026).
  //
  // Ethan, asking for the video tracker: "we would want the hooks for this. I
  // wonder if you can pull these from the video, because you have the scraper
  // already - see if you can do that, so it can actually pull the hook they
  // used and maybe the description. Or their accounts."
  //
  // Every one of these is already inside a response this function fetches to
  // read a view count. Reading them costs nothing extra on TikTok, where the
  // embed page carries the description and the author beside the play count;
  // it costs one extra request on Instagram and one extra `part` on YouTube,
  // which is why they are gated behind `meta` and never happen in the sweep.
  //
  // ALL FOUR ARE OPTIONAL AND ALWAYS WILL BE. A missing caption is a caption
  // the platform did not give us, and it must never turn a successful view
  // read into a failure - which is the shape of every metadata bug there is.
  caption?: string | null
  author?: string | null
  thumbnail?: string | null
  postedAt?: string | null
}

export const fail = (base: Partial<Resolved>, error: string, detail: string): Resolved => ({
  platform: null, videoId: null, canonicalUrl: null, views: null, approx: false, ...base, error, detail,
})

export async function followRedirects(url: string, ua: string = UA): Promise<string | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
  try {
    const { res, url: landed } = await checkedFetch(url, { redirect: 'follow', headers: { 'User-Agent': ua }, signal: ctrl.signal })
    await res.body?.cancel()
    return landed || null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
