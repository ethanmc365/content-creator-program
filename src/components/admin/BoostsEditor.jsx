import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Modal, Skeleton, Spinner } from '../ui'
import Icon from '../Icon'
import { confirm, notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { cx } from '../../lib/utils'
import { windowPhrase, wholeDays } from '../../lib/boostWindow'

// POINT BOOSTS (4 Oct 2026, migration 334).
//
// Ethan: "Whenever there is an editing challenge, I could add in double points for a specific day and time frame, like 3 hours or whatever,
// or triple points or something crazy, to really get people actually posting videos ... It would just be double points for everything
// related to that specific video ... It could also set a maximum points gain from this, in case people exploit it."
//
// A boost is a window (when it starts, how long it runs), a multiplier, and an optional ceiling on the EXTRA points one creator can gain from
// it. Every video entered inside the window earns that many times what it would have: the per-video points and everything tied to the video
// (its view milestones and the bonuses claimed on it). The challenge rescored by itself the moment a boost is saved or removed, and a boost
// that is running shows on the challenge page with a countdown. Boosts only apply to a points challenge.
const DURATIONS = [[1, '1 hour'], [3, '3 hours'], [6, '6 hours'], [12, '12 hours'], [24, '1 day'], [48, '2 days']]
const MULTS = [2, 3, 4, 5]

const pad = (n) => String(n).padStart(2, '0')
const toLocalInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
const mult = (n) => `x${String(Number(n)).replace(/\.0+$/, '')}`

export default function BoostsEditor({ challengeId }) {
  const { profile } = useAuth()
  const [rows, setRows] = useState(undefined)
  // `true` for a new boost, a row to edit one (7 Oct 2026: Ethan could only delete a boost and make it again).
  const [open, setOpen] = useState(null)
  const load = useCallback(async () => {
    const { data } = await supabase.from('challenge_boosts').select('*').eq('challenge_id', challengeId).order('starts_at', { ascending: false })
    setRows(data || [])
  }, [challengeId])
  useEffect(() => { load() }, [load])

  async function remove(b) {
    if (!await confirm('Remove this boost? Points already earned from it are taken back as the challenge rescores.', { confirmLabel: 'Remove', danger: true })) return
    const { error } = await supabase.from('challenge_boosts').delete().eq('id', b.id)
    if (error) { notice(error.message); return }
    toastSuccess('Boost removed.')
    load()
  }
  const [now] = useState(() => Date.now())
  const state = (b) => (Date.parse(b.ends_at) <= now ? 'ended' : Date.parse(b.starts_at) <= now ? 'live' : 'upcoming')

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 max-sm:!rounded-none max-sm:!border-0 max-sm:!p-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name="fire" className="h-4 w-4 text-brand" />Point boosts</p>
          <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-smoke">Double (or more) points for videos posted inside a window, to get people posting. Everything a video earns is multiplied. A cap stops the multiplying once a creator has gained that many extra points; their points keep counting as normal.</p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="btn-primary !py-2 text-xs"><Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} />Add a boost</button>
      </div>
      {rows === undefined ? <Skeleton className="mt-3 h-16 w-full" /> : rows.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-gray-200 px-4 py-5 text-center text-xs text-smoke">No boosts yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-50 rounded-xl border border-gray-100">
          {rows.map((b) => {
            const st = state(b)
            return (
              <li key={b.id} className={cx('flex items-center gap-3 px-3.5 py-3', st === 'ended' && 'opacity-55')}>
                <span className={cx('flex h-9 w-11 shrink-0 items-center justify-center rounded-lg text-sm font-extrabold tabular-nums', st === 'live' ? 'bg-brand text-white' : 'bg-cloud text-ink')}>{mult(b.multiplier)}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">{b.label}
                    <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', st === 'live' ? 'bg-brand-tint text-brand' : st === 'upcoming' ? 'bg-amber-50 text-amber-700' : 'bg-cloud text-smoke')}>{st === 'live' ? 'On now' : st === 'upcoming' ? 'Coming up' : 'Ended'}</span>
                  </span>
                  <span className="block text-xs text-smoke">Videos posted {windowPhrase(b.starts_at, b.ends_at)}{b.max_extra_points ? ` · stops multiplying after ${b.max_extra_points} extra points each` : ' · no cap'}</span>
                </span>
                <button type="button" onClick={() => setOpen(b)} aria-label="Edit boost" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-smoke transition-colors hoverable:hover:bg-brand-tint hoverable:hover:text-brand"><Icon name="pencil" className="h-4 w-4" /></button>
                <button type="button" onClick={() => remove(b)} aria-label="Remove boost" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-smoke transition-colors hoverable:hover:bg-red-50 hoverable:hover:text-red-500"><Icon name="trash" className="h-4 w-4" /></button>
              </li>
            )
          })}
        </ul>
      )}
      {open && <BoostModal challengeId={challengeId} userId={profile?.id} boost={open === true ? null : open} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load() }} />}
    </div>
  )
}

const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

function BoostModal({ challengeId, userId, boost, onClose, onSaved }) {
  const editing = !!boost
  const initialDays = boost ? wholeDays(boost.starts_at, boost.ends_at) : null
  const [label, setLabel] = useState(boost?.label || 'Double points')
  const known = boost ? MULTS.includes(Number(boost.multiplier)) : true
  const [m, setM] = useState(boost && known ? Number(boost.multiplier) : 2)
  const [custom, setCustom] = useState(boost && !known ? String(Number(boost.multiplier)) : '')
  // WHOLE DAYS OR HOURS (7 Oct 2026). Most boosts are "Thursday" or "Thursday and Friday", so days come first.
  const [byDays, setByDays] = useState(boost ? !!initialDays : true)
  const today = new Date()
  const [fromDay, setFromDay] = useState(initialDays ? ymd(initialDays[0]) : ymd(today))
  const [toDay, setToDay] = useState(initialDays ? ymd(initialDays[initialDays.length - 1]) : ymd(today))
  const [start, setStart] = useState(() => {
    if (boost) return toLocalInput(new Date(boost.starts_at))
    const d = new Date(); d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5, 0, 0); return toLocalInput(d)
  })
  const boostHours = boost ? Math.round((Date.parse(boost.ends_at) - Date.parse(boost.starts_at)) / 3600000) : 3
  const [hours, setHours] = useState(boostHours)
  const [cap, setCap] = useState(boost?.max_extra_points ? String(boost.max_extra_points) : '')
  const [busy, setBusy] = useState(false)
  const mult_ = custom ? Number(custom) : m
  const startMs = byDays ? Date.parse(`${fromDay}T00:00:00`) : Date.parse(start)
  const endMs = byDays ? (() => { const d = new Date(`${toDay}T00:00:00`); d.setDate(d.getDate() + 1); return d.getTime() - 60000 })() : startMs + hours * 3600000
  const bad = !label.trim() || !(mult_ > 1 && mult_ <= 10) || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs
  const durations = DURATIONS.some(([h]) => h === hours) ? DURATIONS : [...DURATIONS, [hours, `${hours} hours`]]

  async function save() {
    setBusy(true)
    const row = {
      label: label.trim(), multiplier: mult_, starts_at: new Date(startMs).toISOString(), ends_at: new Date(endMs).toISOString(),
      max_extra_points: Number(cap) > 0 ? Math.floor(Number(cap)) : null,
    }
    const { error } = editing
      ? await supabase.from('challenge_boosts').update(row).eq('id', boost.id)
      : await supabase.from('challenge_boosts').insert({ ...row, challenge_id: challengeId, created_by: userId })
    setBusy(false)
    if (error) { notice(error.message); return }
    toastSuccess(editing ? 'Boost updated. The challenge has been rescored.' : 'Boost saved. The challenge has been rescored.')
    onSaved()
  }

  const chip = (on) => cx('rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200', on ? 'border-brand bg-brand text-white' : 'border-gray-200 bg-white text-ink hoverable:hover:border-brand')

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit the boost' : 'Add a boost'}>
      <div className="space-y-5">
        <label className="block"><span className="label">Name (creators see it)</span><input className="input" maxLength={60} value={label} onChange={(e) => setLabel(e.target.value)} /></label>
        <div>
          <p className="label">Points are multiplied by</p>
          <div className="flex flex-wrap items-center gap-2">
            {MULTS.map((n) => (
              <button key={n} type="button" aria-pressed={!custom && m === n} onClick={() => { setM(n); setCustom('') }}
                className={cx('rounded-full border px-4 py-2 text-sm font-bold tabular-nums transition-all duration-200', !custom && m === n ? 'border-brand bg-brand text-white shadow-card' : 'border-gray-200 bg-white text-ink hoverable:hover:border-brand')}>x{n}</button>
            ))}
            <input className="input !w-24 !py-2 text-center text-sm" inputMode="decimal" value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d.]/g, ''))} placeholder="Other" aria-label="Another multiplier" />
          </div>
        </div>
        <div>
          <p className="label">When it runs</p>
          <div className="mb-3 flex gap-1.5">
            <button type="button" aria-pressed={byDays} onClick={() => setByDays(true)} className={chip(byDays)}>Whole days</button>
            <button type="button" aria-pressed={!byDays} onClick={() => setByDays(false)} className={chip(!byDays)}>Set hours</button>
          </div>
          {byDays ? (
            <div className="grid grid-cols-2 gap-3">
              <label className="block"><span className="mb-1 block text-[11px] font-semibold text-smoke">From</span><input type="date" className="input" value={fromDay} onChange={(e) => { setFromDay(e.target.value); if (e.target.value > toDay) setToDay(e.target.value) }} /></label>
              <label className="block"><span className="mb-1 block text-[11px] font-semibold text-smoke">Until the end of</span><input type="date" className="input" value={toDay} min={fromDay} onChange={(e) => setToDay(e.target.value)} /></label>
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block"><span className="mb-1 block text-[11px] font-semibold text-smoke">Starts</span><input type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></label>
              <div>
                <p className="mb-1 text-[11px] font-semibold text-smoke">Runs for</p>
                <div className="flex flex-wrap gap-1.5">
                  {durations.map(([h, l]) => (
                    <button key={h} type="button" aria-pressed={hours === h} onClick={() => setHours(h)} className={chip(hours === h)}>{l}</button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
        <label className="block"><span className="label">Stop multiplying after this many extra points (optional)</span>
          <input className="input" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/[^\d]/g, ''))} placeholder="No cap" />
          <span className="mt-1 block text-[11px] leading-relaxed text-smoke">
            {Number(cap) > 0
              ? `Once a creator has gained ${cap} extra points from this boost, their videos stop being multiplied. They keep earning their normal points; only the extra stops.`
              : 'A ceiling on the EXTRA points, in case somebody posts a flood of videos. Normal points are never capped by a boost.'}
          </span>
        </label>
        {!bad && <p className="rounded-xl bg-cloud px-3.5 py-2.5 text-xs text-smoke">Creators will see: <strong className="text-ink">Videos posted {windowPhrase(new Date(startMs).toISOString(), new Date(endMs).toISOString())} count {mult(mult_)}.</strong></p>}
        <button type="button" onClick={save} disabled={bad || busy} className="btn-primary w-full justify-center disabled:opacity-50">{busy ? <Spinner className="h-4 w-4" /> : editing ? 'Save changes' : 'Save the boost'}</button>
      </div>
    </Modal>
  )
}
