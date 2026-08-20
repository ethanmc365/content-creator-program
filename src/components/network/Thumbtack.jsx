// THE THUMBTACK, AND WHY THIS IS THE SIXTH ONE.
//
// The five before it, in order: a flat disc on a straight grey line (a
// lollipop); a shaded sphere on a collar (a ball on a stick); a wide flange
// with a domed grip (a cork); a flat-topped grip on a very wide thin disc (a
// rubber stamp); and a round head with a steel shaft going into a punched hole.
//
// THE FIFTH WAS THE CLOSEST AND IT WAS STILL WRONG, and this time there is a
// reference photograph to work from rather than a description. What the picture
// shows is a real office push pin on a cream note, and three things in it are
// not what was being drawn:
//
//   THE HEAD IS A DOME, NOT A DISC OR A BALL. It is taller than it is wide,
//   rounded over the top, and it narrows towards the bottom - the shape of a
//   thimble rather than a marble. Every previous version drew a circle, which
//   reads as a bead or a dot at any size.
//
//   THERE IS A VISIBLE COLLAR UNDER IT. A short, straighter section between the
//   dome and the paper, slightly narrower than the dome. That step is most of
//   what makes it read as a manufactured object rather than a blob.
//
//   IT IS SMALL, AND IT SITS AT THE VERY TOP OF THE NOTE. In the photograph the
//   pin is about a twelfth of the card's width and it overlaps the top edge, so
//   part of it is against the wall behind. Every version here has been drawn too
//   large, which is why so much effort went into shading detail nobody would see
//   on a real one.
//
// SO: a dome, a collar, one highlight, one soft shadow, and a hole small enough
// that it reads as a puncture rather than a punched eyelet. The steel shaft the
// last version drew is gone - in the photograph you cannot see any of it,
// because the collar sits flush on the paper. What says "through" is the shadow
// under the collar and the pucker around it.
//
// EVERY PIN IS TRYP ORANGE. There used to be a green one for an answered
// question. It made the wall two-coloured on a page that had already had its
// amber-and-green paper taken away, and a pin is a pin - it is what holds the
// paper up, not what the paper says.
//
// IT LIVES IN ITS OWN FILE because two surfaces draw it: the board itself and
// the card on the worldwide hub. They used to have a pin each, which is how the
// hub ended up with the lollipop version months after the board had stopped
// using it. NO MOTION IMPORT: the hub is eagerly routed and this is drawn on it.

/**
 * The gradients, declared ONCE per page rather than once per pin. A `<defs>`
 * per note is a definition per note, and there can be fifty on the board.
 */
export function ThumbtackDefs() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <defs>
        {/* THE DOME. Lit from the top left like everything else in this
            product. The terminator sits low and to the right, which is what
            gives a dome its volume - a highlight alone just looks glossy. */}
        <radialGradient id="tack-dome" cx="33%" cy="24%" r="82%">
          <stop offset="0%" stopColor="#ffc9a3" />
          <stop offset="30%" stopColor="#f5853f" />
          <stop offset="72%" stopColor="#d94407" />
          <stop offset="100%" stopColor="#a63305" />
        </radialGradient>
        {/* The collar is the same plastic in shadow: darker overall, brighter
            up its left side, because the dome above it blocks most of the
            light. */}
        <linearGradient id="tack-collar" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#a83506" />
          <stop offset="30%" stopColor="#d94407" />
          <stop offset="100%" stopColor="#7d2704" />
        </linearGradient>
        {/* THE PAPER GIVING WAY. A sheet held by a pin dips towards it, and the
            dip is darkest at the pin and gone within a few millimetres. */}
        <radialGradient id="tack-pucker" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(26,26,26,0.20)" />
          <stop offset="45%" stopColor="rgba(26,26,26,0.08)" />
          <stop offset="100%" stopColor="rgba(26,26,26,0)" />
        </radialGradient>
      </defs>
    </svg>
  )
}

/**
 * One pin, pushed through the top of whatever it is holding up.
 *
 * `top` is a Tailwind class rather than a prop with a number in it, because the
 * two callers place it at different depths (the board's notes have more paper
 * above the writing than the hub's do) and a class composes with the rest of
 * the positioning without a style attribute per note.
 */
export default function Thumbtack({ className = 'h-9 w-9', top = '-top-1' }) {
  return (
    <span className={`pointer-events-none absolute ${top} left-1/2 z-10 -translate-x-1/2`} aria-hidden>
      <svg viewBox="0 0 40 40" className={className}>
        {/* ---- ON THE PAPER ---- */}

        {/* The sheet dipping towards the pin. Small: a push pin puckers a few
            millimetres of paper, not half the card. */}
        <ellipse cx="20" cy="28.4" rx="7.6" ry="3.4" fill="url(#tack-pucker)" />

        {/* The pin's shadow, thrown down and to the right. Two ellipses rather
            than a `drop-shadow` filter: this is drawn on up to fifty notes at
            once and a filter is an offscreen pass per element per frame. */}
        <ellipse cx="23.2" cy="27.6" rx="5.6" ry="2.4" fill="rgba(26,26,26,0.16)" />
        <ellipse cx="22" cy="27.2" rx="4.8" ry="2" fill="rgba(26,26,26,0.12)" />

        {/* THE PUNCTURE. Barely there, and mostly hidden behind the collar -
            which is exactly how much of it you can see on the real thing. It is
            what stops the collar reading as resting on top of the sheet. */}
        <ellipse cx="20" cy="27.4" rx="1.5" ry="0.8" fill="#5c3a26" fillOpacity="0.7" />

        {/* ---- THE PIN ---- */}

        {/* THE COLLAR. Straight sides, slightly narrower than the dome, sitting
            flush on the paper. This is the step that makes it a manufactured
            object; without it the dome grows out of the page like a drop of
            paint. */}
        <path d="M15.8 20.6 h8.4 l-0.9 6.4 q-3.3 1.1 -6.6 0 Z" fill="url(#tack-collar)" />
        {/* A hair of contact darkness where the collar meets the paper, or the
            two read as stacked rather than as one thing pressed into the other. */}
        <path d="M16.7 26.6 q3.3 1.1 6.6 0 l-0.15 1 q-3.15 1 -6.3 0 Z" fill="rgba(60,18,2,0.55)" />

        {/* THE DOME. Taller than it is wide, rounded over the top, narrowing to
            meet the collar. The curve on each side is what carries the whole
            silhouette - see the note at the top of this file. */}
        <path d="M20 5.4 C25.4 5.4 27.8 10.2 27.8 14.6 C27.8 17.9 26.6 19.9 24.4 21 L15.6 21 C13.4 19.9 12.2 17.9 12.2 14.6 C12.2 10.2 14.6 5.4 20 5.4 Z" fill="url(#tack-dome)" />

        {/* One highlight, up and left, where the light is. Soft-edged and small:
            a hard white shape reads as a sticker on the pin. */}
        <ellipse cx="17.2" cy="10.6" rx="2.2" ry="3.1" fill="#ffffff" fillOpacity="0.38" transform="rotate(-18 17.2 10.6)" />
        {/* A thin bounce along the right shoulder, so the dome does not go flat
            black on its dark side. */}
        <path d="M25.9 11.6 C27.2 13.4 27.4 16.4 26.2 18.8 C26 17.2 26.3 13.6 25.9 11.6 Z" fill="#ffffff" fillOpacity="0.16" />
      </svg>
    </span>
  )
}
