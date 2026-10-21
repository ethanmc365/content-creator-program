// UPLOAD A STORAGE BACKUP INTO A (NEW) PROJECT: the other half of backup-storage.mjs, for the move.
//
// Reads <from>/manifest.json and uploads every file to the same bucket and path on the TARGET project, with the
// content type recorded at backup time. Files already there are skipped (409), so an interrupted run can simply be
// started again, and running it twice uploads nothing new.
//
// The target is given EXPLICITLY on the command line, never read from .env, so it cannot write to the live project
// by accident. It refuses to write to the project the backup came from.
//
//   TARGET_URL=https://<new-host> TARGET_SERVICE_KEY=... node scripts/restore-storage.mjs --from ~/TrypBackups/storage-... --dry
//   TARGET_URL=https://<new-host> TARGET_SERVICE_KEY=... node scripts/restore-storage.mjs --from ~/TrypBackups/storage-...
//
// The buckets must exist on the target first, with the same settings (public/private, size limits, types): create
// them from supabase/schema/platform.sql. --dry checks that they do and counts what would be uploaded.
// After the upload, rewrite the stored addresses with scripts/rewrite-storage-urls.sql.
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null }
const FROM = resolve(flag('--from') || 'storage-backup')
const DRY = args.includes('--dry')
const TARGET = (process.env.TARGET_URL || '').replace(/\/+$/, '')
const KEY = process.env.TARGET_SERVICE_KEY || ''
const CONCURRENCY = 6

if (!TARGET || !KEY) { console.error('Set TARGET_URL and TARGET_SERVICE_KEY (the NEW project).'); process.exit(1) }
const manifestPath = join(FROM, 'manifest.json')
if (!existsSync(manifestPath)) { console.error(`No manifest at ${manifestPath}. Run backup-storage.mjs first.`); process.exit(1) }
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))
if (manifest.source && manifest.source.replace(/\/+$/, '') === TARGET) {
  console.error(`Refusing: the target is the project this backup was taken from (${TARGET}).`); process.exit(1)
}

const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }
async function api(path, init = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${TARGET}/storage/v1${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } })
    if (res.ok || res.status === 409) return res
    // Storage answers a duplicate with 400 + "Duplicate" on some versions instead of 409.
    const text = await res.text()
    if (res.status === 400 && /duplicate|already exists/i.test(text)) return { status: 409 }
    if (attempt >= 4 || (res.status < 500 && res.status !== 429)) throw new Error(`${init.method || 'GET'} ${path}: ${res.status} ${text}`)
    await new Promise((r) => setTimeout(r, 1000 * attempt))
  }
}

const objects = manifest.objects || []
const wanted = [...new Set(objects.map((o) => o.bucket))]
const existing = new Set((await (await api('/bucket')).json()).map((b) => b.id))
const missing = wanted.filter((b) => !existing.has(b))
if (missing.length) { console.error(`Create these buckets on the target first (see platform.sql): ${missing.join(', ')}`); process.exit(1) }

const bytes = objects.reduce((s, o) => s + (o.size || 0), 0)
console.log(`${objects.length} files, ${(bytes / 1048576).toFixed(1)} MB in ${wanted.length} buckets, backup taken ${manifest.taken_at} from ${manifest.source}`)
if (DRY) {
  const absent = objects.filter((o) => !existsSync(join(FROM, o.bucket, o.path)))
  console.log(`Dry run: target ${TARGET} has every bucket. ${absent.length} files listed in the manifest are missing from the folder.`)
  process.exit(absent.length ? 1 : 0)
}

const tally = { uploaded: 0, skipped: 0, failed: 0 }
let next = 0
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < objects.length) {
    const o = objects[next++]
    try {
      const body = readFileSync(join(FROM, o.bucket, o.path))
      const path = o.path.split('/').map(encodeURIComponent).join('/')
      const res = await api(`/object/${o.bucket}/${path}`, {
        method: 'POST',
        headers: { 'Content-Type': o.mimetype || 'application/octet-stream', 'x-upsert': 'false', 'cache-control': '3600' },
        body,
      })
      tally[res.status === 409 ? 'skipped' : 'uploaded']++
    } catch (e) { tally.failed++; console.error(`  failed ${o.bucket}/${o.path}: ${e.message}`) }
  }
}))
console.log(`uploaded ${tally.uploaded}, already there ${tally.skipped}, failed ${tally.failed}.`)
if (tally.failed) process.exitCode = 1
