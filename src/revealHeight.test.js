import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

// THE PROFILE PAGE'S WHITE GAPS, PINNED IN THE STYLESHEET.
//
// Ethan: "the profile pages are completely broken, the layout is all messed up
// and there's white spaces between each card... I refreshed on the tab and it's
// still not fixed, although on another tab it is working correctly."
//
// `.reveal-item { height: 100% }`. Profile's desktop layout drops a `Reveal`
// straight into a `grid`, a grid item is stretched to its track and therefore
// has a DEFINITE height, and a definite height is exactly what makes a child's
// percentage height resolve. So every section wrapper became as tall as the
// whole column. Measured on the live page: a 1,398px container with four
// 1,398px children in it, stacked at 321 / 1,751 / 3,182 / 4,612.
//
// WHY A STYLESHEET TEST AND NOT A RENDER TEST. jsdom does not do layout - it
// reports every height as 0 - so a render test cannot see this bug at all. The
// defect is one declaration in one rule, and the honest way to stop it coming
// back is to assert that the declaration is not there. The behaviour it was
// standing in for (`align-self: stretch`) is asserted alongside it, so this
// cannot be "fixed" by deleting the line and nothing else.
// `process.cwd()` is the repo root under vitest; `import.meta.url` is not a
// file URL once the file has been through the transform pipeline.
const css = readFileSync(join(process.cwd(), 'src/index.css'), 'utf8')

/** The body of the bare `.reveal-item { ... }` rule. */
function baseRule() {
  const m = css.match(/\n\s*\.reveal-item\s*\{([^}]*)\}/)
  expect(m, 'the .reveal-item base rule has been renamed or removed').not.toBeNull()
  return m[1]
}

describe('.reveal-item', () => {
  it('does NOT set a percentage height', () => {
    // The one line that broke every Reveal used as a grid item.
    expect(baseRule()).not.toMatch(/height:\s*100%/)
  })

  it('stretches instead, which is what the percentage was there to do', () => {
    // Inert in a block container (so a profile section is its own height) and
    // the default in a grid or flex one (so a card with `h-full` inside a
    // wrapper still has a definite parent to measure against).
    expect(baseRule()).toMatch(/align-self:\s*stretch/)
  })

  it('still starts hidden and offset, or there is no animation left', () => {
    expect(baseRule()).toMatch(/opacity:\s*0/)
    expect(baseRule()).toMatch(/transform:\s*translate3d/)
  })

  it('is still revealed by either the container or the item itself', () => {
    // Both selectors matter: the container answers for a short grid, the item
    // answers for itself once the column is taller than the screen.
    expect(css).toMatch(/\.reveal\.is-in\s*>\s*\.reveal-item/)
    expect(css).toMatch(/\.reveal\s*>\s*\.reveal-item\.is-in/)
  })
})
