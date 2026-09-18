import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

// THE MARKET PAGE THAT FROZE THE WHOLE APP (18 Sep 2026).
//
// Ethan: "if you click on any country in the 'your markets' section, it opens
// and then you are stuck there, none of the other buttons function any more, no
// matter what you click."
//
// `CreatorMap` declared `trips = {}` in its parameter list, and MarketMap is the
// only caller that passes no `trips` - a market page has no travel layer. A
// default in a parameter list is EVALUATED PER CALL, so that was a brand new
// object on every render, and every memo keyed on it recomputed and handed on a
// new identity in turn: storedTripCoords -> journeys -> fitPoints -> fitView.
// The auto-fit effect depends on `fitView` and ends in `setPosition(fitView)`,
// which can never be an equal state when the value is a fresh object - so it
// rendered, which made another `{}`, which made another `fitView`, for ever.
// React stopped at fifty nested updates and tore the route down: a blank market
// page on a main thread too busy to answer the header or the tab bar.
//
// WHY A SOURCE TEST. The failure is a render loop, and a render loop in jsdom
// is either a hang or React's own console warning - neither of which is a clean
// assertion, and both of which need the whole map (d3, the 614KB atlas,
// react-simple-maps) mounted to reach. The defect itself is two lines of source:
// a default that must not be an inline literal, and an effect that must compare
// before it commits. Those are exactly what is asserted here, and the second one
// is what keeps this dead even if some future prop starts churning identity
// again - a fit that has not moved is not a fit worth committing.
const src = readFileSync(join(process.cwd(), 'src/components/CreatorMap.jsx'), 'utf8')

/** The destructured parameter list of `function CreatorMap({ ... }) {`. */
function signature() {
  const m = src.match(/function CreatorMap\(\{([\s\S]*?)\}\) \{/)
  expect(m, 'the CreatorMap signature has been renamed or reshaped').not.toBeNull()
  // Comments inside it are prose about the props and may say anything.
  return m[1].replace(/\/\/[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
}

describe('CreatorMap props', () => {
  it('defaults no collection prop to an inline object or array literal', () => {
    // `x = {}` / `x = []` in a parameter list is a new identity every render,
    // which is a wasted memo everywhere and an infinite loop at the end of a
    // chain that feeds a setState. Point them at module-level constants.
    expect(signature()).not.toMatch(/=\s*\{\s*\}/)
    expect(signature()).not.toMatch(/=\s*\[\s*\]/)
  })

  it('gives `creators` and `trips` stable module-level defaults', () => {
    // Not just "not a literal": these two are the ones MarketMap leaves out, and
    // they must still HAVE a default or every caller has to pass them.
    expect(signature()).toMatch(/creators\s*=\s*NO_CREATORS/)
    expect(signature()).toMatch(/trips\s*=\s*NO_TRIPS/)
    expect(src).toMatch(/const NO_CREATORS = \[\]/)
    expect(src).toMatch(/const NO_TRIPS = \{\}/)
  })
})

describe('the auto-fit effect', () => {
  it('compares the fit by value before committing it', () => {
    // The guard that makes re-running the effect harmless rather than fatal.
    const m = src.match(/const appliedFit = useRef\(null\)\s*useEffect\(\(\) => \{([\s\S]*?)\n {2}\}, \[located, fitView\]\)/)
    expect(m, 'the auto-fit effect no longer guards on `appliedFit`').not.toBeNull()
    const body = m[1]
    // It bails out when the fit is unchanged...
    expect(body).toMatch(/appliedFit\.current/)
    expect(body).toMatch(/return/)
    // ...and it still fits: the guard must not have replaced the behaviour.
    expect(body).toMatch(/setPosition\(fitView\)/)
  })
})
