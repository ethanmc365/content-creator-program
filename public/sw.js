/* Tryp.com Content Creator Program - notification service worker.
   Handles web-push delivery, page-driven notifications, and click routing. */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Background push from a server (signed with our VAPID key). Payload is JSON:
// { title, body, link }.
self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) { data = { body: event.data && event.data.text() } }
  event.waitUntil(
    self.registration.showNotification(data.title || 'Tryp.com', {
      body: data.body || '',
      icon: '/icon-192-v3.png',
      badge: '/icon-192-v3.png',
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
      icon: '/icon-192-v3.png',
      badge: '/icon-192-v3.png',
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
        try { await client.navigate(link) } catch (e) { /* cross-state navigate may fail */ }
        return client.focus()
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(link)
  })())
})
