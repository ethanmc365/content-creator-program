import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// `behavior: 'auto'` IS NOT "INSTANT", AND THIS APP SCROLLS SMOOTHLY BY DEFAULT.
//
// `src/index.css` sets `html { scroll-behavior: smooth }` platform-wide. In the
// CSSOM spec, `window.scrollTo({ behavior: 'auto' })` does NOT mean "jump" - it
// means "use the element's computed scroll-behavior", which here is `smooth`.
// The two-argument form `window.scrollTo(x, y)` is the same: it also honours the
// CSS property.
//
// So the only way to move a scroller WITHOUT animating it is the explicit
// `behavior: 'instant'`, and every place that gets this wrong turns a
// repositioning into a several-hundred-millisecond animation.
//
// THIS HAS NOW COST THREE SEPARATE BUGS:
//
//   * every modal dumped the reader at the top of the page, because
//     `scrollLock`'s release was starting a thousand-pixel animation towards
//     the offset it was supposed to be restoring;
//   * every route change animated the page back to the top while the incoming
//     page's skeleton was being replaced underneath it - reported three times
//     as "it flashes up the loading screen on mobile", and misdiagnosed twice
//     as a loading-screen problem because the loader was never the thing
//     moving;
//   * opening a daily puzzle slid the board into place instead of putting it
//     there, with a rAF firing a second animated scroll on top of the first.
//
// A REPOSITION IS NOT A SCROLL. If the reader did not ask for the movement,
// they should not see it. This test is here because the mistake is invisible -
// it lints clean, it builds, it works on a desktop, and the word `auto` reads
// like it means automatic.

// `new URL('..').pathname` drops the leading directories under vitest's
// module resolution; resolve from this file's own location instead.
const SRC = dirname(dirname(fileURLToPath(import.meta.url)))

function jsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) { jsFiles(full, out); continue }
    if (/\.(jsx?|tsx?)$/.test(name) && !/\.test\./.test(name)) out.push(full)
  }
  return out
}

// A line that is a comment is documentation about the trap, not the trap.
const isComment = (line) => /^\s*(\/\/|\*|\/\*)/.test(line)

describe('scroll behaviour', () => {
  const files = jsFiles(SRC)

  it('finds the source tree (guards against the walker silently returning nothing)', () => {
    expect(files.length).toBeGreaterThan(100)
  })

  it("never calls scrollTo with behavior: 'auto'", () => {
    const hits = []
    for (const f of files) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (isComment(line)) return
        if (/behavior:\s*['"]auto['"]/.test(line)) hits.push(`${f.replace(SRC + '/', 'src/')}:${i + 1}`)
      })
    }
    expect(hits, "use behavior: 'instant' - 'auto' inherits scroll-behavior: smooth").toEqual([])
  })

  it('never calls window.scrollTo in the two-argument form', () => {
    const hits = []
    for (const f of files) {
      readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
        if (isComment(line)) return
        // `window.scrollTo(0, 0)` - two bare arguments, no options object.
        if (/window\.scrollTo\(\s*[^{]/.test(line)) hits.push(`${f.replace(SRC + '/', 'src/')}:${i + 1}`)
      })
    }
    expect(hits, "the two-argument form honours scroll-behavior: smooth - pass { behavior: 'instant' }").toEqual([])
  })

  it('still sets smooth scrolling in the stylesheet, which is what makes the above matter', () => {
    const css = readFileSync(join(SRC, 'index.css'), 'utf8')
    expect(css).toMatch(/scroll-behavior:\s*smooth/)
  })
})
