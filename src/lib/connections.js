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
