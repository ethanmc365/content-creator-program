// The two @-handles that are not a person.
//
// @everyone reaches every creator on the platform. @here reaches the people
// whose heartbeat says they are in the app right now, and only the ones who can
// read the room it was posted in. Both are admin-only; a creator @-ing somebody
// by name is a different thing entirely and is open to everybody.
//
// WHY THIS IS A MODULE AND NOT TWO STRING LITERALS. The handles have to agree
// in four places at once - the autocomplete list, the names the composer turns
// into chips, the renderer that draws them, and the Postgres trigger that acts
// on them (`on_message_everyone`, migration 095). The first three are here. If
// a third handle is ever added, this file and that trigger are the two things
// that change, and nothing else has an opinion.

export const BROADCASTS = [
  {
    id: '@everyone',
    name: 'everyone',
    label: '@everyone',
    hint: 'Notifies every creator on the platform',
    broadcast: true,
  },
  {
    id: '@here',
    name: 'here',
    label: '@here',
    hint: 'Notifies whoever is in the app right now',
    broadcast: true,
  },
]

/** The handle names an admin's composer should turn into chips. */
export const broadcastNames = (isAdmin) => (isAdmin ? BROADCASTS.map((b) => b.name) : [])

/**
 * Autocomplete entries matching an in-progress "@query".
 * Empty for anybody who is not an admin, so a creator never sees an option the
 * server will ignore.
 */
export function matchBroadcasts(query, isAdmin) {
  if (!isAdmin) return []
  const q = (query || '').toLowerCase()
  return BROADCASTS.filter((b) => b.name.startsWith(q))
}

/** True for the two handles, so the renderer can draw them as a badge. */
export const isBroadcastName = (name) =>
  BROADCASTS.some((b) => b.name === (name || '').toLowerCase())
