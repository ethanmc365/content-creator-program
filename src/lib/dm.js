import { supabase } from './supabase'

// Find the 1:1 conversation between two creators, creating it if this is the
// first time they've spoken, and return its id.
//
// Shared by the creator cards, the profile page and the DM inbox search so
// "Message" always lands in the same thread rather than opening a duplicate.
export async function openConversation(myId, otherId) {
  const { data: existing } = await supabase
    .from('conversations')
    .select('id')
    .or(
      `and(participant_a.eq.${myId},participant_b.eq.${otherId}),and(participant_a.eq.${otherId},participant_b.eq.${myId})`
    )
    .maybeSingle()
  if (existing) return existing.id
  const { data: created } = await supabase
    .from('conversations')
    .insert({ participant_a: myId, participant_b: otherId })
    .select('id')
    .single()
  return created?.id ?? null
}
