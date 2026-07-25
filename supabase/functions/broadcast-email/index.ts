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

const JWKS = jose.createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

// Where an unsubscribe request or a reply actually lands.
const REPLY_TO = Deno.env.get('REPLY_TO') ?? MAIL_FROM.match(/<([^>]+)>/)?.[1] ?? MAIL_FROM
// Gap between messages. Sending 40 near-identical messages back to back is what
// providers read as a spam run; spacing them out is the cheapest mitigation
// available while we still send through a shared mailbox.
const SEND_GAP_MS = Number(Deno.env.get('SEND_GAP_MS') ?? '800')
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Providers reject bulk-looking mail with a 550 5.7.x "blocked"/"unsolicited"
// response. That is a reputation problem, not a config problem, so it is worth
// telling apart from a plain auth or connection failure in the UI.
function isBulkBlock(msg: string) {
  return /5\.7\.\d|blocked|unsolicited|bulk|spam|reputation/i.test(msg)
}

// One message, one fresh connection. NOT pooled: denomailer's pooled client was
// the likely source of a hard crash, and at this volume the extra TLS handshake
// costs nothing. NOTE: close() returns void, not a promise - calling .catch()
// on it throws "Cannot read properties of undefined".
//
// Both a text and an HTML part are always sent. The previous version passed
// `content: 'text/html'`, which denomailer treats as the plain-text BODY - so
// every message shipped a text part reading literally "text/html". HTML-only
// (or nonsense-text) mail is a spam signal in its own right.
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
      // RFC 2369. A real, working unsubscribe route is one of the strongest
      // "this is not spam" signals a sender can give. Deliberately NOT
      // advertising One-Click (List-Unsubscribe-Post): that promises a POST
      // endpoint that actually unsubscribes, and we do not have one yet.
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

    const { subject, body, ctaLabel, ctaPath, test, testTo, action, outboxId, type } =
      await req.json().catch(() => ({} as Record<string, unknown>))
    if (!subject || !body) return json({ error: 'A subject and a message are both required.' }, 400)

    // Callers pass a PATH only, so an email can never be pointed off-platform.
    const path = typeof ctaPath === 'string' && ctaPath.startsWith('/') ? ctaPath : '/home'
    // {{name}} is resolved PER RECIPIENT further down; for the preview and for
    // the shared shell we use a friendly stand-in.
    const FOOTER = 'You are receiving this because you are part of the Tryp.com Content Creator Program.'
    const label = ctaLabel ? String(ctaLabel) : 'Open Tryp.com Content Creator Program'
    const buildHtml = (firstName: string) => renderEmail({
      title: String(subject).replaceAll('{{name}}', firstName),
      bodyHtml: textToHtml(String(body).replaceAll('{{name}}', firstName)),
      ctaLabel: label,
      ctaUrl: `${APP_URL}${path}`,
      footerNote: FOOTER,
      appUrl: APP_URL,
    })
    const buildText = (firstName: string) => renderText({
      title: String(subject).replaceAll('{{name}}', firstName),
      bodyText: String(body).replaceAll('{{name}}', firstName),
      ctaLabel: label,
      ctaUrl: `${APP_URL}${path}`,
      footerNote: FOOTER,
      appUrl: APP_URL,
    })

    // Preview is handled BEFORE the SMTP check so templates can be designed
    // even before mail credentials exist.
    if (action === 'preview') return json({ html: buildHtml(String(testTo || 'Alex').split('@')[0] || 'Alex') })

    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      return json({
        error: 'Email sending is not configured. Add SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS and MAIL_FROM as SEPARATE secrets on this function.',
      }, 503)
    }

    // ---- Recipients --------------------------------------------------------
    let recipients: { id: string | null; email: string; name: string }[] = []
    if (test) {
      if (typeof testTo === 'string' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(testTo)) {
        recipients = [{ id: null, email: testTo, name: 'Ethan' }]
      } else {
        const { data: u } = await admin.auth.admin.getUserById(callerId)
        const { data: me } = await admin.from('profiles').select('name').eq('id', callerId).maybeSingle()
        if (u?.user?.email) recipients = [{ id: callerId, email: u.user.email, name: (me?.name ?? '').split(' ')[0] || 'there' }]
      }
    } else {
      const { data: profiles } = await admin
        .from('profiles')
        .select('id, name, email_prefs')
        .eq('status', 'active').eq('is_admin', false).eq('is_test', false)
        .is('deletion_requested_at', null)
      // Honour the per-type preference for whatever kind of email this is.
      //
      // 'broadcast' is the admin composer: a direct message from the team to
      // the programme, not one of the automatic notification categories a
      // creator can switch off in Settings. It has no preference to honour, so
      // it goes to everyone active.
      const prefKey = typeof type === 'string' && type && type !== 'broadcast' ? type : null
      const wanted = prefKey
        ? (profiles ?? []).filter((p) => (p.email_prefs as Record<string, boolean> | null)?.[prefKey] !== false)
        : (profiles ?? [])
      const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 })
      const byId = new Map((list?.users ?? []).map((u) => [u.id, u.email]))
      recipients = wanted
        .map((p) => ({ id: p.id, email: byId.get(p.id) ?? '', name: (p.name ?? '').split(' ')[0] || 'there' }))
        .filter((r) => !!r.email)
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
    let blocked = 0
    const failures: { email: string; error: string }[] = []
    let rows: Record<string, unknown>[] = []

    // Flush the log as we go. A long run can hit the function's wall-clock
    // limit, and the previous version only wrote the log AFTER the loop - so a
    // timeout meant no record at all of what had already gone out.
    const flush = async () => {
      if (!rows.length) return
      const batch = rows
      rows = []
      await admin.from('email_send_log').insert(batch)
    }

    for (let i = 0; i < recipients.length; i++) {
      const r = recipients[i]
      try {
        await sendOne(
          r.email,
          String(subject).replaceAll('{{name}}', r.name),
          buildHtml(r.name),
          buildText(r.name),
        )
        sent++
        rows.push({ kind: 'broadcast', recipient_id: r.id, campaign_id: campaignId, subject, status: 'sent' })
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (isBulkBlock(msg)) blocked++
        failures.push({ email: r.email, error: msg })
        rows.push({ kind: 'broadcast', recipient_id: r.id, campaign_id: campaignId, subject, status: 'failed', error: msg })
      }
      if (rows.length >= 10) await flush()
      // Space the run out, but never pay for a gap after the last message.
      if (!test && SEND_GAP_MS > 0 && i < recipients.length - 1) await sleep(SEND_GAP_MS)
    }
    await flush()

    // Approving from the review queue closes that queue item out.
    if (!test && typeof outboxId === 'string') {
      await admin.from('email_outbox')
        .update({ status: 'sent', recipient_count: sent, decided_at: new Date().toISOString(), decided_by: callerId })
        .eq('id', outboxId)
    }

    // Surface the real SMTP error so the UI never has to guess.
    if (sent === 0 && failures.length) {
      const why = blocked
        ? `The mail provider blocked this as bulk mail: ${failures[0].error}`
        : `Could not send: ${failures[0].error}`
      return json({ error: why, sent, failed: failures.length, blocked, total: recipients.length, failures }, 502)
    }
    return json({ sent, failed: failures.length, blocked, total: recipients.length, failures: failures.slice(0, 5), test: !!test })
  } catch (e) {
    // Never let an exception escape without CORS headers.
    return json({ error: `Server error: ${e instanceof Error ? e.message : String(e)}` }, 500)
  }
})
