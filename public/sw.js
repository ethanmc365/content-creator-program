/* Tryp.com Content Creator Program - service worker.
   Handles web-push delivery, page-driven notifications, click routing, AND
   offline app-shell caching so the app still boots with no connection. */

const CACHE = 'tryp-cache-v5'
const SHELL = ['/', '/index.html', '/brand/tryp-logo.png', '/brand/tryp-plane.png', '/manifest.webmanifest']

self.addEventListener('install', (event) => {
  self.skipWaiting()
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)).catch(() => {}))
})

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
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

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return
  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return // never touch Supabase / APIs / CDNs
  if (isDevRequest(url)) return

  // Page navigations: network-first (fresh HTML when online), falling back to
  // the cached shell so the SPA still loads when offline.
  if (request.mode === 'navigate') {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE)
      try {
        const fresh = await fetch(request)
        // Await the write so the worker isn't torn down before it lands.
        await cache.put('/index.html', fresh.clone())
        return fresh
      } catch {
        return (await cache.match('/index.html')) || (await cache.match('/')) || Response.error()
      }
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
      if (res && res.ok) await cache.put(request, res.clone())
      return res
    } catch {
      return (await cache.match(request)) || Response.error()
    }
  })())
})

// Background push from a server (signed with our VAPID key). Payload is JSON:
// { title, body, link }.
self.addEventListener('push', (event) => {
  let data
  try { data = event.data ? event.data.json() : {} } catch { data = { body: event.data && event.data.text() } }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Tryp.com', {
      body: data.body || '',
      icon: '/icon-192-v4.png',
      badge: '/icon-192-v4.png',
      data: { link: data.link || '/' },
      tag: data.tag,
    })
  )
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
  event.waitUntil((async () => {
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
