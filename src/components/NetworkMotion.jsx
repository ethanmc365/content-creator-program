import { MotionConfig } from 'motion/react'

// Wraps the network pages so every motion component inside them honours the OS
// "reduce motion" setting. Motion then drops transform and layout animations for
// anyone with it on, while still cross-fading opacity.
//
// It lives HERE rather than around <App /> in main.jsx on purpose. Importing
// anything from `motion` at the top of the tree pulls the whole 39kB library
// into the initial bundle, which every UK creator downloads on every visit
// including the ones who will never open this build. Nesting it inside the two
// lazy pages keeps that cost at zero until an admin actually enters the preview.
export default function NetworkMotion({ children }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
