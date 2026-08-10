import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { confirm, notice } from '../../lib/confirm'
import { toast } from '../../lib/toast'
import Icon from '../../components/Icon'
import Reorderable from '../../components/network/Reorderable'
import MilestonePath from '../../components/network/MilestonePath'
import { Badge, EmptyState, PageHeader, Skeleton } from '../../components/ui'
import { cx, formatViews } from '../../lib/utils'

// Editing the ladder.
//
// The whole feature is data, so this page is a table editor with a live preview
// of the exact component creators see. That preview is not decoration: the route
// is a drawn curve whose readability depends on how many stops there are and how
// long the labels run, and an admin adding a twelfth milestone should find that
// out here rather than from a creator.

const METRICS = [
  { value: 'videos', label: 'Videos published', hint: 'Entries submitted to any challenge' },
  { value: 'views', label: 'Views earned', hint: 'Logged views across every entry' },
  { value: 'referrals', label: 'Creators brought in', hint: 'Referrals who posted a video' },
  { value: 'challenges', label: 'Challenges entered', hint: 'Distinct challenges' },
  { value: 'days', label: 'Days in the programme', hint: 'Since being accepted' },
]

const KINDS = [
  { value: 'merch', label: 'Merch' },
  { value: 'voucher', label: 'Voucher' },
  { value: 'role', label: 'Role' },
  { value: 'access', label: 'Access' },
  { value: 'status', label: 'Status' },
  { value: 'other', label: 'Other' },
]

const BLANK = {
  title: '', description: '', metric: 'videos', threshold: 1,
  reward: '', reward_kind: 'merch', icon: 'flag', is_active: true,
}

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-smoke">{hint}</span>}
    </label>
  )
}

export default function AdminMilestones() {
  const [rows, setRows] = useState(null)
  const [editing, setEditing] = useState(null) // a row, or BLANK for a new one
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('milestones').select('*').order('sort_order').order('threshold')
    if (error) { notice(error.message); setRows([]); return }
    setRows(data || [])
  }, [])

  useEffect(() => { load() }, [load])

  async function save(e) {
    e.preventDefault()
    const m = editing
    if (!m.title.trim()) { notice('Give the milestone a title.'); return }
    if (!(Number(m.threshold) > 0)) { notice('The threshold has to be more than zero.'); return }
    setSaving(true)
    const patch = {
      title: m.title.trim(),
      description: m.description?.trim() || null,
      metric: m.metric,
      threshold: Number(m.threshold),
      reward: m.reward?.trim() || null,
      reward_kind: m.reward_kind,
      icon: m.icon || 'flag',
      is_active: m.is_active !== false,
    }
    const { error } = m.id
      ? await supabase.from('milestones').update(patch).eq('id', m.id)
      : await supabase.from('milestones').insert({
        ...patch,
        // New ones go at the end. Reordering is a drag, not a number to type.
        sort_order: ((rows || []).at(-1)?.sort_order ?? 0) + 10,
      })
    setSaving(false)
    if (error) { notice(error.message); return }
    setEditing(null)
    await load()
    toast(m.id ? 'Milestone saved.' : 'Milestone added.')
  }

  async function remove(m) {
    const ok = await confirm(
      `"${m.title}" disappears from every creator's route, and the record of who reached it goes with it.\n\n`
      + 'If you only want to take it off the route for now, set it to inactive instead.',
      { title: `Delete ${m.title}?`, confirmLabel: 'Delete', danger: true },
    )
    if (!ok) return
    const { error } = await supabase.from('milestones').delete().eq('id', m.id)
    if (error) { notice(error.message); return }
    await load()
    toast('Milestone deleted.')
  }

  async function toggleActive(m) {
    const { error } = await supabase.from('milestones').update({ is_active: !m.is_active }).eq('id', m.id)
    if (error) { notice(error.message); return }
    await load()
  }

  // Drag order is written back as a spaced sequence so a later insert has room
  // to land between two rows without a rewrite.
  async function reorder(next) {
    setRows(next)
    const updates = next.map((m, i) => supabase.from('milestones').update({ sort_order: (i + 1) * 10 }).eq('id', m.id))
    const results = await Promise.all(updates)
    const failed = results.find((r) => r.error)
    if (failed) { notice(failed.error.message); await load() }
  }

  if (!rows) {
    return <div className="page space-y-4"><Skeleton className="h-12 w-64" /><Skeleton className="h-64 w-full" /></div>
  }

  const preview = rows.filter((m) => m.is_active).map((m, i) => ({
    ...m, value: 0, reached: i < 2, // a plausible mid-route creator
  }))

  return (
    <div className="page">
      <Link to="/admin" className="mb-6 inline-block text-sm font-medium text-smoke hover:text-brand">← Admin</Link>
      <PageHeader
        title="Milestones"
        subtitle="The route every creator flies. Thresholds, rewards and order are all editable, and the route redraws itself."
        action={
          <button onClick={() => setEditing({ ...BLANK })} className="btn-primary !py-2.5">
            <Icon name="plus" className="h-4 w-4" /> New milestone
          </button>
        }
      />

      {editing && (
        <form onSubmit={save} className="card mb-8 !p-6">
          <h2 className="mb-4 text-lg font-semibold">{editing.id ? 'Edit milestone' : 'New milestone'}</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title">
              <input className="input" value={editing.title} maxLength={60}
                placeholder="Ten videos published"
                onChange={(e) => setEditing((m) => ({ ...m, title: e.target.value }))} />
            </Field>
            <Field label="Reward" hint="Shown as a chip on the route. Leave blank for a status-only stop.">
              <input className="input" value={editing.reward || ''} maxLength={80}
                placeholder="Tryp.com t-shirt"
                onChange={(e) => setEditing((m) => ({ ...m, reward: e.target.value }))} />
            </Field>
            {/* A ROW OF CHOICES, NOT A ROLLER.
                A native <select> renders as the OS picker - a grey iOS roller
                on a phone, a system dropdown on a Mac - which is why this one
                field looked like it belonged to a different application than
                everything around it. There are five metrics and they never
                change: showing all five is cheaper than hiding them behind a
                control that has to be opened, and it means the hint under the
                field can describe the one you are actually on.
                (Same reasoning as PeoplePicker replacing a select of 300
                names, and Segmented replacing the post-policy button.) */}
            <Field label="Measured on" hint={METRICS.find((x) => x.value === editing.metric)?.hint}>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Measured on">
                {METRICS.map((x) => (
                  <button
                    key={x.value}
                    type="button"
                    role="radio"
                    aria-checked={editing.metric === x.value}
                    onClick={() => setEditing((m) => ({ ...m, metric: x.value }))}
                    className={cx(
                      'rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 hover:scale-105',
                      editing.metric === x.value
                        ? 'border-brand bg-brand text-white'
                        : 'border-gray-200 text-smoke hover:border-brand/40',
                    )}
                  >
                    {x.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Threshold" hint="Reached when the number is at or above this.">
              <input className="input" type="number" min="1" value={editing.threshold}
                onChange={(e) => setEditing((m) => ({ ...m, threshold: e.target.value }))} />
            </Field>
            <Field label="Reward type" hint="Sets the colour of the chip.">
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Reward type">
                {KINDS.map((x) => (
                  <button
                    key={x.value}
                    type="button"
                    role="radio"
                    aria-checked={editing.reward_kind === x.value}
                    onClick={() => setEditing((m) => ({ ...m, reward_kind: x.value }))}
                    className={cx(
                      'rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200 hover:scale-105',
                      editing.reward_kind === x.value
                        ? 'border-brand bg-brand text-white'
                        : 'border-gray-200 text-smoke hover:border-brand/40',
                    )}
                  >
                    {x.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Description" hint="One line, shown to the creator.">
              <input className="input" value={editing.description || ''} maxLength={120}
                placeholder="Consistency is the whole game."
                onChange={(e) => setEditing((m) => ({ ...m, description: e.target.value }))} />
            </Field>
          </div>
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? 'Saving…' : editing.id ? 'Save changes' : 'Add milestone'}
            </button>
            <button type="button" onClick={() => setEditing(null)} className="btn-ghost">Cancel</button>
          </div>
        </form>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <section>
          <h2 className="mb-1 text-lg font-semibold">The ladder</h2>
          <p className="mb-4 text-sm text-smoke">Drag a row to change where it sits on the route.</p>
          {rows.length === 0 ? (
            <EmptyState icon={<Icon name="flag" className="h-7 w-7" />} title="No milestones yet"
              action={<button onClick={() => setEditing({ ...BLANK })} className="btn-primary">Add the first one</button>} />
          ) : (
            <Reorderable
              items={rows}
              onReorder={reorder}
              handleLabel="Reorder this milestone"
              className="space-y-2"
              renderItem={(m, { handleProps, dragging }) => (
                <div className={cx(
                  'flex flex-wrap items-center gap-3 rounded-card border bg-white px-4 py-3',
                  m.is_active ? 'border-gray-100' : 'border-dashed border-gray-200 opacity-60',
                  dragging && 'border-brand/40',
                )}>
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint">
                    <Icon name={m.icon || 'flag'} className="h-4 w-4 text-brand" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-semibold">{m.title}</span>
                      {!m.is_active && <Badge tone="grey">Off the route</Badge>}
                    </p>
                    <p className="truncate text-xs text-smoke">
                      {METRICS.find((x) => x.value === m.metric)?.label} ·{' '}
                      {m.metric === 'views' ? formatViews(Number(m.threshold)) : Number(m.threshold)}
                      {m.reward ? ` · ${m.reward}` : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button {...handleProps} title="Reorder"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-gray-300 hover:text-smoke">
                      <Icon name="grip" className="h-4 w-4" />
                    </button>
                    <button onClick={() => toggleActive(m)} title={m.is_active ? 'Take off the route' : 'Put back on the route'}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-smoke transition-colors hover:bg-cloud">
                      <Icon name={m.is_active ? 'eye' : 'ban'} className="h-4 w-4" />
                    </button>
                    <button onClick={() => setEditing(m)} title="Edit"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-smoke transition-colors hover:bg-brand-tint hover:text-brand">
                      <Icon name="pencil" className="h-4 w-4" />
                    </button>
                    <button onClick={() => remove(m)} title="Delete"
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-smoke transition-colors hover:bg-red-50 hover:text-red-600">
                      <Icon name="trash" className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            />
          )}
        </section>

        <aside className="lg:sticky lg:top-24">
          <h2 className="mb-1 text-lg font-semibold">How it looks</h2>
          <p className="mb-4 text-sm text-smoke">A creator two stops in.</p>
          {/* The preview lays itself out from ITS OWN width now, so a 22rem
              rail gets the narrow lane rather than the wide serpentine
              squeezed into a third of the room it needs. */}
          <div className="max-h-[70vh] overflow-y-auto overscroll-contain rounded-card border border-gray-100 bg-white px-2 py-5">
            <MilestonePath milestones={preview} standings={[]} />
          </div>
        </aside>
      </div>
    </div>
  )
}
