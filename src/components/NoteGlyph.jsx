import { cx } from '../lib/utils'

// Custom, flat, on-brand "page emojis" for notes - drawn as SVG so they look the
// same on every device (not the OS Apple emoji). Notes store a short key
// (e.g. 'idea'); legacy notes that stored an actual emoji char are mapped across
// so nothing looks broken after the switch.

const G = {
  note: (
    <>
      <rect x="4" y="3" width="16" height="18" rx="3" fill="#FDE8D8" />
      <path d="M8 8h8M8 12h8M8 16h5" stroke="#d94407" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  question: (
    <>
      <circle cx="12" cy="12" r="9" fill="#E7ECFF" />
      <path d="M9.4 9.3a2.6 2.6 0 015 .8c0 1.7-2.4 2-2.4 3.6" stroke="#4f5bd5" strokeWidth="1.9" strokeLinecap="round" fill="none" />
      <circle cx="12" cy="17" r="1.1" fill="#4f5bd5" />
    </>
  ),
  idea: (
    <>
      <path d="M12 3a6 6 0 013.6 10.8c-.7.5-1.1 1-1.1 1.7v.5h-5v-.5c0-.7-.4-1.2-1.1-1.7A6 6 0 0112 3z" fill="#FFE49C" />
      <path d="M9.6 19h4.8M10.2 21h3.6" stroke="#E0A400" strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  pin: (
    <>
      <path d="M12 22s7-6.2 7-11a7 7 0 10-14 0c0 4.8 7 11 7 11z" fill="#FFD1D1" />
      <circle cx="12" cy="11" r="2.6" fill="#e11d48" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="9" fill="#FDE0E0" />
      <circle cx="12" cy="12" r="5.5" fill="#fff" />
      <circle cx="12" cy="12" r="2.4" fill="#e11d48" />
    </>
  ),
  calendar: (
    <>
      <rect x="4" y="5" width="16" height="15" rx="3" fill="#DDEFE4" />
      <path d="M4 9h16" stroke="#0f9d58" strokeWidth="1.8" />
      <path d="M8 3v3M16 3v3" stroke="#0f9d58" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="9" cy="13" r="1.1" fill="#0f9d58" /><circle cx="12" cy="13" r="1.1" fill="#0f9d58" /><circle cx="15" cy="13" r="1.1" fill="#0f9d58" />
    </>
  ),
  fire: (
    <>
      <path d="M12 3c1 3-2 4-2 7a2 2 0 004 0c0-.7-.2-1.3-.5-1.8C15.6 10 17 12 17 14.5A5 5 0 017 14.5C7 9.5 12 8 12 3z" fill="#FF7A45" />
      <path d="M12 21a2.4 2.4 0 002.4-2.4c0-1.5-2.4-2.6-2.4-2.6s-2.4 1.1-2.4 2.6A2.4 2.4 0 0012 21z" fill="#FFC24B" />
    </>
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="9" fill="#D9F2E3" />
      <path d="M8 12.5l2.5 2.5L16 9.5" stroke="#0f9d58" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </>
  ),
  megaphone: (
    <>
      <path d="M4 10v4l3 .5V9.5L4 10z" fill="#F5853F" />
      <path d="M7 9.5L18 5v14L7 14.5v-5z" fill="#d94407" />
      <path d="M9 15l1 4h2.4l-1-4.3" fill="#F5853F" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="9" fill="#DCEBFF" />
      <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" stroke="#2b6fd6" strokeWidth="1.6" fill="none" />
    </>
  ),
  plane: (
    <>
      <path d="M21 4.5c-.6-.6-1.6-.6-2.6.1L14 8 6 6.2 4.4 7.8l6.1 3.4-2.6 2.6-2.6-.4-1.3 1.3 3 1.7 1.7 3 1.3-1.3-.4-2.6 2.6-2.6 3.4 6.1 1.6-1.6L20.9 7c.7-1 .7-2 .1-2.5z" fill="#d94407" />
    </>
  ),
  star: (
    <>
      <path d="M12 3.5l2.5 5.2 5.7.8-4.1 4 1 5.7-5.1-2.7-5.1 2.7 1-5.7-4.1-4 5.7-.8L12 3.5z" fill="#FFC24B" />
    </>
  ),
}

// Old stored emoji chars -> new glyph keys (so existing notes upgrade cleanly).
const LEGACY = {
  '📝': 'note', '❓': 'question', '💡': 'idea', '📌': 'pin', '🎯': 'target',
  '🗓️': 'calendar', '🗓': 'calendar', '🔥': 'fire', '✅': 'check',
  '📣': 'megaphone', '🌍': 'globe', '✈️': 'plane', '✈': 'plane', '⭐': 'star',
}

export const NOTE_GLYPH_KEYS = Object.keys(G)
export const DEFAULT_GLYPH = 'note'

export function resolveGlyph(value) {
  if (!value) return DEFAULT_GLYPH
  if (G[value]) return value
  return LEGACY[value] || DEFAULT_GLYPH
}

export default function NoteGlyph({ name, className }) {
  const key = resolveGlyph(name)
  return (
    <svg viewBox="0 0 24 24" className={cx('h-6 w-6', className)} aria-hidden>
      {G[key]}
    </svg>
  )
}
