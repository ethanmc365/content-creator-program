// THE PLATFORM MARKS.
//
// A creator's links were four identical grey buttons reading "Instagram ↗",
// "TikTok ↗", "YouTube ↗", "Facebook ↗". Four words where there should have
// been four shapes: on a page whose whole subject is somebody's presence on
// those platforms, the row that lists them was the least scannable thing on it.
//
// WHY THESE ARE DRAWN AND NOT DOWNLOADED. The production CSP is `img-src
// 'self'`, so a remote logo file cannot load at all, and bundling the official
// brand assets is a trademark question nobody needs. These are plain
// single-colour glyphs of the platform's own SHAPE - the camera outline, the
// play button, the note, the `in` - which is what makes them recognisable at
// 18px anyway. They take `currentColor`, so they inherit the hover state of
// the control they sit in rather than carrying brand colours of their own,
// which also keeps the row inside the palette (white, ink, one orange).
//
// ANYTHING NOT ON THE LIST GETS THE CHAIN LINK. A creator can add arbitrary
// links, and a blog or a press kit should look like a link rather than borrow
// somebody else's logo.

// Guess a platform from a URL, for the free-form "other links" a creator adds.
// Host-based, and it checks the HOST rather than the whole string: a YouTube
// video ABOUT Instagram should not come out as an Instagram link.
export function brandForUrl(url) {
  let host
  try {
    host = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.replace(/^www\./, '').toLowerCase()
  } catch {
    return 'link'
  }
  if (/(^|\.)instagram\.com$/.test(host)) return 'instagram'
  if (/(^|\.)tiktok\.com$/.test(host)) return 'tiktok'
  if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return 'youtube'
  if (/(^|\.)(facebook\.com|fb\.com|fb\.me)$/.test(host)) return 'facebook'
  if (/(^|\.)linkedin\.com$/.test(host)) return 'linkedin'
  if (/(^|\.)(twitter\.com|x\.com)$/.test(host)) return 'x'
  if (/(^|\.)(pinterest\.[a-z.]+)$/.test(host)) return 'pinterest'
  if (/(^|\.)(threads\.net|threads\.com)$/.test(host)) return 'threads'
  return 'link'
}

// THE BRAND COLOURS, for the surfaces that want the real logo rather than a
// line icon. Ethan: "the links should have better UI and the actual colourful
// social media logos, not greyed."
//
// One colour per platform, except Instagram, which nobody recognises in a flat
// colour - its whole identity is the gradient, so it gets one. The gradient id
// is fixed and every instance draws the same stops, so repeated ids resolve
// identically.
//
// These are the platforms' own colours used to identify the platform, which is
// what a link to it is for. Everything else on this page stays inside the
// house palette; a row of six identical grey glyphs was the alternative, and it
// made the one part of a creator profile that is ABOUT other platforms the
// least recognisable thing on it.
export const BRAND_COLOR = {
  // Instagram is the exception: its identity IS the gradient, so it is drawn
  // from its own paths below rather than tinted through `color`. A CSS `color`
  // cannot hold a `url(#gradient)` - only `fill` and `stroke` can - and the
  // glyph paths bind both of those to `currentColor`, so tinting and
  // gradient-filling are two different mechanisms and this map is the tinting
  // one. The value here is the flat fallback.
  instagram: '#D62976',
  tiktok: '#000000',
  youtube: '#FF0000',
  facebook: '#1877F2',
  linkedin: '#0A66C2',
  x: '#000000',
  pinterest: '#E60023',
  threads: '#000000',
  link: 'currentColor',
}

// Every path is drawn on a 24x24 grid so they sit at one optical weight.
const PATHS = {
  instagram: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="5" ry="5" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="17.4" cy="6.6" r="1.15" fill="currentColor" />
    </>
  ),
  tiktok: (
    // The note: a stem, its head, and the flag turning back over the top.
    <path
      fill="currentColor"
      d="M16.5 2.2h-2.9v13.05a2.62 2.62 0 1 1-2.62-2.62c.2 0 .4.02.59.06v-2.95a5.6 5.6 0 0 0-.59-.03 5.57 5.57 0 1 0 5.57 5.57V8.9a6.68 6.68 0 0 0 3.94 1.27V7.22a3.8 3.8 0 0 1-2.63-1.14 3.83 3.83 0 0 1-1.36-2.63v-1.25z"
    />
  ),
  youtube: (
    <>
      <rect x="2.2" y="5.2" width="19.6" height="13.6" rx="4.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M10.4 9.4v5.2l4.6-2.6z" fill="currentColor" />
    </>
  ),
  facebook: (
    <path
      fill="currentColor"
      d="M13.6 21.4v-8.1h2.72l.41-3.16H13.6V8.12c0-.92.25-1.54 1.57-1.54h1.67V3.75a22.4 22.4 0 0 0-2.44-.13c-2.42 0-4.07 1.48-4.07 4.18v2.34H7.6v3.16h2.73v8.1z"
    />
  ),
  linkedin: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3.2" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="7.6" cy="7.7" r="1.35" fill="currentColor" />
      <path
        fill="currentColor"
        d="M6.5 10.4h2.2v7.1H6.5zm4.1 0h2.11v.97h.03c.3-.55 1.02-1.13 2.1-1.13 2.24 0 2.66 1.4 2.66 3.23v4.03h-2.2v-3.57c0-.85-.02-1.95-1.22-1.95-1.22 0-1.41.93-1.41 1.89v3.63h-2.2z"
      />
    </>
  ),
  x: (
    <path
      fill="currentColor"
      d="M17.2 3.4h2.9l-6.34 7.24 7.46 9.96h-5.84l-4.58-6-5.23 6H2.66l6.78-7.75L2.3 3.4h5.99l4.14 5.47zm-1.02 15.02h1.6L7.9 5.06H6.18z"
    />
  ),
  pinterest: (
    <path
      fill="currentColor"
      d="M12 2.4a9.6 9.6 0 0 0-3.5 18.53c-.08-.77-.15-1.96.03-2.8l1.13-4.8s-.29-.58-.29-1.43c0-1.34.78-2.35 1.75-2.35.82 0 1.22.62 1.22 1.36 0 .83-.53 2.07-.8 3.22-.23.96.48 1.75 1.43 1.75 1.72 0 3.04-1.81 3.04-4.43 0-2.32-1.66-3.94-4.04-3.94-2.75 0-4.37 2.06-4.37 4.2 0 .83.32 1.72.72 2.2a.29.29 0 0 1 .07.28l-.27 1.1c-.05.18-.14.22-.32.13-1.2-.56-1.95-2.3-1.95-3.71 0-3.02 2.2-5.79 6.33-5.79 3.32 0 5.9 2.37 5.9 5.53 0 3.3-2.08 5.96-4.97 5.96-.97 0-1.88-.5-2.19-1.1l-.6 2.28c-.21.83-.79 1.88-1.18 2.51A9.6 9.6 0 1 0 12 2.4"
    />
  ),
  threads: (
    <path
      fill="currentColor"
      d="M17.1 11.3a6 6 0 0 0-.24-.11c-.14-2.6-1.56-4.09-3.95-4.1h-.03c-1.43 0-2.62.61-3.35 1.72l1.31.9c.55-.83 1.4-1 2.04-1h.02c.8 0 1.4.23 1.79.69.28.33.47.79.56 1.37a10 10 0 0 0-2.27-.11c-2.29.13-3.76 1.47-3.66 3.33.05.94.52 1.75 1.32 2.28.68.45 1.55.67 2.46.62 1.2-.07 2.15-.53 2.8-1.37.5-.63.81-1.46.95-2.5.57.35 1 .8 1.23 1.35.4.93.43 2.46-.82 3.7-1.09 1.1-2.4 1.57-4.4 1.58-2.2-.01-3.88-.72-4.97-2.1C6.85 16.24 6.32 14.4 6.3 12s.53-4.24 1.52-5.48c1.09-1.38 2.76-2.09 4.96-2.1 2.22.01 3.92.72 5.05 2.1.55.68.97 1.53 1.24 2.53l1.53-.41c-.33-1.22-.85-2.28-1.56-3.15C17.6 3.7 15.5 2.8 12.79 2.79h-.01c-2.7.01-4.78.92-6.18 2.7C5.35 7.08 4.71 9.24 4.7 12v.01c.01 2.76.65 4.92 1.9 6.5 1.4 1.79 3.47 2.7 6.18 2.71h.01c2.4-.01 4.1-.64 5.5-2.05 1.83-1.83 1.78-4.12 1.18-5.53-.44-1.01-1.26-1.83-2.37-2.36m-4.1 3.98c-1 .06-2.05-.4-2.1-1.32-.04-.69.49-1.45 2.17-1.55l.4-.01c.6 0 1.17.06 1.68.17-.19 2.4-1.31 2.66-2.15 2.7"
    />
  ),
  link: (
    <>
      <path
        d="M10.1 13.9a3.6 3.6 0 0 0 5.43.39l2.2-2.2a3.6 3.6 0 0 0-5.09-5.09l-1.26 1.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
      <path
        d="M13.9 10.1a3.6 3.6 0 0 0-5.43-.39l-2.2 2.2a3.6 3.6 0 0 0 5.09 5.09l1.25-1.25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </>
  ),
}

/**
 * @param colored  paint the glyph in the platform's own colour
 * @param tile     draw it as a SOLID rounded tile in that colour with a white
 *                 glyph inside, which is what these actually look like in the
 *                 wild and the only version that survives being small.
 *
 * WHY `tile` EXISTS (4 Sep 2026). Ethan, on the applications page: "I noticed
 * the Instagram and YouTube icon colours aren't right - use the actual colourful
 * social media icons, just improve them."
 *
 * The outline glyphs are correct at 20px and mush below it: YouTube is a
 * rounded rectangle stroked at 1.8 on a 24 grid, so at 12px that stroke is
 * under a pixel and the shape greys out into an indistinct blob with a red
 * cast. Instagram is worse, because its whole identity is a gradient and a
 * gradient needs area to be seen at all - on a hairline outline it reads as one
 * muddy pink.
 *
 * A filled tile has area by construction. The colour is the background, the
 * glyph is knocked out of it in white, and both survive down to 16px - which is
 * the size these are actually used at in a list of links.
 */
export default function SocialMark({ brand, className, colored = false, tile = false }) {
  const key = PATHS[brand] ? brand : 'link'
  const gradient = key === 'instagram'
  const tint = BRAND_COLOR[key] ?? 'currentColor'

  if (tile) {
    return (
      <svg viewBox="0 0 24 24" className={className} aria-hidden focusable="false">
        {gradient && (
          <defs>
            <linearGradient id="tryp-ig-tile" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#FEDA75" />
              <stop offset="25%" stopColor="#FA7E1E" />
              <stop offset="50%" stopColor="#D62976" />
              <stop offset="75%" stopColor="#962FBF" />
              <stop offset="100%" stopColor="#4F5BD5" />
            </linearGradient>
          </defs>
        )}
        <rect
          x="0" y="0" width="24" height="24" rx="6.5"
          fill={gradient ? 'url(#tryp-ig-tile)' : (tint === 'currentColor' ? '#8a8a8f' : tint)}
        />
        {/* The glyph, knocked out in white and inset so it does not touch the
            tile's edge. `currentColor` on the paths becomes white here, which
            is the whole reason they were written to bind to it. */}
        <g transform="translate(3.6 3.6) scale(0.7)" style={{ color: '#ffffff' }}>
          {PATHS[key]}
        </g>
      </svg>
    )
  }

  const isGradient = colored && gradient
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      focusable="false"
      // The glyphs bind both fill and stroke to `currentColor`, so tinting them
      // is ONE property on the root rather than a second set of paths. `color`
      // and not `fill`, because several of these are stroked outlines
      // (Instagram, YouTube, LinkedIn) and a fill would never reach them.
      style={colored && !isGradient ? { color: tint } : undefined}
    >
      {isGradient ? (
        <>
          <defs>
            <linearGradient id="tryp-ig-grad" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="#FEDA75" />
              <stop offset="25%" stopColor="#FA7E1E" />
              <stop offset="50%" stopColor="#D62976" />
              <stop offset="75%" stopColor="#962FBF" />
              <stop offset="100%" stopColor="#4F5BD5" />
            </linearGradient>
          </defs>
          {/* Its own paths, painted with the gradient. The shared ones cannot
              be reused here: they hard-code `currentColor`, and an inherited
              fill loses to an explicit attribute on the child. */}
          <rect x="3" y="3" width="18" height="18" rx="5" ry="5" fill="none" stroke="url(#tryp-ig-grad)" strokeWidth="1.8" />
          <circle cx="12" cy="12" r="4" fill="none" stroke="url(#tryp-ig-grad)" strokeWidth="1.8" />
          <circle cx="17.4" cy="6.6" r="1.15" fill="url(#tryp-ig-grad)" />
        </>
      ) : (
        PATHS[key]
      )}
    </svg>
  )
}
