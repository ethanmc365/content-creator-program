// Forget every stored video frame so the app caches them again.
//
// WHY THIS EXISTS. `thumb-cache` (supabase/functions) copies a video's cover
// into the `video-thumbs` bucket and files the permanent URL on the row. It is
// deliberately a one-way street - a stored frame is never re-fetched, because
// it cannot expire - so when the RULE for what gets stored changes (the first
// run kept the platforms' full-size covers, averaging 236KB; they are resized
// to 720px now) there is nothing in the product that would ever notice.
//
// This clears both the column and the objects. The next time an admin opens a
// challenge board or the video tracker, every frame is resolved and stored
// again under the current rule. Nothing is lost that cannot be fetched again:
// the source of truth is the post on the platform.
//
// Usage:
//   node scripts/recache-thumbs.mjs            # report only
//   node scripts/recache-thumbs.mjs --clear    # actually clear
//
// Reads SUPABASE_SERVICE_KEY from the environment or from .env.qa, which is
// where this project keeps it and which is git-ignored.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function fromEnvFile(name, key) {
  try {
    const line = readFileSync(join(root, name), 'utf8')
      .split('\n').find((l) => l.startsWith(`${key}=`))
    return line ? line.slice(key.length + 1).trim() : null
  } catch { return null }
}

const URL_ = process.env.VITE_SUPABASE_URL || fromEnvFile('.env', 'VITE_SUPABASE_URL')
const KEY = process.env.SUPABASE_SERVICE_KEY || fromEnvFile('.env.qa', 'SUPABASE_SERVICE_KEY')
if (!URL_ || !KEY) {
  console.error('Need VITE_SUPABASE_URL and SUPABASE_SERVICE_KEY.')
  process.exit(1)
}
const BUCKET = 'video-thumbs'
const clear = process.argv.includes('--clear')

const api = (path, init = {}) => fetch(`${URL_}${path}`, {
  ...init,
  headers: {
    apikey: KEY,
    Authorization: `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    ...(init.headers || {}),
  },
})

// 1) What is there.
const list = await api(`/storage/v1/object/list/${BUCKET}`, {
  method: 'POST',
  body: JSON.stringify({ prefix: '', limit: 1000, sortBy: { column: 'name', order: 'asc' } }),
}).then((r) => r.json())

const bytes = list.reduce((n, o) => n + (o.metadata?.size ?? 0), 0)
console.log(`${list.length} stored frames, ${(bytes / 1024 / 1024).toFixed(1)}MB, ${Math.round(bytes / Math.max(1, list.length) / 1024)}KB each on average`)

if (!clear) {
  console.log('Report only. Pass --clear to forget them and let the app cache them again.')
  process.exit(0)
}

// 2) Forget the addresses first. If this half fails the objects are still
// there and nothing is broken; the other order would leave rows pointing at
// files that no longer exist.
for (const table of ['submissions', 'tracked_videos']) {
  const res = await api(`/rest/v1/${table}?thumbnail_url=like.*${BUCKET}*`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ thumbnail_url: null }),
  })
  const rows = await res.json()
  console.log(`${table}: cleared ${Array.isArray(rows) ? rows.length : 0}`)
}

// 3) And the files.
if (list.length) {
  const res = await api(`/storage/v1/object/${BUCKET}`, {
    method: 'DELETE',
    body: JSON.stringify({ prefixes: list.map((o) => o.name) }),
  })
  console.log(`objects: ${res.ok ? 'deleted' : `failed (${res.status})`}`)
}
console.log('Done. Open a challenge board as an admin to fill them in again.')
