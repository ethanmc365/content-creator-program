// Supabase Edge Function: send-welcome
//
// Sends ONE welcome email to ONE newly accepted creator, after an admin has read
// it and pressed send on /admin/email.
//
// This replaces the old broadcast-email function, which could mail the whole
// community at once. That capability is deliberately gone: bulk sending from a
// shared mailbox is what got the platform flagged as a spam sender. To reach
// everyone, an admin now copies the address list off the email page and sends
// from a real mailing tool.
//
// Modes:
//   action:'preview'   render the exact HTML without sending anything
//   test:true          send one copy to the signed-in admin
//   outboxId:'<uuid>'  send the queued welcome email to its recipient
//
// The recipient is ALWAYS resolved from the email_outbox row on the server. The
// client can edit the subject and body, never who it goes to.
//
// Auth: the caller's JWT is verified against the project JWKS, then re-checked
// against profiles.is_admin. A non-admin can never invoke this.
//
// IMPORTANT: the whole handler is wrapped so EVERY failure returns JSON with
// CORS headers. An unhandled throw produces a bare 500 with no CORS, which the
// browser blocks, and the client then reports a misleading "network error"
// instead of the real cause. That exact trap cost us a debugging cycle.
//
// Deploy:  supabase functions deploy send-welcome --no-verify-jwt
// Secrets: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, APP_URL
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'
import * as jose from 'npm:jose@5'
import { renderEmail, renderText, textToHtml } from '../_shared/emailTemplate.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const SMTP_HOST = Deno.env.get('SMTP_HOST')
const SMTP_PORT = Number(Deno.env.get('SMTP_PORT') ?? '465')
const SMTP_USER = Deno.env.get('SMTP_USER')
const SMTP_PASS = Deno.env.get('SMTP_PASS')
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? 'Tryp.com <no-reply@tryp.com>'
// Every button in every email points at the Creator Program app, never tryp.com.
const APP_URL = Deno.env.get('APP_URL') ?? 'https://trypcreators.vercel.app'
const REPLY_TO = Deno.env.get('REPLY_TO') ?? MAIL_FROM.match(/<([^>]+)>/)?.[1] ?? MAIL_FROM

const JWKS = jose.createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

const FOOTER = 'You are receiving this because your application to the Tryp.com Content Creator Program was accepted.'

// One message, one fresh connection. NOT pooled: denomailer's pooled client was
// the likely source of a hard crash, and at this volume the extra TLS handshake
// costs nothing. NOTE: close() returns void, not a promise, so calling .catch()
// on it throws "Cannot read properties of undefined".
//
// Both a text and an HTML part are always sent. `content` IS the plain-text
// body in denomailer; an earlier version passed the string 'text/html' there,
// so every message shipped a text part reading literally "text/html".
async function sendOne(to: string, subject: string, html: string, text: string) {
  const client = new SMTPClient({
    connection: {
      hostname: SMTP_HOST!, port: SMTP_PORT, tls: SMTP_PORT === 465,
      auth: { username: SMTP_USER!, password: SMTP_PASS! },
    },
  })
  try {
    await client.send({
      from: MAIL_FROM,
      to,
      replyTo: REPLY_TO,
      subject,
      content: text,
      html,
      // RFC 2369. A real opt-out route is one of the strongest "this is not
      // spam" signals a sender can give. Deliberately NOT advertising One-Click
      // (List-Unsubscribe-Post): that promises a POST endpoint that actually
      // unsubscribes, and we do not have one.
      headers: {
        'List-Unsubscribe': `<mailto:${REPLY_TO}?subject=Unsubscribe>, <${APP_URL}/settings>`,
      },
    })
  } finally {
    try { await client.close() } catch { /* already closed */ }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  try {
    // ---- Verify the caller is a real, signed-in admin ----------------------
    const auth = req.headers.get('Authorization') ?? ''
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : ''
    if (!token) return json({ error: 'Not signed in.' }, 401)
    let callerId: string
    try {
      const { payload } = await jose.jwtVerify(token, JWKS)
      callerId = String(payload.sub)
    } catch {
      return json({ error: 'Invalid session.' }, 401)
    }
    const { data: caller } = await admin.from('profiles').select('is_admin').eq('id', callerId).single()
    if (!caller?.is_admin) return json({ error: 'Admins only.' }, 403)

    const { subject, body, ctaLabel, ctaPath, test, action, outboxId } =
      await req.json().catch(() => ({} as Record<string, unknown>))
    if (!subject || !body) return json({ error: 'A subject and a message are both required.' }, 400)

    // Callers pass a PATH only, so an email can never be pointed off-platform.
    const path = typeof ctaPath === 'string' && ctaPath.startsWith('/') ? ctaPath : '/home'
    const label = ctaLabel ? String(ctaLabel) : 'Open the Creator Program'
    const ctaUrl = `${APP_URL}${path}`

    // {{name}} is normally resolved when the trigger queues the row, but a
    // hand-written edit can reintroduce it, so it is always swapped here too.
    const fill = (s: unknown, firstName: string) => String(s ?? '').replaceAll('{{name}}', firstName)
    const buildHtml = (firstName: string) => renderEmail({
      title: fill(subject, firstName),
      bodyHtml: textToHtml(fill(body, firstName)),
      ctaLabel: label, ctaUrl, footerNote: FOOTER, appUrl: APP_URL,
    })
    const buildText = (firstName: string) => renderText({
      title: fill(subject, firstName),
      bodyText: fill(body, firstName),
      ctaLabel: label, ctaUrl, footerNote: FOOTER, appUrl: APP_URL,
    })

    // Preview is handled BEFORE the SMTP check, so the copy can be reviewed even
    // if mail credentials are missing.
    if (action === 'preview') return json({ html: buildHtml('Alex') })

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      return json({
        error: 'Email sending is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM as secrets on this function.',
      }, 503)
    }

    // ---- Who is this going to? --------------------------------------------
    let to = ''
    let firstName = 'there'
    let recipientId: string | null = null

    if (test) {
      const { data: u } = await admin.auth.admin.getUserById(callerId)
      const { data: me } = await admin.from('profiles').select('name').eq('id', callerId).maybeSingle()
      to = u?.user?.email ?? ''
      firstName = (me?.name ?? '').split(' ')[0] || 'there'
      recipientId = callerId
      if (!to) return json({ error: 'Your account has no email address to test with.' }, 400)
    } else {
      if (typeof outboxId !== 'string' || !outboxId) {
        return json({ error: 'Nothing to send: this email is not in the review queue.' }, 400)
      }
      const { data: row } = await admin
        .from('email_outbox').select('id, status, recipient_id, recipient_name').eq('id', outboxId).maybeSingle()
      if (!row) return json({ error: 'That queued email no longer exists.' }, 404)
      if (row.status !== 'pending') return json({ error: `This email was already ${row.status}.` }, 409)
      if (!row.recipient_id) return json({ error: 'That queued email has no recipient.' }, 400)

      const { data: u } = await admin.auth.admin.getUserById(row.recipient_id)
      to = u?.user?.email ?? ''
      if (!to) return json({ error: 'Could not find an email address for that creator.' }, 400)
      firstName = (row.recipient_name ?? '').split(' ')[0] || 'there'
      recipientId = row.recipient_id
    }

    // ---- Send --------------------------------------------------------------
    const finalSubject = fill(subject, firstName)
    try {
      await sendOne(to, finalSubject, buildHtml(firstName), buildText(firstName))
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      await admin.from('email_send_log').insert({
        kind: 'welcome', recipient_id: recipientId, recipient_email: to,
        subject: finalSubject, status: 'failed', error: msg,
      })
      return json({ error: `Could not send: ${msg}` }, 502)
    }

    await admin.from('email_send_log').insert({
      kind: 'welcome', recipient_id: recipientId, recipient_email: to,
      subject: finalSubject, status: 'sent',
    })

    // Close the queue item out.
    if (!test && typeof outboxId === 'string') {
      await admin.from('email_outbox')
        .update({ status: 'sent', recipient_count: 1, decided_at: new Date().toISOString(), decided_by: callerId })
        .eq('id', outboxId)
    }

    return json({ sent: 1, to, test: !!test })
  } catch (e) {
    // Never let an exception escape without CORS headers.
    return json({ error: `Server error: ${e instanceof Error ? e.message : String(e)}` }, 500)
  }
})
