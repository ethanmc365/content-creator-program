import { Link } from 'react-router-dom'
import { Avatar } from './ui'
import Podium from './Podium'
import { formatViews, cx } from '../lib/utils'
import { ordinalFor } from '../lib/podiumTiers'
import { useT } from '../lib/i18n'

// The closing graphic for a finished challenge.
//
// It replaces a block that had drifted a long way from the rest of the platform:
// three h-28 slabs of solid orange shouting "TikTok" loud enough to bury the
// people who actually won, a heading nobody had asked for, and one <Link> around
// the whole card so no individual piece of it could ever be its own target.
//
// Everything here is a target now. The face opens that creator's profile and
// the space around it belongs to the challenge. Nothing is an anchor inside an
// anchor: the caller
// lays a stretched link UNDER this block and every control here stops the click
// from reaching it.

// NO VIDEO LINK BESIDE A NAME (22 Sep 2026). Ethan: every video a creator
// enters earns points, so one "Watch" chip per person pointed at a single video
// as if it were the one that won. On a points board no one video won anything.

/** Stop a click reaching the card-wide stretched link underneath. */
const own = (e) => e.stopPropagation()

/**
 * @param winners  [{ rank, final_views, points, profiles }]
 * @param scoring  'points' scores in points, anything else in views
 * @param voucherWinners [{ id, name, photo_url }] participation prize earners
 */
export default function WinnersPodium({
  winners = [],
  entries = 0,
  totalScore = 0,
  scoring = 'prize',
  voucherWinners = [],
  voucherPrize = null,
  // OPTIONAL: lay the board out from the paid places, like the public
  // leaderboard does - every place from 1 to `places` is drawn, and one nobody
  // holds yet is an open step (or row) carrying its prize. Without it only
  // the places somebody is standing on are drawn, which is right for an
  // archived result and for the share picture.
  places = 0,
  prizes = [],
  className = '',
}) {
  const tr = useT()
  if (!winners.length && !places) return null

  const isPoints = scoring === 'points'
  const unit = isPoints ? 'points' : 'views'
  const scoreOf = (w) => (isPoints ? (w.points ?? w.final_views ?? 0) : (w.final_views ?? 0))
  const fmt = (n) => (isPoints ? Number(n).toLocaleString() : formatViews(n))

  // THE TOP FIVE STAND ON THE PODIUM, THE NEXT FIVE LINE UP UNDER IT
  // (22 Sep 2026). Ethan: "that leaderboard graphic on the top should similarly
  // show the top 5 on the podium and the other 5 below" - the same shape the
  // challenge page's own board has had since 21 Sep. Podium draws 4 | 2 | 1 |
  // 3 | 5 when it is given five.
  const prizeAt = (n) => {
    const rows = Array.isArray(prizes) ? prizes : []
    const hit = rows.find((p, i) => (parseInt(String(p?.place ?? ''), 10) || i + 1) === n)
    return hit?.prize || ''
  }
  const byRank = new Map(winners.map((w) => [Number(w.rank), w]))
  const deepest = Math.max(places || 0, ...winners.map((w) => Number(w.rank) || 0))
  const slots = places
    ? Array.from({ length: deepest }, (_, i) => byRank.get(i + 1) || { rank: i + 1, empty: true })
    : winners
  const top = slots.filter((w) => w.rank <= 5)
  const rest = slots.filter((w) => w.rank > 5)

  // THE TOP THREE ARE THE SHARED PODIUM (components/Podium), which is the same
  // block the all-time leaderboard draws. It used to be a second drawing of the
  // same idea, with its own collar width, its own block heights and the word
  // "1st" where the other one prints "1". Ethan asked for them to be the same;
  // one component is the only version of "the same" that stays true.
  const steps = top.map((w) => (w.empty ? {
    rank: w.rank,
    empty: true,
    name: tr('Up for grabs'),
    prize: prizeAt(w.rank) || null,
  } : {
    rank: w.rank,
    id: w.profiles?.id,
    name: w.profiles?.name?.split(' ')[0] || 'Creator',
    photo_url: w.profiles?.photo_url,
    score: fmt(scoreOf(w)),
    unit,
    // On a points board the step carries the views as well, like the board
    // on the challenge page.
    sub: isPoints && w.total_views != null ? `${formatViews(w.total_views)} views` : null,
  }))

  return (
    <div className={cx('rounded-2xl bg-cloud/60 p-4', className)}>
      <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-widest text-smoke">{tr("Winners")}</p>

      <Podium places={steps} />

      {/* Sixth and beyond: a numbered list in two columns, still clickable,
          no fake podium steps. */}
      {rest.length > 0 && (
        <ol className="mx-auto mt-5 grid max-w-2xl gap-1.5 border-t border-gray-200/70 pt-4 sm:grid-cols-2 sm:gap-x-4">
          {rest.map((w) => (w.empty ? (
            <li key={w.rank} className="flex min-w-0 items-center gap-2.5 rounded-xl border border-dashed border-gray-200 bg-white/50 px-3 py-2">
              <span className="w-7 shrink-0 text-center text-xs font-bold tabular-nums text-brand/60">{ordinalFor(w.rank)}</span>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-brand/30" />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-smoke">{tr('Up for grabs')}</span>
              {prizeAt(w.rank) && <span className="shrink-0 text-xs font-semibold text-brand">{prizeAt(w.rank)}</span>}
            </li>
          ) : (
            <li key={w.rank} className="flex min-w-0 items-center gap-2.5 rounded-xl bg-white/80 px-3 py-2 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
              <span className="w-7 shrink-0 text-center text-xs font-bold tabular-nums text-brand">{ordinalFor(w.rank)}</span>
              <Link to={`/profile/${w.profiles?.id}`} onClick={own} className="shrink-0 transition-transform duration-150 hover:scale-105">
                <Avatar src={w.profiles?.photo_url} name={w.profiles?.name} size="xs" />
              </Link>
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{w.profiles?.name || 'Creator'}</span>
              <span className="shrink-0 text-xs font-semibold tabular-nums text-ink">
                {fmt(scoreOf(w))} <span className="font-normal text-smoke">{isPoints && scoreOf(w) === 1 ? 'point' : unit}</span>
              </span>
            </li>
          )))}
        </ol>
      )}

      {/* The participation voucher, which until now was a number nobody could
          see the people behind. */}
      {voucherWinners.length > 0 && (() => {
        // A face row has to survive a challenge with forty qualifiers as well as
        // one with three, so it shows a dozen and counts the rest. And the
        // heading has to survive any prize, or none: "for everyone here" only
        // makes sense once a prize has been named.
        const SHOWN = 12
        const shown = voucherWinners.slice(0, SHOWN)
        const extra = voucherWinners.length - shown.length
        return (
          <div className="mt-4 rounded-xl border border-brand/15 bg-brand-tint/40 px-3 py-2.5">
            <p className="mb-2 text-balance text-center text-[10px] font-semibold uppercase tracking-widest text-brand">
              {voucherPrize ? `${voucherPrize} for everyone here` : 'Everyone here earned the participation prize'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-1.5">
              {shown.map((v) => (
                <Link
                  key={v.id}
                  to={`/profile/${v.id}`}
                  onClick={own}
                  title={v.name}
                  className="transition-transform duration-150 hover:scale-110"
                >
                  <Avatar src={v.photo_url} name={v.name} size="xs" />
                </Link>
              ))}
              {extra > 0 && (
                <span className="ml-0.5 text-[11px] font-semibold tabular-nums text-brand">+{extra}</span>
              )}
            </div>
          </div>
        )
      })()}

      <div className="mt-4 flex items-center justify-center gap-6 border-t border-gray-200/70 pt-3 text-center">
        <div>
          <p className="text-sm font-bold tabular-nums text-ink">{entries}</p>
          <p className="text-[10px] font-medium uppercase tracking-wide text-smoke">{tr("Entries")}</p>
        </div>
        <div>
          {/* TOTAL VIEWS, WHATEVER THE SCORING (22 Sep 2026). Every caller
              passes the summed VIEWS here, and it was printed as points and
              labelled "Final points" - a number that means nothing. It is the
              reach of the whole challenge so far and moves with every sync. */}
          <p className="text-sm font-bold tabular-nums text-ink">{formatViews(totalScore)}</p>
          <p className="text-[10px] font-medium uppercase tracking-wide text-smoke">{tr("Total views")}</p>
        </div>
        <div>
          <p className="text-sm font-bold tabular-nums text-ink">{winners.length}</p>
          <p className="text-[10px] font-medium uppercase tracking-wide text-smoke">{places ? tr('Places taken') : tr("On the podium")}</p>
        </div>
      </div>
    </div>
  )
}
