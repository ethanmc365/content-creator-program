// Supabase Edge Function: notify-dispatch
// Triggered by a Database Webhook on INSERT into public.notifications.
// Sends a Web Push to every device the recipient registered, and (for the
// important categories) an email via Resend. This is what makes notifications
// arrive when the PWA is fully closed.
//
// Deploy:  supabase functions deploy notify-dispatch --no-verify-jwt
// Secrets: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... RESEND_API_KEY=...
// Webhook: Database → Webhooks → on INSERT public.notifications → POST this function URL.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const APP_URL = Deno.env.get('APP_URL') ?? 'https://trypcreators.vercel.app'

webpush.setVapidDetails('mailto:hello@tryp.com', VAPID_PUBLIC, VAPID_PRIVATE)

// Categories that also send an email (DMs / chat / connections stay in-app only).
const EMAIL_TYPES = new Set(['announcement', 'challenge', 'event', 'results', 'application'])

const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')

Deno.serve(async (req) => {
  // Only the database webhook (which knows the shared secret) may call this.
  if (WEBHOOK_SECRET && req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 })
  }
  const payload = await req.json().catch(() => ({}))
  const n = payload.record ?? payload
  if (!n?.recipient_id) return new Response('no recipient', { status: 200 })

  // 1) Web push to every registered device.
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
      // Expired/invalid subscription: clean it up.
      if (e?.statusCode === 404 || e?.statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
      }
    }
  }))

  // 2) Email for the important categories, if the creator opted in.
  if (RESEND_API_KEY && EMAIL_TYPES.has(n.type)) {
    const { data: profile } = await supabase
      .from('profiles').select('email_opt_in').eq('id', n.recipient_id).single()
    if (profile?.email_opt_in) {
      const { data: u } = await supabase.auth.admin.getUserById(n.recipient_id)
      const email = u?.user?.email
      if (email) {
        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'Tryp.com Creators <onboarding@resend.dev>',
            to: email,
            subject: n.title,
            html: `<div style="font-family:Poppins,Arial,sans-serif;color:#1a1a1a">
              <h2 style="color:#d94407">${n.title}</h2>
              <p>${n.body ?? ''}</p>
              <p><a href="${APP_URL}${n.link || '/notifications'}"
                style="display:inline-block;background:#d94407;color:#fff;padding:10px 18px;border-radius:9999px;text-decoration:none">Open in the app</a></p>
            </div>`,
          }),
        })
      }
    }
  }

  return new Response('ok', { status: 200 })
})
