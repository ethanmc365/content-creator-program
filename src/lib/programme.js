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
  // "NOT MEASURED" AND "MEASURED AS NONE" ARE DIFFERENT NUMBERS (7 Sep 2026).
  //
  // This was `Number(row.total_views) || 0`, which collapses the two, and the
  // collapse is worth a quarter of the programme's headline figure.
  //
  // Fourteen of the forty-nine imported challenges are marked Done in Ethan's
  // spreadsheet with NO view count - "Need to log views", "Views not logged in
  // source sheet". Their prize money is real and their views are unknown. Read
  // as zero, they contributed EUR 1,730 of spend to the numerator of the
  // programme CPM and nothing at all to the denominator, so the page reported
  // EUR 0.47 where Ethan's own tracker says EUR 0.38. Both were "correct"
  // arithmetic; only one of them divides like by like.
  //
  // `viewsKnown` is the distinction, and `blendEconomics` uses it to keep the
  // CPM's numerator and denominator over the SAME set of challenges. A LIVE
  // challenge is always known - the RPC coalesces its submissions to 0, and a
  // running challenge that has genuinely earned no views yet SHOULD drag the
  // CPM, because that is a real result and not a missing one.
  const viewsKnown = row.total_views != null
  const views = viewsKnown ? Number(row.total_views) || 0 : null
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
    viewsKnown,
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

  // EVERY RATIO DIVIDES LIKE BY LIKE. See the note on `viewsKnown` above: a
  // challenge whose views were never recorded contributes neither its spend nor
  // its views to a per-view figure, because including one without the other is
  // how a CPM ends up a quarter too high and still looks plausible.
  //
  // `spend` above is still EVERY challenge, and that is deliberate - the money
  // left the account whether or not anybody counted the views, so the "cash
  // prizes" figure must not quietly shrink. It is only the DIVISION that is
  // restricted.
  const measured = rows.filter((r) => r.viewsKnown !== false)
  const views = measured.reduce((s, r) => s + (r.views || 0), 0)
  const measuredSpend = measured.filter((r) => r.spend != null).reduce((s, r) => s + r.spend, 0)
  const measuredCash = measured.reduce((s, r) => s + (r.cashSpend || 0), 0)
  const measuredVoucher = measured.reduce((s, r) => s + (r.voucherSpend || 0), 0)
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
    cashCpm: views > 0 && measuredCash > 0 ? measuredCash / (views / 1000) : null,
    combinedCpm: views > 0 && measuredCash + measuredVoucher > 0
      ? (measuredCash + measuredVoucher) / (views / 1000) : null,
    cpm: views > 0 ? measuredSpend / (views / 1000) : null,
    // How many challenges the per-view figures are actually over, so the page
    // can say so rather than implying they cover everything.
    measuredChallenges: measured.length,
    unmeasuredChallenges: rows.length - measured.length,
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


// FINDING ONE CHALLENGE IN FIFTY.
//
// Pulled out of the Challenges tab so it can be tested, because it is the kind
// of code that looks obviously right and has three off-by-one decisions in it:
// what a search matches, where a null CPM sorts, and whether a live challenge
// appears twice.
//
// `exclude` is the set of ids already pinned above the list as running. Without
// it the live challenge is drawn once at the top and again in date order, which
// is the bug this argument exists to prevent.
export function filterChallenges(rows, { query = '', status = 'all', sort = 'recent', exclude } = {}) {
  const q = query.trim().toLowerCase()
  const out = rows.filter((r) => {
    if (exclude?.has(r.id)) return false
    if (status !== 'all' && r.status !== status) return false
    if (!q) return true
    // TITLE, MARKET AND COUNTRY, not just the title. Half these rows are named
    // "Spain Monthly - 2026-08" and the other half are not named at all, so a
    // title-only search cannot find an imported row by where it happened.
    return `${r.title ?? ''} ${r.market ?? ''} ${r.country_code ?? ''}`.toLowerCase().includes(q)
  })

  // A challenge with no views has no CPM, and sorting nulls to the top of
  // "cheapest" would put every unmeasured challenge above every real answer.
  const last = (v) => (v == null || Number.isNaN(v) ? Infinity : v)
  if (sort === 'cpm') return out.sort((a, b) => last(a.cpm) - last(b.cpm))
  if (sort === 'spend') return out.sort((a, b) => (b.spend || 0) - (a.spend || 0))
  if (sort === 'views') return out.sort((a, b) => (b.views || 0) - (a.views || 0))
  return out.sort((a, b) => String(b.start_date || '').localeCompare(String(a.start_date || '')))
}

// WHAT IS ACTUALLY RUNNING, WHICH IS A QUESTION ABOUT THE CALENDAR AND NOT
// ABOUT A STORED STATUS.
//
// Ethan (9 Sep 2026): "I like the running now that shows the ones that are
// currently running... this should obviously update for anyone that are running
// live in the community, not just ones that have been added from the other
// platform."
//
// THE BUG BEHIND THAT SENTENCE, MEASURED. The pinned block was
// `status === 'active' || 'draft' || 'scheduled'`, and `admin_challenge_metrics`
// maps a logged challenge's `running` onto `active`. Nobody goes back into the
// imported log to close a challenge off, so on the day this was written the
// three rows under "Running now" were Portugal's June, Germany's July and the
// UK's July - the newest of them five weeks finished - and there was no fourth
// row for anything on the platform. The section was not preferring the imported
// rows; it was showing whatever had been left switched on, and the imported
// rows are the only ones nobody switches off.
//
// So the dates decide, and the status only says whether the row is a contest at
// all. That answers both halves at once: a platform challenge that goes live
// appears here the moment its start date passes, and an imported one stops
// appearing the day after it ends, with nobody having to remember either.
//
// `draft` IS DELIBERATELY NOT RUNNING. A draft is not published to anybody -
// "running live in the community" is exactly what it is not - and the metrics
// RPC does not return platform drafts in the first place.
//
// Returns the rows in start order with `phase` on each: 'live' for a contest
// inside its window, 'soon' for one whose start date has not arrived. Both pin,
// because a challenge opening on Friday is something an admin wants at the top
// of the page, and they are labelled differently because they are different.
const RUNNABLE = new Set(['active', 'upcoming', 'scheduled'])

export function runningChallenges(rows, now = Date.now()) {
  const t = now instanceof Date ? now.getTime() : now
  // END OF DAY, NOT START OF IT. `end_date` on a logged challenge is a bare
  // date, so comparing it to a timestamp retires a challenge at midnight on the
  // morning of the day it is still open for entries.
  const endOf = (d) => {
    const ms = Date.parse(d)
    return Number.isNaN(ms) ? null : ms + 86_400_000
  }
  const startOf = (d) => {
    const ms = Date.parse(d)
    return Number.isNaN(ms) ? null : ms
  }
  return (rows ?? [])
    .filter((r) => RUNNABLE.has(r.status))
    .map((r) => {
      const ends = endOf(r.end_date)
      const starts = startOf(r.start_date)
      // A MISSING END DATE IS NOT AN EXPIRED ONE. Some imported rows have no
      // window at all; those keep whatever their status claims rather than
      // being silently retired by a date that was never recorded.
      if (ends != null && ends <= t) return null
      return { ...r, phase: starts != null && starts > t ? 'soon' : 'live' }
    })
    .filter(Boolean)
    .sort((a, b) => String(a.start_date || '').localeCompare(String(b.start_date || '')))
}
