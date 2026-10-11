import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Avatar } from '../ui'
import Icon from '../Icon'
import { cx, formatMoney } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// WHAT IS ON OFFER TO GET YOU POSTING (12 Oct 2026, migration 383): the joining bonus, to somebody who has not entered yet,
// and the voucher days - today's first, then the ones coming up, then the ones done with who won. Draws nothing when the
// challenge runs neither. See components/admin/ChallengeExtrasEditor for how the team sets them.
const fmtDay = (ymd, locale) => new Date(`${ymd}T12:00:00`).toLocaleDateString(locale || undefined, { weekday: 'long', day: 'numeric', month: 'long' })

export default function ChallengeKickers({ challenge, myEntries = 0, meId, live = true, className }) {
  const tr = useT()
  const [days, setDays] = useState([])
  const [board, setBoard] = useState([])
  const [now] = useState(() => Date.now())
  useEffect(() => {
    if (!challenge?.id) return undefined
    let alive = true
    Promise.all([
      supabase.from('challenge_voucher_days').select('*').eq('challenge_id', challenge.id).eq('is_active', true).order('day'),
      supabase.rpc('voucher_day_board', { p_challenge: challenge.id }),
    ]).then(([{ data: d }, { data: b }]) => {
      if (!alive) return
      setDays(d || [])
      setBoard(b || [])
    })
    return () => { alive = false }
  }, [challenge?.id])

  const joinPts = Number(challenge?.join_bonus_points) || 0
  const showJoin = live && joinPts > 0 && myEntries === 0
  const stateOf = (d) => (Date.parse(d.ends_at) <= now ? 'done' : Date.parse(d.starts_at) <= now ? 'today' : 'soon')
  const order = { today: 0, soon: 1, done: 2 }
  const shown = [...days].sort((a, b) => order[stateOf(a)] - order[stateOf(b)] || String(a.day).localeCompare(String(b.day)))
  if (!showJoin && !shown.length) return null

  return (
    <section className={cx('overflow-hidden rounded-card border border-gray-100 bg-white shadow-card animate-rise', className)}>
      {showJoin && (
        <div className="flex items-start gap-3 px-4 py-4 sm:px-5">
          <Icon name="userPlus" className="mt-0.5 h-6 w-6 shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-bold text-ink">{tr('Joining bonus: +{n} points', { n: joinPts })}</p>
            <p className="mt-0.5 text-[13px] leading-snug text-smoke">{tr('Not entered yet? Your first video earns you {n} extra points, straight onto the leaderboard.', { n: joinPts })}</p>
          </div>
          <span className="shrink-0 rounded-full bg-brand px-2.5 py-1 text-[12px] font-extrabold tabular-nums text-white">+{joinPts}</span>
        </div>
      )}
      {shown.length > 0 && (
        <div className={cx(showJoin && 'border-t border-gray-100')}>
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
