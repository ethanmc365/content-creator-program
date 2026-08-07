import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Skeleton, Spinner } from '../../components/ui'
import { cx, parseDateTime, isoToDateInput, isoToTimeInput } from '../../lib/utils'

// Create / edit a challenge. Everything is customisable: length, brief,
// rules, platforms and the full prize breakdown.
const ALL_PLATFORMS = ['Instagram', 'TikTok', 'YouTube']

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
  const editing = !!id

  const [loading, setLoading] = useState(editing)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
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
    scoring: 'prize',
    threshold_mode: 'highest',
  })

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

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
      prize_amount: form.prize_amount === '' ? null : Number(form.prize_amount),
      prize_currency: form.prize_currency || 'GBP',
      winners_count: form.winners_count === '' ? null : parseInt(form.winners_count, 10),
      prize_type: form.prize_type || null,
      content_type: form.content_type || null,
      objective: form.objective || null,
      scoring: form.scoring || 'prize',
      threshold_mode: form.threshold_mode || 'highest',
      cpm_target: form.cpm_target === '' ? null : Number(form.cpm_target),
    }

    const { error: dbError } = editing
      ? await supabase.from('challenges').update(payload).eq('id', id)
      : await supabase.from('challenges').insert({ ...payload, created_by: user.id })

    setBusy(false)
    if (dbError) return setError(dbError.message)
    navigate('/admin/challenges')
  }

  if (loading) {
    return <div className="page max-w-3xl space-y-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-96 w-full" /></div>
  }

  return (
    <div className="page max-w-3xl">
      <PageHeader
        title={editing ? 'Edit challenge' : 'New challenge'}
        subtitle={editing ? 'Changes go live immediately for everyone.' : 'Set the brief, the dates and the prizes. Publish when you\'re ready.'}
      />

      <form onSubmit={save} className="space-y-10">
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
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Prize breakdown</h2>
            <button type="button" className="btn-secondary !py-2 text-xs" onClick={() => set({ prize_structure: [...form.prize_structure, { place: '', prize: '' }] })}>
              + Add prize
            </button>
          </div>
          {form.prize_structure.map((p, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text" className="input !w-40" placeholder="Place (e.g. 1st)"
                value={p.place} onChange={(e) => setPrize(i, 'place', e.target.value)} aria-label={`Prize ${i + 1} place`}
              />
              <input
                type="text" className="input flex-1" placeholder="Prize (e.g. £150 cash)"
                value={p.prize} onChange={(e) => setPrize(i, 'prize', e.target.value)} aria-label={`Prize ${i + 1} description`}
              />
              <button type="button" aria-label="Remove prize" className="btn-ghost !px-3" onClick={() => set({ prize_structure: form.prize_structure.filter((_, j) => j !== i) })}>
                ✕
              </button>
            </div>
          ))}

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

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="prize_amount" className="label">Total prize pot</label>
              <div className="flex gap-2">
                <select
                  className="input !w-24" value={form.prize_currency}
                  onChange={(e) => set({ prize_currency: e.target.value })}
                  aria-label="Prize currency"
                >
                  <option value="GBP">GBP</option>
                  <option value="EUR">EUR</option>
                  <option value="USD">USD</option>
                </select>
                <input
                  id="prize_amount" type="text" inputMode="decimal" className="input flex-1"
                  value={form.prize_amount}
                  onInput={(e) => { e.target.value = e.target.value.replace(/[^0-9.]/g, '') }}
                  onChange={(e) => set({ prize_amount: e.target.value })}
                  placeholder="190"
                />
              </div>
              <p className="mt-1 text-xs text-smoke">Cash + voucher value, added together.</p>
            </div>
            <div>
              <label htmlFor="winners_count" className="label">Number of winners</label>
              <input
                id="winners_count" type="text" inputMode="numeric" className="input"
                value={form.winners_count}
                onInput={(e) => { e.target.value = e.target.value.replace(/\D/g, '') }}
                onChange={(e) => set({ winners_count: e.target.value })}
                placeholder="3"
              />
            </div>
            <div>
              <label htmlFor="cpm_target" className="label">CPM target</label>
              <input
                id="cpm_target" type="text" inputMode="decimal" className="input"
                value={form.cpm_target}
                onInput={(e) => { e.target.value = e.target.value.replace(/[^0-9.]/g, '') }}
                onChange={(e) => set({ cpm_target: e.target.value })}
                placeholder="0.50"
              />
              <p className="mt-1 text-xs text-smoke">Cost per 1,000 views to beat.</p>
            </div>
          </div>

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
            <div>
              {/* How the challenge is WON, which is a different question from
                  what it optimises for. A prize challenge is judged on final
                  views; a points challenge accumulates against the market's
                  rules and shows a live leaderboard instead. */}
              <label htmlFor="scoring" className="label">How it is scored</label>
              <select id="scoring" className="input" value={form.scoring} onChange={(e) => set({ scoring: e.target.value })}>
                <option value="prize">Cash prizes, ranked on views</option>
                <option value="points">Points leaderboard</option>
              </select>
              <p className="mt-1 text-xs text-smoke">
                {form.scoring === 'points'
                  ? "Uses this market's scoring rules. Edit them in the market settings."
                  : 'Winners are ranked on final logged views and paid from the pot.'}
              </p>
            </div>
            {form.scoring === 'points' && (
              <div>
                <label htmlFor="threshold_mode" className="label">View milestones</label>
                <select id="threshold_mode" className="input" value={form.threshold_mode} onChange={(e) => set({ threshold_mode: e.target.value })}>
                  <option value="highest">Highest milestone only</option>
                  <option value="cumulative">Every milestone passed</option>
                </select>
                <p className="mt-1 text-xs text-smoke">
                  A video past 50k scores {form.threshold_mode === 'highest' ? 'just the 50k tier' : 'the 5k, 10k and 50k tiers together'}.
                </p>
              </div>
            )}
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
