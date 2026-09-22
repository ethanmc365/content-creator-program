import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Avatar, Skeleton } from '../ui'
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

// A BAR TOWARDS THE THRESHOLD, THAT FILLS ON ARRIVAL (22 Sep 2026). It starts
// at zero and eases to its value one frame after mounting, so the list reads
// as filling up rather than appearing half-drawn.
function ProgressBar({ value, delay = 0 }) {
  const [shown, setShown] = useState(0)
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(Math.max(0, Math.min(1, value))))
    return () => cancelAnimationFrame(t)
  }, [value])
  return (
    <span className="mt-1.5 block h-1.5 w-full overflow-hidden rounded-full bg-gray-100">
      <span
        className="block h-full rounded-full bg-gradient-to-r from-brand to-brand-light transition-[width] duration-700 ease-out"
        style={{ width: `${shown * 100}%`, transitionDelay: `${delay}ms` }}
      />
    </span>
  )
}

function Person({ r, note, progress, index = 0 }) {
  const s = STATUS[r.status] || STATUS.contender
  return (
    <li className="flex items-center gap-3 py-2.5 animate-fade-up" style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}>
      <Avatar src={r.photo_url} name={r.creator_name} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{r.creator_name}</span>
        <span className="block text-[11px] text-smoke">{note}</span>
        {progress != null && <ProgressBar value={progress} delay={Math.min(index, 8) * 45 + 120} />}
      </span>
      <span className={cx('shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold', s.cls)}>{s.label}</span>
    </li>
  )
}

const ordinal = (n) => `${n}${n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th'}`

export default function PrizeStandingsPanel({ challenge, refreshKey }) {
  const rows = usePrizeStandings(challenge?.id, refreshKey)
  // WHILE IT LOADS, ITS SHAPE IS ALREADY THERE. It used to render nothing
  // until the standings arrived and then push the page down a beat after
  // everything else had settled. A challenge with a taking-part prize is known
  // to have this panel, so it holds its place with a skeleton instead.
  const expected = !!(challenge?.participation_threshold || challenge?.participation_prize)
  if (rows === null) {
    if (!expected) return null
    return (
      <section className="mb-8 rounded-card border border-gray-100 bg-white p-5 shadow-card sm:p-6" aria-busy="true">
        <div className="flex items-start gap-3">
          <Skeleton className="h-10 w-10 rounded-xl" />
          <div className="flex-1 space-y-2"><Skeleton className="h-5 w-64" /><Skeleton className="h-4 w-80 max-w-full" /></div>
        </div>
        <div className="mt-5 space-y-3"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
      </section>
    )
  }
  if (rows.length === 0) return null
  const byPoints = challenge?.participation_basis === 'points'
  const threshold = Number(challenge?.participation_threshold) || 0

  const part = rows.filter((r) => r.slot === 'participation')
  const earned = part.filter((r) => r.status === 'earned')
  const cap = challenge?.participation_cap
  const awards = [...new Set(rows.filter((r) => r.slot.startsWith('award:')).map((r) => r.slot))]
  const money = (r) => (r.amount ? formatMoney(r.amount, r.currency) : '')

  return (
    <section className="mb-8 rounded-card border border-gray-100 bg-white p-5 shadow-card animate-fade-up sm:p-6">
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
            {part.map((r, i) => {
              const have = byPoints ? Number(r.points) || 0 : Number(r.entries) || 0
              const unit = byPoints ? 'points' : 'entries'
              return (
                <Person
                  key={r.creator_id}
                  r={r}
                  index={i}
                  progress={threshold ? have / threshold : null}
                  note={[
                    threshold ? `${have} of ${threshold} ${unit}` : `${r.entries} entries`,
                    byPoints ? `${r.entries} ${r.entries === 1 ? 'entry' : 'entries'}` : null,
                    r.seat ? `#${r.seat} to qualify` : null,
                    r.board_rank ? `${ordinal(r.board_rank)} on the board` : null,
                    r.status === 'excluded' ? 'a prize place, so not the voucher' : null,
                  ].filter(Boolean).join(' · ')}
                />
              )
            })}
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
              {list.map((r, i) => (
                <Person
                  key={r.creator_id}
                  r={r}
                  index={i}
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
