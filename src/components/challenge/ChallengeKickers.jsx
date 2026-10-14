import { useEffect, useState } from 'react'
import { useVoucherDays } from '../../lib/voucherDays'
import { SLOT, SLOT_ICON } from './SwapIn'
import { Avatar } from '../ui'
import Icon from '../Icon'
import { cx, formatMoney } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// WHAT IS ON OFFER TO GET YOU POSTING (migration 383): the joining bonus, to somebody who has not entered yet, and the
// voucher days - today's first, then the ones coming up, then the ones done with who won. Draws nothing when the
// challenge runs neither. See components/admin/ChallengeExtrasEditor for how the team sets them.
const fmtDay = (ymd, locale) => new Date(`${ymd}T12:00:00`).toLocaleDateString(locale || undefined, { weekday: 'long', day: 'numeric', month: 'long' })

export default function ChallengeKickers({ challenge, meId, className }) {
  const tr = useT()
  const { days, board } = useVoucherDays(challenge?.id)
  const [now] = useState(() => Date.now())
  // NOT HERE ANY MORE. The team: the joining bonus "above the Hook Me Up button... We already have it on the black card
  // just above that, so it doesn't need to show it again below it." It lives on the dark card by the tabs and in Bonus
  // points (whose row opens its pop-up); this card is the voucher days only.
  const stateOf = (d) => (Date.parse(d.ends_at) <= now ? 'done' : Date.parse(d.starts_at) <= now ? 'today' : 'soon')
  const order = { today: 0, soon: 1, done: 2 }
  const shown = [...days].sort((a, b) => order[stateOf(a)] - order[stateOf(b)] || String(a.day).localeCompare(String(b.day)))
  if (!shown.length) return null

  return (
    <section className={cx('overflow-hidden rounded-card border border-gray-100 bg-white shadow-card animate-rise', className)}>
      {shown.length > 0 && (
        <div>
          <p className="flex items-center gap-2 px-4 pt-4 text-[15px] font-bold text-ink sm:px-5">
            <Icon name="ticket" className="h-5 w-5 text-brand" />{tr('Voucher days')}
          </p>
          <ul className="divide-y divide-gray-50">
            {shown.map((d) => {
              const st = stateOf(d)
              const prize = d.reward_type === 'cash'
                ? tr('{a} cash', { a: formatMoney(d.amount, d.currency) })
                : tr('a {a} Tryp.com voucher', { a: formatMoney(d.amount, d.currency) })
              const winners = board.filter((r) => r.day_id === d.id && r.won)
              const mine = board.find((r) => r.day_id === d.id && r.creator_id === meId)
              const hoursLeft = Math.max(0, Math.ceil((Date.parse(d.ends_at) - now) / 3600000))
              return (
                <li key={d.id} className={cx('px-4 py-3.5 sm:px-5', st === 'done' && 'opacity-80')}>
                  <div className="flex items-start gap-3">
                    <span className={cx('flex h-12 w-12 shrink-0 flex-col items-center justify-center rounded-xl leading-none',
                      st === 'today' ? 'bg-brand text-white' : 'border border-gray-200 bg-white text-ink')}>
                      <span className="text-[17px] font-extrabold tabular-nums">{new Date(`${d.day}T12:00:00`).getDate()}</span>
                      <span className="mt-0.5 text-[10px] font-bold uppercase">{new Date(`${d.day}T12:00:00`).toLocaleDateString(undefined, { month: 'short' })}</span>
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-ink">
                        {st === 'today'
                          ? tr('Today! Post now and reach {v} views to win {p}.', { v: Number(d.min_views).toLocaleString(), p: prize })
                          : st === 'soon'
                            ? tr('Post on {d} and reach {v} views to win {p}.', { d: fmtDay(d.day), v: Number(d.min_views).toLocaleString(), p: prize })
                            : tr('{d}: {v}+ views won {p}.', { d: fmtDay(d.day), v: Number(d.min_views).toLocaleString(), p: prize })}
                      </p>
                      <p className="mt-0.5 text-[13px] text-smoke">
                        {st === 'today' ? tr('{h}h left to post', { h: hoursLeft }) : st === 'soon' ? tr('Videos posted that day count, any views they reach later still count.') : tr('{n} won', { n: winners.length })}
                        {d.max_winners ? ` · ${tr('first {n} only', { n: d.max_winners })}` : ''}
                      </p>
                      {mine && (
                        <p className={cx('mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold', mine.won ? 'bg-brand text-white' : 'border border-gray-200 text-ink')}>
                          <Icon name={mine.won ? 'check' : 'eye'} className="h-3.5 w-3.5" />
                          {mine.won ? tr('You won this one') : tr('Your video: {n} of {v} views', { n: Number(mine.views).toLocaleString(), v: Number(d.min_views).toLocaleString() })}
                        </p>
                      )}
                      {winners.length > 0 && (
                        <div className="mt-2 flex items-center -space-x-1.5">
                          {winners.slice(0, 8).map((w) => <Avatar key={w.creator_id} src={w.photo_url} name={w.name} size="xs" className="ring-2 ring-white" />)}
                          {winners.length > 8 && <span className="pl-3 text-[12px] font-semibold text-smoke">+{winners.length - 8}</span>}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}

// THE DARK CARD BESIDE THE TABS, FOR A VOUCHER DAY OR THE JOINING BONUS. Same slot, same look as the boost card: the
// reward as the disc, what to do, and the time left on the day.
const DARK = 'board-status group relative min-w-0 overflow-hidden text-left text-white shadow-card transition-transform duration-200 hoverable:hover:-translate-y-0.5 bg-gradient-to-r from-ink via-[#2b160c] to-[#5a2308]'

export function VoucherDayCallout({ day, now, onOpen }) {
  const tr = useT()
  const left = Math.max(0, Date.parse(day.ends_at) - now)
  const h = Math.floor(left / 3600000)
  const m = Math.max(1, Math.ceil((left % 3600000) / 60000))
  const prize = formatMoney(day.amount, day.currency)
  return (
    <button type="button" onClick={onOpen} className={cx(DARK, SLOT)}>
      <span aria-hidden className="challenge-sheen pointer-events-none absolute inset-y-0" />
      <span className={cx('relative bg-gradient-to-br from-[#ffb36b] via-brand-light to-brand text-[11px] font-black tabular-nums shadow-[0_0_0_3px_rgba(245,133,63,0.35)]', SLOT_ICON)}>
        {prize.replace(/\.00$/, '')}
        <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-brand/40 [animation-duration:2.4s]" />
      </span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-brand-light">
          {day.reward_type === 'cash' ? tr('Cash day, today') : tr('Voucher day, today')}
        </span>
        <span className="block truncate text-[13px] font-semibold">
          {tr('Post today, reach {v} views, win {p}. {t} left.', { v: Number(day.min_views).toLocaleString(), p: prize, t: h > 0 ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m` })}
        </span>
      </span>
      <Icon name="ticket" className="relative h-5 w-5 shrink-0 text-brand-light" />
    </button>
  )
}

export function JoinBonusCallout({ points, from, onOpen }) {
  const tr = useT()
  return (
    <button type="button" onClick={onOpen} className={cx(DARK, SLOT)}>
      <span aria-hidden className="challenge-sheen pointer-events-none absolute inset-y-0" />
      <span className={cx('relative bg-gradient-to-br from-[#ffb36b] via-brand-light to-brand text-[13px] font-black tabular-nums shadow-[0_0_0_3px_rgba(245,133,63,0.35)]', SLOT_ICON)}>+{points}</span>
      <span className="relative min-w-0 flex-1">
        <span className="block text-[10px] font-bold uppercase tracking-wider text-brand-light">{tr('New creator bonus')}</span>
        <span className="block truncate text-[13px] font-semibold">
          {from
            ? tr('Enter from {d}: +{n} points, straight onto the leaderboard.', { d: new Date(from).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }), n: points })
            : tr('Your first video earns {n} extra points, straight onto the leaderboard.', { n: points })}
        </span>
      </span>
      <Icon name="userPlus" className="relative h-5 w-5 shrink-0 text-brand-light" />
    </button>
  )
}

/**
 * Several offers in one slot take turns, a few seconds each.
 *
 * ONE SMOOTH GLIDE, NO DOTS (15 Oct 2026). The team did not want the two little progress bars: each offer shows for
 * 4.5 seconds, then the whole card's words glide sideways - the one leaving slides out to the left and fades, the next
 * slides in from the right on the same curve - so the change is noticeable without being a blink. All offers sit stacked
 * in one grid cell, so the card never changes height. Hovering pauses.
 */
const ROTATE_MS = 4500
export function OfferRotator({ items }) {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  useEffect(() => {
    if (items.length < 2 || paused) return undefined
    const t = setTimeout(() => setI((n) => n + 1), ROTATE_MS)
    return () => clearTimeout(t)
  }, [items.length, paused, i])
  if (!items.length) return null
  const n = items.length
  const k = i % n
  const prev = (k - 1 + n) % n
  return (
    <div className="relative flex w-full min-w-0 flex-col overflow-hidden rounded-card sm:flex-1" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <div className="grid w-full min-w-0">
        {items.map((item, idx) => {
          const on = idx === k
          const leaving = n > 1 && i > 0 && idx === prev
          // Keyframes rather than transitions, restarted per turn by the key, so the next offer always comes in from the
          // right and the last one always leaves to the left, also with only two offers.
          return (
            <div
              key={on || leaving ? `${idx}-${i}` : idx}
              aria-hidden={!on || undefined}
              className={cx(
                'flex w-full min-w-0 [grid-area:1/1] motion-reduce:animate-none',
                on ? cx('z-10', i > 0 && 'animate-offer-in') : leaving ? 'pointer-events-none animate-offer-out' : 'pointer-events-none invisible',
              )}
            >
              {item}
            </div>
          )
        })}
      </div>
    </div>
  )
}
