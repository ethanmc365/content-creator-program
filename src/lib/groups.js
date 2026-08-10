import { supabase } from './supabase'

// Group conversations, client side.
//
// The DM inbox holds two shapes now: a 'direct' conversation, which is a pair
// and works exactly as it always has, and a 'group', which is a room with a
// membership table, invites and its own look. Everything specific to the second
// shape lives here so Messages.jsx keeps reading as one inbox rather than two
// pages sharing a file.
//
// See migration 090 for the schema and the reasoning about why the existing
// tables were extended rather than a second set built.

// A small, deliberately BRAND-SAFE palette. A free colour picker on a group is
// how a white-dominant product ends up with a neon green conversation in the
// middle of the inbox; these are the house orange plus five neutral-friendly
// companions that all carry white text.
export const GROUP_ACCENTS = [
  { key: 'brand', label: 'Tryp orange', bg: '#d94407' },
  { key: 'sunset', label: 'Sunset', bg: '#f5853f' },
  { key: 'ink', label: 'Ink', bg: '#1A1A1A' },
  { key: 'sea', label: 'Sea', bg: '#0f766e' },
  { key: 'sky', label: 'Sky', bg: '#1d4ed8' },
  { key: 'plum', label: 'Plum', bg: '#6d28d9' },
]

export const accentHex = (key) =>
  (GROUP_ACCENTS.find((a) => a.key === key) || GROUP_ACCENTS[0]).bg

// A short, sensible name when somebody has not given one. "Group" is a label,
// not a name, and an inbox of six rows all called Group is unusable.
export function groupName(convo, members, myId) {
  if (convo?.title?.trim()) return convo.title.trim()
  const others = (members || []).filter((m) => m.id !== myId).map((m) => m.name?.split(' ')[0]).filter(Boolean)
  if (!others.length) return 'New group'
  if (others.length <= 3) return others.join(', ')
  return `${others.slice(0, 2).join(', ')} and ${others.length - 2} others`
}

/** Create a group, seed it with the owner (a trigger does that) and invite the rest. */
export async function createGroup({ ownerId, title, emoji, accent, inviteIds = [] }) {
  const { data, error } = await supabase
    .from('conversations')
    .insert({
      kind: 'group',
      created_by: ownerId,
      title: title?.trim() || null,
      emoji: emoji || null,
      accent: accent || 'brand',
    })
    .select('id')
    .single()
  if (error || !data) return { id: null, error: error?.message || 'The group could not be created.' }
  if (inviteIds.length) {
    const { error: inviteError } = await inviteToGroup(data.id, inviteIds, ownerId)
    // A group that exists with nobody invited is recoverable - you can invite
    // from inside it - so a failed invite is reported, not fatal.
    if (inviteError) return { id: data.id, error: inviteError }
  }
  return { id: data.id, error: null }
}

export async function inviteToGroup(conversationId, profileIds, byId) {
  if (!profileIds?.length) return { error: null }
  const { error } = await supabase.from('conversation_invites').upsert(
    profileIds.map((id) => ({
      conversation_id: conversationId,
      invited_profile_id: id,
      invited_by: byId,
      status: 'pending',
    })),
    { onConflict: 'conversation_id,invited_profile_id' },
  )
  return { error: error?.message ?? null }
}

/** Accept an invite: join, then mark the invite answered. In that order - the
 *  membership is what grants access, and a row saying "accepted" next to no
 *  membership is a lie the UI would believe. */
export async function acceptInvite(invite, myId) {
  const { error } = await supabase
    .from('conversation_members')
    .insert({ conversation_id: invite.conversation_id, profile_id: myId })
  if (error) return { error: error.message }
  await supabase.from('conversation_invites').update({ status: 'accepted' }).eq('id', invite.id)
  return { error: null }
}

export async function declineInvite(invite) {
  const { error } = await supabase
    .from('conversation_invites').update({ status: 'declined' }).eq('id', invite.id)
  return { error: error?.message ?? null }
}

export async function updateGroup(conversationId, patch) {
  const { error } = await supabase.from('conversations').update(patch).eq('id', conversationId)
  return { error: error?.message ?? null }
}

export async function leaveGroup(conversationId, myId) {
  const { error } = await supabase
    .from('conversation_members').delete()
    .eq('conversation_id', conversationId).eq('profile_id', myId)
  return { error: error?.message ?? null }
}

export async function removeMember(conversationId, profileId) {
  const { error } = await supabase
    .from('conversation_members').delete()
    .eq('conversation_id', conversationId).eq('profile_id', profileId)
  return { error: error?.message ?? null }
}

/** Deleting the group ends it for everybody, so it is the owner's button only
 *  (enforced in RLS as well - this is the affordance, not the guard). */
export async function deleteGroup(conversationId) {
  const { error } = await supabase.from('conversations').delete().eq('id', conversationId)
  return { error: error?.message ?? null }
}

/** Unread in a group is a watermark, not a flag: one message, many readers. */
export async function markGroupRead(conversationId, myId) {
  await supabase
    .from('conversation_members')
    .update({ last_read_at: new Date().toISOString() })
    .eq('conversation_id', conversationId).eq('profile_id', myId)
}

/** Everybody in every group the viewer belongs to, in one query, plus their own
 *  membership rows (for `last_read_at` and whether they are the owner). */
export async function loadGroupMembers(conversationIds) {
  if (!conversationIds?.length) return { byConversation: new Map(), rows: [] }
  const { data } = await supabase
    .from('conversation_members')
    .select('conversation_id, profile_id, role, last_read_at, profiles:profile_id(id, name, photo_url, is_admin)')
    .in('conversation_id', conversationIds)
  const byConversation = new Map()
  for (const r of data || []) {
    if (!byConversation.has(r.conversation_id)) byConversation.set(r.conversation_id, [])
    byConversation.get(r.conversation_id).push(r)
  }
  return { byConversation, rows: data || [] }
}

/** Invites waiting on the viewer, with enough of the group to decide. */
export async function loadMyInvites(myId) {
  const { data } = await supabase
    .from('conversation_invites')
    .select('id, conversation_id, status, created_at, conversations:conversation_id(id, title, emoji, accent, kind), inviter:invited_by(id, name, photo_url)')
    .eq('invited_profile_id', myId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
  return (data || []).filter((i) => i.conversations?.kind === 'group')
}
