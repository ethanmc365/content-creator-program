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
  // WHAT A CHALLENGE COST IS NOT WHAT THE BRIEF SAID IT WOULD COST.
  //
  // `prize_amount` is the number typed into the brief when it was written. The
  // real figure is in `rewards`, and it differs whenever a place goes unclaimed,
  // a prize is split differently, or - always - participation vouchers get
  // handed out, because those are not in the brief's number at all.
  //
  // PENDING COUNTS. A prize that has been awarded is committed money whether or
  // not the transfer has cleared, and Ethan wants the result readable the day a
  // challenge closes rather than the week the bank catches up.
  const rewardCcy = row.reward_currency || row.prize_currency || 'EUR'
  const conv = (n) => convert(n, rewardCcy, currency, rates)

  const cashPaid = conv(Number(row.cash_paid) || 0) ?? 0
  const cashPending = conv(Number(row.cash_pending) || 0) ?? 0
  const voucherPaid = conv(Number(row.voucher_paid) || 0) ?? 0
  const voucherPending = conv(Number(row.voucher_pending) || 0) ?? 0

  const cashSpend = cashPaid + cashPending
  const voucherSpend = voucherPaid + voucherPending
  const awarded = cashSpend + voucherSpend

  // Fall back to the plan only where nothing has been awarded yet, so a
  // challenge that is still running still shows the budget it set out with
  // rather than a row of dashes.
  const planned = convert(row.prize_amount, row.prize_currency || 'GBP', currency, rates)
  const spend = awarded > 0 ? cashSpend : planned
  const views = Number(row.total_views) || 0
  const posts = Number(row.posts) || 0
  const creators = Number(row.creators) || 0
  const hasViews = views > 0
  const ended = row.status !== 'active' && row.status !== 'upcoming'

  const cpm = hasViews && spend != null ? spend / (views / 1000) : null
  const target = Number(row.cpm_target) || 0.5


  // TWO CPMs, AND THEY ANSWER DIFFERENT QUESTIONS.
  //
  //   cashCpm      what the programme costs in money that leaves the business
  //   combinedCpm  cash PLUS participation vouchers at face value
  //
  // Both are wanted, and neither is a substitute. A EUR 10 Tryp.com voucher is
  // redeemed against a booking we make margin on, so it does not cost EUR 10 -
  // which is why cash has to be readable on its own. But the vouchers are still
  // value handed to creators, so the combined figure is the honest total
  // community spend. A voucher-only CPM is the one number nobody asked a
  // question that needs, so it is not computed.
  const perThousand = (amount) => (hasViews && amount > 0 ? amount / (views / 1000) : null)

  return {
    ...row,
    spend,
    currency,
    views,
    posts,
    creators,
    cashSpend,
    voucherSpend,
    cashPaid,
    cashPending,
    voucherPaid,
    voucherPending,
    awarded,
    planned,
    // True when nothing has been awarded, so the UI can say "budget" rather
    // than quietly presenting a plan as a result.
    isPlanned: awarded === 0 && planned != null,
    cashCpm: perThousand(cashSpend),
    combinedCpm: perThousand(awarded),
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
  const cashSpend = rows.reduce((s, r) => s + (r.cashSpend || 0), 0)
  const voucherSpend = rows.reduce((s, r) => s + (r.voucherSpend || 0), 0)
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
    cashSpend,
    voucherSpend,
    combinedSpend: cashSpend + voucherSpend,
    // Blended, not an average of averages: sum first, divide once. Averaging
    // per-challenge CPMs weights a EUR 30 express challenge the same as a
    // EUR 540 monthly one and quietly flatters the result.
    cashCpm: views > 0 && cashSpend > 0 ? cashSpend / (views / 1000) : null,
    combinedCpm: views > 0 && cashSpend + voucherSpend > 0 ? (cashSpend + voucherSpend) / (views / 1000) : null,
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

// KEEPING THE DATABASE'S RATE FRESH.
//
// Invoices are denominated in the currency the creator actually banks in, and
// the conversion happens in Postgres (`fx_convert`) because it has to work when
// nobody is looking - a prize awarded by a cron job still needs a number. The
// database cannot call a third party, so it reads a rate out of `app_settings`.
//
// This is what keeps that rate honest. Any admin screen that has just fetched a
// live ECB rate hands it over; the write is admin-only by RLS, costs one
// upsert, and nothing depends on it succeeding - the stored fallback is always
// a usable answer.
export async function publishFxRates(supabase, rates) {
  const clean = Object.fromEntries(
    Object.entries(rates || {}).filter(([, v]) => Number.isFinite(v) && v > 0),
  )
  if (!Object.keys(clean).length) return
  try {
    await supabase.from('app_settings').upsert({
      key: 'fx_rates',
      value: { base: 'GBP', ...clean },
      updated_at: new Date().toISOString(),
    })
  } catch { /* a stale rate is fine; a broken page is not */ }
}

/**
 * Total a set of reward rows into one figure.
 *
 * `rewards.amount` is a bare number and `rewards.currency` says what it is, so
 * summing amounts alone adds pounds to euros. The old Rewards page did exactly
 * that and then printed the result with a hardcoded GBP default, so a creator
 * paid EUR 40 and GBP 50 was shown "GBP 90" - wrong twice over.
 *
 * When every row settles in the same currency that currency is reported back
 * untouched: a creator checking what they were paid should see the figure that
 * actually landed, not a conversion of it. Only a genuinely mixed set needs a
 * common currency, and that result is marked `converted` so the caller can say
 * so rather than claiming a precision the FX rate does not have.
 *
 * @returns {{amount:number, currency:string, converted:boolean}}
 */
export function rewardsTotal(rows, to = 'EUR', rates = FALLBACK_RATES) {
  const list = (rows || []).filter((r) => r && r.amount != null && Number.isFinite(Number(r.amount)))
  if (!list.length) return { amount: 0, currency: to, converted: false }

  const currencies = new Set(list.map((r) => r.currency || to))
  const total = list.reduce((sum, r) => sum + (convert(r.amount, r.currency || to, to, rates) || 0), 0)
  const converted = !(currencies.size === 1 && currencies.has(to))

  // ALWAYS REPORTED IN THE ONE CURRENCY, AND NEVER IN CENTS.
  //
  // The programme settles in euros, so the euro figure is the one a creator is
  // being asked to recognise even when the row behind it was paid in pounds.
  // Ethan: "force-converted to euros regardless, but round it to nearest euro,
  // never give cents for this."
  //
  // Rounding is not cosmetic. A converted total moves with the FX rate, so
  // "EUR 292.50" claims a precision that would be a different number tomorrow
  // with nothing having happened. Whole euros say the size of the thing and
  // stop pretending to be a bank statement. The per-reward rows below the
  // total still show exactly what was paid, in the currency it was paid in.
  return { amount: Math.round(total), currency: to, converted }
}
