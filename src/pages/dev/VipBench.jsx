// A DEV-ONLY BENCH FOR THE VIP SCREENS (30 Sep 2026). Mounted at /__vip-bench under `import.meta.env.DEV`, so it is
// never in the production bundle.
//
// The real VIP pages read a database that, on a developer machine, is production - and it may not have the data (or
// even the functions) a screen needs to be looked at. So this swaps `supabase.rpc` and `supabase.from` for a stub that
// answers from the fixtures below, then renders the REAL pages: the creator's VIP hub and the team's VIP tools.
//   /__vip-bench?view=hub&tab=stats      the creator's side (tab: month | videos | stats | payouts | board | earn)
//   /__vip-bench?view=admin&tab=members  the team's side   (tab: overview | members | announcements | ...)
import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import VipHub from '../VipHub'
import AdminVip from '../admin/AdminVip'

const day = (n) => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)
const iso = (n) => new Date(Date.now() - n * 86400000).toISOString()

const PROGRAMME = { id: 'prog-1', community_id: 'comm-1', name: 'VIP Demo', currency: 'EUR', cpm: 0.25, tiers: [{ from_views: 1000000, cpm: 0.3 }], min_payout: 10, monthly_cap: null, budget_monthly: 900, window_days: 60, terms_version: 1, terms: null, active: true, community: { name: 'Spain', slug: 'spain' } }
const NAMES = ['Lucía', 'Carlos', 'Marina', 'Pablo', 'Sofía', 'Iker', 'Elena', 'Daniel']
const MEMBERS = NAMES.map((n, i) => ({
  profile_id: `p${i}`, name: `${n} Demo`, photo: null, status: i === 5 ? 'paused' : i === 6 ? 'left' : 'active', cpm: i === 1 ? 0.3 : null, cap: i === 0 ? 400 : null,
  target_videos: i < 5 ? 4 : null, target_views: i < 3 ? 250000 - i * 60000 : null, joined_on: day(60 - i * 6), source: i === 3 ? 'invite' : i === 2 ? 'transfer' : 'admin',
  terms_ok: i !== 7, payment_ready: i !== 7, lifetime_views: Math.round(1300000 / (i + 1)), notes: i === 0 ? 'Top performer. Prefers travel-hack videos.' : null,
  videos: 6 - Math.min(i, 4), views: Math.round(420000 / (i + 1)), base: Math.round(105 / (i + 1)), projected_base: Math.round(140 / (i + 1)),
}))
const daily = (mul) => Array.from({ length: 30 }, (_, k) => ({ d: day(29 - k), views: Math.round((8000 + 6000 * Math.sin(k / 3) + k * 450) * mul) }))
const TRENDS = { daily: daily(1), platforms: [{ platform: 'TikTok', videos: 14, views: 1180000 }, { platform: 'Instagram', videos: 9, views: 610000 }, { platform: 'YouTube', videos: 6, views: 240000 }], top: [] }
const RULES = [
  { id: 'r1', kind: 'top_n', label: 'Top of the month', scope: 'market', reward: 'cash', amount: 0, places: [{ place: 1, amount: 100 }, { place: 2, amount: 50 }, { place: 3, amount: 25 }], conditions: {}, active: true },
  { id: 'r2', kind: 'target', label: 'Hit your target', scope: 'creator', reward: 'cash', amount: 20, conditions: { own: true }, active: true },
  { id: 'r3', kind: 'milestone', label: 'Reach 1M views', scope: 'creator', reward: 'cash', amount: 150, conditions: { metric: 'lifetime_views', threshold: 1000000 }, active: true },
]
const ANNOUNCEMENTS = [
  { id: 'a1', programme_id: 'prog-1', title: 'New bonus for October', body: 'Top three creators by views each month now earn 100, 50 and 25 euros.\nBonuses are added to the statement automatically.', pinned: true, created_at: iso(2) },
  { id: 'a2', programme_id: 'prog-1', title: 'Reminder: payment details', body: 'Please check your payment details are saved before month end so your payout is not delayed.', pinned: false, created_at: iso(9) },
]
const MY_OVERVIEW = {
  programme: { id: 'prog-1', name: 'VIP Demo', currency: 'EUR', cpm: 0.25, tiers: PROGRAMME.tiers, min_payout: 10, monthly_cap: null, window_days: 60, terms: null, terms_version: 1, community_id: 'comm-1' },
  member: { status: 'active', cpm: null, monthly_cap: null, target_videos: 4, target_views: 250000, joined_on: day(60), terms_ok: true },
  month: { id: 'm-sep', year: 2026, month: 9, starts_at: iso(29), ends_at: new Date(Date.now() + 86400000).toISOString(), status: 'open' },
  stats: { views: 186400, videos: 5, base: 46.6, effective_cpm: 0.25, projected_views: 199000, projected_base: 49.75, rank: 2, of: 6 },
  lifetime: { views: 942000, videos: 21, best_month: 231.5 },
  videos: [
    { id: 'v1', platform: 'TikTok', url: 'https://www.tiktok.com/@demo/video/1', caption: 'Madrid in 24 hours', thumb: null, posted_at: iso(6), submitted_at: iso(6), views_total: 84200, views_counted: 84200, status: 'tracking', synced_at: iso(0.1) },
    { id: 'v2', platform: 'Instagram', url: 'https://www.instagram.com/reel/DEMO/', caption: 'Hidden beaches', thumb: null, posted_at: iso(11), submitted_at: iso(11), views_total: 61300, views_counted: 61300, status: 'tracking', synced_at: iso(0.1) },
    { id: 'v3', platform: 'YouTube', url: 'https://www.youtube.com/shorts/demo', caption: 'Budget flights', thumb: null, posted_at: iso(20), submitted_at: iso(20), views_total: 40900, views_counted: 40900, status: 'tracking', synced_at: iso(0.1) },
  ],
  payment_ready: true,
}
const ADMIN_OVERVIEW = { totals: { views: 1246300, spend_so_far: 311.6, spend_projected: 405, budget: 900 }, members: MEMBERS, month: { year: 2026, month: 9 } }
const ATTENTION = [{ profile_id: 'p7', name: 'Daniel Demo', photo: null, reasons: ['no_payment', 'no_terms'] }, { profile_id: 'p4', name: 'Sofía Demo', photo: null, reasons: ['quiet'] }]
const SUGGESTIONS = [
  { profile_id: 's1', name: 'Noelia García', photo: null, videos: 9, views: 512000, avg_views: 56900, last_post: iso(3) },
  { profile_id: 's2', name: 'Andrea Álvarez', photo: null, videos: 6, views: 298000, avg_views: 49600, last_post: iso(8) },
  { profile_id: 's3', name: 'Rocío Vargas', photo: null, videos: 4, views: 187000, avg_views: 46700, last_post: iso(12) },
]
const TIMELINE = [
  { id: 1, kind: 'joined', detail: { source: 'invite' }, at: iso(2), profile_id: 'p3', name: 'Pablo Demo', actor: null },
  { id: 2, kind: 'rate_changed', detail: { to: 0.3 }, at: iso(5), profile_id: 'p1', name: 'Carlos Demo', actor: 'Ethan' },
  { id: 3, kind: 'left', detail: {}, at: iso(12), profile_id: 'p6', name: 'Elena Demo', actor: 'Ethan' },
  { id: 4, kind: 'paused', detail: {}, at: iso(15), profile_id: 'p5', name: 'Iker Demo', actor: 'Marta Lara' },
  { id: 5, kind: 'joined', detail: { source: 'transfer' }, at: iso(30), profile_id: 'p2', name: 'Marina Demo', actor: 'Ethan' },
]
const STATEMENTS = []

const RPC = {
  vip_can_manage: true, vip_has_access: true, vip_my_overview: MY_OVERVIEW, vip_board: NAMES.slice(0, 6).map((n, i) => ({ rank: i + 1, name: n, photo: null, views: 420000 / (i + 1), videos: 6 - i, me: i === 1 })),
  vip_my_statements: STATEMENTS, vip_admin_overview: ADMIN_OVERVIEW, vip_admin_videos: [], vip_trends: TRENDS, vip_my_trends: { ...TRENDS, daily: daily(0.4), streak_months: 3 },
  vip_attention: ATTENTION, vip_suggestions: SUGGESTIONS, vip_timeline: TIMELINE, vip_analytics: { months: [{ year: 2026, month: 7, views: 610000, cost: 150, members: 4, videos: 18, cpm: 0.245 }, { year: 2026, month: 8, views: 980000, cost: 262, members: 6, videos: 27, cpm: 0.267 }], top: [], members: 6 },
  vip_managers_list: [{ profile_id: 'x1', name: 'Marta Lara', photo_url: null, role_title: 'Spanish Manager', programme_id: 'prog-1', programme: 'VIP Demo', added_at: iso(1) }],
}
const TABLES = { vip_programmes: [PROGRAMME], vip_bonus_rules: RULES, vip_announcements: ANNOUNCEMENTS, communities: [{ slug: 'spain' }], vip_invites: [], profiles: [{ id: 'q1', name: 'Marta Lara', photo_url: null, role_title: 'Spanish Manager', is_admin: true }] }

function chain(table) {
  const rows = TABLES[table] || []
  const q = { then: (res, rej) => Promise.resolve({ data: rows, error: null }).then(res, rej) }
  for (const m of ['select', 'eq', 'order', 'limit', 'ilike', 'in', 'neq', 'gte', 'lte']) q[m] = () => q
  q.maybeSingle = () => Promise.resolve({ data: rows[0] || null, error: null })
  q.single = q.maybeSingle
  return q
}

// /__vip-bench?view=staff  the team's REAL VIP page (pages/VipHub staff mode, migration 310)
const STAFF_OVERVIEW = {
  ...MY_OVERVIEW, staff: true, videos: [],
  stats: { ...MY_OVERVIEW.stats, rank: null, members: 6, posting: 4, of: 6 },
  programmes: [
    { id: 'prog-ro', name: 'VIP Romania', country_codes: ['RO'], slug: 'romania', members: 2 },
    { id: MY_OVERVIEW.programme.id, name: 'VIP Spain', country_codes: ['ES'], slug: 'spain', members: 6 },
  ],
}

export default function VipBench() {
  const [ready] = useState(() => {
    if (new URLSearchParams(window.location.search).get('view') === 'staff') {
      RPC.vip_my_overview = null
      RPC.vip_staff_overview = STAFF_OVERVIEW
      RPC.vip_staff_board = RPC.vip_board.map((r) => ({ ...r, me: false }))
      // The creator preview (migration 311): two VIPs to pick from, and `vip_preview` answering as one of them.
      RPC.vip_preview_people = [
        { id: 'p-maria', name: 'Maria Lopez', photo: null, status: 'active', test: false },
        { id: 'p-test', name: 'Test VIP Account', photo: null, status: 'active', test: true },
      ]
    }
    const MY = { ...RPC.vip_my_overview }
    supabase.rpc = (fn, args) => {
      if (fn === 'vip_preview') {
        const what = { overview: { ...MY_OVERVIEW, ...MY, preview: true, member: { ...MY_OVERVIEW.member, monthly_fee: 150, fee_min_videos: 4, tiers: [{ from_views: 500000, cpm: 0.35 }] } }, statements: RPC.vip_my_statements || [], trends: RPC.vip_my_trends || null, perks: RPC.vip_my_perks || [], board: RPC.vip_board }[args?.p_what]
        return Promise.resolve({ data: what ?? null, error: null })
      }
      return Promise.resolve({ data: RPC[fn] === undefined ? null : RPC[fn], error: null })
    }
    supabase.from = (t) => chain(t)
    return true
  })
  const view = new URLSearchParams(window.location.search).get('view') || 'hub'
  if (!ready) return null
  return view === 'admin' ? <AdminVip /> : <VipHub />
}
