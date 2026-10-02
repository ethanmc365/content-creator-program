import { supabase } from './supabase'
import { otherParticipant } from './utils'
import { loadGroupMembers, loadMyInvites } from './groups'
import { loadRelationships } from './connections'
import { testFlags } from './testData'

// THE DM INBOX, AS ONE FUNCTION (2 Oct 2026).
//
// It lived inside pages/Messages, which meant it could only start once the DM tab had mounted - two round trips
// (conversations, then everyone in them) after the tap. Ethan: "clicking on challenges, or DMs etc takes a bit too
// long to load." Out here it can also be run AHEAD of the tap (lib/warmPages, once the app is idle), so the first
// visit to the tab paints the inbox from lib/pageCache on its first frame like every later visit already did. The
// page still calls it on every mount; nothing is skipped.

// See the long note in pages/Messages: an abandoned 1:1 with no message is not an inbox row; a group always is,
// and so is a thread this page has just created.
export function isListableConversation(c, justCreated) {
  return c?.kind === 'group' || !!c?.last_message_at || !!(c?.id && justCreated?.has(c.id))
}

export const DM_CACHE_KEY = 'dm-inbox'

/** { conversations, invites } for `userId`, enriched with the other person / members and unread counts. */
export async function fetchInbox(userId, justCreated) {
  const [{ data: allConvos }, invites] = await Promise.all([
    supabase.from('conversations').select('*').order('last_message_at', { ascending: false }),
    loadMyInvites(userId),
  ])
  const convos = (allConvos ?? []).filter((c) => isListableConversation(c, justCreated))
  if (!convos.length) return { conversations: [], invites }
  const groups = convos.filter((c) => c.kind === 'group')
  const directs = convos.filter((c) => c.kind !== 'group')

  const otherIds = directs.map((c) => otherParticipant(c, userId)).filter(Boolean)
  const [{ data: profiles }, { data: unreadMsgs }, memberData, { data: groupMsgs }] = await Promise.all([
    otherIds.length
      ? supabase.from('profiles').select('id, name, photo_url, is_admin, bio').in('id', otherIds)
      : Promise.resolve({ data: [] }),
    supabase.from('direct_messages').select('id, conversation_id').eq('recipient_id', userId).eq('read', false),
    loadGroupMembers(groups.map((c) => c.id)),
    // Unread in a group is a watermark, not a flag; only the last 45 days could still be unread.
    groups.length
      ? supabase.from('direct_messages')
          .select('id, conversation_id, sender_id, created_at')
          .in('conversation_id', groups.map((c) => c.id))
          .gte('created_at', new Date(Date.now() - 45 * 86400000).toISOString())
      : Promise.resolve({ data: [] }),
  ])

  const profileById = Object.fromEntries((profiles ?? []).map((p) => [p.id, p]))
  const unreadByConvo = {}
  for (const m of unreadMsgs ?? []) unreadByConvo[m.conversation_id] = (unreadByConvo[m.conversation_id] || 0) + 1

  const memberProfiles = new Map()
  const myRow = new Map()
  for (const [cid, rows] of memberData.byConversation) {
    memberProfiles.set(cid, rows.map((r) => r.profiles).filter(Boolean))
    const mine = rows.find((r) => r.profile_id === userId)
    if (mine) myRow.set(cid, mine)
  }
  const groupUnread = {}
  for (const m of groupMsgs ?? []) {
    if (m.sender_id === userId) continue
    const since = myRow.get(m.conversation_id)?.last_read_at
    if (since && new Date(m.created_at) <= new Date(since)) continue
    groupUnread[m.conversation_id] = (groupUnread[m.conversation_id] || 0) + 1
  }

  return {
    invites,
    conversations: convos.map((c) => (c.kind === 'group'
      ? { ...c, members: memberProfiles.get(c.id) || [], myRole: myRow.get(c.id)?.role ?? null, unread: groupUnread[c.id] || 0 }
      : { ...c, other: profileById[otherParticipant(c, userId)], unread: unreadByConvo[c.id] || 0 })),
  }
}

// EVERYONE YOU COULD MESSAGE, AND WHICH OF THEM YOU ARE CONNECTED TO (2 Oct 2026).
//
// Feeds the inbox search and the desktop "Connect with someone new" pane. It lives here, beside fetchInbox, so the
// idle warm-up (lib/warmPages) can run it before the DM tab is opened and the pane paints from the page cache on its
// first frame. Ethan: the big right column "takes a while to load". Same visibility rules as the directory, newest
// activity first.
export const DM_PEOPLE_CACHE_KEY = 'dm-people'

export async function fetchDmPeople(userId) {
  const [{ data: profiles }, rels] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, name, photo_url, bio, is_admin, city, country, created_at, last_seen_at')
      .eq('status', 'active').in('is_test', testFlags()).is('deletion_requested_at', null)
      .order('last_seen_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false }),
    loadRelationships(userId),
  ])
  return {
    people: (profiles ?? []).filter((p) => p.id !== userId),
    connected: [...rels.entries()].filter(([, v]) => v.relation === 'connected').map(([id]) => id),
  }
}
