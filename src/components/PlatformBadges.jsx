// Small platform icons/badges (Instagram, TikTok, YouTube) shown on cards,
// leaderboards and profiles. Pure inline SVG — no icon library needed.
import { cx } from '../lib/utils'

const ICONS = {
  Instagram: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M12 2.2c3.2 0 3.6 0 4.8.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.81s0 3.54-.07 4.81c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.64.07-4.81.07s-3.54 0-4.81-.07c-3.26-.15-4.77-1.7-4.92-4.92C2.2 15.54 2.2 15.17 2.2 12s0-3.54.07-4.81C2.42 3.96 3.94 2.42 7.19 2.27 8.46 2.21 8.84 2.2 12 2.2zm0 3.6a6.2 6.2 0 100 12.4 6.2 6.2 0 000-12.4zm0 2.2a4 4 0 110 8 4 4 0 010-8zm6.4-3.7a1.44 1.44 0 100 2.88 1.44 1.44 0 000-2.88z" />
    </svg>
  ),
  TikTok: (
    <svg viewBox="0 0 24 24" fill="currentColor" className="h-4 w-4" aria-hidden>
      <path d="M19.6 7.1a5.1 5.1 0 01-3.7-1.6 5.1 5.1 0 01-1.3-2.7h-3.2v12.9a2.7 2.7 0 11-2.7-2.7c.2 0 .5 0 .7.1V9.8a6 6 0 00-.7 0 6 6 0 106 6V10a8.3 8.3 0 004.9 1.6V8.3a5 5 0 01-.9-.1l.9-1.1z" />
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
