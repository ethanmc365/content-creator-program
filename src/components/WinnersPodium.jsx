import { Link } from 'react-router-dom'
import { Avatar } from './ui'
import { TIKTOK_PATH, FACEBOOK_PATH } from './PlatformBadges'
import { detectPlatformFromUrl } from '../lib/videoPreview'
import { formatViews, cx } from '../lib/utils'

// The closing graphic for a finished challenge.
//
// It replaces a block that had drifted a long way from the rest of the platform:
// three h-28 slabs of solid orange shouting "TikTok" loud enough to bury the
// people who actually won, a heading nobody had asked for, and one <Link> around
// the whole card so no individual piece of it could ever be its own target.
//
// Everything here is a target now. The face opens that creator's profile, the
// small platform chip opens the video that won, and the space between them
// belongs to the challenge. Nothing is an anchor inside an anchor: the caller
// lays a stretched link UNDER this block and every control here stops the click
// from reaching it.

// Real metal, not three Tailwind ambers a shade apart. Each is a two-stop
// gradient with a lighter top edge, which is what reads as "polished" at this
// size - a flat fill just reads as a coloured box.
const MEDALS = {
  1: {
    label: '1st',
    ring: '#e0a92b',
    bar: 'linear-gradient(180deg,#fbdd7e 0%,#eebd45 45%,#cf9312 100%)',
    text: '#5b410a',
    height: 'h-14',
  },
  2: {
    label: '2nd',
    ring: '#b8c1cc',
    bar: 'linear-gradient(180deg,#eef1f5 0%,#cdd5de 45%,#a3adb9 100%)',
    text: '#404a56',
    height: 'h-10',
  },
  3: {
    label: '3rd',
    ring: '#bf7c46',
    bar: 'linear-gradient(180deg,#e2a774 0%,#c9814a 45%,#9d5f2e 100%)',
    text: '#4d2f14',
    height: 'h-7',
  },
}

// Beyond bronze there is no metal, so places 4+ get the brand instead of a
// fourth invented colour. Keeps a five-winner podium on-brand.
const PLAIN = {
  label: null,
  ring: '#f0c3ab',
  bar: 'linear-gradient(180deg,#fbd9c7 0%,#f5b795 45%,#e08a4e 100%)',
  text: '#7a3406',
  height: 'h-5',
}

const PLATFORM_ICON = {
  TikTok: <path d={TIKTOK_PATH} />,
  Instagram: (
    <path d="M12 2.2c3.2 0 3.6 0 4.8.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.81s0 3.54-.07 4.81c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.64.07-4.81.07s-3.54 0-4.81-.07c-3.26-.15-4.77-1.7-4.92-4.92C2.2 15.54 2.2 15.17 2.2 12s0-3.54.07-4.81C2.42 3.96 3.94 2.42 7.19 2.27 8.46 2.21 8.84 2.2 12 2.2zm0 3.6a6.2 6.2 0 100 12.4 6.2 6.2 0 000-12.4zm0 2.2a4 4 0 110 8 4 4 0 010-8zm6.4-3.7a1.44 1.44 0 100 2.88 1.44 1.44 0 000-2.88z" />
  ),
  YouTube: (
    <path d="M23 7.3a3 3 0 00-2.1-2.1C19 4.7 12 4.7 12 4.7s-7 0-8.9.5A3 3 0 001 7.3 31.2 31.2 0 00.5 12 31.2 31.2 0 001 16.7a3 3 0 002.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 002.1-2.1A31.2 31.2 0 0023.5 12 31.2 31.2 0 0023 7.3zM9.8 15.1V8.9L15.9 12l-6.1 3.1z" />
  ),
  Facebook: <path d={FACEBOOK_PATH} />,
}

const PLAY = <path d="M8 5.2v13.6a1 1 0 0 0 1.5.87l11-6.8a1 1 0 0 0 0-1.74l-11-6.8A1 1 0 0 0 8 5.2z" />

/** Stop a click reaching the card-wide stretched link underneath. */
const own = (e) => e.stopPropagation()

// The chip that used to be a 112px-tall orange billboard. Same brand face, same
// logo, one line high, and it says what it does ("Watch on TikTok") instead of
// just naming the app.
function VideoChip({ url, platform }) {
  const plat = platform || detectPlatformFromUrl(url)
  const icon = PLATFORM_ICON[plat] || PLAY
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={own}
      className="inline-flex items-center gap-1.5 rounded-full bg-brand px-2.5 py-1 text-[11px] font-semibold text-white transition-transform duration-150 hover:scale-105"
    >
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-3 w-3" aria-hidden>{icon}</svg>
      Watch
    </a>
  )
}

/**
 * @param winners  [{ rank, final_views, points, profiles, videoUrl, platform }]
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
  className = '',
}) {
  if (!winners.length) return null

  const isPoints = scoring === 'points'
  const unit = isPoints ? 'points' : 'views'
  const scoreOf = (w) => (isPoints ? (w.points ?? w.final_views ?? 0) : (w.final_views ?? 0))
  const fmt = (n) => (isPoints ? Number(n).toLocaleString() : formatViews(n))

  // Classic podium shape for the medals (2 | 1 | 3); anyone past bronze lines up
  // to the right in plain order rather than pretending to be a fourth step.
  const top = winners.filter((w) => w.rank <= 3)
  const rest = winners.filter((w) => w.rank > 3)
  const order = [top.find((w) => w.rank === 2), top.find((w) => w.rank === 1), top.find((w) => w.rank === 3)].filter(Boolean)

  const step = (w) => {
    const m = MEDALS[w.rank] || PLAIN
    const first = w.rank === 1
    return (
      <div key={w.rank} className="flex w-[5.5rem] flex-col items-center sm:w-24">
        <Link
          to={`/creators/${w.profiles?.id}`}
          onClick={own}
          className="block rounded-full transition-transform duration-150 hover:scale-105"
          title={`${w.profiles?.name || 'Creator'} - view profile`}
        >
          <span className="block rounded-full p-[3px]" style={{ background: m.ring }}>
            <Avatar src={w.profiles?.photo_url} name={w.profiles?.name} size={first ? 'lg' : 'md'} />
          </span>
        </Link>
        <p className="mt-2 w-full truncate text-center text-xs font-semibold text-ink">
          {w.profiles?.name?.split(' ')[0] || 'Creator'}
        </p>
        <p className="text-[11px] tabular-nums text-smoke">{fmt(scoreOf(w))} {unit}</p>
        {w.videoUrl && <div className="mt-1.5"><VideoChip url={w.videoUrl} platform={w.platform} /></div>}
        <div
          className={cx('mt-2 flex w-full items-start justify-center rounded-t-lg', m.height)}
          style={{ background: m.bar }}
        >
          <span className="pt-1 text-[11px] font-bold" style={{ color: m.text }}>{m.label || `${w.rank}th`}</span>
        </div>
      </div>
    )
  }

  return (
    <div className={cx('rounded-2xl bg-cloud/60 p-4', className)}>
      <p className="mb-4 text-center text-[11px] font-semibold uppercase tracking-widest text-smoke">Winners</p>

      <div className="flex items-end justify-center gap-2 sm:gap-4">{order.map(step)}</div>

      {/* Places four and beyond: a quiet row, still clickable, no fake podium. */}
      {rest.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-gray-200/70 pt-3">
          {rest.map((w) => (
            <div key={w.rank} className="flex items-center gap-2">
              <span className="w-5 text-right text-[11px] font-bold tabular-nums text-smoke">{w.rank}</span>
              <Link to={`/creators/${w.profiles?.id}`} onClick={own} className="transition-transform duration-150 hover:scale-105">
                <Avatar src={w.profiles?.photo_url} name={w.profiles?.name} size="xs" />
              </Link>
              <span className="text-xs font-medium text-ink">{w.profiles?.name?.split(' ')[0] || 'Creator'}</span>
              <span className="text-[11px] tabular-nums text-smoke">{fmt(scoreOf(w))}</span>
              {w.videoUrl && <VideoChip url={w.videoUrl} platform={w.platform} />}
            </div>
          ))}
        </div>
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
                  to={`/creators/${v.id}`}
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
          <p className="text-[10px] font-medium uppercase tracking-wide text-smoke">Entries</p>
        </div>
        <div>
          <p className="text-sm font-bold tabular-nums text-ink">{fmt(totalScore)}</p>
          <p className="text-[10px] font-medium uppercase tracking-wide text-smoke">Final {unit}</p>
        </div>
        <div>
          <p className="text-sm font-bold tabular-nums text-ink">{winners.length}</p>
          <p className="text-[10px] font-medium uppercase tracking-wide text-smoke">On the podium</p>
        </div>
      </div>
    </div>
  )
}
