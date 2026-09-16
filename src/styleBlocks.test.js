import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

// A BACKTICK INSIDE AN INLINE <style> BLOCK ENDS THE FILE.
//
// Several components ship their keyframes in a `<style>{`…`}</style>` block,
// which is a JS TEMPLATE LITERAL. Writing a CSS comment in there that quotes a
// property name in backticks - the house style everywhere else in this codebase -
// closes the literal early and the file stops parsing.
//
// It is a five-second fix and a genuinely confusing error ("Unexpected token
// ez", "Unexpected token pathLength"), and it has happened twice in one day
// while writing the animations for Flight Path and the Year in Review. The
// build does catch it; this catches it a step earlier and says what it is.

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    // Test files are skipped, this one included: it necessarily contains the
    // very string it is looking for.
    else if (/\.(jsx?|tsx?)$/.test(entry.name) && !/\.test\./.test(entry.name)) out.push(full)
  }
  return out
}

describe('inline style blocks', () => {
  it('never contain a backtick', () => {
    const offenders = []
    for (const file of walk(path.join(process.cwd(), 'src'))) {
      const src = fs.readFileSync(file, 'utf8')
      let from = 0
      for (;;) {
        const open = src.indexOf('<style>{`', from)
        if (open === -1) break
        const bodyStart = open + '<style>{`'.length
        const close = src.indexOf('`}</style>', bodyStart)
        if (close === -1) break
        const body = src.slice(bodyStart, close)
        if (body.includes('`')) {
          const line = src.slice(0, bodyStart + body.indexOf('`')).split('\n').length
          offenders.push(`${path.relative(process.cwd(), file)}:${line}`)
        }
        from = close + 1
      }
    }
    expect(offenders, `a backtick inside a <style> template literal ends it early: ${offenders.join(', ')}`).toEqual([])
  })
})
