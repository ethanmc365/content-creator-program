import VideoThumb from '../VideoThumb'
import Icon from '../Icon'
import { cx, formatViews } from '../../lib/utils'
import { describePointParts } from '../../lib/entryPoints'

// THE NUMBERS ON THE PICTURE (26 Sep 2026), SMALLER (28 Sep 2026).
//
// Ethan: "add the views, for example, on a nice UI or card that's actually
// getting displayed over the preview ... show clearly on each entry how many
// points I got if it's a points challenge." It was made bigger on the morning
// of the 28th ("slightly bigger"), and that evening: "the points thing seems
// slightly too big on those cards on the thumbnails ... make it smaller and
// make the design better." So: one clear chip between the two sizes.
//
// So the cover carries two quiet facts - the points total in one small chip,
// the views along the foot - and WHAT the points were for moves off the
// picture into `PointParts`, under it, where there is room to say "+1 views ·
// +5 bonus" in words.
//
// `bare` is the admin results page: Ethan wanted the cover left clean there
// ("you don't need the views or the points over the thumbnail, because you have
// that all on the right side"), platform mark included, since the row names the
// platform with its own colour logo.
export default function EntryPreview({
  submission: s,
  // { total, views, bonus, other } on a points challenge, a bare number from an
  // older caller, or null when the challenge is not scored on points.
  points = null,
  onPlay,
  compact = false, // a small thumbnail beside a row, not a card cover
  bare = false, // just the picture
  className,
  thumbClassName,
}) {
  const hasViews = s.logged_views != null
  const total = points == null ? null : typeof points === 'number' ? points : points.total
  const Wrapper = onPlay ? 'button' : 'div'
  return (
    <Wrapper
      {...(onPlay ? { type: 'button', onClick: onPlay, 'aria-label': `Play ${s.profiles?.name || 'this'} entry` } : {})}
      className={cx('group/entry relative block w-full overflow-hidden text-left', className)}
    >
      <VideoThumb
        url={s.video_url}
        platform={s.platform}
        thumbnailUrl={s.thumbnail_url}
        videoId={s.platform === 'Facebook' ? s.platform_video_id : undefined}
        className={thumbClassName}
        mark={!bare}
      />

      {!bare && (
        <>
          {/* A scrim so white type reads on any frame, bright beach or dark club. */}
          <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

          {total != null && (
            <span
              className={cx(
                'pointer-events-none absolute left-2 top-2 inline-flex items-center rounded-full font-bold tabular-nums leading-none shadow-sm',
                compact ? 'px-1.5 py-[3px] text-[10px]' : 'px-2 py-[5px] text-[10px] sm:text-[11px]',
                total > 0 ? 'bg-brand text-white' : 'bg-white/90 text-smoke',
              )}
            >
              {total > 0 ? `+${total}` : '0'}
              <span className={cx('ml-0.5 font-semibold', total > 0 ? 'text-white/80' : 'text-smoke/80')}>pts</span>
            </span>
          )}

          <span className={cx('pointer-events-none absolute left-2 bottom-2 inline-flex min-w-0 items-center gap-1 rounded-full bg-black/40 text-white backdrop-blur-sm', compact ? 'px-1.5 py-0.5' : 'px-2 py-[3px]')}>
            <Icon name="eye" className="h-3 w-3 shrink-0" />
            <span className="whitespace-nowrap text-[11px] font-bold tabular-nums sm:text-xs">
              {hasViews ? formatViews(s.logged_views) : compact ? '–' : 'Counting…'}
            </span>
          </span>
        </>
      )}
    </Wrapper>
  )
}

// WHAT THE POINTS WERE FOR. Ethan: "it shows +1 and some of them +6 ... I think
// this should show +1 for views and +5 for bonus, etc." One chip per bucket,
// the views one quiet and the bonus one in the brand, so a bonus - the part a
// creator did something extra for - is the one that stands out.
export function PointParts({ points, className }) {
  const parts = typeof points === 'object' ? describePointParts(points) : []
  if (!parts.length) return null
  return (
    <div className={cx('flex flex-wrap items-center gap-1', className)}>
      {parts.map((p) => (
        <span
          key={p.key}
          className={cx(
            'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
            p.key === 'bonus' ? 'bg-brand-tint text-brand' : 'bg-cloud text-ink/75',
          )}
        >
          <Icon name={p.key === 'views' ? 'eye' : p.key === 'bonus' ? 'star' : 'plus'} className="h-3 w-3" />
          +{p.points} {p.label}
        </span>
      ))}
    </div>
  )
}
