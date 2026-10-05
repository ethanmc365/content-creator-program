/* Tryp.com Content Creator Program - service worker.
   Handles web-push delivery, page-driven notifications, click routing, AND
   offline app-shell caching so the app still boots with no connection. */

const CACHE = 'tryp-cache-v8'
const RECEIPTS = 'tryp-receipts-v1'
// The shell is what the offline screen needs and no more: the small logo and plane (1 Oct 2026 - the
// full-size PNGs were 760kB, downloaded on install over whatever connection the creator had).
const SHELL = ['/', '/index.html', '/brand/tryp-logo-360.png', '/brand/tryp-plane-640.png', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k !== CACHE && k !== RECEIPTS).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

// Vite dev/HMR requests must pass straight through untouched, or local dev breaks.
function isDevRequest(url) {
  return (
    url.pathname.startsWith('/@') ||
    url.pathname.startsWith('/src/') ||
    url.pathname.startsWith('/node_modules/') ||
    url.pathname.includes('.hot-update.') ||
    url.pathname === '/__vite_ping' ||
    url.searchParams.has('import') ||
    url.searchParams.has('t')
  )
}

async function shellIsComplete(cache, shell) {
  try {
    const html = await shell.clone().text()
    const files = [...html.matchAll(/(?:href|src)="(\/assets\/[^"]+\.(?:css|js))"/g)].map((m) => m[1])
    for (const f of files) if (!(await cache.match(f))) return false
    return true
  } catch { return false }
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // never touch Supabase / APIs / CDNs
  if (isDevRequest(url)) return

  // Page navigations: network-first (fresh HTML when online), falling back to
  // the cached shell so the SPA still loads when offline.
  //
  // BUT NOT WAITING FOR EVER ON A WEAK CONNECTION (1 Oct 2026). Ethan: "on a
  // slightly slower wifi connection, the entire platform becomes super laggy and
  // almost unusable." Every launch waited for a fresh index.html, so a slow line
  // was a blank screen before anything else could even start. The network now
  // gets 2.5 seconds; after that the cached shell boots the app and the fresh
  // copy still lands in the cache for next time. A shell from an older deploy is
  // safe: its chunks are in this cache, and lib/lazyRoute reloads once if one is
  // missing.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE)
      const cached = (await cache.match('/index.html')) || (await cache.match('/'))
      const network = fetch(request).then(async (fresh) => {
        const html = /text\/html/i.test(fresh?.headers?.get('content-type') || '')
        // Await the write so the worker isn't torn down before it lands.
        if (fresh && fresh.ok && html) await cache.put('/index.html', fresh.clone())
        return fresh
      })
      // A CACHED SHELL IS ONLY A FALLBACK IF EVERYTHING IT NEEDS IS ALSO CACHED (3 Oct 2026). A shell from an
      // older deploy names stylesheets and scripts by hash; once that deploy is gone from the server, a shell
      // whose files are not in this cache boots a page with no styles at all (Ethan's weak-wifi screenshot).
      if (!cached || !(await shellIsComplete(cache, cached))) return network.catch(() => cached || Response.error())
      event.waitUntil(network.catch(() => {}))
      const late = new Promise((resolve) => setTimeout(() => resolve(cached), 2500))
      return Promise.race([network.catch(() => cached), late])
    })())
    return
  }

  // Static assets: cache-first (built files are content-hashed / immutable).
  // The put is awaited so the worker stays alive long enough to store it.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE)
    const cached = await cache.match(request)
    if (cached) return cached
    try {
      const res = await fetch(request)
      // NEVER CACHE A WEB PAGE UNDER A SCRIPT'S NAME. A chunk that a deploy
      // removed used to come back as index.html with a 200, and cache-first
      // would then serve that page as "the script" for as long as this cache
      // lived. v7 also throws away any v6 entry poisoned that way.
      const html = /text\/html/i.test(res?.headers?.get('content-type') || '')
      if (res && res.ok && !html) await cache.put(request, res.clone())
      return res
    } catch {
      return (await cache.match(request)) || Response.error()
    }
  })())
})

// Background push from a server (signed with our VAPID key). Payload is JSON:
// { title, body, link }.
// PUSH ANALYTICS (migration 283): the phone reports two facts the server cannot know - that the
// notification was SHOWN and that it was TAPPED. `tag` is the notification's id. A beacon must
// never hold up or break the notification, so every failure is swallowed.
const TRACK_URL = 'https://heuhqqoxyggawuckxocp.supabase.co/functions/v1/push-track'
//
// SHORT ON PURPOSE (4 Oct 2026). Ethan: the app was showing 9 hours in iPhone Screen Time on days he used it for ten minutes, and this beacon
// arrived with push analytics a few days before it started. Every push wakes this worker, and the worker stayed awake until this request
// finished - on a slow connection or a cold edge function that is many seconds of "the app is running" per notification. It now gives up
// after 2.5 seconds, so the worker is never held open by analytics, and a delivery whose report is lost is simply not counted.
function track(id, e) {
  if (!id) return Promise.resolve()
  const ctl = typeof AbortController !== 'undefined' ? new AbortController() : null
  const timer = ctl ? setTimeout(() => ctl.abort(), 2500) : null
  return fetch(TRACK_URL, { method: 'POST', mode: 'no-cors', keepalive: true, signal: ctl ? ctl.signal : undefined, headers: { 'content-type': 'text/plain' }, body: JSON.stringify({ n: id, e }) })
    .catch(() => {})
    .finally(() => { if (timer) clearTimeout(timer) })
}

// 5 Oct 2026: A PUSH NOW DOES NO NETWORK WORK AT ALL. Ethan's Screen Time still showed ~4 hours for the app on a day he barely used it,
// mostly in the morning with the phone untouched, and the server logs show the page itself sent no heartbeats then (it was not on screen).
// The only thing left that wakes the app with the phone idle is a push arriving, so the worker now shows the notification and nothing else:
// the "delivered" receipt is parked in a tiny cache entry and the PAGE sends it the next time the app is opened (lib/push.flushReceipts).
async function parkReceipt(id) {
  if (!id) return
  try {
    const c = await caches.open(RECEIPTS)
    await c.put(new Request('/__receipt/' + id), new Response('delivered'))
  } catch { /* a lost receipt is only a missing analytics row */ }
}

self.addEventListener('push', (event) => {
  let data
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data && event.data.text() } }
  event.waitUntil(Promise.all([
    self.registration.showNotification(data.title || 'Tryp.com', {
      body: data.body || '',
      icon: '/icon-192-v4.png',
      badge: '/icon-192-v4.png',
      data: { link: data.link || '/', id: data.tag || '' },
      tag: data.tag,
    }),
    parkReceipt(data.tag),
  ]))
})

// The page can ask us to show a notification (used for realtime events while
// the app is open or backgrounded, without needing a push server).
self.addEventListener('message', (event) => {
  const d = event.data || {}
  if (d.type === 'show-notification') {
    self.registration.showNotification(d.title || 'Tryp.com', {
      body: d.body || '',
      icon: '/icon-192-v4.png',
      badge: '/icon-192-v4.png',
      data: { link: d.link || '/' },
      tag: d.tag,
    })
  }
})

// Clicking a notification focuses an existing tab (and routes it) or opens one.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.link) || '/'
  const nid = event.notification.data && event.notification.data.id
  event.waitUntil((async () => {
    await track(nid, 'clicked')
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of all) {
      if ('focus' in client) {
        try { await client.navigate(link) } catch { /* cross-state navigate may fail */ }
        return client.focus()
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(link)
  })())
})
