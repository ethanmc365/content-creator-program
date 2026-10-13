#!/usr/bin/env node
// BACK UP EVERY STORAGE BUCKET TO A LOCAL FOLDER (audit H9).
//
// The database has a nightly dump (.github/workflows/backup.yml); uploaded files did not. This copies every object
// of every bucket (public and private) into <out>/<bucket>/<path>, using the Storage REST API with the service key.
//
// READ-ONLY ON THE SOURCE: it only lists and downloads. Nothing is written, moved or deleted in Supabase.
// RESUMABLE: a file already on disk with the size the bucket reports is skipped, and every download is written to
// a .part file and renamed when complete, so an interrupted run can simply be started again.
// It writes <out>/manifest.json (bucket, path, size, updated_at, mimetype) so a restore or an audit can check it.
//
//   node scripts/backup-storage.mjs                      # into ./storage-backup
//   node scripts/backup-storage.mjs --out /Volumes/x/b   # somewhere else
//   node scripts/backup-storage.mjs --bucket gallery     # one bucket
//   node scripts/backup-storage.mjs --dry                # list and count only
//
// Credentials as the other scripts: VITE_SUPABASE_URL from .env, SUPABASE_SERVICE_KEY from .env.qa (or the
// environment). The folder holds personal data (photos, private DM media): keep it on encrypted storage that Tryp
// owns, never in the repository (storage-backup/ is git-ignored).
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { SERVICE_KEY, SUPABASE_URL } from './_env.mjs'

const args = process.argv.slice(2)
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null }
const OUT = resolve(flag('--out') || 'storage-backup')
const ONLY = flag('--bucket')
const DRY = args.includes('--dry')
const CONCURRENCY = 6
const headers = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` }

async function api(path, init = {}) {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${SUPABASE_URL}/storage/v1${path}`, { ...init, headers: { ...headers, ...(init.headers || {}) } })
    if (res.ok) return res
    if (attempt >= 4 || (res.status < 500 && res.status !== 429)) throw new Error(`${init.method || 'GET'} ${path}: ${res.status} ${await res.text()}`)
    await new Promise((r) => setTimeout(r, 1000 * attempt))
  }
}

// Storage lists one folder level at a time; folders come back with id null.
async function listAll(bucket, prefix = '') {
  const out = []
  for (let offset = 0; ; offset += 1000) {
    const res = await api(`/object/list/${bucket}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefix, limit: 1000, offset, sortBy: { column: 'name', order: 'asc' } }),
    })
    const rows = await res.json()
    for (const r of rows) {
      const path = prefix ? `${prefix}/${r.name}` : r.name
      if (r.id === null) out.push(...await listAll(bucket, path))
      else out.push({ bucket, path, size: r.metadata?.size ?? null, updated_at: r.updated_at, mimetype: r.metadata?.mimetype ?? null })
    }
    if (rows.length < 1000) return out
  }
}

async function download(o) {
  const dest = join(OUT, o.bucket, o.path)
  if (existsSync(dest) && (o.size == null || statSync(dest).size === o.size)) return 'skipped'
  mkdirSync(dirname(dest), { recursive: true })
  const res = await api(`/object/authenticated/${o.bucket}/${o.path.split('/').map(encodeURIComponent).join('/')}`)
  const part = `${dest}.part`
  await pipeline(Readable.fromWeb(res.body), createWriteStream(part))
  renameSync(part, dest)
  return 'downloaded'
}

const buckets = (await (await api('/bucket')).json()).filter((b) => !ONLY || b.id === ONLY)
const manifest = []
const tally = { downloaded: 0, skipped: 0, failed: 0, bytes: 0 }
for (const b of buckets) {
  const objects = await listAll(b.id)
  const bytes = objects.reduce((s, o) => s + (o.size || 0), 0)
  console.log(`${b.id}${b.public ? '' : ' (private)'}: ${objects.length} files, ${(bytes / 1048576).toFixed(1)} MB`)
  manifest.push(...objects)
  tally.bytes += bytes
  if (DRY) continue
  let next = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < objects.length) {
      const o = objects[next++]
      try { tally[await download(o)]++ } catch (e) { tally.failed++; console.error(`  failed ${o.bucket}/${o.path}: ${e.message}`) }
    }
  }))
}
mkdirSync(OUT, { recursive: true })
writeFileSync(join(OUT, 'manifest.json'), JSON.stringify({ taken_at: new Date().toISOString(), source: SUPABASE_URL, objects: manifest }, null, 1))
console.log(`${DRY ? 'Dry run: ' : ''}${manifest.length} files, ${(tally.bytes / 1048576).toFixed(1)} MB. downloaded ${tally.downloaded}, skipped ${tally.skipped}, failed ${tally.failed}. Manifest: ${join(OUT, 'manifest.json')}`)
if (tally.failed) process.exitCode = 1
