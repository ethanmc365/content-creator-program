import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { getLocale, t as translate, useLocale } from './i18n'

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

// THE TEAM, SEEING A CREATOR'S VIP PAGE EXACTLY (2 Oct 2026, migration 311). Inside a <VipPreviewContext value={id}>
// every creator read on the VIP page (overview, statements, trends, perks, board) is asked for AS THAT MEMBER through
// `vip_preview`, which the database only answers for somebody who manages their market. Writes are never routed: a
// preview is read-only, and the components check `useVipPreview()` to grey their buttons.
export const VipPreviewContext = createContext(null)
export const useVipPreview = () => useContext(VipPreviewContext)
const PREVIEW_AS = { vip_my_overview: 'overview', vip_my_statements: 'statements', vip_my_trends: 'trends', vip_my_perks: 'perks', vip_board: 'board', vip_my_wallet: 'wallet' }

/** `vipRpc`, as the previewed member when `who` is set and the function is one of the creator's own reads. */
export function vipRpcAs(who, fn, args) {
  if (who && PREVIEW_AS[fn]) return vipRpc('vip_preview', { p_who: who, p_what: PREVIEW_AS[fn], p_days: args?.p_days ?? 30 })
  return vipRpc(fn, args)
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

/** A per-1,000 rate, always with its cents: 0.30, not 0.3; 0.257, not 0.2567 (3 Oct 2026, Ethan: "show 0.30 for a
 *  thousand views, so it's clear ... round it to three decimal places"). */
export const rate = (n) => {
  const v = Number(n) || 0
  return v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 3, useGrouping: false })
}

/** The currency's own sign: € for EUR. */
export function curSym(currency = 'EUR') {
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency, currencyDisplay: 'narrowSymbol' }).formatToParts(0).find((x) => x.type === 'currency')?.value || currency
  } catch { return currency }
}

/** A rate per 1,000 views with its currency sign: €0.30. */
export function perK(n, currency = 'EUR') {
  try {
    return new Intl.NumberFormat(localeTag(), { style: 'currency', currency, minimumFractionDigits: 2, maximumFractionDigits: 3 }).format(Number(n) || 0)
  } catch { return `${currency} ${rate(n)}` }
}

export const nf = (n) => Number(n || 0).toLocaleString(localeTag())

/** The link a VIP is sent to sign up with. */
export function vipJoinUrl(token) {
  return `${window.location.origin}/vip/join/${token}`
}

// What the rules are, as data the screens and the editor share.
export const BONUS_KINDS = [
  { key: 'target', label: 'Hit your target', hint: 'Each creator who reaches the monthly target you set for them', icon: 'trophy', scope: 'creator' },
  { key: 'top_n', label: 'Top of the month', hint: 'Most views, paid by place', icon: 'chart', scope: 'ranked' },
  { key: 'best_video', label: 'Best single video', hint: 'The month\'s most-viewed video', icon: 'video', scope: 'ranked' },
  { key: 'streak', label: 'Consistency streak', hint: 'Posts enough videos in each of several months in a row', icon: 'fire', scope: 'creator' },
  { key: 'milestone', label: 'Milestone', hint: 'A one-off for reaching a total, such as 1M views', icon: 'flag', scope: 'creator' },
]

export const SCOPES = [
  { key: 'market', label: 'This market\'s VIPs' },
  { key: 'global', label: 'Every VIP market' },
]

// WHAT A MILESTONE CAN BE (4 Oct 2026, migration 322). Ethan: "the milestone has a few options, but I would increase those
// options." Each one is a number the database already knows how to read for a creator (vip_metric / the month's statement),
// so a milestone on any of them is paid by itself when the month closes. `unit` says how the number is written.
export const MILESTONE_METRICS = [
  { key: 'lifetime_views', label: 'Total views as a VIP', unit: 'views', noun: 'views in total', example: 1000000 },
  { key: 'lifetime_videos', label: 'Total videos as a VIP', unit: 'videos', noun: 'videos in total', example: 50 },
  { key: 'month_views', label: 'Views in a single month', unit: 'views', noun: 'views in one month', example: 100000 },
  { key: 'month_videos', label: 'Videos in a single month', unit: 'videos', noun: 'videos in one month', example: 15 },
  { key: 'best_video_views', label: 'Views on one video', unit: 'views', noun: 'views on a single video', example: 100000 },
  { key: 'month_earnings', label: 'Earnings in a single month', unit: 'money', noun: 'earned in one month', example: 500 },
  { key: 'lifetime_earnings', label: 'Total earned as a VIP', unit: 'money', noun: 'earned in total', example: 2000 },
  { key: 'months_active', label: 'Months as a VIP', unit: 'months', noun: 'months as a VIP', example: 6 },
  { key: 'streak_months', label: 'Months posting in a row', unit: 'months', noun: 'months posting in a row', example: 6 },
]

/** The number of a milestone, written for its unit: "1,000,000 views", "50 videos", "EUR 500", "6 months". */
export function metricAmount(metricKey, n, tr, currency = 'EUR') {
  const m = MILESTONE_METRICS.find((x) => x.key === metricKey) || MILESTONE_METRICS[0]
  if (m.unit === 'money') return money(n, currency, { cents: false })
  if (m.unit === 'videos') return tr('{n} videos', { n: nf(n) })
  if (m.unit === 'months') return tr('{n} months', { n: nf(n) })
  return tr('{n} views', { n: nf(n) })
}

// Why a statement needs a second look, in words. (Views jumping overnight is normal on TikTok and is
// deliberately NOT a flag.)
export const FLAGS = {
  no_payment_details: 'No payment details yet',
  not_active: 'Not an active VIP',
  no_views: 'No views counted',
  video_disqualified: 'A video was disqualified this month',
  unreadable_video: 'A video could not be read',
  missed_requirement: 'Missed the monthly requirement',
}

/** The bonus rule in one sentence a creator can read. */
// OFFICIAL TRYP.COM CREATORS (10 Oct 2026, migration 376). A programme has a kind: 'vip' (a market's VIP community) or
// 'official' (the official Tryp.com content creators of a market, on their own contract). Same machinery, own board,
// own bonuses, own room - so the screens only need to know which words to use.
export const isOfficial = (p) => p?.kind === 'official'
/** The words a page uses for a programme's people: "VIP" / "official creator". */
export function kindWords(kind, tr) {
  return kind === 'official'
    ? { title: tr('Official'), people: tr('official creators'), one: tr('official creator'), Room: tr('Official creators') }
    : { title: tr('VIP'), people: tr('VIPs'), one: tr('VIP'), Room: tr('VIP room') }
}

// THE OFFICIAL CREATORS' WORDS, EVERYWHERE A VIP SCREEN IS REUSED (11 Oct 2026). The official programme runs on the VIP
// machinery, so its screens are the VIP screens - and they said "VIP" a hundred times ("Active VIPs", "Tell your VIPs
// something"). Rather than a second copy of every sentence, a page or a tools panel says which kind it shows with
// <ProgrammeKindContext value="official">, and `useKindT()` translates as usual and then swaps the word in the TEMPLATE,
// before the names are filled in - so "VIP Spain" in a programme's name is never touched. One table per language, most
// specific phrase first.
export const ProgrammeKindContext = createContext('vip')
const KIND_SWAPS = {
  en: [
    [/^VIP page$/, 'Your page'], [/\bVIP tools\b/gi, 'tools'], [/\bVIP page\b/gi, 'page'], [/\bthe VIP community\b/gi, 'the official creators'],
    [/\bVIP community\b/gi, 'official creators'], [/\bevery VIP market\b/gi, 'every official programme'],
    [/\bVIP markets\b/gi, 'official programmes'], [/\bVIP market\b/gi, 'official programme'],
    [/\bVIP creators\b/gi, 'official creators'], [/\bVIP creator\b/gi, 'official creator'],
    [/\bVIPs\b/g, 'official creators'], [/\ba VIP\b/gi, 'an official creator'], [/\bVIP\b/g, 'official creator'],
  ],
  es: [
    [/^Página VIP$/, 'Tu página'], [/\bherramientas VIP\b/gi, 'herramientas'], [/\bpágina VIP\b/gi, 'página'], [/\bcomunidad VIP\b/gi, 'creadores oficiales'],
    [/\bmercados VIP\b/gi, 'programas oficiales'], [/\bmercado VIP\b/gi, 'programa oficial'],
    [/\bcreadores VIP\b/gi, 'creadores oficiales'], [/\bcreador VIP\b/gi, 'creador oficial'],
    [/\b(un|el|al|del|cada|otro) VIP\b/gi, '$1 creador oficial'], [/\bVIP\b/g, 'creadores oficiales'],
  ],
  pt: [
    [/^Página VIP$/, 'A tua página'], [/\bferramentas VIP\b/gi, 'ferramentas'], [/\bpágina VIP\b/gi, 'página'], [/\bcomunidade VIP\b/gi, 'criadores oficiais'],
    [/\bmercados VIP\b/gi, 'programas oficiais'], [/\bmercado VIP\b/gi, 'programa oficial'],
    [/\bcriadores VIP\b/gi, 'criadores oficiais'], [/\bcriador VIP\b/gi, 'criador oficial'],
    [/\b(um|o|ao|do|cada|outro) VIP\b/gi, '$1 criador oficial'], [/\bVIP\b/g, 'criadores oficiais'],
  ],
  de: [[/\bVIP-Tools\b/gi, 'Tools'], [/\bVIP-Märkte\b/gi, 'offiziellen Programme'], [/\bVIP-Markt\b/gi, 'offizielle Programm'], [/\bVIPs?\b/g, 'offizielle Creator']],
  ro: [[/\bpiețele VIP\b/gi, 'programele oficiale'], [/\bpiața VIP\b/gi, 'programul oficial'], [/\bVIP-urilor\b/g, 'creatorilor oficiali'], [/\bVIP-uri\b/g, 'creatori oficiali'], [/\bVIP\b/g, 'creatori oficiali']],
}
/** Keep the case of a match's first letter: "VIP market" -> "Official programme" at the start of a sentence. */
const keepCase = (to) => (match, ...rest) => {
  const offset = rest[rest.length - 2]
  const groups = rest.slice(0, -2)
  const text = to.replace(/\$(\d)/g, (_, i) => groups[Number(i) - 1] ?? '')
  // Capital when the sentence starts here, or when the matched word was a capitalised word ("Every", "Página") rather
  // than the acronym itself ("VIP" is always capitals, which says nothing about the sentence).
  const capital = offset === 0 || (match[0] !== match[0].toLowerCase() && match[1] === match[1]?.toLowerCase())
  return capital ? text.charAt(0).toUpperCase() + text.slice(1) : text
}
/** A translated template in the official creators' words (before {placeholders} are filled). */
export function officialWords(template, locale = getLocale()) {
  let out = template
  for (const [re, to] of KIND_SWAPS[locale] || KIND_SWAPS.en) out = out.replace(re, keepCase(to))
  return out
}
/** `useT()`, in the words of the programme kind the surrounding page or panel shows. */
export function useKindT(kindOverride) {
  const locale = useLocale()
  const fromPage = useContext(ProgrammeKindContext)
  const kind = kindOverride || fromPage
  return useMemo(() => {
    if (kind !== 'official') return (en, vars) => translate(en, vars)
    return (en, vars) => {
      let out = officialWords(translate(en), locale)
      if (vars) for (const k of Object.keys(vars)) out = out.split(`{${k}}`).join(String(vars[k] ?? ''))
      return out
    }
  }, [kind, locale])
}

export function describeRule(rule, tr, currency = 'EUR', { official = false } = {}) {
  const among = official ? tr('among the official creators') : null
  const pay = (amt, reward) => (reward === 'voucher'
    ? tr('a {a} voucher', { a: money(amt, currency, { cents: false }) })
    : money(amt, currency, { cents: false }))
  const c = rule.conditions || {}
  if (rule.kind === 'target') {
    const extra = rule.multiplier ? tr('plus {x}% on your views pay', { x: Math.round((Number(rule.multiplier) - 1) * 100) }) : ''
    return [tr('Reach the target set for you and earn {p}', { p: pay(rule.amount, rule.reward) }), extra].filter(Boolean).join(', ')
  }
  if (rule.kind === 'top_n') {
    const places = (rule.places || []).map((p) => `#${p.place}: ${pay(p.amount, p.reward || rule.reward)}`).join(' · ')
    return tr('Most views {scope}. {places}', { scope: among || (rule.scope === 'global' ? tr('across every VIP') : tr('in your market')), places })
  }
  if (rule.kind === 'best_video') {
    return tr('The most-viewed video {scope} earns {p}', { scope: among || (rule.scope === 'global' ? tr('across every VIP') : tr('in your market')), p: pay(rule.amount, rule.reward) })
  }
  if (rule.kind === 'streak') {
    return tr('Post at least {n} videos in each of {m} months in a row: {p}', {
      n: c.min_videos || 1, m: c.months || 3,
      p: [c.pct ? tr('{x}% on your views pay', { x: c.pct }) : '', rule.amount > 0 ? pay(rule.amount, rule.reward) : ''].filter(Boolean).join(' + '),
    })
  }
  const metric = c.metric || 'lifetime_views'
  const meta = MILESTONE_METRICS.find((x) => x.key === metric) || MILESTONE_METRICS[0]
  const amount = meta.unit === 'money' ? money(c.threshold, currency, { cents: false }) : nf(c.threshold)
  const what = `${amount} ${tr(meta.noun)}`
  return tr('Reach {what}: {p}, once', { what, p: pay(rule.amount, rule.reward) })
}

/** Whether a bonus rule applies to a month ({ id, year, month }): every month, that month's row, or a calendar month
 *  planned ahead (`for_year`/`for_month`, migration 318). */
export function ruleRunsIn(rule, when) {
  if (!when) return true
  if (rule.month_id) return rule.month_id === when.id
  if (rule.for_year) return rule.for_year === when.year && rule.for_month === when.month
  return true
}

/** The prizes by place from a programme's running "most views" rules, so a challenge never needs them typed twice
 *  (1 Oct 2026). [{ place: 1, parts: ['EUR 100', 'EUR 50 voucher'] }, ...] in place order. */
export function prizesByPlace(rules, tr, currency = 'EUR', when = null) {
  const out = {}
  for (const r of rules || []) {
    if (r.kind !== 'top_n' || r.active === false) continue
    if (when && !ruleRunsIn(r, when)) continue
    for (const p of r.places || []) {
      const voucher = p.reward === 'voucher' || (!p.reward && r.reward === 'voucher')
      const text = voucher ? tr('{a} voucher', { a: money(p.amount, currency, { cents: false }) }) : money(p.amount, currency, { cents: false })
      ;(out[p.place] = out[p.place] || []).push(text)
    }
  }
  return Object.keys(out).map(Number).sort((a, b) => a - b).map((place) => ({ place, parts: out[place] }))
}

// ONE SHARED COPY OF "MY VIP NUMBERS" (the hub and the home card both read it).
let cache = null
let cacheAt = 0
const subs = new Set()
const notify = () => subs.forEach((fn) => fn())
const snapshot = () => cache

/** The signed-in VIP's overview. `undefined` while loading, `null` when they are not a VIP. */
let retryTimer = 0
let lastReload = null
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
    } catch (e) {
      setError(e.message)
      // A first read that fails (the session still restoring after a reload) is asked again in a moment, not in a
      // minute: until it lands the page has nothing to draw.
      if (!cache) { clearTimeout(retryTimer); retryTimer = setTimeout(() => { retryTimer = 0; if (!cache) lastReload?.() }, 2000) }
    }
  }, [])
  useEffect(() => {
    lastReload = reload
    if (!enabled) return undefined
    if (!cache || Date.now() - cacheAt > 15000) reload()
    const id = setInterval(reload, every)
    return () => clearInterval(id)
  }, [enabled, every, reload])
  return { overview: data ? data.value : undefined, error, reload }
}

/** Forget what was loaded (sign-out, or after the team changes who is a VIP). */
export function clearVipCache() { cache = null; cacheAt = 0; rpcMemo.clear(); notify() }

// The terms a VIP accepts once (and again when the programme raises the version). Written as sentences so
// each one is translated on its own; the team can replace the lot with its own text on the programme.
export const DEFAULT_TERMS = [
  'You are paid for the views your videos gain during each calendar month, at the rate on your VIP page. Views from before you added a video, or from before the month began, are not counted.',
  'A video counts if it is public, posted on your own account during the month it is counted for, and mentions or tags Tryp.com as agreed with the team. Reposts of an earlier video do not count.',
  'At the end of each month we take a final reading of your views, draft your statement and, once it is approved, your invoice.',
  'Bought, botted or otherwise artificial views mean the videos are removed from your total, and may end your place in the programme.',
  'You need payment details saved on your account to be paid. The programme can be paused or ended by either side at any time; months already closed are still paid.',
]

// WHO HAS THE VIP TOOLS (30 Sep 2026, migration 296). The owner and anyone on the access list; the database is
// the judge (`vip_has_access`), this only remembers the answer for the session so the header and the admin
// panel do not each ask. `undefined` while loading, then true/false.
let accessCache = { uid: null, value: undefined, fresh: false }
const accessSubs = new Set()
// `fallback` is what to show if the question itself cannot be answered (a network blip, or the database not yet
// carrying migration 296): the door is only a convenience, the data behind it is fenced by the database either way.
//
// THE LAST ANSWER IS REMEMBERED ACROSS A RELOAD (7 Oct 2026). Ethan: "sometime after I refreshed the page ... the VIP
// page temporarily disappeared and then came back." Every reload started from `undefined`, so the VIP link in the
// header was not drawn and the page sat on a skeleton until `vip_has_access` came back - and a slow or failed first
// answer (the session still restoring) was cached as "no" for the whole session. Now the previous answer for this
// account is used straight away while the real one is asked, an error is retried instead of believed, and only a real
// answer is stored.
const ACCESS_KEY = (uid) => `tryp_vip_access_${uid}`
function rememberedAccess(uid) {
  if (!uid) return undefined
  try {
    const v = localStorage.getItem(ACCESS_KEY(uid))
    return v === '1' ? true : v === '0' ? false : undefined
  } catch { return undefined }
}
export function useVipAccess(uid, fallback = false) {
  const value = useSyncExternalStore(
    (fn) => { accessSubs.add(fn); return () => accessSubs.delete(fn) },
    () => (accessCache.uid === uid && accessCache.fresh ? accessCache.value : rememberedAccess(uid)),
    () => undefined,
  )
  useEffect(() => {
    if (!uid || (accessCache.uid === uid && accessCache.fresh)) return undefined
    let alive = true
    let tries = 0
    let timer = 0
    const ask = () => {
      supabase.rpc('vip_has_access').then(({ data, error }) => {
        if (!alive) return
        if (error && tries < 3) { tries += 1; timer = setTimeout(ask, 1500 * tries); return }
        const v = error ? (rememberedAccess(uid) ?? fallback) : !!data
        accessCache = { uid, value: v, fresh: true }
        if (!error) { try { localStorage.setItem(ACCESS_KEY(uid), v ? '1' : '0') } catch { /* private mode */ } }
        accessSubs.forEach((fn) => fn())
      })
    }
    ask()
    return () => { alive = false; clearTimeout(timer) }
  }, [uid, fallback])
  return value
}

/** Forget the answer (after the owner changes who has access). */
export function clearVipAccess() { accessCache = { uid: null, value: undefined, fresh: false }; accessSubs.forEach((fn) => fn()) }

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
// A READ THAT SURVIVES A RE-MOUNT (4 Oct 2026). Ethan: the VIP page's right column "comes in slower than the rest" and the
// whole page was slow to arrive. The balance card, the stay-in card and the payouts tab each asked `vip_my_wallet` on their
// own, every time they appeared. Now the last answer is kept per function/arguments/previewed member: a card that appears
// again starts from it at once (and refreshes behind it), and two cards asking in the same moment share one request.
const rpcMemo = new Map() // `${fn}|${who}|${key}` -> { data, at, pending }
const RPC_FRESH_MS = 8000
const rpcKey = (fn, who, key) => `${fn}|${who || ''}|${key ?? ''}`
function readOnce(fn, args, who, key, force) {
  const id = rpcKey(fn, who, key)
  const hit = rpcMemo.get(id)
  if (!force && hit?.pending) return hit.pending
  if (!force && hit && Date.now() - hit.at < RPC_FRESH_MS && hit.ok) return Promise.resolve(hit.result)
  const ask = who && PREVIEW_AS[fn]
    ? supabase.rpc('vip_preview', { p_who: who, p_what: PREVIEW_AS[fn], p_days: args?.p_days ?? 30 })
    : supabase.rpc(fn, args)
  const pending = Promise.resolve(ask).then((result) => {
    rpcMemo.set(id, { at: Date.now(), ok: !result.error, result, data: result.error ? hit?.data : result.data })
    return result
  })
  rpcMemo.set(id, { ...(hit || { at: 0 }), pending })
  return pending
}

export function useOptionalRpc(fn, args, key) {
  const who = useVipPreview()
  const id = rpcKey(fn, who, key)
  const [state, setState] = useState(() => {
    const hit = rpcMemo.get(id)
    return { data: hit && hit.data !== undefined ? hit.data : undefined, missing: false }
  })
  const [tick, setTick] = useState(0)
  useEffect(() => {
    let alive = true
    const hit = rpcMemo.get(id)
    setState((s) => (hit && hit.data !== undefined ? { data: hit.data, missing: false } : { data: key === undefined ? s.data : undefined, missing: false }))
    readOnce(fn, args, who, key, tick > 0).then(({ data, error }) => {
      if (!alive) return
      if (error) setState({ data: null, missing: /could not find the function|does not exist|schema cache/i.test(error.message) })
      else setState({ data, missing: false })
    })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fn, key, tick, who])
  return { ...state, reload: () => setTick((n) => n + 1) }
}

/** "12 Sep", in the reader's language, from a plain date like 2026-09-12. */
export function shortDay(iso) {
  try { return new Date(`${iso}T12:00:00Z`).toLocaleDateString(localeTag(), { day: 'numeric', month: 'short', timeZone: 'UTC' }) } catch { return iso }
}

// ---------------------------------------------------------------- VIP v3 (migration 299)

/** What a perk is unlocked by, as data the creator's screen and the team's editor share. */
export const PERK_METRICS = [
  { key: 'lifetime_views', label: 'Total views as a VIP', unit: 'views' },
  { key: 'lifetime_videos', label: 'Total videos as a VIP', unit: 'videos' },
  { key: 'best_video_views', label: 'Views on one video', unit: 'views' },
  { key: 'months_active', label: 'Months as a VIP', unit: 'months' },
  { key: 'streak_months', label: 'Months in a row with a video', unit: 'months' },
  { key: 'manual', label: 'Given by the team (no automatic unlock)', unit: '' },
]

export const PERK_KINDS = [
  { key: 'milestone', label: 'Milestone', icon: 'flag', hint: 'A goal to reach, such as 1 million views. Can pay out by itself.' },
  { key: 'perk', label: 'Perk', icon: 'sparkles', hint: 'A benefit, such as a feature on our page or editing tools.' },
  { key: 'trip', label: 'Trip', icon: 'plane', hint: 'A trip the team arranges. You mark it delivered.' },
]

export const BRIEF_METRICS = [
  { key: 'views', label: 'Most views this month', unit: 'views' },
  { key: 'videos', label: 'Most videos this month', unit: 'videos' },
  { key: 'best_video', label: 'Best single video', unit: 'views' },
]

/** "1,000 views", "6 months", in the reader's language. */
export function unitLabel(metricKey, n, tr, list = PERK_METRICS) {
  const unit = (list.find((m) => m.key === metricKey) || {}).unit
  if (unit === 'videos') return tr('{n} videos', { n: nf(n) })
  if (unit === 'months') return tr('{n} months', { n: nf(n) })
  return tr('{n} views', { n: nf(n) })
}

/** The one sign-up link every VIP uses. */
export function vipJoinLink(token) { return token ? vipJoinUrl(token) : '' }

/** Every VIP screen uses the platform's orange (1 Oct 2026: "I don't want different programme colours"). Kept as a
 *  function so old callers keep working; whatever colour is stored is ignored. */
export function safeAccent(_hex, fallback = '#d94407') {
  return fallback
}

/** A month's "year*12+month" number, for comparing months without dates. */
export const monthIndex = (year, month) => year * 12 + month

// The VIP programmes this person can see (every one for the access list, their own for a VIP, none for anybody
// else - the database decides), for the VIP communities card and the phone's market sheet.
export function useVipCommunities(profileId) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    if (!profileId) return undefined
    let alive = true
    supabase.from('vip_programmes').select('id, name, community:community_id(slug, country_codes)').eq('active', true).order('name')
      .then(({ data }) => { if (alive) setRows(data || []) })
    return () => { alive = false }
  }, [profileId])
  return rows
}

/** The slug of the VIP room the reader is in, from a path like /c/spain/chat/vip. */
export function vipSlugFromPath(pathname) {
  const m = /^\/c\/([^/]+)\/chat\/vip(?:_announcements)?(?:\/|$)/.exec(pathname || '')
  return m ? m[1] : null
}


