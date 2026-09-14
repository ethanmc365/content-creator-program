import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import process from 'node:process'

// RECHARTS WAS ON EVERY PAGE, FOR EVERY CREATOR, ON EVERY COLD LOAD.
//
// Ethan: "I also noticed some issues with the pages loading, taking much longer
// than usual."
//
// `react-dom` had been hoisted into the recharts chunk, which made that chunk a
// dependency of the ENTRY instead of the admin routes, which put a
// `modulepreload` for 162kB of gzipped charting library in index.html. Then,
// once react-dom was pulled back out, the shared d3 underneath recharts AND
// react-simple-maps did the same thing one layer down: the creator map is on an
// eagerly-routed page, so `maps` dragged `charts` back in behind it.
//
// Both faults are the same mistake - a shared dependency with no group of its
// own gets claimed by whichever leaf library happens to win - and both were
// invisible, because nothing in the build output says "this is now on the
// critical path" and the comment in the config confidently said the opposite.
//
// So the ordering is asserted directly. These are cheap, they run without a
// build, and they are the thing that actually went wrong.
// READ AS TEXT, NOT IMPORTED. `import config from '../vite.config.js'` pulls
// esbuild into the jsdom environment and it throws on load there, so the config
// is parsed out of the source. One regex over four lines we control.
const src = readFileSync(join(process.cwd(), 'vite.config.js'), 'utf8')
const groups = [...src.matchAll(/\{\s*name:\s*'([^']+)',\s*test:\s*(\/.*?\/),\s*priority:\s*(\d+)\s*\}/g)]
  .map(([, name, test, priority]) => ({
    name,
    test: eval(test),
    priority: Number(priority),
  }))
const byName = Object.fromEntries(groups.map((g) => [g.name, g]))

describe('vendor chunk groups', () => {
  it('names the shared runtime, not just the leaf libraries', () => {
    // The whole bug: recharts was named and react-dom was not.
    expect(byName.react, 'react/react-dom must have a group of its own').toBeTruthy()
    expect(byName.d3, 'shared d3 must have a group of its own').toBeTruthy()
  })

  it('ranks shared dependencies ABOVE the leaves that use them', () => {
    // Priority is what stops recharts claiming react-dom or d3. Equal ranks are
    // not good enough - the tie is broken by declaration order, which is
    // exactly the kind of accident this file exists to prevent.
    expect(byName.react.priority).toBeGreaterThan(byName.charts.priority)
    expect(byName.react.priority).toBeGreaterThan(byName.maps.priority)
    expect(byName.d3.priority).toBeGreaterThan(byName.charts.priority)
    expect(byName.d3.priority).toBeGreaterThan(byName.maps.priority)
  })

  it('matches on a path segment, so react-simple-maps is not mistaken for react', () => {
    const react = byName.react.test
    expect(react.test('/app/node_modules/react-dom/client.js')).toBe(true)
    expect(react.test('/app/node_modules/react/index.js')).toBe(true)
    expect(react.test('/app/node_modules/scheduler/index.js')).toBe(true)
    // The mistake pointing the other way: a bare `includes('react')` would
    // swallow both of these and undo the split it was meant to protect.
    expect(react.test('/app/node_modules/react-simple-maps/dist/i.js')).toBe(false)
    expect(react.test('/app/node_modules/react-router-dom/index.js')).toBe(false)
    // recharts brings its own react-dom copy under a nested node_modules; that
    // is still react and still belongs in the react chunk.
    expect(react.test('/app/node_modules/recharts/node_modules/react-dom/index.js')).toBe(true)
  })

  it('keeps recharts and the map libraries in their own groups', () => {
    expect(byName.charts.test.test('/app/node_modules/recharts/es6/chart/LineChart.js')).toBe(true)
    expect(byName.maps.test.test('/app/node_modules/react-simple-maps/dist/index.js')).toBe(true)
    expect(byName.maps.test.test('/app/node_modules/topojson-client/src/feature.js')).toBe(true)
    expect(byName.d3.test.test('/app/node_modules/d3-scale/src/linear.js')).toBe(true)
    expect(byName.d3.test.test('/app/node_modules/internmap/src/index.js')).toBe(true)
  })
})

// And the output itself, when there is one. This does not run in CI (the test
// step runs before the build step), so it is a local safety net rather than the
// guarantee - the guarantee is the priorities above.
const dist = join(process.cwd(), 'dist')
const built = existsSync(join(dist, 'index.html'))

describe.runIf(built)('the built entry', () => {
  const html = built ? readFileSync(join(dist, 'index.html'), 'utf8') : ''

  it('does not preload the charting library', () => {
    // 162kB gzipped, for a library only the admin analytics pages use.
    expect(html).not.toMatch(/href="\/assets\/charts-/)
  })

  it('still builds a separate charts chunk for the pages that do use it', () => {
    const assets = readdirSync(join(dist, 'assets'))
    expect(assets.some((f) => /^charts-.*\.js$/.test(f))).toBe(true)
  })
})
