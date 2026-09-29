#!/usr/bin/env node
// DROP ENTRIES WHOSE ENGLISH SIDE IS NO LONGER IN THE APP.
//
// A translation whose key has been reworded never matches anything: the screen
// quietly stays English and the line sits in the file looking like work that is
// already done. Nothing warns you, which is why this exists as a command rather
// than as something to notice by eye.
//
//   node scripts/i18n-prune.mjs de pt ro es
import { readFileSync, writeFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const canonical = new Set(JSON.parse(
  execSync(`node ${join(ROOT, 'scripts/i18n-keys.mjs')}`, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }),
))
const esc = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`

for (const code of process.argv.slice(2)) {
  const target = join(ROOT, 'src/locales', `${code}.js`)
  const raw = readFileSync(target, 'utf8')
  const header = raw.slice(0, raw.indexOf('export default {'))
  const existing = (await import(target)).default
  const keep = Object.keys(existing).filter((k) => canonical.has(k)).sort((a, b) => a.localeCompare(b))
  const dropped = Object.keys(existing).length - keep.length
  writeFileSync(target, `${header}export default {\n${keep.map((k) => `  ${esc(k)}: ${esc(existing[k])},`).join('\n')}\n}\n`)
  console.log(`${code}: ${dropped} stale dropped, ${keep.length} left`)
}
