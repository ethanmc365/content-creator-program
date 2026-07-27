// Supabase Edge Function: notify-dispatch
// Triggered by a Database Webhook on INSERT into public.notifications.
// Sends a Web Push to every device the recipient registered. This is what makes
// notifications arrive when the PWA is fully closed.
//
// THIS FUNCTION NO LONGER SENDS EMAIL (rebuild, Jul 27 2026).
//
// It used to email the "important" categories and park broadcasts in an
// approval queue. Sending a run of near-identical messages from a shared
// mailbox got the platform flagged as a bulk sender and Gmail began blocking
// the mail outright, so automatic email is off across the board. The platform
// now sends exactly two kinds of email, neither of them from here:
//
//   - password resets, sent by Supabase Auth over SMTP (see auth-gate)
//   - a welcome email per accepted creator, queued by a database trigger for an
//     admin to approve on /admin/email, then sent by the send-welcome function
//
// Notifications themselves are unaffected: the in-app bell row is always
// written by notify_user/notify_all, and push still goes out instantly below.
//
// Deploy:  supabase functions deploy notify-dispatch --no-verify-jwt
// Secrets: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=...
// Webhook: Database → Webhooks → on INSERT public.notifications → POST this function URL.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!

webpush.setVapidDetails('mailto:hello@tryp.com', VAPID_PUBLIC, VAPID_PRIVATE)

const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')

Deno.serve(async (req) => {
  // Only the database webhook (which knows the shared secret) may call this.
  if (WEBHOOK_SECRET && req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 })
  }

  try {
    const payload = await req.json().catch(() => ({}))
    const n = payload.record ?? payload
    if (!n?.recipient_id) return new Response('no recipient', { status: 200 })

    // notif_prefs gates device push per notification type. The in-app row
    // already exists either way, because the bell is the always-on inbox.
    const { data: profile } = await supabase
      .from('profiles').select('notif_prefs').eq('id', n.recipient_id).single()
    if (profile?.notif_prefs?.[n.type] === false) return new Response('push off', { status: 200 })

    const { data: subs } = await supabase
      .from('push_subscriptions').select('*').eq('user_id', n.recipient_id)

    const body = JSON.stringify({
      title: n.title, body: n.body ?? '', link: n.link || '/notifications', tag: n.id,
    })

    await Promise.all((subs ?? []).map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, body,
        )
      } catch (e) {
        // 404/410 mean the browser threw the subscription away (uninstalled the
        // PWA, cleared site data). Drop it so we stop retrying forever.
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        }
      }
    }))

    return new Response('ok', { status: 200 })
  } catch (e) {
    // A webhook that 500s gets retried; log the reason and answer 200 so a bad
    // payload cannot wedge the queue.
    console.error('notify-dispatch failed', e)
    return new Response('error', { status: 200 })
  }
})
