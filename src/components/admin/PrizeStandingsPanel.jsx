import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Avatar } from '../ui'
import Icon from '../Icon'
import { cx, formatMoney } from '../../lib/utils'

// WHO IS EARNING THE PARTICIPATION PRIZE AND THE EXTRA AWARDS, RIGHT NOW.
//
// Read from `challenge_prize_standings` (migration 233), which is the same
// function the payout reads - so what this panel says the day before the
// deadline is exactly what "publish the winners" will pay. Nothing here is
// worked out in the browser.

export function usePrizeStandings(challengeId, refreshKey) {
  const [rows, setRows] = useState(null)
  useEffect(() => {
    if (!challengeId) return undefined
    let alive = true
    supabase.rpc('challenge_prize_standings', { p_challenge: challengeId })
      .then(({ data, error }) => { if (alive) setRows(error ? [] : (data ?? [])) })
    return () => { alive = false }
  }, [challengeId, refreshKey])
  return rows
}

const STATUS = {
  earned: { label: 'Earned', cls: 'bg-brand text-white' },
  waitlisted: { label: 'Over the limit', cls: 'bg-gray-100 text-smoke' },
  excluded: { label: 'Won a place', cls: 'bg-gray-100 text-smoke' },
  test: { label: 'Test account', cls: 'bg-gray-100 text-smoke' },
  contender: { label: 'Next in line', cls: 'bg-gray-100 text-smoke' },
}

function Person({ r, note }) {
  const s = STATUS[r.status] || STATUS.contender
  return (
    <li className="flex items-center gap-3 py-2">
      <Avatar src={r.photo_url} name={r.creator_name} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{r.creator_name}</span>
        <span className="block text-[11px] text-smoke">{note}</span>
      </span>
      <span className={cx('shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', s.cls)}>{s.label}</span>
    </li>
  )
}

export default function PrizeStandingsPanel({ challenge, refreshKey }) {
  const rows = usePrizeStandings(challenge?.id, refreshKey)
  if (!rows || rows.length === 0) return null

  const part = rows.filter((r) => r.slot === 'participation')
  const earned = part.filter((r) => r.status === 'earned')
  const cap = challenge?.participation_cap
  const awards = [...new Set(rows.filter((r) => r.slot.startsWith('award:')).map((r) => r.slot))]
  const money = (r) => (r.amount ? formatMoney(r.amount, r.currency) : '')

  return (
    <section className="mb-8 rounded-card border border-gray-100 bg-white p-5 shadow-card sm:p-6">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
          <Icon name="ticket" className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="text-lg font-semibold">Participation and extra awards</p>
          <p className="mt-0.5 text-sm text-smoke">
            Worked out by the same rules the payout uses, so this is what publishing the winners will award.
          </p>
        </div>
      </div>

      {part.length > 0 && (
        <div className="mt-5">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
            Participation: {part[0].prize}
            <span className="text-xs font-normal text-smoke">
              {earned.length}{cap ? ` of ${cap}` : ''} earned
              {earned[0]?.amount ? ` · ${formatMoney(earned[0].amount * earned.length, earned[0].currency)} so far` : ''}
              {' · '}{earned[0]?.reward_type || part[0].reward_type}
            </span>
          </p>
          <ul className="mt-1 divide-y divide-gray-50">
            {part.map((r) => (
              <Person
                key={r.creator_id}
                r={r}
                note={`${r.entries} entries${r.seat ? ` · #${r.seat} to qualify` : ''}${r.board_rank ? ` · ${r.board_rank}${r.board_rank === 1 ? 'st' : r.board_rank === 2 ? 'nd' : r.board_rank === 3 ? 'rd' : 'th'} on the board` : ''}`}
              />
            ))}
          </ul>
        </div>
      )}

      {awards.map((slot) => {
        const list = rows.filter((r) => r.slot === slot)
        const head = list[0]
        return (
          <div key={slot} className="mt-5">
            <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
              {head.label}: {head.prize}
              <span className="text-xs font-normal text-smoke">{money(head)} · {head.reward_type}</span>
            </p>
            <ul className="mt-1 divide-y divide-gray-50">
              {list.map((r) => (
                <Person
                  key={r.creator_id}
                  r={r}
                  note={`${r.entries} entries${r.board_rank ? ` · finished ${r.board_rank}` : ''}`}
                />
              ))}
            </ul>
          </div>
        )
      })}
    </section>
  )
}
