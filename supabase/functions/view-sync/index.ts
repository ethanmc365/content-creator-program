// Supabase Edge Function: view-sync
//
// Reads the view count of a challenge entry straight off the link the creator
// submitted. Four platforms.
//
//   TikTok     Exact, nothing needed.
//   YouTube    Exact, needs a free Data API v3 key: YouTube bot-blocks servers.
//   Facebook   Exact, nothing needed. Read as a search crawler off
//              /reel/<id>/, and HOPPED ACROSS SUPABASE REGIONS when one of them
//              meets Facebook's login wall (see ./facebook.ts).
//   Instagram  Exact, NOTHING needed. Read off the creator's public reels tab,
//              which states a view count to anybody signed out. The session
//              cookie this used to carry got the Tryp.com UK account warned for
//              automated behaviour and was deleted on 25 Aug 2026.
//
// Callers, all authenticated:
//   pg_cron / run_view_sync()   x-webhook-secret, {}              -> stale sweep
//   itself                      x-webhook-secret, { continuation } -> next chunk
//   admin "Sync now"            admin JWT, { challenge_id, force } -> read now
//   Testing Centre              admin JWT, { probe: url }          -> READ ONLY
//   submit forms                any JWT,   { check: url }          -> photo or video? (IG/FB only)
//   itself, in another region   x-webhook-secret, { facebook_read } -> one FB read
//
// SCALE. Staleness belongs to the ENTRY, not the run: each invocation takes the
// oldest-read chunk it can finish, then hands the rest to a fresh one.
//
// Deploy with verify_jwt=false: it authenticates callers itself.
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5'
import { corsHeaders } from '../_shared/cors.ts'
import { type Platform, platformOf } from './hosts.ts'
import { SUPABASE_URL, WEBHOOK_SECRET, supabase, secrets, sleep, type Resolved, fail, IG_GAP_MS, FB_GAP_MS } from './shared.ts'
import { tiktokViews, tiktokViewsAnywhere } from './tiktok.ts'
import { youtubeViews } from './youtube.ts'
import { facebookReadHere, facebookViews } from './facebookRead.ts'
import { igHandleFrom, type IgCache, newIgCache, instagramReadHere, instagramViews } from './instagram.ts'
export { platformOf }


// A chunk is what one invocation can finish comfortably. Bigger programmes are
// not read in one heroic run: the chain continues itself, and the hourly cron
// tops up whatever is still stale. 120 entries take roughly fifteen seconds.
const CHUNK = 120
const MAX_CHUNKS_PER_CHAIN = 40 // 4,800 entries before a chain stops itself

// Concurrency is per platform, not global. TikTok, YouTube and Facebook are
// public endpoints and take the wide lane. Instagram keeps the narrow one even
// though it is now public too: reads are batched per creator rather than per
// video, so the lane is rarely the limit, and a polite rate is what keeps a
// public route public.
// 10, from 8 (19 Oct 2026): a 738-entry final sync was ~590 TikTok reads in this lane, and TikTok's embed page is the
// lightest read we make. Instagram and Facebook stay where they are; they are the ones that wall a server.
const LANE_PUBLIC = 10
const LANE_INSTAGRAM = 3
const LANE_FACEBOOK = 2
// Failures worth a second try in the same run (see `retry` in syncChunk), and the pause before it.
const TRANSIENT = new Set(['fetch_failed', 'no_count_in_page'])
const RETRY_PAUSE_MS = 3_000

const SOURCE: Record<Platform, string> = {
  TikTok: 'tiktok', Instagram: 'instagram', YouTube: 'youtube', Facebook: 'facebook',
}

// ---------------------------------------------------------------- transport
// CORS COMES FROM THE SHARED MODULE (17 Sep 2026), AND THIS WAS THE WIDEST OF
// THEM.
//
// The copy that was here read `hostname.endsWith('.vercel.app')` with NO exact
// host check beside it at all - not even the narrowed prefix pattern the other
// functions had - so every Vercel origin on the internet was reflected. It was
// missed twice: once by the sweep that wrote `_shared/cors.ts`, and again by
// the audit that listed four functions as still open, because both worked from
// the set of functions a browser calls on a page load and this one is mostly
// called by cron.
//
// Severity, honestly: hygiene, like the rest. Every route below verifies either
// an admin JWT from an explicit Authorization header or the cron webhook secret,
// and no cookie rides along, so a hostile page could not make this run as
// anybody - it could only read a reply it could have got from curl. Closing it
// anyway, because `x-webhook-secret` is in the allowed-headers list and a wide
// origin plus a named secret header is the shape of a mistake waiting for its
// second half.
//
// `x-webhook-secret` is this function's own header, so it is passed to the
// shared helper rather than added to the shared list.
function cors(req: Request) {
  return corsHeaders(req, 'x-webhook-secret')
}
const json = (req: Request, obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...cors(req), 'Content-Type': 'application/json' } })

const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))

// Verified via JWKS, never auth.getUser: a global sign-out elsewhere deletes the
// session row while the token stays valid for its week, and getUser then 401s
// while the rest of the app carries on working.
async function callerId(req: Request): Promise<string | null> {
  const raw = req.headers.get('authorization')?.replace(/^Bearer /i, '') ?? ''
  if (!raw) return null
  try {
    const { payload } = await jwtVerify(raw, JWKS, { issuer: `${SUPABASE_URL}/auth/v1`, audience: 'authenticated' })
    return payload.sub ? String(payload.sub) : null
  } catch {
    return null
  }
}

async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await supabase.from('profiles').select('is_admin').eq('id', userId).maybeSingle()
  return data?.is_admin === true
}

// --------------------------------------------------------------- dispatcher
// Takes a HOSTNAME, anchored at both ends. A substring test would accept
// `tiktok.com.evil.test`, and the platform branches fall back to fetching the
// submitted URL itself - so a loose match is a request sent wherever an
// attacker likes.

async function resolveOne(
  url: string,
  knownId: string | null = null,
  // `meta` is OFF for the sweep and ON for a probe. See the note on `Resolved`:
  // two of the four platforms need an extra call to say what a post says, and
  // the sweep reads hundreds of rows an hour. A tracker adding one video by
  // hand can afford a second request; a cron reading four hundred cannot.
  opts: { igCache?: IgCache; igHandle?: string | null; meta?: boolean } = {},
): Promise<Resolved> {
  let target: URL
  try {
    target = new URL(url.trim())
  } catch {
    return fail({}, 'bad_url', 'That is not a URL.')
  }
  if (target.protocol !== 'https:' && target.protocol !== 'http:') {
    return fail({}, 'bad_url', 'Only http(s) links.')
  }
  switch (platformOf(target.hostname)) {
    case 'TikTok': return tiktokViewsAnywhere(target.toString(), knownId, !!opts.meta)
    case 'Instagram':
      return instagramViews(target.toString(), opts.igCache ?? newIgCache(), opts.igHandle ?? null, !!opts.meta)
    case 'YouTube': return youtubeViews(target.toString(), !!opts.meta)
    case 'Facebook': return facebookViews(target.toString(), knownId)
    default:
      return fail({}, 'unsupported',
        'Only TikTok, Instagram, YouTube and Facebook state a view count we can read.')
  }
}

// ------------------------------------------------------------------- syncing
type Row = {
  id: string
  video_url: string
  platform: string
  logged_views: number | null
  platform_video_id: string | null
  creator_id: string | null
  posted_at?: string | null
  // A VIP video (table vip_videos), not a challenge entry. Everything else about reading it is the same.
  vip?: boolean
  // 'manual' = the team typed the number because the platform will not state one (9 Oct 2026).
  views_source?: string | null
  screen_text?: string | null
  views_synced_at?: string | null
}

async function publishRun(value: Record<string, unknown>) {
  await supabase.from('app_settings').upsert({
    key: 'view_sync_run', value, updated_at: new Date().toISOString(),
  })
}

// Run `items` through `worker` with at most `limit` in flight.
async function pool<T>(items: T[], limit: number, worker: (item: T) => Promise<void>) {
  let next = 0
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) await worker(items[next++])
  })
  await Promise.all(runners)
}

type Progress = {
  started_at: string
  trigger: 'scheduled' | 'admin'
  total: number
  done: number
  updated: number
  failed: number
  chunk: number
}

// The creators behind this chunk's Instagram entries, so their saved handle can
// point straight at the right reels tab. It is a hint and not a fact: if the
// code is not on that tab the resolver goes and asks who really posted it.
async function igHandles(rows: Row[]): Promise<Map<string, string>> {
  const ids = [...new Set(rows.filter((r) => r.platform === 'Instagram' && r.creator_id).map((r) => r.creator_id!))]
  if (!ids.length) return new Map()
  const { data } = await supabase.from('profiles').select('id, instagram_url').in('id', ids)
  const out = new Map<string, string>()
  for (const row of (data ?? []) as { id: string; instagram_url: string | null }[]) {
    const handle = igHandleFrom(row.instagram_url)
    if (handle) out.set(row.id, handle)
  }
  return out
}

// `quiet` reads without touching the published run status (see the new-entry
// read in the handler): it must not overwrite a sweep's progress bar.
async function syncChunk(rows: Row[], progress: Progress, quiet = false): Promise<Progress> {
  const p = { ...progress }
  let sincePublish = 0

  // One cache for this chunk and no longer. An isolate is reused between
  // invocations, so a cache that outlived the run would serve yesterday's
  // counts as today's.
  const igCache = newIgCache()
  const handles = await igHandles(rows)

  // A READ THAT FAILED FOR A PASSING REASON IS TRIED AGAIN IN THE SAME RUN (19 Oct 2026). The team: "it doesn't read
  // the entries every time... one entry wasn't right, so I have to do it again". A platform that refused one request or
  // timed out usually answers a few seconds later, so those rows get one more go at the end of the chunk instead of
  // waiting for somebody to press Sync again. A real answer (deleted, a photo post, no id) is never retried.
  const retry: Row[] = []
  const one = async (row: Row, second = false) => {
    // YOUTUBE HAS NO DATE IN ITS ID (TikTok and Instagram do, and SQL decodes
    // those). The publish date comes back in `snippet`, so a YouTube entry with
    // no `posted_at` yet asks for it once - same quota unit either way.
    const wantDate = row.platform === 'YouTube' && !row.posted_at
    const r = await resolveOne(row.video_url, row.platform_video_id, {
      igCache,
      igHandle: row.creator_id ? handles.get(row.creator_id) ?? null : null,
      meta: wantDate,
    })
    const now = new Date().toISOString()

    const table = row.vip ? 'vip_videos' : 'submissions'
    // Instagram and Facebook have already tried every region before saying "blocked", so only their timeouts are
    // retried; a blocked TikTok or YouTube read has not.
    const transient = TRANSIENT.has(r.error ?? '')
      || (r.error === 'blocked' && row.platform !== 'Instagram' && row.platform !== 'Facebook')
    if (r.views == null && !second && transient) {
      retry.push(row)
      return
    }
    if (r.views == null) {
      // A number the team typed by hand stands when the platform still will not answer: no error flag to chase.
      // A challenge entry that is a PHOTO post too (15 Oct 2026): no platform states its views, so the number the team
      // types from the creator's Insights is the only one there will ever be, and the sync must stop flagging it.
      const typed = row.views_source === 'manual' && (row.vip || (r.error === 'not_a_video' && row.logged_views != null))
      await supabase.from(table).update({
        views_sync_error: typed ? null : r.error,
        views_synced_at: now,
        ...(r.videoId ? { platform_video_id: r.videoId } : {}),
      }).eq('id', row.id)
      p.failed += 1
    } else {
      const source = r.platform ? SOURCE[r.platform] : 'manual'
      // One unchanged reading a day is all the history needs: the readers of
      // view_snapshots (daily gains, sparklines) work per day. An hourly sync
      // used to add a row per entry per hour even when nothing had moved.
      // VIP readings are kept in full - they decide what VIPs are paid.
      const readToday = !!row.views_synced_at && row.views_synced_at.slice(0, 10) === now.slice(0, 10)
      const unchangedToday = readToday && row.logged_views === r.views
      if (row.vip) await supabase.from('vip_view_readings').insert({ video_id: row.id, views: r.views, source })
      else if (!unchangedToday) await supabase.from('view_snapshots').insert({ submission_id: row.id, views: r.views, source })

      // The platform is the source of truth, full stop. An earlier version
      // refused to write a reading that was LOWER than the saved number, on the
      // theory that views only rise. They do - but the saved number was
      // sometimes simply wrong, typed from the wrong video, and the guard then
      // preserved that error forever while flagging the truth as the problem.
      // A number typed by hand is for what the platform cannot answer, not for
      // outranking what it can.
      const patch = {
        logged_views: r.views,
        views_approx: r.approx,
        views_source: source,
        views_synced_at: now,
        views_sync_error: null,
        ...(r.videoId ? { platform_video_id: r.videoId } : {}),
        // Any platform that stated a date fills an empty one: YouTube (asked for above) and Facebook (free, 11 Oct 2026).
        ...(!row.posted_at && r.postedAt ? { posted_at: r.postedAt } : {}),
        // Read once: the words on a video do not change, and a second write would only be more work for the same row.
        ...(!row.screen_text && r.screenText ? { screen_text: r.screenText } : {}),
      }
      // A WRITE THAT FAILS IS RETRIED, NOT REPORTED AS AN UNREADABLE VIDEO.
      // The view WAS read; what failed was saving it, and on a points challenge
      // that save recalculates the whole board, so two at once used to deadlock
      // (fixed in migration 247 with a per-challenge lock). A retry covers
      // whatever transient failure is left, so "could not be read" only ever
      // means the platform would not answer.
      let error: unknown = null
      for (let attempt = 0; attempt < 4; attempt++) {
        ;({ error } = await supabase.from(table).update(patch).eq('id', row.id))
        if (!error) break
        await sleep(400 * (attempt + 1) + Math.floor(Math.random() * 300))
      }

      if (error) p.failed += 1
      else p.updated += 1
    }

    p.done += 1
    sincePublish += 1
    // Published often enough that the button counts up smoothly, rarely enough
    // that it is not one write per entry.
    if (sincePublish >= 10 && !quiet) {
      sincePublish = 0
      await publishRun({ running: true, ...p })
    }
  }

  const isFacebook = (r: Row) => r.platform === 'Facebook' || /(^|\/\/|\.)(facebook\.com|fb\.watch|fb\.com|fb\.me)\//i.test(r.video_url)
  const instagram = rows.filter((r) => r.platform === 'Instagram')
  const facebook = rows.filter((r) => r.platform !== 'Instagram' && isFacebook(r))
  const publicRows = rows.filter((r) => r.platform !== 'Instagram' && !isFacebook(r))

  // FACEBOOK GOES SLOWLY ON PURPOSE. It walls a server IP that asks too fast,
  // and a burst is exactly what got one region walled while measuring this.
  await Promise.all([
    pool(publicRows, LANE_PUBLIC, (row) => one(row)),
    pool(instagram, LANE_INSTAGRAM, async (row) => { await one(row); await sleep(IG_GAP_MS) }),
    pool(facebook, LANE_FACEBOOK, async (row) => { await one(row); await sleep(FB_GAP_MS) }),
  ])
  if (retry.length) {
    await sleep(RETRY_PAUSE_MS)
    // Slowly, one platform lane each: these are the rows a platform already pushed back on once.
    await pool(retry, 2, async (row) => { await one(row, true); await sleep(isFacebook(row) ? FB_GAP_MS : IG_GAP_MS) })
  }

  if (!quiet) await publishRun({ running: true, ...p })
  return p
}

// Which entries the SCHEDULED sweep reads: challenges that are still running.
//
// THE DEADLINE ENDS THE AUTOMATIC READING. It used to keep sweeping for a month
// after a challenge finished, on the reasoning that entries posted near the
// deadline keep accruing views while the result is judged. Ethan's call, and it
// is the right one: once the deadline has passed the numbers that matter are
// the ones at the deadline, and a sweep that keeps moving them means the figure
// somebody screenshotted on Monday is not the figure they are judged on by
// Wednesday.
//
// THIS DOES NOT AFFECT "SYNC NOW". A run that names a challenge never comes
// through here - see `staleRows`, which filters by `challenge_id` directly - so
// an admin closing an ended challenge can still read every entry one last time,
// which is exactly when they should.
//
// A challenge whose winners are already published is done either way: its
// numbers are the ones it was judged on, and re-reading them rewrites history.
async function eligibleChallengeIds(): Promise<string[]> {
  // Date, not timestamp: a challenge ending today is still running today.
  const today = new Date().toISOString().slice(0, 10)
  const { data } = await supabase
    .from('challenges').select('id').is('winners_published_at', null).gte('end_date', today)
  return (data ?? []).map((c: { id: string }) => c.id)
}

const ROW_COLS = 'id, video_url, platform, logged_views, platform_video_id, creator_id, posted_at, screen_text, views_synced_at, views_source'

// Due for a reading: never read, read longer ago than the interval, or never
// read SUCCESSFULLY. The last group is retried on every hourly tick instead of
// waiting out the interval: a failed first read is usually transient (Facebook
// answers about 1 request in 10 with a consent page) and until it works the
// entry shows no views at all. A row that has a count keeps it and waits, and
// errors that reading again cannot fix (a photo post, a link that is not a
// video) are not retried early either.
//
// RETRY_GAP keeps a failing row from being due again INSIDE the run that just
// tried it: a sweep chains while anything is still due, so without the gap one
// stubborn link would be re-read by every chunk up to MAX_CHUNKS_PER_CHAIN.
const PERMANENT_ERRORS = 'not_a_video,bad_url,unsupported'
const RETRY_GAP_MS = 45 * 60_000
// THE CRON IS EARLY BY A FEW SECONDS, SO THE INTERVAL ALLOWS FOR IT (15 Oct 2026). Sweeps start on the hour's tick and a
// row read a minute into the last sweep is not yet "older than 2 hours" when the next due one starts - so a 2-hour VIP
// setting read every 3 hours and a 6-hour one every 7. A quarter of an hour of slack makes the setting mean what it says.
const STALE_SLACK_MS = 15 * 60_000
function staleFilter(intervalHours: number): string {
  const staleBefore = new Date(Date.now() - Math.max(intervalHours * 3600_000 - STALE_SLACK_MS, intervalHours * 1800_000)).toISOString()
  const retryBefore = new Date(Date.now() - RETRY_GAP_MS).toISOString()
  return `views_synced_at.is.null,views_synced_at.lt.${staleBefore},` +
    `and(logged_views.is.null,views_sync_error.not.is.null,views_sync_error.not.in.(${PERMANENT_ERRORS}),views_synced_at.lt.${retryBefore})`
}

// STALENESS BELONGS TO THE ENTRY, not to the run. Oldest reading first, so a
// programme too big to read in one go drains evenly instead of the same first
// hundred being refreshed over and over.
async function staleRows(challengeId: string | undefined, intervalHours: number, force = false, runStartedAt?: string): Promise<Row[]> {
  let q = supabase.from('submissions').select(ROW_COLS)

  if (challengeId) {
    q = q.eq('challenge_id', challengeId)
  } else {
    const ids = await eligibleChallengeIds()
    if (!ids.length) return []
    q = q.in('challenge_id', ids)
  }

  // FORCE skips the staleness rule entirely. Pressing "Sync now" has to sync:
  // the scheduled sweep reads what has gone stale, but an admin asking for it
  // means "read these now", and a button that quietly does nothing because
  // everything was read four hours ago is a button that looks broken.
  if (!force) {
    q = q.or(staleFilter(intervalHours))
  } else if (runStartedAt) {
    // A FORCED RUN NEVER READS AN ENTRY TWICE (26 Sep 2026). Each chunk used to
    // take the 120 OLDEST readings, and the entries the first chunk had just
    // read were not the newest by then for long - so chunk two re-read most of
    // chunk one. Ethan saw "Reading 210 of 134", and every failure was counted
    // once per re-read ("7 could not be read" for 4 entries). Anything read
    // since this run began is done.
    q = q.or(`views_synced_at.is.null,views_synced_at.lt.${runStartedAt}`)
  }

  const { data } = await q
    .order('views_synced_at', { ascending: true, nullsFirst: true })
    .limit(CHUNK)
  return (data ?? []) as Row[]
}

async function countStale(challengeId: string | undefined, intervalHours: number, force = false): Promise<number> {
  let q = supabase.from('submissions').select('id', { count: 'exact', head: true })

  if (challengeId) {
    q = q.eq('challenge_id', challengeId)
  } else {
    const ids = await eligibleChallengeIds()
    if (!ids.length) return 0
    q = q.in('challenge_id', ids)
  }
  if (!force) {
    q = q.or(staleFilter(intervalHours))
  }
  const { count } = await q
  return count ?? 0
}

// THE VIP LANE (2 Oct 2026). VIP creators are paid by views gained in a month, so their videos are read
// on the same machinery but live in `vip_videos` (see migration 294) with every reading kept in
// `vip_view_readings`. A request with `vip_only` reads only those, on its own interval, and never
// touches a challenge entry.
const VIP_COLS = 'id, video_url, platform, logged_views, platform_video_id, profile_id, posted_at, views_source, screen_text'

// A VIP VIDEO STOPS BEING READ WHEN ITS MONTH IS OVER (13 Oct 2026). A video earns in the month it was posted and in no
// other (vip_video_counted), so reading it after that month's final reading only costs requests. Ethan: "it should
// always stop counting after the new month begins". The cutoff is the start of the current UTC month, held back six
// hours into the new month (the final reading of the old one) and fourteen more for the markets east of UTC.
export function vipReadCutoff(now = Date.now()): string {
  const d = new Date(now - 6 * 3600_000)
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1) - 14 * 3600_000).toISOString()
}

async function vipStaleRows(intervalHours: number, force: boolean, runStartedAt?: string): Promise<Row[]> {
  let q = supabase.from('vip_videos').select(VIP_COLS).eq('status', 'tracking').gte('submitted_at', vipReadCutoff())
  if (!force) {
    q = q.or(staleFilter(intervalHours))
  } else if (runStartedAt) {
    q = q.or(`views_synced_at.is.null,views_synced_at.lt.${runStartedAt}`)
  }
  const { data } = await q.order('views_synced_at', { ascending: true, nullsFirst: true }).limit(CHUNK)
  return ((data ?? []) as (Row & { profile_id: string })[]).map((r) => ({ ...r, creator_id: r.profile_id, vip: true }))
}

async function countVipStale(intervalHours: number, force: boolean): Promise<number> {
  let q = supabase.from('vip_videos').select('id', { count: 'exact', head: true }).eq('status', 'tracking').gte('submitted_at', vipReadCutoff())
  if (!force) {
    q = q.or(staleFilter(intervalHours))
  }
  const { count } = await q
  return count ?? 0
}

async function namedRows(submissionIds: string[]): Promise<Row[]> {
  const { data } = await supabase.from('submissions').select(ROW_COLS).in('id', submissionIds).limit(CHUNK)
  return (data ?? []) as Row[]
}

async function syncInterval(): Promise<number> {
  const { data } = await supabase.from('app_settings').select('value').eq('key', 'view_sync').maybeSingle()
  const hours = Number((data?.value as { interval_hours?: number })?.interval_hours)
  return Number.isFinite(hours) && hours > 0 ? hours : 24
}

// Hand the rest of the work to a fresh invocation rather than trying to finish
// it here. Each chunk gets its own clock, so a programme of any size drains at a
// steady rate instead of one run racing a timeout.
async function continueChain(scope: { challenge_id?: string; force?: boolean; vip_only?: boolean; vip_interval_hours?: number }, progress: Progress) {
  try {
    await fetch(`${SUPABASE_URL}/functions/v1/view-sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': WEBHOOK_SECRET },
      body: JSON.stringify({ ...scope, continuation: progress }),
    })
  } catch {
    // If the hand-off fails the entries simply stay stale and the hourly cron
    // picks them up, which is the whole point of staleness being per entry.
  }
}

async function finishRun(p: Progress) {
  const at = new Date().toISOString()
  await supabase.from('app_settings').upsert({
    key: 'view_sync_last_run',
    value: { at, ran: p.done, updated: p.updated, failed: p.failed, trigger: p.trigger },
    updated_at: at,
  })
  await publishRun({ running: false, finished_at: at, ...p })
}

// ---------------------------------------------------------------------- http
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors(req) })
  if (req.method !== 'POST') return json(req, { error: 'method not allowed' }, 405)

  const body = (await req.json().catch(() => ({}))) as {
    facebook_read?: { url: string; knownId: string | null }
    instagram_read?: { url: string; handle: string | null; meta?: boolean }
    tiktok_read?: { url: string; knownId: string | null; meta?: boolean }
    probe?: string
    check?: string
    challenge_id?: string
    submission_ids?: string[]
    continuation?: Progress
    force?: boolean
    vip_only?: boolean
    vip_interval_hours?: number
  }

  const secret = req.headers.get('x-webhook-secret') ?? ''
  const fromCron = WEBHOOK_SECRET !== '' && secret === WEBHOOK_SECRET

  // ONE FACEBOOK READ, in whatever region this invocation landed in. Only this
  // function asks for it (it carries the webhook secret); see facebookViews.
  if (body.facebook_read) {
    if (!fromCron) return json(req, { error: 'unauthorised' }, 401)
    const { url, knownId } = body.facebook_read
    return json(req, await facebookReadHere(String(url), knownId ? String(knownId) : null))
  }

  // ONE TIKTOK READ, in whatever region this invocation landed in (see tiktokViewsAnywhere).
  if (body.tiktok_read) {
    if (!fromCron) return json(req, { error: 'unauthorised' }, 401)
    const { url, knownId, meta } = body.tiktok_read
    return json(req, await tiktokViews(String(url), knownId ? String(knownId) : null, !!meta))
  }

  // ONE INSTAGRAM READ, in whatever region this invocation landed in (see instagramViews).
  if (body.instagram_read) {
    if (!fromCron) return json(req, { error: 'unauthorised' }, 401)
    const { url, handle, meta } = body.instagram_read
    return json(req, await instagramReadHere(String(url), newIgCache(), handle ? String(handle) : null, !!meta))
  }

  // PHOTO POSTS DO NOT COUNT, AND THE CREATOR HEARS IT BEFORE THE ENTRY IS SAVED (16 Oct 2026). The submit forms ask
  // this about an Instagram `/p/` link (a reel or a photo, the link cannot say which) and a Facebook `/posts/` link.
  // Any signed-in creator may ask, so it is narrow: Instagram and Facebook only, one link, no metadata, nothing
  // written but the rate-limit row, 20 asks per 10 minutes per person. `photo` only when the platform SAID it is not
  // a video; anything we could not read is `unknown`, and the form lets that through rather than refuse a real reel.
  if (body.check) {
    const uid = await callerId(req)
    if (!uid) return json(req, { error: 'unauthorised' }, 401)
    const url = String(body.check).slice(0, 600)
    let host = ''
    try { host = new URL(url).hostname } catch { /* not a link */ }
    const platform = platformOf(host)
    if (platform !== 'Instagram' && platform !== 'Facebook') return json(req, { kind: 'unknown' })
    const key = `post-check:${uid}`
    const since = new Date(Date.now() - 600_000).toISOString()
    const { count } = await supabase.from('auth_attempts').select('id', { count: 'exact', head: true })
      .eq('identifier', key).gte('created_at', since)
    if ((count ?? 0) >= 20) return json(req, { kind: 'unknown', limited: true })
    await supabase.from('auth_attempts').insert({ identifier: key })
    const r = await resolveOne(url, null, { meta: false })
    const kind = r.error === 'not_a_video' ? 'photo'
      : r.views != null ? 'video'
      : platform === 'Facebook' && r.error === 'no_video_id' ? 'photo'
      : 'unknown'
    return json(req, { kind })
  }

  if (!fromCron) {
    const uid = await callerId(req)
    if (!uid) return json(req, { error: 'unauthorised' }, 401)
    if (!(await isAdmin(uid))) return json(req, { error: 'forbidden' }, 403)
  }

  // Testing Centre: resolve a pasted link and return what we saw. Writes nothing
  // anywhere, which is what lets it sit in a harness whose rule is that no lab
  // may touch real data.
  if (body.probe) {
    const started = Date.now()
    // METADATA IS ON FOR A PROBE AND OFF EVERYWHERE ELSE. A probe is one link,
    // asked for by a person who is looking at the answer - the Testing Centre's
    // views lab, and the video tracker's "Read it from the platform". Both want
    // to know what the post SAYS as well as how many watched it, and one extra
    // request is nothing at that scale. See the note on `Resolved`.
    const r = await resolveOne(String(body.probe), null, { meta: true })
    const have = await secrets()
    return json(req, {
      ...r,
      ms: Date.now() - started,
      // Instagram needs nothing, on purpose. It is reported so the panel can say
      // so out loud rather than leaving a blank where a credential used to be.
      instagram_auth: 'none_required',
      youtube_key: have.youtube_api_key ? 'set' : 'missing',
    })
  }

  const continuation = body.continuation

  // A NEW ENTRY, read the moment it is saved (trigger `read_new_entry`). It
  // runs beside whatever else is going: it used to pass through the guard
  // below, so an entry submitted while the hourly sweep ran got a 409 and
  // showed no views until the next hour. It is a handful of rows, so it neither
  // claims the run lock nor writes the progress the "Sync now" button watches.
  if (fromCron && body.submission_ids?.length) {
    const rows = await namedRows(body.submission_ids)
    if (!rows.length) return json(req, { accepted: 0 })
    const progress: Progress = {
      started_at: new Date().toISOString(), trigger: 'scheduled',
      total: rows.length, done: 0, updated: 0, failed: 0, chunk: 1,
    }
    // deno-lint-ignore no-explicit-any
    ;(globalThis as any).EdgeRuntime?.waitUntil?.(syncChunk(rows, progress, true))
    return json(req, { accepted: rows.length }, 202)
  }

  // One chain at a time, claimed in ONE statement (view_sync_claim), so a button press and the cron landing in
  // the same second cannot both start. A CONTINUATION is already inside a run, so it must not be turned away by
  // its own guard. A claim that then finds nothing to read is released.
  let claim: string | null = null
  if (!continuation) {
    const { data, error } = await supabase.rpc('view_sync_claim')
    if (error) return json(req, { error: 'run lock unavailable' }, 503)
    if (!data) return json(req, { busy: true }, 409)
    claim = data as string
  }
  const release = async () => { if (claim) await supabase.rpc('view_sync_release', { p_started: claim }) }

  // Named entries are a one-shot: a caller asking for these exact rows wants
  // them read now, not queued behind a staleness rule.
  if (body.submission_ids?.length) {
    const rows = await namedRows(body.submission_ids)
    if (!rows.length) { await release(); return json(req, { accepted: 0 }) }
    const progress: Progress = {
      started_at: new Date().toISOString(), trigger: fromCron ? 'scheduled' : 'admin',
      total: rows.length, done: 0, updated: 0, failed: 0, chunk: 1,
    }
    await publishRun({ running: true, ...progress })
    // deno-lint-ignore no-explicit-any
    ;(globalThis as any).EdgeRuntime?.waitUntil?.(syncChunk(rows, progress).then(finishRun))
    return json(req, { accepted: rows.length }, 202)
  }

  const vipOnly = body.vip_only === true
  const interval = vipOnly ? (Number(body.vip_interval_hours) > 0 ? Number(body.vip_interval_hours) : 12) : await syncInterval()
  const force = body.force === true
  const rows = vipOnly
    ? await vipStaleRows(interval, force, continuation?.started_at)
    : await staleRows(body.challenge_id, interval, force, continuation?.started_at)

  if (!rows.length) {
    // Nothing stale. If this is the tail of a chain, close the run properly so
    // the button stops spinning; otherwise there was simply nothing to do.
    if (continuation) {
      // deno-lint-ignore no-explicit-any
      ;(globalThis as any).EdgeRuntime?.waitUntil?.(finishRun(continuation))
    }
    await release()
    return json(req, { accepted: 0 })
  }

  const progress: Progress = continuation ?? {
    started_at: new Date().toISOString(),
    trigger: fromCron ? 'scheduled' : 'admin',
    total: vipOnly ? await countVipStale(interval, force) : await countStale(body.challenge_id, interval, force),
    done: 0, updated: 0, failed: 0, chunk: 0,
  }
  progress.chunk += 1
  await publishRun({ running: true, ...progress })

  const work = (async () => {
    const after = await syncChunk(rows, progress)

    // How a chain knows it is finished depends on why it started. A SCHEDULED
    // sweep asks what is still stale, and each chunk it reads stops being
    // stale. A FORCED run has no staleness to count down - every row it reads
    // is fresh the moment it reads it - so it counts against the total it set
    // out with. Using "remaining stale" for a forced run would never reach zero
    // and would loop until the chunk cap.
    const more = force
      ? after.done < after.total && rows.length >= CHUNK
      : (vipOnly ? await countVipStale(interval, false) : await countStale(body.challenge_id, interval)) > 0

    if (more && after.chunk < MAX_CHUNKS_PER_CHAIN) {
      await continueChain({ challenge_id: body.challenge_id, force, vip_only: vipOnly, vip_interval_hours: interval }, after)
    } else {
      await finishRun(after)
    }
  })()

  // Always background: pg_net gives up after five seconds, and a browser gives
  // up long before a big sweep finishes. Progress goes to app_settings and the
  // caller polls view_sync_status().
  // deno-lint-ignore no-explicit-any
  ;(globalThis as any).EdgeRuntime?.waitUntil?.(work)

  return json(req, { accepted: rows.length, total: progress.total }, 202)
})
