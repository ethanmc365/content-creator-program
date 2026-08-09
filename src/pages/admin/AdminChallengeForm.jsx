import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Icon from '../../components/Icon'
import PointRulesEditor from '../../components/network/PointRulesEditor'
import { flagFromIso } from '../../components/network/PlaceSwitcher'
import { PageHeader, Skeleton, Spinner } from '../../components/ui'
import { SCORING_MODES, scoringMode, DEFAULT_SCORING, STARTER_POINT_RULES } from '../../lib/scoring'
import { cx, parseDateTime, isoToDateInput, isoToTimeInput } from '../../lib/utils'

// Create / edit a challenge. Everything is customisable: which market it runs
// in, how it is won, length, brief, rules, platforms and the full prize
// breakdown.
const ALL_PLATFORMS = ['Instagram', 'TikTok', 'YouTube']

const CURRENCIES = ['GBP', 'EUR', 'USD', 'RON', 'SEK', 'NOK', 'DKK']
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
    publishDateStr: '', publishTimeStr: '',
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
          publishDateStr: isoToDateInput(data.publish_at), publishTimeStr: isoToTimeInput(data.publish_at),
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
      publish_at: parseDateTime(form.publishDateStr, form.publishTimeStr) || null,
      // "Save & publish" flips a draft live (creators get notified by the DB trigger).
      status: publishNow ? 'active' : form.status,
      // Reporting fields (admin-only, never shown to creators).
      market: form.market.trim() || null,
      format: form.format || null,
      audience: form.audience || null,
      prize_currency: form.prize_currency || 'GBP',
      // Written from the breakdown, not from a field. /admin/analytics reads
      // these columns and neither it nor the database needs to know they became
      // derived.
      prize_amount: derivedPot || null,
      winners_count: derivedWinners || null,
      prize_type: form.prize_type || null,
      content_type: form.content_type || null,
      objective: form.objective || null,
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
    return <div className="page max-w-3xl space-y-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-96 w-full" /></div>
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

  return (
    <div className="page max-w-3xl">
      <PageHeader
        title={editing ? 'Edit challenge' : 'New challenge'}
        subtitle={editing ? 'Changes go live immediately for everyone.' : 'Set the brief, the dates and the prizes. Publish when you\'re ready.'}
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
          <div>
            <h2 className="text-lg font-semibold">How it is won</h2>
            <p className="mt-1 text-sm text-smoke">
              Set per challenge, not per market. The same market can run a points month and a best-video month.
            </p>
          </div>

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

          {/* A challenge already run under the old prize format keeps it. The
              option is not offered for a new one, but hiding it while editing
              would make the form silently propose changing the rules of a
              finished contest. */}
          {form.scoring === 'prize' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <p className="text-sm font-semibold text-amber-800">This challenge uses the original prize format</p>
              <p className="mt-1 text-xs text-amber-700">
                Judged by the team, ranked on final views. Picking one of the three above changes how this
                challenge is decided, so only do it if that is what you mean.
              </p>
            </div>
          )}

          {form.scoring === 'points' && (
            <div className="rounded-xl border border-brand/20 bg-brand-tint/20 p-4">
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

          {(form.scoring === 'best_video' || form.scoring === 'total_views') && (
            <p className="rounded-xl bg-cloud/60 px-4 py-3 text-sm text-smoke">
              {scoringMode(form.scoring).winner} Views come from the logged view count on each entry,
              so keep those up to date as the challenge runs.
            </p>
          )}
        </section>

        <section className="card space-y-6">
          <h2 className="text-lg font-semibold">The basics</h2>
          <div>
            <label htmlFor="title" className="label">Title</label>
            <input id="title" type="text" required className="input" value={form.title} onChange={(e) => set({ title: e.target.value })} placeholder='e.g. "Summer Escapes Challenge"' />
          </div>
          <div>
            <label htmlFor="description" className="label">Brief / description</label>
            <textarea id="description" rows={6} required className="input" value={form.description} onChange={(e) => set({ description: e.target.value })} placeholder="What should creators make? What's the angle? What wins?" />
          </div>
          <div>
            <label htmlFor="rules" className="label">Rules</label>
            <textarea id="rules" rows={5} className="input" value={form.rules} onChange={(e) => set({ rules: e.target.value })} placeholder={'• One entry per platform\n• Tag Tryp.com in the caption\n• …'} />
          </div>
        </section>

        <section className="card space-y-6">
          <h2 className="text-lg font-semibold">Dates & platforms</h2>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-4">
            <div>
              <label htmlFor="start_date" className="label">Start date</label>
              <input id="start_date" type="text" inputMode="numeric" required className="input" value={form.startDateStr} onChange={(e) => set({ startDateStr: e.target.value })} placeholder="DD/MM/YYYY" />
            </div>
            <div>
              <label htmlFor="start_time" className="label">Start time</label>
              <input id="start_time" type="text" inputMode="numeric" required className="input" value={form.startTimeStr} onChange={(e) => set({ startTimeStr: e.target.value })} placeholder="HH:MM" />
            </div>
            <div>
              <label htmlFor="end_date" className="label">End date</label>
              <input id="end_date" type="text" inputMode="numeric" required className="input" value={form.endDateStr} onChange={(e) => set({ endDateStr: e.target.value })} placeholder="DD/MM/YYYY" />
            </div>
            <div>
              <label htmlFor="end_time" className="label">End time</label>
              <input id="end_time" type="text" inputMode="numeric" required className="input" value={form.endTimeStr} onChange={(e) => set({ endTimeStr: e.target.value })} placeholder="HH:MM" />
            </div>
          </div>

          {/* Optional: schedule the challenge to go live automatically. */}
          <div className="rounded-xl bg-cloud/60 p-4">
            <p className="label">Schedule publish <span className="font-normal text-smoke">(optional)</span></p>
            <p className="mb-3 text-xs text-smoke">Save as a draft with a publish time and it goes live automatically (creators get notified). Leave blank to publish manually.</p>
            <div className="grid grid-cols-2 gap-4">
              <input id="publish_date" type="text" inputMode="numeric" className="input" value={form.publishDateStr} onChange={(e) => set({ publishDateStr: e.target.value })} placeholder="DD/MM/YYYY" />
              <input id="publish_time" type="text" inputMode="numeric" className="input" value={form.publishTimeStr} onChange={(e) => set({ publishTimeStr: e.target.value })} placeholder="HH:MM" />
            </div>
          </div>
          <div>
            <p className="label">Platforms that count</p>
            <div className="flex flex-wrap gap-2">
              {ALL_PLATFORMS.map((p) => (
                <button
                  key={p} type="button" onClick={() => togglePlatform(p)} aria-pressed={form.platforms.includes(p)}
                  className={cx(
                    'rounded-full px-5 py-2 text-sm font-medium transition-colors',
                    form.platforms.includes(p) ? 'bg-brand text-white' : 'border border-gray-200 text-smoke hover:border-brand hover:text-brand'
                  )}
                >
                  {p}
                </button>
              ))}
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
              <select
                className="input !w-24" value={form.prize_currency}
                onChange={(e) => set({ prize_currency: e.target.value })}
                aria-label="Prize currency"
              >
                {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <button type="button" className="btn-secondary !py-2 text-xs" onClick={() => set({ prize_structure: [...form.prize_structure, { place: '', prize: '', amount: '' }] })}>
                + Add prize
              </button>
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
                value={p.prize} onChange={(e) => setPrize(i, 'prize', e.target.value)} aria-label={`Prize ${i + 1} description`}
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
          <div className="rounded-xl border border-brand/20 bg-brand-tint/40 p-4">
            <p className="label">Participation reward <span className="font-normal text-smoke">(optional)</span></p>
            <p className="mb-3 text-xs text-smoke">Reward every creator who posts a set number of videos. It shows on the challenge and a badge appears beside them on the leaderboard once they hit the target.</p>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm text-smoke">Post</span>
                <input
                  type="number" min="1" inputMode="numeric" className="input !w-20 text-center"
                  value={form.participation_threshold}
                  onChange={(e) => set({ participation_threshold: e.target.value })}
                  placeholder="3" aria-label="Videos needed for the participation reward"
                />
                <span className="text-sm text-smoke">videos to earn</span>
              </div>
              <input
                type="text" className="input flex-1"
                value={form.participation_prize}
                onChange={(e) => set({ participation_prize: e.target.value })}
                placeholder="e.g. £10 Tryp.com voucher" aria-label="Participation reward"
              />
            </div>
          </div>
        </section>

        {/* Reporting. Nothing here is shown to a creator: these are the fields
            that let /admin/analytics compare one challenge to another (cost per
            thousand views, cost per post, performance by market and format).
            The prize pot is a single number on purpose - the prize breakdown
            above is copy for creators, this is the figure finance works from. */}
        <section className="card space-y-6">
          <div>
            <h2 className="text-lg font-semibold">Reporting</h2>
            <p className="mt-1 text-sm text-smoke">
              Admin only, never shown to creators. These fields are what make this challenge
              comparable to every other one on the analytics page.
            </p>
          </div>

          {/* The three numbers that used to be typed here - pot, winners and
              CPM target - are now DERIVED: the first two from the prize
              breakdown above, the third from the market this challenge belongs
              to. They were the most-forgotten fields on the form and the ones
              the analytics page depends on most, which is the worst possible
              combination. What is left here is the labelling that genuinely has
              no other source. */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="market" className="label">Market</label>
              <input
                id="market" type="text" className="input" value={form.market}
                onChange={(e) => set({ market: e.target.value.toUpperCase().slice(0, 4) })}
                placeholder="UK"
              />
              <p className="mt-1 text-xs text-smoke">Country code, e.g. UK, ES, DE.</p>
            </div>
            <div>
              <label htmlFor="format" className="label">Format</label>
              <select id="format" className="input" value={form.format} onChange={(e) => set({ format: e.target.value })}>
                <option value="monthly">Monthly</option>
                <option value="express">Express</option>
                <option value="always_on">Always on</option>
              </select>
            </div>
            <div>
              <label htmlFor="audience" className="label">Group</label>
              <select id="audience" className="input" value={form.audience} onChange={(e) => set({ audience: e.target.value })}>
                <option value="general">General</option>
                <option value="ugc">UGC</option>
                <option value="vip">VIP</option>
              </select>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="prize_type" className="label">Prize type</label>
              <select id="prize_type" className="input" value={form.prize_type} onChange={(e) => set({ prize_type: e.target.value })}>
                <option value="cash">Cash</option>
                <option value="voucher">Travel voucher</option>
                <option value="cash_voucher">Cash &amp; voucher</option>
                <option value="product">Product</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label htmlFor="content_type" className="label">Content type</label>
              <select id="content_type" className="input" value={form.content_type} onChange={(e) => set({ content_type: e.target.value })}>
                <option value="free">Free</option>
                <option value="suggested">Suggested videos</option>
                <option value="talking">Talking style</option>
                <option value="hooks">Hooks</option>
                <option value="other">Other</option>
              </select>
            </div>
            {/* How the challenge is won lives in its own section above. It is a
                product decision creators see, not a reporting field. */}
            <div>
              <label htmlFor="objective" className="label">Objective</label>
              <select id="objective" className="input" value={form.objective} onChange={(e) => set({ objective: e.target.value })}>
                <option value="views">Views</option>
                <option value="videos">Number of videos</option>
                <option value="creativity">Creativity</option>
                <option value="trust">Views / trust</option>
              </select>
            </div>
          </div>
        </section>

        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <button type="button" onClick={() => navigate('/admin/challenges')} className="btn-ghost">Cancel</button>
          <button type="submit" disabled={busy} className="btn-secondary">
            {busy ? <Spinner /> : editing ? 'Save changes' : 'Save as draft'}
          </button>
          {(!editing || form.status === 'draft') && (
            <button type="button" disabled={busy} onClick={(e) => save(e, true)} className="btn-primary">
              {busy ? <Spinner /> : 'Save & publish'}
            </button>
          )}
        </div>
      </form>
    </div>
  )
}
