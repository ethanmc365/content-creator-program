// WHAT A CERTIFICATE SAYS, AND WHO GETS ONE.
//
// Pure, and therefore tested. What this module gets wrong is not visible in a
// screenshot: a placeholder that renders as the literal `{challenge}` on a
// milestone certificate looks fine in the builder, where the admin typed a
// challenge into the preview, and wrong on the one an actual creator receives.

/**
 * Fill `{placeholder}` from the facts frozen at award time.
 *
 * A LINE WHOSE DETAIL IS MISSING IS LEFT OUT WHOLE. This is the rule, it is the
 * one the builder tells admins about, and it is worth explaining because the
 * obvious alternative is worse.
 *
 * A design written for challenges ("for winning {challenge} in {market}") gets
 * reused for a milestone sooner or later. Printing `{challenge}` is obviously
 * broken. Dropping just the placeholder gives you "for winning  in ", so the
 * first version of this tried to repair the sentence afterwards - collapse the
 * spaces, strip the dangling preposition, tidy the comma. That is a regex
 * attempting English grammar, it failed its own tests on the second example
 * ("awarded to Sam for winning"), and every fix would have made it guess harder
 * about somebody else's wording.
 *
 * So the unit is the LINE, and the rule has no grammar in it: a line that
 * mentions something we cannot fill is not printed. An admin writes one clause
 * per line, the same way they would write an address, and what they get is
 * always a sentence somebody actually wrote rather than one this function
 * assembled.
 *
 * Returning '' when every line drops is deliberate too - the CARD decides what
 * an empty body looks like, because that is a design decision and this is not
 * the file that makes those.
 */
export function fillTemplate(text, facts = {}) {
  if (!text) return ''
  return String(text)
    .split('\n')
    .map((line) => fillLine(line, facts))
    .filter((line) => line !== null && line.trim() !== '')
    .join('\n')
}

/** One line, or null if it referred to something we do not have. */
function fillLine(line, facts) {
  let missing = false
  const out = line.replace(/\{(\w+)\}/g, (_, key) => {
    const value = factText(key, facts)
    if (value === '') { missing = true; return '' }
    return value
  })
  return missing ? null : out
}

/** One fact, formatted the way a certificate prints it. '' means "not known". */
function factText(key, facts) {
  const raw = facts?.[key]
  // `0` is a real view count and `false` is not a fact any of these carry, so
  // only null/undefined/'' count as missing. `raw || ''` would have printed a
  // zero-view certificate as though the number were unknown.
  if (raw === null || raw === undefined || raw === '') return ''
  if (key === 'views') return Number(raw).toLocaleString()
  if (key === 'place') return ordinal(Number(raw))
  if (key === 'date') return formatAwardDate(raw)
  return String(raw)
}

const ORDINALS = { 1: '1st', 2: '2nd', 3: '3rd' }

/** 1 -> "1st". English only; `tier` carries the meaning everywhere else. */
export function ordinal(n) {
  if (!Number.isFinite(n)) return ''
  return ORDINALS[n] || `${n}th`
}

/** A date on a certificate is a month and a year, never a time. */
export function formatAwardDate(value) {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

// ---------------------------------------------------------------------------
// THE DESIGN SYSTEM A CERTIFICATE IS BUILT FROM
//
// Three axes - LAYOUT, ACCENT, PAPER - and they are three because of what was
// wrong with having one. The first version was a single centred composition
// with a colour wash behind it, and Ethan's verdict was not about the colour:
// "it's really like AI style, really bad... I want it completely, completely,
// utterly redesigned. Like instead of just changing how it currently looks
// like, I want it completely redesigned."
//
// He is right about the diagnosis. What made it look generated was the SHAPE -
// kicker, centred title, rule, centred name, centred paragraph, three things
// along the bottom - which is the shape of every certificate any tool has ever
// produced. No palette fixes that, so the palette was never the thing to fix.
//
// So: six layouts that are genuinely different objects, ten accents, five
// papers. 300 combinations, and more to the point six compositions that do not
// look like each other from across a feed.
//
// THE THREE COMPLAINTS THIS ANSWERS, IN HIS WORDS:
//
//   "we have one, two, three, four orange and one black... I want a lot of
//    different colors"          -> ACCENTS, ten of them, all usable on white
//                                  and all able to carry white type.
//   "I still don't like the background color, is that like weirdly goldeny,
//    orangey glow"              -> PAPERS. The old ground was the accent at 14%
//                                  in two corners, which on orange is exactly
//                                  a goldeny glow. Papers are NEUTRAL grounds
//                                  with one optional flat accent tint, and the
//                                  default is plain white.
//   "it's quite weird the way the bars are at the bottom and not on the sides"
//                              -> Four of the six layouts carry their accent on
//                                  a VERTICAL edge. Nothing has a full-width
//                                  bar along the bottom any more.
// ---------------------------------------------------------------------------

/** '#rrggbb' -> {r,g,b}. Returns null for anything else, so callers can fall back. */
export function hexRgb(hex) {
  const m = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i.exec(String(hex || '').trim())
  if (!m) return null
  const h = m[1].length === 3 ? m[1].split('').map((c) => c + c).join('') : m[1]
  return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16) }
}

/**
 * `rgba()` from a hex and an alpha.
 *
 * NOT `${hex}22`, which is what the first version used everywhere. An
 * eight-digit hex is fine in a browser and is NOT fine here, because these
 * strings are read back by `lib/domSnapshot` and written into an SVG - and it
 * only takes one renderer that does not understand `#rrggbbaa` to turn a
 * hairline into a black line across somebody's certificate. `rgba()` is
 * universal, and it also makes the alpha readable at the call site.
 */
export function alpha(hex, a) {
  const c = hexRgb(hex) || { r: 217, g: 68, b: 7 }
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${a})`
}

/** Mix towards white (t>0) or black (t<0). Used for the second tone of an accent. */
export function shift(hex, t) {
  const c = hexRgb(hex) || { r: 217, g: 68, b: 7 }
  const to = t >= 0 ? 255 : 0
  const k = Math.abs(t)
  const mix = (v) => Math.round(v + (to - v) * k)
  return `rgb(${mix(c.r)}, ${mix(c.g)}, ${mix(c.b)})`
}

/**
 * Black or white, whichever can be read on this colour.
 *
 * Relative luminance rather than a brightness average: the average says white
 * type is readable on #0E7167, and it is not. Threshold at 0.45 because these
 * are large display sizes, where a little less contrast is still comfortable.
 */
export function readableOn(hex) {
  const c = hexRgb(hex)
  if (!c) return '#ffffff'
  const lin = (v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4 }
  const l = 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b)
  return l > 0.45 ? '#141414' : '#ffffff'
}

// TEN ACCENTS, AND WHY THEY ARE THESE TEN.
//
// Every one is dark enough to carry white type at 14px and saturated enough to
// read as a decision rather than as a default. They are spread around the wheel
// on purpose - warm, red, violet, blue, green, neutral - so two certificates
// picked at random look like two certificates and not two shades of one.
//
// Tryp orange is first and is the default, because the common case is a
// Tryp.com certificate and the common case should be one press.
//
// WHAT IS NOT HERE: anything pale, anything neon, and gold. Pale cannot hold
// white type, neon is not this brand, and gold is the colour that made the old
// ones look like a template - it is also what Ethan was describing as the
// "goldeny, orangey glow" he did not like.
export const ACCENTS = [
  { key: 'tryp', label: 'Tryp orange', hex: '#D94407' },
  { key: 'ember', label: 'Ember', hex: '#A8320C' },
  { key: 'crimson', label: 'Crimson', hex: '#A81F44' },
  { key: 'plum', label: 'Plum', hex: '#6B3A8C' },
  { key: 'indigo', label: 'Indigo', hex: '#37409B' },
  { key: 'ocean', label: 'Ocean', hex: '#0F5E88' },
  { key: 'teal', label: 'Teal', hex: '#0B6B62' },
  { key: 'forest', label: 'Forest', hex: '#2A6840' },
  { key: 'bronze', label: 'Bronze', hex: '#7C5225' },
  { key: 'graphite', label: 'Graphite', hex: '#2B2E36' },
]

export const DEFAULT_ACCENT = ACCENTS[0].hex

// FIVE PAPERS, AND NOW SOME OF THEM ARE GRADIENTS (21 Sep 2026).
//
// Ethan: "the paper colour etc, kind of like different gradients there or just
// plain white... the gradients that we have on the platform for behind the
// cards." So the choice is the platform's own grounds: plain white, a warm
// white, a soft glow of the accent, a stronger wash of it, and the full Tryp
// gradient - the hub card - with the type turned white on it.
//
// Every gradient runs from the accent to a LIGHTER tone of it (for Tryp orange
// that is exactly brand -> brand-light), never towards black: "a really dark
// gradient" is the thing that was disliked on the portfolio.
//
// Saved designs keep working: `mist` reads as White, `ink` as the Tryp
// gradient (the other "different character" option), and `tint` is still a
// key - it is now the wash.
export const PAPERS = [
  { key: 'paper', label: 'White', hint: 'Plain white. Prints best, posts best.', light: true, kind: 'white' },
  { key: 'ivory', label: 'Warm white', hint: 'A warm off-white, like a printed programme.', light: true, kind: 'ivory' },
  { key: 'glow', label: 'Soft glow', hint: 'White, warming into the accent in one corner.', light: true, kind: 'glow' },
  { key: 'tint', label: 'Wash', hint: 'A light gradient of the accent across the page.', light: true, kind: 'wash' },
  { key: 'sunset', label: 'Tryp gradient', hint: 'The full brand gradient, like the card on the hub. White type.', light: false, kind: 'gradient' },
]

const LEGACY_PAPER = { mist: 'paper', ink: 'sunset' }

export const paperOf = (key) => PAPERS.find((p) => p.key === (LEGACY_PAPER[key] || key)) || PAPERS[0]

/** The lighter partner of an accent: brand-light for Tryp orange, else a tint. */
export function lightOf(accent) {
  return String(accent || '').toLowerCase() === '#d94407' ? '#f5853f' : shift(accent, 0.3)
}

/** The resolved palette for one design: paper plus the accent mixed into it. */
export function paletteFor({ paper, accent } = {}) {
  const p = paperOf(paper)
  const ac = accent || DEFAULT_ACCENT
  const light = lightOf(ac)
  const grad = `linear-gradient(135deg, ${ac} 0%, ${light} 100%)`
  const bg = {
    white: '#FFFFFF',
    ivory: '#FBF8F4',
    glow: `radial-gradient(120% 90% at 100% 100%, ${alpha(ac, 0.16)} 0%, rgba(255,255,255,0) 60%), #FFFFFF`,
    wash: `linear-gradient(135deg, ${alpha(ac, 0.05)} 0%, ${alpha(ac, 0.17)} 100%), #FFFFFF`,
    gradient: grad,
  }[p.kind]
  const dark = !p.light
  return {
    ...p,
    accent: ac,
    // NOT `light` - that is the paper's own "is this a light ground" flag,
    // spread in from `p` above, and every layout branches on it.
    lightTone: light,
    grad,
    bg,
    onAccent: readableOn(ac),
    ink: dark ? '#FFFFFF' : '#1A1A1A',
    muted: dark ? 'rgba(255,255,255,0.88)' : '#5E6068',
    faint: dark ? 'rgba(255,255,255,0.72)' : '#9A9CA4',
    hair: dark ? 'rgba(255,255,255,0.28)' : 'rgba(26,26,26,0.10)',
    accentText: dark ? '#FFFFFF' : ac,
    rule: dark ? 'rgba(255,255,255,0.5)' : alpha(ac, 0.28),
    // A block of the accent on this paper: the gradient on a light page, a
    // frosted white panel on the gradient page (gradient on gradient is mud).
    block: dark ? 'rgba(255,255,255,0.16)' : grad,
  }
}

// SIX LAYOUTS, SIX DIFFERENT OBJECTS (21 Sep 2026).
//
// Ethan, on the last set: "they're all quite similar and none of them I like
// at all." They were six arrangements of the same parts - kicker, title, rule,
// name, paragraph, footer - which is why they read as one design six times.
// These are six THINGS a travel brand would hand you, each built from the
// platform's parts (the hub gradient, the dotted route, the Tryp plane, the
// wordmark, Poppins):
export const LAYOUTS = [
  { key: 'horizon', label: 'Horizon', hint: 'The hub card down the left with the Tryp plane on its route; your words beside it.' },
  { key: 'boarding', label: 'Boarding pass', hint: 'A real pass: passenger, route, gate and seat, with a perforated stub.' },
  { key: 'postcard', label: 'Postcard', hint: 'A message on the left, a stamp and a postmark on the right, addressed to the creator.' },
  { key: 'banner', label: 'Sky banner', hint: 'A gradient band across the top with the plane flying through it. Centred and bold.' },
  { key: 'route', label: 'Flight path', hint: 'A dotted route arcing across the whole page behind a centred certificate.' },
  { key: 'minimal', label: 'Minimal', hint: 'The name as the headline, a lot of white, and a small Tryp seal.' },
]

// Designs saved before 21 Sep carry the old layout names.
const LEGACY_LAYOUT = { rail: 'horizon', columns: 'route', crest: 'banner', plaque: 'route', ticket: 'boarding' }

export const layoutOf = (key) => LAYOUTS.find((l) => l.key === (LEGACY_LAYOUT[key] || key)) || LAYOUTS[0]

/**
 * A stored design, with every visual field resolved and legacy values migrated.
 *
 * THE OLD `pattern` COLUMN IS STILL READ. It held 'wash' | 'plain' | 'rays',
 * and rows written before migration 230 have no `layout` and no `paper` at all.
 * Rather than leave those rendering as a default that looks nothing like what
 * the admin approved, they land on the layout closest to what they were - the
 * framed centred one - with the ground they asked for.
 */
export function designStyle(design = {}) {
  const d = design || {}
  const legacy = !d.layout
  const layout = layoutOf(legacy ? 'route' : d.layout)
  const paper = d.paper
    || (d.pattern === 'plain' ? 'paper' : d.pattern === 'wash' || d.pattern === 'rays' ? 'tint' : 'paper')
  return { layout, ...paletteFor({ paper, accent: d.accent || DEFAULT_ACCENT }) }
}

// THE TIERS, AND WHY THERE ARE FOUR.
//
// If everybody gets the same certificate for turning up, winning one means
// nothing - so the ladder has to be visible at a glance, from across a
// LinkedIn feed, without reading the words. Each tier gets its own accent and
// its own default emblem, and `rank` is what sorts a creator's wall so the rare
// one is at the top of it.
// EVERY TIER IS TRYP ORANGE NOW (20 Sep 2026).
//
// These were orange, gold (#b8860b), teal (#0f766e) and slate (#475569), so the
// ladder could be read across a feed without reading the words. Ethan, looking
// at four of them: "I don't like the different colors... the tryp.com orange
// for me, the nice gradient."
//
// He is right and the original reasoning was answering the wrong question. A
// certificate's job is not to rank its holder against other holders - it is to
// be posted, by one person, showing that TRYP.COM gave them something. Four
// colour schemes make four different-looking companies; a gold one next to a
// teal one on LinkedIn reads as a template pack somebody bought. The tier is
// still named in the subtitle, which is where a reader actually learns it, and
// `rank` still sorts the wall so the rare one is on top.
//
// `emblem` is kept because it is stored on existing designs and the studio can
// still set it, but CertificateCard no longer draws it - see the note there.
// The per-design accent picker still overrides all of this.
export const TIERS = [
  {
    key: 'achievement', rank: 0, label: 'Achievement',
    hint: 'Finishing on the podium. The rare one - keep it that way.',
    accent: '#d94407', emblem: 'trophy',
  },
  {
    key: 'honour', rank: 1, label: 'Honour',
    hint: 'Given by hand, for something no rule can spot.',
    accent: '#d94407', emblem: 'star',
  },
  {
    key: 'milestone', rank: 2, label: 'Milestone',
    hint: 'Reaching a number: videos made, views, months in the community.',
    accent: '#d94407', emblem: 'flag',
  },
  {
    key: 'participation', rank: 3, label: 'Participation',
    hint: 'Entering a challenge. Common on purpose - it is the first one anybody gets.',
    accent: '#d94407', emblem: 'check',
  },
]

export const tierOf = (key) => TIERS.find((t) => t.key === key) || TIERS[0]

/** Newest first within a tier, rarest tier first. */
export function sortCertificates(rows = []) {
  return [...rows].sort((a, b) => {
    const byTier = tierOf(a.design?.tier).rank - tierOf(b.design?.tier).rank
    if (byTier !== 0) return byTier
    return new Date(b.awarded_at) - new Date(a.awarded_at)
  })
}

// THE EXAMPLE A DESIGN IS PREVIEWED WITH, CHOSEN BY WHAT IT IS FOR.
//
// The builder previewed EVERY design against a challenge win, which is honest
// for three of the four starters and actively misleading for the fourth: build
// a milestone certificate and the preview says "for finishing 1st in Hidden
// Gems of Your City", which is a sentence that design can never print. An admin
// tunes the wording against what they can see, so showing them facts the award
// will not carry is showing them the wrong job.
//
// Real-looking rather than "Lorem": somebody judging whether a body line fits
// needs a name and a challenge title of PLAUSIBLE LENGTH.
const SAMPLE_BASE = {
  name: 'Roxanna Travels',
  date: '2026-09-30T12:00:00.000Z',
  serial: 'TRYP-2026-K4M9PX',
}

export function sampleFacts(design = {}) {
  if (design.award_on === 'milestone') {
    return { ...SAMPLE_BASE, milestone: 'Ten videos made' }
  }
  if (design.award_on === 'challenge_entry') {
    return { ...SAMPLE_BASE, challenge: 'Hidden Gems of Your City', market: 'UK & Ireland' }
  }
  if (design.award_on === 'manual') {
    // A hand-given certificate usually has no challenge behind it, so the
    // example is the leanest one - which is also the case most likely to expose
    // a body line that falls apart without a challenge to name.
    return { ...SAMPLE_BASE }
  }
  return {
    ...SAMPLE_BASE,
    challenge: 'Hidden Gems of Your City',
    market: 'UK & Ireland',
    place: Array.isArray(design.ranks) && design.ranks.length ? Math.min(...design.ranks) : 1,
    views: 124500,
  }
}

/**
 * Why this design will never award anything, or null if it will.
 *
 * A RULE THAT CANNOT FIRE IS THE ONE FAULT THIS BUILDER CAN SHIP SILENTLY.
 * Everything else about a certificate is visible in the preview; "nobody
 * matches this" looks exactly like "nobody has qualified yet", and an admin
 * finds out weeks later when a winner asks where their certificate is.
 */
export function ruleProblem(design = {}) {
  if (design.award_on === 'challenge_rank' && !(design.ranks || []).length) {
    return 'No places are chosen, so nobody can win this. Pick at least one.'
  }
  if (design.award_on === 'milestone' && !design.milestone_id) {
    return 'No milestone is chosen, so this will never be given out.'
  }
  if (!design.is_active) {
    return 'This is a draft. It is never awarded and creators cannot see it.'
  }
  return null
}

/**
 * Why the body will not print, or null if it will.
 *
 * SWITCHING THE TRIGGER CAN SILENTLY EMPTY THE WORDS. A body written for a
 * challenge ("for finishing {place} in {challenge}") has no fact to fill on a
 * MILESTONE certificate, so `fillTemplate` correctly drops every line and the
 * card falls back to its default sentence. The preview is honest about the
 * result and says nothing about the cause, so an admin sees their own wording
 * disappear and has no idea it was their trigger change that did it.
 *
 * Checked against the SAME example the preview uses, so the warning and the
 * picture can never disagree.
 */
export function bodyProblem(design = {}) {
  const written = String(design.body || '').trim()
  if (!written) return null
  if (fillTemplate(written, sampleFacts(design)).trim()) return null
  return 'None of your wording can be filled in for this kind of award, so the certificate falls back to a default sentence. Check the {placeholders} against what this award actually knows.'
}

// The placeholders a design may use, for the builder's own help text. Keeping
// the list here rather than in the component means the one place that knows
// what `fillTemplate` understands is the module that implements it.
export const PLACEHOLDERS = [
  { key: 'name', example: 'Roxanna Travels', what: 'the creator' },
  { key: 'challenge', example: 'Hidden Gems', what: 'the challenge title' },
  { key: 'market', example: 'UK & Ireland', what: 'the market it ran in' },
  { key: 'place', example: '1st', what: 'where they finished' },
  { key: 'views', example: '124,500', what: 'their final view count' },
  { key: 'milestone', example: 'Ten videos', what: 'the milestone reached' },
  { key: 'date', example: '30 September 2026', what: 'when it was awarded' },
]
