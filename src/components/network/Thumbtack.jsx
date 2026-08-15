// THE THUMBTACK, AND WHY THIS IS THE THIRD ONE.
//
// The first was a flat disc with a white dot and a straight grey line under it -
// a lollipop. The second replaced the disc with a shaded sphere on a collar,
// which is better lit and still the wrong OBJECT: seen head-on it is a ball with
// a stick, and Ethan named it exactly - "the pin is not what i want it to look
// like, it should look like an actual thumbtuck, it's a thumbtack pushpin, not
// just a round ball pin."
//
// The difference is not shading, it is SILHOUETTE. A push pin is not round. It
// is a barrel you pinch between finger and thumb, sitting on a WIDE FLAT FLANGE
// that stops your thumb sliding down, with the needle coming out of the middle
// of that flange. The flange is the whole recognisable part: it is far wider
// than the barrel, it is seen as an ellipse because you are looking slightly
// down at it, and nothing else has that outline.
//
// So this one is drawn as a real object seen from a few degrees above:
//
//   the needle      tapered, and it goes INTO the paper rather than stopping on
//                   top of it - the point is hidden, which is what a pin pushed
//                   through something actually looks like
//   the flange      two stacked ellipses, the lower one darker, which is all it
//                   takes to give a disc a thickness
//   the barrel      straight sides, rounded off at the bottom where it meets
//                   the flange, domed at the top
//   the highlight   one small specular, off-centre, up the lit side
//
// EVERY PIN IS TRYP ORANGE. There used to be a green one for an answered
// question. It made the wall two-coloured on a page that had already had its
// amber-and-green paper taken away for being a palette this product does not
// own, and a pin is a pin - it is what holds the paper up, not what the paper
// says. The state still reads at a glance from the band across the top of the
// note and from its tag chip. Ethan: "keep the tryp.com orange."
//
// IT LIVES IN ITS OWN FILE because two surfaces draw it: the board itself and
// the card on the worldwide hub. They used to have a pin each, which is how the
// hub ended up with the lollipop version months after the board had stopped
// using it - and a note has to look like the same object in both places or
// moving between them reads as a glitch. NO MOTION IMPORT HERE: the hub is
// eagerly routed and this is drawn on it.

/**
 * The gradients, declared ONCE per page rather than once per pin. A `<defs>`
 * per note is a definition per note, and there can be fifty on the board.
 */
export function ThumbtackDefs() {
  return (
    <svg width="0" height="0" aria-hidden className="absolute">
      <defs>
        {/* The barrel, lit from the top left like everything else here. A
            LINEAR gradient across it, not a radial: a cylinder has a bright
            side and a dark side, and a radial makes it a bead again. */}
        <linearGradient id="tack-barrel" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#c23c05" />
          <stop offset="28%" stopColor="#f5853f" />
          <stop offset="62%" stopColor="#d94407" />
          <stop offset="100%" stopColor="#9c3204" />
        </linearGradient>
        {/* The top of the flange catches the light nearly flat on. */}
        <linearGradient id="tack-flange" x1="0" y1="0" x2="0.85" y2="1">
          <stop offset="0%" stopColor="#ffb184" />
          <stop offset="55%" stopColor="#f5853f" />
          <stop offset="100%" stopColor="#d94407" />
        </linearGradient>
        <radialGradient id="tack-dome" cx="34%" cy="26%" r="78%">
          <stop offset="0%" stopColor="#ffc9a6" />
          <stop offset="45%" stopColor="#f5853f" />
          <stop offset="100%" stopColor="#c23c05" />
        </radialGradient>
        <linearGradient id="tack-needle" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#6b7280" />
          <stop offset="45%" stopColor="#d1d5db" />
          <stop offset="100%" stopColor="#6b7280" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/**
 * One pin, hanging over the top edge of whatever it is pinning up.
 *
 * IT SITS IN THE SAME PLACE ON EVERY NOTE. Ethan, of an earlier version: "some
 * are inside the cards and others are nicely at the top." It was `-top-2.5` on a
 * note inside a CSS multi-column container, and a column box CLIPS what
 * overflows its top edge - so the pin on whichever note happened to start a
 * column lost its head and what was left looked like a pin sunk into the paper.
 * The overhang is small and, more importantly, every container that holds these
 * reserves room for it (`pt-3` on the columns, `mt-1.5` on each note), so there
 * is no edge for it to be clipped against.
 */
export default function Thumbtack({ className = 'h-9 w-9' }) {
  return (
    <span className="pointer-events-none absolute -top-2.5 left-1/2 z-10 -translate-x-1/2" aria-hidden>
      <svg viewBox="0 0 30 32" className={className}>
        {/* The shadow the flange casts on the paper. An ellipse rather than a
            filter: this is drawn on up to fifty notes at once, and
            `drop-shadow` is an offscreen pass per element. */}
        <ellipse cx="16.6" cy="23.4" rx="7.6" ry="2.3" fill="rgba(20,20,30,0.18)" />
        {/* Needle. */}
        <path d="M13.8 21.6 L16.2 21.6 L15.4 30.4 L14.6 30.4 Z" fill="url(#tack-needle)" />
        {/* The flange, in two passes: the underside first, then the lit top a
            pixel above it. That one pixel is the thickness. */}
        <ellipse cx="15" cy="21.5" rx="9" ry="3.1" fill="#a83506" />
        <ellipse cx="15" cy="20.4" rx="9" ry="3.1" fill="url(#tack-flange)" />
        {/* The barrel: straight sides, rounded where it sits into the flange. */}
        <path d="M10.4 9.6 h9.2 v8.6 a4.6 2.9 0 0 1 -9.2 0 Z" fill="url(#tack-barrel)" />
        {/* The domed top of the barrel. */}
        <path d="M10.4 9.6 a4.6 5.2 0 0 1 9.2 0 Z" fill="url(#tack-dome)" />
        {/* One specular, small and off-centre, up the lit side. */}
        <ellipse cx="12.4" cy="8.4" rx="1.3" ry="2.6" fill="#ffffff" fillOpacity="0.42" transform="rotate(-12 12.4 8.4)" />
      </svg>
    </span>
  )
}
