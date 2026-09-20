import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

// A SUPABASE QUERY IS A THENABLE, NOT A PROMISE, AND THIS TOOK SIGNUP DOWN.
//
// `PostgrestBuilder` implements exactly one method off the promise protocol:
// `then(onfulfilled, onrejected)`. There is no `catch` and no `finally` on it.
// So this, which reads like ordinary defensive code:
//
//   supabase.from('x').select('y').eq('id', id).maybeSingle()
//     .catch(() => ({ data: null }))
//     .then(({ data }) => …)
//
// is `undefined(...)`, and it throws `catch is not a function` SYNCHRONOUSLY at
// the call site. It shipped in d626c37 inside the /onboarding hydration effect,
// where React turned it into an error boundary, and every creator who made an
// account after that deploy saw "an error has occurred" instead of the first
// screen. It was reported by a German creator and confirmed in the error panel:
// six crashes, two people, nothing else on the page touched.
//
// The bitter part is that the `.catch` was ADDED to stop an unreadable crash
// report. It is exactly the kind of mistake that reads fine in review - every
// other `.catch` in the same file (on `loadMarkets()`, on `import()`) is on a
// real promise and is correct - which is why it gets a test rather than a note.
//
// WHAT TO WRITE INSTEAD, any of:
//   await   - `try { const { data } = await supabase… } catch { … }`
//   then/2  - `.then((r) => r, () => ({ data: null }))`
//   adopt   - `Promise.resolve(supabase…).catch(…)`
//
// The check is deliberately crude: any `.catch(` or `.finally(` that follows a
// postgrest terminator on the previous line or the same one. It can only ever
// fire on this shape, and the shape is always wrong.

// What makes a chain a SUPABASE chain rather than any other fluent API. Both
// halves have to be true for a report: the statement starts at the client, and
// no `.then` has turned it into a real promise on the way down.
const IS_QUERY = /\b(supabase|sb|client|db)\s*\.\s*(from|rpc|schema|storage)\s*\(|\.\s*(maybeSingle|single)\s*\(\s*\)/

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    // This file necessarily contains the pattern it is looking for.
    else if (/\.(jsx?|tsx?)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full)
  }
  return out
}

/** Lines where `.catch(`/`.finally(` is chained straight onto a query builder. */
export function offendingLines(source) {
  const lines = source.split('\n')
  const skippable = (s) => s.trim() === '' || /^\s*(\/\/|\*|\/\*)/.test(s)
  const bad = []
  for (let i = 0; i < lines.length; i++) {
    if (!/^\s*\.(catch|finally)\s*\(/.test(lines[i])) continue

    // Walk back up the chain to its HEAD - the first line that is not a
    // continuation (`.something(`), a blank, or a comment. Everything between
    // is the chain, and that is what decides the question.
    const chain = []
    let j = i - 1
    while (j >= 0 && (skippable(lines[j]) || /^\s*\.[A-Za-z]/.test(lines[j]))) {
      if (!skippable(lines[j])) chain.push(lines[j])
      j--
    }
    if (j < 0) continue
    const head = lines[j]

    // A `.then` ANYWHERE above the `.catch` has already produced a real
    // promise, so the `.catch` is fine no matter what the head was. This is the
    // common and correct shape (`query.then(use).catch(fallback)`), and without
    // it every one of those reads as a fault.
    if (chain.some((l) => /^\s*\.then\s*\(/.test(l))) continue

    // A head that is only a closing bracket means the call was WRAPPED -
    // `Promise.resolve(…)`, `Promise.all([…])` - so the left side is a promise.
    if (/^\s*[)\]]/.test(head.trim())) continue

    const statement = [head, ...chain.reverse()].join('\n')
    if (IS_QUERY.test(statement)) {
      bad.push({ line: i + 1, text: lines[i].trim(), after: head.trim() })
    }
  }
  return bad
}

describe('supabase queries are thenables, not promises', () => {
  it('nothing calls .catch or .finally directly on a query builder', () => {
    const offenders = []
    for (const file of walk(path.join(process.cwd(), 'src'))) {
      const src = fs.readFileSync(file, 'utf8')
      if (!src.includes('supabase')) continue
      for (const hit of offendingLines(src)) {
        offenders.push(`${path.relative(process.cwd(), file)}:${hit.line}  ${hit.text}  (after: ${hit.after})`)
      }
    }
    expect(offenders, [
      'A supabase query has no .catch/.finally - it only has .then.',
      'Use await inside try, .then(ok, fail), or Promise.resolve(query).catch(…).',
    ].join(' ')).toEqual([])
  })

  it('recognises the shape that broke onboarding', () => {
    const bad = [
      "supabase.from('creator_private').select('dob').eq('id', id).maybeSingle()",
      '  .catch(() => ({ data: null }))',
      '  .then(({ data }) => use(data))',
    ].join('\n')
    expect(offendingLines(bad)).toHaveLength(1)
  })

  it('leaves a wrapped query alone', () => {
    const good = [
      'Promise.resolve(',
      "  supabase.from('creator_private').select('dob').eq('id', id).maybeSingle(),",
      ')',
      '  .catch(() => ({ data: null }))',
      '  .then(({ data }) => use(data))',
    ].join('\n')
    expect(offendingLines(good)).toEqual([])
  })

  it('leaves a .catch on a real promise alone', () => {
    const good = ['loadMarkets()', '  .catch(() => [])'].join('\n')
    expect(offendingLines(good)).toEqual([])
  })
})
