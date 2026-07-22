import { cx } from '../lib/utils'

// Custom "page emojis" for notes - clean, Heroicons-style LINE icons in the Tryp
// orange, so they match the rest of the app's icon language (Icon.jsx) instead
// of looking like blobby coloured emoji. Notes store a short key (e.g. 'idea');
// legacy notes that stored an actual emoji char are mapped across.
//
// Each glyph is just path data; the wrapper <svg> sets a single orange stroke so
// the whole set stays consistent. A few need a solid dot (fill), marked inline.

const BRAND = '#d94407'

const G = {
  note: (
    <>
      <rect x="5" y="3.5" width="14" height="17" rx="2.5" />
      <path d="M8.5 8h7M8.5 12h7M8.5 16h4.5" />
    </>
  ),
  question: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.4a2.5 2.5 0 014.8.9c0 1.7-2.4 2-2.4 3.5" />
      <path d="M12 16.7h.01" strokeWidth="2" />
    </>
  ),
  idea: (
    <>
      <path d="M8.7 15.8a5.5 5.5 0 116.6 0c-.7.5-1.1 1.1-1.1 1.9v.3H9.8v-.3c0-.8-.4-1.4-1.1-1.9z" />
      <path d="M9.8 20h4.4M10.6 22h2.8" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21c3.6-3.9 6-7 6-10.2A6 6 0 006 10.8C6 14 8.4 17.1 12 21z" />
      <circle cx="12" cy="10.8" r="2.3" />
    </>
  ),
  target: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <circle cx="12" cy="12" r="4.6" />
      <path d="M12 12h.01" strokeWidth="2.4" />
    </>
  ),
  calendar: (
    <>
      <rect x="4.5" y="5.5" width="15" height="14" rx="2.2" />
      <path d="M4.5 9.5h15M8.5 3.5v3.6M15.5 3.5v3.6" />
    </>
  ),
  fire: (
    <path d="M12 3.6c2.2 3-1.4 4.4-1.4 7a1.9 1.9 0 003.3 1.1C15.8 12.9 17 14.4 17 16.3A5 5 0 017 16.3C7 10.9 12 9.6 12 3.6z" />
  ),
  check: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.4 12.4l2.5 2.5 4.7-5.2" />
    </>
  ),
  megaphone: (
    <>
      <path d="M4.5 10.2v3.6l3.4.6V9.6l-3.4.6z" />
      <path d="M7.9 9.6 18 6v12L7.9 14.4" />
      <path d="M9.3 15.1V18.6h2.3" />
    </>
  ),
  globe: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.5 2.4 14.5 0 17M12 3.5c-2.4 2.5-2.4 14.5 0 17" />
    </>
  ),
  plane: (
    <>
      <path d="M4.6 11.7 19 5.2 12.5 19.6l-1.7-6-6.2-1.9z" />
      <path d="M10.8 13.6 19 5.2" />
    </>
  ),
  star: (
    <path d="M12 4.2l2.4 4.8 5.3.8-3.85 3.7.9 5.3L12 16.1l-4.75 2.5.9-5.3L4.3 9.8l5.3-.8L12 4.2z" />
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
    <svg
      viewBox="0 0 24 24"
      className={cx('h-6 w-6', className)}
      fill="none"
      stroke={BRAND}
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {G[key]}
    </svg>
  )
}
