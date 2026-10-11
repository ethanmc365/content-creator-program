import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence, LayoutGroup, useReducedMotion } from 'motion/react'
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

// THE PODIUM, LIVE (12 Oct 2026). Ethan: "We also have the podium image and the board image ... you could even make them
// dynamic, kind of like how the live leaderboard works." The top three stand on their steps, second-first-third, and when
// a sync swaps two of them the people MOVE to their new step (a shared layout animation keyed on the creator) rather than
// the names changing under still pictures. Used at the head of the live board and, larger, as the live podium card.
const STEP_H = { 1: [64, 84], 2: [44, 60], 3: [30, 42] }
function LivePodium({ rows, points, big = false, prizeAt, userId }) {
  const tr = useT()
  const reduced = useReducedMotion()
  const top = [rows.find((r) => Number(r.rank) === 2), rows.find((r) => Number(r.rank) === 1), rows.find((r) => Number(r.rank) === 3)]
  // Two cards for the same challenge in one room must not trade people between them: the ids are this card's own.
  const group = useId()
  if (!top[1]) return null
  return (
    <LayoutGroup id={group}>
    <div className={cx('grid grid-cols-3 items-end gap-2 px-3', big ? 'pt-5' : 'pt-4')}>
      {top.map((r, slot) => {
        const place = slot === 1 ? 1 : slot === 0 ? 2 : 3
        const tier = podiumTier(place)
        const h = STEP_H[place][big ? 1 : 0]
        return (
          <div key={place} className="flex min-w-0 flex-col items-center">
            {r ? (
              <motion.div
                key={r.creator_id}
                layoutId={reduced ? undefined : `lb-podium-${r.creator_id}`}
                initial={reduced ? false : { opacity: 0, y: 12, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ type: 'spring', stiffness: 320, damping: 28, delay: reduced ? 0 : (3 - place) * 0.08 }}
                className="flex w-full min-w-0 flex-col items-center"
              >
                <Link to={`/profile/${r.creator_id}`} className="relative transition-transform duration-200 hover:scale-105">
                  {place === 1 && <Icon name="trophy" className="absolute -top-4 left-1/2 h-4 w-4 -translate-x-1/2 text-brand" />}
                  <span className="block rounded-full p-[3px]" style={{ background: tier.bar }}>
                    <span className="block rounded-full bg-white p-[2px]">
                      <Avatar src={r.profiles?.photo_url} name={r.profiles?.name} size={big ? (place === 1 ? 'lg' : 'md') : (place === 1 ? 'md' : 'sm')} />
                    </span>
                  </span>
                </Link>
                <span className={cx('mt-1.5 w-full truncate text-center font-semibold', big ? 'text-[13px]' : 'text-[12px]', r.creator_id === userId && 'text-brand')}>
                  {r.creator_id === userId ? tr('You') : (r.profiles?.name || tr('Creator'))}
                </span>
                <Score value={Number(r.final_views) || 0} points={points} />
              </motion.div>
            ) : <span className="mb-1 text-[11px] text-gray-300">-</span>}
            <div className="mt-1.5 flex w-full flex-col items-center justify-start rounded-t-xl pt-1.5" style={{ height: h, background: tier.bar, boxShadow: `inset 0 -3px 0 ${tier.edge}` }}>
              <span className="text-sm font-black tabular-nums" style={{ color: tier.ink }}>{place}</span>
              {big && prizeAt.get(place) && <span className="max-w-full truncate px-1 text-[10px] font-bold" style={{ color: tier.ink }}>{prizeAt.get(place)}</span>}
            </div>
          </div>
        )
      })}
    </div>
    </LayoutGroup>
  )
}

export default function LiveLeaderboardCard({ challengeId, groupId = null, compact = false, view = 'board' }) {
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

  // THE BOX MOUNTS ONCE AND NEVER AGAIN, WHATEVER `status` DOES NEXT (23 Sep 2026): loading, ready and gone are three
  // things the same box can say, so the spring fires once, on its own first mount.
  if (status !== 'ready' && status !== 'loading') {
    return (
      <div className="w-full max-w-md rounded-2xl border border-dashed border-gray-200 bg-white px-4 py-5 text-center text-sm text-smoke">
        {tr('This leaderboard is no longer available.')}
      </div>
    )
  }

  const podiumOnly = view === 'podium'
  const loading = status === 'loading' || !challenge
  const points = challenge?.scoring === 'points'
  const final = !loading && !!challenge.winners_published_at
  const prizes = loading ? [] : (Array.isArray(challenge.prize_structure) ? challenge.prize_structure : [])
  const prizeAt = new Map(prizes.map((p, i) => [placeNumber(p.place) ?? i + 1, p.prize]).filter(([n]) => n))
  // The podium carries the top three; the rows below start at fourth.
  const hasPodium = !loading && rows.some((r) => Number(r.rank) === 1)
  const below = loading ? [] : rows.filter((r) => !hasPodium || Number(r.rank) > 3)
  const top = podiumOnly ? [] : below.slice(0, compact ? 4 : SHOWN - 3)
  const shownIds = new Set([...top.map((r) => r.creator_id), ...(hasPodium ? rows.filter((r) => Number(r.rank) <= 3).map((r) => r.creator_id) : [])])
  const mine = !loading && user?.id ? rows.find((r) => r.creator_id === user.id) : null
  const mineShown = mine && shownIds.has(mine.creator_id)
  const endsIn = !loading && challenge.end_date ? Math.ceil((new Date(challenge.end_date) - now) / 86_400_000) : null

  return (
    <motion.div
      initial={reduced ? false : { opacity: 0, y: 14, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      className="relative w-full max-w-md overflow-hidden rounded-2xl border border-gray-100 bg-white text-ink shadow-card"
    >
      {/* ---------- The head (12 Oct 2026): white, the brand as a band and a glyph, not a whole orange card. ---------- */}
      <span aria-hidden className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-brand via-brand-light to-brand" />
      <div className="relative px-4 pb-1 pt-4">
        <div className="flex items-start gap-3">
          <Icon name={podiumOnly ? 'trophy' : 'chart'} className="mt-0.5 h-6 w-6 shrink-0 text-brand" />
          <div className="min-w-0 flex-1">
            {loading ? (
              <>
                <p className="h-3.5 w-2/3 animate-pulse rounded bg-cloud" />
                <p className="mt-2 h-3 w-1/3 animate-pulse rounded bg-cloud" />
              </>
            ) : (
              <>
                <p className="truncate text-[15px] font-bold leading-tight">{challenge.title}</p>
                <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11px] font-medium text-smoke">
                  {final ? (
                    <span className="font-semibold text-brand">{podiumOnly ? tr('The winners') : tr('Final leaderboard')}</span>
                  ) : (
                    <>
                      <LiveDot />
                      <span className="font-semibold text-brand">{podiumOnly ? tr('Live podium') : tr('Live leaderboard')}</span>
                      {updatedAt && <span>· {shortAgo(updatedAt) === 'now' ? tr('updated just now') : tr('updated {t} ago', { t: shortAgo(updatedAt) })}</span>}
                    </>
                  )}
                </p>
              </>
            )}
          </div>
          {!final && endsIn != null && endsIn >= 0 && (
            <span className="shrink-0 rounded-full bg-brand px-2.5 py-0.5 text-[10px] font-bold text-white">
              {endsIn === 0 ? tr('Ends today') : tr('{n}d left', { n: endsIn })}
            </span>
          )}
        </div>
      </div>

      {/* ---------- The podium, then the rows ---------- */}
      {loading ? (
        <div className="space-y-2 p-3" aria-hidden>
          <div className="mx-auto h-24 w-2/3 animate-pulse rounded-xl bg-cloud" />
          {[0, 1, 2].map((i) => <div key={i} className="h-9 animate-pulse rounded-xl bg-cloud" />)}
        </div>
      ) : rows.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-smoke">{tr('No entries on the board yet. Be the first.')}</p>
      ) : (
        <>
          {hasPodium && (
            <div className={cx('border-b border-gray-50', podiumOnly ? 'pb-0' : 'pb-0')}>
              <LivePodium rows={rows} points={points} big={podiumOnly} prizeAt={prizeAt} userId={user?.id} />
            </div>
          )}
          {top.length > 0 && (
            <motion.ol layout className="space-y-1 p-2.5">
              <AnimatePresence initial>
                {top.map((r, i) => {
                  const place = Number(r.rank)
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
                        opacity: { duration: 0.3, delay: Math.min(i, 9) * 0.05 + 0.2 },
                        x: { type: 'spring', stiffness: 300, damping: 28, delay: Math.min(i, 9) * 0.05 + 0.2 },
                      }}
                      className={cx('flex items-center gap-2.5 rounded-xl px-2 py-1.5', me ? 'bg-brand-tint/60 ring-1 ring-brand/30' : 'odd:bg-cloud/50')}
                    >
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold tabular-nums text-smoke">{place}</span>
                      <Link to={`/profile/${r.creator_id}`} className="shrink-0 transition-transform duration-150 hover:scale-110">
                        <Avatar src={r.profiles?.photo_url} name={r.profiles?.name} size="xs" />
                      </Link>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-semibold">{me ? tr('You') : (r.profiles?.name || tr('Creator'))}</span>
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
        </>
      )}

      {/* You, when you are further down than the card shows. */}
      {mine && !mineShown && (
        <div className="mx-2.5 mb-2 mt-1 flex items-center gap-2.5 rounded-xl bg-brand-tint/60 px-2 py-1.5 ring-1 ring-brand/30">
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
          <span>{rows.length > shownIds.size ? tr('See all {n} on the leaderboard', { n: rows.length }) : tr('Open the challenge')}</span>
          <Icon name="chevronRight" className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
        </Link>
      )}
    </motion.div>
  )
}
