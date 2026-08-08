// The platform's motion language, defined once.
//
// Same reasoning as programme.js holding every metric definition: if spring
// values live inline in each page, "how a card enters" drifts into six slightly
// different answers and the app stops feeling like one product. Import these.
//
// House rule this encodes: things LIFT and MAGNIFY on hover, they never change
// colour. The brand orange stays constant.

// A spring, not a duration curve. Durations feel mechanical when a user
// interrupts them mid-flight (hovering off a card before it settles); a spring
// re-targets from wherever it currently is and stays continuous.
export const SPRING = { type: 'spring', stiffness: 400, damping: 30 }
export const SOFT_SPRING = { type: 'spring', stiffness: 260, damping: 26 }

// Reduced motion is handled globally by <MotionConfig reducedMotion="user"> in
// main.jsx, not per component. Motion then drops transform and layout
// animations for anyone with the OS setting on, while still cross-fading
// opacity so content does not pop in abruptly.
//
// It is deliberately NOT a hand-rolled matchMedia check here: an exported
// helper that every new component has to remember to call is a helper that
// gets forgotten, and the failure mode is invisible to whoever forgets.

// Container that reveals its children one after another. Stagger is small on
// purpose: past about 60ms a grid stops reading as "arriving" and starts
// reading as "slow".
export const listContainer = {
  hidden: {},
  show: {
    transition: { staggerChildren: 0.05, delayChildren: 0.04 },
  },
}

export const listItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: SOFT_SPRING },
}

// Hover/tap for anything card-shaped and clickable.
export const cardHover = {
  whileHover: { y: -4, scale: 1.01, transition: SPRING },
  whileTap: { scale: 0.99, transition: SPRING },
}

// Page-level entrance. Opacity only, deliberately: a persisted transform on a
// page wrapper becomes a containing block for position:fixed children, which is
// what breaks the mobile chat overlay (see the note on `page-in` in
// tailwind.config.js). Do not add y or scale here.
export const pageFade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  transition: { duration: 0.25, ease: 'easeOut' },
}

// ---------------------------------------------------------------------------
// The rest of the language, added when the network build needed more than
// "fade a list in".
// ---------------------------------------------------------------------------

// The curve almost everything non-spring uses. It leaves fast and arrives slow
// with no overshoot, which is what makes a transition feel like it settled
// rather than stopped. Same shape as the system easing on Apple platforms.
export const EASE = [0.22, 1, 0.36, 1]

// Springs, by weight. A heavier thing should not snap like a chip does.
export const SNAPPY = { type: 'spring', stiffness: 520, damping: 32 }   // toggles, chips
export const GENTLE = { type: 'spring', stiffness: 210, damping: 28 }   // panels, sheets
export const HEAVY = { type: 'spring', stiffness: 140, damping: 24 }    // full-screen

// A section arriving as it scrolls into view. `once` because a page that
// re-animates every time you scroll past is a page that will not sit still.
// The margin fires it slightly BEFORE the element is on screen, so the motion
// is finishing as it arrives rather than starting when it is already there.
export const reveal = {
  initial: { opacity: 0, y: 18 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: '0px 0px -12% 0px' },
  transition: { duration: 0.5, ease: EASE },
}

// Press feedback for anything tappable that is not a card. Scales DOWN on
// press: growing under the finger reads as the element escaping, shrinking
// reads as it being pushed.
export const pressable = {
  whileHover: { scale: 1.02, transition: SNAPPY },
  whileTap: { scale: 0.96, transition: SNAPPY },
}

// A modal or sheet. Enter with a touch of scale so it grows out of nothing;
// exit faster than it entered, because waiting for something you dismissed is
// the most noticeable kind of slow.
export const overlay = {
  initial: { opacity: 0, scale: 0.97, y: 12 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.98, y: 6, transition: { duration: 0.15, ease: 'easeIn' } },
  transition: GENTLE,
}

// Bottom sheet on a phone.
export const sheet = {
  initial: { y: '100%' },
  animate: { y: 0 },
  exit: { y: '100%', transition: { duration: 0.2, ease: 'easeIn' } },
  transition: { type: 'spring', stiffness: 380, damping: 36 },
}
