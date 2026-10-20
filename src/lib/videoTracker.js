import { ALL_COUNTRIES } from './allCountries'
import { socialHandle } from './socialLinks'

// THE VIDEO TRACKER'S ARITHMETIC, AWAY FROM ITS PAINT.
//
// The page is a grid of cards over a filter bar, which is to say it is almost
// entirely one question - "which of these rows am I looking at, in what order" -
// and that question is a pure function of the rows and the filter. It lives
// here so it can be tested with a handful of objects rather than by opening a
// page and squinting at it, which is the rule this codebase learned from
// `lib/tourPlacement`: arithmetic inside a component can only ever be checked
// by looking at it.
//
// The database side is migrations 211 and 212. Nothing here re-implements any
// of it: `qualifies`, `reason` and `rank` all arrive decided.

/** Every platform the tracker knows, in the order the filter draws them. */
export const PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'Facebook']

/**
 * WHY A VIDEO IS IN THE TRACKER, in words a person would use.
 *
 * `reason` is a machine word ('podium' | 'threshold' | 'manual') and the card
 * has room for about four characters of it, so this is the label AND the tone.
 * `rank` turns "podium" into "1st", which is the more useful statement: second
 * of forty is a different fact from third of four.
 */
export function reasonLabel(v) {
  if (v.source === 'official') return { label: 'Official creator', tone: 'brand' }
  if (v.source === 'vip' || v.reason === 'vip') return { label: 'VIP community', tone: 'brand' }
  if (v.reason === 'manual') return { label: 'Added by hand', tone: 'grey' }
  if (v.reason === 'podium') {
    const place = v.rank === 1 ? '1st' : v.rank === 2 ? '2nd' : v.rank === 3 ? '3rd' : v.rank ? `${v.rank}th` : 'Top'
    return { label: `${place} in its challenge`, tone: 'brand' }
  }
  return { label: 'Over the view line', tone: 'green' }
}

/** A handle as it is written down, with the @ this database deliberately strips. */
export const atHandle = (h) => (h ? `@${String(h).replace(/^@/, '')}` : '')

/**
 * THE ACCOUNT THAT POSTED IT, without the @. The row's own handle; else the one in the video's link
 * (`tiktok.com/@sam/video/1`); else what the creator saved on their profile for that platform (migration 440) - a VIP
 * video stores no handle, so before this every VIP row in the export had a blank Account.
 */
export function handleOf(v) {
  if (v.creator_handle) return String(v.creator_handle).replace(/^@/, '')
  const inLink = /tiktok\.com\/@([\w.-]+)/i.exec(v.video_url || '') || /youtube\.com\/@([\w.-]+)/i.exec(v.video_url || '')
  if (inLink) return inLink[1]
  return socialHandle(v.creator_social, v.platform) || ''
}

/**
 * The link to the account that posted it.
 *
 * Built from the handle rather than stored, because a handle is the thing the
 * team actually reads and a profile URL is one more field to keep in step with
 * it. Returns null rather than a guess for a platform whose profile URL shape
 * we do not know - a broken link is worse than no link.
 */
export function creatorLink(v) {
  const h = handleOf(v)
  if (!h) return null
  if (v.platform === 'Instagram') return `https://www.instagram.com/${h}/`
  if (v.platform === 'TikTok') return `https://www.tiktok.com/@${h}`
  if (v.platform === 'YouTube') return `https://www.youtube.com/@${h}`
  if (v.platform === 'Facebook') return `https://www.facebook.com/${h}`
  return null
}

/**
 * THE CREATOR'S COUNTRY, from their profile (migration 439). `key` is the ISO code where there is one, so "Spain" and
 * "spain " are one country; `name` is what the profile says. Null for a video added by hand with no creator on it.
 */
export function countryOf(v) {
  const code = v.creator_country_code ? String(v.creator_country_code).toUpperCase() : ''
  const name = v.creator_country || ALL_COUNTRIES.find((c) => c.iso2 === code)?.name || ''
  if (!code && !name) return null
  return { key: code || name.toLowerCase(), code, name: name || code }
}

/**
 * THE MARKET A VIDEO WAS FOR, AS A PERSON WOULD SAY IT (20 Oct 2026, Sofia's sheet). One of our markets when it belongs
 * to one: the challenge's or programme's own market first, then (for a community video) the creator's home market.
 * Otherwise never "Worldwide": the creator's country, so a Bulgarian's Global Challenge video says Bulgaria.
 */
export function marketOf(v) {
  if (v.market_name && v.market_kind === 'chapter') return v.market_name
  if ((v.source || 'community') === 'community' && v.home_name) return v.home_name
  return countryOf(v)?.name || v.market_name || ''
}

/**
 * THE COUNTRY FILTER'S OPTIONS: only countries that actually have a video in `rows`, most videos first. `keep` stays
 * listed (at zero) when it is the one already picked, so a month with none of it does not make the choice vanish.
 */
export function countryOptions(rows, keep = '') {
  const seen = new Map()
  for (const v of rows || []) {
    const c = countryOf(v)
    if (!c) continue
    const cur = seen.get(c.key) || { ...c, count: 0 }
    cur.count += 1
    seen.set(c.key, cur)
  }
  if (keep && !seen.has(keep)) {
    const code = keep.length === 2 ? keep.toUpperCase() : ''
    seen.set(keep, { key: keep, code, name: ALL_COUNTRIES.find((c) => c.iso2 === code)?.name || keep, count: 0 })
  }
  return [...seen.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

/** The challenge a row belongs to, live or logged, or null for a loose video. */
// A VIP or official creator's video belongs to its programme ("VIP Spain", "Tryp.com Official Spain"), migration 386.
export const challengeOf = (v) => v.challenge_title || v.history_title || v.programme_name || null

/**
 * WHAT A SEARCH ACTUALLY SEARCHES.
 *
 * The hook first, because that is what somebody is looking for when they use
 * this page at all - "did anybody do a POV one" - and then everything else that
 * is words rather than numbers. Tags are joined in so typing a tag name finds
 * its videos without a separate tag filter to learn.
 */
// Accents fold away, so "garcia" finds "García" and "espana" finds "ESPAÑA".
const fold = (s) => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
// `screen_text` is the hook written ON the video (read by view-sync), which is what a person remembers it by.
const haystack = (v) => fold([
  v.hook, v.screen_text, v.caption, v.creator_name, v.creator_handle,
  challengeOf(v), v.market_name, v.platform, v.notes, v.video_url,
  ...(v.tags || []),
].filter(Boolean).join(' '))

export const SORTS = {
  views: { label: 'Most views', cmp: (a, b) => (b.views ?? -1) - (a.views ?? -1) },
  recent: { label: 'Newest post', cmp: (a, b) => ts(b.posted_at) - ts(a.posted_at) },
  added: { label: 'Recently added', cmp: (a, b) => ts(b.created_at) - ts(a.created_at) },
  challenge: {
    label: 'By challenge',
    cmp: (a, b) => String(challengeOf(a) || '~').localeCompare(String(challengeOf(b) || '~'))
      || (a.rank ?? 99) - (b.rank ?? 99)
      || (b.views ?? -1) - (a.views ?? -1),
  },
}

const ts = (d) => (d ? new Date(d).getTime() || 0 : 0)

/**
 * The rows to draw, filtered and ordered.
 *
 * PINNED ALWAYS FLOATS, whatever the sort. A pin means somebody on the team
 * decided this one is worth showing the room, and a sort order that can bury it
 * makes the pin a decoration. Within the pinned group the chosen sort still
 * applies, so pinning three videos gives you those three in order rather than
 * in the order they happened to be pinned.
 *
 * A RETIRED ROW NEVER DRAWS, AND THERE IS NO WAY BACK TO IT FROM THIS PAGE. See migration 211: a video that drops out of
 * a challenge's top three (or, since migration 252, drops below the view threshold, or is disqualified) stops
 * QUALIFYING, it does not stop EXISTING - the row and the team's notes on it survive in the database. - so unlike an
 * earlier version of this function, `qualifies: false` is not a state this page ever surfaces, not even behind a toggle.
 */
export function visibleVideos(rows, filter = {}) {
  const {
    market = '', challenge = '', platform = '', month = '',
    q = '', sort = 'views', source = '', country = '',
  } = filter
  const needle = fold(q.trim())

  const kept = (rows || []).filter((v) => {
    if (!v.qualifies && !v.pinned) return false
    // A MARKET IS ITS CHALLENGES AND ITS CREATORS (migration 417): a Romanian creator's Global Challenge video is Romania's too.
    if (market && v.community_id !== market && v.home_id !== market) return false
    if (challenge && challengeKey(v) !== challenge) return false
    if (source && (v.source || 'community') !== source) return false
    if (platform && v.platform !== platform) return false
    if (country && countryOf(v)?.key !== country) return false
    // (There is no `reason` clause. There was, and the team cut the control - "for the any reason, I would delete that
    // filter, we don't need that filter" - so the clause went with it rather than lingering as an option nothing can
    // set. `reason` is still on every row and still drives the badge; see `reasonLabel`.)
    // THE MONTH RAIL IS A FILTER LIKE ANY OTHER, which is the whole reason the
    // "monthly report" needed almost no new machinery: a report IS the grid
    // with one more clause on it.
    if (month && monthKey(v) !== month) return false
    if (needle && !haystack(v).includes(needle)) return false
    return true
  })

  const cmp = (SORTS[sort] || SORTS.views).cmp
  return kept.sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || cmp(a, b))
}

/**
 * ONE KEY FOR A CHALLENGE WHEREVER IT LIVES.
 *
 * A tracked video can hang off a live `challenges` row, off one of the
 * forty-nine rows in the pre-platform log, or off neither. The filter is one
 * dropdown, so the three cases need one identifier - prefixed, because a
 * `challenges` id and a `challenge_history` id are both uuids and nothing else
 * would stop them colliding in the same select.
 */
export function challengeKey(v) {
  if (v.challenge_id) return `c:${v.challenge_id}`
  if (v.history_id) return `h:${v.history_id}`
  if (v.programme_id) return `p:${v.programme_id}`
  return ''
}

/** The options for the challenge filter, built from the rows themselves. */
export function challengeOptions(rows) {
  const seen = new Map()
  for (const v of rows || []) {
    const key = challengeKey(v)
    if (!key || seen.has(key)) continue
    seen.set(key, { key, label: challengeOf(v) || 'Untitled', market: v.market_name || '', source: v.source || 'community' })
  }
  // Community challenges first, then the VIP and official programmes, each alphabetical.
  const order = { community: 0, vip: 1, official: 2 }
  return [...seen.values()].sort((a, b) => (order[a.source] ?? 0) - (order[b.source] ?? 0) || a.label.localeCompare(b.label))
}

/**
 * The four figures above the grid.
 *
 * `views` sums only what is KNOWN, and `measured` says how many rows that was.
 * This is the same rule the analytics page had to learn the hard way: an
 * unmeasured video counted as zero drags an average down by exactly as much as
 * a video nobody watched, and the two are not the same statement. See the
 * `viewsKnown` note in lib/challengeEconomics.
 */
export function summarise(rows) {
  const list = rows || []
  const measured = list.filter((v) => v.views != null)
  const views = measured.reduce((n, v) => n + Number(v.views || 0), 0)
  const creators = new Set(list.map((v) => v.creator_handle || v.creator_name || v.creator_id).filter(Boolean))
  const best = measured.reduce((m, v) => Math.max(m, Number(v.views || 0)), 0)
  return {
    count: list.length,
    measured: measured.length,
    views,
    best,
    average: measured.length ? Math.round(views / measured.length) : null,
    creators: creators.size,
  }
}

/**
 * THE TRACKER AS A FILE SOMEBODY CAN SEND.
 *
 * The page is behind an admin login and half the Tryp.com team does not have one, so the tracker has to be able to leave
 * the platform. SHAPED ON MARKETING'S OWN SHEET (20 Oct 2026, Sofia): #, platform, the link, the account, the market,
 * the date and the views first, in that order, so it pastes straight into what they keep. Views are whole numbers and
 * the date is ISO, so the sheet sorts them; the hook and the rest follow for anyone who wants them.
 */
// `{ key, label }`, the shape `toCsv` reads. It was `[key, label]` pairs, which `toCsv` does not read, so every export
// before 20 Oct 2026 was a file of empty cells under no header.
export const CSV_COLUMNS = [
  { key: 'n', label: '#' },
  { key: 'platform', label: 'Platform' },
  { key: 'video_url', label: 'Video' },
  { key: 'handle', label: 'Account' },
  { key: 'creator_name', label: 'Creator' },
  { key: 'market', label: 'Market' },
  { key: 'country', label: 'Country' },
  { key: 'posted_at', label: 'Published' },
  { key: 'views', label: 'Views' },
  { key: 'type', label: 'Type' },
  { key: 'challenge', label: 'Challenge' },
  { key: 'hook', label: 'Hook' },
]

/** Community / VIP / Official, as the switch on the page names them. */
export const SOURCE_LABELS = { community: 'Community', vip: 'VIP', official: 'Official' }

export function toCsvRows(rows) {
  return (rows || []).map((v, i) => ({
    n: i + 1,
    platform: v.platform || '',
    video_url: v.video_url || '',
    handle: atHandle(handleOf(v)),
    creator_name: v.creator_name || '',
    market: marketOf(v),
    country: countryOf(v)?.name || '',
    posted_at: v.posted_at ? String(v.posted_at).slice(0, 10) : '',
    views: v.views ?? '',
    type: SOURCE_LABELS[v.source || 'community'] || '',
    challenge: challengeOf(v) || '',
    hook: v.screen_text || v.hook || '',
  }))
}

/**
 * Tags, from what somebody typed into a single box.
 *
 * Comma OR newline separated, trimmed, de-duplicated case-insensitively and
 * capped - a tag list is a filing system, and one that accepts "POV", "pov" and
 * "pov " as three different tags is not one.
 */
export function parseTags(text) {
  const seen = new Set()
  const out = []
  for (const raw of String(text || '').split(/[,\n]/)) {
    const t = raw.trim().replace(/^#/, '')
    if (!t) continue
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
    if (out.length >= 12) break
  }
  return out
}

/**
 * THE MONTH A VIDEO BELONGS TO, as `YYYY-MM`.
 *
 * `posted_at` is the date the platform gave us where the scraper has run, and
 * the submission date otherwise - which for the UK challenge is what we have.
 * It is the honest key either way: the question the month rail answers is "what
 * was working in July", and a video submitted in July was made in July.
 *
 * Falls back to `created_at` so a row added by hand with no date still lands
 * somewhere rather than vanishing out of every month.
 */
export function monthKey(v) {
  const d = v?.posted_at || v?.created_at
  if (!d) return ''
  const t = new Date(d)
  if (Number.isNaN(t.getTime())) return ''
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

/* "July 2026" out of "2026-07". */
export function monthLabel(key) {
  const [y, m] = String(key || '').split('-')
  const i = Number(m) - 1
  return MONTH_NAMES[i] ? `${MONTH_NAMES[i]} ${y}` : key
}

/**
 * EVERY MONTH FROM THE FIRST VIDEO TO THIS ONE, NEWEST FIRST.
 *
 * Ethan: "generate a monthly report I can click - on the right side another
 * scrollable bar where I can choose month by month and see the best videos from
 * each month."
 *
 * THE FLOOR COMES FROM THE ROWS AND THE CEILING COMES FROM THE CALENDAR
 * (10 Sep 2026). The first version built the rail out of months that HAVE
 * videos, which is defensible and turned out to be wrong the first time a month
 * went by without one: "there's only a July 2026 and no August 2026. All the
 * ones up to the current date should be there even if there's no videos in it
 * yet, and every time there's a new month it should automatically show up."
 *
 * He is right, and the reason is what the rail IS. It is not an index of what
 * exists, it is a CALENDAR - and a calendar with a gap in it does not read as
 * "nothing happened in August", it reads as broken. A zero against a month is a
 * fact worth seeing on a page whose job is to tell you how the programme is
 * doing.
 *
 * A hard-coded start date is still refused, for the reason it always was: the
 * UK challenge ran in JULY and an "obviously from August" floor would have
 * drawn an empty rail over the only month with anything in it. So the earliest
 * month with a video is the floor, today is the ceiling, and every month
 * between them is listed whether or not it has rows. The next one appears by
 * itself on the first of the month, with nothing to update.
 *
 * @param {Array} rows
 * @param {Date} [now] injected by the tests; a rail whose contents depend on
 *        the wall clock cannot be asserted against otherwise.
 */
export function monthsOf(rows, now = new Date()) {
  const counts = new Map()
  for (const v of rows || []) {
    const k = monthKey(v)
    if (!k) continue
    counts.set(k, (counts.get(k) || 0) + 1)
  }

  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  // The floor is the earliest month with a video, or this one if there are
  // none at all - a brand new market gets a rail with one entry rather than a
  // blank column.
  const keys = [...counts.keys()].sort()
  // The EARLIER of "the first video" and "this month", so a rail is never
  // shorter than the calendar it is pretending to be.
  let cursor = keys.length && keys[0] < thisMonth ? keys[0] : thisMonth
  // A month AFTER today can exist: `posted_at` comes from the platform and a
  // clock somewhere can be ahead. Whatever the newest row says wins, so nothing
  // is ever filed under a month the rail does not draw.
  const last = keys.length && keys[keys.length - 1] > thisMonth ? keys[keys.length - 1] : thisMonth

  const out = []
  // Bounded rather than `while (true)`: a corrupt date that sorts before the
  // epoch would otherwise spin for ever. Sixty years of months is far past any
  // plausible programme and still stops.
  for (let guard = 0; guard < 720 && cursor <= last; guard += 1) {
    out.push({ key: cursor, count: counts.get(cursor) || 0, label: monthLabel(cursor) })
    const [y, m] = cursor.split('-').map(Number)
    cursor = m === 12
      ? `${y + 1}-01`
      : `${y}-${String(m + 1).padStart(2, '0')}`
  }
  return out.sort((a, b) => b.key.localeCompare(a.key))
}

