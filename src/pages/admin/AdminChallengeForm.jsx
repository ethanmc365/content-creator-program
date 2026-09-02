import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { confirm } from '../../lib/confirm'
import { useAuth } from '../../context/AuthContext'
import Icon from '../../components/Icon'
import RichEditable from '../../components/RichEditable'
import RichToolbar from '../../components/RichToolbar'
import SocialMark from '../../components/SocialMark'
// Two currencies, from the same list every other market control uses. The seven
// that were here included four nothing has ever been priced in.
import { COMMON_ZONES, CURRENCIES } from '../../lib/timezones'
import PointRulesEditor from '../../components/network/PointRulesEditor'
import ChallengeGroupsEditor from '../../components/admin/ChallengeGroupsEditor'
import PrizeBreakdownFields, { prizeKind, prizeTotals, cleanPrizes } from '../../components/admin/PrizeBreakdownFields'
import { flagFromIso } from '../../components/network/PlaceSwitcher'
import { PageHeader, Skeleton, Spinner, Select } from '../../components/ui'
import { DateField, TimeField } from '../../components/DateTimeFields'
import { SCORING_MODES, DEFAULT_SCORING, STARTER_POINT_RULES, normalisePointRule } from '../../lib/scoring'
import { cx, parseDateTime, isoToDateInput, isoToTimeInput } from '../../lib/utils'
import { testFlags } from '../../lib/testData'

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
// This form's state is still "DD/MM/YYYY" strings because `parseDateTime`
// pairs them with the time boxes on save, so the two adapters below sit between
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
// Ethan: "whenever you click something, rather than it showing in the light
// orange, I want it to be the Tryp.com orange that shows up. It's more clear,
// easier to see, better design."
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

const CURRENCY_SYMBOL = { GBP: '£', EUR: '€', USD: '$', RON: 'lei ', SEK: 'kr ', NOK: 'kr ', DKK: 'kr ' }

// NO "ALL VALID ENTRIES" ROW. Ethan: "I don't get the all valid entries that
// shows up. I think that should be removed and not suggested, because we can't
// really automate that, and we don't want to be giving that away."
// He is right on both counts: a prize to everyone who enters is a real cost
// that nobody decided, pre-filled into the form as though it were the house
// style. The participation reward below is the deliberate version of the same
// idea, and it is empty until somebody sets it.
const DEFAULT_PRIZES = [
  { place: '1st', prize: '£150 cash' },
  { place: '2nd', prize: '£100 cash' },
  { place: '3rd', prize: '£75 cash' },
]

export default function AdminChallengeForm() {
  const { id } = useParams() // present when editing
  const { user } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const editing = !!id

  const [loading, setLoading] = useState(editing)
  const [busy, setBusy] = useState(false)
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
    startDateStr: '', startTimeStr: '',
    endDateStr: '', endTimeStr: '',
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
  // Ethan: "whenever I click from pound to euro it shows up a hundred and fifty
  // pound cash still in the box - it should change to euro as well as the
  // symbol."
  //
  // A prize is a STRING ("£150 cash"), because prizes are not always money, and
  // the currency picker only ever changed a field beside it - so the picker
  // said EUR and every line on the form said pounds. The number is deliberately
  // NOT converted: an admin switching to euros is deciding what the prize IS,
  // not restating a payment already made, and 150 pounds becoming 174.30 euros
  // is nobody's prize. Symbol and code both, because both get typed.
  const setCurrency = (next, extra = {}) => {
    const from = CURRENCY_SYMBOL[form.prize_currency] || ''
    const to = CURRENCY_SYMBOL[next] || ''
    const swap = (text) => {
      let out = String(text ?? '')
      if (from && to && from !== to) out = out.split(from).join(to)
      if (form.prize_currency !== next) {
        out = out.replace(new RegExp(`\\b${form.prize_currency}\\b`, 'g'), next)
      }
      return out
    }
    set({
      ...extra,
      prize_currency: next,
      prize_structure: form.prize_structure.map((p) => ({ ...p, prize: swap(p.prize) })),
      participation_prize: swap(form.participation_prize),
    })
  }

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
    supabase.from('communities')
      .select('id, slug, name, kind, country_codes, currency, is_active, cpm_target')
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
    supabase.from('point_rules').select('*').eq('challenge_id', id).order('position')
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
        supabase.from('challenge_groups').select('*').eq('challenge_id', id).order('position'),
        supabase.from('challenge_group_members').select('group_id, creator_id').eq('challenge_id', id),
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
        members: members.filter((m) => m.group_id === g.id).map((m) => m.creator_id),
      })))
      setGroupsLoaded(true)
    })()
    return () => { alive = false }
  }, [editing, id])

  // WHO CAN BE DEALT IN: the market's own roster, minus admins and the QA
  // accounts, which is the same audience every other member count on this
  // platform uses. Re-read whenever the market changes, because moving a
  // challenge between markets changes who is even eligible.
  useEffect(() => {
    if (!form.community_id) { setAudience([]); return undefined }
    let alive = true
    supabase
      .from('community_members')
      .select('profile_id, profiles!inner(id, name, photo_url, city, country, is_admin, is_test, status)')
      .eq('community_id', form.community_id)
      .eq('status', 'active')
      .eq('profiles.is_admin', false)
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
    supabase.from('profiles').select('id, name, photo_url, city, country').in('id', missingIds)
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
    supabase.from('challenges').select('*').eq('id', id).single().then(({ data }) => {
      if (data) {
        setForm({
          ...data,
          startDateStr: isoToDateInput(data.start_date), startTimeStr: isoToTimeInput(data.start_date),
          endDateStr: isoToDateInput(data.end_date), endTimeStr: isoToTimeInput(data.end_date),
          prize_structure: Array.isArray(data.prize_structure) ? data.prize_structure : DEFAULT_PRIZES,
          participation_threshold: data.participation_threshold ?? '',
          participation_prize: data.participation_prize ?? '',
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
      const a = parseDateTime(form.startDateStr, form.startTimeStr)
      const b = parseDateTime(form.endDateStr, form.endTimeStr)
      return a && b ? Math.round((b - a) / 86400000) : null
    })()

    // A market IS the community the brief belongs to. The old free-text box
    // asked for "UK, ES, DE" and accepted anything, including nothing.
    const community = markets.find((c) => c.id === form.community_id)
    const market = community
      ? (community.country_codes?.[0] || community.name || null)
      : null

    // Cash, vouchers, or both - readable off the prizes as written.
    const prizeText = (form.prize_structure ?? []).map((p) => p.prize || '').join(' ').toLowerCase()
    const participation = (form.participation_prize || '').toLowerCase()
    const hasVoucher = /voucher|credit/.test(`${prizeText} ${participation}`)
    const hasCash = (form.prize_structure ?? []).some((p) => Number(p.amount) > 0)
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
  }, [form.startDateStr, form.startTimeStr, form.endDateStr, form.endTimeStr,
      form.community_id, form.prize_structure, form.participation_prize,
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
    let del = supabase.from('challenge_groups').delete().eq('challenge_id', challengeId)
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
      }
    }

    // The new ones come back with their ids so their members can be written in
    // the same pass. `select()` on an insert is what makes that one round trip
    // rather than an insert followed by a re-read.
    const fresh = groups.map((g, i) => ({ g, i })).filter(({ g }) => !g.id)
    let created = []
    if (fresh.length) {
      const { data, error } = await supabase.from('challenge_groups')
        .insert(fresh.map(({ g, i }) => row(g, i))).select('id, position')
      if (error) return error.message
      created = data ?? []
    }
    for (const g of kept) {
      const i = groups.indexOf(g)
      const { error } = await supabase.from('challenge_groups').update(row(g, i)).eq('id', g.id)
      if (error) return error.message
    }

    // position -> id, for the groups that did not have one a moment ago.
    const idAt = new Map(created.map((c) => [c.position, c.id]))
    const members = groups.flatMap((g, i) => {
      const gid = g.id || idAt.get(i)
      return gid ? g.members.map((creator_id) => ({ challenge_id: challengeId, group_id: gid, creator_id })) : []
    })

    const { error: wipeErr } = await supabase.from('challenge_group_members')
      .delete().eq('challenge_id', challengeId)
    if (wipeErr) return wipeErr.message
    if (members.length) {
      const { error: memErr } = await supabase.from('challenge_group_members').insert(members)
      if (memErr) return memErr.message
    }
    return null
  }

  async function save(e, publishNow = false) {
    e.preventDefault()
    setError('')
    const startIso = parseDateTime(form.startDateStr, form.startTimeStr)
    const endIso = parseDateTime(form.endDateStr, form.endTimeStr)
    if (!startIso || !endIso) {
      return setError('Enter dates as DD/MM/YYYY and times as HH:MM (24h).')
    }
    if (new Date(endIso) <= new Date(startIso)) {
      return setError('The end date must be after the start date.')
    }
    if (form.platforms.length === 0) return setError('Pick at least one platform.')
    if (!form.community_id) {
      return setError('Pick the market this challenge runs in. A challenge with no market is visible to every creator on the platform.')
    }
    if (form.scoring === 'points' && rules.length === 0) {
      return setError('A points challenge needs at least one scoring rule, or nobody can score.')
    }
    // EVERYBODY OR NOBODY. Once a challenge is split into groups, a creator who
    // was never dealt into one is a creator racing on a board with no prize -
    // which used to be allowed and explained in a footnote under the editor.
    // Ethan: "if someone's not added to a group it just doesn't work. Someone
    // always has to be in a group. It doesn't have to be even, but they have to
    // be in a group." The editor names who is missing and offers to deal them
    // out; this is what stops the save. `groups.length === 0` is the
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
      start_date: startIso,
      end_date: endIso,
      // Optional auto-publish time: a cron flips the draft live at this moment.
      // SCHEDULE PUBLISH IS GONE, and the start date does its job.
      //
      // Ethan: "if I enter a date that is 10 days ahead, it should
      // automatically start then - there's no need to schedule it as well." He
      // is right, and the two fields could disagree: a challenge could be set
      // to publish on the 5th and start on the 1st, and nothing said which won.
      // A draft with a future start date now publishes itself at that date.
      publish_at: parseDateTime(form.startDateStr, form.startTimeStr) || null,
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
    }

    const { data: saved, error: dbError } = editing
      ? await supabase.from('challenges').update(payload).eq('id', id).select('id').single()
      : await supabase.from('challenges').insert({ ...payload, created_by: user.id }).select('id').single()

    if (dbError) { setBusy(false); return setError(dbError.message) }

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
    const challengeId = saved?.id ?? id
    if (challengeId) {
      const wanted = form.scoring === 'points' ? rules : []
      // `seed-N` ids come from STARTER_POINT_RULES and are not database rows.
      const kept = wanted.filter((r) => r.id && !String(r.id).startsWith('seed-'))
      let del = supabase.from('point_rules').delete().eq('challenge_id', challengeId)
      if (kept.length) del = del.not('id', 'in', `(${kept.map((r) => r.id).join(',')})`)
      const { error: delErr } = await del
      if (delErr) { setBusy(false); return setError(delErr.message) }

      const rows = wanted.map((r, i) => ({
        community_id: form.community_id,
        challenge_id: challengeId,
        ...normalisePointRule(r),
        // The question a creator is asked at submission time. Bonuses only, and
        // an empty one means "an admin awards this by hand" - see migration 155.
        prompt: r.kind === 'bonus' && r.prompt?.trim() ? r.prompt.trim() : null,
        position: i,
        is_active: true,
      }))
      const existing = rows.filter((_, i) => wanted[i].id && !String(wanted[i].id).startsWith('seed-'))
        .map((row, k) => ({ ...row, id: kept[k].id }))
      const fresh = rows.filter((_, i) => !wanted[i].id || String(wanted[i].id).startsWith('seed-'))
      if (existing.length) {
        const { error: upErr } = await supabase.from('point_rules').upsert(existing)
        if (upErr) { setBusy(false); return setError(upErr.message) }
      }
      if (fresh.length) {
        const { error: insErr2 } = await supabase.from('point_rules').insert(fresh)
        if (insErr2) { setBusy(false); return setError(insErr2.message) }
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
        await supabase.rpc('recalc_challenge_points', { p_challenge: challengeId })
      }
      // And the leaderboard, because the groups may have moved: a creator who
      // changed board has to be ranked on the new one.
      if (form.scoring !== 'points') {
        await supabase.rpc('rebuild_challenge_results', { p_challenge: challengeId })
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
  const potIsLegacy = !rowPot && derivedPot > 0

  async function destroy() {
    const { count } = await supabase
      .from('submissions').select('id', { count: 'exact', head: true }).eq('challenge_id', editing)
    const entries = count ?? 0
    if (!await confirm(
      `Permanently delete "${form.title || 'this challenge'}"?\n\nThis also deletes ${entries} submission${entries === 1 ? '' : 's'} and all its results. This cannot be undone.`,
    )) return
    setBusy(true)
    const { error: err } = await supabase.rpc('admin_delete_challenge', { target: editing })
    setBusy(false)
    if (err) { setError(`Could not delete: ${err.message}`); return }
    navigate('/challenges')
  }

  return (
    <div className="page max-w-5xl">
      <PageHeader
        back={{ to: '/admin/challenges', label: 'Challenges' }}
        title={editing ? 'Edit challenge' : 'New challenge'}
      />

      <form onSubmit={save} className="space-y-10">
        {/* ---------------- Where it runs ---------------- */}
        {/* First, deliberately. Everything below reads differently depending on
            the answer (currency, who gets notified, whose board it lands on),
            and a challenge saved without one is readable by every creator on
            the platform. */}
        <section className="card space-y-5">
          {/* NO STANDING EXPLANATION. It read "a market challenge reaches that
              market only, a global challenge reaches everybody", which is the
              two cards underneath saying themselves. Removed at Ethan's
              request, with the other three like it on this page. */}
          <h2 className="text-lg font-semibold">Who it is for</h2>

          {/* Worldwide first and on its own, because it is a different KIND of
              decision from picking between markets, not another market. */}
          {globalCommunity && (
            <button
              type="button"
              onClick={() => set({ community_id: globalCommunity.id })}
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
            <div className="grid gap-2 sm:grid-cols-2">
            {chapterMarkets.map((m) => (
              <button
                key={m.id} type="button"
                /* THROUGH `setCurrency`, NOT PAST IT. Picking a market sets
                   the currency, so it has to rewrite the prizes for the same
                   reason the picker does - otherwise choosing Spain leaves a
                   form that says EUR at the top and pounds on every line. */
                onClick={() => setCurrency(m.currency || form.prize_currency, {
                  community_id: m.id,
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
            <p className="rounded-xl border border-brand/20 bg-brand-tint/30 px-4 py-3 text-sm">
              Publishing this notifies <span className="font-semibold">every creator on the platform</span>,
              in every market. Write the brief in English.
            </p>
          )}
        </section>

        {/* ---------------- How it is won ---------------- */}
        <section className="card space-y-5">
          <h2 className="text-lg font-semibold">How it is won</h2>

          <div className="grid gap-3 sm:grid-cols-3">
            {SCORING_MODES.map((m) => (
              <button
                key={m.value} type="button" onClick={() => {
                  set({ scoring: m.value })
                  // Seed the standard rules the first time points is chosen, so
                  // the common case is one click rather than four.
                  if (m.value === 'points' && rules.length === 0) {
                    setRules(STARTER_POINT_RULES.map((r, i) => ({ ...r, id: `seed-${i}` })))
                  }
                }}
                aria-pressed={form.scoring === m.value}
                className={cx(
                  'flex flex-col rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5',
                  form.scoring === m.value ? PICKED : UNPICKED,
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon name={m.icon} className={cx('h-5 w-5 shrink-0', form.scoring === m.value ? 'text-white' : 'text-smoke')} />
                  <span className="text-sm font-semibold">{m.label}</span>
                </span>
                <span className={cx('mt-2 text-xs leading-relaxed', subText(form.scoring === m.value))}>{m.blurb}</span>
                <span className={cx('mt-3 text-[11px] font-semibold uppercase tracking-wide', form.scoring === m.value ? 'text-white' : 'text-brand')}>{m.winner}</span>
              </button>
            ))}
          </div>

          {/* A challenge run under the old prize format keeps it. The option is
              not offered for a new one, and the warning that used to sit here is
              gone at Ethan's request - it explained a format nobody is choosing
              and made an edit screen for a finished contest look alarming. */}
          {form.scoring === 'points' && (
            // A NEUTRAL PANEL. It was a brand-tinted box holding brand-tinted
            // controls, which Ethan flagged: everything inside it was the same
            // pale orange as everything else, so the points values - the one
            // thing on the panel worth spotting - had nothing to stand out
            // against. The panel is plain now and the points are the only
            // orange thing on it.
            <div className="rounded-xl border border-gray-200 bg-cloud/40 p-4">
              <p className="label">Scoring rules for this challenge</p>
              <p className="mb-4 text-xs text-smoke">
                Creators see these on the brief. Editing them after the challenge is live rescores it.
              </p>
              <PointRulesEditor
                rules={rules}
                onChange={setRules}
                thresholdMode={form.threshold_mode}
                onThresholdMode={(v) => set({ threshold_mode: v })}
              />
            </div>
          )}

          {/* NOTHING HERE FOR THE VIEW-RANKED MODES.
              Picking "best single video" used to print a paragraph explaining
              what best single video means - directly under the card that had
              just explained it, and next to a line about keeping view counts up
              to date which has not been true since they became automatic. The
              card is the explanation. Only points needs a box, because points
              is the only mode with anything left to decide. */}

          {/* ---- GROUPS ----
              MORE THAN ONE LEADERBOARD INSIDE ONE BRIEF.
              Ethan: "the way the Spanish community is currently run, they have
              two groups inside the one challenge."
              It sits under "How it is won" because that is what it is: not a
              different contest, a different way of deciding who is racing
              whom. See lib/challengeGroups and migration 154. */}
          <div className="border-t border-gray-100 pt-5">
            {/* NO STANDING EXPLANATION - see the note in "Who it is for". */}
            <p className="label mb-3">Leaderboards</p>
            {!groupsLoaded ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <ChallengeGroupsEditor
                groups={groups}
                onChange={setGroups}
                audience={audience}
                people={groupPeople}
                currency={form.prize_currency || 'EUR'}
              />
            )}
            {groups.length > 0 && !form.community_id && (
              <p className="mt-2 text-xs text-red-500">
                Pick the market first - the creators you can deal into a group are its roster.
              </p>
            )}
          </div>
        </section>

        <section className="card space-y-6">
          <h2 className="text-lg font-semibold">The basics</h2>
          <div>
            <label htmlFor="title" className="label">Title</label>
            <input id="title" type="text" required className="input" value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder='e.g. "Summer Escapes Challenge"' />
          </div>

          {/* WHEN IT RUNS SITS WITH WHAT IT IS CALLED.
              Dates were three sections further down, past scoring and prizes,
              which is a strange place for the second thing anybody decides. */}
          <div>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
              <DateField id="start_date" label="Starts"
                value={ddmmToIso(form.startDateStr)}
                onChange={(iso) => set({ startDateStr: isoToDdmm(iso) })} />
              <TimeField id="start_time" label="at"
                value={form.startTimeStr}
                onChange={(v) => set({ startTimeStr: v })} />
              <DateField id="end_date" label="Ends"
                value={ddmmToIso(form.endDateStr)}
                onChange={(iso) => set({ endDateStr: isoToDdmm(iso) })}
                min={ddmmToIso(form.startDateStr) || undefined}
                futureError="The challenge would end before it starts." />
              <TimeField id="end_time" label="at"
                value={form.endTimeStr}
                onChange={(v) => set({ endTimeStr: v })} />
            </div>
            {/* The market's own clock, guessed and changeable. A UK challenge
                closing "at midnight" means midnight in London; the same brief in
                Spain means midnight in Madrid. */}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-smoke">Times are</span>
              <Select
                className="w-44"
                ariaLabel="Timezone"
                value={form.tz || 'Europe/London'}
                onChange={(v) => set({ tz: v })}
                options={COMMON_ZONES}
              />
              <span className="text-xs text-smoke">time.</span>
            </div>
          </div>

          {/* THE BRIEF IS WRITTEN, NOT CODED. Same surface as Notes and the
              library: headings, bold and bullets look like themselves, the box
              grows with what you write, and what is stored is the portable
              markdown the challenge page already renders.

              ONE TOOLBAR FOR BOTH BOXES, AND IT FOLLOWS YOU DOWN.
              Ethan: "it looks odd that it shows up heading two, heading three,
              bold, on every one - it's a strange design. I was thinking of just
              having it at the top, and then it works for both the rules and the
              brief, instead of having it twice."
              Two identical bars stacked forty lines apart is a bar you stop
              reading as a control and start reading as a border. So there is
              one, it is sticky under the app header, and it points at whichever
              box the CARET is in - which is what a formatting bar has always
              meant. `activeEditor` is literally one of the two refs; see the
              note on `writing` for why the caret and not a focus event decides
              which.

              AND H1 IS THERE NOW. Ethan: "why don't we have heading one? We
              should have heading one as well." It was always in RichToolbar's
              list and simply not asked for here, so a brief could carry an H2
              and an H3 and had no title-sized heading at all. */}
          <div>
            <div className="sticky top-[4.5rem] z-10 mb-3 flex items-center gap-2 rounded-xl bg-white/95 backdrop-blur">
              <RichToolbar
                editorRef={activeEditor}
                only={['h1', 'h2', 'h3', '|', 'bold', 'italic', 'link', '|', 'ul', 'ol']}
                className="!mb-0 min-w-0 flex-1"
              />
              <span className="hidden shrink-0 pr-2 text-[11px] font-medium text-smoke sm:block">
                Editing the {writing === 'rules' ? 'rules' : 'brief'}
              </span>
            </div>

            <div>
              <p className="label">Brief</p>
              <RichEditable
                ref={briefRef}
                docId={`brief-${editing || 'new'}`}
                initialMd={form.description || ''}
                onChangeMd={(md) => set({ description: md })}
                placeholder="What should creators make? What is the angle? What wins?"
                className="min-h-[12rem] rounded-card border border-gray-200 bg-white px-5 py-4 text-[15px] leading-relaxed focus:border-brand/40"
              />
            </div>

            <div className="mt-6">
              <p className="label">Rules</p>
              <RichEditable
                ref={rulesRef}
                docId={`rules-${editing || 'new'}`}
                initialMd={form.rules || ''}
                onChangeMd={(md) => set({ rules: md })}
                placeholder="One entry per platform. Tag Tryp.com in the caption."
                className="min-h-[9rem] rounded-card border border-gray-200 bg-white px-5 py-4 text-[15px] leading-relaxed focus:border-brand/40"
              />
            </div>
          </div>

          {/* PLATFORMS YOU CAN POST ON, with their marks. Four identical grey
              pills reading Instagram / TikTok / YouTube / Facebook is a list you
              read; four marks is a row you recognise. */}
          <div>
            {/* "WHO IS IT FOR" IS GONE, AND IT WAS ALWAYS ANSWERED ALREADY.
                Ethan: "the who is it for is unnecessary, because it should
                obviously be for whatever market was selected. We don't have UGC
                or VIP creator challenges yet, so just get rid of it
                altogether." The market is picked at the top of this form, in a
                section whose heading is those same four words; a second control
                offering "UGC creators" and "VIP creators" was asking about a
                distinction the platform does not draw. The column stays in the
                database and saves as `general`, so nothing that reads it breaks
                and the option can come back if those tiers ever exist.

                WHAT KIND OF VIDEO STAYS, and it can now say something the list
                does not cover. */}
            <div className="mb-6">
              <label htmlFor="content_type" className="label">What kind of video</label>
              <Select id="content_type" variant="field" ariaLabel="What kind of video" value={form.content_type} onChange={(v) => set({ content_type: v })}
                options={[
                  { value: 'free', label: 'Their own idea' },
                  { value: 'suggested', label: 'One of the suggested videos' },
                  { value: 'talking', label: 'Talking to camera' },
                  { value: 'hooks', label: 'Built on a hook' },
                  { value: 'other', label: 'Something else - I will say what' },
                ]} />
              {form.content_type === 'other' && (
                <input
                  type="text"
                  className="input mt-2"
                  value={form.content_note}
                  onChange={(e) => set({ content_note: e.target.value })}
                  placeholder="e.g. a walkthrough of one booking, start to finish"
                  aria-label="What kind of video, in your own words"
                />
              )}
            </div>

            {/* THE REAL MARKS, IN THEIR REAL COLOURS.
                Ethan: "the grey icons - I'd like the actual colourful social
                media icons here." `PlatformBadges` draws every mark grey in a
                grey disc, which is right on a leaderboard row where four of
                them sit beside a name and wrong here, where each one IS the
                choice you are making. `SocialMark colored` is the same set of
                marks the profile already uses, in the platforms' own colours
                (and Instagram's actual gradient), so this is the app's existing
                answer rather than a fifth drawing of a TikTok note.
                THE COLOUR SURVIVES THE SELECTION. A picked pill is brand orange
                now, and a coloured mark on orange still reads - it is the mark
                that identifies the row, so draining it on the pill you have
                chosen would be exactly backwards. */}
            <p className="label">Platforms you can post on</p>
            <div className="flex flex-wrap gap-2">
              {ALL_PLATFORMS.map((p) => {
                const on = form.platforms.includes(p)
                return (
                  <button
                    key={p} type="button" onClick={() => togglePlatform(p)} aria-pressed={on}
                    className={cx(
                      'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5',
                      on ? PICKED : 'border-gray-200 bg-white text-smoke hover:border-brand hover:text-brand',
                    )}
                  >
                    <span className={cx('flex h-6 w-6 items-center justify-center rounded-full', on ? 'bg-white' : 'bg-cloud')}>
                      <SocialMark brand={SOCIAL_BRAND[p]} colored className="h-4 w-4" />
                    </span>
                    {p}
                  </button>
                )
              })}
            </div>
          </div>
        </section>


        <section className="card space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* NO STANDING EXPLANATION - see the note in "Who it is for". */}
            <h2 className="text-lg font-semibold">Prize breakdown</h2>
            <div className="flex items-center gap-2">
              {/* The currency lives HERE, beside the amounts it applies to,
                  rather than buried in a reporting section further down. It is
                  also the thing that makes a prize legible to a creator in
                  Bucharest reading a brief written in London.

                  IT IS WIDE ENOUGH TO READ NOW. At `w-28` the button showed
                  "Pound (£)" as "Poun…" - Ethan: "the pound is like pound dot
                  dot dot. There's loads of room on desktop anyway, so you
                  should fit in the actual button to show it. And on mobile you
                  can just show the currency symbol." So it is auto-width from
                  `sm` (there are two options and the longer is nine
                  characters, so it cannot run away) and a short label on a
                  phone, where the header row is already carrying a heading. */}
              <Select
                className="hidden w-auto min-w-[8.5rem] sm:block" ariaLabel="Prize currency"
                value={form.prize_currency}
                onChange={setCurrency}
                options={CURRENCIES}
              />
              <Select
                className="w-[5.5rem] sm:hidden" ariaLabel="Prize currency"
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
            idPrefix="challenge-prize"
          />

          {/* The totals, derived. Nothing to type and nothing to keep in sync. */}
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-xl bg-cloud/60 px-4 py-3 text-sm">
            <span>
              <span className="text-smoke">Total prize pot </span>
              <span className="font-bold text-brand">
                {CURRENCY_SYMBOL[form.prize_currency] || ''}{derivedPot.toLocaleString()}
              </span>
            </span>
            <span>
              <span className="text-smoke">Winners </span>
              <span className="font-bold">{derivedWinners}</span>
            </span>
            <span>
              <span className="text-smoke">CPM target </span>
              <span className="font-bold">{form.cpm_target || '—'}</span>
            </span>
            {potIsLegacy && (
              <span className="basis-full text-xs text-smoke">
                Carried over from before values were itemised. Add a value to each prize row and this
                starts adding itself up.
              </span>
            )}
          </div>

          {/* Participation reward: a separate, structured prize earned by posting
              a set number of videos. The number here drives when the voucher
              badge appears on the leaderboard. */}
        </section>

        {/* THE REPORTING SECTION IS GONE, and almost all of it was already
            known. Ethan: "you obviously have all this info already and this
            should be automated." He is right about five of the six fields:

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

        {/* SAVE IS THE ORANGE ONE. Ethan asked for it: "perhaps highlight the
            save button in Tryp.com orange, make it more clear". On an edit
            screen saving IS the action, and it was the palest of three. */}
        <div className="flex flex-wrap items-center justify-end gap-3">
          <button type="button" onClick={() => navigate(editing ? `/challenges/${editing}` : '/challenges')} className="btn-ghost">Cancel</button>
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
