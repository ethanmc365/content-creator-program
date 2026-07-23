import { detectPlatformFromUrl } from '../lib/videoPreview'
import { cx } from '../lib/utils'

// A tasteful, platform-specific face for a submitted entry. We deliberately do
// NOT fetch a thumbnail (Instagram needs a token we don't have and the others
// were inconsistent). Each platform gets its OWN dark, refined face - distinct
// enough to recognise at a glance, but muted and sophisticated so it sits
// comfortably next to the white + orange platform instead of shouting a loud
// competing brand colour. Every glyph is white (no pink Instagram mark), and the
// play control is a simple custom white triangle - no circle.
//
// Pure visual block - the caller wraps it in its own button/link so we never nest
// anchors. Clicking plays the video inline (caller opens VideoEmbedModal); the
// "Open Link" button on the card opens the original post in a new tab.

const PLATFORMS = {
  Instagram: {
    label: 'Instagram',
    // Instagram's cooler indigo/violet end - evokes the brand without the pink.
    className: 'bg-[linear-gradient(140deg,#514a9d_0%,#3a2c5f_58%,#291f3e_100%)]',
    glow: 'radial-gradient(circle at 82% 16%, rgba(240,148,80,0.28), transparent 55%)',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full" aria-hidden>
        <path d="M12 2.2c3.2 0 3.6 0 4.8.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.81s0 3.54-.07 4.81c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.64.07-4.81.07s-3.54 0-4.81-.07c-3.26-.15-4.77-1.7-4.92-4.92C2.2 15.54 2.2 15.17 2.2 12s0-3.54.07-4.81C2.42 3.96 3.94 2.42 7.19 2.27 8.46 2.21 8.84 2.2 12 2.2zm0 3.6a6.2 6.2 0 100 12.4 6.2 6.2 0 000-12.4zm0 2.2a4 4 0 110 8 4 4 0 010-8zm6.4-3.7a1.44 1.44 0 100 2.88 1.44 1.44 0 000-2.88z" />
      </svg>
    ),
  },
  TikTok: {
    label: 'TikTok',
    // Signature near-black, with a whisper of TikTok's cyan/magenta in the glow.
    className: 'bg-[#0e0e12]',
    glow: 'radial-gradient(circle at 15% 20%, rgba(37,244,238,0.22), transparent 48%), radial-gradient(circle at 86% 84%, rgba(254,44,85,0.24), transparent 50%)',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full" aria-hidden>
        <path d="M19.6 7.1a5.1 5.1 0 01-3.7-1.6 5.1 5.1 0 01-1.3-2.7h-3.2v12.9a2.7 2.7 0 11-2.7-2.7c.2 0 .5 0 .7.1V9.8a6 6 0 00-.7 0 6 6 0 106 6V10a8.3 8.3 0 004.9 1.6V8.3a5 5 0 01-.9-.1l.9-1.1z" />
      </svg>
    ),
  },
  YouTube: {
    label: 'YouTube',
    // Deep maroon-charcoal with a restrained red bloom, not a flat bright red.
    className: 'bg-[linear-gradient(140deg,#3a181b_0%,#241417_100%)]',
    glow: 'radial-gradient(circle at 50% 120%, rgba(255,40,40,0.34), transparent 60%)',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full" aria-hidden>
        <path d="M23 7.3a3 3 0 00-2.1-2.1C19 4.7 12 4.7 12 4.7s-7 0-8.9.5A3 3 0 001 7.3 31.2 31.2 0 00.5 12 31.2 31.2 0 001 16.7a3 3 0 002.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 002.1-2.1A31.2 31.2 0 0023.5 12 31.2 31.2 0 0023 7.3zM9.8 15.1V8.9L15.9 12l-6.1 3.1z" />
      </svg>
    ),
  },
  Other: {
    label: 'Watch',
    className: 'bg-[linear-gradient(140deg,#d94407_0%,#b5370a_100%)]',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-full w-full" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.2 10.8a4 4 0 010 5.6l-3 3a4 4 0 01-5.6-5.6l1.5-1.5M10.8 13.2a4 4 0 010-5.6l3-3a4 4 0 015.6 5.6l-1.5 1.5" />
      </svg>
    ),
  },
}

export default function VideoThumb({ url, platform, className }) {
  const plat = platform || detectPlatformFromUrl(url)
  const p = PLATFORMS[plat] || PLATFORMS.Other

  return (
    <div className={cx('group/thumb relative h-28 w-full overflow-hidden text-white', p.className, className)}>
      {/* Subtle platform-tinted glow over the dark base. */}
      {p.glow && <div className="pointer-events-none absolute inset-0" style={{ background: p.glow }} />}
      {/* Soft top-down shade so the wordmark + triangle stay crisp. */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-black/10" />

      {/* Platform wordmark + white glyph, top-left. */}
      <div className="absolute left-3 top-3 flex items-center gap-1.5">
        <span className="h-4 w-4">{p.icon}</span>
        <span className="text-xs font-semibold tracking-wide drop-shadow-sm">{p.label}</span>
      </div>

      {/* Simple custom white triangle, dead centre - no circle. A soft drop
          shadow keeps it readable; it lifts on hover. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        <svg
          viewBox="0 0 24 24"
          fill="#fff"
          className="h-11 w-11 drop-shadow-[0_2px_8px_rgba(0,0,0,0.5)] transition-transform duration-200 group-hover/thumb:scale-110"
          aria-hidden
        >
          <path d="M8 5.2v13.6a1 1 0 0 0 1.5.87l11-6.8a1 1 0 0 0 0-1.74l-11-6.8A1 1 0 0 0 8 5.2z" />
        </svg>
      </div>
    </div>
  )
}
