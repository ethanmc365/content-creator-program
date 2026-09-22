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

// THE COMPACT STRIP, BOLTED ONTO THE LEADERBOARD CARD (23 Sep 2026). Ethan:
// "the participation award should be more compact and bolted on to the
// leaderboard card above rather than take up so much space." The full
// per-person progress-bar list was its own card the same size as the podium -
// this is one summary line, one aggregate bar, a cluster of faces, and an
// "everyone" toggle for the detail underneath, all inside whatever card the
// caller wraps it in.
function CompactStanding({ challenge, rows }) {
  const [open, setOpen] = useState(false)
  const byPoints = challenge?.participation_basis === 'points'
  const threshold = Number(challenge?.participation_threshold) || 0
  const allPart = rows.filter((r) => r.slot === 'participation')
  const part = allPart.filter((r) => r.status !== 'excluded')
  const earned = part.filter((r) => r.status === 'earned')
  const cap = challenge?.participation_cap
  const awards = [...new Set(rows.filter((r) => r.slot.startsWith('award:')).map((r) => r.slot))]

  if (allPart.length === 0 && awards.length === 0) return null
  const avg = part.length && threshold
    ? part.reduce((sum, r) => sum + Math.min(1, ((byPoints ? Number(r.points) : Number(r.entries)) || 0) / threshold), 0) / part.length
    : (earned.length ? 1 : 0)

  return (
    <div className="mt-5 border-t border-gray-100 pt-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 text-left"
      >
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
          <Icon name="ticket" className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-sm font-semibold text-ink">{allPart[0]?.prize || 'Taking part'}</span>
            {allPart.length > 0 && (
              <span className="text-xs text-smoke">
                {earned.length}{cap ? ` of ${cap}` : ''} earned it
              </span>
            )}
            {awards.length > 0 && (
              <span className="text-xs text-smoke">· {awards.length} extra award{awards.length === 1 ? '' : 's'}</span>
            )}
          </span>
          {allPart.length > 0 && (
            <ProgressBar value={avg} />
          )}
        </span>
        {earned.length > 0 && (
          <span className="flex shrink-0 -space-x-2">
            {earned.slice(0, 6).map((r) => (
              <Avatar key={r.creator_id} src={r.photo_url} name={r.creator_name} size="xs" />
            ))}
            {earned.length > 6 && (
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-cloud text-[10px] font-bold text-smoke ring-2 ring-white">
                +{earned.length - 6}
              </span>
            )}
          </span>
        )}
        <Icon name="chevronDown" className={cx('h-4 w-4 shrink-0 text-gray-300 transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open && <FullStandings challenge={challenge} rows={rows} embedded />}
    </div>
  )
}

export default function PrizeStandingsPanel({ challenge, refreshKey, compact = false }) {
  const rows = usePrizeStandings(challenge?.id, refreshKey)
  // WHILE IT LOADS, ITS SHAPE IS ALREADY THERE. It used to render nothing
  // until the standings arrived and then push the page down a beat after
  // everything else had settled. A challenge with a taking-part prize is known
  // to have this panel, so it holds its place with a skeleton instead.
  const expected = !!(challenge?.participation_threshold || challenge?.participation_prize)
  if (rows === null) {
    if (!expected) return null
    if (compact) return <div className="mt-5 border-t border-gray-100 pt-4"><Skeleton className="h-10 w-full" /></div>
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
  if (compact) return <CompactStanding challenge={challenge} rows={rows} />
  return <FullStandings challenge={challenge} rows={rows} />
}

function FullStandings({ challenge, rows, embedded = false }) {
  const byPoints = challenge?.participation_basis === 'points'
  const threshold = Number(challenge?.participation_threshold) || 0

  // A CREATOR IN THE PRIZE PLACES IS NOT A VOUCHER CANDIDATE (22 Sep 2026).
  // Ethan: the panel listed Zaira Amate (1st, 23 points) under the voucher as
  // though she had earned it. The server already excluded her - the voucher on
  // the Global Challenge is for creators OUTSIDE the top 10 - but drawing her
  // in the list with a grey chip read as the opposite. They are named once,
  // underneath, instead.
  const allPart = rows.filter((r) => r.slot === 'participation')
  const part = allPart.filter((r) => r.status !== 'excluded')
  const placed = allPart.filter((r) => r.status === 'excluded')
  const earned = part.filter((r) => r.status === 'earned')
  const cap = challenge?.participation_cap
  const awards = [...new Set(rows.filter((r) => r.slot.startsWith('award:')).map((r) => r.slot))]
  const money = (r) => (r.amount ? formatMoney(r.amount, r.currency) : '')

  const Wrapper = embedded ? 'div' : 'section'
  return (
    <Wrapper className={embedded ? 'mt-4' : 'mb-8 rounded-card border border-gray-100 bg-white p-5 shadow-card animate-fade-up sm:p-6'}>
      {!embedded && (
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
      )}

      {allPart.length > 0 && (
        <div className="mt-5">
          <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold">
            Participation: {allPart[0].prize}
            <span className="text-xs font-normal text-smoke">
              {earned.length}{cap ? ` of ${cap}` : ''} earned
              {earned[0]?.amount ? ` · ${formatMoney(earned[0].amount * earned.length, earned[0].currency)} so far` : ''}
              {' · '}{earned[0]?.reward_type || allPart[0].reward_type}
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
                  ].filter(Boolean).join(' · ')}
                />
              )
            })}
          </ul>
          {part.length === 0 && (
            <p className="mt-2 text-sm text-smoke">Nobody outside the prize places has reached it yet.</p>
          )}
          {placed.length > 0 && (
            <p className="mt-3 rounded-xl bg-cloud/60 px-3 py-2 text-xs text-smoke">
              Not eligible, because they are in a prize place and win that instead:{' '}
              <span className="font-semibold text-ink">
                {placed.map((r) => `${r.creator_name}${r.board_rank ? ` (${ordinal(r.board_rank)})` : ''}`).join(', ')}
              </span>
            </p>
          )}
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
    </Wrapper>
  )
}
