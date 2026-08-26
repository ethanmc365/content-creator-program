import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { confirm, notice } from '../../lib/confirm'
import { toast } from '../../lib/toast'
import Icon from '../../components/Icon'
import Reorderable from '../../components/network/Reorderable'
import MilestonePath from '../../components/network/MilestonePath'
import { Badge, EmptyState, PageHeader, Skeleton } from '../../components/ui'
import { cx } from '../../lib/utils'
import {
  METRICS, METRIC_BY_VALUE, REWARD_KINDS, UNITS,
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
      notice('A stop needs at least one requirement, or nobody can ever reach it — and because the route runs in order, it would hold up every stop behind it too.')
      return
    }
    const bad = m.criteria.find((c) => !(Number(c.threshold) > 0))
    if (bad) { notice(`The ${METRIC_BY_VALUE[bad.metric]?.label} requirement has to be more than zero.`); return }
    if (m.reward_kind === 'voucher' && !(Number(m.voucher_amount) > 0)) {
      notice('A voucher milestone needs an amount — that is what gets paid out when a creator reaches it.')
      return
    }
    if (m.reward_kind === 'role' && !m.role_title?.trim()) {
      notice('A role milestone needs the title it grants — that is the text worn beside the creator\'s name.')
      return
    }

    setSaving(true)
    const patch = {
      title: m.title.trim(),
      description: m.description?.trim() || null,
      reward: m.reward?.trim() || null,
      reward_kind: m.reward_kind,
      role_title: m.reward_kind === 'role' ? m.role_title.trim() : null,
      voucher_amount: m.reward_kind === 'voucher' ? Number(m.voucher_amount) || null : null,
      voucher_currency: m.reward_kind === 'voucher' ? (m.voucher_currency || 'EUR') : null,
      icon: m.icon || 'flag',
      is_active: m.is_active !== false,
    }

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
    const live = {
      ...editing,
      voucher_amount: Number(editing.voucher_amount) || null,
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
              stop. That is the route working as intended — but if the number is large, the stop in front is
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
            <Field label="Reward">
              <input className="input" value={editing.reward || ''} maxLength={80}
                placeholder="Tryp.com t-shirt"
                onChange={(e) => setEditing((m) => ({ ...m, reward: e.target.value }))} />
            </Field>

            {/* A ROW OF CHOICES, NOT A ROLLER.
                A native <select> renders as the OS picker - a grey iOS roller on
                a phone, a system dropdown on a Mac - which is why one field
                looked like it belonged to a different application than
                everything around it. Four kinds that never change: showing all
                four is cheaper than hiding them behind a control that has to be
                opened. ("Access" and "Status" are gone: access promised early
                briefs that nothing in the product delivers, and status was the
                word "role" said twice.) */}
            <Field label="Reward type" hint={REWARD_KINDS.find((x) => x.value === editing.reward_kind)?.hint}>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Reward type">
                {REWARD_KINDS.map((x) => (
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

            {/* THE TITLE ITSELF, only when the reward is one.
                It is written to a column of its own rather than to `role_title`,
                which is the team's job titles and is guarded so only an admin can
                set it. An earned role can only ever replace the generic "Creator"
                badge - it never overwrites somebody's actual job. */}
            {/* THE AMOUNT, because a voucher milestone now PAYS.
                Reaching it mints a row in `rewards` - the same ledger challenge
                prizes use - so it turns up in the creator's own rewards page,
                in the admin payouts list and in every CPM calculation. Before
                this the reward was a sentence on a drawing and nothing else
                happened. */}
            {editing.reward_kind === 'voucher' && (
              <Field label="Voucher amount">
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
                            : 'border-gray-200 text-smoke hover:border-brand/40',
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

            {editing.reward_kind === 'role' && (
              <Field label="Role title" hint="Worn beside their name on their profile and in chat.">
                <input className="input" value={editing.role_title || ''} maxLength={40}
                  placeholder="Tryp.com Senior Creator"
                  onChange={(e) => setEditing((m) => ({ ...m, role_title: e.target.value }))} />
              </Field>
            )}

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
                        {m.reward_kind === 'role' && m.role_title && <Badge tone="light">{m.role_title}</Badge>}
                        {m.reward_kind === 'voucher' && Number(m.voucher_amount) > 0 && (
                          <Badge tone="green">
                            {m.voucher_currency === 'GBP' ? '£' : '€'}{Number(m.voucher_amount)}
                          </Badge>
                        )}
                        {m.reward_kind === 'voucher' && !(Number(m.voucher_amount) > 0) && (
                          <Badge tone="amber">No amount set</Badge>
                        )}
                      </p>
                      {/* EVERY REQUIREMENT, not the first one. A stop asking for
                          three things and showing one is the version of this row
                          that makes the ladder look wrong. */}
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-smoke">
                        {(m.criteria || []).length === 0 ? (
                          <span className="font-medium text-amber-700">No requirements — unreachable</span>
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
                        role_title: m.role_title || '',
                        voucher_amount: m.voucher_amount ?? '',
                        voucher_currency: m.voucher_currency || 'EUR',
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
    </div>
  )
}
