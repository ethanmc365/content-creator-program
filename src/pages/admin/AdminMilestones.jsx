import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { confirm, notice } from '../../lib/confirm'
import { toast } from '../../lib/toast'
import Icon from '../../components/Icon'
import Reorderable from '../../components/network/Reorderable'
import MilestonePath from '../../components/network/MilestonePath'
import { Avatar, Badge, EmptyState, PageHeader, Skeleton } from '../../components/ui'
import { cx } from '../../lib/utils'
import {
  METRICS, METRIC_BY_VALUE, REWARD_PARTS, rewardSummary, UNITS,
  criterionNeed, fromDays, toDays,
} from '../../lib/milestones'
import { CURRENCIES } from '../../lib/timezones'

// Editing the ladder.
//
// The whole feature is data, so this page is a table editor with a live preview
// of the exact component creators see. That preview is not decoration: the route
// is a drawn curve whose readability depends on how many stops there are and how
// long the labels run, and an admin adding a twelfth milestone should find that
// out here rather than from a creator.
//
// WHAT CHANGED, AND WHY THE PAGE HAD TO
//
// A milestone used to be one metric and one number, which is why the editor was
// one radio row and one input. It is now a SET of requirements, all of which
// have to be met, and the stops are gated in order. Both of those need saying
// out loud on this page, because both are invisible until they bite:
//
//   - the requirements builder, so "500,000 views AND 50 videos AND 3 referrals"
//     is one stop rather than three unrelated ones;
//   - a HELD UP count per row, because a gated route punishes bad ordering
//     silently. The live ladder puts "refer a creator" second and no creator has
//     ever referred anybody, so eleven people are parked at stop one with a
//     dozen earned stops between them going unawarded. Nothing on this page
//     said so before; now the row says it in orange.

const ICONS = ['flag', 'video', 'eye', 'star', 'trophy', 'plane', 'chart', 'megaphone', 'ticket', 'clock', 'share', 'heart']

const BLANK = {
  title: '', description: '', reward: '', reward_kind: 'merch',
  role_title: '', voucher_amount: '', voucher_currency: 'EUR',
  items: [], gives: [],
  icon: 'flag', is_active: true,
  criteria: [{ metric: 'videos', threshold: 1, unit: 'days' }],
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

// ONE REQUIREMENT, EDITABLE.
//
// The metric is fixed once the row exists - changing it is deleting this
// requirement and adding another, and offering it as a dropdown inside a row
// that also has a number in it produces the state where somebody switches
// "views" to "videos" and leaves 100,000 sitting in the box.
function CriterionRow({ c, onChange, onRemove }) {
  const [draft, setDraft] = useState(null)
  const m = METRIC_BY_VALUE[c.metric]
  const isDays = c.metric === 'days'
  // Days are stored canonical and typed in whatever unit suits, so the input
  // shows the converted number and the store gets days back.
  const shown = isDays ? fromDays(c.threshold, c.unit || 'days') : c.threshold

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-white p-2">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-tint">
        <Icon name={m?.icon || 'flag'} className="h-4 w-4 text-brand" />
      </span>
      <span className="min-w-0 flex-1 text-sm font-medium">{m?.label || c.metric}</span>

      {/* THE BOX HOLDS WHAT WAS TYPED, not what was stored.
          Converting on every keystroke meant an empty box became 1 day became
          "0.03 months" and could never be cleared to type "6". The raw string
          is kept while the field has focus and only converted on the way out. */}
      <input
        type="number"
        min="1"
        step="any"
        value={draft ?? shown}
        aria-label={`${m?.label} threshold`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const v = Number(draft)
          setDraft(null)
          if (draft === null || draft === '' || !(v > 0)) return
          onChange({ ...c, threshold: isDays ? toDays(v, c.unit || 'days') : v })
        }}
        className="input !w-28 !py-1.5 text-sm"
      />

      {/* DAYS, MONTHS OR YEARS. Nobody sets a milestone at "183 days"; they set
          it at six months. The ladder still compares days underneath.

          CHANGING THE UNIT KEEPS THE NUMBER, and that is the fix for a real
          trap: switching a 1-day requirement to months used to leave the stored
          1 alone, so the box read "0.03 months" - and typing over it was
          hopeless, because every keystroke was being converted back through a
          value that had already lost its meaning. Picking "months" now means
          "the number in the box is months", so 1 day becomes 1 month. */}
      {isDays && (
        <div className="flex gap-1">
          {UNITS.map((u) => (
            <button
              key={u.value}
              type="button"
              onClick={() => onChange({ ...c, unit: u.value, threshold: toDays(Math.max(1, Math.round(shown)), u.value) })}
              aria-pressed={(c.unit || 'days') === u.value}
              className={cx(
                'rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors',
                (c.unit || 'days') === u.value
                  ? 'border-brand bg-brand text-white'
                  : 'border-gray-200 text-smoke hover:border-brand/40',
              )}
            >
              {u.label}
            </button>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onRemove}
        title="Remove this requirement"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-smoke transition-colors hover:bg-red-50 hover:text-red-600"
      >
        <Icon name="close" className="h-4 w-4" />
      </button>
    </div>
  )
}

export default function AdminMilestones() {
  const formRef = useRef(null)
  const [rows, setRows] = useState(null)
  const [stats, setStats] = useState({})
  const [editing, setEditing] = useState(null) // a row, or BLANK for a new one
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    const [{ data, error }, { data: overview }] = await Promise.all([
      supabase.from('milestones').select('*, milestone_criteria(*)').order('sort_order'),
      supabase.rpc('milestone_overview'),
    ])
    if (error) { notice(error.message); setRows([]); return }
    setRows((data || []).map((m) => ({ ...m, criteria: m.milestone_criteria || [] })))
    setStats(Object.fromEntries((overview || []).map((o) => [o.milestone_id, o])))
  }, [])

  useEffect(() => { load() }, [load])

  // OPENING THE EDITOR HAS TO TAKE YOU TO IT.
  //
  // The form renders ABOVE the ladder, and the ladder is eleven rows long - so
  // clicking the pencil on the ninth stop changed something eight hundred
  // pixels off the top of the screen and left you looking at the list you just
  // clicked in, with no sign anything had happened. Ethan's report was that he
  // did not realise he was editing at all.
  //
  // Scrolled after paint, because the form does not exist in the DOM until the
  // render that `setEditing` causes.
  // Keyed on WHICH milestone is open, not on the object: `editing` is replaced
  // on every keystroke, and scrolling the page on every keystroke is worse than
  // not scrolling at all. `new` covers the blank form, which has no id.
  const editingKey = editing ? (editing.id || 'new') : null
  useEffect(() => {
    if (!editingKey) return undefined
    const id = requestAnimationFrame(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
    return () => cancelAnimationFrame(id)
  }, [editingKey])

  function patchCriterion(i, next) {
    setEditing((m) => ({ ...m, criteria: m.criteria.map((c, j) => (j === i ? next : c)) }))
  }

  function addCriterion(metric) {
    setEditing((m) => ({
      ...m,
      criteria: [...m.criteria, { metric, threshold: metric === 'views' || metric === 'best_video' ? 10000 : 1, unit: 'days' }],
    }))
  }

  async function save(e) {
    e.preventDefault()
    const m = editing
    if (!m.title.trim()) { notice('Give the milestone a title.'); return }
    if (!m.criteria.length) {
      notice('A stop needs at least one requirement, or nobody can ever reach it, and because the route runs in order, it would hold up every stop behind it too.')
      return
    }
    const bad = m.criteria.find((c) => !(Number(c.threshold) > 0))
    if (bad) { notice(`The ${METRIC_BY_VALUE[bad.metric]?.label} requirement has to be more than zero.`); return }
    const gives = m.gives || []
    const items = (m.items || []).filter((it) => gives.includes(it.kind) && it.label?.trim())
      .map((it) => ({ kind: it.kind, label: it.label.trim() }))
    if (gives.includes('voucher') && !(Number(m.voucher_amount) > 0)) {
      notice('The voucher needs an amount. That is what gets paid out when a creator reaches this stop.')
      return
    }
    if (gives.includes('role') && !m.role_title?.trim()) {
      notice('The new title needs its wording. That is the text worn beside the creator\'s name.')
      return
    }
    const missingItem = gives.find((g) => REWARD_PARTS.find((p) => p.value === g)?.item && !items.some((it) => it.kind === g))
    if (missingItem) {
      notice(`Say what the ${REWARD_PARTS.find((p) => p.value === missingItem).label.toLowerCase()} is, so the team knows what to send.`)
      return
    }

    setSaving(true)
    const patch = {
      title: m.title.trim(),
      description: m.description?.trim() || null,
      role_title: gives.includes('role') ? m.role_title.trim() : null,
      voucher_amount: gives.includes('voucher') ? Number(m.voucher_amount) || null : null,
      voucher_currency: gives.includes('voucher') ? (m.voucher_currency || 'EUR') : 'EUR',
      items,
      // The headline kind older screens read: the only thing it gives, or
      // "other" when it gives several.
      reward_kind: gives.length === 1 ? (gives[0] === 'prize' ? 'other' : gives[0]) : 'other',
      icon: m.icon || 'flag',
      is_active: m.is_active !== false,
    }
    // The line creators read on the route: what the admin wrote, or everything
    // it gives, listed.
    patch.reward = m.reward?.trim() || rewardSummary(patch) || null

    let id = m.id
    let error
    if (id) {
      ({ error } = await supabase.from('milestones').update(patch).eq('id', id))
    } else {
      const ins = await supabase.from('milestones').insert({
        ...patch,
        // New ones go at the end. Reordering is a drag, not a number to type.
        sort_order: ((rows || []).at(-1)?.sort_order ?? 0) + 10,
      }).select('id').single()
      error = ins.error
      id = ins.data?.id
    }

    // REQUIREMENTS ARE REPLACED WHOLESALE, not diffed.
    //
    // A stop has at most seven of them and the form owns the entire set, so
    // "delete what is there, insert what the form says" is one round trip each
    // and cannot leave an orphan behind. Diffing would be three queries to
    // achieve the same thing and one more place for a stale row to survive.
    if (!error && id) {
      await supabase.from('milestone_criteria').delete().eq('milestone_id', id)
      const ins = await supabase.from('milestone_criteria').insert(
        m.criteria.map((c) => ({
          milestone_id: id,
          metric: c.metric,
          threshold: Number(c.threshold),
          unit: c.metric === 'days' ? (c.unit || 'days') : 'days',
        })),
      )
      error = ins.error
    }

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
    else await load()   // the held-up counts move with the order
  }

  if (!rows) {
    return <div className="page space-y-4"><Skeleton className="h-12 w-64" /><Skeleton className="h-64 w-full" /></div>
  }

  // THE PREVIEW SHOWS WHAT YOU ARE TYPING, not what is saved.
  //
  // It used to render `rows` - the last thing loaded from the database - so
  // while the form was open the panel beside it was showing the OLD version of
  // the stop being edited, and a brand-new stop did not appear in it at all.
  // A preview that cannot see the edit is a screenshot. The unsaved milestone
  // is merged in at its own position (or appended, if it is new) so the title,
  // the description, the reward chip and the requirement list all update as
  // they are typed.
  //
  // Two stops are shown as flown, so the preview has a lit leg, a current stop
  // and a road ahead rather than eleven identical grey dots.
  const draftRows = (() => {
    const base = rows.filter((m) => m.is_active)
    if (!editing) return base
    const gives = editing.gives || []
    const shownParts = {
      role_title: gives.includes('role') ? editing.role_title : null,
      voucher_amount: gives.includes('voucher') ? Number(editing.voucher_amount) || null : null,
      voucher_currency: editing.voucher_currency,
      items: (editing.items || []).filter((it) => gives.includes(it.kind)),
    }
    const live = {
      ...editing,
      ...shownParts,
      reward: editing.reward?.trim() || rewardSummary(shownParts),
      reward_kind: gives.length === 1 ? (gives[0] === 'prize' ? 'other' : gives[0]) : 'other',
      criteria: editing.criteria || [],
    }
    if (!editing.id) return [...base, live]
    return base.map((m) => (m.id === editing.id ? { ...m, ...live } : m))
  })()

  const preview = draftRows.map((m, i) => ({
    ...m,
    reached: i < 2,
    blocked: false,
    criteria: (m.criteria || []).map((c) => ({ ...c, value: i < 2 ? c.threshold : 0, done: i < 2 })),
  }))

  const heldUp = rows.reduce((a, m) => a + (stats[m.id]?.blocked || 0), 0)
  const unused = editing
    ? METRICS.filter((x) => !editing.criteria.some((c) => c.metric === x.value))
    : []

  return (
    <div className="page">
      <PageHeader
        back="/admin"
        title="Milestones"
        action={
          <button onClick={() => setEditing({ ...BLANK, criteria: [...BLANK.criteria] })} className="btn-primary !py-2.5">
            <Icon name="plus" className="h-4 w-4" /> New milestone
          </button>
        }
      />

      {/* THE ORDERING PROBLEM, SAID OUT LOUD.
          Gating is the thing that makes the route mean something and it is also
          the thing that will quietly strand everybody if one early stop asks
          for something nobody does. This banner is the only warning that
          exists, so it names the number and where to look. */}
      {heldUp > 0 && (
        <div className="mb-6 flex flex-wrap items-start gap-3 rounded-card border border-amber-200 bg-amber-50 px-5 py-4">
          <Icon name="alert" className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-900">
              {heldUp} earned {heldUp === 1 ? 'stop is' : 'stops are'} being held up by the order
            </p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">
              Creators have already done the work for these and cannot have them until they clear an earlier
              stop. That is the route working as intended, but if the number is large, the stop in front is
              asking for something people are not doing. Drag it later, or soften what it asks for.
            </p>
          </div>
        </div>
      )}

      {editing && (
        <form ref={formRef} onSubmit={save} className="card mb-8 !p-6 scroll-mt-24">
          <h2 className="mb-4 text-lg font-semibold">{editing.id ? 'Edit milestone' : 'New milestone'}</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Title">
              <input className="input" value={editing.title} maxLength={60}
                placeholder="Ten videos published"
                onChange={(e) => setEditing((m) => ({ ...m, title: e.target.value }))} />
            </Field>
            <Field label="Description">
              <input className="input" value={editing.description || ''} maxLength={120}
                placeholder="Consistency is the whole game."
                onChange={(e) => setEditing((m) => ({ ...m, description: e.target.value }))} />
            </Field>
          </div>

          {/* ---------- what it takes ---------- */}
          <div className="mt-6 rounded-card border border-gray-100 bg-cloud/40 p-4">
            <p className="label !mb-1">What you need</p>

            {editing.criteria.length === 0 ? (
              <p className="rounded-xl border border-dashed border-amber-300 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                No requirements yet. A stop with none can never be reached, and it would hold up every stop behind it.
              </p>
            ) : (
              <div className="space-y-2">
                {editing.criteria.map((c, i) => (
                  <CriterionRow
                    key={c.metric}
                    c={c}
                    onChange={(next) => patchCriterion(i, next)}
                    onRemove={() => setEditing((m) => ({ ...m, criteria: m.criteria.filter((_, j) => j !== i) }))}
                  />
                ))}
              </div>
            )}

            {unused.length > 0 && (
              <div className="mt-3">
                <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-smoke">Add a requirement</p>
                <div className="flex flex-wrap gap-1.5">
                  {unused.map((x) => (
                    <button
                      key={x.value}
                      type="button"
                      title={x.hint}
                      onClick={() => addCriterion(x.value)}
                      className="flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-smoke transition-all duration-200 hover:scale-105 hover:border-brand/40 hover:text-brand"
                    >
                      <Icon name={x.icon} className="h-3.5 w-3.5" /> {x.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ---------- what they get ---------- */}
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {/* WHAT THEY GET, AS SEVERAL THINGS (26 Sep 2026). Ethan: "give a
                new title as a reward and also a watch as a reward ... Also,
                add merch." Pick any mix; each one opens the field it needs. The
                title and the voucher are paid by the platform by itself; merch,
                prizes and anything else go on the team's "to send" list below
                the route when somebody reaches the stop. */}
            <div className="sm:col-span-2">
              <Field label="What they get" hint="Pick as many as you like.">
                <div className="flex flex-wrap gap-1.5">
                  {REWARD_PARTS.map((p) => {
                    const on = (editing.gives || []).includes(p.value)
                    return (
                      <button
                        key={p.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setEditing((m) => {
                          const gives = on ? (m.gives || []).filter((g) => g !== p.value) : [...(m.gives || []), p.value]
                          const items = p.item && !on && !(m.items || []).some((it) => it.kind === p.value)
                            ? [...(m.items || []), { kind: p.value, label: '' }]
                            : (m.items || [])
                          return { ...m, gives, items }
                        })}
                        className={cx(
                          'inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5',
                          on ? 'border-brand bg-brand text-white shadow-card' : 'border-gray-200 text-smoke hover:border-brand/40 hover:text-ink',
                        )}
                      >
                        <Icon name={on ? 'check' : p.icon} className="h-3.5 w-3.5" />
                        {p.label}
                      </button>
                    )
                  })}
                </div>
              </Field>

              {(editing.gives || []).length > 0 && (
                <div className="mt-3 space-y-3 rounded-2xl border border-gray-100 bg-cloud/40 p-3.5">
                  {(editing.gives || []).includes('role') && (
                    <Field label="New title" hint="Worn beside their name on their profile and in chat.">
                      <input className="input" value={editing.role_title || ''} maxLength={40}
                        placeholder="Tryp.com Senior Creator"
                        onChange={(e) => setEditing((m) => ({ ...m, role_title: e.target.value }))} />
                    </Field>
                  )}
                  {(editing.gives || []).includes('voucher') && (
                    <Field label="Voucher amount" hint="Lands in their rewards and the payouts list when they reach it.">
                      <div className="flex gap-2">
                        <div className="flex shrink-0 gap-1">
                          {CURRENCIES.map((cur) => (
                            <button
                              key={cur.value}
                              type="button"
                              aria-pressed={(editing.voucher_currency || 'EUR') === cur.value}
                              onClick={() => setEditing((m) => ({ ...m, voucher_currency: cur.value }))}
                              className={cx(
                                'rounded-lg border px-3 py-2 text-sm font-semibold transition-colors',
                                (editing.voucher_currency || 'EUR') === cur.value
                                  ? 'border-brand bg-brand text-white'
                                  : 'border-gray-200 bg-white text-smoke hover:border-brand/40',
                              )}
                            >
                              {cur.value === 'GBP' ? '£' : '€'}
                            </button>
                          ))}
                        </div>
                        <input
                          className="input"
                          type="number"
                          min="1"
                          step="any"
                          placeholder="25"
                          value={editing.voucher_amount ?? ''}
                          onChange={(e) => setEditing((m) => ({ ...m, voucher_amount: e.target.value }))}
                        />
                      </div>
                    </Field>
                  )}
                  {REWARD_PARTS.filter((p) => p.item && (editing.gives || []).includes(p.value)).map((p) => (
                    <Field key={p.value} label={p.label} hint="What the team sends. Add more than one if they get several.">
                      <div className="space-y-2">
                        {(editing.items || []).map((it, i) => (it.kind !== p.value ? null : (
                          <div key={i} className="flex gap-2">
                            <input
                              className="input"
                              value={it.label}
                              maxLength={60}
                              placeholder={p.placeholder}
                              onChange={(e) => setEditing((m) => ({ ...m, items: m.items.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) }))}
                            />
                            <button
                              type="button"
                              aria-label="Remove"
                              onClick={() => setEditing((m) => ({ ...m, items: m.items.filter((_, j) => j !== i) }))}
                              className="shrink-0 rounded-lg px-2.5 text-smoke transition-colors hover:bg-red-50 hover:text-red-600"
                            >
                              <Icon name="close" className="h-4 w-4" />
                            </button>
                          </div>
                        )))}
                        <button
                          type="button"
                          onClick={() => setEditing((m) => ({ ...m, items: [...(m.items || []), { kind: p.value, label: '' }] }))}
                          className="inline-flex items-center gap-1 text-xs font-semibold text-brand hover:underline"
                        >
                          <Icon name="plus" className="h-3.5 w-3.5" /> Add another
                        </button>
                      </div>
                    </Field>
                  ))}
                </div>
              )}
            </div>

            <Field label="How it reads on the route" hint={rewardSummary({ ...editing, voucher_amount: (editing.gives || []).includes('voucher') ? editing.voucher_amount : null, role_title: (editing.gives || []).includes('role') ? editing.role_title : null, items: (editing.items || []).filter((it) => (editing.gives || []).includes(it.kind)) }) ? 'Leave blank to list everything it gives.' : 'Optional.'}>
              <input className="input" value={editing.reward || ''} maxLength={120}
                placeholder={rewardSummary({ ...editing, voucher_amount: (editing.gives || []).includes('voucher') ? editing.voucher_amount : null, role_title: (editing.gives || []).includes('role') ? editing.role_title : null, items: (editing.items || []).filter((it) => (editing.gives || []).includes(it.kind)) }) || 'You are officially a Tryp.com Creator'}
                onChange={(e) => setEditing((m) => ({ ...m, reward: e.target.value }))} />
            </Field>

            <Field label="Icon" hint="Shown on this page, so a long ladder is scannable.">
              <div className="flex flex-wrap gap-1.5">
                {ICONS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-label={name}
                    aria-pressed={editing.icon === name}
                    onClick={() => setEditing((m) => ({ ...m, icon: name }))}
                    className={cx(
                      'flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-200 hover:scale-105',
                      editing.icon === name
                        ? 'border-brand bg-brand text-white'
                        : 'border-gray-200 text-smoke hover:border-brand/40',
                    )}
                  >
                    <Icon name={name} className="h-4 w-4" />
                  </button>
                ))}
              </div>
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

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-start">
        <section>
          <h2 className="mb-1 text-lg font-semibold">The ladder</h2>
          {rows.length === 0 ? (
            <EmptyState icon={<Icon name="flag" className="h-7 w-7" />} title="No milestones yet"
              action={<button onClick={() => setEditing({ ...BLANK, criteria: [...BLANK.criteria] })} className="btn-primary">Add the first one</button>} />
          ) : (
            <Reorderable
              items={rows}
              onReorder={reorder}
              handleLabel="Reorder this milestone"
              className="space-y-2"
              renderItem={(m, { handleProps, dragging }) => {
                const s = stats[m.id] || {}
                return (
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
                        {m.role_title && <Badge tone="light">{m.role_title}</Badge>}
                        {Number(m.voucher_amount) > 0 && (
                          <Badge tone="green">
                            {m.voucher_currency === 'GBP' ? '£' : '€'}{Number(m.voucher_amount)}
                          </Badge>
                        )}
                        {(Array.isArray(m.items) ? m.items : []).map((it, i) => (
                          <Badge key={i} tone="grey">{it.label}</Badge>
                        ))}
                      </p>
                      {/* EVERY REQUIREMENT, not the first one. A stop asking for
                          three things and showing one is the version of this row
                          that makes the ladder look wrong. */}
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-smoke">
                        {(m.criteria || []).length === 0 ? (
                          <span className="font-medium text-amber-700">No requirements, unreachable</span>
                        ) : (
                          (m.criteria || []).map((c, i) => (
                            <span key={c.metric} className="flex items-center gap-1.5">
                              {i > 0 && <span className="text-gray-300">+</span>}
                              {criterionNeed(c)}
                            </span>
                          ))
                        )}
                        {m.reward ? <span className="text-gray-300">·</span> : null}
                        {m.reward}
                      </p>
                      {(s.reached > 0 || s.blocked > 0 || s.working > 0) && (
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                          {s.reached > 0 && <span className="text-green-700">{s.reached} reached</span>}
                          {s.working > 0 && <span className="text-brand">{s.working} working on it</span>}
                          {s.blocked > 0 && (
                            <span className="font-semibold text-amber-700">
                              {s.blocked} earned but held up
                            </span>
                          )}
                        </p>
                      )}
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
                      <button onClick={() => setEditing({
                        ...m,
                        // A reward line that is just the generated list is not the
                        // admin's own wording; clear it so it regenerates on save.
                        reward: m.reward && m.reward === rewardSummary(m) ? '' : (m.reward || ''),
                        role_title: m.role_title || '',
                        voucher_amount: m.voucher_amount ?? '',
                        voucher_currency: m.voucher_currency || 'EUR',
                        items: Array.isArray(m.items) ? m.items.map((it) => ({ ...it })) : [],
                        gives: [
                          ...(m.role_title ? ['role'] : []),
                          ...(Number(m.voucher_amount) > 0 ? ['voucher'] : []),
                          ...[...new Set((Array.isArray(m.items) ? m.items : []).map((it) => it.kind))],
                        ],
                        criteria: (m.criteria || []).map((c) => ({ ...c })),
                      })} title="Edit"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-smoke transition-colors hover:bg-brand-tint hover:text-brand">
                        <Icon name="pencil" className="h-4 w-4" />
                      </button>
                      <button onClick={() => remove(m)} title="Delete"
                        className="flex h-8 w-8 items-center justify-center rounded-lg text-smoke transition-colors hover:bg-red-50 hover:text-red-600">
                        <Icon name="trash" className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                )
              }}
            />
          )}
        </section>

        <aside className="lg:sticky lg:top-24">
          <h2 className="mb-1 text-lg font-semibold">How it looks</h2>
          <p className="mb-4 text-sm text-smoke">Exactly what a creator sees, two stops in.</p>
          {/* The preview lays itself out from ITS OWN width, so the rail gets
              the narrow lane rather than the wide serpentine squeezed into a
              third of the room it needs. */}
          <div className="max-h-[70vh] overflow-y-auto overscroll-contain rounded-card border border-gray-100 bg-white px-2 py-5">
            <MilestonePath milestones={preview} standings={[]} />
          </div>
        </aside>
      </div>
      <ItemsToSend />
    </div>
  )
}


// WHAT THE TEAM OWES, AND TICKING IT OFF (26 Sep 2026, migration 267).
//
// A title and a voucher pay themselves. A hoodie or a watch does not - somebody
// has to post it - so everybody who has reached a stop that gives an item is
// listed here until an admin marks it sent. Sent rows stay, greyed, as the
// record of what went out.
function ItemsToSend() {
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(null)
  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('milestone_items_to_send')
    if (error) { setRows([]); return }
    setRows(data || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function mark(r, sent) {
    setBusy(`${r.profile_id}:${r.milestone_id}`)
    const { data: { user } = {} } = await supabase.auth.getUser()
    const { error } = await supabase.from('creator_milestones')
      .update({ items_sent_at: sent ? new Date().toISOString() : null, items_sent_by: sent ? user?.id ?? null : null })
      .eq('profile_id', r.profile_id).eq('milestone_id', r.milestone_id)
    setBusy(null)
    if (error) { notice(error.message); return }
    toast(sent ? 'Marked as sent.' : 'Moved back to the list.')
    load()
  }

  if (!rows || rows.length === 0) return null
  const waiting = rows.filter((r) => !r.sent_at).length
  return (
    <section className="mt-10">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">Rewards to send</h2>
        <p className="text-xs text-smoke">{waiting === 0 ? 'Everything has been sent.' : `${waiting} waiting`}</p>
      </div>
      <div className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
        <ul className="divide-y divide-gray-50">
          {rows.map((r) => {
            const key = `${r.profile_id}:${r.milestone_id}`
            return (
              <li key={key} className={cx('flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5', r.sent_at && 'opacity-60')}>
                <Avatar src={r.photo_url} name={r.name} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{r.name}<span className="font-normal text-smoke"> · {r.milestone_title}</span></p>
                  <p className="mt-0.5 flex flex-wrap gap-1.5">
                    {(Array.isArray(r.items) ? r.items : []).map((it, i) => (
                      <span key={i} className="rounded-full bg-cloud px-2 py-0.5 text-[11px] font-medium text-ink">{it.label}</span>
                    ))}
                    {r.country && <span className="text-[11px] text-smoke">{r.country}</span>}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy === key}
                  onClick={() => mark(r, !r.sent_at)}
                  className={cx(
                    'inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-transform duration-200 hover:-translate-y-0.5',
                    r.sent_at ? 'bg-green-600 text-white' : 'border border-gray-200 text-ink',
                  )}
                >
                  <Icon name="check" className="h-3.5 w-3.5" />
                  {r.sent_at ? 'Sent' : 'Mark as sent'}
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
