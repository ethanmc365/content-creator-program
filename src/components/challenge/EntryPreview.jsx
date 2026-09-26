import VideoThumb from '../VideoThumb'
import Icon from '../Icon'
import { cx, formatViews } from '../../lib/utils'

// THE NUMBERS ON THE PICTURE (26 Sep 2026).
//
// Ethan: "add the views, for example, on a nice UI or card that's actually
// getting displayed over the preview ... show clearly on each entry how many
// points I got if it's a points challenge."
//
// One cover, three facts laid on it: the views along the foot (the number every
// entry has), the points it earned in the top corner (only on a points
// challenge), and a star with the bonus it carries. The platform mark stays
// where VideoThumb puts it. Used by the creator's Entries tab and the admin
// results page, so both read an entry the same way.
export default function EntryPreview({
  submission: s,
  points = null, // number on a points challenge, null otherwise
  bonus = 0, // bonus points already landed on this entry
  onPlay,
  compact = false, // a small thumbnail beside a row, not a card cover
  className,
  thumbClassName,
}) {
  const hasViews = s.logged_views != null
  const Wrapper = onPlay ? 'button' : 'div'
  return (
    <Wrapper
      {...(onPlay ? { type: 'button', onClick: onPlay, 'aria-label': `Play ${s.profiles?.name || 'this'} entry` } : {})}
      className={cx('group/entry relative block w-full overflow-hidden text-left', className)}
    >
      <VideoThumb url={s.video_url} platform={s.platform} thumbnailUrl={s.thumbnail_url} className={thumbClassName} />

      {/* A scrim so white type reads on any frame, bright beach or dark club. */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/70 via-black/25 to-transparent" />

      {points != null && (
        <span
          className={cx(
            'pointer-events-none absolute inline-flex items-center gap-1 rounded-full font-bold tabular-nums shadow-card',
            compact ? 'left-1 top-1 px-1.5 py-0.5 text-[10px]' : 'left-2 top-2 px-2.5 py-1 text-[11px]',
            points > 0 ? 'bg-brand text-white' : 'bg-white/90 text-smoke',
          )}
        >
          {!compact && <Icon name="trophy" className="h-3 w-3" />}
          {points > 0 ? `+${points}${compact ? '' : ' pts'}` : compact ? '0' : '0 pts'}
        </span>
      )}

      <span className={cx('pointer-events-none absolute flex items-end justify-between gap-2', compact ? 'inset-x-1 bottom-1' : 'inset-x-2 bottom-2')}>
        <span className={cx('inline-flex min-w-0 items-center gap-1.5 rounded-full bg-black/45 text-white backdrop-blur-sm', compact ? 'px-1.5 py-0.5' : 'px-2.5 py-1')}>
          <Icon name="eye" className={cx('shrink-0', compact ? 'h-3 w-3' : 'h-3.5 w-3.5')} />
          <span className={cx('whitespace-nowrap font-bold tabular-nums', compact ? 'text-[11px]' : 'text-[13px]')}>
            {hasViews ? formatViews(s.logged_views) : compact ? '–' : 'Counting…'}
          </span>
          {hasViews && !compact && <span className="hidden text-[11px] font-medium text-white/80 sm:inline">views</span>}
        </span>
        {bonus > 0 && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-white px-2 py-1 text-[11px] font-bold text-brand shadow-card">
            <Icon name="star" className="h-3 w-3" />
            +{bonus}
          </span>
        )}
      </span>

    </Wrapper>
  )
}
