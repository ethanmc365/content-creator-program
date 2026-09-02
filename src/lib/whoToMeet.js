import { t } from './i18n'
// WHO TO MEET THIS WEEK.
//
// Three people, and the card says WHY.
//
// THE WHOLE POINT IS THE REASON, NOT THE MATCH.
//
// "Suggested for you" is the emptiest phrase in software. It tells the reader
// that a machine picked somebody and refuses to say on what grounds, so the only
// available response is to wonder whether it knows something it should not. A
// reason turns the same three faces into three openings: you now have a first
// line, which is the actual barrier to messaging a stranger.
//
// SO THE REASONS ARE WRITTEN, NOT GENERATED.
//
// Every phrasing below is a fixed sentence with at most a name or a place
// dropped into it, in the plain words somebody would use out loud. No
// "based on your interests", no "you may also like", no percentage match, no
// three-clause sentence that begins "As someone who". Ethan's note was that they
// must not read as written by a machine, and the way to guarantee that is to
// have a person write all of them in advance.
//
// AND "NO REASON" IS AN HONEST REASON.
//
// A community of 44 will not always have an overlap to point at, and inventing
// one is how the feature stops being trusted. When there is nothing real to say,
// the card says there is nothing real to say and suggests them anyway. That is
// how introductions work between people.
//
// STABLE FOR A DAY, AND DIFFERENT TOMORROW (2 Sep 2026).
//
// It was stable for a WEEK, on the reasoning that three new strangers every
// time you refresh is a slot machine rather than an introduction. That half is
// still true and the pick is still stable within a day. But Ethan: "it's
// showing the same creators every single day. I want this to refresh daily, or
// even every couple of hours - obviously in future it can show the same
// creators, but we don't want it showing them constantly."
//
// A DAY SEED ON ITS OWN WOULD NOT HAVE FIXED IT, which is the part worth
// writing down. The ranking ladder below is deterministic: if four people have
// a real reason and everybody else has none, those four sort to the top on
// every seed, so re-seeding daily reshuffles three names that were already
// going to be the same three names. The rotation is what actually changes the
// faces - the day index walks a starting offset through the people we can say
// something true about, so over a fortnight you meet all of them instead of the
// same three forty times.

const WEEK_MS = 7 * 86400000

// EVERY REASON IS A WHOLE SENTENCE WITH PLACEHOLDERS IN IT (2 Sep 2026).
//
// Ethan: "the things on the creator suggestions where it says you both speak
// Irish - that should obviously be translated to the user's language."
//
// They were template literals, which cannot be translated at all: a dictionary
// keyed on the English sentence never sees `You both speak ${x}.` because the
// string that reaches it is a different one for every pair of creators. Each
// one is now `t('You both speak {langs}.', { langs })`, which is what the
// placeholder API in lib/i18n exists for - the translator gets the whole
// sentence and can put the noun wherever Spanish wants it.
//
// `t` and not `useT`: this module is a pure function called from a component
// that already re-renders on a language change (it holds `useT` itself), so the
// subscription is upstream and reading the module variable here is correct.

/** Which day we are in. Same integer for everybody, rolls over at UTC midnight.
 *  UTC and not local time on purpose: the pick should be the same for two
 *  creators comparing notes across a timezone. */
export function dayIndex(now = Date.now()) {
  return Math.floor(now / 86400000)
}

/** Which week we are in. Same integer for everybody, rolls over on a Monday. */
export function weekIndex(now = Date.now()) {
  // 1 Jan 1970 was a Thursday, so shifting by four days puts week boundaries on
  // Monday morning UTC. Not local time on purpose: the pick should be the same
  // for two creators comparing notes across a timezone.
  return Math.floor((now + 4 * 86400000) / WEEK_MS)
}

// A tiny deterministic PRNG, the same one the creator spotlight uses, so the
// weekly shuffle is stable without storing anything.
function mulberry32(a) {
  return function rand() {
    a |= 0; a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const norm = (s) => (s || '').trim().toLowerCase()
// "A and B", "A, B and C". The joining word is translated too - Spanish uses
// "y" - and it is the last thing in the list that gets it, which is the same
// rule in both languages.
const list = (arr) => {
  if (arr.length === 1) return arr[0]
  const and = t('and')
  if (arr.length === 2) return `${arr[0]} ${and} ${arr[1]}`
  return `${arr.slice(0, -1).join(', ')} ${and} ${arr[arr.length - 1]}`
}

/** Which platform somebody mostly posts on, or null if they linked none. */
function platformOf(p) {
  if (p?.tiktok_url) return 'TikTok'
  if (p?.instagram_url) return 'Instagram'
  if (p?.youtube_url) return 'YouTube'
  if (p?.facebook_url) return 'Facebook'
  return null
}

/** Do two date ranges touch? Both are 'YYYY-MM-DD' strings, which compare. */
const overlaps = (a, b) => a.start_date <= b.end_date && b.start_date <= a.end_date

/**
 * The strongest true thing we can say about these two people.
 *
 * Ordered by how much of an opening it gives, not by how clever it is. Being in
 * the same city in the same fortnight is a coffee; both having been to Vietnam
 * is a conversation; both being on TikTok is small talk. The first one that
 * applies wins, and each returns a whole written sentence.
 *
 * @param {object} me       the viewer's profile
 * @param {object} them     the candidate's profile
 * @param {object[]} myTrips    the viewer's upcoming collab trips
 * @param {object[]} theirTrips theirs
 */
export function reasonFor(me, them, myTrips = [], theirTrips = []) {
  const first = (them.name || '').trim().split(' ')[0] || 'They'

  // 1. You will both be in the same place at the same time. Nothing beats this.
  for (const a of myTrips) {
    for (const b of theirTrips) {
      if (norm(a.country) !== norm(b.country)) continue
      if (!overlaps(a, b)) continue
      const where = (b.city || '').trim() || b.country
      return { kind: 'trip', text: t('You are both in {where} at the same time next month.', { where }) }
    }
  }

  // 2. Same destination, different weeks. Still worth a message: one of you has
  //    already done the research the other is about to start.
  for (const a of myTrips) {
    for (const b of theirTrips) {
      if (norm(a.country) === norm(b.country)) {
        return { kind: 'destination', text: t('{name} is heading to {country} too.', { name: first, country: b.country }) }
      }
    }
  }

  // 3. They are going somewhere you have been. This is the single most useful
  //    introduction on a travel platform and it points the right way round: you
  //    have something to give.
  const myVisited = new Set((me?.countries_visited || []).map(norm))
  for (const b of theirTrips) {
    if (myVisited.has(norm(b.country))) {
      return { kind: 'been', text: t('{name} is off to {country}, and you have been.', { name: first, country: b.country }) }
    }
  }

  // 4. They have been where you are going.
  const theirVisited = new Set((them?.countries_visited || []).map(norm))
  for (const a of myTrips) {
    if (theirVisited.has(norm(a.country))) {
      return { kind: 'knows', text: t('You are going to {country}. {name} has been.', { country: a.country, name: first }) }
    }
  }

  // 5. Same town.
  if (me?.city && them?.city && norm(me.city) === norm(them.city)) {
    return { kind: 'city', text: t('{name} is in {city}, same as you.', { name: first, city: them.city }) }
  }

  // 6. A language you both speak. Not English: everybody here speaks English,
  //    so saying so is a fact about the platform rather than about the two of
  //    you, and it would be the reason on almost every card.
  const mine = (me?.languages || []).map(norm)
  const shared = (them?.languages || [])
    .filter((l) => mine.includes(norm(l)) && norm(l) !== 'english')
  if (shared.length) {
    return { kind: 'language', text: t('You both speak {langs}.', { langs: list(shared.slice(0, 2)) }) }
  }

  // 7. Countries you have both been to. Three is enough to be a taste in
  //    common; one is a coincidence.
  const both = (them?.countries_visited || []).filter((c) => myVisited.has(norm(c)))
  if (both.length >= 3) {
    return { kind: 'countries', text: t('You have both been to {places}.', { places: list(both.slice(0, 3)) }) }
  }

  // 8. Same platform.
  const myPlat = platformOf(me)
  const theirPlat = platformOf(them)
  if (myPlat && myPlat === theirPlat) {
    return { kind: 'platform', text: t('You are both mostly on {platform}.', { platform: myPlat }) }
  }

  // 9. Nothing to point at. Say that, and suggest them anyway.
  return { kind: 'chance', text: t('No particular reason. We just reckon you two would get on.') }
}

/**
 * Three people to meet this week.
 *
 * @param {object} me
 * @param {object[]} candidates  everybody eligible (already filtered for
 *   status, test accounts and existing connections by the caller)
 * @param {Record<string, object[]>} tripsByCreator
 */
export function pickWhoToMeet(me, candidates, tripsByCreator = {}, now = Date.now()) {
  if (!me || !candidates?.length) return []
  const myTrips = tripsByCreator[me.id] || []

  const scored = candidates
    .filter((c) => c.id !== me.id)
    .map((c) => {
      const reason = reasonFor(me, c, myTrips, tripsByCreator[c.id] || [])
      return { creator: c, reason }
    })

  // A REAL REASON BEATS A GOOD SHUFFLE. Everybody we can say something true
  // about comes first, in the order of the ladder above; the rest are the pool
  // we fall back on so the card is never short of three faces.
  const RANK = ['trip', 'destination', 'been', 'knows', 'city', 'language', 'countries', 'platform', 'chance']
  const day = dayIndex(now)
  const rand = mulberry32(day * 2654435761)
  // A stable random key per candidate, so ties inside a rank are shuffled the
  // same way all day rather than by whatever order the query returned.
  const keyed = scored.map((s) => ({ ...s, k: rand() }))
  const byRank = (a, b) => RANK.indexOf(a.reason.kind) - RANK.indexOf(b.reason.kind) || a.k - b.k

  // THE ROTATION. Everybody we can say something true about, in ladder order,
  // and the day index picks where in that list today starts. `chance` is the
  // "we could not find an overlap" reason, so it is the fallback pool rather
  // than part of the rotation - rotating into it would mean a day on which the
  // card says nothing about anybody.
  const real = keyed.filter((s) => s.reason.kind !== 'chance').sort(byRank)
  const rest = keyed.filter((s) => s.reason.kind === 'chance').sort((a, b) => a.k - b.k)

  const picked = []
  if (real.length) {
    const offset = day % real.length
    for (let i = 0; i < Math.min(3, real.length); i += 1) picked.push(real[(offset + i) % real.length])
  }
  for (const s of rest) {
    if (picked.length >= 3) break
    picked.push(s)
  }

  // The card leads with the strongest opening it has, whichever three the
  // rotation landed on.
  return picked.sort(byRank)
}
