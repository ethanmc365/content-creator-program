#!/usr/bin/env node
// MERGE A BATCH OF TRANSLATIONS INTO A LANGUAGE FILE.
//
// A dictionary of two thousand sentences cannot be written in one go, and a
// half-written one that has to be hand-edited every time is how a language ends
// up with two entries for the same English string and nobody noticing which one
// wins. This takes a JSON object of `{ "English": "translation" }`, merges it
// into `src/locales/<code>.js`, keeps the file's header comment, sorts the
// entries and writes it back.
//
// It REFUSES a key that is not in the canonical set (see i18n-keys.mjs), because
// a typo in the English half of a pair is invisible - the string simply never
// matches and the screen stays English - and that is the single most annoying
// bug this system has.
//
//   node scripts/i18n-merge.mjs de batch.json
//   node scripts/i18n-merge.mjs de batch.json --force   # allow unknown keys

import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const [code, batchPath] = process.argv.slice(2)
const force = process.argv.includes('--force')
if (!code || !batchPath) {
  console.error('usage: i18n-merge.mjs <code> <batch.json> [--force]')
  process.exit(1)
}

const target = join(ROOT, 'src/locales', `${code}.js`)
if (!existsSync(target)) {
  console.error(`No such language file: ${target}. Create it with its header first.`)
  process.exit(1)
}

const batch = JSON.parse(readFileSync(batchPath, 'utf8'))
const existing = (await import(target)).default

// The header is everything above `export default {`, kept verbatim: it is where
// the glossary and the decisions for this language are written down.
const raw = readFileSync(target, 'utf8')
const marker = raw.indexOf('export default {')
if (marker === -1) {
  console.error(`${target} has no \`export default {\` to merge into.`)
  process.exit(1)
}
const header = raw.slice(0, marker)

const canonical = new Set(JSON.parse(
  (await import('node:child_process')).execSync(`node ${join(ROOT, 'scripts/i18n-keys.mjs')}`, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }),
))

const merged = { ...existing }
const rejected = []
let added = 0
let changed = 0
for (const [en, translated] of Object.entries(batch)) {
  if (!canonical.has(en) && !force) { rejected.push(en); continue }
  if (typeof translated !== 'string' || !translated.trim()) { rejected.push(en); continue }
  if (!(en in merged)) added += 1
  else if (merged[en] !== translated) changed += 1
  merged[en] = translated
}

const esc = (s) => `'${String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`
const body = Object.keys(merged)
  .sort((a, b) => a.localeCompare(b))
  .map((k) => `  ${esc(k)}: ${esc(merged[k])},`)
  .join('\n')

writeFileSync(target, `${header}export default {\n${body}\n}\n`)

console.log(`${code}: ${added} added, ${changed} changed, ${Object.keys(merged).length} total`)
if (rejected.length) {
  console.log(`  ${rejected.length} rejected (not in the canonical key set, or empty):`)
  for (const r of rejected.slice(0, 12)) console.log(`    ${JSON.stringify(r)}`)
  if (rejected.length > 12) console.log(`    …and ${rejected.length - 12} more`)
}
