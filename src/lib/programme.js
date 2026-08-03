// Programme economics: what a prize pot actually bought.
//
// These are the numbers the programme has been tracked on in a spreadsheet, and
// the ones a pitch stands or falls on. Kept as pure functions in one file so the
// definitions live in exactly one place and can be unit tested, rather than
// being re-derived inline in three different cards.
//
// The headline is CPM: cost per thousand views. It is the only figure that makes
// a EUR 60 express challenge and a EUR 540 monthly one comparable, and it is
// what a paid-media team will instinctively compare against their own numbers.

// Reporting currency conversion. Rates are refreshed from frankfurter.dev where
// the network allows (same source the invoice tool already uses), and fall back
// to these so a report never fails to render because an FX API is down. A stale
// rate moves a CPM by a few cents; a blank page loses the meeting.
export const FALLBACK_RATES = { GBP: 1, EUR: 1.17, USD: 1.27 }

// Convert an amount from `from` into `to`, given rates expressed per GBP.
export function convert(amount, from, to, rates = FALLBACK_RATES) {
  if (amount == null) return null
  const f = rates[from] ?? FALLBACK_RATES[from] ?? 1
  const t = rates[to] ?? FALLBACK_RATES[to] ?? 1
  return (Number(amount) / f) * t
}

// CPM target bands, matching how the programme has always been read:
//   on target  at or under the challenge's own target (default 0.50)
//   watch      up to double the target
//   over       above that
// A challenge that has ended with no views logged is a data gap, not a result,
// and is called out separately so it can't quietly drag an average around.
export const CPM_BANDS = [
  { key: 'on_target', label: 'On target', tone: 'good' },
  { key: 'watch', label: 'Watch', tone: 'warn' },
  { key: 'over_target', label: 'Over target', tone: 'bad' },
  { key: 'awaiting', label: 'Awaiting results', tone: 'neutral' },
  { key: 'no_views', label: 'No views logged', tone: 'neutral' },
]

export function cpmBand(cpm, { target = 0.5, ended = true, hasViews = true } = {}) {
  if (!hasViews) return ended ? 'no_views' : 'awaiting'
  if (cpm == null) return ended ? 'no_views' : 'awaiting'
  const t = Number(target) || 0.5
  if (cpm <= t) return 'on_target'
  if (cpm <= t * 2) return 'watch'
  return 'over_target'
}

/**
 * Turn one row from `admin_challenge_metrics()` into the full set of derived
 * figures, with every money value expressed in `currency`.
 *
 * Ratios are null rather than 0 when the denominator is missing: a challenge
 * with no views logged has an UNKNOWN cost per thousand views, and showing that
 * as "£0.00" would read as the best result on the board.
 */
export function challengeEconomics(row, { currency = 'GBP', rates = FALLBACK_RATES } = {}) {
  const spend = convert(row.prize_amount, row.prize_currency || 'GBP', currency, rates)
  const views = Number(row.total_views) || 0
  const posts = Number(row.posts) || 0
  const creators = Number(row.creators) || 0
  const hasViews = views > 0
  const ended = row.status !== 'active' && row.status !== 'upcoming'

  const cpm = hasViews && spend != null ? spend / (views / 1000) : null
  const target = Number(row.cpm_target) || 0.5

  return {
    ...row,
    spend,
    currency,
    views,
    posts,
    creators,
    cpm,
    costPerPost: posts > 0 && spend != null ? spend / posts : null,
    costPerCreator: creators > 0 && spend != null ? spend / creators : null,
    perWinner: row.winners_count > 0 && spend != null ? spend / row.winners_count : null,
    postsPerCreator: creators > 0 ? posts / creators : null,
    viewsPerPost: posts > 0 && hasViews ? views / posts : null,
    viewsPerCreator: creators > 0 && hasViews ? views / creators : null,
    medianViews: row.median_views != null ? Number(row.median_views) : null,
    // How much of the total came from the single best video. A challenge where
    // one video is 80% of the reach is a different story from an even spread,
    // and averages alone hide it completely.
    topVideoShare: hasViews && row.best_views ? Number(row.best_views) / views : null,
    band: cpmBand(cpm, { target, ended, hasViews }),
    target,
  }
}

/**
 * Roll a set of economics rows into one blended set of figures.
 *
 * Blended, NOT an average of averages: spend and views are summed first and
 * divided once. Averaging per-challenge CPMs would weight a EUR 30 express
 * challenge the same as a EUR 540 monthly one and quietly flatter the result.
 */
export function blendEconomics(rows, { currency = 'GBP' } = {}) {
  const scored = rows.filter((r) => r.spend != null)
  const spend = scored.reduce((s, r) => s + r.spend, 0)
  const views = rows.reduce((s, r) => s + r.views, 0)
  const posts = rows.reduce((s, r) => s + r.posts, 0)
  // Creators are per-challenge counts, so summing them counts a repeat
  // participant once per challenge. That's the right denominator for cost per
  // creator per challenge, which is what the spend question is actually about.
  const creatorSlots = rows.reduce((s, r) => s + r.creators, 0)
  const withViews = rows.filter((r) => r.views > 0)
  const onTarget = rows.filter((r) => r.band === 'on_target').length

  return {
    currency,
    challenges: rows.length,
    spend,
    views,
    posts,
    creatorSlots,
    cpm: views > 0 ? spend / (views / 1000) : null,
    costPerPost: posts > 0 ? spend / posts : null,
    costPerCreator: creatorSlots > 0 ? spend / creatorSlots : null,
    postsPerCreator: creatorSlots > 0 ? posts / creatorSlots : null,
    viewsPerPost: posts > 0 && views > 0 ? views / posts : null,
    avgPrize: rows.length ? spend / rows.length : null,
    avgCreators: rows.length ? creatorSlots / rows.length : null,
    // Share of SCORED challenges hitting target, not of all of them: counting
    // challenges that have no views yet as misses reads as a collapse whenever a
    // new one goes live.
    onTarget,
    scored: withViews.length,
    onTargetPct: withViews.length ? Math.round((onTarget / withViews.length) * 100) : null,
    missingResults: rows.filter((r) => r.band === 'no_views').length,
  }
}

// Group rows by any key, returning [{ key, rows, blended }] sorted by spend.
export function groupBy(rows, keyOf, { currency = 'GBP' } = {}) {
  const map = new Map()
  for (const r of rows) {
    const k = keyOf(r) ?? 'Unspecified'
    if (!map.has(k)) map.set(k, [])
    map.get(k).push(r)
  }
  return [...map.entries()]
    .map(([key, group]) => ({ key, rows: group, blended: blendEconomics(group, { currency }) }))
    .sort((a, b) => b.blended.spend - a.blended.spend)
}

// Readable labels for the enum columns, so the UI never shows a raw db value.
export const LABELS = {
  format: { monthly: 'Monthly', express: 'Express', always_on: 'Always on' },
  audience: { general: 'General', ugc: 'UGC', vip: 'VIP' },
  prize_type: { cash: 'Cash', voucher: 'Travel voucher', cash_voucher: 'Cash & voucher', product: 'Product', other: 'Other' },
  content_type: { free: 'Free', suggested: 'Suggested videos', talking: 'Talking style', hooks: 'Hooks', other: 'Other' },
  objective: { views: 'Views', videos: 'Number of videos', creativity: 'Creativity', trust: 'Views / trust' },
  status: { active: 'In progress', upcoming: 'Planned', archived: 'Done', ended: 'Done' },
}

export const label = (field, value) => LABELS[field]?.[value] ?? value ?? '-'
