import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { confirm, notice } from '../lib/confirm'
import { Avatar, Badge, Modal, Spinner } from './ui'
import Icon from './Icon'
import { cx, formatDate } from '../lib/utils'

// Availability polls ("find a time"): an admin proposes time slots, creators
// tick yes/no per slot, and the admin picks the slot most people can make -
// no external scheduling tool needed.
//
// Composer: pick a date, a first slot (start + end), then "repeat until" fills
// the rest of the day in equal slots (9:00-9:30, 9:30-10:00, ... until 16:00).
// Any slot can be removed with x before posting. Voting is one row per
// (slot, creator) with available true/false; admins see who said what.

const timeLabel = (iso) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function SlotVoteRow({ slot, myVote, counts, voters, isAdmin, onVote }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="rounded-xl border border-gray-100 px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-medium text-ink">
          {timeLabel(slot.starts_at)} – {timeLabel(slot.ends_at)}
        </p>
        <span className="text-xs tabular-nums text-smoke">
          <span className="font-semibold text-green-600">{counts.yes}</span> yes · <span className="font-semibold text-red-500">{counts.no}</span> no
        </span>
        <div className="flex gap-1.5">
          <button
            type="button"
            onClick={() => onVote(slot, true)}
            className={cx('rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
              myVote === true ? 'bg-green-600 text-white' : 'border border-gray-200 text-smoke hover:border-green-600 hover:text-green-600')}
          >
            Can make it
          </button>
          <button
            type="button"
            onClick={() => onVote(slot, false)}
            className={cx('rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors',
              myVote === false ? 'bg-red-500 text-white' : 'border border-gray-200 text-smoke hover:border-red-500 hover:text-red-500')}
          >
            Can't
          </button>
        </div>
        {isAdmin && (counts.yes > 0 || counts.no > 0) && (
          <button type="button" onClick={() => setOpen((v) => !v)} className="text-xs font-medium text-brand hover:underline">
            {open ? 'Hide' : 'Who?'}
          </button>
        )}
      </div>
      {isAdmin && open && (
        <div className="mt-2 space-y-1 border-t border-gray-50 pt-2">
          {voters.map((v) => (
            <div key={v.creator_id} className="flex items-center gap-2 text-xs text-smoke">
              <Avatar src={v.profiles?.photo_url} name={v.profiles?.name} size="xs" />
              <span className="font-medium text-ink">{v.profiles?.name}</span>
              <span className={v.available ? 'text-green-600' : 'text-red-500'}>{v.available ? 'yes' : 'no'}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function EventPolls() {
  const { user, isAdmin } = useAuth()
  const [polls, setPolls] = useState(null)
  const [showComposer, setShowComposer] = useState(false)

  const load = useCallback(async () => {
    // Polls + slots first, then all votes for those slots (with names for admins).
    const { data: pollRows } = await supabase.from('event_polls')
      .select('*, event_poll_slots(*)')
      .order('created_at', { ascending: false })
      .limit(6)
    const open = (pollRows ?? []).filter((p) => isAdmin || !p.closed)
    const slotIds = open.flatMap((p) => p.event_poll_slots.map((s) => s.id))
    let votes = []
    if (slotIds.length) {
      const { data: v } = await supabase.from('event_poll_votes')
        .select('*, profiles:creator_id(id, name, photo_url)')
        .in('slot_id', slotIds)
      votes = v ?? []
    }
    setPolls(open.map((p) => ({
      ...p,
      slots: [...p.event_poll_slots].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)),
      votes,
    })))
  }, [isAdmin])

  useEffect(() => { load() }, [load])

  async function vote(slot, available) {
    const { error } = await supabase.from('event_poll_votes')
      .upsert({ slot_id: slot.id, creator_id: user.id, available }, { onConflict: 'slot_id,creator_id' })
    if (error) { notice(`Could not save your vote: ${error.message}`); return }
    load()
  }

  async function closePoll(poll) {
    if (!await confirm(poll.closed ? `Reopen "${poll.title}"?` : `Close voting on "${poll.title}"?`)) return
    await supabase.from('event_polls').update({ closed: !poll.closed }).eq('id', poll.id)
    load()
  }
  async function removePoll(poll) {
    if (!await confirm(`Delete the "${poll.title}" availability poll and all its votes?`)) return
    await supabase.from('event_polls').delete().eq('id', poll.id)
    load()
  }

  if (!polls) return null
  if (polls.length === 0 && !isAdmin) return null

  return (
    <section className="mb-10">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold"><Icon name="clock" className="h-5 w-5 text-brand" /> Find a time</h2>
        {isAdmin && (
          <button onClick={() => setShowComposer(true)} className="btn-secondary !py-2 text-xs">+ Plan a meet</button>
        )}
      </div>

      {polls.length === 0 ? (
        <p className="rounded-card border border-dashed border-gray-200 px-5 py-6 text-center text-sm text-smoke">
          No availability polls right now. Plan a meet and let creators vote on the times.
        </p>
      ) : (
        <div className="space-y-5">
          {polls.map((poll) => {
            const votesFor = (slotId) => poll.votes.filter((v) => v.slot_id === slotId)
            return (
              <div key={poll.id} className="card !p-5 sm:!p-6">
                <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 text-base font-semibold">
                    {poll.title}
                    {poll.closed && <Badge tone="grey">closed</Badge>}
                  </h3>
                  {isAdmin && (
                    <span className="flex gap-2">
                      <button onClick={() => closePoll(poll)} className="text-xs font-medium text-smoke hover:text-brand">{poll.closed ? 'Reopen' : 'Close voting'}</button>
                      <button onClick={() => removePoll(poll)} className="text-xs font-medium text-red-500 hover:underline">Delete</button>
                    </span>
                  )}
                </div>
                {poll.note && <p className="mb-3 text-sm text-smoke">{poll.note}</p>}
                {!poll.closed && <p className="mb-3 text-xs text-smoke">Tick every time you could make. You can change your answers any time.</p>}
                <div className="space-y-2">
                  {poll.slots.map((slot, i) => {
                    const vs = votesFor(slot.id)
                    const mine = vs.find((v) => v.creator_id === user.id)
                    // Date headers only where the day changes.
                    const prev = poll.slots[i - 1]
                    const newDay = !prev || formatDate(prev.starts_at) !== formatDate(slot.starts_at)
                    return (
                      <div key={slot.id}>
                        {newDay && (
                          <p className="mb-1 mt-3 text-[11px] font-semibold uppercase tracking-wide text-smoke first:mt-0">
                            {formatDate(slot.starts_at)}
                          </p>
                        )}
                        <SlotVoteRow
                          slot={slot}
                          myVote={poll.closed ? null : mine?.available ?? null}
                          counts={{ yes: vs.filter((v) => v.available).length, no: vs.filter((v) => !v.available).length }}
                          voters={vs}
                          isAdmin={isAdmin}
                          onVote={poll.closed ? () => {} : vote}
                        />
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {isAdmin && <PollComposer open={showComposer} onClose={() => setShowComposer(false)} onCreated={() => { setShowComposer(false); load() }} />}
    </section>
  )
}

// ---------------------------------------------------------------- composer
function PollComposer({ open, onClose, onCreated }) {
  const { user } = useAuth()
  const [title, setTitle] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState('')
  const [startTime, setStartTime] = useState('09:00')
  const [endTime, setEndTime] = useState('09:30')
  const [repeatUntil, setRepeatUntil] = useState('')
  const [slots, setSlots] = useState([]) // {starts_at, ends_at} ISO strings
  const [saving, setSaving] = useState(false)

  const slotMinutes = useMemo(() => {
    const [sh, sm] = startTime.split(':').map(Number)
    const [eh, em] = endTime.split(':').map(Number)
    return (eh * 60 + em) - (sh * 60 + sm)
  }, [startTime, endTime])

  function generate() {
    if (!date || slotMinutes <= 0) { notice('Pick a date and make the end time later than the start.'); return }
    const mk = (mins) => {
      const d = new Date(`${date}T00:00`)
      d.setMinutes(mins)
      return d.toISOString()
    }
    const [sh, sm] = startTime.split(':').map(Number)
    let cursor = sh * 60 + sm
    const limit = repeatUntil
      ? (() => { const [h, m] = repeatUntil.split(':').map(Number); return h * 60 + m })()
      : cursor + slotMinutes
    const fresh = []
    while (cursor + slotMinutes <= limit && fresh.length < 40) {
      fresh.push({ starts_at: mk(cursor), ends_at: mk(cursor + slotMinutes) })
      cursor += slotMinutes
    }
    if (fresh.length === 0) { notice('That range does not fit a single slot. Check the times.'); return }
    // append, skipping duplicates, so you can build slots across several days
    setSlots((prev) => {
      const seen = new Set(prev.map((s) => s.starts_at))
      return [...prev, ...fresh.filter((s) => !seen.has(s.starts_at))].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    })
  }

  async function create() {
    if (!title.trim()) { notice('Give the meet a title.'); return }
    if (slots.length === 0) { notice('Generate at least one time slot.'); return }
    setSaving(true)
    const { data: poll, error } = await supabase.from('event_polls')
      .insert({ title: title.trim(), note: note.trim() || null, created_by: user.id })
      .select().single()
    if (error) { setSaving(false); notice(`Could not create the poll: ${error.message}`); return }
    const { error: slotErr } = await supabase.from('event_poll_slots')
      .insert(slots.map((s) => ({ ...s, poll_id: poll.id })))
    setSaving(false)
    if (slotErr) { notice(`Poll created but slots failed: ${slotErr.message}`); return }
    setTitle(''); setNote(''); setSlots([]); setDate(''); setRepeatUntil('')
    onCreated()
  }

  return (
    <Modal open={open} onClose={onClose} title="Plan a meet">
      <div className="space-y-4">
        <div>
          <label htmlFor="poll-title" className="label">What's the meet?</label>
          <input id="poll-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="July community call" />
        </div>
        <div>
          <label htmlFor="poll-note" className="label">Note (optional)</label>
          <input id="poll-note" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="30 minutes on Zoom, agenda to follow" />
        </div>

        <div className="rounded-xl bg-cloud/60 p-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="col-span-2 sm:col-span-1">
              <label htmlFor="poll-date" className="label">Date</label>
              <input id="poll-date" type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label htmlFor="poll-start" className="label">First slot</label>
              <input id="poll-start" type="time" className="input" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <label htmlFor="poll-end" className="label">Slot ends</label>
              <input id="poll-end" type="time" className="input" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
            </div>
            <div>
              <label htmlFor="poll-repeat" className="label">Repeat until</label>
              <input id="poll-repeat" type="time" className="input" value={repeatUntil} onChange={(e) => setRepeatUntil(e.target.value)} />
            </div>
          </div>
          <button type="button" onClick={generate} className="btn-secondary mt-3 !py-2 text-xs">
            {repeatUntil ? 'Generate slots' : 'Add this slot'}
          </button>
          <p className="mt-2 text-[11px] text-smoke">Example: 09:00 to 09:30, repeat until 16:00 makes a slot every 30 minutes. Change the date and add more to offer several days.</p>
        </div>

        {slots.length > 0 && (
          <div>
            <p className="label">Proposed slots ({slots.length})</p>
            <div className="flex max-h-48 flex-wrap gap-2 overflow-y-auto">
              {slots.map((s) => (
                <span key={s.starts_at} className="inline-flex items-center gap-1.5 rounded-full bg-brand-tint px-3 py-1.5 text-xs font-medium text-brand">
                  {formatDate(s.starts_at)} · {timeLabel(s.starts_at)}–{timeLabel(s.ends_at)}
                  <button
                    type="button"
                    onClick={() => setSlots((prev) => prev.filter((x) => x.starts_at !== s.starts_at))}
                    aria-label="Remove slot"
                    className="text-sm leading-none hover:text-red-500"
                  >×</button>
                </span>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="btn-ghost">Cancel</button>
          <button onClick={create} disabled={saving} className="btn-primary">
            {saving ? <Spinner /> : 'Post to creators'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
