// Supabase Edge Function: send-invoice
// Admin-only. Emails a prize invoice PDF (built client-side) via Resend,
// CCs the admin for their records, records the invoice in public.invoices,
// and notifies the winning creator that payment is on its way (the
// notifications insert fans out to push/email via notify-dispatch).
//
// Deploy:  supabase functions deploy send-invoice --no-verify-jwt
// Secrets: RESEND_API_KEY (already set project-wide for notify-dispatch).
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const APP_URL = Deno.env.get('APP_URL') ?? 'https://trypcreators.vercel.app'

const admin = createClient(SUPABASE_URL, SERVICE_ROLE)

// Signature-level JWT verification (same rationale as the upload fn: a global
// sign-out elsewhere kills the auth.sessions row while this device's token
// stays valid, so auth.getUser() would 401 spuriously).
const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/.well-known/jwks.json`))
async function verifyUser(jwt: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(jwt, JWKS, {
      issuer: `${SUPABASE_URL}/auth/v1`,
      audience: 'authenticated',
    })
    return payload.sub ? String(payload.sub) : null
  } catch {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
        headers: { apikey: ANON, Authorization: `Bearer ${jwt}` },
      })
      if (!res.ok) return null
      const user = await res.json()
      return user?.id ?? null
    } catch {
      return null
    }
  }
}

const PRIMARY_ORIGIN = 'https://trypcreators.vercel.app'
function allowOrigin(origin: string | null): string {
  if (!origin) return PRIMARY_ORIGIN
  try {
    const { hostname, protocol } = new URL(origin)
    const ok =
      (protocol === 'https:' && (hostname === 'trypcreators.vercel.app' || hostname === 'content-creator-program.vercel.app' || hostname.endsWith('.vercel.app'))) ||
      ((protocol === 'http:' || protocol === 'https:') && (hostname === 'localhost' || hostname === '127.0.0.1'))
    return ok ? origin : PRIMARY_ORIGIN
  } catch {
    return PRIMARY_ORIGIN
  }
}
function corsHeaders(req: Request) {
  return {
    'Access-Control-Allow-Origin': allowOrigin(req.headers.get('origin')),
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
  }
}
const json = (req: Request, obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function money(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount || 0)
}

function esc(s: string) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'method not allowed' }, 405)
  if (!RESEND_API_KEY) return json(req, { error: 'email is not configured on the server' }, 500)

  // 1) Caller must be a signed-in admin.
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!jwt) return json(req, { error: 'missing token' }, 401)
  const uid = await verifyUser(jwt)
  if (!uid) return json(req, { error: 'invalid token' }, 401)
  const { data: caller } = await admin.from('profiles').select('is_admin').eq('id', uid).single()
  if (!caller?.is_admin) return json(req, { error: 'admins only' }, 403)

  // 2) Validate the payload. channel 'resend' emails the PDF from the
  // platform; 'gmail' only records + notifies (the admin sent it themselves).
  const body = await req.json().catch(() => null)
  if (!body) return json(req, { error: 'bad request' }, 400)
  const {
    channel = 'resend', number, creatorId, creatorName, amount, currency, description,
    issueDate, billTo, notes, payment, to, cc, filename, pdfBase64,
  } = body

  if (channel !== 'resend' && channel !== 'gmail') return json(req, { error: 'bad channel' }, 400)
  if (!Number.isInteger(number) || number < 1) return json(req, { error: 'missing invoice number' }, 400)
  if (!creatorName || typeof creatorName !== 'string') return json(req, { error: 'missing creator name' }, 400)
  if (!(Number(amount) > 0)) return json(req, { error: 'missing amount' }, 400)
  if (currency !== 'GBP' && currency !== 'EUR') return json(req, { error: 'currency must be GBP or EUR' }, 400)
  if (!description || typeof description !== 'string') return json(req, { error: 'missing description' }, 400)
  if (typeof to !== 'string' || !EMAIL_RE.test(to.trim())) return json(req, { error: 'invalid recipient email' }, 400)
  if (cc && (typeof cc !== 'string' || !EMAIL_RE.test(cc.trim()))) return json(req, { error: 'invalid cc email' }, 400)
  if (channel === 'resend') {
    if (typeof pdfBase64 !== 'string' || pdfBase64.length < 100) return json(req, { error: 'missing invoice PDF' }, 400)
    if (pdfBase64.length > 4_000_000) return json(req, { error: 'invoice PDF too large' }, 400)
  }

  const ref = `Tryp.com ${String(number).padStart(3, '0')}`
  const amountStr = money(Number(amount), currency)

  // Replies should go to the admin who sent it, not the platform.
  const { data: sender } = await admin.auth.admin.getUserById(uid)
  const replyTo = sender?.user?.email

  // 3) Send the email with the PDF attached (platform channel only).
  const ccList = cc?.trim() ? [cc.trim()] : []
  const emailRes = channel === 'gmail' ? null : await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'Tryp.com <onboarding@resend.dev>',
      to: to.trim(),
      ...(ccList.length ? { cc: ccList } : {}),
      ...(replyTo ? { reply_to: replyTo } : {}),
      subject: `Invoice ${ref} · ${creatorName} · ${amountStr}`,
      html: `<div style="font-family:Poppins,Helvetica,Arial,sans-serif;color:#1a1a1a;max-width:520px;margin:0 auto;padding:8px 0">
        <img src="${APP_URL}/brand/tryp-logo.png" alt="Tryp.com" width="128" style="display:block;border-radius:14px;margin:0 0 22px" />
        <p style="margin:0;font-size:18px;font-weight:700">Invoice ${ref}</p>
        <p style="margin:4px 0 22px;font-size:13px;color:#6b7280">Content Creator Program · prize payment</p>
        <div style="border:1px solid #f0f0f0;border-radius:14px;padding:6px 24px;margin-bottom:22px">
          <table style="border-collapse:collapse;font-size:14px;width:100%">
            <tr><td style="padding:12px 16px 12px 0;color:#6b7280;white-space:nowrap;border-bottom:1px solid #f7f7f8">Creator</td><td style="padding:12px 0;font-weight:600;border-bottom:1px solid #f7f7f8">${esc(creatorName)}</td></tr>
            <tr><td style="padding:12px 16px 12px 0;color:#6b7280;white-space:nowrap;border-bottom:1px solid #f7f7f8">Prize</td><td style="padding:12px 0;border-bottom:1px solid #f7f7f8">${esc(description)}</td></tr>
            <tr><td style="padding:12px 16px 12px 0;color:#6b7280;white-space:nowrap;border-bottom:1px solid #f7f7f8">Amount</td><td style="padding:12px 0;font-weight:700;color:#d94407;border-bottom:1px solid #f7f7f8">${amountStr}</td></tr>
            <tr><td style="padding:12px 16px 12px 0;color:#6b7280;white-space:nowrap">Payment due</td><td style="padding:12px 0">Within 7 days</td></tr>
          </table>
        </div>
        <p style="margin:0 0 22px;font-size:14px;line-height:1.6">The invoice is attached as a PDF, with ${esc(creatorName)}'s bank details on it.</p>
        <p style="margin:0;padding-top:16px;border-top:1px solid #f0f0f0;font-size:12px;color:#9ca3af">Sent from the Tryp.com Content Creator Program platform. Replies go to ${esc(replyTo ?? 'the Tryp.com team')}.</p>
      </div>`,
      attachments: [{ filename: filename || `${ref}.pdf`, content: pdfBase64 }],
    }),
  })
  if (emailRes && !emailRes.ok) {
    const err = await emailRes.json().catch(() => ({}))
    return json(req, { error: `Email failed: ${err?.message || emailRes.statusText}` }, 502)
  }

  // 4) Record the invoice (after the send, so history = what actually went out).
  const { data: row, error: insErr } = await admin.from('invoices').insert({
    number,
    creator_id: creatorId || null,
    creator_name: creatorName,
    amount: Number(amount),
    currency,
    description,
    issue_date: issueDate || new Date().toISOString().slice(0, 10),
    bill_to: billTo || '',
    payment: payment || {},
    notes: notes || null,
    sent_to: to.trim(),
    cc: cc?.trim() || null,
    status: 'sent',
    sent_at: new Date().toISOString(),
    created_by: uid,
  }).select('id').single()

  // 5) Tell the winner their money is on the way (best-effort).
  if (creatorId) {
    await admin.from('notifications').insert({
      recipient_id: creatorId,
      type: 'reward',
      title: 'Your prize money is on the way',
      body: `We've sent the invoice for ${description} (${amountStr}). The payment should reach your account within the next 7 days.`,
      link: '/rewards',
    })
  }

  return json(req, { ok: true, id: row?.id ?? null, warning: insErr ? `sent, but not recorded: ${insErr.message}` : undefined })
})
