import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Modal, Select } from '../ui'
import Icon from '../Icon'
import { STANDARD_METRICS, quarterLabel } from '../../lib/kpiTracker'
import { useT } from '../../lib/i18n'

// SETTING OR EDITING ONE KPI TARGET.
//
// ONE DECISION DRIVES THE WHOLE FORM: which metric. Pick one of the four
// standard ones and the number behind it is always read live off the
// platform - there is nothing to type but the target, and no "current
// value" field to show, because showing one would imply it could disagree
// with `kpi_actuals` and it never may. Pick "Custom" and the shape flips: a
// label the platform cannot supply on its own, and a current value that is
// the only record of progress there is, because nothing automated is
// watching it.
const METRIC_OPTIONS = [
  ...STANDARD_METRICS.map((m) => ({ value: m.key, label: m.label })),
  { value: 'custom', label: 'Custom KPI' },
]

export default function KpiTargetSheet({ row, communityName, year, quarter, profileId, onClose, onSaved }) {
  const tr = useT()
  const isNew = !row?.id
  const [metric, setMetric] = useState(row?.metric || 'challenges_run')
  const [label, setLabel] = useState(row?.metric === 'custom' ? (row?.label || '') : '')
  const [target, setTarget] = useState(row?.target_value != null ? String(row.target_value) : '')
  const [current, setCurrent] = useState(row?.current_value != null ? String(row.current_value) : '0')
  const [notes, setNotes] = useState(row?.notes || '')
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  const isCustom = metric === 'custom'
  const standardLabel = STANDARD_METRICS.find((m) => m.key === metric)?.label

  async function save() {
    const targetNum = Number(target)
    if (!target || !Number.isFinite(targetNum) || targetNum < 0) {
      setErr(tr('The target needs to be a number, zero or more.'))
      return
    }
    if (isCustom && !label.trim()) {
      setErr(tr('A custom KPI needs a name.'))
      return
    }
    setSaving(true)
    setErr('')

    const payload = {
      community_id: row.community_id,
      year,
      quarter,
      metric,
      label: isCustom ? label.trim() : standardLabel,
      target_value: targetNum,
      is_automated: !isCustom,
      current_value: isCustom ? (Number(current) || 0) : null,
      notes: notes.trim() || null,
    }

    const { error } = isNew
      ? await supabase.from('kpi_targets').insert({ ...payload, created_by: profileId })
      : await supabase.from('kpi_targets').update(payload).eq('id', row.id)

    setSaving(false)
    if (error) {
      // A metric already set for this scope and quarter hits the unique
      // index rather than a friendlier check, so it is translated here.
      setErr(error.code === '23505' ? tr('That KPI already has a target for this quarter - edit it instead of adding another.') : error.message)
      return
    }
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={isNew ? tr('Set a KPI target') : tr('Edit this target')}>
      {/* SCOPE AND QUARTER, AS A CHIP RATHER THAN A LINE OF GREY TEXT (23 Sep
          2026). Ethan: "it should show clearly when the quarter is." A plain
          sentence under the title was easy to skim past on a form whose
          whole point is "which quarter am I setting this for" - the chip is
          the first thing in the dialog and cannot be mistaken for a caption. */}
      <div className="mb-5 inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1.5 text-sm font-bold text-brand">
        <Icon name="calendar" className="h-4 w-4" />
        {communityName} · {quarterLabel(year, quarter)}
      </div>

      <div className="space-y-4">
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">{tr('Metric')}</label>
          {/* NOT `inFlow` (23 Sep 2026). Ethan: "the card expands really
              whenever I click on metrics to view the options - it should
              stay the same size." `inFlow` was chosen to stop a floating
              menu being clipped by the modal's own scroll box, but the fix
              for a five-item list this near the top of a short dialog is
              worse than the problem: the whole dialog visibly grows and
              shrinks every time it opens or closes. A floating menu has
              plenty of room here and never resizes anything around it. */}
          <Select
            value={metric}
            onChange={setMetric}
            options={METRIC_OPTIONS}
            variant="field"
            className="w-full"
            disabled={!isNew}
          />
          {!isNew && (
            <p className="mt-1.5 text-xs text-gray-400">
              {tr('The metric cannot change once a target exists - delete this one and set a new target instead.')}
            </p>
          )}
        </div>

        {isCustom && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">{tr('What are you tracking?')}</label>
            <input
              type="text"
              className="input"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={tr('e.g. Average engagement rate')}
              maxLength={80}
            />
          </div>
        )}

        {/* JUST THE NUMBER (23 Sep 2026). Ethan: "whenever it says 'target
            for the quarter,' I don't want those - obviously just want to
            type the number." The label is now the one word this field
            actually needs; the placeholder and the automated/manual note
            below carry the rest. */}
        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">{tr('Target')}</label>
          <input
            type="number"
            inputMode="decimal"
            min="0"
            className="input"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="0"
            autoFocus={isNew}
          />
        </div>

        {isCustom && (
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">{tr('Current progress')}</label>
            <input
              type="number"
              inputMode="decimal"
              className="input"
              value={current}
              onChange={(e) => setCurrent(e.target.value)}
              placeholder="0"
            />
            <p className="mt-1.5 text-xs text-gray-400">
              {tr('Nothing on the platform can count this automatically - update it as it moves.')}
            </p>
          </div>
        )}

        <div>
          <label className="mb-1.5 block text-sm font-medium text-ink">{tr('Notes (optional)')}</label>
          <textarea
            className="input min-h-[4.5rem] resize-none"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder={tr('Anything worth remembering about this target')}
            maxLength={400}
          />
        </div>

        {err && <p className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm text-red-600">{err}</p>}

        <div className="flex gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">
            {tr('Cancel')}
          </button>
          <button type="button" onClick={save} disabled={saving} className="btn-primary flex-1 justify-center disabled:opacity-60">
            {saving ? tr('Saving…') : tr('Save')}
          </button>
        </div>
      </div>
    </Modal>
  )
}
