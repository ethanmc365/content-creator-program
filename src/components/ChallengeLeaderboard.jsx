import { useState } from 'react'
import { PrizeText } from '../lib/prizeText'
import { Link } from 'react-router-dom'
import { Avatar, Modal } from './ui'
import Flame from './games/Flame'
import Icon from './Icon'
import SocialMark from './SocialMark'
import { podiumTier, ordinalFor, placeNumber } from '../lib/podiumTiers'
import { formatViews, cx } from '../lib/utils'
import { useT } from '../lib/i18n'

// THE LEADERBOARD, AS CREATORS SEE IT.
//
// Drawn in two places: the challenge page, and the picture an admin shares of
// the result. Those two must be the same board - a shared graphic that arranges
// the same numbers differently is a second design of the same thing, and it was
// drifting (its own row height, its own idea of where a voucher goes, the word
// "views" against every line).
//
// IT IS NEVER EMPTY, AND THAT IS THE POINT (1 Sep 2026).
//
// Ethan: "the leaderboard should show the placement or just say the spot is
// available if no one got it yet, also the prizes should show on the
// leaderboard so they see what they currently have or what they are working
// towards."
//
// A board that renders nothing until somebody has a logged view count is
// useless on exactly the day it matters most - the day the challenge opens, when
// every creator is deciding whether to bother. So the PRIZE STRUCTURE lays the
// board out: every paid place exists as a row from the first minute, holding
// its prize, and it is either taken by a creator or open. "1st - EUR 105 cash -
// up for grabs" is a reason to post. An empty rounded rectangle is not.
//
// The prize is on the ROW, not in a separate panel, for the same reason: the
// question a creator has is "what is the place I am in worth", and an answer
// two cards away is an answer they have to assemble themselves.
//
// @param rows              results rows: { id, rank, creator_id, final_views, profiles }
// @param prizes            [{ place, prize }] for THIS board - group prize or the challenge's
// @param meId              highlight this creator's row as theirs
// @param participation     { threshold, prize } or null
// @param subCountByCreator entries posted per creator, for the voucher badge
// @param platformsFor      creatorId -> ['TikTok', ...]
// @param linkProfiles      false in a picture, where a link is just a colour
// @param scoreLabel        'views' | 'points' - what the right-hand number is
// @param startAt           first rank to draw. Defaults to 1 and every caller
//                          now leaves it there: the challenge page draws a real
//                          podium above the board AND the full list under it,
//                          because a podium is a picture of a ranking's head
//                          rather than a replacement for its first three rows.
//
// EVERY COLUMN LINES UP DOWN THE BOARD (2 Sep 2026).
//
// Ethan: "the Tryp.com voucher ones currently are not lined up, so line them up
// to make sure the UI looks good."
//
// The prize pill, the voucher badge and the platform marks were inline siblings
// in one flex row, so each row's right-hand furniture started wherever the name
// before it happened to end - and rows differ in which of the three they even
// have. Fixed-width columns, right-aligned, so the prizes sit on one axis, the
// vouchers on another and the score on a third whether a row carries them or
// not.

const SOCIAL_BRAND = {
  Instagram: 'instagram', TikTok: 'tiktok', YouTube: 'youtube', Facebook: 'facebook',
}

export default function ChallengeLeaderboard({
  rows = [], prizes = [], meId = null, participation = null, subCountByCreator = {},
  platformsFor = () => [], linkProfiles = true, wide = false, scoreLabel = 'views',
  startAt = 1, className = '',
  // POSTING STREAKS AND VIDEO COUNTS (28 Sep 2026). `streaks` is creatorId ->
  // { weeks, live } from lib/postingStreak; drawn only while the challenge is
  // running (`showStreaks`), because a streak is about what happens next.
  streaks = null, showStreaks = false, showVideos = false,
}) {
  const tr = useT()
  const [aboutStreaks, setAboutStreaks] = useState(false)

  // The paid places, in order, ignoring the participation line (which is not a
  // rank and has its own row at the foot).
  const paidPlaces = prizes
    .map((p) => ({ n: placeNumber(p.place), prize: p.prize }))
    .filter((p) => p.n != null)
    .sort((a, b) => a.n - b.n)
  const prizeAt = new Map(paidPlaces.map((p) => [p.n, p.prize]))

  // Every rank that has to exist: the ones somebody is standing on, and every
  // paid place, taken or not. A challenge with no prize structure still draws
  // exactly the rows it has, which is the old behaviour.
  const deepest = Math.max(
    rows.reduce((m, r) => Math.max(m, Number(r.rank) || 0), 0),
    paidPlaces.reduce((m, p) => Math.max(m, p.n), 0),
  )
  const byRank = new Map(rows.map((r) => [Number(r.rank), r]))
  const slots = []
  for (let n = Math.max(1, startAt); n <= deepest; n += 1) slots.push({ rank: n, row: byRank.get(n) ?? null, prize: prizeAt.get(n) ?? null })

  if (slots.length === 0) return null

  // WHO HAS REACHED THE TAKING-PART VOUCHER (22 Sep 2026). Ethan: "ensure it
  // shows on the leaderboard who has reached the 10 euro participation voucher
  // for reaching 18 points." A reached row carries the badge at every width,
  // and a row on its way says how far it has to go. On an `outside_prizes`
  // challenge a paid place wins its place prize instead, so it gets no badge.
  //
  // THE TERMS NO LONGER HEAD THE BOARD (28 Sep 2026). There was a green banner
  // above the first row spelling out "Reach N points for a <prize>" with a
  // count of who had. Ethan: "I think we don't necessarily need to show 'Reach
  // 18 points for a EUR 10 Tryp.com voucher' above, because I think it is a
  // weird placement for it. It does show when someone earns a Tryp.com
  // voucher, which is great. We want to keep that, but just remove it from the
  // very top." The terms live on the brief and in the taking-part card; the
  // board keeps only the per-row badge and the "N points to the voucher" hint.
  const partScore = (row) => (participation?.basis === 'points'
    ? Number(row.final_views) || 0
    : subCountByCreator[row.creator_id] || 0)
  const reached = (row) => !!participation?.threshold && partScore(row) >= participation.threshold
  const voucherFor = (row, rank) => reached(row) && !(participation?.scope === 'outside_prizes' && prizeAt.has(rank))
  const unitWord = participation?.basis === 'points' ? tr('points') : tr('videos')

  const hasPrizes = paidPlaces.length > 0
  const fmtScore = (v) => (scoreLabel === 'points' ? `${Number(v || 0).toLocaleString()}` : formatViews(v))

  return (
    <div className={cx('overflow-hidden rounded-card border border-gray-100 bg-white shadow-card', className)}>
      {/* THE COLUMNS SAY WHAT THEY ARE (28 Sep 2026, evening). Ethan: "the UI
          of these still seems very crowded and hard to read or understand ...
          the way the cash, the streak, the video icons, points, and views show
          up, I think you can really work on improving that, making everything
          stand out better. We have some space there."
          Each fact has one column and one header, and they line up down the
          whole board: WHO (and under the name: where they post, how many
          videos, the streak, the voucher), the PRIZE, the POINTS, the VIEWS.
          On a phone the prize moves under the name and the numbers stack. */}
      <div className={cx(
        'items-center gap-4 border-b border-gray-100 bg-cloud/40 py-2 text-[10px] font-bold uppercase tracking-wider text-smoke',
        wide ? 'flex px-8' : 'hidden px-8 sm:flex',
      )}>
        <span className="w-9 shrink-0 text-center">#</span>
        <span className="min-w-0 flex-1">{tr('Creator')}</span>
        {hasPrizes && <span className="w-32 shrink-0 text-right">{tr('Prize')}</span>}
        <span className="w-20 shrink-0 text-right">{scoreLabel === 'points' ? tr('Points') : tr('Views')}</span>
        {scoreLabel === 'points' && <span className="w-20 shrink-0 text-right">{tr('Views')}</span>}
      </div>
      {slots.map(({ rank, row, prize }) => {
        const mine = meId && row?.creator_id === meId
        const tier = podiumTier(rank)
        const podium = rank <= 3
        const hasVoucher = row && voucherFor(row, rank)
        const togo = row && participation?.threshold && !reached(row) && partScore(row) > 0
          && !(participation.scope === 'outside_prizes' && prizeAt.has(rank))
          ? participation.threshold - partScore(row) : null
        const vids = subCountByCreator[row?.creator_id] || 0
        const plats = row ? platformsFor(row.creator_id) : []
        const st = showStreaks && row ? streaks?.get(row.creator_id) : null
        const streakChip = st?.weeks > 0 && (
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); e.stopPropagation(); setAboutStreaks(true) }}
            title={tr('{n}-week posting streak. What is this?', { n: st.weeks })}
            className={cx(
              'inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums transition-transform duration-200 hover:-translate-y-0.5',
              st.live ? 'bg-brand-tint text-brand' : 'bg-cloud text-smoke',
            )}
          >
            <Flame className="h-3.5 w-3.5" state={st.live ? 'lit' : 'ember'} />
            {st.weeks} {st.weeks === 1 ? tr('week') : tr('weeks')}
          </button>
        )
        const prizePill = prize && (
          <span
            title={tr('Prize for this place')}
            className={cx(
              'inline-flex max-w-full items-center gap-1 truncate rounded-full px-2.5 py-1 text-[11px] font-bold tabular-nums',
              row ? 'bg-brand text-white' : 'bg-brand-tint text-brand',
            )}
          >
            <Icon name="money" className="h-3.5 w-3.5 shrink-0" /> <PrizeText text={prize} />
          </span>
        )
        const who = row && (
          <>
            <Avatar src={row.profiles?.photo_url} name={row.profiles?.name} size="md" className="!h-10 !w-10 sm:!h-11 sm:!w-11" />
            <span className="min-w-0">
              <span className="block truncate text-sm font-semibold leading-tight hover:text-brand sm:text-[15px]">
                {row.profiles?.name} {mine && <span className="ml-1 text-xs font-medium text-brand">{tr('(you)')}</span>}
              </span>
              {/* THE SECOND LINE: where they post, how much, the streak, the voucher. */}
              <span className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-smoke">
                {plats.length > 0 && (
                  <span className="inline-flex items-center gap-1">
                    {plats.map((p) => (
                      <SocialMark key={p} brand={SOCIAL_BRAND[p] || 'link'} tile className="h-3.5 w-3.5" />
                    ))}
                  </span>
                )}
                {(showVideos || plats.length > 0) && vids > 0 && (
                  <span className="font-medium tabular-nums">{vids === 1 ? tr('1 video') : tr('{n} videos', { n: vids })}</span>
                )}
                {streakChip}
                {hasVoucher && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-1.5 py-0.5 font-semibold text-green-700">
                    <Icon name="ticket" className="h-3 w-3 shrink-0" /> <PrizeText text={participation.prize} />
                  </span>
                )}
                {togo != null && (
                  <span className="font-medium">
                    {tr('{n} {unit} to the voucher', { n: togo, unit: togo === 1 && participation.basis === 'points' ? tr('point') : unitWord })}
                  </span>
                )}
              </span>
              {prize && <span className={cx('mt-1.5', wide ? 'hidden' : 'block sm:hidden')}>{prizePill}</span>}
            </span>
          </>
        )
        return (
          <div
            key={rank}
            style={{
              animationDelay: `${Math.min(rank - startAt, 11) * 40}ms`,
              ...(podium && row && !mine ? { background: `linear-gradient(90deg, ${tier.disc}14, transparent 55%)` } : {}),
            }}
            className={cx(
              'animate-fade-up flex items-center gap-3 border-b border-gray-50 py-3 last:border-0 sm:gap-4 sm:py-3.5',
              wide ? 'px-8' : 'px-4 sm:px-8',
              mine && 'bg-brand-tint/60',
              !row && 'bg-cloud/25',
            )}
          >
            {/* THE PLACE, AS A CHIP. The top three carry the brand ladder
                podiumTiers defines; everything below is a plain number. */}
            <span
              className={cx(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums sm:h-9 sm:w-9 sm:text-sm',
                podium ? 'shadow-sm' : 'bg-cloud text-smoke',
                !row && 'opacity-60',
              )}
              style={podium ? { background: tier.disc, color: tier.ink } : undefined}
            >
              {rank}
            </span>

            {row ? (
              linkProfiles ? (
                <Link to={`/profile/${row.profiles?.id}`} className="flex min-w-0 flex-1 items-center gap-3">{who}</Link>
              ) : (
                <span className="flex min-w-0 flex-1 items-center gap-3">{who}</span>
              )
            ) : (
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-brand/30">
                  <Icon name="plus" className="h-4 w-4 text-brand/50" />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold text-smoke">{tr('This spot is up for grabs')}</span>
                  {prize && <span className={cx('mt-1.5', wide ? 'hidden' : 'block sm:hidden')}>{prizePill}</span>}
                </span>
              </span>
            )}

            {hasPrizes && (
              <span className={cx('w-32 shrink-0 justify-end', wide ? 'flex' : 'hidden sm:flex')}>
                {prizePill}
              </span>
            )}

            {/* THE SCORE. On a phone the views sit under the points; from sm
                they have a column of their own. */}
            <span className="w-16 shrink-0 text-right sm:w-20">
              {row ? (
                <>
                  <span className={cx('block font-bold tabular-nums leading-tight', podium ? 'text-lg text-brand' : 'text-base text-ink')}>
                    {fmtScore(row.final_views)}
                  </span>
                  {/* "1 POINTS" was on the live Spanish board: the unit agrees. */}
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-smoke">
                    {scoreLabel === 'points'
                      ? (Number(row.final_views) === 1 ? tr('point') : tr('points'))
                      : tr('views')}
                  </span>
                  {scoreLabel === 'points' && row.total_views > 0 && (
                    <span className={cx('mt-0.5 items-center justify-end gap-1 text-[11px] font-medium tabular-nums text-smoke', wide ? 'hidden' : 'flex sm:hidden')}>
                      <Icon name="eye" className="h-3 w-3" /> {formatViews(row.total_views)}
                    </span>
                  )}
                </>
              ) : (
                <span className="block text-sm font-bold tabular-nums text-gray-300">-</span>
              )}
            </span>
            {/* ON A POINTS BOARD, THE VIEWS TOO (3 Sep 2026): the points say who
                is winning, the views say whether the challenge worked. */}
            {scoreLabel === 'points' && (
              <span className={cx('w-20 shrink-0 items-center justify-end gap-1.5 text-sm font-semibold tabular-nums text-ink/70', wide ? 'flex' : 'hidden sm:flex')}>
                {row && row.total_views > 0
                  ? <><Icon name="eye" className="h-3.5 w-3.5 text-smoke" /> {formatViews(row.total_views)}</>
                  : <span className="text-gray-300">-</span>}
              </span>
            )}
          </div>
        )
      })}
      <Modal open={aboutStreaks} onClose={() => setAboutStreaks(false)} title={tr('Posting streaks')}>
        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-card bg-gradient-to-br from-brand to-brand-light p-5 text-white shadow-card">
            <Flame className="h-12 w-12 shrink-0" tone="warm" sparks />
            <p className="text-sm font-medium leading-relaxed">
              {tr('Post at least one video every 7 days and your streak grows by a week.')}
            </p>
          </div>
          <ul className="space-y-2.5 text-sm text-ink/85">
            <li className="flex gap-2.5">
              <Flame className="mt-0.5 h-5 w-5 shrink-0" />
              <span>{tr('A lit flame means you have posted in the last 7 days.')}</span>
            </li>
            <li className="flex gap-2.5">
              <Flame className="mt-0.5 h-5 w-5 shrink-0" state="ember" />
              <span>{tr('An unlit flame means your streak is still alive, but you need to post this week to keep it.')}</span>
            </li>
            <li className="flex gap-2.5">
              <Icon name="refresh" className="mt-0.5 h-5 w-5 shrink-0 text-smoke" />
              <span>{tr('Miss a whole week and it starts again from your next video.')}</span>
            </li>
          </ul>
          <p className="rounded-xl bg-cloud/70 px-4 py-3 text-xs text-smoke">
            {tr('Streaks count this challenge only, and show while it is running.')}
          </p>
        </div>
      </Modal>
    </div>
  )
}

export { ordinalFor }
