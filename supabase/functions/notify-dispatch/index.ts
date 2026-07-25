// Supabase Edge Function: notify-dispatch
// Triggered by a Database Webhook on INSERT into public.notifications.
// Sends a Web Push to every device the recipient registered, and (for the
// important categories) an email via Resend. This is what makes notifications
// arrive when the PWA is fully closed.
//
// Deploy:  supabase functions deploy notify-dispatch --no-verify-jwt
// Secrets: supabase secrets set VAPID_PUBLIC_KEY=... VAPID_PRIVATE_KEY=... RESEND_API_KEY=...
// Webhook: Database → Webhooks → on INSERT public.notifications → POST this function URL.
//
// EMAIL SENDING (see docs/EMAIL_SETUP.md):
//   Preferred = SMTP. Configure via edge-function secrets (never in source):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM.
//   See docs/EMAIL_SETUP.md for the current provider and how to set them.
//   Fallback = Resend (only reaches the account owner until a domain is verified).
//   MAIL_FROM also overrides the Resend "from" once a domain is verified.
import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'
import { renderEmail, textToHtml } from '../_shared/emailTemplate.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const APP_URL = Deno.env.get('APP_URL') ?? 'https://trypcreators.vercel.app'

// Email sender config. SMTP wins when configured; otherwise fall back to Resend.
const SMTP_HOST = Deno.env.get('SMTP_HOST')
const SMTP_PORT = Number(Deno.env.get('SMTP_PORT') ?? '465')
const SMTP_USER = Deno.env.get('SMTP_USER')
const SMTP_PASS = Deno.env.get('SMTP_PASS')
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? 'Tryp.com <onboarding@resend.dev>'
const SMTP_READY = !!(SMTP_HOST && SMTP_USER && SMTP_PASS)
const EMAIL_READY = SMTP_READY || !!RESEND_API_KEY

webpush.setVapidDetails('mailto:hello@tryp.com', VAPID_PUBLIC, VAPID_PRIVATE)

const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET')

// Parse a "Name <addr@x.com>" from-string into denomailer's {name?, mail} shape.
function parseFrom(s: string): { name?: string; mail: string } {
  const m = s.match(/^\s*(.*?)\s*<([^>]+)>\s*$/)
  return m ? { name: m[1] || undefined, mail: m[2] } : { mail: s.trim() }
}

// Send one email via SMTP (preferred) or Resend (fallback). A fresh SMTP
// connection per message keeps it simple and robust at this volume.
async function sendEmail(to: string, subject: string, html: string) {
  if (SMTP_READY) {
    const client = new SMTPClient({
      connection: {
        hostname: SMTP_HOST!,
        port: SMTP_PORT,
        tls: SMTP_PORT === 465,
        auth: { username: SMTP_USER!, password: SMTP_PASS! },
      },
    })
    try {
      const from = parseFrom(MAIL_FROM)
      await client.send({ from: from.name ? `${from.name} <${from.mail}>` : from.mail, to, subject, html, content: 'text/html' })
    } finally {
      await client.close().catch(() => {})
    }
    return
  }
  if (RESEND_API_KEY) {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: MAIL_FROM, to, subject, html }),
    })
  }
}

Deno.serve(async (req) => {
  // Only the database webhook (which knows the shared secret) may call this.
  if (WEBHOOK_SECRET && req.headers.get('x-webhook-secret') !== WEBHOOK_SECRET) {
    return new Response('unauthorized', { status: 401 })
  }
  const payload = await req.json().catch(() => ({}))
  const n = payload.record ?? payload
  if (!n?.recipient_id) return new Response('no recipient', { status: 200 })

  // Channel preferences: notif_prefs gates device push, email_prefs gates email.
  // The in-app row already exists (the bell is the always-on inbox).
  const { data: profile } = await supabase
    .from('profiles').select('notif_prefs, email_prefs').eq('id', n.recipient_id).single()
  const pushOn = profile?.notif_prefs?.[n.type] !== false
  const emailOn = profile?.email_prefs?.[n.type] === true

  // 1) Web push to every registered device (when push is on for this type).
  if (pushOn) {
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
        if (e?.statusCode === 404 || e?.statusCode === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        }
      }
    }))
  }

  // 2) Email (when the creator has opted into email for this type).
  if (EMAIL_READY && emailOn) {
    const { data: u } = await supabase.auth.admin.getUserById(n.recipient_id)
    const email = u?.user?.email
    if (email) {
      // Same branded shell as broadcasts and invoices, so every email the
      // platform sends looks like it came from the same company.
      const html = renderEmail({
        title: n.title,
        bodyHtml: textToHtml(n.body ?? ''),
        ctaLabel: 'Open in the app',
        ctaUrl: `${APP_URL}${n.link || '/notifications'}`,
        footerNote: 'You can choose exactly which emails you get in your settings.',
        appUrl: APP_URL,
      })
      // Log every attempt so the admin email dashboard can show real volume
      // against the provider's daily cap.
      try {
        await sendEmail(email, n.title, html)
        await supabase.from('email_send_log').insert({
          kind: 'notification', recipient_id: n.recipient_id, subject: n.title, status: 'sent',
        })
      } catch (e) {
        console.error('email send failed', e)
        await supabase.from('email_send_log').insert({
          kind: 'notification', recipient_id: n.recipient_id, subject: n.title,
          status: 'failed', error: e instanceof Error ? e.message : String(e),
        })
      }
    }
  }

  return new Response('ok', { status: 200 })
})
