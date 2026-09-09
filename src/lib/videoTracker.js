// THE VIDEO TRACKER'S ARITHMETIC, AWAY FROM ITS PAINT.
//
// Ethan, 9 Sep 2026: "I want you to build into the admin tool another page
// called Video Tracker. This is going to track all the best videos from the
// entire community, filtered by market and by challenge... This is what we're
// going to share with the whole Tryp.com team so they can take inspiration from
// the viral videos and the ones that performed well."
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
 * The link to the account that posted it.
 *
 * Built from the handle rather than stored, because a handle is the thing the
 * team actually reads and a profile URL is one more field to keep in step with
 * it. Returns null rather than a guess for a platform whose profile URL shape
 * we do not know - a broken link is worse than no link.
 */
export function creatorLink(v) {
  const h = v.creator_handle && String(v.creator_handle).replace(/^@/, '')
  if (!h) return null
  if (v.platform === 'Instagram') return `https://www.instagram.com/${h}/`
  if (v.platform === 'TikTok') return `https://www.tiktok.com/@${h}`
  if (v.platform === 'YouTube') return `https://www.youtube.com/@${h}`
  if (v.platform === 'Facebook') return `https://www.facebook.com/${h}`
  return null
}

/** The challenge a row belongs to, live or logged, or null for a loose video. */
export const challengeOf = (v) => v.challenge_title || v.history_title || null

/**
 * WHAT A SEARCH ACTUALLY SEARCHES.
 *
 * The hook first, because that is what somebody is looking for when they use
 * this page at all - "did anybody do a POV one" - and then everything else that
 * is words rather than numbers. Tags are joined in so typing a tag name finds
 * its videos without a separate tag filter to learn.
 */
const haystack = (v) => [
  v.hook, v.caption, v.creator_name, v.creator_handle,
  challengeOf(v), v.market_name, v.platform, v.notes,
  ...(v.tags || []),
].filter(Boolean).join(' ').toLowerCase()

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
 * RETIRED ROWS ARE HIDDEN BY DEFAULT AND NEVER DELETED. See migration 211: a
 * video that drops out of a challenge's top three stops qualifying, it does not
 * stop existing, and the team's notes on it survive. `showRetired` is the way
 * back to them.
 */
export function visibleVideos(rows, filter = {}) {
  const {
    market = '', challenge = '', platform = '', reason = '',
    q = '', sort = 'views', showRetired = false,
  } = filter
  const needle = q.trim().toLowerCase()

  const kept = (rows || []).filter((v) => {
    if (!showRetired && !v.qualifies && !v.pinned) return false
    if (market && v.community_id !== market) return false
    if (challenge && challengeKey(v) !== challenge) return false
    if (platform && v.platform !== platform) return false
    if (reason && v.reason !== reason) return false
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
  return ''
}

/** The options for the challenge filter, built from the rows themselves. */
export function challengeOptions(rows) {
  const seen = new Map()
  for (const v of rows || []) {
    const key = challengeKey(v)
    if (!key || seen.has(key)) continue
    seen.set(key, { key, label: challengeOf(v) || 'Untitled', market: v.market_name || '' })
  }
  return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label))
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
 * THE WHOLE POINT OF THE TOOL, AS A FILE SOMEBODY CAN SEND.
 *
 * Ethan: "we can also use them to share with the other markets." The page is
 * behind an admin login and half the Tryp.com team does not have one, so the
 * tracker has to be able to leave the platform. The column order is reading
 * order rather than schema order: what it was, who made it, how it did, and
 * then the link.
 */
export const CSV_COLUMNS = [
  ['hook', 'Hook'],
  ['caption', 'Caption'],
  ['creator_name', 'Creator'],
  ['handle', 'Account'],
  ['platform', 'Platform'],
  ['views', 'Views'],
  ['challenge', 'Challenge'],
  ['market_name', 'Market'],
  ['reason', 'Why it is here'],
  ['posted_at', 'Posted'],
  ['tags', 'Tags'],
  ['notes', 'Notes'],
  ['video_url', 'Link'],
]

export function toCsvRows(rows) {
  return (rows || []).map((v) => ({
    hook: v.hook || '',
    caption: v.caption || '',
    creator_name: v.creator_name || '',
    handle: atHandle(v.creator_handle),
    platform: v.platform || '',
    views: v.views ?? '',
    challenge: challengeOf(v) || '',
    market_name: v.market_name || '',
    reason: reasonLabel(v).label,
    posted_at: v.posted_at ? String(v.posted_at).slice(0, 10) : '',
    tags: (v.tags || []).join(', '),
    notes: v.notes || '',
    video_url: v.video_url || '',
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
