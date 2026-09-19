import { describe, it, expect } from 'vitest'
import { fetchAll, allRows } from './fetchAll'

// A stand-in for a PostgREST builder: chainable, executes when awaited, and
// - the point of the whole exercise - REFUSES to return more than `cap` rows,
// exactly as the real one does.
function fakeTable(rows, { cap = 1000, failOnPage = -1 } = {}) {
  let calls = 0
  const make = () => {
    const state = { orders: [], from: 0, to: cap - 1 }
    const builder = {
      order(col) { state.orders.push(col); return builder },
      range(from, to) { state.from = from; state.to = to; return builder },
      then(resolve) {
        calls += 1
        if (calls - 1 === failOnPage) return resolve({ data: null, error: { message: 'boom' } })
        if (!state.orders.length) return resolve({ data: null, error: { message: 'unordered page' } })
        const sorted = [...rows].sort((a, b) => a.id - b.id)
        const size = Math.min(state.to - state.from + 1, cap)
        return resolve({ data: sorted.slice(state.from, state.from + size), error: null })
      },
    }
    return builder
  }
  make.calls = () => calls
  return make
}

const many = (n) => Array.from({ length: n }, (_, i) => ({ id: i }))

describe('fetchAll', () => {
  it('gets everything past the thousand-row wall', async () => {
    // THE BUG THIS EXISTS FOR. A single request comes back with exactly 1000 of
    // the 2,345 rows and no error - the array looks complete and every number
    // computed from it is quietly too small.
    const build = fakeTable(many(2345), { cap: 1000 })
    const { data, error, truncated } = await fetchAll(build, { orderBy: 'id' })
    expect(error).toBeNull()
    expect(truncated).toBe(false)
    expect(data).toHaveLength(2345)
    expect(new Set(data.map((r) => r.id)).size).toBe(2345)   // no repeats across pages
    expect(build.calls()).toBe(3)
  })

  it('stops after one request when the table fits', async () => {
    const build = fakeTable(many(12))
    const { data } = await fetchAll(build, { orderBy: 'id' })
    expect(data).toHaveLength(12)
    expect(build.calls()).toBe(1)
  })

  it('stops at the boundary rather than asking for an empty page', async () => {
    const build = fakeTable(many(1000), { cap: 1000 })
    const { data } = await fetchAll(build, { orderBy: 'id' })
    expect(data).toHaveLength(1000)
    // A full first page is indistinguishable from a full table, so it has to
    // ask once more - and must not then loop.
    expect(build.calls()).toBe(2)
  })

  it('always orders, because paging an unordered query silently repeats rows', async () => {
    const build = fakeTable(many(50))
    const { error } = await fetchAll(build, { orderBy: 'id' })
    expect(error).toBeNull()
  })

  it('orders by every column it is given, for tables with a composite key', async () => {
    const seen = []
    const build = () => {
      const b = {
        order(c) { seen.push(c); return b },
        range() { return b },
        then(res) { return res({ data: [], error: null }) },
      }
      return b
    }
    await fetchAll(build, { orderBy: ['community_id', 'profile_id'] })
    expect(seen).toEqual(['community_id', 'profile_id'])
  })

  it('hands back a failed page as an error rather than a short table', async () => {
    // Returning what it had would be the same silent under-count this function
    // exists to prevent.
    const build = fakeTable(many(2500), { cap: 1000, failOnPage: 1 })
    const { data, error, truncated } = await fetchAll(build, { orderBy: 'id' })
    expect(error).toBeTruthy()
    expect(truncated).toBe(true)
    expect(data).toHaveLength(1000)
  })

  it('will not loop for ever', async () => {
    // A table that always answers with a full page - the shape a runaway loop
    // would take if the cap were ever missed.
    const build = () => {
      const b = {
        order() { return b },
        range() { return b },
        then(res) { return res({ data: many(1000), error: null }) },
      }
      return b
    }
    const { truncated, data } = await fetchAll(build, { orderBy: 'id', cap: 3000 })
    expect(truncated).toBe(true)
    expect(data).toHaveLength(3000)
  })

  it('allRows hands back just the rows', async () => {
    expect(await allRows(fakeTable(many(5)), { orderBy: 'id' })).toHaveLength(5)
  })
})
