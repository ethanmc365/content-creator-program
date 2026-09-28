import { describe, expect, it } from 'vitest'
import { clusterMerges, clusterStep, groupsAtReach, reachAtZoom } from './pinCluster'

// Towns as the map sees them: a projected x/y and a normalised country.
const pt = (x, y, country, key = `${country}:${x},${y}`) => ({ x, y, t: { key, country } })

// Sorted the way CreatorMap sorts: most creators first, so a group's
// representative is its biggest town.
const group = (pts, zoom) => groupsAtReach(pts, clusterMerges(pts), reachAtZoom(zoom))
const keysOf = (groups) => groups.map((g) => g.map((t) => t.key).sort()).sort()

describe('clusterMerges', () => {
  it('never joins two towns in different countries, however close they are', () => {
    // A mile apart across a border. Before the country bound these were one pin.
    const pts = [pt(100, 100, 'ie'), pt(101, 100, 'gb')]
    expect(clusterMerges(pts)).toEqual([])
    expect(keysOf(group(pts, 1))).toEqual([['gb:101,100'], ['ie:100,100']])
  })

  it('returns a forest, not a tree: one component per country', () => {
    const pts = [pt(0, 0, 'es'), pt(5, 0, 'es'), pt(200, 0, 'de'), pt(205, 0, 'de')]
    // Four points, two countries, so two merges - not the three a spanning
    // TREE over all four would give.
    expect(clusterMerges(pts)).toHaveLength(2)
  })

  it('orders merges by length, shortest first', () => {
    const pts = [pt(0, 0, 'es'), pt(10, 0, 'es'), pt(40, 0, 'es')]
    expect(clusterMerges(pts).map((m) => m.h)).toEqual([10, 30])
  })
})

describe('the fault this was extracted for', () => {
  // THE BUG, 28 Sep 2026. Zoomed fully out, every creator in Europe fell into a
  // single pin reading "130" on the UK. Single linkage is transitive and Europe
  // is a dense chain of towns, so each country joined the next until the
  // continent was one group.
  //
  // These are the real projected distances' shape: a line of countries each
  // within a pin's width of the next, which is what world zoom looks like.
  const europe = [
    pt(0, 0, 'gb'), pt(4, 2, 'gb'), pt(8, 1, 'gb'),   // three UK towns
    pt(22, 4, 'nl'),
    pt(44, 6, 'de'), pt(48, 9, 'de'),
    pt(66, 20, 'es'), pt(70, 24, 'es'),
    pt(92, 14, 'ro'),
  ]

  it('does NOT put the whole of Europe in one pin at world zoom', () => {
    const groups = group(europe, 1)
    expect(groups).toHaveLength(5) // gb, nl, de, es, ro
    expect(groups.some((g) => g.length === europe.length)).toBe(false)
  })

  it('leaves every country as its own pin, with its own creators in it', () => {
    expect(keysOf(group(europe, 1))).toEqual(keysOf([
      [europe[0].t, europe[1].t, europe[2].t],
      [europe[3].t],
      [europe[4].t, europe[5].t],
      [europe[6].t, europe[7].t],
      [europe[8].t],
    ]))
  })

  it('would have collapsed into one pin without the country bound', () => {
    // The same points with every country erased: this is the old behaviour, and
    // it is the proof that the chain reaction was real rather than supposed.
    const unbounded = europe.map((p) => ({ ...p, t: { ...p.t, country: 'x' } }))
    expect(group(unbounded, 1)).toHaveLength(1)
  })
})

describe('groupsAtReach', () => {
  it('splits a country into more pins as the reach shrinks', () => {
    // Two clusters of two, 60 units apart, inside one country.
    const pts = [pt(0, 0, 'es'), pt(6, 0, 'es'), pt(60, 0, 'es'), pt(66, 0, 'es')]
    const merges = clusterMerges(pts)
    expect(groupsAtReach(pts, merges, 100)).toHaveLength(1) // reach past everything
    expect(groupsAtReach(pts, merges, 50)).toHaveLength(2)  // the two clusters
    expect(groupsAtReach(pts, merges, 3)).toHaveLength(4)   // nothing touches
  })

  it('only ever splits as the reach shrinks, so pins are never reshuffled', () => {
    const pts = [pt(0, 0, 'es'), pt(6, 0, 'es'), pt(14, 0, 'es'), pt(60, 0, 'es')]
    const merges = clusterMerges(pts)
    // Every group at a smaller reach is a SUBSET of some group at a larger one.
    // That nesting is what stops pins swapping groups between zoom steps.
    for (const reach of [80, 40, 20, 10, 5]) {
      const coarse = groupsAtReach(pts, merges, reach)
      const fine = groupsAtReach(pts, merges, reach / 2)
      for (const f of fine) {
        const inside = coarse.some((c) => f.every((t) => c.includes(t)))
        expect(inside).toBe(true)
      }
    }
  })

  it('makes a group\'s representative its earliest point, whatever the merge order', () => {
    // CreatorMap sorts pts by creator count descending and takes members[0] as
    // the group's coordinates, so the pin sits on the biggest town.
    const pts = [pt(50, 0, 'es', 'biggest'), pt(0, 0, 'es', 'mid'), pt(4, 0, 'es', 'small')]
    const [only] = groupsAtReach(pts, clusterMerges(pts), 200)
    expect(only[0].key).toBe('biggest')
  })

  it('a lone town is its own group', () => {
    expect(group([pt(0, 0, 'es')], 1)).toEqual([[{ key: 'es:0,0', country: 'es' }]])
  })

  it('no towns is no groups', () => {
    expect(group([], 1)).toEqual([])
  })
})

describe('reachAtZoom', () => {
  it('shrinks as you zoom in, so pins separate', () => {
    expect(reachAtZoom(1)).toBeCloseTo(30)
    expect(reachAtZoom(4)).toBeLessThan(reachAtZoom(2))
    expect(reachAtZoom(16)).toBeLessThan(reachAtZoom(4))
  })

  it('treats a zoom below 1 as 1 rather than blowing the reach up', () => {
    expect(reachAtZoom(0)).toBe(30)
    expect(reachAtZoom(0.25)).toBe(30)
    expect(reachAtZoom(undefined)).toBe(30)
  })
})

describe('clusterStep', () => {
  it('snaps to half-octaves, so a gesture regroups a handful of times', () => {
    expect(clusterStep(1)).toBeCloseTo(1)
    expect(clusterStep(1.05)).toBeCloseTo(1)
    expect(clusterStep(1.4)).toBeCloseTo(Math.SQRT2)
    expect(clusterStep(2)).toBeCloseTo(2)
  })

  it('gives the same step across a small nudge, which is the point', () => {
    // A wheel tick of a few per cent must not regroup the map.
    expect(clusterStep(4)).toBe(clusterStep(4.1))
    expect(clusterStep(4)).toBe(clusterStep(3.9))
  })

  it('never returns less than 1', () => {
    expect(clusterStep(0)).toBe(1)
    expect(clusterStep(null)).toBe(1)
  })
})
