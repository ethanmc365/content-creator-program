import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Modal, Spinner } from '../ui'
import Icon from '../Icon'
import { confirm, notice } from '../../lib/confirm'
import { toast } from '../../lib/toast'
import { parseDateTime, isoToDateInput, isoToTimeInput, cx } from '../../lib/utils'
import { viewerZone } from '../../lib/eventTime'

// YOUR OWN DATES, ON THE SAME CALENDAR.
//
// Ethan: "I want the ability for everyone to be able to create personal events,
// for example: Content days you set for yourself. A private personal event
// type: 'edit the video from Paris'."
//
// It is a row in `events` with `owner_id` set, and a RESTRICTIVE RLS policy
// makes it invisible to everybody else including admins - see migration 107.
// Reusing the events table rather than inventing a second one is what gets it
// into the ICS feed, the reminder bell and the month grid for free.
//
// FOUR FIELDS AND NO MORE. A personal note is not an event with a programme
// around it: no RSVP, no meeting link, no market, no type picker. What is left
// is what a content day actually needs - what, when, how long, and a line to
// remind yourself why.

const DURATIONS = [
  { minutes: 0, label: 'No end time' },
  { minutes: 60, label: '1 hour' },
  { minutes: 120, label: '2 hours' },
  { minutes: 240, label: 'Half a day' },
  { minutes: 480, label: 'All day' },
]

const empty = { title: '', description: '', dateStr: '', timeStr: '', duration: 60 }

export default function PersonalEventModal({ open, onClose, editing, onSaved }) {
  const { user } = useAuth()
  const [form, setForm] = useState(empty)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    if (editing) {
      const mins = editing.endsAt
        ? Math.round((new Date(editing.endsAt) - new Date(editing.date)) / 60000)
        : 0
      setForm({
        title: editing.title || '',
        description: editing.description || '',
        dateStr: isoToDateInput(editing.date),
        timeStr: isoToTimeInput(editing.date),
        duration: DURATIONS.some((d) => d.minutes === mins) ? mins : 60,
      })
    } else {
      setForm(empty)
    }
  }, [open, editing])

  async function save(e) {
    e.preventDefault()
    const iso = parseDateTime(form.dateStr, form.timeStr)
    if (!iso) { notice('Enter the date as DD/MM/YYYY and the time as HH:MM.'); return }
    if (!form.title.trim()) { notice('Give it a name so you know what it is.'); return }
    setBusy(true)
    const payload = {
      title: form.title.trim(),
      description: form.description.trim(),
      date: iso,
      ends_at: form.duration ? new Date(new Date(iso).getTime() + form.duration * 60_000).toISOString() : null,
      type: 'personal',
      // The zone it was SET IN, so the card can be honest about it later if the
      // creator travels. See lib/eventTime.
      timezone: viewerZone(),
      owner_id: user.id,
      // Explicitly empty: a personal event has no market, and the trigger in 107
      // mirrors this down to the legacy singular column.
      community_ids: [],
      rsvp_enabled: false,
    }
    const { error } = editing
      ? await supabase.from('events').update(payload).eq('id', editing.id)
      : await supabase.from('events').insert({ ...payload, created_by: user.id })
    setBusy(false)
    if (error) { notice(`Could not save that: ${error.message}`); return }
    toast(editing ? 'Updated' : 'Added to your calendar')
    onClose()
    onSaved?.()
  }

  async function remove() {
    if (!editing) return
    if (!await confirm(`Delete "${editing.title}"?`)) return
    setBusy(true)
    const { error } = await supabase.from('events').delete().eq('id', editing.id)
    setBusy(false)
    if (error) { notice(`Could not delete that: ${error.message}`); return }
    toast('Deleted')
    onClose()
    onSaved?.()
  }

  return (
    <Modal open={open} onClose={onClose} title={editing ? 'Edit your event' : 'Add a personal event'}>
      <form onSubmit={save} className="space-y-5">
        <p className="flex items-start gap-2.5 rounded-xl bg-brand-tint/60 p-3 text-xs text-ink">
          <Icon name="eye" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <span>
            Only you can see this. It rides along in your calendar subscription, so it lands in
            Apple or Google Calendar with everything else.
          </span>
        </p>

        <div>
          <label htmlFor="pe-title" className="label">What is it</label>
          <input
            id="pe-title" className="input" required value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="Edit the video from Paris"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="pe-date" className="label">Date</label>
            <input
              id="pe-date" className="input" required inputMode="numeric" value={form.dateStr}
              onChange={(e) => setForm({ ...form, dateStr: e.target.value })} placeholder="DD/MM/YYYY"
            />
          </div>
          <div>
            <label htmlFor="pe-time" className="label">Start</label>
            <input
              id="pe-time" className="input" required inputMode="numeric" value={form.timeStr}
              onChange={(e) => setForm({ ...form, timeStr: e.target.value })} placeholder="HH:MM"
            />
          </div>
        </div>

        <div>
          <span className="label">How long</span>
          <div className="flex flex-wrap gap-2">
            {DURATIONS.map((d) => (
              <button
                key={d.minutes} type="button"
                onClick={() => setForm({ ...form, duration: d.minutes })}
                className={cx(
                  'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95',
                  form.duration === d.minutes
                    ? 'border-brand bg-brand text-white shadow-card'
                    : 'border-gray-200 bg-white text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand',
                )}
              >
                {d.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label htmlFor="pe-desc" className="label">
            Note <span className="font-normal text-smoke">(optional)</span>
          </label>
          <textarea
            id="pe-desc" rows={2} className="input" value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            placeholder="B-roll first, then the voiceover"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          {editing ? (
            <button type="button" onClick={remove} disabled={busy} className="btn-ghost text-sm text-red-500 hover:text-red-600">
              Delete
            </button>
          ) : <span />}
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? <Spinner /> : editing ? 'Save changes' : 'Add to my calendar'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
