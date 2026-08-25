import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { confirm } from '../../lib/confirm'
import { useAuth } from '../../context/AuthContext'
import Icon from '../../components/Icon'
import RichEditable from '../../components/RichEditable'
import RichToolbar from '../../components/RichToolbar'
import PlatformBadges from '../../components/PlatformBadges'
// Two currencies, from the same list every other market control uses. The seven
// that were here included four nothing has ever been priced in.
import { COMMON_ZONES, CURRENCIES } from '../../lib/timezones'
import PointRulesEditor from '../../components/network/PointRulesEditor'
import { flagFromIso } from '../../components/network/PlaceSwitcher'
import { PageHeader, Skeleton, Spinner, Select } from '../../components/ui'
import { DateField, TimeField } from '../../components/DateTimeFields'
import { SCORING_MODES, DEFAULT_SCORING, STARTER_POINT_RULES } from '../../lib/scoring'
import { cx, parseDateTime, isoToDateInput, isoToTimeInput } from '../../lib/utils'

// Create / edit a challenge. Everything is customisable: which market it runs
// in, how it is won, length, brief, rules, platforms and the full prize
// breakdown.
const ALL_PLATFORMS = ['Instagram', 'TikTok', 'YouTube', 'Facebook']

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

const CURRENCY_SYMBOL = { GBP: '£', EUR: '€', USD: '$', RON: 'lei ', SEK: 'kr ', NOK: 'kr ', DKK: 'kr ' }

const DEFAULT_PRIZES = [
  { place: '1st', prize: '£150 cash' },
  { place: '2nd', prize: '£100 cash' },
  { place: '3rd', prize: '£75 cash' },
  { place: 'All valid entries', prize: '£25 Tryp.com voucher' },
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
    objective: 'views',
    cpm_target: '0.50',
    community_id: '',
    scoring: DEFAULT_SCORING,
    threshold_mode: 'highest',
  })

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

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

  function setPrize(i, key, value) {
    const prizes = [...form.prize_structure]
    prizes[i] = { ...prizes[i], [key]: value }
    set({ prize_structure: prizes })
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

    setBusy(true)
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      rules: form.rules.trim(),
      platforms: form.platforms,
      prize_structure: form.prize_structure.filter((p) => p.place && p.prize),
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
    // it. Replace-all rather than diffed: a market has a handful of rules, and
    // replacing removes the whole class of bug where a deleted row survives
    // because the diff missed it. A non-points challenge has none, so switching
    // a challenge away from points clears them rather than leaving a ledger
    // nothing reads.
    const challengeId = saved?.id ?? id
    if (challengeId) {
      const { error: delErr } = await supabase.from('point_rules').delete().eq('challenge_id', challengeId)
      if (delErr) { setBusy(false); return setError(delErr.message) }
      if (form.scoring === 'points' && rules.length) {
        const { error: ruleErr } = await supabase.from('point_rules').insert(
          rules.map((r, i) => ({
            community_id: form.community_id,
            challenge_id: challengeId,
            kind: r.kind,
            label: r.label,
            points: r.points,
            threshold: r.kind === 'views_threshold' ? r.threshold : null,
            max_points: r.kind === 'per_post' ? r.max_points : null,
            position: i,
            is_active: true,
          })),
        )
        if (ruleErr) { setBusy(false); return setError(ruleErr.message) }
      }
      // Rebuild the ledger from the rules that now exist. Without this an edit
      // to the rules leaves yesterday's points standing until the next
      // submission happens to fire the trigger.
      if (form.scoring === 'points') {
        await supabase.rpc('recalc_challenge_points', { p_challenge: challengeId })
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
  const rowPot = form.prize_structure.reduce((sum, p) => sum + (Number(p.amount) || 0), 0)
  const rowWinners = form.prize_structure.filter((p) => p.place?.trim() && Number(p.amount) > 0).length
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
          <div>
            <h2 className="text-lg font-semibold">Who it is for</h2>
            <p className="mt-1 text-sm text-smoke">
              A market challenge reaches that market only. A global challenge reaches everybody.
            </p>
          </div>

          {/* Worldwide first and on its own, because it is a different KIND of
              decision from picking between markets, not another market. */}
          {globalCommunity && (
            <button
              type="button"
              onClick={() => set({ community_id: globalCommunity.id })}
              aria-pressed={form.community_id === globalCommunity.id}
              className={cx(
                'flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5',
                form.community_id === globalCommunity.id
                  ? 'border-brand bg-brand-tint/40 shadow-card'
                  : 'border-gray-200 bg-white hover:border-brand/40',
              )}
            >
              <span className="shrink-0 text-2xl leading-none" aria-hidden>🌍</span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">Global challenge</span>
                <span className="mt-0.5 block text-xs text-smoke">
                  Every creator in every market can enter, wherever they are based. In English.
                </span>
              </span>
              {form.community_id === globalCommunity.id && <Icon name="check" className="h-4 w-4 shrink-0 text-brand" />}
            </button>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-smoke">Or one market</p>
            <div className="grid gap-2 sm:grid-cols-2">
            {chapterMarkets.map((m) => (
              <button
                key={m.id} type="button"
                onClick={() => set({ community_id: m.id, prize_currency: m.currency || form.prize_currency, cpm_target: m.cpm_target ?? form.cpm_target,
                  market: (m.country_codes || [])[0] || form.market })}
                aria-pressed={form.community_id === m.id}
                className={cx(
                  'flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition-all duration-200 hover:-translate-y-0.5',
                  form.community_id === m.id
                    ? 'border-brand bg-brand-tint/40'
                    : 'border-gray-200 bg-white hover:border-brand/40',
                )}
              >
                <span className="shrink-0 text-lg leading-none" aria-hidden>
                  {(m.country_codes || []).map(flagFromIso).join('') || '🌍'}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{m.name}</span>
                  <span className="block text-xs text-smoke">
                    {m.currency}{!m.is_active && ' · not open yet'}
                  </span>
                </span>
                {form.community_id === m.id && <Icon name="check" className="h-4 w-4 shrink-0 text-brand" />}
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
                  form.scoring === m.value
                    ? 'border-brand bg-brand-tint/40 shadow-card'
                    : 'border-gray-200 bg-white hover:border-brand/40',
                )}
              >
                <span className="flex items-center gap-2">
                  <Icon name={m.icon} className={cx('h-5 w-5 shrink-0', form.scoring === m.value ? 'text-brand' : 'text-smoke')} />
                  <span className="text-sm font-semibold">{m.label}</span>
                </span>
                <span className="mt-2 text-xs leading-relaxed text-smoke">{m.blurb}</span>
                <span className="mt-3 text-[11px] font-semibold uppercase tracking-wide text-brand">{m.winner}</span>
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
              markdown the challenge page already renders. */}
          <div>
            <p className="label">Brief</p>
            <RichToolbar editorRef={briefRef} only={['h2', 'h3', '|', 'bold', 'italic', 'link', '|', 'ul', 'ol']} />
            <RichEditable
              ref={briefRef}
              docId={`brief-${editing || 'new'}`}
              initialMd={form.description || ''}
              onChangeMd={(md) => set({ description: md })}
              placeholder="What should creators make? What is the angle? What wins?"
              className="min-h-[12rem] rounded-card border border-gray-200 bg-white px-5 py-4 text-[15px] leading-relaxed focus:border-brand/40"
            />
          </div>
          <div>
            <p className="label">Rules</p>
            <RichToolbar editorRef={rulesRef} only={['bold', 'italic', 'link', '|', 'ul', 'ol']} />
            <RichEditable
              ref={rulesRef}
              docId={`rules-${editing || 'new'}`}
              initialMd={form.rules || ''}
              onChangeMd={(md) => set({ rules: md })}
              placeholder="One entry per platform. Tag Tryp.com in the caption."
              className="min-h-[9rem] rounded-card border border-gray-200 bg-white px-5 py-4 text-[15px] leading-relaxed focus:border-brand/40"
            />
          </div>

          {/* PLATFORMS YOU CAN POST ON, with their marks. Four identical grey
              pills reading Instagram / TikTok / YouTube / Facebook is a list you
              read; four marks is a row you recognise. */}
          <div>
            {/* THE TWO THINGS NOTHING ELSE KNOWS.
                Everything else the old Reporting section asked for is derived
                now. Who the brief is aimed at and what kind of video it wants
                are genuine facts with no other source, so they stay - as two
                small selects here rather than a section of their own. */}
            <div className="mb-6 grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="audience" className="label">Who it is for</label>
                <Select id="audience" variant="field" ariaLabel="Who it is for" value={form.audience} onChange={(v) => set({ audience: v })}
                  options={[
                    { value: 'general', label: 'Everyone in the market' },
                    { value: 'ugc', label: 'UGC creators' },
                    { value: 'vip', label: 'VIP creators' },
                  ]} />
              </div>
              <div>
                <label htmlFor="content_type" className="label">What kind of video</label>
                <Select id="content_type" variant="field" ariaLabel="What kind of video" value={form.content_type} onChange={(v) => set({ content_type: v })}
                  options={[
                    { value: 'free', label: 'Their own idea' },
                    { value: 'suggested', label: 'From suggested videos' },
                    { value: 'talking', label: 'Talking to camera' },
                    { value: 'hooks', label: 'Built on a hook' },
                    { value: 'other', label: 'Something else' },
                  ]} />
              </div>
            </div>

            <p className="label">Platforms you can post on</p>
            <div className="flex flex-wrap gap-2">
              {ALL_PLATFORMS.map((p) => {
                const on = form.platforms.includes(p)
                return (
                  <button
                    key={p} type="button" onClick={() => togglePlatform(p)} aria-pressed={on}
                    className={cx(
                      'inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200',
                      on ? 'border-brand bg-brand-tint text-brand' : 'border-gray-200 text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand',
                    )}
                  >
                    <PlatformBadges platforms={[p]} size="sm" />
                    {p}
                  </button>
                )
              })}
            </div>
          </div>
        </section>


        <section className="card space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Prize breakdown</h2>
              <p className="mt-1 text-sm text-smoke">
                What creators see, and where the reporting numbers come from.
              </p>
            </div>
            <div className="flex items-center gap-2">
              {/* The currency lives HERE, beside the amounts it applies to,
                  rather than buried in a reporting section further down. It is
                  also the thing that makes a prize legible to a creator in
                  Bucharest reading a brief written in London. */}
              <Select
                className="w-28" ariaLabel="Prize currency"
                value={form.prize_currency}
                onChange={(v) => set({ prize_currency: v })}
                options={CURRENCIES}
              />
            </div>
          </div>
          {form.prize_structure.map((p, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <input
                type="text" className="input !w-32" placeholder="Place (e.g. 1st)"
                value={p.place} onChange={(e) => setPrize(i, 'place', e.target.value)} aria-label={`Prize ${i + 1} place`}
              />
              <input
                type="text" className="input min-w-0 flex-1" placeholder="What they get (e.g. £150 cash)"
                value={p.prize}
                onChange={(e) => {
                  const text = e.target.value
                  setPrize(i, 'prize', text)
                  // READ THE NUMBER OUT OF THE WORDS.
                  //
                  // Ethan: type "£105 cash" and the value box should fill in.
                  // Only while it is still EMPTY - a guess that overwrites a
                  // figure somebody typed is worse than no guess, because they
                  // have no reason to look at it again.
                  if (!String(p.amount ?? '').trim()) {
                    const m = text.match(/(?:[£€$]\s*)?(\d[\d,]*(?:\.\d{1,2})?)/)
                    if (m) setPrize(i, 'amount', m[1].replace(/,/g, ''))
                  }
                }}
                aria-label={`Prize ${i + 1} description`}
              />
              {/* The VALUE, separate from the words. "£150 cash and a jacket" is
                  the right thing to show a creator and an impossible thing to
                  add up, so the number it is worth is its own field and the
                  total below is arithmetic rather than a second guess. */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs font-medium text-smoke">{CURRENCY_SYMBOL[form.prize_currency] || ''}</span>
                <input
                  type="text" inputMode="decimal" className="input !w-24" placeholder="150"
                  value={p.amount ?? ''}
                  onInput={(e) => { e.target.value = e.target.value.replace(/[^0-9.]/g, '') }}
                  onChange={(e) => setPrize(i, 'amount', e.target.value)}
                  aria-label={`Prize ${i + 1} value`}
                />
              </div>
              <button type="button" aria-label="Remove prize" className="btn-ghost !px-3" onClick={() => set({ prize_structure: form.prize_structure.filter((_, j) => j !== i) })}>
                ✕
              </button>
            </div>
          ))}

          {/* THE BUTTON GOES WHERE THE LIST ENDS. It was up in the header
              beside the currency, which reads as page furniture rather than
              "add another row to this". */}
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-4 py-2.5 text-sm font-medium text-smoke transition-all duration-200 hover:border-brand hover:text-brand"
            onClick={() => set({ prize_structure: [...form.prize_structure, { place: '', prize: '', amount: '' }] })}
          >
            <Icon name="plus" className="h-4 w-4" /> Add a prize
          </button>

          {/* THE PARTICIPATION REWARD IS A PRIZE, so it sits with the prizes
              and above the total rather than in a tinted box of its own at the
              bottom. Ethan asked for exactly that, and for the explanation to
              go: the sentence described a mechanism that is now fully automatic
              - the badge appears on the leaderboard by itself and the voucher
              count is derived from the entries, so there is nothing here for a
              person to remember. */}
          <div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-cloud/40 px-4 py-3 sm:flex-row sm:items-center">
            <div className="flex items-center gap-2">
              <span className="text-sm text-smoke">Post</span>
              <input
                type="number" min="1" inputMode="numeric" className="input !w-16 text-center"
                value={form.participation_threshold}
                onChange={(e) => set({ participation_threshold: e.target.value })}
                placeholder="3" aria-label="Videos needed for the participation reward"
              />
              <span className="text-sm text-smoke">videos and everyone gets</span>
            </div>
            <input
              type="text" className="input min-w-0 flex-1"
              value={form.participation_prize}
              onChange={(e) => set({ participation_prize: e.target.value })}
              placeholder="e.g. £10 Tryp.com voucher" aria-label="Participation reward"
            />
          </div>

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
              <span className="text-xs text-smoke"> (from the market)</span>
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
