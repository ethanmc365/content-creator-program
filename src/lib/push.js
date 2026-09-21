// Web push helpers. We register a service worker and subscribe the browser to
// push using our VAPID public key. The subscription is stored in Supabase so a
// server function can deliver background pushes later; meanwhile the app shows
// notifications for realtime events directly through the service worker.
import { supabase } from './supabase'

// VAPID public key (safe to ship to the client). The matching private key is
// kept server-side for sending background pushes.
const VAPID_PUBLIC_KEY = 'BCHH08pOCchr0-2EqIqo0OkZIR91nCrMKvpMizJHVjT6L8m2Y7fZ6BULJa7_8NMFFHpf0qL1hpuPg8pDTPU8O7M'

export const pushSupported = () =>
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

export const pushPermission = () => ('Notification' in window ? Notification.permission : 'unsupported')

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  try { return await navigator.serviceWorker.register('/sw.js') } catch { return null }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)))
}

// Request permission, subscribe, and persist the subscription.
// Returns 'granted' | 'denied' | 'default' | 'unsupported' | 'error'.
export async function enablePush(userId) {
  if (!pushSupported()) return 'unsupported'
  try {
    const permission = await Notification.requestPermission()
    if (permission !== 'granted') return permission
    const reg = (await navigator.serviceWorker.ready) || (await registerServiceWorker())
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }
    const json = sub.toJSON()
    await supabase.from('push_subscriptions').upsert(
      { user_id: userId, endpoint: sub.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
      { onConflict: 'endpoint' }
    )
    return 'granted'
  } catch {
    return 'error'
  }
}

// KEEP THIS DEVICE'S REGISTRATION CURRENT, ON EVERY OPEN (21 Sep 2026).
//
// A subscription used to be written only when somebody pressed "turn on
// notifications". Browsers rotate push subscriptions (iOS after an update or a
// long sleep, Chrome when its FCM token is refreshed), and notify-dispatch
// deletes one the push service reports gone - and in all three cases nothing
// ever wrote the new one, so a creator who had said yes once stopped getting
// pushes for good while every setting still read "on". Ethan: "I haven't been
// getting notifications recently."
//
// So when permission is already granted, the app re-reads the live
// subscription (making one if the browser has none) and upserts it. It never
// ASKS for permission - that stays a deliberate press - and it is silent on
// every failure, because it runs at start-up.
let lastSync = { user: null, at: 0 }
export async function syncPushSubscription(userId, { force = false } = {}) {
  if (!userId || !pushSupported() || Notification.permission !== 'granted') return false
  // At most once every ten minutes per person: foregrounding the app is
  // frequent and the subscription rarely changes. `force` is the test button.
  if (!force && lastSync.user === userId && Date.now() - lastSync.at < 10 * 60 * 1000) return true
  lastSync = { user: userId, at: Date.now() }
  try {
    const reg = (await navigator.serviceWorker.getRegistration()) || (await registerServiceWorker())
    if (!reg) return false
    let sub = await reg.pushManager.getSubscription()
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
    }
    const json = sub.toJSON()
    const { error } = await supabase.from('push_subscriptions').upsert(
      { user_id: userId, endpoint: sub.endpoint, p256dh: json.keys.p256dh, auth: json.keys.auth },
      { onConflict: 'endpoint' },
    )
    return !error
  } catch {
    return false
  }
}

export async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready
    const sub = await reg.pushManager.getSubscription()
    if (sub) {
      await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      await sub.unsubscribe()
    }
  } catch { /* ignore */ }
}

// Close any already-shown OS notifications that point at `path` (matched on the
// pathname of their stored link). Called when the user lands on the page a
// notification was for, so a DM/chat/challenge alert clears the moment they
// actually view it - no more stale notifications hanging around after you reply.
export async function closeNotificationsForPath(path) {
  if (!('serviceWorker' in navigator)) return
  try {
    const reg = await navigator.serviceWorker.ready
    if (!reg?.getNotifications) return
    const notes = await reg.getNotifications()
    for (const n of notes) {
      const link = (n.data && n.data.link) || ''
      if (link.split(/[?#]/)[0] === path) n.close()
    }
  } catch { /* ignore */ }
}

// Show a notification now via the service worker. Used by the realtime listener
// so notifications pop even though we have no push server yet.
export async function showLocalNotification({ title, body, link, tag }) {
  if (!('serviceWorker' in navigator) || pushPermission() !== 'granted') return
  try {
    const reg = await navigator.serviceWorker.ready
    reg.showNotification(title || 'Tryp.com', {
      body: body || '',
      icon: '/icon-192-v4.png',
      badge: '/icon-192-v4.png',
      data: { link: link || '/' },
      tag,
    })
  } catch { /* ignore */ }
}
