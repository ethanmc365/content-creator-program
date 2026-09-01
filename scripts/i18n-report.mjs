#!/usr/bin/env node
// WHAT IS TRANSLATED, AND WHAT IS STILL IN ENGLISH.
//
// Keying the dictionary on the English sentence (see src/lib/i18n.js) buys a
// product that degrades gracefully - an untranslated string renders in English
// rather than as a missing key - and it costs the one thing a key-based system
// gives you for free: you cannot tell by looking whether a screen is finished.
//
// This is that missing answer. It reads every source file and reports:
//
//   1. STRINGS THE CODE ASKS FOR AND THE DICTIONARY DOES NOT HAVE. These are
//      bugs: `tr('...')` was written and nobody translated it, so that string is
//      silently English in Spanish. This list should always be empty.
//   2. DICTIONARY ENTRIES NOTHING ASKS FOR *AT THIS CALL SITE*. Two very
//      different things land here and the difference matters:
//        - the English wording changed underneath a translation, which is the
//          one real failure mode of keying on the source; and
//        - the dictionary is simply ahead of the code, which is the normal
//          state while a translation is being rolled out screen by screen.
//      It also cannot see a string that is translated through a TABLE -
//      `tr(item.label)` over a list of nav labels asks for a variable, not a
//      literal - so entries like "Worldwide" show up here while being very much
//      in use. Read it as a worklist, not as a list of faults.
//   3. HOW MUCH OF EACH FILE HAS BEEN THROUGH `tr()` AT ALL - the count of
//      `tr(...)` calls against the count of bare JSX text nodes left in it. This
//      is the coverage number, and it is the list to work down.
//
// Deliberately a plain regex scan and not a parser. It is a progress report,
// not a compiler: a false positive costs somebody ten seconds of reading, and a
// dependency on a JS parser costs this repository a dependency.
//
//   node scripts/i18n-report.mjs           # summary
//   node scripts/i18n-report.mjs --files   # every file, worst coverage first

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const ROOT = new URL('..', import.meta.url).pathname
const SRC = join(ROOT, 'src')
const showFiles = process.argv.includes('--files')

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.jsx?$/.test(name) && !/\.test\./.test(name)) out.push(full)
  }
  return out
}

// `tr('...')` and `tr("...")`, single-line. `tr` and not `t` because `t` is
// already a trip, a tag and a timer in this codebase - see the note in
// i18n-wrap.mjs. A template literal cannot be a key: the whole point of the
// placeholder API is that you do not build the sentence at the call site, so
// those are not matched on purpose.
const CALL = /\btr\(\s*(['"])((?:\\.|(?!\1)[^\\])*)\1/g

// A JSX text node with at least two letters in it, which is a rough but
// workable stand-in for "a sentence somebody will read". Numbers, punctuation,
// single letters and anything inside braces are skipped.
const JSX_TEXT = />\s*([A-Za-z][^<>{}\n]{2,}?)\s*</g

const files = walk(SRC)
const asked = new Map() // string -> [files]
const counts = []

for (const file of files) {
  const raw = readFileSync(file, 'utf8')
  if (file.includes('/locales/')) continue
  // COMMENTS ARE STRIPPED BEFORE ANYTHING IS COUNTED. This file is full of long
  // notes, and several of them quote `t('...')` as an example - which the scan
  // would otherwise report as a string nobody translated.
  const src = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  let calls = 0
  for (const m of src.matchAll(CALL)) {
    calls += 1
    const key = m[2].replace(/\\'/g, "'").replace(/\\"/g, '"')
    if (!asked.has(key)) asked.set(key, [])
    asked.get(key).push(relative(ROOT, file))
  }
  // Bare text left in the markup. Comments are stripped first, or every long
  // note in this codebase would count as untranslated copy.
  const bare = [...src.matchAll(JSX_TEXT)]
    .map((m) => m[1].trim())
    .filter((s) => /[A-Za-z]{2}/.test(s) && !/^[A-Z_]+$/.test(s))
  counts.push({ file: relative(ROOT, file), calls, bare: bare.length })
}

const dict = await import(join(SRC, 'locales/es.js'))
const have = new Set(Object.keys(dict.default))

const missing = [...asked.keys()].filter((k) => !have.has(k))
const unused = [...have].filter((k) => !asked.has(k))

console.log(`\n  ${asked.size} strings asked for, ${have.size} translated.\n`)

if (missing.length) {
  console.log(`  ASKED FOR AND NOT TRANSLATED (${missing.length}) - these read as English in Spanish:`)
  for (const k of missing) console.log(`    ${JSON.stringify(k)}  ${asked.get(k)[0]}`)
  console.log('')
} else {
  console.log('  Every string the code asks for is translated.\n')
}

if (unused.length) {
  console.log(`  IN THE DICTIONARY, NOT SEEN AT A CALL SITE (${unused.length}):`)
  console.log('    Either ahead of the code, drawn through a table, or the English moved.')
  for (const k of unused.slice(0, 40)) console.log(`    ${JSON.stringify(k)}`)
  if (unused.length > 40) console.log(`    …and ${unused.length - 40} more`)
  console.log('')
}

const withText = counts.filter((c) => c.bare > 0 || c.calls > 0)
const totalBare = withText.reduce((n, c) => n + c.bare, 0)
const totalCalls = withText.reduce((n, c) => n + c.calls, 0)
console.log(`  Coverage: ${totalCalls} translated strings against roughly ${totalBare} bare ones still in the markup.\n`)

if (showFiles) {
  console.log('  Worst first (bare strings still to wrap):')
  for (const c of withText.sort((a, b) => b.bare - a.bare).slice(0, 40)) {
    console.log(`    ${String(c.bare).padStart(4)} bare, ${String(c.calls).padStart(3)} done   ${c.file}`)
  }
  console.log('')
}

// A string the code asks for and the dictionary has not got is a real defect,
// so this exits non-zero for CI. Bare markup is work in progress, not a fault.
process.exit(missing.length ? 1 : 0)
