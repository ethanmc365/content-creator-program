import { detectPlatformFromUrl } from '../lib/videoPreview'
import { cx } from '../lib/utils'

// The face of a submitted entry. Deliberately no thumbnail fetch (Instagram
// needs a token we don't have and the others were inconsistent). Every face is
// the single Tryp.com brand orange with white content - the only thing that
// changes per platform is the logo + name. That platform mark sits big and
// centred, right across the card, and IS the play control: the caller wraps this
// whole block in a button that opens the inline player. The caption + "Open Link"
// button live below on the card and are unchanged.
//
// Pure visual block - the caller wraps it in its own button/link so we never nest
// anchors.

// One warm brand-orange face for every platform, with a soft highlight for depth.
const BRAND_FACE = 'bg-[linear-gradient(140deg,#e35410_0%,#d94407_55%,#c23d06_100%)]'
const WARM_GLOW = 'radial-gradient(circle at 82% 16%, rgba(255,255,255,0.22), transparent 60%)'

const PLATFORMS = {
  Instagram: {
    label: 'Instagram',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full" aria-hidden>
        <path d="M12 2.2c3.2 0 3.6 0 4.8.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.81s0 3.54-.07 4.81c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.64.07-4.81.07s-3.54 0-4.81-.07c-3.26-.15-4.77-1.7-4.92-4.92C2.2 15.54 2.2 15.17 2.2 12s0-3.54.07-4.81C2.42 3.96 3.94 2.42 7.19 2.27 8.46 2.21 8.84 2.2 12 2.2zm0 3.6a6.2 6.2 0 100 12.4 6.2 6.2 0 000-12.4zm0 2.2a4 4 0 110 8 4 4 0 010-8zm6.4-3.7a1.44 1.44 0 100 2.88 1.44 1.44 0 000-2.88z" />
      </svg>
    ),
  },
  TikTok: {
    label: 'TikTok',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full" aria-hidden>
        <path d="M19.6 7.1a5.1 5.1 0 01-3.7-1.6 5.1 5.1 0 01-1.3-2.7h-3.2v12.9a2.7 2.7 0 11-2.7-2.7c.2 0 .5 0 .7.1V9.8a6 6 0 00-.7 0 6 6 0 106 6V10a8.3 8.3 0 004.9 1.6V8.3a5 5 0 01-.9-.1l.9-1.1z" />
      </svg>
    ),
  },
  YouTube: {
    label: 'YouTube',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full" aria-hidden>
        <path d="M23 7.3a3 3 0 00-2.1-2.1C19 4.7 12 4.7 12 4.7s-7 0-8.9.5A3 3 0 001 7.3 31.2 31.2 0 00.5 12 31.2 31.2 0 001 16.7a3 3 0 002.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 002.1-2.1A31.2 31.2 0 0023.5 12 31.2 31.2 0 0023 7.3zM9.8 15.1V8.9L15.9 12l-6.1 3.1z" />
      </svg>
    ),
  },
  Other: {
    label: 'Watch',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full" aria-hidden>
        <path d="M8 5.2v13.6a1 1 0 0 0 1.5.87l11-6.8a1 1 0 0 0 0-1.74l-11-6.8A1 1 0 0 0 8 5.2z" />
      </svg>
    ),
  },
}

export default function VideoThumb({ url, platform, className }) {
  const plat = platform || detectPlatformFromUrl(url)
  const p = PLATFORMS[plat] || PLATFORMS.Other

  return (
    <div className={cx('group/thumb relative flex h-28 w-full items-center justify-center overflow-hidden text-white', BRAND_FACE, className)}>
      {/* Warm highlight + a gentle top/bottom shade so the white mark stays crisp. */}
      <div className="pointer-events-none absolute inset-0" style={{ background: WARM_GLOW }} />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-black/5" />

      {/* Big platform logo + name, centred across the card. This is the play
          control (the caller's button opens the inline player); it lifts on hover. */}
      <div className="relative flex items-center gap-3 px-4 transition-transform duration-200 group-hover/thumb:scale-105">
        <span className="h-9 w-9 shrink-0 drop-shadow-[0_2px_6px_rgba(0,0,0,0.28)]">{p.icon}</span>
        <span className="text-2xl font-semibold tracking-tight drop-shadow-[0_1px_4px_rgba(0,0,0,0.28)]">{p.label}</span>
      </div>
    </div>
  )
}
