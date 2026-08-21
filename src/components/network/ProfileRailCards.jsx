import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import AircraftPhoto from './AircraftPhoto'
import { AIRCRAFT, aircraftTypeByName } from '../../lib/airlines'
import { cx } from '../../lib/utils'

// THE REST OF THE PLATFORM, ON THE PROFILE.
//
// Ethan: "I mentioned the aircraft collection, that's something cool you could
// put in. Flight stats maybe something cool to have somewhere. Streaks and
// puzzle records could go in, but we need to make sure we can structure this
// correctly, that it looks clean and nothing's crowded."
//
// THE STRUCTURE IS THE WHOLE ASK, so these are RAIL cards and not sections.
// Everything the profile used to hold was a full-width band, which is why the
// page read as a scroll of unrelated stripes - and adding three more bands
// would have made the exact problem worse. A rail card is small, it is quiet,
// and it earns its place by being a number you can glance at with a way in
// behind it.
//
// EACH ONE RENDERS NOTHING WHEN THERE IS NOTHING. A creator who has never
// logged a flight should not see an aircraft card explaining that it is empty;
// an empty state is only worth showing on your OWN profile, where it is an
// invitation rather than a fact about somebody else.

function RailCard({ icon, title, to, linkLabel, children }) {
  return (
    <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Icon name={icon} className="h-4 w-4 shrink-0 text-brand" />
          {title}
        </h2>
        {to && (
          <Link to={to} className="shrink-0 text-xs font-medium text-brand transition-transform duration-200 hover:scale-105">
            {linkLabel || 'See all'}
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

// ------------------------------------------------------------ the aircraft
//
// THE PHOTOGRAPHS, NOT A NUMBER. "Six aircraft" is a statistic; four
// photographs of aeroplanes with a "+2" is a collection, and a collection is
// the thing somebody clicks. They are the same 640px files the collection page
// uses, already in the browser cache for anybody who has been there.
export function AircraftCard({ creatorId, isMe, firstName }) {
  const [types, setTypes] = useState(null)

  useEffect(() => {
    let alive = true
    supabase.from('flights').select('aircraft').eq('creator_id', creatorId)
      .not('aircraft', 'is', null)
      .then(({ data }) => {
        if (!alive) return
        const seen = new Map()
        for (const f of data || []) {
          const name = (f.aircraft || '').trim()
          if (!name) continue
          seen.set(name.toLowerCase(), name)
        }
        setTypes([...seen.values()])
      })
    return () => { alive = false }
  }, [creatorId])

  if (types === null) return null
  if (!types.length) return null

  const total = Object.keys(AIRCRAFT).length
  const shown = types.slice(0, 4)

  return (
    <RailCard icon="plane-tryp" title="Aircraft collection" to="/flights/aircraft" linkLabel="The collection">
      <div className="grid grid-cols-2 gap-1.5">
        {shown.map((name) => {
          const t = aircraftTypeByName(name)
          return (
            <span key={name} className="relative block aspect-[16/9] overflow-hidden rounded-lg bg-cloud" title={name}>
              <AircraftPhoto typeKey={t?.key} type={t} owned />
            </span>
          )
        })}
      </div>
      <p className="mt-2.5 text-xs text-smoke">
        <span className="font-semibold text-ink">{types.length}</span>
        {` of ${total} aircrafts `}
        {isMe ? 'you have been on' : `${firstName} has been on`}
      </p>
    </RailCard>
  )
}

// -------------------------------------------------------------- the puzzles
//
// WHAT A PUZZLE RECORD ACTUALLY IS. `game_scores` holds one row per attempt
// with `correct` out of `total`, so a "record" is the best ratio somebody has
// managed - and `day_key` counts the days they turned up, which is the number
// that says whether this is a habit. Both are read from the rows rather than
// from the streak RPC, because that one WRITES (it spends freezes as a side
// effect) and a profile view must never change somebody's streak.
export function PuzzleCard({ creatorId, isMe, firstName }) {
  const [stats, setStats] = useState(null)

  useEffect(() => {
    let alive = true
    supabase.from('game_scores').select('mode, correct, total, day_key')
      .eq('player_id', creatorId).limit(2000)
      .then(({ data }) => {
        if (!alive) return
        const rows = data || []
        if (!rows.length) { setStats({ plays: 0 }); return }
        const days = new Set(rows.map((r) => r.day_key).filter(Boolean))
        let best = null
        for (const r of rows) {
          if (!r.total) continue
          const pct = r.correct / r.total
          if (!best || pct > best.pct) best = { pct, correct: r.correct, total: r.total, mode: r.mode }
        }
        setStats({ plays: rows.length, days: days.size, best })
      })
    return () => { alive = false }
  }, [creatorId])

  if (!stats || !stats.plays) return null

  return (
    <RailCard icon="joystick" title="Travel games" to="/game" linkLabel="Play">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-cloud/60 px-3 py-2.5">
          <p className="text-lg font-bold leading-none tabular-nums">{stats.plays}</p>
          <p className="mt-1 text-[11px] text-smoke">puzzles played</p>
        </div>
        <div className="rounded-xl bg-cloud/60 px-3 py-2.5">
          <p className="text-lg font-bold leading-none tabular-nums">{stats.days}</p>
          <p className="mt-1 text-[11px] text-smoke">days turned up</p>
        </div>
      </div>
      {stats.best && (
        <p className="mt-2.5 text-xs text-smoke">
          Best round: <span className="font-semibold text-ink">{stats.best.correct}/{stats.best.total}</span>
          {` · ${isMe ? 'your' : `${firstName}'s`} record`}
        </p>
      )}
    </RailCard>
  )
}

// ------------------------------------------------------- the challenge wall
//
// ONLY PUBLISHED RESULTS, and this is the same rule the winners podium follows
// for the same reason. A `results` row exists from the first time anybody looks
// at a leaderboard, INCLUDING the interim mid-challenge standings - so keying
// off "is there a result" would put a half-finished position on somebody's
// profile as a trophy. `winners_published_at` is an admin saying it is final.
export function ChallengeHistoryCard({ creatorId, isMe, firstName }) {
  const [rows, setRows] = useState(null)

  useEffect(() => {
    let alive = true
    supabase.from('results')
      .select('rank, challenges!inner(id, title, winners_published_at)')
      .eq('creator_id', creatorId)
      .not('challenges.winners_published_at', 'is', null)
      .lte('rank', 3)
      .order('rank')
      .limit(6)
      .then(({ data }) => { if (alive) setRows(data || []) })
    return () => { alive = false }
  }, [creatorId])

  if (!rows?.length) return null
  const wins = rows.filter((r) => r.rank === 1).length

  const MEDAL = { 1: 'text-amber-500', 2: 'text-gray-400', 3: 'text-orange-700' }

  return (
    <RailCard icon="trophy" title="On the podium" to="/challenges" linkLabel="Challenges">
      {wins > 0 && (
        <p className="mb-2.5 text-xs text-smoke">
          <span className="font-semibold text-ink">{wins}</span>
          {` ${wins === 1 ? 'win' : 'wins'} ${isMe ? 'so far' : `for ${firstName}`}`}
        </p>
      )}
      <ul className="space-y-1.5">
        {rows.map((r, i) => (
          <li key={`${r.challenges?.id}-${i}`} className="flex items-center gap-2">
            <Icon name="trophy" className={cx('h-3.5 w-3.5 shrink-0', MEDAL[r.rank] || 'text-gray-300')} />
            <span className="min-w-0 flex-1 truncate text-xs text-ink">{r.challenges?.title}</span>
            <span className="shrink-0 text-[11px] font-bold tabular-nums text-smoke">
              {r.rank === 1 ? '1st' : r.rank === 2 ? '2nd' : '3rd'}
            </span>
          </li>
        ))}
      </ul>
    </RailCard>
  )
}

export { RailCard }
