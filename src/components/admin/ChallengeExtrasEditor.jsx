import { useCallback, useEffect, useState } from 'react'
import { Avatar, Modal, Select, Skeleton, Spinner } from '../ui'
import DayPicker from '../DayPicker'
import Icon from '../Icon'
import { confirm, notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { cx, formatMoney } from '../../lib/utils'
import { COMMON_ZONES } from '../../lib/timezones'
import { moneyApi } from '../../api/money'
import { challengesApi } from '../../api/challenges'

// TWO WAYS TO GET PEOPLE POSTING (migration 383).
//
// JOINING BONUS. Switching it on stamps the moment (challenges.join_bonus_from); a creator whose FIRST entry comes after
// it gets the points once. Points challenges only.
//
// VOUCHER DAYS. A day is the whole date in a timezone (the market's unless one is picked), a view bar and a reward. A
// video posted that day that passes the bar wins its creator one pending reward, the moment its views cross it; the team
// hands vouchers out from Rewards as with every other prize.

const chip = (on) => cx('rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200', on ? 'border-brand bg-brand text-white' : 'border-gray-200 bg-white text-ink hoverable:hover:border-brand')
const dayLabel = (ymd) => new Date(`${ymd}T12:00:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })

export function JoinBonusEditor({ challengeId }) {
  const [row, setRow] = useState(undefined)
  const [earned, setEarned] = useState(0)
  // NOTHING IS PICKED WHILE IT IS OFF (19 Oct 2026). "+10 points" sat there solid orange on a bonus that was off, so the
  // card read as already active (Ethan). A number is picked only by pressing one, or when the bonus is on.
  const [pts, setPts] = useState(null)
  const [custom, setCustom] = useState('')
  const [busy, setBusy] = useState(false)
  const load = useCallback(async () => {
    const [{ data }, { count }] = await Promise.all([
      challengesApi.challenges().select('join_bonus_points, join_bonus_from').eq('id', challengeId).single(),
      challengesApi.pointAwards().select('id', { count: 'exact', head: true }).eq('challenge_id', challengeId).eq('reason', 'Joining bonus'),
    ])
    setRow(data || {})
    setEarned(count || 0)
    if (data?.join_bonus_points) {
      const n = Number(data.join_bonus_points)
      if ([5, 10].includes(n)) { setPts(n); setCustom('') } else setCustom(String(n))
    }
  }, [challengeId])
  useEffect(() => { load() }, [load])

  const on = Number(row?.join_bonus_points) > 0
  const value = custom ? Number(custom) : (pts ?? 0)
  async function save(next) {
    if (next != null && !(next > 0 && next <= 1000)) { notice('Pick a number of points between 1 and 1000.'); return }
    if (next == null && !await confirm('Switch the joining bonus off? Points already given are taken back as the challenge rescores.', { confirmLabel: 'Switch off', danger: true })) return
    setBusy(true)
    const { error } = await challengesApi.challenges().update({ join_bonus_points: next }).eq('id', challengeId)
    setBusy(false)
    if (error) { notice(error.message); return }
    toastSuccess(next == null ? 'Joining bonus switched off.' : on ? 'Joining bonus updated. The challenge has been rescored.' : 'Joining bonus is on.')
    load()
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 max-sm:!rounded-none max-sm:!border-0 max-sm:!p-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name="userPlus" className="h-4 w-4 text-brand" />Joining bonus</p>
          <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-smoke">Extra points for every creator who has not entered yet, on their first entry. Creators who already entered do not get it. It shows on the challenge page so people know.</p>
        </div>
        {on && <span className="rounded-full bg-brand px-2.5 py-1 text-[11px] font-bold text-white">On · +{Number(row.join_bonus_points)} points</span>}
      </div>
      {row === undefined ? <Skeleton className="mt-3 h-12 w-full" /> : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {[5, 10].map((n) => (
              <button key={n} type="button" aria-pressed={!custom && pts === n} onClick={() => { setPts(n); setCustom('') }} className={chip(!custom && pts === n)}>+{n} points</button>
            ))}
            {/* TYPE THE NUMBER, "points" FOLLOWS IT: "Make sure it shows that I just type in the number, and then it
                says 'points' after it, with a similar design to the other ones." */}
            <label className={cx('flex items-center gap-1 rounded-full border px-3.5 py-1 text-xs font-semibold transition-all duration-200', custom ? 'border-brand bg-brand text-white' : 'border-gray-200 bg-white text-ink focus-within:border-brand')}>
              <span aria-hidden>+</span>
              <input className="w-10 bg-transparent text-center text-xs font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-smoke" inputMode="numeric"
                value={custom} onChange={(e) => setCustom(e.target.value.replace(/[^\d]/g, '').slice(0, 4))} placeholder="Other" aria-label="Other number of points" />
              <span>points</span>
            </label>
          </div>
          {on && (
            <p className="text-xs text-smoke">
              On since {new Date(row.join_bonus_from).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
              {' · '}{earned === 1 ? '1 creator has earned it' : `${earned} creators have earned it`}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={busy || !value || (on && value === Number(row.join_bonus_points))} onClick={() => save(value)} className="btn-primary !py-2 text-xs disabled:opacity-50">
              {busy ? <Spinner className="h-3.5 w-3.5" /> : on ? 'Save points' : value ? `Switch on: +${value} points` : 'Pick the points to switch on'}
            </button>
            {on && <button type="button" disabled={busy} onClick={() => save(null)} className="btn-ghost !py-2 text-xs">Switch off</button>}
          </div>
        </div>
      )}
    </div>
  )
}

export function VoucherDaysEditor({ challengeId, currency = 'EUR' }) {
  const [days, setDays] = useState(undefined)
  const [wins, setWins] = useState([])
  const [open, setOpen] = useState(null)
  const [awarding, setAwarding] = useState(false)
  const load = useCallback(async () => {
    const [{ data: d }, { data: w }] = await Promise.all([
      challengesApi.challengeVoucherDays().select('*').eq('challenge_id', challengeId).order('day'),
      challengesApi.challengeVoucherDayWins().select('day_id, views, creator:profiles!challenge_voucher_day_wins_creator_id_fkey(id, name, photo_url)').eq('challenge_id', challengeId),
    ])
    setDays(d || [])
    setWins(w || [])
  }, [challengeId])
  useEffect(() => { load() }, [load])

  const [now] = useState(() => Date.now())
  const state = (d) => (Date.parse(d.ends_at) <= now ? 'ended' : Date.parse(d.starts_at) <= now ? 'today' : 'upcoming')
  async function remove(d) {
    const n = wins.filter((w) => w.day_id === d.id).length
    if (!await confirm(n ? `Remove ${dayLabel(d.day)}? The ${n} reward${n === 1 ? '' : 's'} already given stay on the Rewards page.` : `Remove ${dayLabel(d.day)}?`, { confirmLabel: 'Remove', danger: true })) return
    const { error } = await challengesApi.challengeVoucherDays().delete().eq('id', d.id)
    if (error) { notice(error.message); return }
    load()
  }
  async function awardNow() {
    setAwarding(true)
    const { data, error } = await moneyApi.voucherDaysAward({ p_challenge: challengeId })
    setAwarding(false)
    if (error) { notice(error.message); return }
    toastSuccess(data ? `${data} new reward${data === 1 ? '' : 's'} given.` : 'Everybody who qualifies already has their reward.')
    load()
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 max-sm:!rounded-none max-sm:!border-0 max-sm:!p-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink"><Icon name="ticket" className="h-4 w-4 text-brand" />Voucher days</p>
          <p className="mt-0.5 max-w-xl text-xs leading-relaxed text-smoke">Pick days. Every creator whose video posted on that day passes the views you set wins the reward, once per day. It is given the moment the views cross the bar and lands on the Rewards page as owed, like any prize.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {days?.some((d) => state(d) !== 'upcoming') && (
            <button type="button" onClick={awardNow} disabled={awarding} className="btn-secondary !py-2 text-xs">{awarding ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="refresh" className="h-3.5 w-3.5" />}Award now</button>
          )}
          <button type="button" onClick={() => setOpen(true)} className="btn-primary !py-2 text-xs"><Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} />Add days</button>
        </div>
      </div>
      {days === undefined ? <Skeleton className="mt-3 h-16 w-full" /> : days.length === 0 ? (
        <p className="mt-3 rounded-xl border border-dashed border-gray-200 px-4 py-5 text-center text-xs text-smoke">No voucher days yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-gray-50 rounded-xl border border-gray-100">
          {days.map((d) => {
            const st = state(d)
            const won = wins.filter((w) => w.day_id === d.id)
            return (
              <li key={d.id} className={cx('px-3.5 py-3', !d.is_active && 'opacity-55')}>
                <div className="flex items-center gap-3">
                  <span className={cx('flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-xl text-center leading-none', st === 'today' ? 'bg-brand text-white' : 'border border-gray-200 bg-white text-ink')}>
                    <span className="text-[15px] font-extrabold tabular-nums">{new Date(`${d.day}T12:00:00`).getDate()}</span>
                    <span className="mt-0.5 text-[10px] font-semibold uppercase">{new Date(`${d.day}T12:00:00`).toLocaleDateString('en-GB', { month: 'short' })}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                      {formatMoney(d.amount, d.currency)} {d.reward_type === 'cash' ? 'cash' : 'voucher'}
                      <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-bold uppercase', st === 'today' ? 'bg-brand text-white' : st === 'upcoming' ? 'border border-gray-200 text-smoke' : 'bg-cloud text-smoke')}>{st === 'today' ? 'Today' : st === 'upcoming' ? 'Coming up' : 'Done'}</span>
                    </span>
                    <span className="block text-xs text-smoke">{dayLabel(d.day)} ({d.tz}) · {Number(d.min_views).toLocaleString('en-GB')}+ views{d.max_winners ? ` · first ${d.max_winners} only` : ''} · {won.length} won</span>
                  </span>
                  <button type="button" onClick={() => setOpen(d)} aria-label="Edit day" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-ink"><Icon name="pencil" className="h-4 w-4" /></button>
                  <button type="button" onClick={() => remove(d)} aria-label="Remove day" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-smoke transition-colors hoverable:hover:bg-red-50 hoverable:hover:text-red-500"><Icon name="trash" className="h-4 w-4" /></button>
                </div>
                {won.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5 pl-14">
                    {won.map((w) => (
                      <span key={w.creator?.id} className="flex items-center gap-1.5 rounded-full border border-gray-100 bg-white py-0.5 pl-0.5 pr-2 text-[12px] text-ink">
                        <Avatar src={w.creator?.photo_url} name={w.creator?.name} size="xs" />{w.creator?.name}
                        <span className="tabular-nums text-smoke">{Number(w.views || 0).toLocaleString('en-GB')}</span>
                      </span>
                    ))}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
      {open && <VoucherDayModal challengeId={challengeId} currency={currency} day={open === true ? null : open} taken={(days || []).map((d) => d.day)} onClose={() => setOpen(null)} onSaved={() => { setOpen(null); load() }} />}
    </div>
  )
}

function VoucherDayModal({ challengeId, currency, day, taken, onClose, onSaved }) {
  const editing = !!day
  const [dates, setDates] = useState(day ? [day.day] : [])
  const [views, setViews] = useState(day ? Number(day.min_views) : 5000)
  const [viewsCustom, setViewsCustom] = useState(day && ![2000, 5000, 10000].includes(Number(day.min_views)) ? String(day.min_views) : '')
  const [type, setType] = useState(day?.reward_type || 'voucher')
  const [amount, setAmount] = useState(day ? Number(day.amount) : 10)
  const [amountCustom, setAmountCustom] = useState(day && ![5, 10].includes(Number(day.amount)) ? String(day.amount) : '')
  const [cur, setCur] = useState(day?.currency || currency || 'EUR')
  const [tz, setTz] = useState(day?.tz || '')
  const [cap, setCap] = useState(day?.max_winners ? String(day.max_winners) : '')
  const [busy, setBusy] = useState(false)
  const minViews = viewsCustom ? Number(viewsCustom) : views
  const amt = amountCustom ? Number(amountCustom) : amount
  const clean = [...new Set(dates.filter(Boolean))]
  const clash = !editing && clean.some((d) => taken.includes(d))
  const bad = !clean.length || clash || !(minViews > 0) || !(amt > 0 && amt <= 1000)

  async function save() {
    setBusy(true)
    const base = { min_views: Math.floor(minViews), reward_type: type, amount: amt, currency: cur, max_winners: Number(cap) > 0 ? Math.floor(Number(cap)) : null, ...(tz ? { tz } : {}) }
    const { error } = editing
      ? await challengesApi.challengeVoucherDays().update({ ...base, day: clean[0] }).eq('id', day.id)
      : await challengesApi.challengeVoucherDays().insert(clean.map((d) => ({ ...base, challenge_id: challengeId, day: d })))
    setBusy(false)
    if (error) { notice(error.message); return }
    toastSuccess(editing ? 'Voucher day saved.' : clean.length === 1 ? 'Voucher day added.' : `${clean.length} voucher days added.`)
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={editing ? 'Edit the voucher day' : 'Add voucher days'}>
      <div className="space-y-5">
        <div>
          <p className="label">{editing ? 'Day' : 'Days'}</p>
          <DayPicker value={clean} multiple={!editing} min={editing ? null : new Date().toISOString().slice(0, 10)} taken={editing ? taken.filter((t) => t !== day.day) : taken}
            onChange={(next) => setDates(next.length ? next : editing ? dates : [])} />
          <p className="mt-2 text-xs text-smoke">
            {clean.length ? `${clean.length === 1 ? '1 day' : `${clean.length} days`}: ${clean.map(dayLabel).join(', ')}` : editing ? '' : 'Tap the days. You can pick several.'}
          </p>
          {clash && <p className="mt-1 text-xs text-red-600">One of those days is already a voucher day.</p>}
        </div>
        <div>
          <p className="label">A video posted that day needs</p>
          <div className="flex flex-wrap items-center gap-2">
            {[2000, 5000, 10000].map((n) => (
              <button key={n} type="button" aria-pressed={!viewsCustom && views === n} onClick={() => { setViews(n); setViewsCustom('') }} className={chip(!viewsCustom && views === n)}>{n.toLocaleString('en-GB')} views</button>
            ))}
            <label className={cx('flex items-center gap-1 rounded-full border px-3.5 py-1 text-xs font-semibold transition-all duration-200', viewsCustom ? 'border-brand bg-brand text-white' : 'border-gray-200 bg-white text-ink focus-within:border-brand')}>
              <input className="w-14 bg-transparent text-center text-xs font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-smoke" inputMode="numeric"
                value={viewsCustom} onChange={(e) => setViewsCustom(e.target.value.replace(/[^\d]/g, '').slice(0, 8))} placeholder="Other" aria-label="Another view count" />
              <span>views</span>
            </label>
          </div>
        </div>
        <div>
          <p className="label">They win</p>
          <div className="mb-2 flex gap-1.5">
            <button type="button" aria-pressed={type === 'voucher'} onClick={() => setType('voucher')} className={chip(type === 'voucher')}>Tryp.com voucher</button>
            <button type="button" aria-pressed={type === 'cash'} onClick={() => setType('cash')} className={chip(type === 'cash')}>Cash</button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {[5, 10].map((n) => (
              <button key={n} type="button" aria-pressed={!amountCustom && amount === n} onClick={() => { setAmount(n); setAmountCustom('') }} className={chip(!amountCustom && amount === n)}>{formatMoney(n, cur)}</button>
            ))}
            <label className={cx('flex items-center gap-1 rounded-full border px-3.5 py-1 text-xs font-semibold transition-all duration-200', amountCustom ? 'border-brand bg-brand text-white' : 'border-gray-200 bg-white text-ink focus-within:border-brand')}>
              <input className="w-12 bg-transparent text-center text-xs font-semibold tabular-nums outline-none placeholder:font-normal placeholder:text-smoke" inputMode="decimal"
                value={amountCustom} onChange={(e) => setAmountCustom(e.target.value.replace(/[^\d.]/g, '').slice(0, 6))} placeholder="Other" aria-label="Another amount" />
              <span>{cur}</span>
            </label>
            <Select className="w-28" ariaLabel="Currency" value={cur} onChange={setCur}
              options={['EUR', 'GBP', 'RON', 'DKK', 'SEK', 'NOK'].map((c) => ({ value: c, label: c }))} />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="block"><span className="label">Timezone of the day</span>
            <Select variant="field" className="w-full" ariaLabel="Timezone of the day" value={tz} onChange={setTz}
              options={[{ value: '', label: "The market's own" }, ...COMMON_ZONES]} />
          </div>
          <label className="block"><span className="label">Most winners (optional)</span>
            <span className="relative block">
              <input className="input pr-20" inputMode="numeric" value={cap} onChange={(e) => setCap(e.target.value.replace(/[^\d]/g, ''))} placeholder="No limit" />
              {cap && <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm font-semibold text-smoke">winners</span>}
            </span>
          </label>
        </div>
        {!bad && (
          <p className="rounded-xl bg-cloud px-3.5 py-2.5 text-xs text-smoke">
            Creators will see: <strong className="text-ink">Post on {clean.map(dayLabel).join(', ')} and reach {Number(minViews).toLocaleString('en-GB')} views to win a {formatMoney(amt, cur)} {type === 'cash' ? 'cash prize' : 'Tryp.com voucher'}.</strong>
            {type === 'voucher' && ' Vouchers can be combined with their other Tryp.com vouchers.'}
          </p>
        )}
        <button type="button" onClick={save} disabled={bad || busy} className="btn-primary w-full justify-center disabled:opacity-50">{busy ? <Spinner className="h-4 w-4" /> : editing ? 'Save changes' : 'Save'}</button>
      </div>
    </Modal>
  )
}
