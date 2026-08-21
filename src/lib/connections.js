import { supabase } from './supabase'

// Connection relationships, from MY point of view, keyed by the other person's
// id. relation is one of: 'connected' | 'pending_sent' | 'pending_received'.
// (No entry at all means no relationship yet.)
export async function loadRelationships(myId) {
  const { data } = await supabase
    .from('connections')
    .select('id, creator_id, connected_creator_id, status')
    .or(`creator_id.eq.${myId},connected_creator_id.eq.${myId}`)
  const map = new Map()
  for (const r of data ?? []) {
    const other = r.creator_id === myId ? r.connected_creator_id : r.creator_id
    let relation
    if (r.status === 'accepted') relation = 'connected'
    else if (r.creator_id === myId) relation = 'pending_sent'
    else relation = 'pending_received'
    map.set(other, { relation, rowId: r.id })
  }
  return map
}

// Count of accepted connections that both `myId` and `otherId` share.
//
// Kept alongside `mutualCreators` below rather than replaced by it: the creator
// DIRECTORY draws a count on every card in a grid of 45, and pulling profile
// rows for all of them to render a number would be a hundred joins to print
// "3 mutual".
export async function mutualConnections(myId, otherId) {
  const [{ data: a }, { data: b }] = await Promise.all([
    supabase.from('connections').select('creator_id, connected_creator_id').eq('status', 'accepted').or(`creator_id.eq.${myId},connected_creator_id.eq.${myId}`),
    supabase.from('connections').select('creator_id, connected_creator_id').eq('status', 'accepted').or(`creator_id.eq.${otherId},connected_creator_id.eq.${otherId}`),
  ])
  const mine = new Set((a ?? []).map((r) => (r.creator_id === myId ? r.connected_creator_id : r.creator_id)))
  const theirs = new Set((b ?? []).map((r) => (r.creator_id === otherId ? r.connected_creator_id : r.creator_id)))
  let n = 0
  for (const x of mine) if (theirs.has(x) && x !== myId && x !== otherId) n++
  return n
}

// The relationship between me and one specific person (or null).
export async function loadRelationship(myId, otherId) {
  const { data } = await supabase
    .from('connections')
    .select('id, creator_id, connected_creator_id, status')
    .or(`and(creator_id.eq.${myId},connected_creator_id.eq.${otherId}),and(creator_id.eq.${otherId},connected_creator_id.eq.${myId})`)
    .maybeSingle()
  if (!data) return null
  const relation = data.status === 'accepted'
    ? 'connected'
    : data.creator_id === myId ? 'pending_sent' : 'pending_received'
  return { relation, rowId: data.id }
}

// THE PEOPLE, NOT THE NUMBER.
//
// Ethan: "mutual connections showing up on a profile, I think that would be
// good to have, so it shows just connected with who kind of."
//
// A count answers "do we overlap"; the faces answer "should I say hello", which
// is the question somebody is actually asking on a profile. Two queries and one
// intersection, capped - a profile is not the place to list forty people, and
// the ones past the first few are a link to /connections.
//
// EXCLUDES BOTH ENDS EXPLICITLY. Without it, a connection between me and them
// makes each of us our own mutual, which is a nonsense that only shows up once
// you are connected to the person whose profile you are reading.
export async function mutualCreators(myId, otherId, limit = 12) {
  if (!myId || !otherId || myId === otherId) return { people: [], total: 0 }
  const [{ data: a }, { data: b }] = await Promise.all([
    supabase.from('connections').select('creator_id, connected_creator_id')
      .eq('status', 'accepted').or(`creator_id.eq.${myId},connected_creator_id.eq.${myId}`),
    supabase.from('connections').select('creator_id, connected_creator_id')
      .eq('status', 'accepted').or(`creator_id.eq.${otherId},connected_creator_id.eq.${otherId}`),
  ])
  const mine = new Set((a ?? []).map((r) => (r.creator_id === myId ? r.connected_creator_id : r.creator_id)))
  const theirs = new Set((b ?? []).map((r) => (r.creator_id === otherId ? r.connected_creator_id : r.creator_id)))
  const ids = [...mine].filter((x) => theirs.has(x) && x !== myId && x !== otherId)
  if (!ids.length) return { people: [], total: 0 }

  const { data: people } = await supabase
    .from('profiles')
    .select('id, name, photo_url, city, country')
    .in('id', ids.slice(0, limit))
    .eq('status', 'active')
    .is('deletion_requested_at', null)
  return { people: people ?? [], total: ids.length }
}

// THE NOTE THAT RIDES WITH A REQUEST.
//
// It is NOT a column on `connections`, and the reason is worth remembering:
// that table's select policy is `is_member()`, so every creator can read every
// connection row - which is correct, the mutual counts and the network graph
// are built by reading the whole edge list. RLS is row level, so a private
// column on a world-readable row is not a thing that exists. See migration 107.
export async function sendConnectionRequest(myId, targetId, note) {
  const { data, error } = await supabase
    .from('connections')
    .insert({ creator_id: myId, connected_creator_id: targetId })
    .select('id')
    .single()
  if (error || !data) return null

  const body = (note || '').trim()
  if (body) {
    // A failed note must not fail the request. The connection is the point; the
    // note is the nicety, and silently losing it beats telling somebody their
    // request did not send when it did.
    await supabase.from('connection_notes')
      .insert({ connection_id: data.id, author_id: myId, body: body.slice(0, 300) })
  }
  return data.id
}

/** The note attached to one connection, if there is one and you may read it. */
export async function loadConnectionNote(connectionId) {
  if (!connectionId) return null
  const { data } = await supabase
    .from('connection_notes')
    .select('body, author_id, created_at')
    .eq('connection_id', connectionId)
    .maybeSingle()
  return data ?? null
}
