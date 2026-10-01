// Creates the sandbox VIP the team previews the creator-facing VIP pages with (1 Oct 2026): a hidden test account on
// an @trypcreators.test address (nobody can receive mail there), like the sandbox creator. Run once:
//   node scripts/seed-qa-vip.mjs
// Migration 305 then makes it a VIP in Spain and lets the `impersonate` function open it (target "vip").
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
const BASE = 'https://heuhqqoxyggawuckxocp.supabase.co'
const key = readFileSync(new URL('../.env.qa', import.meta.url), 'utf8').match(/SUPABASE_SERVICE_KEY=(.+)/)[1].trim()
const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
const email = 'qa-vip@trypcreators.test'
const list = await fetch(`${BASE}/auth/v1/admin/users?per_page=1000`, { headers: H }).then((r) => r.json())
const have = (list.users || []).find((u) => u.email === email)
if (have) { console.log('exists', have.id) } else {
  const res = await fetch(`${BASE}/auth/v1/admin/users`, { method: 'POST', headers: H, body: JSON.stringify({ email, password: randomBytes(24).toString('base64url'), email_confirm: true, user_metadata: { name: 'Test VIP Account' } }) })
  const j = await res.json()
  console.log(res.ok ? `created ${j.id}` : `FAILED ${res.status} ${JSON.stringify(j)}`)
}
