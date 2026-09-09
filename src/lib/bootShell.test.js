import { describe, expect, it } from 'vitest'
import indexHtml from '../../index.html?raw'
import appCss from '../index.css?raw'

// THE BOOT LAYER IS THE ONE SCREEN NO TEST AND NO DEV SERVER EVER SHOWS ME.
//
// It lives in `index.html`, it is on screen for a few hundred milliseconds
// during a cold load, and it is the first thing a stranger sees. In one day it
// shipped broken twice, both times for reasons a person looking at a phone
// caught and nothing in the toolchain did:
//
//   1  ITS CLASSES COLLIDED WITH THE APP'S. `.btn` and `.page` are real classes
//      in index.css, so the moment the stylesheet loaded it restyled the
//      SKELETON - the two button shapes took `.btn`'s padding and inline-flex,
//      and the page block took `.page`'s `page-in` animation. Ethan: "the two
//      buttons have these really big dark outline bars around them in black."
//
//   2  RENAMING THEM MISSED THE SELECTORS WRITTEN AS `#boot.public`. The
//      regex that added the `b-` prefix required a non-word character before
//      the dot, and in `#boot.public` the character before it is `t`. So the
//      markup said `b-public` and four rules still said `.public`, and the
//      whole public shape silently did nothing on production while every hash,
//      header and unit test passed.
//
// Both are structural and both are checkable from the two files themselves.

const bootStyle = () => {
  const start = indexHtml.indexOf('#boot {')
  const end = indexHtml.indexOf('</style>', start)
  return indexHtml.slice(start, end)
}

const bootMarkup = () => {
  const start = indexHtml.indexOf('<div id="boot"')
  const end = indexHtml.indexOf('</script>', start)
  return indexHtml.slice(start, end)
}

/** Every class token used on an element inside the boot layer. */
function markupClasses() {
  const html = bootMarkup()
  const out = new Set()
  const re = /class="([^"]+)"/g
  let m = re.exec(html)
  while (m) {
    m[1].split(/\s+/).filter(Boolean).forEach((c) => out.add(c))
    m = re.exec(html)
  }
  return out
}

/** Every class the app's own stylesheet defines a rule for. */
function appClasses() {
  const out = new Set()
  const re = /(?:^|[\s,>+~(])\.([a-zA-Z][\w-]*)/gm
  let m = re.exec(appCss)
  while (m) {
    out.add(m[1])
    m = re.exec(appCss)
  }
  return out
}

describe('the boot layer', () => {
  it('exists, with both shapes and the script that chooses between them', () => {
    expect(bootMarkup()).toContain('id="boot"')
    expect(bootMarkup()).toContain('b-public')
    expect(indexHtml).toContain("document.getElementById('boot').className = 'b-public'")
  })

  // FAULT 1. Anything in here that the app also styles is a rule that arrives
  // uninvited the moment index.css loads.
  it('shares no class name with the app stylesheet', () => {
    const app = appClasses()
    const clashes = [...markupClasses()].filter((c) => app.has(c))
    expect(clashes).toEqual([])
  })

  // The prefix is the mechanism that keeps the rule above true for anything
  // added later, so it is asserted rather than left as a convention.
  it('prefixes every one of its classes', () => {
    const bad = [...markupClasses()].filter((c) => !c.startsWith('b-'))
    expect(bad).toEqual([])
  })

  // FAULT 2. A class on an element with no rule scoped to `#boot` is a class
  // that does nothing - which is exactly how `.b-public` shipped inert.
  //
  // MATCHED AS A WHOLE TOKEN, NOT AS A SUBSTRING. The first version used
  // `css.includes('.' + c)` and passed against `.b-row.b-b-b` - a triple-
  // prefixed selector produced by an overlapping rename, which matches `.b-b`
  // as a substring and styles nothing. A test that can be satisfied by a typo
  // is not a test.
  it('styles every class it uses, scoped to #boot', () => {
    const css = bootStyle()
    const unstyled = [...markupClasses()].filter(
      (c) => !new RegExp(`\\.${c}(?![\\w-])`).test(css),
    )
    expect(unstyled).toEqual([])
  })

  // And nothing in the stylesheet points at a class the markup does not have -
  // the other half of the same drift, and the half that made `.b-public` inert.
  it('has no selector for a class that no element carries', () => {
    const css = bootStyle().replace(/\/\*[\s\S]*?\*\//g, '')
    const used = markupClasses()
    const referenced = new Set()
    const re = /\.(b-[\w-]+)/g
    let m = re.exec(css)
    while (m) {
      referenced.add(m[1])
      m = re.exec(css)
    }
    expect([...referenced].filter((c) => !used.has(c))).toEqual([])
  })

  // And the specific selector the whole public shape hangs off. `#boot.b-public`
  // is what the inline script's class name has to match, character for
  // character, or the front page draws the signed-in app shell at a stranger.
  it('hides the app shell when the public class is set', () => {
    const css = bootStyle()
    expect(css).toContain('#boot.b-public .b-page')
    expect(css).toContain('#boot.b-public .b-tabs')
    expect(css).toContain('#boot.b-public .b-public')
    expect(css).not.toContain('#boot.public ')
  })
})
