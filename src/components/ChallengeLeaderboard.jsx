import { Link } from 'react-router-dom'
import { Avatar } from './ui'
import Icon from './Icon'
import PlatformBadges from './PlatformBadges'
import { formatViews, cx } from '../lib/utils'

// THE LEADERBOARD, AS CREATORS SEE IT.
//
// Lifted out of ChallengeDetail unchanged, because it is now drawn in two
// places: the challenge page, and the picture an admin shares of the result.
// Those two must be the same board - a shared graphic that arranges the same
// numbers differently is a second design of the same thing, and it was drifting
// (its own row height, its own idea of where a voucher goes, the word "views"
// against every line).
//
// @param rows              results rows: { id, rank, creator_id, final_views, profiles }
// @param meId              highlight this creator's row as theirs
// @param participation     { threshold, prize } or null
// @param subCountByCreator entries posted per creator, for the voucher badge
// @param platformsFor      creatorId -> ['TikTok', ...]
// @param linkProfiles      false in a picture, where a link is just a colour
export default function ChallengeLeaderboard({
  rows = [], meId = null, participation = null, subCountByCreator = {},
  platformsFor = () => [], linkProfiles = true, wide = false, className = '',
}) {
  // A PICTURE HAS NO VIEWPORT. `hidden sm:inline-flex` asks the BROWSER's width,
  // not this element's, so a board photographed on a phone would lose its
  // voucher pills and platform icons and the shared result would depend on
  // which device the admin happened to be holding. `wide` states the answer.
  return (
    <div className={cx('overflow-hidden rounded-card border border-gray-100 shadow-card', className)}>
      {rows.map((r) => {
        const mine = meId && r.creator_id === meId
        const medal = { 1: '🥇', 2: '🥈', 3: '🥉' }[r.rank]
        const who = (
          <>
            <Avatar src={r.profiles?.photo_url} name={r.profiles?.name} size="sm" />
            <span className="truncate text-sm font-semibold hover:text-brand">
              {r.profiles?.name} {mine && <span className="ml-1 text-xs font-medium text-brand">(you)</span>}
            </span>
          </>
        )
        return (
          <div
            key={r.id ?? r.rank}
            className={cx(
              'flex items-center gap-4 border-b border-gray-50 py-4 last:border-0',
              wide ? 'px-8' : 'px-5 sm:px-8',
              mine && 'bg-brand-tint/60'
            )}
          >
            <span className={cx('w-10 text-center text-lg font-bold', r.rank <= 3 ? '' : 'text-smoke')}>
              {medal || r.rank}
            </span>
            {linkProfiles ? (
              <Link to={`/profile/${r.profiles?.id}`} className="flex min-w-0 flex-1 items-center gap-3">{who}</Link>
            ) : (
              <span className="flex min-w-0 flex-1 items-center gap-3">{who}</span>
            )}
            {/* Voucher badge: this creator posted enough videos to earn the
                participation prize. */}
            {participation && (subCountByCreator[r.creator_id] || 0) >= participation.threshold && (
              <span
                title={`Posted ${participation.threshold}+ videos`}
                className={cx('shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-green-50 px-2.5 py-1 text-[11px] font-semibold text-green-700', wide ? 'inline-flex' : 'hidden sm:inline-flex')}
              >
                <Icon name="ticket" className="h-3.5 w-3.5" /> {participation.prize}
              </span>
            )}
            {/* Only the platforms this creator actually submitted on. */}
            <PlatformBadges platforms={platformsFor(r.creator_id)} className={wide ? 'flex' : 'hidden sm:flex'} />
            <span className="w-24 text-right text-sm font-bold tabular-nums">{formatViews(r.final_views)}</span>
          </div>
        )
      })}
    </div>
  )
}
