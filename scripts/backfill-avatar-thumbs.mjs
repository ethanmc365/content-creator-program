// One-off (30 Sep 2026): give every existing avatar its 192px thumbnail sibling (`t-<stamp>.jpg`), so the app
// can stop calling Supabase's billed image-transform endpoint (see src/lib/avatarUrl.js). New uploads write their
// own thumbnail; this only fills in the ones uploaded before. Safe to re-run (upserts).
//
//   SUPABASE_SERVICE_KEY is read from .env.qa (gitignored). Needs macOS `sips` for the resize.
//   node scripts/backfill-avatar-thumbs.mjs [--dry]
import { readFileSync, writeFileSync, mkdtempSync, readFileSync as rf } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const REF = 'heuhqqoxyggawuckxocp'
const BASE = `https://${REF}.supabase.co`
const key = readFileSync(new URL('../.env.qa', import.meta.url), 'utf8').match(/SUPABASE_SERVICE_KEY=(.+)/)[1].trim()
const H = { apikey: key, Authorization: `Bearer ${key}` }
const dry = process.argv.includes('--dry')
const AVATAR = /\/storage\/v1\/object\/public\/avatars\/([^/?#]+)\/avatar-(\d+)\.[a-z0-9]+$/i

const rows = await fetch(`${BASE}/rest/v1/profiles?select=photo_url&photo_url=not.is.null`, { headers: H }).then((r) => r.json())
const urls = [...new Set(rows.map((r) => r.photo_url).filter((u) => typeof u === 'string' && AVATAR.test(u)))]
console.log(`${urls.length} avatars to check`)
const tmp = mkdtempSync(join(tmpdir(), 'thumbs-'))
let made = 0, skipped = 0, failed = 0
for (const url of urls) {
  const [, uid, stamp] = url.match(AVATAR)
  const target = `${uid}/t-${stamp}.jpg`
  try {
    const head = await fetch(`${BASE}/storage/v1/object/public/avatars/${target}`, { method: 'HEAD' })
    if (head.ok) { skipped++; continue }
    if (dry) { made++; continue }
    const src = join(tmp, `${stamp}-src`)
    const out = join(tmp, `${stamp}.jpg`)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`download ${res.status}`)
    writeFileSync(src, Buffer.from(await res.arrayBuffer()))
    // -z h w with a crop to a centred square first: sips --cropToHeightWidth crops from the centre.
    const info = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', src]).toString()
    const w = +info.match(/pixelWidth: (\d+)/)[1], h = +info.match(/pixelHeight: (\d+)/)[1]
    const side = Math.min(w, h)
    execFileSync('sips', ['--cropToHeightWidth', String(side), String(side), src, '-s', 'format', 'jpeg', '-s', 'formatOptions', '85', '--out', out], { stdio: 'ignore' })
    execFileSync('sips', ['-Z', '192', out], { stdio: 'ignore' })
    const up = await fetch(`${BASE}/storage/v1/object/avatars/${target}`, {
      method: 'POST', headers: { ...H, 'Content-Type': 'image/jpeg', 'x-upsert': 'true', 'cache-control': 'max-age=31536000' }, body: rf(out),
    })
    if (!up.ok) throw new Error(`upload ${up.status} ${await up.text()}`)
    made++
  } catch (e) { failed++; console.log('FAILED', url, e.message) }
}
console.log({ made, skipped, failed, dry })
