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
