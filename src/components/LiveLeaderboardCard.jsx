import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence, useReducedMotion } from 'motion/react'
import { Avatar } from './ui'
import Icon from './Icon'
import { LiveDot } from './network/Motion'
import { useLiveLeaderboard } from '../lib/liveLeaderboard'
import { podiumTier, placeNumber } from '../lib/podiumTiers'
import { useAuth } from '../context/AuthContext'
import { formatViews, shortAgo, cx } from '../lib/utils'
import { useT } from '../lib/i18n'

// THE LEADERBOARD ITSELF, IN A CHAT (22 Sep 2026, migration 251).
//
// Ethan: "embed the actual leaderboard in the chats, so it looks really nice,
// it has animations and it would obviously update live when the views are
// synced." A picture of a board is out of date the hour after it is posted;
// this is the board, and it moves when the board moves:
//   - it arrives row by row;
//   - after a sync, rows SLIDE to their new places (a shared layout animation,
//     so an overtake is visible as an overtake) and a row that moved says by
//     how much;
//   - a score that changed pulses once, and counts to its new value;
//   - "updated 4m ago" beside a live dot says it is live and how fresh.
// Once the winners are published it says "Final" and stops pulsing.
//
// It carries its own background AND foreground (the lesson from PollCard): it
// renders inside rooms where your own messages are white-on-orange.

const SHOWN = 10

function Score({ value, points }) {
  // A score that changes counts to its new value and flashes once; the first
  // paint is just the number.
  const [shown, setShown] = useState(value)
  const [flash, setFlash] = useState(false)
  const prev = useRef(value)
  const reduced = useReducedMotion()
  useEffect(() => {
    const from = prev.current
    prev.current = value
    if (from === value) return undefined
    setFlash(true)
    const off = setTimeout(() => setFlash(false), 900)
    if (reduced) { setShown(value); return () => clearTimeout(off) }
    const t0 = performance.now()
    const dur = 700
    let raf = 0
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / dur)
      setShown(Math.round(from + (value - from) * k))
      if (k < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    // rAF does not run in a background tab: a timer makes sure the real number lands.
    const land = setTimeout(() => setShown(value), dur + 80)
    return () => { cancelAnimationFrame(raf); clearTimeout(land); clearTimeout(off) }
  }, [value, reduced])
  return (
    <span
      className={cx(
        'rounded-md px-1.5 py-0.5 text-sm font-bold tabular-nums text-ink transition-colors duration-700',
        flash ? 'bg-brand/15 text-brand' : 'bg-transparent',
      )}
    >
      {points ? Number(shown).toLocaleString() : formatViews(shown)}
    </span>
  )
}

function Movement({ from, to }) {
  if (!from || from === to) return null
  const up = to < from
  const n = Math.abs(from - to)
  return (
    <motion.span
      initial={{ opacity: 0, y: up ? 6 : -6 }}
      animate={{ opacity: 1, y: 0 }}
      className={cx('inline-flex items-center gap-0.5 text-[10px] font-bold tabular-nums', up ? 'text-brand' : 'text-smoke')}
      title={up ? `Up ${n}` : `Down ${n}`}
    >
      <svg viewBox="0 0 10 10" className={cx('h-2.5 w-2.5', !up && 'rotate-180')} aria-hidden>
        <path d="M5 2 9 7H1z" fill="currentColor" />
      </svg>
      {n}
    </motion.span>
  )
}

export default function LiveLeaderboardCard({ challengeId, groupId = null, compact = false }) {
  const tr = useT()
  const { user } = useAuth()
  const { status, challenge, rows, prevRanks, updatedAt } = useLiveLeaderboard(challengeId, groupId)
  const reduced = useReducedMotion()
  // "4m ago" has to move on its own between syncs.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [])

  // THE BOX MOUNTS ONCE AND NEVER AGAIN, WHATEVER `status` DOES NEXT (23 Sep
  // 2026). Ethan: "it just shows up as the leaderboard, and then it suddenly
  // shows the white box with the leaderboard in it." The loading skeleton used
  // to be a SEPARATE element with no motion of its own; the moment the query
  // resolved, React unmounted it and mounted this card fresh, which is why the
  // spring below appeared to fire out of nowhere partway through - it was
  // firing on schedule, on an element that had only just been born. The card
  // now springs in ONCE, on ITS OWN first mount, and loading/ready/gone are
  // three things it can say inside that same box rather than three different
  // boxes.
  if (status !== 'ready' && status !== 'loading') {
    return (
      <div className="w-full max-w-md rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-5 text-center text-sm text-smoke">
        {tr('This leaderboard is no longer available.')}
      </div>
    )
  }

  const loading = status === 'loading' || !challenge
  const points = challenge?.scoring === 'points'
  const final = !loading && !!challenge.winners_published_at
  const prizes = loading ? [] : (Array.isArray(challenge.prize_structure) ? challenge.prize_structure : [])
  const prizeAt = new Map(prizes.map((p, i) => [placeNumber(p.place) ?? i + 1, p.prize]).filter(([n]) => n))
  const top = loading ? [] : rows.slice(0, compact ? 5 : SHOWN)
  const more = loading ? 0 : Math.max(0, rows.length - top.length)
  const mine = !loading && user?.id ? rows.find((r) => r.creator_id === user.id) : null
  const mineShown = mine && top.some((r) => r.creator_id === mine.creator_id)
  const endsIn = !loading && challenge.end_date ? Math.ceil((new Date(challenge.end_date) - now) / 86_400_000) : null

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      className="w-full max-w-md overflow-hidden rounded-2xl border border-gray-100 bg-white text-ink shadow-card"
    >
      {/* ---------- The head ---------- */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#b03705] via-brand to-brand-light px-4 py-3.5 text-white">
        <span className="live-board-sheen pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/20">
            <Icon name="trophy" className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            {loading ? (
              <>
                <p className="h-3.5 w-2/3 animate-pulse rounded bg-white/25" />
                <p className="mt-2 h-3 w-1/3 animate-pulse rounded bg-white/20" />
              </>
            ) : (
              <>
                <p className="truncate text-sm font-bold leading-tight">{challenge.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] font-medium text-white/85">
                  {final ? (
                    <>{tr('Final leaderboard')}</>
                  ) : (
                    <>
                      <LiveDot tone="white" />
                      <span>{tr('Live leaderboard')}</span>
                      {updatedAt && <span>· {shortAgo(updatedAt) === 'now' ? tr('updated just now') : tr('updated {t} ago', { t: shortAgo(updatedAt) })}</span>}
                    </>
                  )}
                </p>
              </>
            )}
          </div>
          {!final && endsIn != null && endsIn >= 0 && (
            <span className="shrink-0 rounded-full bg-white/20 px-2 py-0.5 text-[10px] font-semibold">
              {endsIn === 0 ? tr('Ends today') : tr('{n}d left', { n: endsIn })}
            </span>
          )}
        </div>
      </div>

      {/* ---------- The rows ---------- */}
      {loading ? (
        <div className="space-y-2 p-3" aria-hidden>
          {[0, 1, 2, 3].map((i) => <div key={i} className="h-9 animate-pulse rounded-xl bg-cloud" />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-smoke">{tr('No entries on the board yet. Be the first.')}</p>
      ) : (
        <motion.ol layout className="space-y-1 p-2.5">
          <AnimatePresence initial>
            {top.map((r, i) => {
              const place = Number(r.rank)
              const tier = place <= 3 ? podiumTier(place) : null
              const me = r.creator_id === user?.id
              return (
                <motion.li
                  key={r.creator_id}
                  layout={reduced ? false : 'position'}
                  initial={reduced ? false : { opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{
                    layout: { type: 'spring', stiffness: 380, damping: 34 },
                    opacity: { duration: 0.3, delay: Math.min(i, 9) * 0.05 },
                    x: { type: 'spring', stiffness: 300, damping: 28, delay: Math.min(i, 9) * 0.05 },
                  }}
                  className={cx(
                    'flex items-center gap-2.5 rounded-xl px-2 py-1.5',
                    me ? 'bg-brand-tint/60 ring-1 ring-brand/30' : place <= 3 ? 'bg-cloud/70' : '',
                  )}
                >
                  <span
                    className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums"
                    style={tier ? { background: tier.disc, color: tier.ink, boxShadow: `inset 0 -2px 0 ${tier.edge}` } : undefined}
                  >
                    <span className={tier ? undefined : 'text-smoke'}>{place}</span>
                  </span>
                  <Link to={`/profile/${r.creator_id}`} className="shrink-0 transition-transform duration-150 hover:scale-110">
                    <Avatar src={r.profiles?.photo_url} name={r.profiles?.name} size="xs" />
                  </Link>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13px] font-semibold">{r.profiles?.name || tr('Creator')}</span>
                      <Movement from={prevRanks.get(r.creator_id)} to={place} />
                    </span>
                    {(points || prizeAt.get(place)) && (
                      <span className="block truncate text-[10px] text-smoke">
                        {points ? `${formatViews(r.total_views || 0)} ${tr('views')}` : ''}
                        {points && prizeAt.get(place) ? ' · ' : ''}
                        {prizeAt.get(place) ? <span className="font-semibold text-brand">{prizeAt.get(place)}</span> : null}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    <Score value={Number(r.final_views) || 0} points={points} />
                    <span className="block text-[9px] font-medium uppercase tracking-wide text-smoke">{points ? tr('pts') : tr('views')}</span>
                  </span>
                </motion.li>
              )
            })}
          </AnimatePresence>
        </motion.ol>
      )}

      {/* You, when you are further down than the card shows. */}
      {mine && !mineShown && (
        <div className="mx-2.5 mb-2 flex items-center gap-2.5 rounded-xl bg-brand-tint/60 px-2 py-1.5 ring-1 ring-brand/30">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center text-[11px] font-bold tabular-nums text-brand">{mine.rank}</span>
          <Avatar src={mine.profiles?.photo_url} name={mine.profiles?.name} size="xs" />
          <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{tr('You')}</span>
          <Score value={Number(mine.final_views) || 0} points={points} />
        </div>
      )}

      {loading ? (
        <div className="h-9 border-t border-gray-100" aria-hidden />
      ) : (
        <Link
          to={`/challenges/${challenge.id}?tab=leaderboard`}
          className="group flex items-center justify-between border-t border-gray-100 px-4 py-2.5 text-xs font-semibold text-brand transition-colors hover:bg-cloud/60"
        >
          <span>{more > 0 ? tr('See all {n} on the leaderboard', { n: rows.length }) : tr('Open the challenge')}</span>
          <Icon name="chevronRight" className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </Link>
      )}
    </motion.div>
  )
}
