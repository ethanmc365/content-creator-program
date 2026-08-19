// THE THUMBTACK, AND WHY THIS IS THE FIFTH ONE.
//
// The four before it, in order: a flat disc on a straight grey line (a
// lollipop); a shaded sphere on a collar (a ball on a stick); a wide flat
// flange with a domed grip (a cork); and a flat-topped grip on a very wide thin
// disc, with a radial pucker and an offset cast shadow underneath it.
//
// THE FOURTH ONE WAS A RUBBER STAMP. Ethan: "the pins you made, although you
// tried to improve them, they still look really bad. It doesn't look like it's
// stuck to the page. Now it looks like it's a stamp or something. I want a
// natural visual, nice, clean, tryp.com simple orange thumb tack pin that makes
// it look like it's actually pinned into the screen. Maybe there should be a
// little hole in the card that actually shows the pin going through it."
//
// THAT LAST SENTENCE IS THE WHOLE FIX AND IT IS WHY THIS ONE IS DIFFERENT.
//
// Every previous version tried to say "through" with LIGHTING - a pucker, a
// cast shadow, a contact shadow, a specular. Lighting is what you use when the
// geometry is already right, and here it never was: in all four the pin was a
// solid object sitting entirely ON TOP of an unbroken sheet of paper. Nothing
// was pierced. So the eye correctly read a decal, and every extra gradient made
// it a more elaborately shaded decal.
//
// What makes something look pushed through paper is a HOLE, and a bit of shaft
// disappearing into it. That is three shapes:
//
//   1. a dark hole in the sheet, with the paper's own thickness catching light
//      on its lower rim
//   2. a short length of shaft between the head and the hole - four pixels of
//      it, which is all you would ever see - going BEHIND the paper's edge
//   3. the head, in front of both
//
// Order of painting IS the illusion. The shaft is drawn before the hole's rim
// and the head is drawn after everything, so the shaft is genuinely occluded by
// the sheet rather than being drawn short and hoped for.
//
// AND IT IS MUCH SIMPLER. The fourth version had four gradients, a neck, a
// contact ellipse, a bright far rim and a specular rectangle - about a dozen
// shapes modelling a real object at forty pixels, where all that detail turns
// to mud and reads as "something complicated and orange". Ethan asked for
// "simple orange". One gradient on the head, one flat shaft, one hole. A push
// pin seen from the front is a round orange head and not much else.
//
// EVERY PIN IS TRYP ORANGE. There used to be a green one for an answered
// question. It made the wall two-coloured on a page that had already had its
// amber-and-green paper taken away, and a pin is a pin - it is what holds the
// paper up, not what the paper says. The state reads from the band across the
// top of the note and its tag chip.
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
        {/* THE HEAD. One radial, lit from the top left like everything else in
            this product. Two brand stops and one dark edge - a sphere needs a
            highlight, a midtone and a terminator, and anything past that is
            detail nobody can see at 40px. */}
        <radialGradient id="tack-head" cx="34%" cy="28%" r="76%">
          <stop offset="0%" stopColor="#ffb98a" />
          <stop offset="38%" stopColor="#f5853f" />
          <stop offset="100%" stopColor="#c03c05" />
        </radialGradient>
        {/* THE PAPER GIVING WAY AROUND THE HOLE. A sheet held by a pin dips
            towards it, and the dip is darkest at the hole and gone within a few
            millimetres. Soft, and much smaller than the version this replaces -
            that one was 34px wide, which is a shadow the size of the note. */}
        <radialGradient id="tack-pucker" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="rgba(26,26,26,0.22)" />
          <stop offset="45%" stopColor="rgba(26,26,26,0.09)" />
          <stop offset="100%" stopColor="rgba(26,26,26,0)" />
        </radialGradient>
        {/* Inside the hole. Not black: a hole in white paper over a white page
            shows the edge of the sheet, so it is a warm dark brown rather than
            a void. */}
        <linearGradient id="tack-hole" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#2b1a10" />
          <stop offset="100%" stopColor="#6b4a35" />
        </linearGradient>
      </defs>
    </svg>
  )
}

/**
 * One pin, pushed THROUGH the top of whatever it is holding up.
 *
 * `top` is a Tailwind class rather than a prop with a number in it, because the
 * two callers place it at different depths (the board's notes have more paper
 * above the writing than the hub's do) and a class composes with the rest of
 * the positioning without a style attribute per note.
 */
export default function Thumbtack({ className = 'h-11 w-11', top = 'top-1' }) {
  return (
    <span className={`pointer-events-none absolute ${top} left-1/2 z-10 -translate-x-1/2`} aria-hidden>
      <svg viewBox="0 0 40 40" className={className}>
        {/* ---- ON THE PAPER ---- */}

        {/* The sheet dipping towards the hole. */}
        <ellipse cx="20" cy="26" rx="9.5" ry="4.6" fill="url(#tack-pucker)" />

        {/* The hole itself. An ellipse because you are looking slightly down at
            the sheet, and small - a push pin makes a hole about a millimetre
            across, and a big one reads as a punched eyelet. */}
        <ellipse cx="20" cy="25.6" rx="2.5" ry="1.5" fill="url(#tack-hole)" />

        {/* ---- THE SHAFT, GOING IN ----
            Drawn AFTER the hole so its lower end sits inside it, and BEFORE the
            paper's lit lower rim so the rim crosses in front of it. That
            crossing is the single mark that says the shaft is behind the sheet
            rather than lying on it. Steel, not orange: the coloured part of a
            push pin is the head. */}
        <path d="M18.4 15 h3.2 v9.6 q0 1.2 -1.6 1.2 t-1.6 -1.2 Z" fill="#8f9299" />
        <path d="M18.4 15 h1.2 v10.4 q-1.2 -0.2 -1.2 -0.8 Z" fill="#c8cbd1" />

        {/* The paper's own thickness on the lower rim of the hole. A hole in a
            sheet lit from above is dark at the top and CATCHES LIGHT at the
            bottom, where the torn edge turns up towards the light. Four pixels
            of near-white, and it is what makes the hole read as a hole rather
            than as a dot. */}
        <path d="M17.5 25.9 a2.5 1.5 0 0 0 5 0 a2.5 1.9 0 0 1 -5 0 Z" fill="#ffffff" fillOpacity="0.75" />

        {/* ---- THE HEAD, IN FRONT OF EVERYTHING ---- */}

        {/* Its shadow first, thrown down and to the right, lit from the top
            left like the rest of the product. Two ellipses rather than a
            `drop-shadow` filter: this is drawn on up to fifty notes at once and
            a filter is an offscreen pass per element per frame. */}
        <ellipse cx="22.6" cy="20.6" rx="7.4" ry="6.6" fill="rgba(26,26,26,0.16)" />
        <ellipse cx="21.4" cy="19.6" rx="7.2" ry="6.8" fill="rgba(26,26,26,0.10)" />

        {/* The head. Slightly wider than it is tall, because a pin head is a
            squat cylinder seen very nearly end on, not a ball - that one degree
            of flattening is the difference between a thumbtack and a bead, and
            it is the only thing left of the four previous versions' anatomy. */}
        <ellipse cx="20" cy="14.6" rx="7.6" ry="7" fill="url(#tack-head)" />
        {/* A thin darker edge along the bottom, where the head turns away. Not a
            full ring: a ring reads as a printed outline. */}
        <path d="M12.4 14.6 a7.6 7 0 0 0 15.2 0 a7.6 7.8 0 0 1 -15.2 0 Z" fill="#a8330a" fillOpacity="0.55" />
        {/* One soft highlight, up and left, where the light is. */}
        <ellipse cx="17.2" cy="11.6" rx="2.6" ry="1.9" fill="#ffffff" fillOpacity="0.42" transform="rotate(-24 17.2 11.6)" />
      </svg>
    </span>
  )
}
