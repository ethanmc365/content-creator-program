import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, Modal, Skeleton } from '../ui'
import Flame from './Flame'
import Icon from '../Icon'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// WHO ELSE IS ON A RUN, AND WHO HAS EVER HAD THE LONGEST ONE.
//
// Ethan: "I want to see a streak leaderboard somewhere, showing everyone's
// current streaks ranked, perhaps it shows up as a popup card when I click on
// the card at the top showing streak info."
//
// A popup off the streak card is the right home for it, and not only because he
// asked: a streak is a private number until you can see somebody else's, and
// the card is where a person is already looking at theirs.
//
// TWO BOARDS NOW (2 Sep 2026). Ethan: "as well as the current streaks I want an
// all-time highest streaks leaderboard, so we have those two - one with the
// current streak and one with the all-time highest, just so that when someone
// loses a streak it is still recorded."
//
// The second board is the one that makes the first one safe to care about. A
// current-run board erases a forty-day run the day it breaks: all that playing,
// and the product remembers none of it. There is a creator in production
// carrying a lost 42-day run that nothing anywhere could show her.
//
// NEITHER BOARD IS `my_game_streak` IN A LOOP. That function WRITES - it spends
// freezes as a side effect of being read - so forty calls to draw a list would
// be forty writes. Both RPCs are pure set-based reads (migration 166 for the
// second one).
//
// THE EXPLANATORY PARAGRAPH IS GONE. Ethan: "first remove this copy - 'One
// travel game a day keeps a run alive...'". It explained the rules of streaks
// on the one screen whose readers have demonstrably worked them out: everybody
// on this list is on a run.

const TABS = [
  { key: 'now', label: 'Current streaks', rpc: 'streak_leaderboard', value: 'current_streak' },
  { key: 'best', label: 'All-time best', rpc: 'best_streak_leaderboard', value: 'best_streak' },
]

export default function StreakLeaderboard({ open, onClose, myId }) {
  const tr = useT()
  const [tab, setTab] = useState('now')
  // Keyed by tab, so switching back to a board you have already opened is
  // instant and does not re-run the query.
  const [rows, setRows] = useState({})

  // Open on the current board every time. The record board is the interesting
  // one to visit and the wrong one to land on: "how am I doing" is the question
  // somebody presses a streak card to answer.
  useEffect(() => { if (open) setTab('now') }, [open])

  const active = TABS.find((t) => t.key === tab) || TABS[0]
  const list = rows[tab]

  useEffect(() => {
    if (!open || rows[tab] !== undefined) return undefined
    let alive = true
    supabase.rpc(active.rpc, { p_limit: 50 }).then(({ data }) => {
      if (alive) setRows((cur) => ({ ...cur, [tab]: data ?? [] }))
    })
    return () => { alive = false }
  }, [open, tab, active.rpc, rows])

  const mine = list?.findIndex((r) => r.profile_id === myId) ?? -1

  return (
    <Modal open={open} onClose={onClose} title={tr("Streaks")} wide>
      <div className="mb-4 flex gap-1.5 rounded-card border border-gray-100 bg-white p-1.5 shadow-card">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            aria-pressed={tab === t.key}
            className={cx(
              'flex-1 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors',
              tab === t.key ? 'bg-brand text-white' : 'text-smoke hover:bg-cloud hover:text-ink',
            )}
          >
            {tr(t.label)}
          </button>
        ))}
      </div>

      {!list ? (
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
        </div>
      ) : list.length === 0 ? (
        <p className="py-8 text-center text-sm text-smoke">
          {tab === 'best'
            ? tr("No runs on record yet. Play a travel game today and you start the book.")
            : tr("Nobody has a run going yet. Play one of today’s puzzles and you are top of this list.")}
        </p>
      ) : (
        <>
          <ol className="space-y-1.5">
            {list.map((r, i) => {
              const me = r.profile_id === myId
              const n = r[active.value]
              // ON THE RECORD BOARD, A FLAME THAT IS OUT IS THE POINT. The run
              // being over is exactly what this board exists to keep, so it is
              // drawn as finished rather than hidden or dressed up as live.
              const live = tab === 'best' ? r.current_streak === n && n > 0 : r.played_today
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
                  {/* On the record board, what somebody is on RIGHT NOW is the
                      second fact, and it is worth carrying: a 42 that is over
                      and a 42 that is still running are different stories. */}
                  {tab === 'best' && r.current_streak > 0 && r.current_streak !== n && (
                    <span className="hidden shrink-0 text-[11px] tabular-nums text-smoke sm:inline">
                      {tr('on {n} now', { n: r.current_streak })}
                    </span>
                  )}
                  <span className={cx('flex shrink-0 items-center gap-1.5', !live && 'opacity-45')}>
                    <Flame className="h-4 w-4" />
                    <span className="text-sm font-bold tabular-nums text-ink">{n}</span>
                  </span>
                </li>
              )
            })}
          </ol>
          {mine === -1 && (
            <p className="mt-4 flex items-start gap-2 rounded-xl bg-cloud/60 px-4 py-3 text-xs text-smoke">
              <Icon name="sparkles" className="mt-px h-3.5 w-3.5 shrink-0 text-brand" />
              {tr("You are not on the board yet. Play any travel game today and you will be tomorrow.")}
            </p>
          )}
        </>
      )}
    </Modal>
  )
}
