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
// STABLE FOR THE WEEK. Seeded by the ISO week number, so the three faces are the
// same on Tuesday as they were on Monday. Three new strangers every time you
// refresh is a slot machine, not an introduction, and nobody messages a face
// that might be gone by the time they have thought about it.

const WEEK_MS = 7 * 86400000

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
const list = (arr) => {
  if (arr.length === 1) return arr[0]
  if (arr.length === 2) return `${arr[0]} and ${arr[1]}`
  return `${arr.slice(0, -1).join(', ')} and ${arr[arr.length - 1]}`
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
      return { kind: 'trip', text: `You are both in ${where} at the same time next month.` }
    }
  }

  // 2. Same destination, different weeks. Still worth a message: one of you has
  //    already done the research the other is about to start.
  for (const a of myTrips) {
    for (const b of theirTrips) {
      if (norm(a.country) === norm(b.country)) {
        return { kind: 'destination', text: `${first} is heading to ${b.country} too.` }
      }
    }
  }

  // 3. They are going somewhere you have been. This is the single most useful
  //    introduction on a travel platform and it points the right way round: you
  //    have something to give.
  const myVisited = new Set((me?.countries_visited || []).map(norm))
  for (const b of theirTrips) {
    if (myVisited.has(norm(b.country))) {
      return { kind: 'been', text: `${first} is off to ${b.country}, and you have been.` }
    }
  }

  // 4. They have been where you are going.
  const theirVisited = new Set((them?.countries_visited || []).map(norm))
  for (const a of myTrips) {
    if (theirVisited.has(norm(a.country))) {
      return { kind: 'knows', text: `You are going to ${a.country}. ${first} has been.` }
    }
  }

  // 5. Same town.
  if (me?.city && them?.city && norm(me.city) === norm(them.city)) {
    return { kind: 'city', text: `${first} is in ${them.city}, same as you.` }
  }

  // 6. A language you both speak. Not English: everybody here speaks English,
  //    so saying so is a fact about the platform rather than about the two of
  //    you, and it would be the reason on almost every card.
  const mine = (me?.languages || []).map(norm)
  const shared = (them?.languages || [])
    .filter((l) => mine.includes(norm(l)) && norm(l) !== 'english')
  if (shared.length) {
    return { kind: 'language', text: `You both speak ${list(shared.slice(0, 2))}.` }
  }

  // 7. Countries you have both been to. Three is enough to be a taste in
  //    common; one is a coincidence.
  const both = (them?.countries_visited || []).filter((c) => myVisited.has(norm(c)))
  if (both.length >= 3) {
    return { kind: 'countries', text: `You have both been to ${list(both.slice(0, 3))}.` }
  }

  // 8. Same platform.
  const myPlat = platformOf(me)
  const theirPlat = platformOf(them)
  if (myPlat && myPlat === theirPlat) {
    return { kind: 'platform', text: `You are both mostly on ${myPlat}.` }
  }

  // 9. Nothing to point at. Say that, and suggest them anyway.
  return { kind: 'chance', text: 'No particular reason. We just reckon you two would get on.' }
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
  const rand = mulberry32(weekIndex(now) * 2654435761)
  // A stable random key per candidate, so ties inside a rank are shuffled the
  // same way all week rather than by whatever order the query returned.
  const keyed = scored.map((s) => ({ ...s, k: rand() }))
  keyed.sort((a, b) => RANK.indexOf(a.reason.kind) - RANK.indexOf(b.reason.kind) || a.k - b.k)

  return keyed.slice(0, 3)
}
