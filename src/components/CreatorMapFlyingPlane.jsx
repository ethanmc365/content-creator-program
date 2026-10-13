import { BRAND, PLANE_D, CAN_MOTION_PATH } from './CreatorMapParts'

// An airplane that FLIES along a path, nose pointed the way it travels. Used
// both for the "we're all connected" threads and the travelling-now journeys,
// so every plane on the map moves. `dur` (seconds) is set by the caller from
// path length so all planes share one speed.
//
// IT IS A CSS MOTION PATH NOW, NOT SMIL.
//
// That last clause is the whole diagnosis. A thing that is stopped and then
// CONTINUES was paused; a thing that is stopped and then APPEARS WHERE IT WOULD
// HAVE BEEN was never paused at all - its clock ran the whole time and only the
// drawing was stale. That is Chrome's SMIL time container: it is suspended for
// an SVG that is not being painted, and this map spends its first seconds held
// at `opacity: 0` below the fold, so by the time it is on screen the container
// has to reconcile with the wall clock and every aircraft teleports to the
// position it would have reached. `svg.setCurrentTime(0)` on the frame the
// entrance starts was an attempt to rewind that, and it cannot win: setting the
// time on a container that has not started yet does not start it.
//
// The pins and the threads never had this problem, and they are the evidence:
// they are ordinary CSS animations. So the aircraft are too. `offset-path`
// takes the same path string `animateMotion` took, in the same user units, and
// `offset-rotate: auto` is the same as `rotate="auto"` - but it runs on the
// document's animation timeline, which pauses and resumes like everything else
// on the page and cannot get out of step with what is on screen.
//
// `flying` is what holds them at the start of their routes until the map is
// actually being looked at. A paused animation sits at frame zero, which is the
// beginning of the path, so they set off together with the rest of the arrival
// instead of fading in mid-ocean.
export function FlyingPlane({ path, dur, zoom, opacity = 1, arriving = false, flying = true }) {
  const s = 0.85 / Math.max(zoom, 1)
  return (
    // FOUR NESTED GROUPS, AND EACH ONE OWNS EXACTLY ONE TRANSFORM.
    //
    // THE TRAP, WHICH OUTLIVED SMIL. `offset-path` writes the element's
    // transform exactly as `<animateMotion>` drove its parent's, and a CSS
    // transform on an element overrides the SVG transform on that same element.
    // So the movement, the arrival and the counter-scale each need a group of
    // their own - putting any two on one element parks every aircraft at the
    // top-left corner of the map. This is the same trap that silently flattened
    // the Flight Path aircraft to scale 1 for weeks.
    //
    //   outer   opacity only
    //   motion  the flight path (offset-path, or animateMotion on old engines)
    //   middle  the arrival (CSS)
    //   inner   the counter-scale and the nose-up rotation (SVG attribute)
    <g style={{ pointerEvents: 'none', opacity }}>
      <g
        style={CAN_MOTION_PATH
          ? {
            offsetPath: `path("${path}")`,
            offsetRotate: 'auto',
            animationName: 'map-fly', animationDuration: `${dur}s`, animationTimingFunction: 'linear', animationIterationCount: 'infinite',
            animationPlayState: flying ? 'running' : 'paused',
          }
          : undefined}
      >
      {/* `arriving` holds the aircraft off until the pins have landed, so the
          arrival reads as land, then threads, then places, then traffic. Once
          the map has settled the class comes off and a plane added later
          simply appears. */}
      <g className={arriving ? 'map-plane-in' : undefined}>
        <g transform={`scale(${s}) rotate(90)`}>
          {/* No drop-shadow filter. It is one offscreen pass per plane per frame
              on an element that MOVES every frame, which is the most expensive
              thing a filter can be attached to. The white outline already lifts
              it off the land, which is what the shadow was for. */}
          <path
            d={PLANE_D}
            fill={BRAND}
            stroke="#ffffff"
            strokeWidth={1.3}
            strokeLinejoin="round"
          />
        </g>
      </g>
      </g>
      {/* The old engine's version of the line above. One or the other, never
          both - two things driving one transform is the trap in the note. */}
      {!CAN_MOTION_PATH && (
        <animateMotion dur={`${dur}s`} repeatCount="indefinite" rotate="auto" path={path} />
      )}
    </g>
  )
}
