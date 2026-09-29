#!/usr/bin/env node
// EVERY STRING THE APP ASKS FOR, AS A LIST, SO A LANGUAGE CAN BE BUILT FROM IT.
//
// `i18n-report` answers "how are we doing"; this answers "what exactly is
// there", which is the question you have when you sit down to add a language.
// Same scanner as the report - deliberately, so the two can never disagree
// about what the key set is - and the output is a plain JSON array in a stable
// order, so a half-finished translation can be diffed against it.
//
//   node scripts/i18n-keys.mjs                 # every asked-for string
//   node scripts/i18n-keys.mjs --missing de    # only what de.js still lacks
//   node scripts/i18n-keys.mjs --count         # just the numbers

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.jsx?$/.test(name) && !/\.test\./.test(name)) out.push(full)
  }
  return out
}

const CALL = /\btr\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g
const PLURAL_CALL = /\b(?:pl|plural)\(\s*[^)]*?,\s*(['"])((?:\\.|(?!\1)[^\\])*)\1\s*,\s*(['"])((?:\\.|(?!\3)[^\\])*)\3/g

const asked = new Set()
for (const file of walk(SRC)) {
  if (file.includes('/locales/')) continue
  const src = readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
  const note = (raw) => asked.add(raw.replace(/\\'/g, "'").replace(/\\"/g, '"'))
  for (const m of src.matchAll(CALL)) note(m[2])
  for (const m of src.matchAll(PLURAL_CALL)) { note(m[2]); note(m[4]) }
}

// THE SPANISH KEY SET COUNTS TOO. A language should reach parity with the one
// that already shipped, and `es.js` carries strings the scanner cannot see -
// anything translated through a table, where the call site passes a variable.
const es = (await import(join(SRC, 'locales/es.js'))).default
for (const k of Object.keys(es)) asked.add(k)

const all = [...asked].sort((a, b) => a.localeCompare(b))

const missingFor = process.argv.includes('--missing') ? process.argv[process.argv.indexOf('--missing') + 1] : null
let list = all
if (missingFor) {
  const path = join(SRC, `locales/${missingFor}.js`)
  const have = existsSync(path) ? new Set(Object.keys((await import(path)).default)) : new Set()
  list = all.filter((k) => !have.has(k))
}

if (process.argv.includes('--count')) {
  console.log(`${all.length} keys in the canonical set${missingFor ? `, ${list.length} missing from ${missingFor}` : ''}`)
} else {
  process.stdout.write(JSON.stringify(list, null, 1))
}
