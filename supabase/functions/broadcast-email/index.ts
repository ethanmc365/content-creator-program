// Supabase Edge Function: broadcast-email
//
// Sends an admin-composed email to every active creator, straight from the
// platform (no more "compose in Gmail"). Each recipient gets their OWN message
// (never a giant BCC), which is what keeps deliverability healthy and lets us
// log per-recipient success/failure.
//
// Auth: the caller's JWT is verified against the project JWKS, then re-checked
// against profiles.is_admin. A non-admin can never invoke this.
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
const APP_URL = Deno.env.get('APP_URL') ?? 'https://trypcreators.vercel.app'

const JWKS = jose.createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  if (req.method !== 'POST') return json({ error: 'POST only' }, 405)

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return json({ error: 'Email sending is not configured yet. Set the SMTP secrets on this function.' }, 503)
  }

  // ---- Verify the caller is a real, signed-in admin -----------------------
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

  // ---- Payload -------------------------------------------------------------
  const { subject, body, ctaLabel, ctaUrl, test } = await req.json().catch(() => ({} as Record<string, unknown>))
  if (!subject || !body) return json({ error: 'A subject and a message are both required.' }, 400)

  // ---- Recipients ----------------------------------------------------------
  // Active, non-admin, non-test creators who have not opted out of announcement
  // email. `test: true` sends only to the requesting admin, for a safe preview.
  let recipients: { id: string; email: string }[] = []
  if (test) {
    const { data: u } = await admin.auth.admin.getUserById(callerId)
    if (u?.user?.email) recipients = [{ id: callerId, email: u.user.email }]
  } else {
    const { data: profiles } = await admin
      .from('profiles')
      .select('id, email_prefs')
      .eq('status', 'active').eq('is_admin', false).eq('is_test', false)
      .is('deletion_requested_at', null)
    const wanted = (profiles ?? []).filter((p) => (p.email_prefs as Record<string, boolean> | null)?.announcement !== false)
    // Resolve addresses from auth (profiles never stores the email).
    const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
    const byId = new Map((list?.users ?? []).map((u) => [u.id, u.email]))
    recipients = wanted
      .map((p) => ({ id: p.id, email: byId.get(p.id) ?? '' }))
      .filter((r) => !!r.email)
  }
  if (recipients.length === 0) return json({ error: 'No recipients to send to.' }, 400)

  // ---- Log the campaign ----------------------------------------------------
  let campaignId: string | null = null
  if (!test) {
    const { data: camp } = await admin.from('email_campaigns')
      .insert({ subject, body, recipient_count: recipients.length, sent_by: callerId })
      .select('id').single()
    campaignId = camp?.id ?? null
  }

  // ---- Send, one message per recipient ------------------------------------
  const html = renderEmail({
    title: String(subject),
    bodyHtml: textToHtml(String(body)),
    ctaLabel: ctaLabel ? String(ctaLabel) : undefined,
    ctaUrl: ctaUrl ? String(ctaUrl) : undefined,
    footerNote: 'You are receiving this because you are part of the Tryp.com Content Creator Program.',
    appUrl: APP_URL,
  })

  const client = new SMTPClient({
    connection: {
      hostname: SMTP_HOST, port: SMTP_PORT, tls: SMTP_PORT === 465,
      auth: { username: SMTP_USER, password: SMTP_PASS },
    },
    pool: { size: 2, timeout: 60000 },
  })

  let sent = 0
  const failures: { email: string; error: string }[] = []
  const rows: Record<string, unknown>[] = []

  for (const r of recipients) {
    try {
      await client.send({ from: MAIL_FROM, to: r.email, subject: String(subject), html, content: 'text/html' })
      sent++
      rows.push({ kind: 'broadcast', recipient_id: r.id, campaign_id: campaignId, subject, status: 'sent' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      failures.push({ email: r.email, error: msg })
      rows.push({ kind: 'broadcast', recipient_id: r.id, campaign_id: campaignId, subject, status: 'failed', error: msg })
    }
  }
  await client.close().catch(() => {})
  if (rows.length) await admin.from('email_send_log').insert(rows)

  return json({ sent, failed: failures.length, total: recipients.length, failures: failures.slice(0, 5), test: !!test })
})
