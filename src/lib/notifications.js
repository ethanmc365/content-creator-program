import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react'
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
//
// AND SINCE 10 SEP THE ROWS THEMSELVES ARE SHARED TOO, not just the code that
// fetches them - see "the store" below. One hook with `useState` in it is still
// two lists when two components call it, which is the whole of "I mark them as
// read, go to another tab, and they're all back again".

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

// ---------------------------------------------------------------- the store
//
// ONE LIST, HOWEVER MANY THINGS ARE LOOKING AT IT (10 Sep 2026).
//
// Ethan: "I open the bell, read the notifications, mark them as read, clear
// them, and then I go to another tab, open it, and they're all back again. It
// doesn't update instantly. After a refresh it does update."
//
// The write was never the problem - a `mark all read` really does set every row
// (verified: 36 unread to 0, status 204). The problem is that this hook used to
// keep its rows in `useState`, and there are TWO callers: the bell in the top
// bar, which never unmounts, and `/notifications`, which holds 150 rows and
// mounts fresh every visit. Two copies of one list, each perfectly correct
// about its own history and blind to the other's. Read everything on the page,
// come back, and the bell is still holding the list it fetched when the app
// started - which is exactly "they're all back again", and exactly why a
// reload fixes it.
//
// So the rows live HERE, in module scope, with the subscriber pattern this
// codebase already uses for the boot layer. Every surface reads the same array
// and every operation is seen by all of them on the same frame.
//
// AND THE FEED CARRIES UPDATES AND DELETES, NOT JUST INSERTS. That is the
// second half of what was asked - "even for switching apps". A phone and a
// laptop signed in as the same person are two more copies of this list, and
// Postgres already knows when one of them marks a row read; it simply was not
// being listened to. `read` flipping on another device now lands here in the
// same beat it lands there.
let rows = null                 // null = not loaded yet
let leavingIds = new Set()      // mid-animation, gone as far as the counts go
const subs = new Set()
const emit = () => { for (const fn of [...subs]) fn() }
// ONE OBJECT PER CHANGE. `useSyncExternalStore` compares snapshots by identity
// and re-reads on every render, so a snapshot that is rebuilt each call is an
// infinite loop and a snapshot that is mutated in place never re-renders.
let snap = { rows, leaving: leavingIds }
function publish() {
  snap = { rows, leaving: leavingIds }
  emit()
}
function subscribe(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}
const getSnapshot = () => snap
// Server-side and in a test there is nothing loaded and nothing leaving.
const EMPTY = { rows: null, leaving: new Set() }
const getServerSnapshot = () => EMPTY

function setRows(next) {
  rows = typeof next === 'function' ? next(rows) : next
  publish()
}
function setLeaving(next) {
  leavingIds = typeof next === 'function' ? next(leavingIds) : next
  publish()
}

/** Forget everything. Called on sign-out so the next person sees their own. */
export function resetNotifications() {
  rows = null
  leavingIds = new Set()
  publish()
}

// HOW MANY ROWS THE STORE HOLDS. One store, two surfaces, two appetites: the
// bell shows 30 and the page shows 150. Holding the larger of the two and
// letting the bell slice is the only version of this that does not have the
// page's extra rows disappear the moment the bell reloads.
const HOLD = 150

/**
 * Everything the bell and the notifications page both need.
 *
 * @param {object} opts
 * @param {string} opts.userId       whose notifications
 * @param {string} opts.pathname     where the reader is right now
 * @param {object} opts.pushPrefs    `profile.notif_prefs`, for OS notifications
 * @param {number} opts.limit        how many THIS surface shows
 * @param {boolean} opts.live        subscribe to changes. Ref-counted, so two
 *                                   live callers still open one channel.
 */
export function useNotifications({ userId, pathname, pushPrefs, limit = 40, live = true }) {
  const { rows: all, leaving } = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)

  const prefsRef = useRef(pushPrefs)
  useEffect(() => { prefsRef.current = pushPrefs }, [pushPrefs])
  const pathRef = useRef(pathname)
  useEffect(() => { pathRef.current = pathname }, [pathname])

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(HOLD)
    setRows(data ?? [])
  }, [])

  useEffect(() => {
    if (!userId) return undefined
    load()
    if (!live) return undefined
    return openFeed(userId, prefsRef, pathRef)
  }, [userId, load, live])

  // Landing on the page a notification was for clears it, however you got
  // there - tapping the alert, a link, or straight navigation.
  useEffect(() => {
    if (!userId || !pathname) return
    // Being on the notifications page is not the target of any alert.
    if (pathname === '/notifications') return
    setRows((prev) => prev?.map((n) => (!n.read && linkPathname(n.link) === pathname ? { ...n, read: true } : n)) ?? prev)
    supabase.from('notifications').update({ read: true })
      .eq('recipient_id', userId).eq('read', false).eq('link', pathname)
      .then(() => {})
    closeNotificationsForPath(pathname)
  }, [pathname, userId])

  const markRead = useCallback(async (id) => {
    setRows((prev) => prev?.map((x) => (x.id === id ? { ...x, read: true } : x)) ?? prev)
    await supabase.from('notifications').update({ read: true }).eq('id', id)
  }, [])

  const markAllRead = useCallback(async () => {
    setRows((prev) => prev?.map((x) => ({ ...x, read: true })) ?? prev)
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
      setRows((prev) => prev?.filter((x) => x.id !== id) ?? prev)
      setLeaving((s) => { const n = new Set(s); n.delete(id); return n })
    }, 260)
  }, [])

  // CLEARING WHAT YOU HAVE READ, NOT CLEARING EVERYTHING. A single "clear all"
  // on a list where the unread ones are the entire point is a button whose most
  // likely use is a mistake. Unread rows survive it and the label says so.
  const clearRead = useCallback(async () => {
    const kept = all || []
    setRows(kept.filter((x) => !x.read))
    const { error } = await supabase.from('notifications').delete().eq('recipient_id', userId).eq('read', true)
    // Same rollback as `dismiss`, for the same reason: a batch delete that
    // fails must not leave the page claiming it worked.
    if (error) { setRows(kept); toast('Those would not clear. Try again in a moment.') }
  }, [userId, all])

  // THE COUNTS ARE OVER EVERYTHING HELD, NOT OVER WHAT THIS SURFACE DRAWS. A
  // bell that shows thirty rows and badges "30" while the page behind it has a
  // hundred and fifty is a bell that is quietly wrong about the only number it
  // exists to report.
  const items = useMemo(() => (all ? all.slice(0, limit) : null), [all, limit])
  const unread = useMemo(() => (all || []).filter((n) => !n.read).length, [all])
  const readCount = useMemo(() => (all || []).filter((n) => n.read).length, [all])

  return { items, loading: all === null, leaving, unread, readCount, markRead, markAllRead, dismiss, clearRead, reload: load }
}

// ------------------------------------------------------------------ the feed
//
// REF-COUNTED, because two live callers on one page would be two subscriptions
// to one channel topic - which Supabase resolves by refusing the second, and
// which is why the page used to pass `live: false` and go without. It does not
// have to any more: whoever mounts first opens it and whoever leaves last
// closes it.
let feed = null
let feedUsers = 0

function openFeed(userId, prefsRef, pathRef) {
  feedUsers += 1
  if (!feed) {
    feed = supabase
      .channel(`notifications-${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
        (payload) => {
          const n = payload.new
          // If it is for the page they are already looking at, mark it read on
          // the spot instead of badging - they are seeing the content now.
          if (linkPathname(n.link) === pathRef.current && document.visibilityState === 'visible') {
            setRows((prev) => [{ ...n, read: true }, ...(prev || [])].slice(0, HOLD))
            supabase.from('notifications').update({ read: true }).eq('id', n.id).then(() => {})
            return
          }
          setRows((prev) => [n, ...(prev || [])].slice(0, HOLD))
          // Pop an OS notification when the app is not in the foreground, unless
          // the creator has turned push off for this category.
          const pushOn = prefsRef.current?.[n.type] !== false
          if (pushOn && document.visibilityState !== 'visible') {
            showLocalNotification({ title: n.title, body: n.body, link: n.link || '/notifications', tag: n.id })
          }
        },
      )
      // READ SOMEWHERE ELSE IS READ HERE. Marking a row read on a phone should
      // not leave a laptop badging it for the rest of the session.
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` },
        (payload) => {
          const n = payload.new
          setRows((prev) => prev?.map((x) => (x.id === n.id ? { ...x, ...n } : x)) ?? prev)
        },
      )
      // AND CLEARED SOMEWHERE ELSE IS CLEARED HERE. A DELETE payload carries the
      // primary key and nothing else, which is all this needs.
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'notifications' },
        (payload) => {
          const id = payload.old?.id
          if (!id) return
          setRows((prev) => prev?.filter((x) => x.id !== id) ?? prev)
        },
      )
      .subscribe()
  }
  return () => {
    feedUsers -= 1
    if (feedUsers <= 0 && feed) {
      supabase.removeChannel(feed)
      feed = null
      feedUsers = 0
    }
  }
}
