// Creates the eight DEMO creators that supabase/seeds/vip_demo.sql turns into a "VIP Demo" programme (30 Sep 2026).
// They are real auth users on @trypcreators.test addresses (the QA convention: nobody can receive mail there), marked
// is_test by the seed so they stay hidden from every list, count and payout except the VIP Demo programme.
//   node scripts/seed-vip-demo.mjs            create them
//   node scripts/seed-vip-demo.mjs --remove   delete them (and, through cascades, everything they own)
// SUPABASE_SERVICE_KEY comes from .env.qa (gitignored). Nothing is ever emailed and no password is kept.
import { readFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'

const BASE = 'https://heuhqqoxyggawuckxocp.supabase.co'
const key = readFileSync(new URL('../.env.qa', import.meta.url), 'utf8').match(/SUPABASE_SERVICE_KEY=(.+)/)[1].trim()
const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }
const NAMES = ['Lucía', 'Carlos', 'Marina', 'Pablo', 'Sofía', 'Iker', 'Elena', 'Daniel']
const remove = process.argv.includes('--remove')

const list = await fetch(`${BASE}/auth/v1/admin/users?per_page=1000`, { headers: H }).then((r) => r.json())
const existing = new Map((list.users || []).filter((u) => /^demo-vip-\d+@trypcreators\.test$/.test(u.email || '')).map((u) => [u.email, u.id]))

for (let i = 0; i < NAMES.length; i++) {
  const email = `demo-vip-${i + 1}@trypcreators.test`
  if (remove) {
    if (existing.has(email)) { await fetch(`${BASE}/auth/v1/admin/users/${existing.get(email)}`, { method: 'DELETE', headers: H }); console.log('deleted', email) }
    continue
  }
  if (existing.has(email)) { console.log('exists ', email); continue }
  const res = await fetch(`${BASE}/auth/v1/admin/users`, {
    method: 'POST', headers: H,
    body: JSON.stringify({ email, password: randomBytes(24).toString('base64url'), email_confirm: true, user_metadata: { name: `${NAMES[i]} Demo` } }),
  })
  console.log(res.ok ? 'created' : `FAILED ${res.status} ${await res.text()}`, email)
}
