import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, Modal, Skeleton } from '../ui'
import Flame from './Flame'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// WHO ELSE IS ON A RUN.
//
// Ethan: "I want to see a streak leaderboard somewhere, showing everyone's
// current streaks ranked, perhaps it shows up as a popup card when I click on
// the card at the top showing streak info."
//
// A popup off the streak card is the right home for it, and not only because he
// asked: a streak is a private number until you can see somebody else's, and
// the card is where a person is already looking at theirs. Making it a separate
// page would mean nobody found it.
//
// IT IS A SEPARATE RPC, NOT `my_game_streak` IN A LOOP. That function WRITES -
// it spends freezes as a side effect of being read - so forty calls to draw a
// list would be forty writes. `streak_leaderboard` is a pure read that measures
// everybody's run in one set-based query.
//
// ONLY LIVE RUNS APPEAR. A board that lists everybody with a zero beside their
// name is a list of people who are not playing, which is the opposite of what
// this is for.
export default function StreakLeaderboard({ open, onClose, myId }) {
  const tr = useT()
  const [rows, setRows] = useState(null)

  useEffect(() => {
    if (!open) return undefined
    let alive = true
    supabase.rpc('streak_leaderboard', { p_limit: 50 }).then(({ data }) => {
      if (alive) setRows(data ?? [])
    })
    return () => { alive = false }
  }, [open])

  const mine = rows?.findIndex((r) => r.profile_id === myId) ?? -1

  return (
    <Modal open={open} onClose={onClose} title={tr("Streaks right now")} wide>
      {!rows ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="py-8 text-center text-sm text-smoke">
          {tr("Nobody has a run going yet. Play one of today&rsquo;s puzzles and you are top of this list.")}
        </p>
      ) : (
        <>
          <p className="mb-4 text-sm text-smoke">
            {tr("One travel game a day keeps a run alive - any of the daily puzzles, or any of the practice modes. Miss a day and a freeze covers it, if you have one left.")}
          </p>
          <ol className="space-y-1.5">
            {rows.map((r, i) => {
              const me = r.profile_id === myId
              return (
                <li
                  key={r.profile_id}
                  className={cx(
                    'flex items-center gap-3 rounded-xl px-3 py-2 transition-colors',
                    me ? 'bg-brand-tint/50 ring-1 ring-inset ring-brand/20' : 'hover:bg-cloud',
                  )}
                >
                  <span className={cx(
                    'w-5 shrink-0 text-right text-xs font-bold tabular-nums',
                    i === 0 ? 'text-brand' : 'text-gray-300',
                  )}>{i + 1}</span>
                  <Avatar src={r.photo_url} name={r.name} size="sm" />
                  <Link
                    to={`/profile/${r.profile_id}`}
                    onClick={onClose}
                    className="min-w-0 flex-1 truncate text-sm font-medium hover:text-brand"
                  >
                    {r.name}{me && <span className="ml-1.5 text-xs font-normal text-smoke">you</span>}
                  </Link>
                  {/* A COLD FLAME FOR A RUN THAT HAS NOT BEEN EARNED TODAY.
                      The run is still alive - the grace day holds it until
                      tomorrow - but showing it lit would tell somebody they had
                      already played when they had not. */}
                  <span className={cx('flex shrink-0 items-center gap-1.5', !r.played_today && 'opacity-45')}>
                    <Flame className="h-4 w-4" />
                    <span className="text-sm font-bold tabular-nums text-ink">{r.current_streak}</span>
                  </span>
                </li>
              )
            })}
          </ol>
          {mine === -1 && (
            <p className="mt-4 rounded-xl bg-cloud/60 px-4 py-3 text-xs text-smoke">
              {tr("You are not on the board yet. Play any travel game today and you will be tomorrow.")}
            </p>
          )}
        </>
      )}
    </Modal>
  )
}
