import { Link } from 'react-router-dom'
import { Avatar } from './ui'
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
// @param startAt           first rank to draw. The challenge page puts a real
//                          podium above the board and passes 4, so the top
//                          three are not drawn twice in two different shapes.
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
}) {
  const tr = useT()

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

  const fmtScore = (v) => (scoreLabel === 'points' ? `${Number(v || 0).toLocaleString()}` : formatViews(v))

  return (
    <div className={cx('overflow-hidden rounded-card border border-gray-100 bg-white shadow-card', className)}>
      {slots.map(({ rank, row, prize }) => {
        const mine = meId && row?.creator_id === meId
        const tier = podiumTier(rank)
        const podium = rank <= 3
        const who = row && (
          <>
            <Avatar src={row.profiles?.photo_url} name={row.profiles?.name} size="sm" />
            <span className="truncate text-sm font-semibold hover:text-brand">
              {row.profiles?.name} {mine && <span className="ml-1 text-xs font-medium text-brand">{tr('(you)')}</span>}
            </span>
          </>
        )
        return (
          <div
            key={rank}
            className={cx(
              'flex items-center gap-3 border-b border-gray-50 py-3.5 last:border-0 sm:gap-4 sm:py-4',
              wide ? 'px-8' : 'px-4 sm:px-8',
              mine && 'bg-brand-tint/60',
              !row && 'bg-cloud/25',
            )}
          >
            {/* THE PLACE, AS A CHIP RATHER THAN A MEDAL EMOJI. The top three
                carry the brand ladder podiumTiers defines; everything below is
                a plain number, which is what stops a fifteen-place board from
                looking like fifteen awards. */}
            <span
              className={cx(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums sm:h-9 sm:w-9 sm:text-sm',
                podium ? '' : 'bg-cloud text-smoke',
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
              // AN OPEN PLACE, DRAWN AS AN OPEN PLACE. A dashed ring where the
              // face goes says "nobody is standing here" faster than any
              // sentence, and it is the same shape the live challenge card uses
              // for the identical idea.
              <span className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-brand/30">
                  <Icon name="plus" className="h-4 w-4 text-brand/50" />
                </span>
                <span className="truncate text-sm font-semibold text-smoke">{tr('This spot is up for grabs')}</span>
              </span>
            )}

            {/* WHAT THIS PLACE IS WORTH, AND WHAT THIS CREATOR ALSO EARNED,
                in ONE right-aligned column of a fixed width. On a taken row the
                prize is what that creator has won; on an open one it is what
                the reader is playing for. Same pill either way, because it is
                the same fact - and it starts at the same x on every row. */}
            <span className={cx(
              'w-40 shrink-0 flex-col items-end gap-1',
              wide ? 'flex' : 'hidden sm:flex',
            )}>
              {prize && (
                <span
                  title={tr('Prize for this place')}
                  className={cx(
                    'inline-flex max-w-full items-center gap-1 truncate rounded-full px-2.5 py-1 text-[11px] font-semibold',
                    row ? 'bg-brand text-white' : 'bg-brand-tint/70 text-brand',
                  )}
                >
                  <Icon name="trophy" className="h-3.5 w-3.5 shrink-0" /> {prize}
                </span>
              )}
              {/* Voucher badge: this creator posted enough videos to earn the
                  participation prize. */}
              {row && participation && (subCountByCreator[row.creator_id] || 0) >= participation.threshold && (
                <span
                  title={tr('Posted {n}+ videos', { n: participation.threshold })}
                  className="inline-flex max-w-full items-center gap-1 truncate rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700"
                >
                  <Icon name="ticket" className="h-3.5 w-3.5 shrink-0" /> {participation.prize}
                </span>
              )}
            </span>

            {/* Only the platforms this creator actually submitted on, in the
                platform's own colour - the grey set read as "unavailable". */}
            <span className={cx(
              'w-[4.5rem] shrink-0 items-center justify-end gap-1.5',
              wide ? 'flex' : 'hidden sm:flex',
            )}>
              {row && platformsFor(row.creator_id).map((p) => (
                <SocialMark key={p} brand={SOCIAL_BRAND[p] || 'link'} colored className="h-[18px] w-[18px]" />
              ))}
            </span>

            <span className="w-16 shrink-0 text-right sm:w-24">
              {row ? (
                <>
                  <span className="block text-sm font-bold tabular-nums">{fmtScore(row.final_views)}</span>
                  <span className="block text-[10px] uppercase tracking-wide text-smoke">{tr(scoreLabel === 'points' ? 'points' : 'views')}</span>
                  {/* ON A POINTS BOARD, THE VIEWS TOO (3 Sep 2026). The points
                      say who is winning; the views say whether the challenge
                      worked. `total_views` is written by the same rebuild that
                      writes the score, so the two can never disagree. */}
                  {scoreLabel === 'points' && row.total_views > 0 && (
                    <span className="block text-[10px] font-medium tabular-nums text-smoke/70">
                      {formatViews(row.total_views)} {tr('views')}
                    </span>
                  )}
                </>
              ) : (
                <span className="block text-sm font-bold tabular-nums text-gray-300">—</span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}

export { ordinalFor }
