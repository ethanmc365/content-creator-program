#!/usr/bin/env node
// WRAP THE BARE JSX TEXT IN A FILE WITH `t(...)`.
//
// A one-off codemod, kept in the repository because there is more of the
// platform to translate than fits in one sitting and the next person should not
// re-derive it. It is deliberately CONSERVATIVE: it only touches text it is
// certain about, and everything it is not certain about it leaves alone for a
// person. A codemod that gets 70% of a file right and 5% of it wrong is worse
// than one that gets 60% right and nothing wrong, because the 5% has to be
// found by reading.
//
// WHAT IT WRAPS
//   * a JSX text node on its own line, or `>text<` inline, containing no
//     braces, no tags and at least one two-letter word
//   * `placeholder="..."`, `title="..."` and `aria-label="..."` string
//     attributes with the same shape
//
// WHAT IT REFUSES TO TOUCH, and why each one matters
//   * anything already inside `t(`
//   * comments (this codebase's notes are longer than its code)
//   * `className`, `to`, `href`, `src`, `id`, `key`, `name`, `type`, `role`,
//     `icon` and friends - those are not sentences
//   * text that is only digits, punctuation or a single word in CAPS
//   * `<code>`, `<pre>` and anything inside a `<style>`
//
// IT EMITS `tr(...)`, NOT `t(...)`, AND THAT IS NOT A STYLE CHOICE.
// `t` is the universal name for a translate function and it is already taken
// all over this codebase: `trips.map((t) => ...)` in the flight log,
// `const t = tagInfo(q.tag)` on the community board, `const t = setInterval(...)`
// in the calendar. The first run of this codemod emitted `t(...)` into all
// three, and eslint reported NO ERROR - because a `t` was in scope at every
// call site. It was simply the wrong one, and `t('Log a flight')` on a trip
// object would have thrown at runtime on a page nobody had opened yet. A
// codemod that can silently bind to the wrong variable is not safe to run, so
// the name it emits is one nothing else in the repository uses.
//
// It does NOT add the import or the hook. That is one line per file and it has
// to go in the right component - a file often draws text from three of them -
// so it is left to the person running this, who then has `npx eslint` telling
// them exactly which components are missing a `tr`.
//
//   node scripts/i18n-wrap.mjs src/pages/Flights.jsx [...more files]
//   node scripts/i18n-wrap.mjs --dry src/pages/Flights.jsx

import { readFileSync, writeFileSync } from 'node:fs'

const dry = process.argv.includes('--dry')
const files = process.argv.slice(2).filter((a) => !a.startsWith('--'))

// Attributes that hold a sentence somebody reads. Everything else is plumbing.
const TEXT_ATTRS = ['placeholder', 'aria-label', 'title', 'label', 'hint', 'confirmLabel']

// Ranges of the file that must not be rewritten: comments, and the contents of
// a `t(` call that is already there.
function protectedRanges(src) {
  const out = []
  const block = /\/\*[\s\S]*?\*\//g
  const line = /(^|[^:])\/\/[^\n]*/g
  const already = /\btr?\(\s*(['"])(?:\\.|(?!\1)[^\\])*\1/g
  for (const re of [block, line, already]) {
    for (const m of src.matchAll(re)) out.push([m.index, m.index + m[0].length])
  }
  return out
}

const inside = (ranges, i) => ranges.some(([a, b]) => i >= a && i < b)

function wrap(src) {
  const ranges = protectedRanges(src)
  let changed = 0

  // ---- 1. JSX text nodes -------------------------------------------------
  //
  // `>` … text … `<`, where the text has no braces or tags of its own.
  //
  // THE WHITESPACE EITHER SIDE IS CAPPED AT ONE NEWLINE, and that is not
  // cosmetic. With `\s*` it can cross blank lines, so a `>` closing one element
  // and a `<` opening the next one three lines later put everything between
  // them - actual code - in the capture. The first run of this produced
  // `{tr("return (")}` in place of a component's `return (`, which is a parse
  // error and therefore caught; a capture that happened to stay syntactically
  // valid would not have been. Hence the CODE GUARD below as well: no keyword,
  // no arrow, no trailing opener.
  //
  // AND `>` IS ALSO GREATER-THAN. That is the other half of the same problem
  // and it is worse, because the result can be valid JavaScript:
  // `s.correct > cur.correct || (... && s.time_ms < cur.time_ms)` matched, and
  // came out as `s.correct > {tr("cur.correct || (...")} < cur.time_ms)`.
  // JSX and arithmetic are told apart by their SPACING, which is reliable
  // because it is what every formatter in the world produces:
  //   * a JSX `>` closes a tag, so it is never preceded by a space - and never
  //     by `=`, which would make it an arrow;
  //   * a JSX `<` opens one, so it is always followed immediately by a letter
  //     or a `/`, never by a space or an `=`.
  src = src.replace(/(?<=[^\s=])>([ \t]*\n?[ \t]*)([A-Za-z][^<>{}\n]*?)([ \t]*\n?[ \t]*)<(?=[/A-Za-z])/g, (full, pre, text, post, offset) => {
    if (inside(ranges, offset)) return full
    const trimmed = text.trim()
    if (trimmed.length < 3) return full
    if (!/[A-Za-z]{2}/.test(trimmed)) return full
    if (/^[A-Z0-9_ ]+$/.test(trimmed)) return full
    if (/^https?:/.test(trimmed)) return full
    // A lone lowercase word is nearly always a value, not a sentence.
    if (/^[a-z][a-z-]*$/.test(trimmed)) return full
    // CODE GUARD. Anything that reads like JavaScript is not copy.
    if (/\b(return|const|let|var|function|import|export|await|async|typeof|new)\b/.test(trimmed)) return full
    if (/=>|[({[]\s*$|[;=]\s*$/.test(trimmed)) return full
    changed += 1
    return `>${pre}{tr(${JSON.stringify(trimmed)})}${post}<`
  })

  // ---- 2. string attributes ----------------------------------------------
  const attrRe = new RegExp(`\\b(${TEXT_ATTRS.join('|')})="([^"{}\\n]{3,})"`, 'g')
  src = src.replace(attrRe, (full, attr, value, offset) => {
    if (inside(ranges, offset)) return full
    const trimmed = value.trim()
    if (!/[A-Za-z]{2}/.test(trimmed)) return full
    if (/^[a-z][a-z-]*$/.test(trimmed)) return full
    changed += 1
    return `${attr}={tr(${JSON.stringify(trimmed)})}`
  })

  return { src, changed }
}

for (const file of files) {
  const before = readFileSync(file, 'utf8')
  // Refuse rather than guess. If a file binds `tr` to something that is NOT the
  // translate hook, the rewrite would capture it exactly the way `t` was
  // captured before - see the note at the top about `t` binding to a trip, a
  // tag and a timer.
  //
  // A FILE THAT IS ALREADY PART-TRANSLATED IS THE NORMAL CASE, THOUGH, and the
  // first version of this guard refused those too: any `const tr = useT()`
  // anywhere in the file stopped the whole file being processed. That is
  // exactly backwards - a half-done file is the one most worth finishing - and
  // it is not what the guard is for. So the test is now whether every binding
  // of `tr` is `= useT()`. If one is not, the file is somebody else's `tr` and
  // this refuses it as before.
  const bindings = [...before.matchAll(/\b(?:const|let|var)\s+tr\s*=\s*([^\n]*)/g)]
  const paramBound = /function[^(]*\([^)]*\btr\b|\(\s*\{[^}]*\btr\b[^}]*\}\s*\)\s*=>/.test(before)
  const foreign = paramBound || bindings.some((m) => !/^useT\(\)/.test(m[1].trim()))
  if (foreign) {
    console.log(`   -  ${file}  (skipped: 'tr' is bound to something else here)`)
    continue
  }
  const { src, changed } = wrap(before)
  console.log(`${changed.toString().padStart(4)}  ${file}`)
  if (!dry && changed) writeFileSync(file, src)
}
