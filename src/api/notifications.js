// Notifications and push subscriptions: every query for them lives here.
import { supabase } from '../lib/supabase'

export const notificationsApi = (db = supabase) => ({
  listMine: (limit) => db.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit),
  markRead: (id) => db.from('notifications').update({ read: true }).eq('id', id),
  markAllRead: (userId) => db.from('notifications').update({ read: true }).eq('recipient_id', userId).eq('read', false),
  markReadForPath: (path) => db.rpc('mark_notifications_read_for_path', { p: path }),
  remove: (id) => db.from('notifications').delete().eq('id', id),
  removeRead: (userId) => db.from('notifications').delete().eq('recipient_id', userId).eq('read', true),
  removeAll: (userId) => db.from('notifications').delete().eq('recipient_id', userId),
  notifyMarket: (marketId, args) => db.rpc('notify_community', { p_community: marketId, ...args }),
  notifyEveryone: (args) => db.rpc('notify_all', args),
  savePushSubscription: (row) => db.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' }),
})

export const notifications = notificationsApi()
