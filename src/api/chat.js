// Rooms, DMs, group chats, reactions and polls: the Supabase tables and functions this feature owns. Pages call these instead of
// naming tables, so a schema rename or a backend move is a change in this folder. Each accessor returns the same
// query builder / `{ data, error }` as before.
import { supabase } from '../lib/supabase'

export const makeChatApi = (db = supabase) => ({
  channelReads: () => db.from('channel_reads'),
  channels: () => db.from('channels'),
  conversationInvites: () => db.from('conversation_invites'),
  conversationMembers: () => db.from('conversation_members'),
  conversations: () => db.from('conversations'),
  directMessages: () => db.from('direct_messages'),
  dmReactions: () => db.from('dm_reactions'),
  messages: () => db.from('messages'),
  pollOptions: () => db.from('poll_options'),
  pollVotes: () => db.from('poll_votes'),
  polls: () => db.from('polls'),
  reactions: () => db.from('reactions'),
  deleteMessage: (args, opts) => db.rpc('delete_message', args, opts),
  leaveConversation: (args, opts) => db.rpc('leave_conversation', args, opts),
  reportMessage: (args, opts) => db.rpc('report_message', args, opts),
})

export const chatApi = makeChatApi()
