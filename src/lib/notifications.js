import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from './supabase'
import { showLocalNotification, closeNotificationsForPath } from './push'
import { toast } from './toast'

// THE NOTIFICATION CENTRE, IN ONE PLACE.
//
// There were two copies of this: the bell in the top bar kept twelve rows and
// its own realtime subscription, and /notifications kept a hundred rows with no
// subscription at all and its own idea of what "open" and "mark all read" mean.
// They drifted exactly the way two copies of anything drift - the page never
// updated live, dismissing was possible in neither, and a notification read in
// one place stayed bold in the other until you reloaded.
//
// So the data, the realtime feed, and every operation on a notification live
// here, and the two surfaces are just two shapes for the same hook. Adding
// "clear this one" meant adding it once.

// Pathname a notification's link points at (dropping any query/hash), so we can
// tell when the reader is looking at the exact page an alert was for.
export const linkPathname = (link) => (link || '').split(/[?#]/)[0]

// WHAT EACH KIND OF ALERT IS, AND WHAT IT LOOKS LIKE.
//
// EVERY TYPE THE DATABASE ACTUALLY WRITES IS IN HERE. The old table listed
// thirteen and the `notifications` table contains seventeen, so the four
// busiest kinds a creator gets after a challenge opens - a submission landing,
// a new creator joining, a streak about to lapse, the daily nudge - all fell
// through to a generic bell with no label. A row whose icon is the same icon as
// the button it came out of is a row carrying no information at all.
//
// `group` is the filter it answers to, and there are TWO of them. Three was one
// too many: "admin" held announcements and applications, which to the person
// reading them are updates like any other, and a filter pill that is only ever
// meaningful to two people on the platform is a pill in everybody's way.
// PEOPLE is the one that earns its place - somebody is waiting on a reply, and
// that is a different kind of urgency from anything else here.
export const TYPE_META = {
  dm: { icon: 'envelope', group: 'people', label: 'Message' },
  chat: { icon: 'chat', group: 'people', label: 'Message' },
  mention: { icon: 'chat', group: 'people', label: 'Mention' },
  connection: { icon: 'users', group: 'people', label: 'Connection' },
  collab: { icon: 'pin', group: 'people', label: 'Meet-up' },
  feedback: { icon: 'chat', group: 'people', label: 'Feedback' },
  new_member: { icon: 'users', group: 'people', label: 'New creator' },
  referral: { icon: 'share', group: 'people', label: 'Referral' },
  challenge: { icon: 'flag', group: 'updates', label: 'Challenge' },
  submission: { icon: 'video', group: 'updates', label: 'Entry' },
  deadline: { icon: 'clock', group: 'updates', label: 'Deadline' },
  results: { icon: 'trophy', group: 'updates', label: 'Results' },
  reward: { icon: 'money', group: 'updates', label: 'Reward' },
  event: { icon: 'calendar', group: 'updates', label: 'Event' },
  application: { icon: 'shield', group: 'updates', label: 'Application' },
  announcement: { icon: 'megaphone', group: 'updates', label: 'Announcement' },
  daily_streak: { icon: 'sparkles', group: 'updates', label: 'Streak' },
  daily_reminder: { icon: 'joystick', group: 'updates', label: 'Daily puzzle' },
  inactive: { icon: 'clock', group: 'updates', label: 'Reminder' },
}

export const metaFor = (type) => TYPE_META[type] || { icon: 'bell', group: 'updates', label: 'Update' }

export const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'unread', label: 'Unread' },
  { key: 'people', label: 'People' },
  { key: 'updates', label: 'Updates' },
]

/** Does this row belong under that filter? */
export function matchesFilter(n, filter) {
  if (filter === 'all') return true
  if (filter === 'unread') return !n.read
  return metaFor(n.type).group === filter
}

// WHEN SOMETHING HAPPENED, AS A HEADING RATHER THAN A TIMESTAMP.
//
// A list of twenty rows each ending "3 days ago" is twenty separate small sums
// the reader has to do. Three headings do the same work once: what has happened
// since you last looked, what happened today, and everything before that.
export function bucketOf(iso) {
  const t = new Date(iso).getTime()
  const now = Date.now()
  if (now - t < 60 * 60 * 1000) return 'Just now'
  const startOfToday = new Date(); startOfToday.setHours(0, 0, 0, 0)
  if (t >= startOfToday.getTime()) return 'Earlier today'
  const startOfYesterday = startOfToday.getTime() - 24 * 60 * 60 * 1000
  if (t >= startOfYesterday) return 'Yesterday'
  if (now - t < 7 * 24 * 60 * 60 * 1000) return 'This week'
  return 'Older'
}

/** Rows split into their buckets, in order, dropping the empty ones. */
export function groupByAge(rows) {
  const order = ['Just now', 'Earlier today', 'Yesterday', 'This week', 'Older']
  const bins = new Map(order.map((k) => [k, []]))
  for (const n of rows) bins.get(bucketOf(n.created_at)).push(n)
  return order.map((k) => [k, bins.get(k)]).filter(([, v]) => v.length)
}

/**
 * Everything the bell and the notifications page both need.
 *
 * @param {object} opts
 * @param {string} opts.userId       whose notifications
 * @param {string} opts.pathname     where the reader is right now
 * @param {object} opts.pushPrefs    `profile.notif_prefs`, for OS notifications
 * @param {number} opts.limit        how many to hold
 * @param {boolean} opts.live        subscribe to new ones (the bell does; a
 *                                   second subscriber on the same page would be
 *                                   a duplicate channel topic)
 */
export function useNotifications({ userId, pathname, pushPrefs, limit = 40, live = true }) {
  const [items, setItems] = useState(null)
  // THE ROWS AN OPERATION IS IN THE MIDDLE OF REMOVING. A dismissed row leaves
  // on an animation, so it has to stay in the DOM for the length of it while
  // already being gone as far as the counts are concerned.
  const [leaving, setLeaving] = useState(() => new Set())

  const prefsRef = useRef(pushPrefs)
  useEffect(() => { prefsRef.current = pushPrefs }, [pushPrefs])
  const pathRef = useRef(pathname)
  useEffect(() => { pathRef.current = pathname }, [pathname])

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit)
    setItems(data ?? [])
  }, [limit])

  useEffect(() => {
    if (!userId) return undefined
    load()
    if (!live) return undefined
    // Realtime: prepend new notifications for me the moment they are created.
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
        (payload) => {
          const n = payload.new
          // If it is for the page they are already looking at, mark it read on
          // the spot instead of badging - they are seeing the content now.
          if (linkPathname(n.link) === pathRef.current && document.visibilityState === 'visible') {
            setItems((prev) => [{ ...n, read: true }, ...(prev || [])].slice(0, limit))
            supabase.from('notifications').update({ read: true }).eq('id', n.id).then(() => {})
            return
          }
          setItems((prev) => [n, ...(prev || [])].slice(0, limit))
          // Pop an OS notification when the app is not in the foreground, unless
          // the creator has turned push off for this category.
          const pushOn = prefsRef.current?.[n.type] !== false
          if (pushOn && document.visibilityState !== 'visible') {
            showLocalNotification({ title: n.title, body: n.body, link: n.link || '/notifications', tag: n.id })
          }
        }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [userId, load, live, limit])

  // Landing on the page a notification was for clears it, however you got
  // there - tapping the alert, a link, or straight navigation.
  useEffect(() => {
    if (!userId || !pathname) return
    // Being on the notifications page is not the target of any alert.
    if (pathname === '/notifications') return
    setItems((prev) => prev?.map((n) => (!n.read && linkPathname(n.link) === pathname ? { ...n, read: true } : n)) ?? prev)
    supabase.from('notifications').update({ read: true })
      .eq('recipient_id', userId).eq('read', false).eq('link', pathname)
      .then(() => {})
    closeNotificationsForPath(pathname)
  }, [pathname, userId])

  const markRead = useCallback(async (id) => {
    setItems((prev) => prev?.map((x) => (x.id === id ? { ...x, read: true } : x)) ?? prev)
    await supabase.from('notifications').update({ read: true }).eq('id', id)
  }, [])

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev?.map((x) => ({ ...x, read: true })) ?? prev)
    await supabase.from('notifications').update({ read: true }).eq('recipient_id', userId).eq('read', false)
  }, [userId])

  // ONE ROW, GONE. It leaves the list on an animation, so it is marked
  // `leaving` first and only actually dropped when the animation is over -
  // otherwise the row is unmounted on the frame you press and the exit plays to
  // nobody. The delete goes to the server immediately; the wait is cosmetic and
  // the row must not come back if the reader is quick.
  // AND IF THE SERVER SAYS NO, THE ROW COMES BACK.
  //
  // THE BUG THIS FIXES. The delete was fired and its result thrown away
  // (`.then(() => {})`), so a rejected delete looked exactly like a successful
  // one: the row slid out, the count dropped, and the whole list was back on
  // the next reload. Optimistic UI without a rollback is not optimistic, it is
  // wrong on a delay - and the delay is what makes it hard to notice.
  const dismiss = useCallback(async (id) => {
    setLeaving((s) => new Set(s).add(id))
    const { error } = await supabase.from('notifications').delete().eq('id', id)
    if (error) {
      setLeaving((s) => { const n = new Set(s); n.delete(id); return n })
      toast('That one would not clear. Try again in a moment.')
      return
    }
    setTimeout(() => {
      setItems((prev) => prev?.filter((x) => x.id !== id) ?? prev)
      setLeaving((s) => { const n = new Set(s); n.delete(id); return n })
    }, 260)
  }, [])

  // CLEARING WHAT YOU HAVE READ, NOT CLEARING EVERYTHING. A single "clear all"
  // on a list where the unread ones are the entire point is a button whose most
  // likely use is a mistake. Unread rows survive it and the label says so.
  const clearRead = useCallback(async () => {
    const kept = items || []
    setItems(kept.filter((x) => !x.read))
    const { error } = await supabase.from('notifications').delete().eq('recipient_id', userId).eq('read', true)
    // Same rollback as `dismiss`, for the same reason: a batch delete that
    // fails must not leave the page claiming it worked.
    if (error) { setItems(kept); toast('Those would not clear. Try again in a moment.') }
  }, [userId, items])

  const unread = useMemo(() => (items || []).filter((n) => !n.read).length, [items])
  const readCount = useMemo(() => (items || []).filter((n) => n.read).length, [items])

  return { items, loading: items === null, leaving, unread, readCount, markRead, markAllRead, dismiss, clearRead, reload: load }
}
