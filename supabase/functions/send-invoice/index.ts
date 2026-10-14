// Supabase Edge Function: send-invoice
// Admin-only. Records that an APPROVED prize invoice has been sent - the admin emails the PDF themselves, from their own
// mailbox - and notifies the winning creator that payment is on its way.
//
// 14 Oct 2026: the platform never sent mail of its own (Resend was set up and never used), so the Resend path is gone:
// no API key, no attachment, no third party. Deploy: supabase functions deploy send-invoice --no-verify-jwt
import { createClient } from 'npm:@supabase/supabase-js@2'
import { createRemoteJWKSet, jwtVerify } from 'npm:jose@5'
import { corsHeaders } from '../_shared/cors.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ANON = Deno.env.get('SUPABASE_ANON_KEY')!

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

// CORS COMES FROM THE SHARED MODULE (17 Sep 2026).
//
// This function was missed by the sweep that fixed the other four, because that
// sweep worked from a list of the functions a BROWSER calls most and this one
// was not on it. Its own copy still read `hostname.endsWith('.vercel.app')`,
// and anybody can deploy a site to Vercel, so every Vercel origin on the
// internet was reflected back - measured against the live function, not read:
// a preflight from `https://trypcreators-evil.vercel.app` came back naming
// itself.
//
// Severity, honestly, and say this if it is ever reported: hygiene, not an
// exploitable hole. The call authenticates on an explicit Authorization header
// and no cookie rides along, so a hostile page cannot borrow an admin's session
// - it can only reach this with the publishable key that already ships in the
// bundle, which it could do from curl. CORS is not the boundary here. It should
// still be tight, and this is the last function that draws money's attention.
//
// `corsHeaders` is imported at the top of the file with the other imports.
const json = (req: Request, obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders(req), 'Content-Type': 'application/json' } })

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

// SEVERAL RECIPIENTS, WHICH THE CLIENT HAS OFFERED FOR A WHILE AND THIS NEVER
// ACCEPTED. The composer lets an admin type "andre@tryp.com, francesco@tryp.com"
// and joins them with ", " - and the check here was `EMAIL_RE.test(to.trim())`
// against the WHOLE string, so any second address failed as "invalid recipient
// email". The addresses were fine; the validator was reading a list as one
// address. Same for cc.
function parseEmails(raw: unknown): string[] {
  return String(raw ?? '')
    .split(/[,;\n]+/)
    .map((e) => e.trim())
    .filter(Boolean)
}

function money(amount: number, currency: string) {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(amount || 0)
}


Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(req) })
  if (req.method !== 'POST') return json(req, { error: 'method not allowed' }, 405)

  // 1) Caller must be a signed-in admin.
  const jwt = (req.headers.get('Authorization') ?? '').replace('Bearer ', '')
  if (!jwt) return json(req, { error: 'missing token' }, 401)
  const uid = await verifyUser(jwt)
  if (!uid) return json(req, { error: 'invalid token' }, 401)
  const { data: caller } = await admin.from('profiles').select('is_admin').eq('id', uid).single()
  if (!caller?.is_admin) return json(req, { error: 'admins only' }, 403)

  // 2) Validate the payload. The only channel is 'gmail': the admin sent it themselves; this records and notifies.
  const body = await req.json().catch(() => null)
  if (!body) return json(req, { error: 'bad request' }, 400)
  const {
    channel = 'gmail', invoiceId, number, creatorId, creatorName, amount, currency, description,
    issueDate, billTo, notes, payment, to, cc,
  } = body

  if (channel !== 'gmail') return json(req, { error: 'bad channel' }, 400)
  if (!Number.isInteger(number) || number < 1) return json(req, { error: 'missing invoice number' }, 400)
  if (!creatorName || typeof creatorName !== 'string') return json(req, { error: 'missing creator name' }, 400)
  if (!(Number(amount) > 0)) return json(req, { error: 'missing amount' }, 400)
  if (currency !== 'GBP' && currency !== 'EUR') return json(req, { error: 'currency must be GBP or EUR' }, 400)
  if (!description || typeof description !== 'string') return json(req, { error: 'missing description' }, 400)
  const toList = parseEmails(to)
  const ccList = parseEmails(cc)
  if (toList.length === 0) return json(req, { error: 'no recipient email' }, 400)
  const badTo = toList.filter((e) => !EMAIL_RE.test(e))
  if (badTo.length) return json(req, { error: `these addresses do not look right: ${badTo.join(', ')}` }, 400)
  const badCc = ccList.filter((e) => !EMAIL_RE.test(e))
  if (badCc.length) return json(req, { error: `these CC addresses do not look right: ${badCc.join(', ')}` }, 400)

  // 2b) THE APPROVAL GATE, ENFORCED HERE AND NOT ONLY IN THE UI.
  //
  // The queue exists so money does not leave on one person's say-so. A rule
  // that lives only in the React app is a rule anybody with a fetch call can
  // skip, and this function has the service role - it is the last place that
  // can actually say no. An invoice must exist, and it must be approved.
  let existing: { id: string; stage: string; number: number } | null = null
  if (invoiceId) {
    const { data } = await admin.from('invoices').select('id, stage, number').eq('id', invoiceId).single()
    if (!data) return json(req, { error: 'that invoice no longer exists' }, 404)
    existing = data
    if (data.stage !== 'approved') {
      return json(req, { error: `that invoice is "${data.stage}", not approved - it cannot be sent yet` }, 409)
    }
  } else {
    return json(req, { error: 'invoices are sent from the approval queue' }, 400)
  }

  const amountStr = money(Number(amount), currency)

  // 4) Record what actually went out, ON THE ROW THAT WAS APPROVED.
  //
  // This used to INSERT. That was right when an invoice came into being at the
  // moment it was emailed; now the row already exists - it was drafted when the
  // prize was awarded and approved by a second admin - so inserting would mint
  // a duplicate and leave the approved one sitting in the queue forever.
  const { data: row, error: insErr } = await admin.from('invoices').update({
    creator_id: creatorId || null,
    creator_name: creatorName,
    amount: Number(amount),
    currency,
    description,
    issue_date: issueDate || new Date().toISOString().slice(0, 10),
    bill_to: billTo || '',
    payment: payment || {},
    notes: notes || null,
    sent_to: toList.join(', '),
    cc: ccList.length ? ccList.join(', ') : null,
    stage: 'sent',
    status: 'sent',
    sent_at: new Date().toISOString(),
  }).eq('id', existing.id).select('id').single()

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
