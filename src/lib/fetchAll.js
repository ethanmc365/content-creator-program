// EVERY ROW, NOT THE FIRST THOUSAND.
//
// PostgREST answers a request with at most 1000 rows and says so in a header
// nobody reads - verified against this project: asking for 3,496 notifications
// comes back `content-range: 0-999/3496` with a body of exactly one thousand.
// The Supabase client does not warn, does not throw, and hands you an array
// that looks complete.
//
// That is the worst shape a limit can have. A page that COUNTS things over a
// whole table - the analytics tabs, the year in review - does not fail when it
// crosses a thousand rows. It starts quietly under-reporting, by a margin that
// grows every day, and every number on it stays plausible. `game_scores` is the
// one about to cross: one row per player per daily puzzle, for ever.
//
// So anything that genuinely needs the whole table asks for it a page at a
// time. Where a total is all that is wanted, `{ count: 'exact', head: true }`
// is still much better than this - it never moves a row at all.
//
// THE ORDER IS NOT OPTIONAL. Paging an unordered query is a bug that looks like
// it works: without an ORDER BY, Postgres may return rows in a different order
// per request, so page two can repeat page one's rows and skip others. The
// order columns must also be UNIQUE TOGETHER, or rows tied on them can shuffle
// between pages - which is why this takes a list and not a single column.

const PAGE = 1000

/**
 * Read a whole table through a query builder, a page at a time.
 *
 * @param {() => object} build  makes a FRESH query each call - a PostgREST
 *   builder executes when awaited and cannot be reused.
 * @param {{ orderBy?: string|string[], pageSize?: number, cap?: number }} opts
 *   `orderBy` must be unique taken together. `cap` is a backstop against a
 *   runaway loop, not a limit anybody should rely on.
 * @returns {Promise<{ data: Array, error: any, truncated: boolean }>}
 */
export async function fetchAll(build, { orderBy = 'id', pageSize = PAGE, cap = 200_000, parallel = 1 } = {}) {
  const cols = Array.isArray(orderBy) ? orderBy : [orderBy]
  const page = (from) => {
    let q = build()
    for (const c of cols) q = q.order(c, { ascending: true })
    return q.range(from, from + pageSize - 1)
  }
  // THE FIRST PAGE ALONE, THEN THE REST SEVERAL AT A TIME (3 Oct 2026). Ethan: analytics "takes a while" to show up.
  // It read seven tables a thousand rows at a time, ONE PAGE AFTER ANOTHER, so a 5,000-row table was five round trips
  // in a row. Most tables fit in one page, so that page goes first on its own; a table that does not is then read in
  // batches of `parallel` pages at once until a short page says it has ended.
  const first = await page(0)
  if (first.error) return { data: [], error: first.error, truncated: true }
  const out = [...(first.data ?? [])]
  if (!first.data || first.data.length < pageSize) return { data: out, error: null, truncated: false }
  for (let from = pageSize; from < cap; from += pageSize * parallel) {
    const batch = await Promise.all(Array.from({ length: parallel }, (_, i) => from + i * pageSize).filter((f) => f < cap).map(page))
    for (const { data, error } of batch) {
      if (error) return { data: out, error, truncated: true }
      out.push(...(data ?? []))
      if (!data || data.length < pageSize) return { data: out, error: null, truncated: false }
    }
  }
  return { data: out, error: null, truncated: true }
}

/** `fetchAll` for the common case where the caller only wants the rows. */
export async function allRows(build, opts) {
  const { data } = await fetchAll(build, opts)
  return data
}
