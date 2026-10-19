import { Link } from 'react-router-dom'
import { useIsMobile } from '../lib/useKeyboardInset'
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

// NO VIDEO LINK BESIDE A NAME. The team: every video a creator enters earns points, so one "Watch" chip per person
// pointed at a single video as if it were the one that won. On a points board no one video won anything.

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
  // A full-width card: the list under the podium goes into two columns.
  wide = false,
  // Where "See the full leaderboard" goes; nothing when it is not given.
  boardHref = null,
  className = '',
}) {
  const tr = useT()
  const isMobile = useIsMobile()
  if (!winners.length && !places) return null

  const isPoints = scoring === 'points'
  const scoreOf = (w) => (isPoints ? (w.points ?? w.final_views ?? 0) : (w.final_views ?? 0))
  const fmt = (n) => (isPoints ? Number(n).toLocaleString() : formatViews(n))

  // THE TOP FIVE STAND ON THE PODIUM, THE NEXT FIVE LINE UP UNDER IT. - the same shape the challenge page's own board
  // has had since 21 Sep. Podium draws 4 | 2 | 1 | 3 | 5 when it is given five.
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
  // THREE STEPS ON A PHONE. Five steps in 343px squeezed names and scores into each other on the results page ("you
  // can't even read their name"). Fourth and fifth join the list under the podium instead.
  const podiumDepth = isMobile ? 3 : 5
  const top = slots.filter((w) => w.rank <= podiumDepth)
  const rest = slots.filter((w) => w.rank > podiumDepth)

  // THE TOP THREE ARE THE SHARED PODIUM (components/Podium), which is the same block the all-time leaderboard draws. It
  // used to be a second drawing of the same idea, with its own collar width, its own block heights and the word "1st"
  // where the other one prints "1". The team asked for them to be the same; one component is the only version of "the
  // same" that stays true.
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
    unit: isPoints ? (scoreOf(w) === 1 ? tr('point') : tr('points')) : tr('views'),
    // On a points board the step carries the views as well, like the board
    // on the challenge page.
    sub: isPoints && w.total_views != null ? `${formatViews(w.total_views)} ${tr('views')}` : null,
  }))

  return (
    <div className={cx('rounded-2xl bg-cloud/60 p-3 sm:p-4', className)}>
      <p className="mb-4 text-center text-xs font-semibold uppercase tracking-widest text-smoke">{tr("Winners")}</p>

      <Podium places={steps} />

      {/* Sixth and beyond: a numbered list, still clickable, no fake podium steps. WIDE (a full-width card) puts it in
          two columns, and an odd last row spans both so the tenth place is not left hanging on the left on its own;
          a half-width card keeps one column, because two columns there cut every name to its first letter. */}
      {rest.length > 0 && (
        <ol className={cx('mx-auto mt-5 grid gap-1.5 border-t border-gray-200/70 pt-4', wide ? 'max-w-3xl sm:grid-cols-2 sm:gap-x-3' : 'max-w-xl')}>
          {rest.map((w, i) => {
            const spanAll = wide && rest.length % 2 === 1 && i === rest.length - 1
            const rowCls = cx('flex min-w-0 items-center gap-2 rounded-xl px-2.5 py-2 sm:gap-3 sm:px-3', spanAll && 'sm:col-span-2')
            if (w.empty) {
              return (
                <li key={w.rank} className={cx(rowCls, 'border border-dashed border-gray-200 bg-white/50')}>
                  <span className="w-7 shrink-0 text-center text-xs font-bold tabular-nums text-brand/60">{ordinalFor(w.rank)}</span>
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-brand/30" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-smoke">{tr('Up for grabs')}</span>
                  {prizeAt(w.rank) && <span className="shrink-0 text-xs font-semibold text-brand">{prizeAt(w.rank)}</span>}
                </li>
              )
            }
            const score = scoreOf(w)
            return (
              <li key={w.rank} className={cx(rowCls, 'bg-white shadow-[0_1px_2px_rgba(0,0,0,0.04)] animate-fade-up')} style={{ animationDelay: `${0.04 * i + 0.3}s` }}>
                <span className="w-6 shrink-0 text-center text-xs font-bold tabular-nums text-smoke sm:w-7">{ordinalFor(w.rank)}</span>
                <Link
                  to={`/profile/${w.profiles?.id}`}
                  onClick={own}
                  className="group/row flex min-w-0 flex-1 items-center gap-2.5"
                >
                  <Avatar src={w.profiles?.photo_url} name={w.profiles?.name} size="sm" className="transition-transform duration-150 group-hover/row:scale-105" />
                  <span className="min-w-0 flex-1 break-words text-sm font-semibold leading-tight text-ink transition-colors line-clamp-2 group-hover/row:text-brand">{w.profiles?.name || 'Creator'}</span>
                </Link>
                <span className="shrink-0 text-right leading-tight">
                  <span className="block text-sm font-bold tabular-nums text-brand">
                    {fmt(score)} <span className="text-xs font-semibold">{isPoints ? (score === 1 ? tr('point') : tr('points')) : tr('views')}</span>
                  </span>
                  {isPoints && w.total_views != null && (
                    <span className="block text-xs font-medium tabular-nums text-smoke">{formatViews(w.total_views)} {tr('views')}</span>
                  )}
                </span>
              </li>
            )
          })}
        </ol>
      )}

      {/* The participation voucher, which until now was a number nobody could
          see the people behind. */}
      {voucherWinners.length > 0 && (() => {
        // A face row has to survive a challenge with forty qualifiers as well as
        // one with three, so it shows a dozen and counts the rest. And the
        // heading has to survive any prize, or none: "for everyone here" only
        // makes sense once a prize has been named.
        const SHOWN = wide ? 20 : 12
        const shown = voucherWinners.slice(0, SHOWN)
        const extra = voucherWinners.length - shown.length
        return (
          <div className="mt-4 rounded-xl border border-gray-100 bg-white px-3 py-3">
            {/* WHO THE TAKING-PART PRIZE WENT TO, and how many. "For everyone here" was wrong on a challenge that pays
                it outside the prize places: the people on the podium won their place prize instead. */}
            <p className="mb-2.5 text-balance text-center text-xs font-semibold text-ink">
              {voucherPrize
                ? <>{voucherPrize} <span className="font-medium text-smoke">· {voucherWinners.length === 1 ? tr('1 creator earned it') : tr('{n} creators earned it', { n: voucherWinners.length })}</span></>
                : tr('Everyone here earned the participation prize')}
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
                  <Avatar src={v.photo_url} name={v.name} size="sm" />
                </Link>
              ))}
              {extra > 0 && (
                <span className="ml-0.5 text-[11px] font-semibold tabular-nums text-brand">+{extra}</span>
              )}
            </div>
          </div>
        )
      })()}

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-gray-200/70 pt-3 text-center">
        <div>
          <p className="text-base font-bold tabular-nums text-ink">{Number(entries).toLocaleString()}</p>
          <p className="text-xs font-medium text-smoke">{tr("Entries")}</p>
        </div>
        <div>
          {/* TOTAL VIEWS, WHATEVER THE SCORING. Every caller passes the summed VIEWS here. */}
          <p className="text-base font-bold tabular-nums text-ink">{formatViews(totalScore)}</p>
          <p className="text-xs font-medium text-smoke">{tr("Total views")}</p>
        </div>
        <div>
          <p className="text-base font-bold tabular-nums text-ink">{winners.length}</p>
          <p className="text-xs font-medium text-smoke">{places ? tr('Places taken') : tr("Prize winners")}</p>
        </div>
      </div>
      {boardHref && (
        <div className="mt-3 flex justify-center">
          <Link
            to={boardHref}
            onClick={own}
            className="inline-flex items-center gap-1.5 rounded-full bg-white px-4 py-2 text-sm font-semibold text-brand shadow-sm transition-transform duration-150 hoverable:hover:-translate-y-0.5"
          >
            {tr('See the full leaderboard')} <span aria-hidden>→</span>
          </Link>
        </div>
      )}
    </div>
  )
}
