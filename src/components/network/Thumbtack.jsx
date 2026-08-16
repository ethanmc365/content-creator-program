// THE THUMBTACK, AND WHY THIS IS THE FOURTH ONE.
//
// The first was a flat disc with a white dot and a straight grey line under it -
// a lollipop. The second replaced the disc with a shaded sphere on a collar,
// which is better lit and still the wrong OBJECT: seen head-on it is a ball with
// a stick. The third got the SILHOUETTE right, which is the part that actually
// carries it: a push pin is not round, it is a barrel you pinch between finger
// and thumb sitting on a WIDE FLAT FLANGE, seen as an ellipse because you are
// looking slightly down at it, and nothing else has that outline.
//
// AND IT STILL READ AS A STICKER. Ethan: "I still don't really like how the
// thumbtack icon looks... I feel like it's hidden and hard to see or understand.
// Currently the icon looks like it's just on top of the card, rather than
// actually pinned to the screen."
//
// He is describing two real faults, and neither of them is the drawing:
//
//   THE PIN WAS HANGING OFF THE TOP EDGE. It sat at `-top-2.5`, so most of the
//   object was over the gap ABOVE the paper and only the tip touched it. A pin
//   over the edge of a note is a pin that is not holding it. It sits fully ON
//   the paper now, a little below the top edge, which is where you would
//   actually put one - and it stops fighting every container that clips.
//
//   THE NEEDLE WAS DRAWN ON TOP OF THE PAPER. A tapered spike lying across the
//   note is the one thing that guarantees it reads as a sticker, because a
//   needle you can see is a needle that has not gone through anything. There is
//   no needle here at all. What says "through" is the paper's reaction to it:
//   a soft pucker in the sheet around the flange, and the shadow the head casts
//   down and to the right, lit from the top left like everything else.
//
// The third fault was SIZE - "hard to see". It was 36px of drawing, most of it
// needle, so the head itself was about fourteen. The head is the whole object
// now and the default is bigger.
//
// EVERY PIN IS TRYP ORANGE. There used to be a green one for an answered
// question. It made the wall two-coloured on a page that had already had its
// amber-and-green paper taken away for being a palette this product does not
// own, and a pin is a pin - it is what holds the paper up, not what the paper
// says. The state reads from the band across the top of the note and its tag
// chip. Ethan: "keep the tryp.com orange."
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
          <stop offset="0%" stopColor="#b83a05" />
          <stop offset="26%" stopColor="#f5853f" />
          <stop offset="58%" stopColor="#d94407" />
          <stop offset="100%" stopColor="#8e2d03" />
        </linearGradient>
        {/* The top of the flange catches the light nearly flat on, and it is
            BRIGHTEST AT THE BACK LEFT - the near edge of a disc you are looking
            down at is the edge turned away from a light above you. */}
        <linearGradient id="tack-flange" x1="0.15" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#ffc39c" />
          <stop offset="48%" stopColor="#f5853f" />
          <stop offset="100%" stopColor="#c73f06" />
        </linearGradient>
        <radialGradient id="tack-dome" cx="33%" cy="24%" r="80%">
          <stop offset="0%" stopColor="#ffd2b4" />
          <stop offset="42%" stopColor="#f5853f" />
          <stop offset="100%" stopColor="#b83a05" />
        </radialGradient>
        {/* THE PAPER GIVING WAY. A sheet held by a pin is not flat around it:
            it dips, and the dip is darkest right at the flange and gone within
            a few millimetres. This is the single mark that says the pin went
            THROUGH rather than ON, so it is a real gradient rather than a flat
            grey ellipse - a hard-edged shadow under a pin looks like a decal
            with a drop shadow, which is the thing being fixed. */}
        <radialGradient id="tack-pucker" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(20,20,30,0.20)" />
          <stop offset="55%" stopColor="rgba(20,20,30,0.10)" />
          <stop offset="100%" stopColor="rgba(20,20,30,0)" />
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
export default function Thumbtack({ className = 'h-12 w-12', top = 'top-1' }) {
  return (
    <span className={`pointer-events-none absolute ${top} left-1/2 z-10 -translate-x-1/2`} aria-hidden>
      <svg viewBox="0 0 40 40" className={className}>
        {/* THE PAPER FIRST, THEN THE OBJECT ON IT. Order is the whole illusion:
            everything below is drawn on the sheet, everything above is drawn on
            top of the pin's own shadow. */}

        {/* The sheet dipping into the pin. Wider than the disc and centred on
            it - see #tack-pucker. */}
        <ellipse cx="20" cy="27.8" rx="17" ry="6.2" fill="url(#tack-pucker)" />
        {/* The head's own shadow, thrown down and to the right. Two ellipses
            rather than a `drop-shadow` filter: this is drawn on up to fifty
            notes at once and a filter is an offscreen pass per element. */}
        <ellipse cx="24.2" cy="28.4" rx="12" ry="3.3" fill="rgba(20,20,30,0.15)" />
        <ellipse cx="22.4" cy="27.9" rx="10.4" ry="2.9" fill="rgba(20,20,30,0.13)" />

        {/* THE SILHOUETTE IS FLAT TOP, NECK, WIDE THIN DISC - IN THAT ORDER.
            THE TWO MISTAKES THIS FIXES, both of which turned it into a
            different object. A DOMED top and a disc that was only twice the
            width of the grip is a cork. A domed top on a THICK disc is a rubber
            stamp, which is what the version before this one looked like at size
            - and both were failures of PROFILE, not of shading.
            A push pin has three parts you can name from across a room: a squat
            grip you pinch, with a FLAT top; a visible NECK where it steps in;
            and a disc nearly three times the grip's width and barely thick
            enough to see. Nothing else has that outline. */}
        <ellipse cx="20" cy="27" rx="14" ry="3.4" fill="#93300a" />
        <ellipse cx="20" cy="25.9" rx="14" ry="3.4" fill="url(#tack-flange)" />
        {/* A thin bright rim along the far edge of the disc. A plate seen from
            slightly above has a lit back edge, and without it the disc reads as
            a flat orange oval printed on the page. */}
        <path d="M6 25a14 3.4 0 0 1 28 0a14 3.4 0 0 0 -28 0Z" fill="#ffd2b4" fillOpacity="0.85" />

        {/* THE NECK. The step from grip to disc, and the one part that was
            missing entirely. Without it the grip grows out of the plate like a
            handle moulded to it, which is a stamp; with it there are two
            objects joined, which is a pin. Darker than both, because it is the
            part in shadow from everything around it. */}
        <path d="M16.5 19.4 h7 l1 6.1 h-9 Z" fill="#a83506" />

        {/* The grip: a squat cylinder with a FLAT top and rounded top corners,
            very slightly wider at the top than the bottom. */}
        <path d="M13.6 10.4 q0-2.4 6.4-2.4 t6.4 2.4 l-0.7 9.4 h-11.4 Z" fill="url(#tack-barrel)" />
        {/* The flat top, seen at the same few degrees from above as the disc.
            This ellipse is the whole reason the top reads as flat. */}
        <ellipse cx="20" cy="9.2" rx="6.4" ry="2" fill="url(#tack-dome)" />
        {/* Where the grip meets the neck is in shadow from the grip itself - a
            hair of contact darkness, or the parts read as stacked rather than
            as one object. */}
        <ellipse cx="20" cy="19.5" rx="5.7" ry="1.2" fill="rgba(120,40,4,0.4)" />
        {/* One specular, small and off-centre, up the lit side. */}
        <rect x="15.6" y="11.2" width="2" height="6.6" rx="1" fill="#ffffff" fillOpacity="0.4" />
      </svg>
    </span>
  )
}
