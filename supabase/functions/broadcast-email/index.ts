// Supabase Edge Function: broadcast-email
//
// Sends an admin-composed email to every active creator, one message per
// recipient (never a shared BCC), plus:
//   action:'preview' - render the exact HTML without sending
//   test:true        - send a single copy to the admin (or an explicit testTo)
//
// Auth: the caller's JWT is verified against the project JWKS, then re-checked
// against profiles.is_admin. A non-admin can never invoke this.
//
// IMPORTANT: the whole handler is wrapped so EVERY failure returns JSON with
// CORS headers. An unhandled throw produces a bare 500 with no CORS, which the
// browser blocks - the client then reports a misleading "network error" instead
// of the real cause. That exact trap cost us a debugging cycle.
//
// Deploy:  supabase functions deploy broadcast-email --no-verify-jwt
// Secrets: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, APP_URL
import { createClient } from 'npm:@supabase/supabase-js@2'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'
import * as jose from 'npm:jose@5'
import { renderEmail, textToHtml } from '../_shared/emailTemplate.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const admin = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

const SMTP_HOST = Deno.env.get('SMTP_HOST')
const SMTP_PORT = Number(Deno.env.get('SMTP_PORT') ?? '465')
const SMTP_USER = Deno.env.get('SMTP_USER')
const SMTP_PASS = Deno.env.get('SMTP_PASS')
const MAIL_FROM = Deno.env.get('MAIL_FROM') ?? 'Tryp.com <no-reply@tryp.com>'
// Every button in every email points at the Creator Program app, never tryp.com.
const APP_URL = Deno.env.get('APP_URL') ?? 'https://trypcreators.vercel.app'

const JWKS = jose.createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// One message, one fresh connection. NOT pooled: denomailer's pooled client was
// the likely source of a hard crash, and at this volume the extra TLS handshake
// costs nothing. NOTE: close() returns void, not a promise - calling .catch()
// on it throws "Cannot read properties of undefined".
async function sendOne(to: string, subject: string, html: string) {
  const client = new SMTPClient({
    connection: {
      hostname: SMTP_HOST!, port: SMTP_PORT, tls: SMTP_PORT === 465,
      auth: { username: SMTP_USER!, password: SMTP_PASS! },
    },
  })
  try {
    await client.send({ from: MAIL_FROM, to, subject, html, content: 'text/html' })
  } finally {
    try { await client.close() } catch { /* already closed */ }
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  try {
    // ---- Verify the caller is a real, signed-in admin ---------------------
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

    const { subject, body, ctaLabel, ctaPath, test, testTo, action } =
      await req.json().catch(() => ({} as Record<string, unknown>))
    if (!subject || !body) return json({ error: 'A subject and a message are both required.' }, 400)

    // Callers pass a PATH only, so an email can never be pointed off-platform.
    const path = typeof ctaPath === 'string' && ctaPath.startsWith('/') ? ctaPath : '/home'
    const html = renderEmail({
      title: String(subject),
      bodyHtml: textToHtml(String(body)),
      ctaLabel: ctaLabel ? String(ctaLabel) : 'Open the Creator Program',
      ctaUrl: `${APP_URL}${path}`,
      footerNote: 'You are receiving this because you are part of the Tryp.com Content Creator Program.',
      appUrl: APP_URL,
    })

    // Preview is handled BEFORE the SMTP check so templates can be designed
    // even before mail credentials exist.
    if (action === 'preview') return json({ html })

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      return json({
        error: 'Email sending is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM as SEPARATE secrets on this function.',
      }, 503)
    }

    // ---- Recipients --------------------------------------------------------
    let recipients: { id: string | null; email: string }[] = []
    if (test) {
      if (typeof testTo === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testTo)) {
        recipients = [{ id: null, email: testTo }]
      } else {
        const { data: u } = await admin.auth.admin.getUserById(callerId)
        if (u?.user?.email) recipients = [{ id: callerId, email: u.user.email }]
      }
    } else {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, email_prefs')
        .eq('status', 'active').eq('is_admin', false).eq('is_test', false)
        .is('deletion_requested_at', null)
      const wanted = (profiles ?? []).filter((p) => (p.email_prefs as Record<string, boolean> | null)?.announcement !== false)
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
      const byId = new Map((list?.users ?? []).map((u) => [u.id, u.email]))
      recipients = wanted.map((p) => ({ id: p.id, email: byId.get(p.id) ?? '' })).filter((r) => !!r.email)
    }
    if (recipients.length === 0) return json({ error: 'No recipients to send to.' }, 400)

    let campaignId: string | null = null
    if (!test) {
      const { data: camp } = await admin.from('email_campaigns')
        .insert({ subject, body, recipient_count: recipients.length, sent_by: callerId })
        .select('id').single()
      campaignId = camp?.id ?? null
    }

    let sent = 0
    const failures: { email: string; error: string }[] = []
    const rows: Record<string, unknown>[] = []

    for (const r of recipients) {
      try {
        await sendOne(r.email, String(subject), html)
        sent++
        rows.push({ kind: 'broadcast', recipient_id: r.id, campaign_id: campaignId, subject, status: 'sent' })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        failures.push({ email: r.email, error: msg })
        rows.push({ kind: 'broadcast', recipient_id: r.id, campaign_id: campaignId, subject, status: 'failed', error: msg })
      }
    }
    if (rows.length) await admin.from('email_send_log').insert(rows)

    // Surface the real SMTP error so the UI never has to guess.
    if (sent === 0 && failures.length) {
      return json({ error: `Could not send: ${failures[0].error}`, sent, failed: failures.length, total: recipients.length, failures }, 502)
    }
    return json({ sent, failed: failures.length, total: recipients.length, failures: failures.slice(0, 5), test: !!test })
  } catch (e) {
    // Never let an exception escape without CORS headers.
    return json({ error: `Server error: ${e instanceof Error ? e.message : String(e)}` }, 500)
  }
})
