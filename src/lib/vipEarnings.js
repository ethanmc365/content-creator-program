// VIP earnings, folded from the rows `admin_vip_earnings` returns (one per creator per month). Pure, so it is tested.
// A month's PAID is views pay plus fees and bonuses; CPM is views pay per 1,000 views (what the views themselves bought).

export const monthKey = (r) => `${r.year}-${String(r.month).padStart(2, '0')}`
export function monthShort(year, month) {
  return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString('en-GB', { month: 'short', year: '2-digit', timeZone: 'UTC' })
}

export function median(list) {
  const v = list.filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  if (!v.length) return 0
  const mid = Math.floor(v.length / 2)
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2
}

const num = (n) => Number(n) || 0

/** One entry per creator, richest first. A month with no views and no pay is not a paid month. */
export function earningsByCreator(rows) {
  const by = new Map()
  for (const r of rows) {
    // A platform month with nothing in it (a closed month nobody posted in) is not a month they were paid.
    if (!num(r.views) && !num(r.pay) && !num(r.extra)) continue
    const k = r.key
    if (!by.has(k)) by.set(k, { key: k, name: r.name, short: r.short || (r.name || '').split(' ')[0], photo: r.photo_url, kind: r.kind, onPlatform: !!r.profile_id, byMonth: {}, rate: 0 })
    const c = by.get(k)
    // The platform's own name wins over the sheet's short one once both are seen.
    if (r.profile_id) { c.name = r.name; c.photo = r.photo_url; c.kind = r.kind }
    if (r.short && r.source === 'sheet') c.short = r.short
    const mk = monthKey(r)
    const cell = c.byMonth[mk] || { key: mk, year: r.year, month: r.month, label: monthShort(r.year, r.month), views: 0, pay: 0, extra: 0, paid: 0, live: false }
    cell.views += num(r.views); cell.pay += num(r.pay); cell.extra += num(r.extra); cell.paid = cell.pay + cell.extra
    cell.live = cell.live || !!r.live
    c.byMonth[mk] = cell
  }
  return [...by.values()].map((c) => {
    const list = Object.values(c.byMonth).sort((a, b) => a.key.localeCompare(b.key))
    const paidMonths = list.filter((m) => m.paid > 0 || m.views > 0)
    const views = list.reduce((s, m) => s + m.views, 0)
    const pay = list.reduce((s, m) => s + m.pay, 0)
    const paid = list.reduce((s, m) => s + m.paid, 0)
    const best = paidMonths.reduce((b, m) => (m.paid > (b?.paid ?? -1) ? m : b), null) || { paid: 0, label: '-' }
    const lastRated = [...list].reverse().find((m) => m.views > 0 && m.pay > 0)
    return {
      ...c,
      list,
      views, pay, paid,
      active: paidMonths.length,
      cpm: views > 0 ? (pay / views) * 1000 : 0,
      rate: lastRated ? (lastRated.pay / lastRated.views) * 1000 : 0,
      avg: paidMonths.length ? paid / paidMonths.length : 0,
      avgViews: paidMonths.length ? views / paidMonths.length : 0,
      median: median(paidMonths.map((m) => m.paid)),
      medianViews: median(paidMonths.map((m) => m.views)),
      best,
    }
  }).sort((a, b) => b.paid - a.paid)
}

/** One entry per calendar month, oldest first, with the number of creators paid in it. */
export function earningsByMonth(rows) {
  const by = new Map()
  for (const r of rows) {
    const k = monthKey(r)
    if (!by.has(k)) by.set(k, { key: k, year: r.year, month: r.month, label: monthShort(r.year, r.month), views: 0, pay: 0, extra: 0, paid: 0, who: new Set(), live: false })
    const m = by.get(k)
    m.views += num(r.views); m.pay += num(r.pay); m.extra += num(r.extra); m.paid = m.pay + m.extra
    if (num(r.views) > 0 || num(r.pay) + num(r.extra) > 0) m.who.add(r.key)
    m.live = m.live || !!r.live
  }
  return [...by.values()].sort((a, b) => a.key.localeCompare(b.key)).map(({ who, ...m }) => ({ ...m, creators: who.size }))
}

export function earningsTotals(creators, months) {
  const paid = creators.reduce((s, c) => s + c.paid, 0)
  const pay = creators.reduce((s, c) => s + c.pay, 0)
  const views = creators.reduce((s, c) => s + c.views, 0)
  const cells = creators.flatMap((c) => c.list.filter((m) => m.paid > 0 || m.views > 0))
  const live = months.find((m) => m.live) || null
  const closed = months.filter((m) => !m.live)
  const last = closed[closed.length - 1] || null
  const best = months.reduce((b, m) => (m.paid > (b?.paid ?? -1) ? m : b), null)
  return {
    paid, views,
    cpm: views > 0 ? (pay / views) * 1000 : 0,
    creators: creators.filter((c) => c.paid > 0 || c.views > 0).length,
    onPlatform: creators.filter((c) => c.onPlatform).length,
    creatorMonths: cells.length,
    avgCreatorMonth: cells.length ? cells.reduce((s, m) => s + m.paid, 0) / cells.length : 0,
    medianCreatorMonth: median(cells.map((m) => m.paid)),
    avgMonth: months.length ? paid / months.length : 0,
    medianMonth: median(months.map((m) => m.paid)),
    bestCell: Math.max(0, ...cells.map((m) => m.paid)),
    best,
    live: live ? { label: live.label, paid: live.paid } : null,
    lastPaid: last?.paid || 0,
    lastLabel: last?.label || '-',
    firstLabel: months[0]?.label || '-',
  }
}
