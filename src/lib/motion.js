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

// Respect the OS setting. This is an accessibility requirement, not a nicety:
// vestibular disorders make large motion genuinely unpleasant, and the browser
// already knows the answer.
export function prefersReducedMotion() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

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
