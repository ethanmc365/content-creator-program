// THE TRYP.COM PLANE, AS A BAND INSIDE A CARD.
//
// Ethan (9 Sep 2026), about the first onboarding screen: "the very first page
// after you enter email and password says 'welcome to the team' and your name,
// and then below that it shows the three cards. Below the title and above those
// three cards we can add in the Tryp.com animated plane with the little
// contrails coming out the back of it. It would add some colour, really improve
// it, make sure it looks good on both desktop and mobile - the plane animating
// smoothly, and obviously it loads in cleanly with the nice animation."
//
// WHY THIS IS ITS OWN COMPONENT AND NOT A THIRD COPY.
//
// The plane already exists twice: `TrypPlaneScene` is the full-screen takeover
// (offline, error, 404) and `SubmissionSuccess` has a scaled-down band of it
// inside a card. Both grew their own copy of the clouds, the cruise keyframes
// and the reduced-motion block, and a third copy pasted into Onboarding would
// be the point at which changing the plane means changing it in three places.
// So this is the CARD BAND, extracted, with the contrails added - and
// SubmissionSuccess is deliberately left alone for now: it is a celebration
// with a takeoff entrance tuned to that moment, and merging the two would mean
// one component with a mode flag rather than two that each do one thing.
//
// THE CONTRAILS ARE THE NEW PART, and they are what make a static bitmap read
// as a plane in flight. Four streaks behind the wing, each a rounded bar that
// grows from nothing, runs backwards away from the aircraft and thins out -
// staggered, at four different lengths and speeds, so the eye never catches the
// loop. They are drawn BEHIND the plane in the same stacking context, and they
// stop short of it by a few pixels: a trail touching the fuselage reads as a
// line attached to the plane rather than as air it has already left.
//
// EVERYTHING IS CSS. This is the first screen of onboarding on a phone, on
// whatever connection somebody signed up over, and it must not be the reason a
// motion runtime is downloaded. Same argument as the landing page's counter.

import { cx } from '../lib/utils'

// Cloud positions across the band. Deliberately few: three drifting shapes read
// as sky, and six read as weather.
const CLOUDS = [
  { top: '14%', scale: 0.46, dur: 15, delay: -1, o: 0.85 },
  { top: '58%', scale: 0.32, dur: 11, delay: -7, o: 0.65 },
  { top: '36%', scale: 0.6, dur: 19, delay: -13, o: 0.42 },
]

// The four trails, as [top, width, duration, delay]. The two nearest the middle
// are the engine trails and are the longest and brightest; the outer pair are
// shorter and fainter, which is what gives the group a shape rather than making
// it four identical bars.
const TRAILS = [
  { top: '42%', w: 38, dur: 2.2, delay: 0, o: 0.55 },
  { top: '52%', w: 30, dur: 2.6, delay: 0.35, o: 0.42 },
  { top: '34%', w: 22, dur: 3.0, delay: 0.7, o: 0.3 },
  { top: '61%', w: 17, dur: 2.4, delay: 1.1, o: 0.24 },
]

// The same chunky cloud the other two plane surfaces draw, white on orange.
function Cloud({ style }) {
  const bumps = [
    ['circle', 46, 40, 28],
    ['circle', 84, 33, 26],
    ['circle', 112, 46, 22],
    ['circle', 24, 52, 20],
    ['ellipse', 72, 60, 60, 22],
  ]
  return (
    <svg viewBox="0 0 150 88" style={style} aria-hidden="true">
      {bumps.map((b, i) => (b[0] === 'circle'
        ? <circle key={i} cx={b[1]} cy={b[2]} r={b[3]} fill="#ffffff" />
        : <ellipse key={i} cx={b[1]} cy={b[2]} rx={b[3]} ry={b[4]} fill="#ffffff" />))}
    </svg>
  )
}

/**
 * @param {string} [className] spacing for the caller; the band brings its own
 *                             height, radius and colour.
 */
export default function TrypPlaneBanner({ className = '' }) {
  return (
    <div
      className={cx(
        'relative h-24 overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light shadow-card sm:h-32',
        className,
      )}
      aria-hidden="true"
    >
      <style>{`
        /* THE ENTRANCE AND THE CRUISE MEET AT IDENTITY, and that is not a
           detail: SubmissionSuccess's two animations used to hand over at
           0deg and -1deg and the plane visibly snapped a degree at the join.
           trypbTakeoff ends on translate(0,0) scale(1) rotate(0) and
           trypbCruise starts there, so the handover is invisible.
           (No backticks in here: this whole block is a template literal.) */
        @keyframes trypbTakeoff {
          0%   { transform: translate(-34%, 14px) scale(.9); opacity: 0 }
          50%  { opacity: 1 }
          100% { transform: translate(0, 0) scale(1); opacity: 1 }
        }
        @keyframes trypbCruise {
          0%, 100% { transform: translate(0, 0) rotate(0deg) }
          50%      { transform: translate(-4px, -6px) rotate(1deg) }
        }
        @keyframes trypbCloud {
          0%       { transform: translateX(-100%); opacity: 0 }
          14%, 86% { opacity: 1 }
          100%     { transform: translateX(100%); opacity: 0 }
        }
        /* A TRAIL IS AIR THE PLANE HAS ALREADY LEFT, so it grows from the
           aircraft end and travels AWAY from it while fading. The transform
           origin is the right-hand edge - the end nearest the plane - so the
           bar appears to be extruded backwards rather than to slide in from
           somewhere off-screen. */
        @keyframes trypbTrail {
          0%   { transform: translateX(0) scaleX(.1); opacity: 0 }
          18%  { opacity: 1 }
          100% { transform: translateX(-120px) scaleX(1); opacity: 0 }
        }
        .trypb-plane { animation: trypbTakeoff .9s cubic-bezier(.22,.9,.3,1) both;
                       will-change: transform, opacity; backface-visibility: hidden }
        .trypb-bob   { animation: trypbCruise 4.2s ease-in-out infinite .9s;
                       transform-origin: center; will-change: transform; backface-visibility: hidden }
        .trypb-cloud { position: absolute; left: 0; width: 100%; pointer-events: none;
                       animation: trypbCloud linear infinite; will-change: transform, opacity }
        .trypb-trail { position: absolute; height: 3px; border-radius: 999px; background: #ffffff;
                       transform-origin: 100% 50%;
                       animation: trypbTrail ease-out infinite; will-change: transform, opacity }

        /* Somebody who asked for less motion gets the picture and none of the
           movement - the plane at its resting pose, the clouds parked where
           they read as a sky, and no trails at all, because a trail with no
           motion is a set of white dashes with nothing to explain them. */
        @media (prefers-reduced-motion: reduce) {
          .trypb-plane { animation: none; opacity: 1 }
          .trypb-bob   { animation: none }
          .trypb-cloud { animation: none; transform: translateX(18%); opacity: 1 }
          .trypb-trail { animation: none; opacity: 0 }
        }
      `}</style>

      {/* Clouds, behind everything. */}
      <div className="pointer-events-none absolute inset-0">
        {CLOUDS.map((c, i) => (
          <div
            key={i}
            className="trypb-cloud"
            style={{ top: c.top, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}
          >
            <Cloud style={{ width: 150 * c.scale, opacity: c.o }} />
          </div>
        ))}
      </div>

      {/* The trails, and then the plane on top of them. Both are centred on the
          same box so the trails start at the plane's own tail whatever width
          the band happens to be. */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative w-40 max-w-[68%] sm:w-52">
          <div className="pointer-events-none absolute inset-y-0 right-[62%] w-40">
            {TRAILS.map((t, i) => (
              <span
                key={i}
                className="trypb-trail"
                style={{
                  top: t.top,
                  right: 0,
                  width: t.w,
                  opacity: t.o,
                  animationDuration: `${t.dur}s`,
                  // The trails wait for the plane to arrive. Starting them
                  // under a plane that is still sliding in from the left draws
                  // exhaust from a point the aircraft has not reached.
                  animationDelay: `${0.9 + t.delay}s`,
                }}
              />
            ))}
          </div>
          <div className="trypb-plane">
            <div className="trypb-bob">
              <img
                src="/brand/tryp-plane-cutout.png"
                alt=""
                className="w-full drop-shadow-[0_6px_14px_rgba(0,0,0,0.16)]"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
