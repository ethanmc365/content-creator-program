import { motion } from 'motion/react'
import { listContainer, listItem } from '../../lib/motion'

// A grid or list whose children arrive one after another as it scrolls into
// view. THE animation of this product, extracted.
//
// WHY IT IS A COMPONENT RATHER THAN TWO VARIANTS YOU IMPORT
//
// The stagger already existed as `listContainer` + `listItem` in lib/motion, and
// using it meant three things at every call site: wrap the grid in motion.div,
// remember `initial="hidden" animate="show"`, and turn every child into a
// motion element carrying `variants={listItem}`. Most places did two of the
// three, which is why some grids staggered, some faded as one block, and some
// did nothing at all.
//
// This does all three. Children stay plain elements; the wrapper puts each one
// in its own motion.div and hands it the variant.
//
// IN VIEW, NOT ON MOUNT. `whileInView` with `once` is what makes it work on a
// long page: a grid eight screens down animating on mount has spent its motion
// on nobody, and re-animating every time you scroll past is a page that will not
// sit still. The negative viewport margin starts it slightly before the element
// is on screen so the motion is FINISHING as it arrives.
//
// Reduced motion needs nothing here: <MotionConfig reducedMotion="user"> in
// main.jsx already drops the transform and keeps the opacity fade.
export default function Reveal({
  children,
  className,
  as: Tag = 'div',
  // `stagger` lets a dense list run tighter than a sparse grid. Past about 60ms
  // per child a grid stops reading as "arriving" and starts reading as "slow",
  // so the ceiling is deliberately low.
  stagger = 0.045,
  // Everything after this many children arrives together. A 40-card directory
  // staggered at 45ms would take nearly two seconds to finish drawing, and the
  // cards at the end would animate long after the reader had scrolled past them.
  maxStagger = 12,
}) {
  const MotionTag = motion[Tag] || motion.div
  const kids = Array.isArray(children) ? children : [children]
  return (
    <MotionTag
      className={className}
      variants={{
        ...listContainer,
        show: { transition: { staggerChildren: stagger, delayChildren: 0.03 } },
      }}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: '0px 0px -10% 0px' }}
    >
      {kids.filter(Boolean).map((child, i) => (
        <motion.div
          // The child's own key is what React needs; this wrapper is positional
          // and never reorders independently of it.
          key={child?.key ?? i}
          variants={i < maxStagger ? listItem : { hidden: { opacity: 0 }, show: { opacity: 1 } }}
          // Grid cells have to stretch or a card that fills its row height
          // stops filling it the moment a wrapper appears between the two.
          className="h-full"
        >
          {child}
        </motion.div>
      ))}
    </MotionTag>
  )
}
