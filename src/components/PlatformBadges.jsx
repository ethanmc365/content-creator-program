// Small platform icons/badges (Instagram, TikTok, YouTube) shown on cards,
// leaderboards and profiles. Pure inline SVG - no icon library needed.
import { cx } from '../lib/utils'

// The official TikTok note-and-swoosh, on a 24x24 grid. Exported so the entry
// cards draw the exact same mark - the old hand-simplified path lost the offset
// swoosh and read as a broken glyph at large sizes.
export const TIKTOK_PATH =
  'M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z'

const ICONS = {
  Instagram: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M12 2.2c3.2 0 3.6 0 4.8.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.81s0 3.54-.07 4.81c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.64.07-4.81.07s-3.54 0-4.81-.07c-3.26-.15-4.77-1.7-4.92-4.92C2.2 15.54 2.2 15.17 2.2 12s0-3.54.07-4.81C2.42 3.96 3.94 2.42 7.19 2.27 8.46 2.21 8.84 2.2 12 2.2zm0 3.6a6.2 6.2 0 100 12.4 6.2 6.2 0 000-12.4zm0 2.2a4 4 0 110 8 4 4 0 010-8zm6.4-3.7a1.44 1.44 0 100 2.88 1.44 1.44 0 000-2.88z" />
    </svg>
  ),
  TikTok: (
    // Padded viewBox so the mark (which fills its full grid) matches the optical
    // size of the inset Instagram/YouTube glyphs.
    <svg viewBox="-1.5 -1.5 27 27" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d={TIKTOK_PATH} />
    </svg>
  ),
  YouTube: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M23 7.3a3 3 0 00-2.1-2.1C19 4.7 12 4.7 12 4.7s-7 0-8.9.5A3 3 0 001 7.3 31.2 31.2 0 00.5 12 31.2 31.2 0 001 16.7a3 3 0 002.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 002.1-2.1A31.2 31.2 0 0023.5 12 31.2 31.2 0 0023 7.3zM9.8 15.1V8.9L15.9 12l-6.1 3.1z" />
    </svg>
  ),
  Other: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.2 10.8a4 4 0 010 5.6l-3 3a4 4 0 01-5.6-5.6l1.5-1.5M10.8 13.2a4 4 0 010-5.6l3-3a4 4 0 015.6 5.6l-1.5 1.5" />
    </svg>
  ),
}

/**
 * Works out which platforms a creator is on (from their profile links)
 * and renders a row of small badges.
 */
export function platformsForProfile(profile) {
  const list = []
  if (profile?.instagram_url) list.push('Instagram')
  if (profile?.tiktok_url) list.push('TikTok')
  if (profile?.youtube_url) list.push('YouTube')
  return list
}

export default function PlatformBadges({ platforms = [], size = 'sm', className = '' }) {
  if (!platforms.length) return null
  return (
    <div className={cx('flex items-center gap-1.5', className)}>
      {platforms.map((p) => (
        <span
          key={p}
          title={p}
          className={cx(
            'inline-flex items-center justify-center rounded-full bg-cloud text-smoke',
            size === 'sm' ? 'h-7 w-7' : 'h-8 w-8'
          )}
        >
          {ICONS[p] || ICONS.Other}
        </span>
      ))}
    </div>
  )
}
