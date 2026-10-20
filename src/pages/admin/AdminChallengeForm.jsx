import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { confirm, notice } from '../../lib/confirm'
import { useAuth } from '../../context/AuthContext'
import Icon from '../../components/Icon'
// Two currencies, from the same list every other market control uses. The seven
// that were here included four nothing has ever been priced in.
import { CURRENCIES } from '../../lib/timezones'
import PrizeBreakdownFields, { PrizeSummary, combineBudgets, prizeBudget, prizeKind, prizeTotals, cleanPrizes, participationExtras, cleanExtraAwards, rowType } from '../../components/admin/PrizeBreakdownFields'
import { flagFromIso } from '../../components/network/PlaceSwitcher'
import { PageHeader, Skeleton, Spinner, Select } from '../../components/ui'
import { DEFAULT_SCORING, normalisePointRule, isSavedRuleId } from '../../lib/scoring'
import { cx } from '../../lib/utils'
import { testFlags } from '../../lib/testData'
import ChallengeTemplates, { SaveAsTemplate } from '../../components/admin/ChallengeTemplates'
import { templateFromForm } from '../../lib/challengeTemplates'
import { challengesApi } from '../../api/challenges'
import WeeklyPrizeFields from '../../components/admin/WeeklyPrizeFields'
import { cleanWeekly, weeklyRounds } from '../../lib/weekly'
import { challengeEndIso, challengeStartIso, ymdInZone } from '../../lib/zonedDate'
import { submissionsApi } from '../../api/submissions'
import { profilesApi } from '../../api/profiles'
import { marketsApi } from '../../api/markets'
import { teamApi } from '../../api/team'
import AdminChallengeFormBasics from './AdminChallengeFormBasics'
import AdminChallengeFormScoring from './AdminChallengeFormScoring'

// Create / edit a challenge. Everything is customisable: which market it runs
// in, how it is won, length, brief, rules, platforms and the full prize
// breakdown.
const ALL_PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'Facebook']
// The platform's own key in SocialMark's table. Two spellings of one list is
// how a Facebook pill ends up with a broken glyph, so the map is explicit.
const SOCIAL_BRAND = { Instagram: 'instagram', TikTok: 'tiktok', YouTube: 'youtube', Facebook: 'facebook' }

// THE DATE BOXES HERE WERE PLAIN TEXT INPUTS WITH A "DD/MM/YYYY" PLACEHOLDER,
// which is the one shape the rest of the platform has stopped using: the hint
// disappears whole the moment you type a single character, the slashes have to
// be typed, and nothing tells you the date is nonsense until you press save.
// The shared field does all of that and is the same control as the calendar,
// "find a time" and the flight log.
//
// This form's state is still "DD/MM/YYYY" strings (the time boxes went on 20 Oct 2026: a challenge is whole days), so
// the two adapters below sit between
// that and the ISO the shared field speaks. Converting the whole form's storage
// would touch validation, the draft-publish block and the edit loader for no
// visible gain.
const ddmmToIso = (s) => {
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s || '')
  return m ? `${m[3]}-${m[2]}-${m[1]}` : ''
}
const isoToDdmm = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : ''
}

// PICKED IS BRAND ORANGE. NOT A TINT OF IT.
//
// Every chooser on this form was `border-brand bg-brand-tint/40` - a 40%
// wash of a pale tint, which on a white card is a card that looks slightly
// warm rather than a card that is chosen. On a form where four separate
// questions are answered by pressing a card, "slightly warm" is not an answer.
//
// It is defined once because the alternative is six copies that drift: the
// market cards, the global card, the three scoring cards and the platform
// pills were already three different shades of the same idea.
const PICKED = 'border-brand bg-brand text-white shadow-card'
const UNPICKED = 'border-gray-200 bg-white hover:border-brand/40'
// Sub-text inside a card that might be picked. Grey on white, white-ish on
// orange - `text-smoke` on brand orange is unreadable and was the reason this
// could not simply be a background swap.
const subText = (on) => (on ? 'text-white/80' : 'text-smoke')

// A CHALLENGE RUNS ON WHOLE DAYS (migration 442, 20 Oct 2026). Ethan: "For the start date and the end date, I don't
// think we necessarily need to have a time. The start date is just the beginning of that day, and the end date is going
// to be the end of that date." So the form asks for two dates and the clock they are in ("Times are London"), which is
// saved now (`challenges.timezone`); before, the picker was decoration and the times were read in the browser's clock.
// The server keeps `opens_at` / `closes_at` from these, and the countdown, archive, streak bonus and weekly rounds use them.
const zoneOf = (f) => f.tz || 'Europe/London'
const startIsoOf = (f) => challengeStartIso(f.startDateStr, zoneOf(f))
const endIsoOf = (f) => challengeEndIso(f.endDateStr, zoneOf(f))
// A market's clock, for a new brief (the Global market's is UTC; its briefs are London ones).
const marketZone = (m) => (m?.timezone && m.timezone !== 'UTC' ? m.timezone : 'Europe/London')

const CURRENCY_SYMBOL = { GBP: '£', EUR: '€', USD: '$', RON: 'lei ', SEK: 'kr ', NOK: 'kr ', DKK: 'kr ' }

// NO "ALL VALID ENTRIES" ROW. they are right on both counts: a prize to everyone who enters is a real cost that nobody
// decided, pre-filled into the form as though it were the house style. The participation reward below is the deliberate
// version of the same idea, and it is empty until somebody sets it.
const DEFAULT_PRIZES = [
  { place: '1st', prize: '£150 cash' },
  { place: '2nd', prize: '£100 cash' },
  { place: '3rd', prize: '£75 cash' },
]

// ONE PRIZE LADDER, RESTATED IN ANOTHER CURRENCY.
//
// A prize is a STRING ("£150 cash"), because prizes are not always money - a
// voucher, a trip, a feature on the account are all prizes - so there is no
// amount-and-currency pair to convert and the words have to be rewritten.
//
// THE NUMBER IS DELIBERATELY NOT CONVERTED. An admin switching a challenge to
// euros is deciding what the prize IS, not restating a payment already made;
// 150 pounds becoming 174.30 euros is nobody's prize. The SYMBOL and the CODE
// are both replaced because admins type both ("£150" and "150 GBP").
//
// Pure, and takes the form it is rewriting rather than closing over one. See
// the note on `setCurrency`: closing over it put a template's prizes back to
// the defaults a tick after they were applied.
function swapCurrency(text, fromCode, toCode) {
  const from = CURRENCY_SYMBOL[fromCode] || ''
  const to = CURRENCY_SYMBOL[toCode] || ''
  let out = String(text ?? '')
  if (from && to && from !== to) out = out.split(from).join(to)
  if (fromCode && fromCode !== toCode) {
    out = out.replace(new RegExp(`\\b${fromCode}\\b`, 'g'), toCode)
  }
  return out
}

/** The patch that puts one form's prizes into another currency. */
export function inCurrency(form, next) {
  return {
    prize_currency: next,
    prize_structure: (form.prize_structure || []).map((p) => ({ ...p, prize: swapCurrency(p.prize, form.prize_currency, next) })),
    participation_prize: swapCurrency(form.participation_prize, form.prize_currency, next),
    extra_awards: (form.extra_awards || []).map((a) => ({ ...a, prize: swapCurrency(a.prize, form.prize_currency, next) })),
  }
}

export default function AdminChallengeForm() {
  const { id } = useParams() // present when editing
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editing = !!id

  const [loading, setLoading] = useState(editing)
  const [busy, setBusy] = useState(false)
  // The row a failed first save already created - see `save`.
  const createdIdRef = useRef(null)
  const briefRef = useRef(null)
  const rulesRef = useRef(null)
  // WHICH BOX THE ONE SHARED TOOLBAR IS POINTING AT.
  //
  // IT IS READ FROM THE SELECTION, NOT FROM A FOCUS EVENT. The first version
  // put `onFocusCapture` on each editor's wrapper, which reads correctly and
  // does not work: the boxes are `contenteditable`, and pressing a toolbar
  // button `preventDefault`s the mousedown precisely so focus does NOT move -
  // so the toolbar can be used on a box that never fired a focus event this
  // render. Measured: with the caret in Rules, the bar's own state still said
  // "brief", the link landed in Rules anyway (execCommand follows the caret,
  // not the ref), and `ed.el().focus()` afterwards then focused the BRIEF - so
  // your next keystroke went into the wrong box.
  //
  // The caret is the only thing that actually knows, and `selectionchange` is
  // the event that tracks it - the same signal RichToolbar already uses to
  // light up its own buttons, so the two can never disagree.
  //
  // A selection OUTSIDE both boxes leaves the answer alone. That is what makes
  // the link dialog work: opening it moves the selection into a text field in a
  // modal, and forgetting which box you were in at that exact moment is how the
  // link ends up in the other one.
  // APPLYING A TEMPLATE HAS TO RE-SEED THE TWO RICH EDITORS, AND `docId` IS HOW.
  //
  // `RichEditable` is a contentEditable surface: it writes its own DOM, and it
  // deliberately seeds from `initialMd` ONCE so that React never stamps over
  // what somebody is typing. `docId` is the component's own documented way of
  // saying "this is a different document now, read your content again" - it is
  // what makes the note editor swap between notes. A template is the same
  // event, so it uses the same mechanism rather than inventing a second one.
  //
  // Without this the brief and the rules are the only two fields a template
  // silently fails to fill, which is the pair that matters most.
  const [seeded, setSeeded] = useState(0)
  const [writing, setWriting] = useState('brief')
  const activeEditor = writing === 'rules' ? rulesRef : briefRef
  useEffect(() => {
    const onSel = () => {
      const node = window.getSelection()?.anchorNode
      if (!node) return
      if (rulesRef.current?.el?.()?.contains(node)) setWriting('rules')
      else if (briefRef.current?.el?.()?.contains(node)) setWriting('brief')
    }
    document.addEventListener('selectionchange', onSel)
    return () => document.removeEventListener('selectionchange', onSel)
  }, [])
  const [error, setError] = useState('')
  // Markets this admin may create a challenge in. A challenge with no market is
  // the old, unscoped shape: readable by everyone, which is exactly how a
  // Spanish brief ended up on a UK creator's board.
  const [markets, setMarkets] = useState([])
  const [rules, setRules] = useState([])
  const [form, setForm] = useState({
    title: '',
    description: '',
    rules: '',
    platforms: ['Instagram', 'TikTok'],
    prize_structure: DEFAULT_PRIZES,
    participation_threshold: '', // videos needed to earn the participation reward
    participation_prize: '',
    // Migration 233. Blank cap = everyone who qualifies; type is chosen, not
    // guessed from the words; scope decides whether winners earn it too.
    participation_cap: '',
    participation_basis: 'entries', // migration 241: 'points' on a points challenge
    participation_reward_type: 'voucher',
    participation_amount: '',
    participation_scope: 'everyone',
    extra_awards: [],
    // Video of the Week (migration 435): null = off.
    weekly_prize: null,
    startDateStr: '',
    endDateStr: '',
    tz: 'Europe/London',
    status: 'draft',
    // Reporting fields. None of them change what a creator sees; they are what
    // makes a challenge comparable to every other one on the analytics page
    // (cost per thousand views, cost per post, performance by market/format).
    market: '',
    format: 'monthly',
    audience: 'general',
    prize_amount: '',
    prize_currency: 'GBP',
    winners_count: '',
    prize_type: 'cash',
    content_type: 'free',
    content_note: '',
    objective: 'views',
    cpm_target: '0.50',
    community_id: '',
    scoring: DEFAULT_SCORING,
    threshold_mode: 'highest',
  })

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  // SWITCHING THE CURRENCY REWRITES THE PRIZES THAT WERE WRITTEN IN THE OLD ONE.
  //
  // A prize is a STRING ("£150 cash"), because prizes are not always money, and
  // the currency picker only ever changed a field beside it - so the picker
  // said EUR and every line on the form said pounds. The number is deliberately
  // NOT converted: an admin switching to euros is deciding what the prize IS,
  // not restating a payment already made, and 150 pounds becoming 174.30 euros
  // is nobody's prize. Symbol and code both, because both get typed.
  //
  // THE REWRITE IS A PURE FUNCTION OF A FORM (`inCurrency`, below this
  // component), AND THAT IS NOT TIDINESS.
  //
  // It was a closure over `form`, which is correct for the picker - an event handler reading the state that was on
  // screen when it was pressed - and silently wrong for the template rail, which needs to swap the currency of prizes
  // that the SAME event has only just installed. Reading `form` there reads the state from BEFORE the template was
  // applied, so the swap ran over the old prize ladder and wrote it back on top of the new one. The symptom was a
  // template's prizes appearing for a moment and then turning back into the defaults.
  //
  // A function that takes the form it is rewriting cannot have that bug, and it
  // lets the rail do the whole thing in ONE functional update with no timing in
  // it at all.
  const setCurrency = (next, extra = {}) => set({ ...extra, ...inCurrency(form, next) })

  const globalCommunity = markets.find((m) => m.kind === 'network')
  const chapterMarkets = markets.filter((m) => m.kind === 'chapter')

  // The market list, and the ?market=<slug> prefill that the "New challenge"
  // buttons on a market's own pages send. Creating a challenge from inside a
  // market and then having to pick that market again is the kind of small
  // stupidity that gets a challenge filed in the wrong place.
  useEffect(() => {
    let alive = true
    // The network row is fetched alongside the chapters, not excluded. A
    // challenge scoped to Worldwide is a GLOBAL challenge: every creator is an
    // active member of Worldwide, so `community_id in my_scopes()` is true for
    // all of them and one brief reaches the whole network without any new
    // policy, notification path or special case.
    marketsApi.communities()
      .select('id, slug, name, kind, country_codes, currency, is_active, cpm_target, timezone')
      .order('kind', { ascending: false }).order('name')
      .then(({ data }) => {
        if (!alive) return
        setMarkets(data || [])
        const wanted = params.get('market')
        if (!editing && wanted) {
          const m = (data || []).find((c) => c.slug === wanted)
          if (m) setForm((f) => ({ ...f, community_id: m.id, prize_currency: m.currency || f.prize_currency, cpm_target: m.cpm_target ?? f.cpm_target }))
        }
      })
    return () => { alive = false }
  }, [editing, params])

  useEffect(() => {
    if (!editing) return
    challengesApi.pointRules().select('*').eq('challenge_id', id).order('position')
      .then(({ data }) => setRules(data || []))
  }, [editing, id])

  // ---- GROUPS: more than one leaderboard inside one brief -----------------
  //
  // Held in form state exactly like the point rules, and written after the
  // challenge row exists because they point at it. That is what lets a BRAND
  // NEW challenge be created with its groups already named, prized and dealt -
  // the alternative (save first, then come back and split it) is two visits to
  // the same screen for one decision.
  const [groups, setGroups] = useState([])
  const [audience, setAudience] = useState([])
  const [groupsLoaded, setGroupsLoaded] = useState(false)

  useEffect(() => {
    if (!editing) { setGroupsLoaded(true); return undefined }
    let alive = true
    ;(async () => {
      const [{ data: gs }, { data: ms }] = await Promise.all([
        challengesApi.challengeGroups().select('*').eq('challenge_id', id).order('position'),
        challengesApi.challengeGroupMembers().select('group_id, creator_id').eq('challenge_id', id),
      ])
      if (!alive) return
      const members = ms ?? []
      setGroups((gs ?? []).map((g) => ({
        id: g.id,
        name: g.name,
        prize_currency: g.prize_currency ?? 'EUR',
        // The prize itself, not the two figures derived from it. A group saved
        // before the breakdown existed has an empty array here and a pot in
        // `prize_amount`; it reads as "same prize as the challenge", which is
        // what it has always actually been paid, because the payout function
        // falls through on an empty `prize_structure`.
        prize_structure: Array.isArray(g.prize_structure) ? g.prize_structure : [],
        participation_threshold: g.participation_threshold ?? '',
        participation_prize: g.participation_prize ?? '',
        participation_amount: g.participation_amount ?? '',
        participation_reward_type: g.participation_reward_type ?? null,
        // A board's own cap, who can earn it, and its own Most committed (migration 338).
        participation_cap: g.participation_cap ?? '',
        participation_scope: g.participation_scope ?? 'everyone',
        extra_awards: Array.isArray(g.extra_awards) ? g.extra_awards : [],
        members: members.filter((m) => m.group_id === g.id).map((m) => m.creator_id),
      })))
      setGroupsLoaded(true)
    })()
    return () => { alive = false }
  }, [editing, id])

  // "...placed in Group B, check and move them" links to #groups: land there
  // once the editor has drawn, not at the top of a long form.
  const groupsScrolledRef = useRef(false)
  useEffect(() => {
    if (!groupsLoaded || groupsScrolledRef.current || window.location.hash !== '#groups') return
    groupsScrolledRef.current = true
    setTimeout(() => document.getElementById('groups')?.scrollIntoView({ block: 'start' }), 120)
  }, [groupsLoaded])

  // WHO CAN BE DEALT IN: the market's own roster, minus admins and the QA
  // accounts, which is the same audience every other member count on this
  // platform uses. Re-read whenever the market changes, because moving a
  // challenge between markets changes who is even eligible.
  useEffect(() => {
    if (!form.community_id) { setAudience([]); return undefined }
    let alive = true
    marketsApi
      .communityMembers()
      .select('profile_id, profiles!inner(id, name, photo_url, city, country, is_admin, is_test, is_vip, status)')
      .eq('community_id', form.community_id)
      .eq('status', 'active')
      .eq('profiles.is_admin', false)
      // VIPS ARE NOT IN CHALLENGES. Marta could not save RETO OCTUBRE ESPAÑA: "15 creators are not in a group" - the
      // Spanish VIPs, who are on the market's roster but are never dealt onto a board (migration 344).
      .eq('profiles.is_vip', false)
      .in('profiles.is_test', testFlags())
      .eq('profiles.status', 'active')
      .then(({ data }) => {
        if (!alive) return
        setAudience((data ?? []).map((r) => r.profiles).filter(Boolean)
          .sort((a, b) => (a.name || '').localeCompare(b.name || '')))
      })
    return () => { alive = false }
  }, [form.community_id])

  // SOMEBODY IN A GROUP WHO IS NOT ON THE ROSTER STILL HAS A NAME.
  //
  // The roster is who you can ADD; it is not who is already in. A creator can
  // leave the market, or be moved out of it, after being dealt into a group -
  // and without this their chip in the editor reads "?" with no name, which
  // looks like data loss rather than like somebody who has moved on. Fetched
  // once per set of strangers, so the common case (everybody is on the roster)
  // makes no request at all.
  const [strangers, setStrangers] = useState([])
  const missingIds = useMemo(() => {
    const known = new Set(audience.map((p) => p.id))
    const seen = new Set(strangers.map((p) => p.id))
    return [...new Set(groups.flatMap((g) => g.members))].filter((id) => !known.has(id) && !seen.has(id))
  }, [groups, audience, strangers])

  useEffect(() => {
    if (missingIds.length === 0) return undefined
    let alive = true
    profilesApi.profiles().select('id, name, photo_url, city, country').in('id', missingIds)
      .then(({ data }) => { if (alive && data?.length) setStrangers((cur) => [...cur, ...data]) })
    return () => { alive = false }
  }, [missingIds])

  // Who the editor can draw. The roster is what "Add creators" and "Split
  // randomly" work over; the strangers only exist so an existing chip has a
  // face and a name.
  const groupPeople = useMemo(() => [...audience, ...strangers], [audience, strangers])

  // Who is on the market's roster and on none of the boards. The editor draws
  // this list; `save` refuses while it has anybody in it. One definition, so
  // the warning and the block can never disagree about who is missing.
  const unassignedInGroups = useMemo(() => {
    if (groups.length === 0) return []
    const placed = new Set(groups.flatMap((g) => g.members))
    return audience.filter((p) => !placed.has(p.id))
  }, [groups, audience])

  useEffect(() => {
    if (!editing) return
    challengesApi.challenges().select('*').eq('id', id).single().then(({ data }) => {
      if (data) {
        setForm({
          ...data,
          // Read in the challenge's own clock, so a brief written in London shows the same dates in Madrid.
          tz: data.timezone || 'Europe/London',
          startDateStr: isoToDdmm(ymdInZone(data.start_date, data.timezone || 'Europe/London')),
          endDateStr: isoToDdmm(ymdInZone(data.end_date, data.timezone || 'Europe/London')),
          prize_structure: Array.isArray(data.prize_structure) ? data.prize_structure : DEFAULT_PRIZES,
          participation_threshold: data.participation_threshold ?? '',
          participation_prize: data.participation_prize ?? '',
          participation_cap: data.participation_cap ?? '',
          participation_basis: data.participation_basis === 'points' ? 'points' : 'entries',
          participation_reward_type: data.participation_reward_type
            ?? (/voucher|credit|gift/i.test(data.participation_prize || '') ? 'voucher' : data.participation_prize ? 'cash' : 'voucher'),
          participation_amount: data.participation_amount ?? '',
          participation_scope: data.participation_scope ?? 'everyone',
          extra_awards: Array.isArray(data.extra_awards) ? data.extra_awards : [],
          weekly_prize: data.weekly_prize ?? null,
          market: data.market ?? '',
          format: data.format ?? 'monthly',
          audience: data.audience ?? 'general',
          prize_amount: data.prize_amount ?? '',
          prize_currency: data.prize_currency ?? 'GBP',
          winners_count: data.winners_count ?? '',
          prize_type: data.prize_type ?? 'cash',
          content_type: data.content_type ?? 'free',
          content_note: data.content_note ?? '',
          objective: data.objective ?? 'views',
          community_id: data.community_id ?? '',
          // Legacy rows keep 'prize'. Not remapped: it is what the challenge
          // was actually run under.
          scoring: data.scoring ?? 'prize',
          threshold_mode: data.threshold_mode ?? 'highest',
          cpm_target: data.cpm_target ?? '0.50',
        })
      }
      setLoading(false)
    })
  }, [editing, id])

  function togglePlatform(p) {
    set({
      platforms: form.platforms.includes(p)
        ? form.platforms.filter((x) => x !== p)
        : [...form.platforms, p],
    })
  }

  // WHAT THE REPORTING FIELDS USED TO ASK, answered from what is already here.
  //
  // Each of these was a select somebody had to remember, sitting in a section
  // nobody read, feeding a page that depends on them. The most-forgotten fields
  // on the form and the ones analytics needs most is the worst combination
  // there is, so none of them are questions any more.
  const derivedReporting = useMemo(() => {
    const days = (() => {
      const a = challengeStartIso(form.startDateStr, form.tz || 'Europe/London')
      const b = challengeEndIso(form.endDateStr, form.tz || 'Europe/London')
      return a && b ? Math.round((Date.parse(b) - Date.parse(a)) / 86400000) : null
    })()

    // A market IS the community the brief belongs to. The old free-text box
    // asked for "UK, ES, DE" and accepted anything, including nothing.
    const community = markets.find((c) => c.id === form.community_id)
    const market = community
      ? (community.country_codes?.[0] || community.name || null)
      : null

    // Cash, vouchers, or both - off each prize's chosen kind (the words, for
    // a row saved before the kind could be chosen).
    const rows = (form.prize_structure ?? []).filter((p) => p.prize)
    const hasPart = !!(form.participation_threshold && String(form.participation_prize || '').trim())
    const extras = (form.extra_awards ?? []).filter((a) => String(a.prize || '').trim())
    const hasVoucher = rows.some((p) => rowType(p) === 'voucher')
      || (hasPart && form.participation_reward_type !== 'cash')
      || extras.some((a) => a.type !== 'cash')
    const hasCash = rows.some((p) => rowType(p) === 'cash' && Number(p.amount) > 0)
      || (hasPart && form.participation_reward_type === 'cash')
      || extras.some((a) => a.type === 'cash')
    const prize_type = hasCash && hasVoucher ? 'cash_voucher' : hasVoucher ? 'voucher' : 'cash'

    return {
      market,
      // Under a fortnight is an express brief; anything longer is the monthly
      // shape. `always_on` is set by hand on the rare challenge that is.
      format: form.format === 'always_on' ? 'always_on' : (days != null && days <= 14 ? 'express' : 'monthly'),
      prize_type,
      // "Objective" and "how it is won" were the same question asked twice.
      objective: form.scoring === 'points' ? 'videos' : 'views',
    }
  }, [form.startDateStr, form.endDateStr, form.tz,
      form.community_id, form.prize_structure, form.participation_prize,
      form.participation_threshold, form.participation_reward_type, form.extra_awards,
      form.format, form.scoring, markets])

  // Writing the groups and who is in them.
  //
  // Returns an error message or null, so `save` can bail with the same
  // treatment every other write on this form gets.
  //
  // MEMBERSHIP IS REPLACED WHOLE and the groups are NOT. Those are different
  // decisions for different reasons: a membership row carries nothing but the
  // pairing, so deleting and re-inserting it loses nothing, while a group's id
  // is stamped on every saved result row ranked on its board.
  async function saveGroups(challengeId) {
    const kept = groups.filter((g) => g.id)
    let del = challengesApi.challengeGroups().delete().eq('challenge_id', challengeId)
    if (kept.length) del = del.not('id', 'in', `(${kept.map((g) => g.id).join(',')})`)
    const { error: delErr } = await del
    if (delErr) return delErr.message

    // A GROUP'S PRIZE IS SAVED THE WAY THE CHALLENGE'S IS.
    //
    // The rows are the prize; the pot, the winner count and the prize type are
    // DERIVED from them, exactly as `derivedReporting` does for the challenge.
    // They used to be typed, and `prize_structure` - the column
    // `award_challenge_prizes_internal` actually pays from - was never written
    // at all, so "its own prize" was a figure in a reporting column that no
    // payout ever read.
    //
    // AN EMPTY BREAKDOWN IS "SAME AS THE CHALLENGE", all the way down: the
    // payout function coalesces `nullif(g.prize_structure, '[]')` to the
    // challenge's, and `prizeForGroup` does the same in the app. So a group
    // playing for the shared pot writes nulls and an empty array and needs no
    // flag anywhere.
    const row = (g, i) => {
      const prizes = cleanPrizes(g.prize_structure)
      const { pot, winners } = prizeTotals(prizes)
      const own = prizes.length > 0
      const threshold = parseInt(g.participation_threshold, 10)
      const hasPart = Number.isFinite(threshold) && threshold > 0 && !!String(g.participation_prize || '').trim()
      return {
        challenge_id: challengeId,
        name: g.name.trim() || `Group ${String.fromCharCode(65 + i)}`,
        position: i,
        prize_structure: prizes,
        prize_amount: own && pot > 0 ? pot : null,
        prize_currency: g.prize_currency || form.prize_currency || 'EUR',
        prize_type: own ? prizeKind(prizes) : null,
        winners_count: own && winners > 0 ? winners : null,
        // Both halves or neither, the same rule the challenge's own
        // participation reward follows: a threshold with nothing to win, or a
        // prize nobody can qualify for, is a promise that cannot be kept.
        participation_threshold: hasPart ? Math.max(1, threshold) : null,
        participation_prize: hasPart ? String(g.participation_prize).trim() : null,
        participation_amount: hasPart && String(g.participation_amount ?? '').trim() !== '' && Number(g.participation_amount) >= 0 ? Number(g.participation_amount) : null,
        participation_reward_type: hasPart ? (g.participation_reward_type === 'cash' ? 'cash' : 'voucher') : null,
        participation_cap: hasPart && Number(g.participation_cap) > 0 ? Math.floor(Number(g.participation_cap)) : null,
        participation_scope: hasPart ? (g.participation_scope === 'outside_prizes' ? 'outside_prizes' : 'everyone') : null,
        extra_awards: cleanExtraAwards(g.extra_awards),
      }
    }

    // The new ones come back with their ids so their members can be written in
    // the same pass. `select()` on an insert is what makes that one round trip
    // rather than an insert followed by a re-read.
    const fresh = groups.map((g, i) => ({ g, i })).filter(({ g }) => !g.id)
    let created = []
    if (fresh.length) {
      const { data, error } = await challengesApi.challengeGroups()
        .insert(fresh.map(({ g, i }) => row(g, i))).select('id, position')
      if (error) return error.message
      created = data ?? []
    }
    for (const g of kept) {
      const i = groups.indexOf(g)
      const { error } = await challengesApi.challengeGroups().update(row(g, i)).eq('id', g.id)
      if (error) return error.message
    }

    // position -> id, for the groups that did not have one a moment ago.
    const idAt = new Map(created.map((c) => [c.position, c.id]))
    const members = groups.flatMap((g, i) => {
      const gid = g.id || idAt.get(i)
      return gid ? g.members.map((creator_id) => ({ challenge_id: challengeId, group_id: gid, creator_id })) : []
    })

    const { error: wipeErr } = await challengesApi.challengeGroupMembers()
      .delete().eq('challenge_id', challengeId)
    if (wipeErr) return wipeErr.message
    if (members.length) {
      const { error: memErr } = await challengesApi.challengeGroupMembers().insert(members)
      if (memErr) return memErr.message
    }
    return null
  }

  async function save(e, publishNow = false) {
    e.preventDefault()
    setError('')
    const startIso = startIsoOf(form)
    const endIso = endIsoOf(form)
    if (!startIso || !endIso) {
      return setError('Pick a start date and an end date.')
    }
    if (new Date(endIso) <= new Date(startIso)) {
      return setError('The end date cannot be before the start date.')
    }
    if (form.platforms.length === 0) return setError('Pick at least one platform.')
    if (!form.community_id) {
      return setError('Pick the market this challenge runs in. A challenge with no market is visible to every creator on the platform.')
    }
    if (form.scoring === 'points' && rules.length === 0) {
      return setError('A points challenge needs at least one scoring rule, or nobody can score.')
    }
    // EVERYBODY OR NOBODY. Once a challenge is split into groups, a creator who was never dealt into one is a creator
    // racing on a board with no prize - which used to be allowed and explained in a footnote under the editor. The
    // editor names who is missing and offers to deal them out; this is what stops the save. `groups.length === 0` is the
    // one-leaderboard case and is untouched: there is nothing to be left out of.
    if (groups.length === 1) {
      return setError('Two groups is the smallest split. Add another, or go back to one leaderboard.')
    }
    if (groups.length > 0 && unassignedInGroups.length > 0) {
      return setError(`${unassignedInGroups.length} creator${unassignedInGroups.length === 1 ? ' is' : 's are'} not in a group. Everyone has to be on one of the boards, or switch back to one leaderboard.`)
    }

    setBusy(true)
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      rules: form.rules.trim(),
      platforms: form.platforms,
      prize_structure: cleanPrizes(form.prize_structure),
      // Participation reward: earned after posting N videos. Both must be set to
      // count; blank = no participation reward for this challenge.
      participation_threshold:
        form.participation_threshold && form.participation_prize.trim()
          ? Math.max(1, parseInt(form.participation_threshold, 10) || 1)
          : null,
      participation_prize: form.participation_threshold && form.participation_prize.trim()
        ? form.participation_prize.trim()
        : null,
      ...participationExtras(form),
      extra_awards: cleanExtraAwards(form.extra_awards),
      start_date: startIso,
      end_date: endIso,
      timezone: zoneOf(form),
      // Optional auto-publish time: a cron flips the draft live at this moment.
      // SCHEDULE PUBLISH IS GONE, and the start date does its job.
      //
      // They are right, and the two fields could disagree: a challenge could be set to publish on the 5th and start on
      // the 1st, and nothing said which won. A draft with a future start date now publishes itself at that date.
      //
      // ONLY A START DATE STILL TO COME SCHEDULES ANYTHING. With the start already passed, "the start date publishes it"
      // meant the next cron tick (every five minutes) published a draft somebody had only pressed "Save changes" on - so
      // a challenge starting today could not be saved and kept as a draft. Publishing a draft whose start has passed is
      // "Save & publish", a deliberate press.
      publish_at: (() => {
        const iso = startIsoOf(form)
        return iso && Date.parse(iso) > Date.now() ? iso : null
      })(),
      // "Save & publish" flips a draft live (creators get notified by the DB trigger).
      status: publishNow ? 'active' : form.status,
      // DERIVED, not typed. See the note where the Reporting section used to
      // be: /admin/analytics reads these columns and neither it nor the
      // database needs to know they stopped being questions.
      ...derivedReporting,
      audience: form.audience || null,
      content_type: form.content_type || null,
      // Only meaningful for 'other'; cleared otherwise so a note left behind by
      // a change of mind cannot resurface on the next edit.
      content_note: form.content_type === 'other' ? (form.content_note || null) : null,
      prize_currency: form.prize_currency || 'GBP',
      prize_amount: derivedPot || null,
      winners_count: derivedWinners || null,
      community_id: form.community_id,
      scoring: form.scoring || DEFAULT_SCORING,
      threshold_mode: form.threshold_mode || 'highest',
      cpm_target: form.cpm_target === '' ? null : Number(form.cpm_target),
      weekly_prize: cleanWeekly(form.weekly_prize ? { ...form.weekly_prize, currency: form.prize_currency || 'EUR' } : null),
    }

    // A SAVE THAT FAILS HALFWAY MUST NOT BE A SECOND CHALLENGE ON RETRY.
    // The challenge row is written first and its rules after, so when a later
    // step failed the form was still a "new" form and pressing Save again
    // inserted the challenge again - which is how one Global Challenge became
    // three identical drafts. Once a row exists, every later press updates it.
    const rowId = id || createdIdRef.current
    const { data: saved, error: dbError } = rowId
      ? await challengesApi.challenges().update(payload).eq('id', rowId).select('id').single()
      : await challengesApi.challenges().insert({ ...payload, created_by: user.id }).select('id').single()

    if (dbError) { setBusy(false); return setError(dbError.message) }
    if (!rowId && saved?.id) createdIdRef.current = saved.id

    // Scoring rules, written after the challenge exists because they point at
    // it. A non-points challenge has none, so switching a challenge away from
    // points clears them rather than leaving a ledger nothing reads.
    //
    // A RULE KEEPS ITS ID NOW, AND THAT IS NOT A TIDY-UP.
    //
    // This used to delete every rule for the challenge and insert the list
    // again. It was defensible while a rule was only ever read by the scorer:
    // replacing removes the class of bug where a deleted row survives a diff.
    // It stopped being defensible the moment anything else POINTED AT a rule.
    // A creator's bonus claim references `rule_id` with ON DELETE CASCADE, so
    // an admin opening the challenge to fix a typo in the title would have
    // silently thrown away every claim on it - and migration 139's trigger
    // would have taken the automatic awards with them. The bug would have
    // looked like points vanishing for no reason, days later.
    //
    // So: delete only what the editor actually removed, update what it kept,
    // insert what it added.
    const challengeId = saved?.id ?? rowId
    if (challengeId) {
      const wanted = form.scoring === 'points' ? rules : []
      // ONLY A UUID IS A ROW. The editor keys a rule it has just made with a
      // temporary id (`new-5`, `seed-0`), and this used to treat anything not
      // called `seed-` as saved: `new-5` went into `not in (...)` against a
      // uuid column and the save died with "invalid input syntax for type
      // uuid: new-5" - after the challenge row had already been written.
      const kept = wanted.filter((r) => isSavedRuleId(r.id))
      let del = challengesApi.pointRules().delete().eq('challenge_id', challengeId)
      if (kept.length) del = del.not('id', 'in', `(${kept.map((r) => r.id).join(',')})`)
      const { error: delErr } = await del
      if (delErr) { setBusy(false); return setError(delErr.message) }

      const rows = wanted.map((r, i) => ({
        community_id: form.community_id,
        challenge_id: challengeId,
        ...normalisePointRule(r),
        // The question a creator is asked at submission time. Bonuses only, and
        // an empty one means "an admin awards this by hand" - see migration 155.
        // (`min_views`, the view count that bonus then waits for, is set by
        // `normalisePointRule` above, which is where every other per-kind column
        // is decided - see the note on RULE_USES_THRESHOLD for why they are not
        // decided here.)
        prompt: r.kind === 'bonus' && r.prompt?.trim() ? r.prompt.trim() : null,
        position: i,
        is_active: true,
      }))
      const existing = rows.filter((_, i) => isSavedRuleId(wanted[i].id))
        .map((row, k) => ({ ...row, id: kept[k].id }))
      const fresh = rows.filter((_, i) => !isSavedRuleId(wanted[i].id))
      if (existing.length) {
        const { error: upErr } = await challengesApi.pointRules().upsert(existing)
        if (upErr) { setBusy(false); return setError(upErr.message) }
      }
      if (fresh.length) {
        const { data: made, error: insErr2 } = await challengesApi.pointRules().insert(fresh).select('id, position')
        if (insErr2) { setBusy(false); return setError(insErr2.message) }
        // Hand the editor the real ids, so a retry after a later failure
        // updates these rows instead of inserting them a second time.
        const idAt = new Map((made ?? []).map((m) => [m.position, m.id]))
        setRules((cur) => cur.map((r, i) => (isSavedRuleId(r.id) || !idAt.has(i) ? r : { ...r, id: idAt.get(i) })))
      }

      // ---- GROUPS ---------------------------------------------------------
      // Same shape as the rules and for the same reason: a group's id is
      // referenced by its members AND by every saved result row ranked on its
      // board, so replacing the lot would renumber a leaderboard that is
      // already being competed on.
      const groupsErr = await saveGroups(challengeId)
      if (groupsErr) { setBusy(false); return setError(groupsErr) }

      // Rebuild the ledger from the rules that now exist. Without this an edit
      // to the rules leaves yesterday's points standing until the next
      // submission happens to fire the trigger.
      if (form.scoring === 'points') {
        await challengesApi.recalcChallengePoints({ p_challenge: challengeId })
      }
      // And the leaderboard, because the groups may have moved: a creator who
      // changed board has to be ranked on the new one.
      if (form.scoring !== 'points') {
        await challengesApi.rebuildChallengeResults({ p_challenge: challengeId })
      }
    }

    setBusy(false)
    navigate('/admin/challenges')
  }

  if (loading) {
    return <div className="page max-w-5xl space-y-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-96 w-full" /></div>
  }

  // Pot and winners come OUT of the prize breakdown rather than being typed
  // beside it. Two fields that have to agree with a list above them will
  // eventually disagree, and it is the reporting number that ends up wrong.
  //
  // THE FALLBACK IS NOT OPTIONAL. Challenges written before this change have
  // prize rows with no `amount`, including the one running in the UK right now.
  // Deriving strictly would compute a pot of zero and write it over a figure
  // finance is using, the first time anybody opened the form to fix a typo.
  // Rows win when they have numbers; the stored value stands until they do.
  const { pot: rowPot, winners: rowWinners } = prizeTotals(form.prize_structure)
  const derivedPot = rowPot || Number(form.prize_amount) || 0
  const derivedWinners = rowWinners || Number(form.winners_count) || 0
  // The taking-part reward as the challenge sets it, and what a split challenge costs: every group's own prizes (or
  // the challenge's), its own taking-part reward (or the challenge's) for its own members, added up.
  const challengeParticipation = {
    threshold: form.participation_threshold,
    prize: form.participation_prize,
    cap: form.participation_cap,
    amount: form.participation_amount,
    type: form.participation_reward_type,
    scope: form.participation_scope,
    basis: form.scoring === 'points' ? form.participation_basis : 'entries',
  }
  // The challenge's own Most committed is paid once, to the boards that have none of their own.
  const firstSharedAwards = groups.findIndex((g) => !(g.extra_awards || []).some((a) => String(a?.prize || '').trim()))
  const groupsBudget = groups.length === 0 ? null : combineBudgets(groups.map((g, i) => {
    const own = cleanPrizes(g.prize_structure)
    const ownPart = !!(String(g.participation_threshold ?? '').trim() && String(g.participation_prize ?? '').trim())
    const ownAwards = (g.extra_awards || []).filter((a) => String(a?.prize || '').trim())
    return {
      label: (g.name || '').trim() || `Group ${String.fromCharCode(65 + i)}`,
      budget: prizeBudget({
        prizes: own.length ? own : form.prize_structure,
        awards: ownAwards.length ? ownAwards : (i === firstSharedAwards ? form.extra_awards : []),
        participation: ownPart
          ? { threshold: g.participation_threshold, prize: g.participation_prize, amount: g.participation_amount, type: g.participation_reward_type, cap: g.participation_cap, scope: g.participation_scope || 'everyone', basis: challengeParticipation.basis }
          : challengeParticipation,
        creators: g.members.length || null,
      }),
    }
  }))
  const potIsLegacy = !rowPot && derivedPot > 0

  // CLOSING ENTRIES LIVES HERE NOW, NOT ON THE CHALLENGE PAGE. It used to be a "..." menu on ChallengeDetail's own
  // toolbar, sitting next to Edit and Results at the same weight as opening a page - for an action that ends the
  // challenge for every creator in the market and cannot be undone from there. The edit screen is where a manager
  // already is when they decide entries are over, same reasoning as Delete below it.
  async function setLifecycle(status) {
    const verb = { ended: 'close entries on', archived: 'archive' }[status]
    if (!await confirm(`Really ${verb} "${form.title || 'this challenge'}"?`)) return
    setBusy(true)
    const { error: err } = await challengesApi.challenges().update({ status }).eq('id', id)
    setBusy(false)
    if (err) { notice(`Could not update: ${err.message}`); return }
    setForm((f) => ({ ...f, status }))
  }

  async function destroy() {
    const { count } = await submissionsApi
      .submissions().select('id', { count: 'exact', head: true }).eq('challenge_id', id)
    const entries = count ?? 0
    if (!await confirm(
      `Permanently delete "${form.title || 'this challenge'}"?\n\nThis also deletes ${entries} submission${entries === 1 ? '' : 's'} and all its results. This cannot be undone.`,
    )) return
    setBusy(true)
    const { error: err } = await teamApi.adminDeleteChallenge({ target: id })
    setBusy(false)
    if (err) { setError(`Could not delete: ${err.message}`); return }
    navigate('/challenges')
  }

  return (
    <div className="page max-w-5xl">
      <PageHeader
        // BACK TO THE CHALLENGE YOU WERE EDITING. Cancel used `editing` (a boolean) as the id and landed on
        // /challenges/true, "Challenge not found".
        back={editing ? { to: `/challenges/${id}`, label: 'Challenge' } : { to: '/challenges', label: 'Challenges' }}
        title={editing ? 'Edit challenge' : 'New challenge'}
      />

      {/* THE RAIL IS ONLY ON A NEW CHALLENGE, and that is not a simplification.
          Applying a template to a challenge that already exists would overwrite
          a live brief - its prizes, its point rules, its wording - while people
          are entering it, and there is no version of that anybody wants a
          single press away. Starting from a template is a thing you do at the
          start. */}
      {!editing && (
        <ChallengeTemplates
          markets={markets}
          onUse={({ form: patch, rules: seededRules, groups: seededGroups }) => {
            // THE MARKET ALREADY CHOSEN WINS, AND ITS CURRENCY REWRITES THE
            // PRIZES. A template written in the UK carries "£150 cash" as words
            // in every prize row, and dropping that straight into a Spanish
            // challenge would put pounds on a Spanish leaderboard.
            //
            // ONE FUNCTIONAL UPDATE, APPLYING THE PATCH AND THEN THE SWAP TO
            // THE MERGED RESULT. Both halves have to see the same state: the
            // first version set the form and then swapped the currency a tick
            // later through `setCurrency`, which reads the form from its own
            // closure - so it rewrote the prizes from BEFORE the template and
            // put them back over it. The template's prizes appeared and then
            // turned into the defaults again. There is no timing left here to
            // get wrong.
            setForm((f) => {
              const merged = { ...f, ...patch }
              const wanted = markets.find((m) => m.id === f.community_id)?.currency
              if (!wanted || wanted === merged.prize_currency) return merged
              return { ...merged, ...inCurrency(merged, wanted) }
            })
            setRules(seededRules)
            setGroups(seededGroups)
            // The two contentEditable boxes re-read their content on a docId
            // change; see the note by `seeded`.
            setSeeded((n) => n + 1)
            // `instant`, never the default. See lib/scrollBehaviour.test.js:
            // this app scrolls smoothly platform-wide, and a REPOSITION IS NOT
            // A SCROLL - animating a thousand pixels here would race the form
            // re-rendering underneath it.
            window.scrollTo({ top: 0, behavior: 'instant' })
          }}
        />
      )}

      <form onSubmit={save} className="space-y-8 sm:space-y-10">
        {/* ---------------- Where it runs ---------------- */}
        {/* First, deliberately. Everything below reads differently depending on
            the answer (currency, who gets notified, whose board it lands on),
            and a challenge saved without one is readable by every creator on
            the platform. */}
        <section className="card space-y-5 max-sm:!rounded-none max-sm:!border-x-0 max-sm:!border-b-0 max-sm:!bg-transparent max-sm:!p-0 max-sm:!pt-6 max-sm:!shadow-none">
          {/* NO STANDING EXPLANATION. It read "a market challenge reaches that market only, a global challenge reaches
              everybody", which is the two cards underneath saying themselves. Removed at the team's request, with the
              other three like it on this page. */}
          <h2 className="text-lg font-semibold">Who it is for</h2>

          {/* Worldwide first and on its own, because it is a different KIND of
              decision from picking between markets, not another market. */}
          {globalCommunity && (
            <button
              type="button"
              onClick={() => set({ community_id: globalCommunity.id, tz: editing ? form.tz : 'Europe/London' })}
              aria-pressed={form.community_id === globalCommunity.id}
              className={cx(
                'flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5',
                form.community_id === globalCommunity.id ? PICKED : UNPICKED,
              )}
            >
              <span className="shrink-0 text-2xl leading-none" aria-hidden>🌍</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Global challenge</span>
                <span className={cx('mt-0.5 block text-xs', subText(form.community_id === globalCommunity.id))}>
                  Every creator in every market can enter, wherever they are based. In English.
                </span>
              </span>
              {form.community_id === globalCommunity.id && <Icon name="check" className="h-4 w-4 shrink-0 text-white" />}
            </button>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-smoke">Or one market</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {chapterMarkets.map((m) => (
              <button
                key={m.id} type="button"
                /* THROUGH `setCurrency`, NOT PAST IT. Picking a market sets
                   the currency, so it has to rewrite the prizes for the same
                   reason the picker does - otherwise choosing Spain leaves a
                   form that says EUR at the top and pounds on every line. */
                onClick={() => setCurrency(m.currency || form.prize_currency, {
                  community_id: m.id,
                  tz: editing ? form.tz : marketZone(m),
                  cpm_target: m.cpm_target ?? form.cpm_target,
                  market: (m.country_codes || [])[0] || form.market,
                })}
                aria-pressed={form.community_id === m.id}
                className={cx(
                  'flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5',
                  form.community_id === m.id ? PICKED : UNPICKED,
                )}
              >
                <span className="shrink-0 text-lg leading-none" aria-hidden>
                  {(m.country_codes || []).map(flagFromIso).join('') || '🌍'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{m.name}</span>
                  <span className={cx('block text-xs', subText(form.community_id === m.id))}>
                    {m.currency}{!m.is_active && ' · not open yet'}
                  </span>
                </span>
                {form.community_id === m.id && <Icon name="check" className="h-4 w-4 shrink-0 text-white" />}
              </button>
            ))}
            </div>
            {chapterMarkets.length === 0 && (
              <p className="rounded-xl bg-cloud px-4 py-6 text-center text-sm text-smoke">
                No markets exist yet. Open one from the network settings first.
              </p>
            )}
          </div>

          {form.community_id === globalCommunity?.id && (
            <p className="rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm">
              Publishing this notifies <span className="font-semibold">every creator on the platform</span>,
              in every market. Write the brief in English.
            </p>
          )}
        </section>

        {/* ---------------- How it is won ---------------- */}
        <AdminChallengeFormScoring
          PICKED={PICKED}
          UNPICKED={UNPICKED}
          audience={audience}
          editing={editing}
          form={form}
          groupPeople={groupPeople}
          groups={groups}
          groupsLoaded={groupsLoaded}
          id={id}
          rules={rules}
          set={set}
          setGroups={setGroups}
          setRules={setRules}
          subText={subText}
        />

        <AdminChallengeFormBasics
          ALL_PLATFORMS={ALL_PLATFORMS}
          PICKED={PICKED}
          SOCIAL_BRAND={SOCIAL_BRAND}
          activeEditor={activeEditor}
          briefRef={briefRef}
          ddmmToIso={ddmmToIso}
          editing={editing}
          form={form}
          isoToDdmm={isoToDdmm}
          rulesRef={rulesRef}
          seeded={seeded}
          set={set}
          togglePlatform={togglePlatform}
          writing={writing}
        />


        <section className="card space-y-5 max-sm:!rounded-none max-sm:!border-x-0 max-sm:!border-b-0 max-sm:!bg-transparent max-sm:!p-0 max-sm:!pt-6 max-sm:!shadow-none">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* NO STANDING EXPLANATION - see the note in "Who it is for". */}
            <h2 className="text-lg font-semibold">Prize breakdown</h2>
            <div className="flex items-center gap-2">
              {/* The currency lives HERE, beside the amounts it applies to,
                  rather than buried in a reporting section further down. It is
                  also the thing that makes a prize legible to a creator in
                  Bucharest reading a brief written in London.

                  IT IS WIDE ENOUGH TO READ NOW. At `w-28` the button showed "Pound (£)" as "Poun…" - So it is auto-width
                  from `sm` (there are two options and the longer is nine characters, so it cannot run away) and a short
                  label on a phone, where the header row is already carrying a heading. */}
              {/* SQUARE, LIKE THE FIELDS AROUND IT (20 Oct 2026: "the Euro thing at the top is currently rounded"). */}
              <Select
                variant="field"
                className="hidden w-auto min-w-[8.5rem] sm:block [&>button]:!py-2" ariaLabel="Prize currency"
                value={form.prize_currency}
                onChange={setCurrency}
                options={CURRENCIES}
              />
              <Select
                variant="field"
                className="w-[6rem] sm:hidden [&>button]:!px-3 [&>button]:!py-2" ariaLabel="Prize currency"
                value={form.prize_currency}
                onChange={setCurrency}
                options={CURRENCIES.map((c) => ({ ...c, label: `${CURRENCY_SYMBOL[c.value] || ''} ${c.value}` }))}
              />
            </div>
          </div>
          {/* ONE EDITOR, SHARED WITH THE GROUPS. See PrizeBreakdownFields:
              a board that plays for its own prize has to be able to promise
              exactly what a challenge can promise, and two hand-written copies
              of this is how one of them ends up missing the field that gets
              people paid. */}
          <PrizeBreakdownFields
            prizes={form.prize_structure}
            onPrizes={(next) => set({ prize_structure: next })}
            symbol={CURRENCY_SYMBOL[form.prize_currency] || ''}
            participationThreshold={form.participation_threshold}
            participationPrize={form.participation_prize}
            onParticipation={({ threshold, prize }) =>
              set({ participation_threshold: threshold, participation_prize: prize })}
            participationExtra={{
              cap: form.participation_cap,
              reward_type: form.participation_reward_type,
              amount: form.participation_amount,
              scope: form.participation_scope,
              basis: form.participation_basis,
            }}
            pointsBasisAllowed={form.scoring === 'points'}
            onParticipationExtra={(patch) => set({
              ...('basis' in patch ? { participation_basis: patch.basis } : {}),
              ...('cap' in patch ? { participation_cap: patch.cap } : {}),
              ...('reward_type' in patch ? { participation_reward_type: patch.reward_type } : {}),
              ...('amount' in patch ? { participation_amount: patch.amount } : {}),
              ...('scope' in patch ? { participation_scope: patch.scope } : {}),
            })}
            extraAwards={form.extra_awards || []}
            onExtraAwards={(next) => set({ extra_awards: next })}
            idPrefix="challenge-prize"
          />

          <WeeklyPrizeFields
            value={form.weekly_prize}
            onChange={(next) => set({ weekly_prize: next })}
            symbol={CURRENCY_SYMBOL[form.prize_currency] || ''}
            currency={form.prize_currency || 'EUR'}
            start={startIsoOf(form)}
            end={endIsoOf(form)}
            tz={zoneOf(form)}
            live={form.status === 'active'}
            boards={Math.max(1, groups.length)}
          />

          {/* The totals, derived: cash and vouchers, with the taking-part
              reward as the range it really is. */}
          <PrizeSummary
            symbol={CURRENCY_SYMBOL[form.prize_currency] || ''}
            cpmTarget={form.cpm_target}
            weekly={(() => {
              const w = cleanWeekly(form.weekly_prize)
              if (!w) return null
              const rounds = weeklyRounds(startIsoOf(form), endIsoOf(form), w.every_days, { tz: zoneOf(form), roundEnds: w.round_ends }).length
              return { ...w, rounds, boards: Math.max(1, groups.length) }
            })()}
            legacyPot={potIsLegacy && groups.length === 0 ? derivedPot : null}
            budget={groups.length > 0 ? groupsBudget : prizeBudget({
              prizes: form.prize_structure,
              awards: form.extra_awards,
              participation: challengeParticipation,
              // With no cap the ceiling is everybody who could earn it: the market's active creators ( ).
              creators: audience.length || null,
            })}
          />

          {/* Participation reward: a separate, structured prize earned by posting
              a set number of videos. The number here drives when the voucher
              badge appears on the leaderboard. */}
        </section>

        {/* THE REPORTING SECTION IS GONE, and almost all of it was already known. they are right about five of the six
            fields:

            market       the challenge belongs to a community; that IS its market
            format       a 30-day brief is monthly and a 7-day one is express
            prize_type   readable from the prize breakdown - is there cash in it,
            vouchers, or both
            objective    said the same thing as "how it is won", one section up
            prize pot    already the sum of the prizes
            winners      already the number of places

            All six are derived on save (see `derivedReporting`), so they are
            right by construction rather than right if somebody remembered. The
            two that genuinely have no other source - who the brief is aimed at,
            and what KIND of video it asks for - are two selects in the basics
            rather than a section of their own. */}

        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

        {/* SAVE IS THE ORANGE ONE. On an edit screen saving IS the action, and it was the palest of three. */}
        {/* SAVE AS TEMPLATE SITS WITH SAVE, NOT IN A MENU. It is the other thing you can do with a finished brief, and
            the team asked for it "at the bottom". It is deliberately on the LEFT of the row and `btn-secondary`: saving
            the challenge is still the action, and a template is a side-effect of having written a good one.

            It is offered when EDITING too, which the rail is not - templating
            an existing challenge reads nothing and writes a new row, so it is
            safe in a way that applying one is not, and the brief worth keeping
            is usually one that has already run. */}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <SaveAsTemplate
            communityId={form.community_id}
            disabled={busy || !form.title.trim()}
            build={() => templateFromForm(form, rules, groups)}
          />
          <span className="flex-1" />
          <button type="button" onClick={() => navigate(editing ? `/challenges/${id}` : '/challenges')} className="btn-ghost">Cancel</button>
          {(!editing || form.status === 'draft') && (
            <button type="button" disabled={busy} onClick={(e) => save(e, true)} className="btn-secondary">
              {busy ? <Spinner /> : 'Save & publish'}
            </button>
          )}
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? <Spinner /> : editing ? 'Save changes' : 'Save as draft'}
          </button>
        </div>
      </form>

      {/* CLOSE ENTRIES / ARCHIVE, AT THE BOTTOM, ONLY WHEN THERE IS ONE TO DO.
          `active` -> `ended` is the one live challenges need; `ended` ->
          `archived` tidies a closed one away. `draft` is handled by "Save &
          publish" above, which is publishing by another name. */}
      {editing && (form.status === 'active' || form.status === 'ended') && (
        <div className="mt-10 rounded-card border border-cloud bg-cloud/30 p-5">
          <p className="text-xs font-semibold text-ink">
            {form.status === 'active' ? 'Close entries' : 'Archive this challenge'}
          </p>
          <p className="mb-3 mt-1 text-[11px] leading-relaxed text-smoke">
            {form.status === 'active'
              ? 'Stops new entries for every creator in this market. The board stays visible. This cannot be undone from here.'
              : 'Moves it into the archive. The board and its results stay exactly as they are.'}
          </p>
          <button
            type="button"
            onClick={() => setLifecycle(form.status === 'active' ? 'ended' : 'archived')}
            disabled={busy}
            className="btn-secondary !py-2 text-xs"
          >
            {busy ? <Spinner /> : <Icon name={form.status === 'active' ? 'ban' : 'bucket'} className="h-4 w-4" />}
            {form.status === 'active' ? 'Close entries' : 'Archive'}
          </button>
        </div>
      )}

      {/* DELETING A CHALLENGE LIVES ON THE CHALLENGE, like publishing and
          closing now do. It was the last thing keeping the separate
          "Manage challenges" list alive. */}
      {editing && (
        <div className="mt-10 rounded-card border border-red-100 bg-red-50/50 p-5">
          <p className="text-xs font-semibold text-red-600">Danger zone</p>
          <p className="mb-3 mt-1 text-[11px] leading-relaxed text-smoke">
            Permanently delete this challenge, every entry in it and all of its results. Rewards already
            paid keep their history. This cannot be undone.
          </p>
          <button type="button" onClick={destroy} disabled={busy} className="btn-danger !py-2 text-xs">
            <Icon name="trash" className="h-4 w-4" /> Delete challenge
          </button>
        </div>
      )}
    </div>
  )
}
