import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { getLocale } from './i18n'

// THE VIP PROGRAMME, AWAY FROM THE SCREENS (2 Oct 2026, migration 294).
//
// VIP creators are paid by the views they bring, not by winning challenges. Everything that decides a
// number (views gained in a month, tiers, caps, bonuses, the statement) is computed IN THE DATABASE so the
// creator's screen, the team's screen and the invoice can never disagree; this file is only the plumbing
// the screens share: calling those functions, naming months, and describing the rules in words.

/** Call a database function and throw its message (the functions write them for a person to read). */
export async function vipRpc(fn, args) {
  const { data, error } = await supabase.rpc(fn, args)
  if (error) throw new Error(error.message)
  return data
}

const localeTag = () => (getLocale() === 'pt' ? 'pt-PT' : getLocale() === 'en' ? 'en-GB' : getLocale())

/** "September 2026", in the reader's language. */
export function monthLabel(year, month, { short = false } = {}) {
  try {
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(localeTag(), {
      month: short ? 'short' : 'long', year: short ? '2-digit' : 'numeric', timeZone: 'UTC',
    })
  } catch { return `${year}-${String(month).padStart(2, '0')}` }
}

/** Whole days between now and a timestamp, never negative. */
export function daysLeft(endsAt, now = Date.now()) {
  return Math.max(0, Math.ceil((Date.parse(endsAt) - now) / 86400000))
}

/** A month's progress, 0 to 1, by the clock. */
export function monthProgress(startsAt, endsAt, now = Date.now()) {
  const a = Date.parse(startsAt)
  const b = Date.parse(endsAt)
  return Math.max(0, Math.min(1, (now - a) / Math.max(1, b - a)))
}

/** A plain amount with its currency: 1,234.50. The symbol comes from Intl so it follows the language. */
export function money(amount, currency = 'EUR', { cents = true } = {}) {
  const n = Number(amount) || 0
  try {
    return new Intl.NumberFormat(localeTag(), {
      style: 'currency', currency, minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0,
    }).format(n)
  } catch { return `${currency} ${n.toFixed(cents ? 2 : 0)}` }
}

/** A per-1,000 rate: 0.25, not 0.2500. */
export const rate = (n) => String(Number(Number(n).toFixed(4)))

export const nf = (n) => Number(n || 0).toLocaleString(localeTag())

/** The link a VIP is sent to sign up with. */
export function vipJoinUrl(token) {
  return `${window.location.origin}/vip/join/${token}`
}

// What the rules are, as data the screens and the editor share.
export const BONUS_KINDS = [
  { key: 'target', label: 'Hit your target', hint: 'Each creator who reaches their own monthly target', icon: 'trophy', scope: 'creator' },
  { key: 'top_n', label: 'Top of the month', hint: 'Most views, paid by place', icon: 'chart', scope: 'ranked' },
  { key: 'best_video', label: 'Best single video', hint: 'The month\'s most-viewed video', icon: 'video', scope: 'ranked' },
  { key: 'streak', label: 'Consistency streak', hint: 'Posted enough videos every month for a run of months', icon: 'fire', scope: 'creator' },
  { key: 'milestone', label: 'Milestone', hint: 'A one-off for reaching a total, such as 1M views', icon: 'flag', scope: 'creator' },
]

export const SCOPES = [
  { key: 'market', label: 'This market\'s VIPs' },
  { key: 'global', label: 'Every VIP, all markets' },
]

export const MILESTONE_METRICS = [
  { key: 'lifetime_views', label: 'Total views as a VIP' },
  { key: 'lifetime_videos', label: 'Total videos as a VIP' },
  { key: 'month_earnings', label: 'Earnings in one month' },
]

// Why a statement needs a second look, in words. (Views jumping overnight is normal on TikTok and is
// deliberately NOT a flag.)
export const FLAGS = {
  no_payment_details: 'No payment details yet',
  not_active: 'Not an active VIP',
  no_views: 'No views counted',
  video_disqualified: 'A video was disqualified this month',
  unreadable_video: 'A video could not be read',
}

/** The bonus rule in one sentence a creator can read. */
export function describeRule(rule, tr, currency = 'EUR') {
  const pay = (amt, reward) => (reward === 'voucher'
    ? tr('a {a} voucher', { a: money(amt, currency, { cents: false }) })
    : money(amt, currency, { cents: false }))
  const c = rule.conditions || {}
  if (rule.kind === 'target') {
    const extra = rule.multiplier ? tr('plus {x} on your views pay', { x: `x${rate(rule.multiplier)}` }) : ''
    return [tr('Reach your monthly target and earn {p}', { p: pay(rule.amount, rule.reward) }), extra].filter(Boolean).join(', ')
  }
  if (rule.kind === 'top_n') {
    const places = (rule.places || []).map((p) => `#${p.place}: ${pay(p.amount, p.reward || rule.reward)}`).join(' · ')
    return tr('Most views {scope}. {places}', { scope: rule.scope === 'global' ? tr('across every VIP') : tr('in your market'), places })
  }
  if (rule.kind === 'best_video') {
    return tr('The most-viewed video {scope} earns {p}', { scope: rule.scope === 'global' ? tr('across every VIP') : tr('in your market'), p: pay(rule.amount, rule.reward) })
  }
  if (rule.kind === 'streak') {
    return tr('Post at least {n} videos in each of {m} months in a row: {p}', {
      n: c.min_videos || 1, m: c.months || 3,
      p: [c.pct ? tr('{x}% on your views pay', { x: c.pct }) : '', rule.amount > 0 ? pay(rule.amount, rule.reward) : ''].filter(Boolean).join(' + '),
    })
  }
  const metric = c.metric || 'lifetime_views'
  const what = metric === 'lifetime_views' ? tr('{n} views in total', { n: nf(c.threshold) })
    : metric === 'lifetime_videos' ? tr('{n} videos in total', { n: nf(c.threshold) })
      : tr('{n} earned in one month', { n: money(c.threshold, currency, { cents: false }) })
  return tr('Reach {what}: {p}, once', { what, p: pay(rule.amount, rule.reward) })
}

// ONE SHARED COPY OF "MY VIP NUMBERS" (the hub and the home card both read it).
let cache = null
let cacheAt = 0
const subs = new Set()
const notify = () => subs.forEach((fn) => fn())
const snapshot = () => cache

/** The signed-in VIP's overview. `undefined` while loading, `null` when they are not a VIP. */
export function useVipOverview({ enabled = true, every = 60000 } = {}) {
  const data = useSyncExternalStore((fn) => { subs.add(fn); return () => subs.delete(fn) }, snapshot, () => undefined)
  const [error, setError] = useState('')
  const reload = useCallback(async () => {
    try {
      const d = await vipRpc('vip_my_overview')
      cache = { value: d }
      cacheAt = Date.now()
      setError('')
      notify()
    } catch (e) { setError(e.message) }
  }, [])
  useEffect(() => {
    if (!enabled) return undefined
    if (!cache || Date.now() - cacheAt > 15000) reload()
    const id = setInterval(reload, every)
    return () => clearInterval(id)
  }, [enabled, every, reload])
  return { overview: data ? data.value : undefined, error, reload }
}

/** Forget what was loaded (sign-out, or after the team changes who is a VIP). */
export function clearVipCache() { cache = null; cacheAt = 0; notify() }

// The terms a VIP accepts once (and again when the programme raises the version). Written as sentences so
// each one is translated on its own; the team can replace the lot with its own text on the programme.
export const DEFAULT_TERMS = [
  'You are paid for the views your videos gain during each calendar month, at the rate on your VIP page. Views from before you added a video, or from before the month began, are not counted.',
  'A video counts if it is public, posted on your own account within the last {days} days, and mentions or tags Tryp.com as agreed with the team. Reposts of an earlier video do not count.',
  'At the end of each month we take a final reading of your views, draft your statement and, once it is approved, your invoice. Small amounts below the minimum payout carry over to the next month.',
  'Bought, botted or otherwise artificial views mean the videos are removed from your total, and may end your place in the programme.',
  'You need payment details saved on your account to be paid. The programme can be paused or ended by either side at any time; months already closed are still paid.',
]

// WHO HAS THE VIP TOOLS (30 Sep 2026, migration 296). The owner and anyone on the access list; the database is
// the judge (`vip_has_access`), this only remembers the answer for the session so the header and the admin
// panel do not each ask. `undefined` while loading, then true/false.
let accessCache = { uid: null, value: undefined }
const accessSubs = new Set()
// `fallback` is what to show if the question itself cannot be answered (a network blip, or the database not yet
// carrying migration 296): the door is only a convenience, the data behind it is fenced by the database either way.
export function useVipAccess(uid, fallback = false) {
  const value = useSyncExternalStore(
    (fn) => { accessSubs.add(fn); return () => accessSubs.delete(fn) },
    () => (accessCache.uid === uid ? accessCache.value : undefined),
    () => undefined,
  )
  useEffect(() => {
    if (!uid || (accessCache.uid === uid && accessCache.value !== undefined)) return
    let alive = true
    supabase.rpc('vip_has_access').then(({ data, error }) => {
      if (!alive) return
      accessCache = { uid, value: error ? fallback : !!data }
      accessSubs.forEach((fn) => fn())
    })
    return () => { alive = false }
  }, [uid, fallback])
  return value
}

/** Forget the answer (after the owner changes who has access). */
export function clearVipAccess() { accessCache = { uid: null, value: undefined }; accessSubs.forEach((fn) => fn()) }

// ---------------------------------------------------------------- VIP v2 (migration 298)

/** Why somebody is on the "needs a nudge" list, in words. */
export const ATTENTION = {
  no_payment: 'No payment details yet',
  no_terms: 'Terms not accepted',
  quiet: 'No new video for ten days',
  sync_error: 'A video could not be read',
}

/** One line for an entry in the timeline. `e` is a row of `vip_timeline`; `tr` is the translator. */
export function describeEvent(e, tr, currency = 'EUR') {
  const d = e.detail || {}
  switch (e.kind) {
    case 'joined': return d.source === 'invite' ? tr('Joined with a VIP link') : d.source === 'transfer' ? tr('Moved from the community to VIP') : tr('Made a VIP')
    case 'rejoined': return tr('Moved from the community back to VIP')
    case 'left': return tr('Moved back to the community')
    case 'paused': return tr('VIP place paused')
    case 'resumed': return tr('VIP place resumed')
    case 'moved': return tr('Moved to another programme')
    case 'rate_changed': return d.to == null ? tr('Back on the programme rate') : tr('Own rate set to {r} per 1,000', { r: `${currency} ${rate(d.to)}` })
    case 'cap_changed': return d.to == null ? tr('Monthly cap removed') : tr('Monthly cap set to {a}', { a: money(d.to, currency, { cents: false }) })
    case 'target_changed': return tr('Targets changed')
    default: return tr('Changed')
  }
}

/** The icon that goes with a timeline kind. */
export const EVENT_ICON = {
  joined: 'plus', rejoined: 'plus', left: 'users', paused: 'clock', resumed: 'refresh', moved: 'globe',
  rate_changed: 'money', cap_changed: 'money', target_changed: 'trophy',
}

/**
 * A new (migration 298) database function, asked for politely: if the database does not have it yet the answer is
 * `missing`, and the caller simply draws nothing instead of an error. `key` re-asks when it changes.
 */
export function useOptionalRpc(fn, args, key) {
  const [state, setState] = useState({ data: undefined, missing: false })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    setState((s) => ({ data: key === undefined ? s.data : undefined, missing: false }))
    supabase.rpc(fn, args).then(({ data, error }) => {
      if (!alive) return
      if (error) setState({ data: null, missing: /could not find the function|does not exist|schema cache/i.test(error.message) })
      else setState({ data, missing: false })
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn, key, tick])
  return { ...state, reload: () => setTick((n) => n + 1) }
}

/** "12 Sep", in the reader's language, from a plain date like 2026-09-12. */
export function shortDay(iso) {
  try { return new Date(`${iso}T12:00:00Z`).toLocaleDateString(localeTag(), { day: 'numeric', month: 'short', timeZone: 'UTC' }) } catch { return iso }
}
