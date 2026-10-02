import { supabase } from './supabase'
import { readPageCache, writePageCache } from './pageCache'
import { DM_CACHE_KEY, fetchInbox } from './inbox'
import { isSlowNetwork } from './netQuality'

// THE TABS YOU HAVE NOT OPENED YET, FETCHED WHILE YOU READ THE ONE YOU HAVE (2 Oct 2026).
//
// Ethan: "clicking on challenges, or DMs etc takes a bit too long to load ... try to increase this load time
// without decreasing performance." lib/pageCache already made every SECOND visit to a tab instant; the first
// one still mounted empty, fired its queries and drew a skeleton for most of a second on a phone. So once the app
// is up and idle, the two tabs people open most after the hub get their first query run ahead of time and the
// answer dropped into the page cache - the tap then paints real content on its first frame, and the page's own
// load still runs and corrects anything that changed.
//
// What keeps it from costing performance: it waits for idle AND a few seconds, it runs one read at a time, it never
// runs on a slow connection (lib/netQuality), never twice in a session, and never over a cache the page wrote itself.
let warmed = false

export function warmPagesWhenIdle(userId) {
  if (warmed || !userId || typeof window === 'undefined') return
  warmed = true
  // Still the same person? (Creator preview swaps the session; a warm-up must never file one account's rows
  // under another.)
  const same = async () => (await supabase.auth.getSession()).data?.session?.user?.id === userId
  const go = async () => {
    if (isSlowNetwork()) { warmed = false; return }
    try {
      if (!readPageCache('challenges')) {
        const { data } = await supabase.from('challenges').select('*, submissions(count)').order('start_date', { ascending: false })
        if (data && !readPageCache('challenges') && await same()) {
          writePageCache('challenges', { challenges: data, galleries: {}, participation: {}, prizesAwarded: null, leaders: {}, liveGroups: { groups: {}, mine: {} } })
        }
      }
      if (!readPageCache(DM_CACHE_KEY)) {
        const { conversations } = await fetchInbox(userId)
        if (!readPageCache(DM_CACHE_KEY) && await same()) writePageCache(DM_CACHE_KEY, conversations)
      }
    } catch { /* a warm-up that fails is only a miss */ }
  }
  const later = () => window.setTimeout(go, 2500)
  if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(later, { timeout: 5000 })
  else later()
}
