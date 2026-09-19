// A CREATOR'S MEDIA KIT, AS DATA.
//
// Ethan: "a full media kit that each creator can customise, like a portfolio
// for them... research what makes a good creative portfolio."
//
// WHAT A GOOD ONE ACTUALLY CONTAINS, because this is a solved problem and there
// is no reason to invent it. Every media kit a brand takes seriously answers the
// same five questions in the same order, and the order is the argument:
//
//   1. WHO       a name, a face, one line saying what they make. A brand
//                decides whether to keep reading here.
//   2. PROOF     numbers, early. Views, videos, countries, markets. A kit that
//                puts the bio before the numbers is asking to be trusted before
//                it has given a reason.
//   3. THE WORK  the actual videos, best first, with the view count ON them.
//                This is the page people spend time on and the reason the kit
//                exists; everything else is framing.
//   4. STANDING  who they work with and what they have won. The Tryp.com
//                certificates do this for free, which is most of why they are
//                worth building.
//   5. REACH OUT handles and an address. A kit that ends without a way to
//                contact them has wasted the four pages before it.
//
// So the page order below is not a layout preference, it is that list. The
// creator can rewrite every word on it and reorder the videos; they cannot
// reorder the argument, because the argument is the value we are adding.

export const PAGE_W = 1123
export const PAGE_H = 794

// The slides, in order. `key` is what the `copy` jsonb is keyed on, so renaming
// one orphans whatever a creator wrote - add, never rename.
export const SLIDES = [
  { key: 'cover', title: 'Cover', always: true },
  { key: 'about', title: 'About', always: true },
  { key: 'work', title: 'The work', always: true },
  { key: 'awards', title: 'Awards', always: false },
  { key: 'contact', title: 'Contact', always: true },
]

// THE WORDS A PORTFOLIO STARTS WITH.
//
// Every one of these is editable - Ethan: "this text and title should be
// editable by the creators so they can customise it the way they want" - and
// every one of them has to be good enough to publish UNEDITED, because most
// people will. A default that reads as a placeholder ("Add your bio here")
// guarantees a portfolio that says "Add your bio here" on the open web.
export const DEFAULT_COPY = {
  cover_kicker: 'Tryp.com Content Creator Community',
  cover_role: 'Travel Content Creator',
  about_title: 'About me',
  about_body: 'I make short travel videos about the places I go and the things worth stopping for. I am part of the Tryp.com Content Creator Community, where creators from across Europe make work for monthly briefs.',
  stats_title: 'By the numbers',
  work_title: 'Selected work',
  work_body: 'Made for Tryp.com creator briefs. View counts are from the platforms themselves.',
  awards_title: 'Recognition',
  awards_body: 'Awarded through the Tryp.com Content Creator Community.',
  contact_title: 'Work with me',
  contact_body: 'Available for brand trips, destination features and short-form campaigns. The fastest way to reach me is a direct message on any of these.',
}

/** The copy for one slot: what they wrote, else the default, never blank. */
export function copyFor(copy, key) {
  const written = copy?.[key]
  if (typeof written === 'string' && written.trim()) return written
  return DEFAULT_COPY[key] || ''
}

/**
 * A URL-safe slug from a name, with a suffix when it is taken.
 *
 * NOT THE PROFILE ID. A portfolio is a thing somebody puts in an Instagram bio;
 * `/p/4f3a1c2e-...` is not a link anybody types or trusts. The name is the
 * slug, and the collision is handled by the caller trying again with a suffix,
 * because uniqueness is the database's answer and not this function's.
 */
export function slugify(name, suffix = '') {
  const base = String(name || 'creator')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')  // "Malmö" -> "Malmo"
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 32) || 'creator'
  const out = suffix ? `${base}-${suffix}` : base
  // The column's CHECK wants 3-40 chars starting and ending alphanumeric.
  return out.length < 3 ? `${out}-kit` : out.slice(0, 40).replace(/-+$/, '')
}

/**
 * The videos a portfolio shows, in the order it shows them.
 *
 * TWO RULES, AND THE SECOND ONE IS THE INTERESTING ONE.
 *   - Nobody has chosen: the best work by views, which is the right default and
 *     the state every portfolio starts in.
 *   - Somebody has chosen: THEIR order, exactly, and nothing else. A portfolio
 *     that helpfully appends "and here are your other good ones" under a
 *     hand-picked six is overruling the person whose portfolio it is.
 */
export function orderedVideos(all = [], picks = [], limit = 10) {
  const list = (all || []).filter(Boolean)
  if (picks?.length) {
    const byId = new Map(list.map((v) => [v.id, v]))
    // `filter(Boolean)` matters: a picked video can be deleted, and a portfolio
    // must not render a hole where it was.
    return picks.map((id) => byId.get(id)).filter(Boolean).slice(0, limit)
  }
  return [...list]
    .sort((a, b) => (Number(b.views ?? b.logged_views ?? 0)) - (Number(a.views ?? a.logged_views ?? 0)))
    .slice(0, limit)
}

/** Totals for the proof page, from every entry they have ever made. */
export function statsFrom(videos = []) {
  const list = videos || []
  return {
    videos: list.length,
    views: list.reduce((n, v) => n + Number(v.views ?? v.logged_views ?? 0), 0),
    challenges: new Set(list.map((v) => v.challenge_id || v.challenge).filter(Boolean)).size,
    markets: new Set(list.map((v) => v.community_id || v.market).filter(Boolean)).size,
  }
}

/** 1500 -> "1.5K", 2400000 -> "2.4M". A media kit counts in thousands. */
export function compactViews(n) {
  const num = Number(n) || 0
  if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(num >= 10_000_000 ? 0 : 1).replace(/\.0$/, '')}M`
  if (num >= 1_000) return `${(num / 1_000).toFixed(num >= 10_000 ? 0 : 1).replace(/\.0$/, '')}K`
  return String(num)
}

/**
 * Which platforms they are on: the ones their entries PROVE, plus the ones they
 * typed in.
 *
 * Ethan: "You can show what platforms they post on based on their entires but
 * also they can add others that maybe they just didn't enter on."
 *
 * A PROVEN PLATFORM WINS OVER A TYPED ONE of the same name, so somebody who
 * adds "TikTok" by hand having already entered from TikTok gets one row, with
 * the entry count on it, rather than two rows that disagree.
 */
export function platformsFrom(videos = [], extra = []) {
  const counts = new Map()
  for (const v of videos || []) {
    const name = String(v.platform || '').trim()
    if (!name) continue
    counts.set(name.toLowerCase(), { platform: name, entries: (counts.get(name.toLowerCase())?.entries || 0) + 1 })
  }
  const out = [...counts.values()].sort((a, b) => b.entries - a.entries)
  for (const row of extra || []) {
    const name = String(row?.platform || '').trim()
    if (!name) continue
    const existing = out.find((o) => o.platform.toLowerCase() === name.toLowerCase())
    if (existing) {
      // Keep the proof, take the handle they typed.
      existing.handle = row.handle || existing.handle
      existing.url = row.url || existing.url
      existing.followers = row.followers ?? existing.followers
    } else {
      out.push({ platform: name, entries: 0, handle: row.handle, url: row.url, followers: row.followers })
    }
  }
  return out
}
