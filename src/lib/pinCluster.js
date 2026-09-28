// GROUPING THE MAP'S PINS, as pure arithmetic so it can be rehearsed.
//
// Pulled out of CreatorMap on 28 Sep 2026 after the grouping shipped a fault
// nobody could see from the component: fully zoomed out, every creator in
// Europe fell into a single pin reading "130" sitting on the UK. The maths is
// twenty lines and the component is three thousand, so the maths lives here now
// and `pinCluster.test.js` holds the cases that were wrong.
//
// A `pt` is `{ x, y, t }` - a projected position and the town it belongs to.
// A town needs only `country` here; everything else about it is the caller's.

/**
 * The merge order for a set of projected points: single-linkage clustering,
 * expressed as the edges of the minimum spanning forest in increasing length
 * (Kruskal). Replaying those edges below some reach gives the groups for any
 * zoom, and because the merges are NESTED a change of zoom only ever splits a
 * group or joins two - nothing is reshuffled, so the fewest possible pins move.
 *
 * WHY THE FOREST AND NOT THE TREE: no edge is ever created between two towns in
 * different countries, so the graph is one component per country rather than one
 * overall. That bound is the whole point.
 *
 * Single linkage is TRANSITIVE - A joins B, B joins C, therefore A, B and C are
 * one group even where A and C are far apart. Over a dense chain of towns that
 * is a chain reaction, and Europe is exactly such a chain: at world zoom the
 * reach is about 30 units and no two neighbouring countries are further apart
 * than that, so Dublin chained to Manchester to Amsterdam to Madrid and the
 * continent became one pin. Bounding the graph by country stops the chain at
 * every border, and leaves the honest shape: a pin meaning "everybody in Spain"
 * is a fact a reader can use, one meaning "everybody between Ireland and
 * Romania" is not.
 */
export function clusterMerges(pts) {
  const n = pts.length
  if (n < 2) return []
  const edges = []
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (pts[i].t.country !== pts[j].t.country) continue
      edges.push({ a: i, b: j, h: Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y) })
    }
  }
  edges.sort((x, y) => x.h - y.h)
  const parent = pts.map((_, i) => i)
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
  const merges = []
  for (const e of edges) {
    const ra = find(e.a)
    const rb = find(e.b)
    if (ra === rb) continue
    parent[rb] = ra
    merges.push(e)
  }
  return merges
}

/**
 * Replay the merges that are shorter than `reach` and return the groups, each as
 * the list of towns in it. Groups come back in the order their first member
 * appears in `pts`, so a caller that sorted `pts` by creator count gets its
 * biggest town first in every group.
 */
export function groupsAtReach(pts, merges, reach) {
  const parent = pts.map((_, i) => i)
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i] } return i }
  for (const m of merges) {
    if (m.h >= reach) break
    const a = find(m.a)
    const b = find(m.b)
    // Always keep the LOWER index as the root, so a group's representative is
    // its earliest member in `pts` however the merges happen to be ordered.
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b)
  }
  const groups = new Map()
  pts.forEach((p, i) => {
    const r = find(i)
    if (!groups.has(r)) groups.set(r, [])
    groups.get(r).push(p.t)
  })
  return [...groups.values()]
}

/**
 * The reach, in the map's own projection units, at a given zoom. A pin's head is
 * about 30 wide and is counter-scaled by zoom^-0.7 (see Pin), so this is "how
 * far apart two pins have to be at this zoom before they stop touching".
 */
export function reachAtZoom(zoom) {
  return 30 * Math.pow(Math.max(1, zoom || 1), -0.7)
}

/**
 * The zoom a regroup is worked out at: half-octave steps (x1.41), so a group
 * splits or merges at a handful of zoom levels rather than at every nudge of a
 * gesture.
 */
export function clusterStep(zoom) {
  return Math.pow(2, Math.round(Math.log2(Math.max(1, zoom || 1)) * 2) / 2)
}
