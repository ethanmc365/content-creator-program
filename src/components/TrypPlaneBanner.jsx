// THE TRYP.COM PLANE, WITH ITS CONTRAILS, ON NOTHING.
//
// Ethan (9 Sep 2026), on the first version: "I didn't ask for that orange
// background or the clouds, and also the contrails are coming out the front the
// wrong way. The contrails should just be the little lines coming straight out
// of the back of the airplane, showing that it's flying."
//
// All three notes are the same note: I reached for the plane SCENE - the
// full-screen takeover's orange sky and cartoon clouds, shrunk into a card -
// when what was asked for was the plane. A coloured band is a picture of the
// sky with an aeroplane in it; this screen wanted an aeroplane. So the
// background is gone, the clouds are gone, and what is left is the mark and the
// air behind it.
//
// WHICH END IS THE BACK: THE PLANE FLIES LEFT. `tryp-plane-cutout.png` is a
// LEFT-facing aircraft - the nose is at about 6% from the left edge and the tail
// fin, the one carrying the Y, is at about 82%. That is the whole of "the
// contrails are coming out the front the wrong way": I had them extruding
// leftwards from 22%, which on this artwork is somewhere around the cockpit
// window. They start at 78% now and run RIGHT, away from the tail, which is
// the direction air actually leaves an aeroplane travelling left.
//
// EACH TRAIL GROWS FROM THE AIRCRAFT END AND THINS OUT. `transform-origin:
// 0% 50%` is the whole trick: the bar is scaled from its LEFT-hand edge - the
// end nearest the tail - so it appears to be extruded backwards rather than to
// slide in from off-screen. Four of them at four lengths, speeds and opacities,
// so the group has a shape and the eye never catches the loop.
//
// They also stop short of the fuselage by a couple of percent: a trail touching
// the aeroplane reads as a line attached to it rather than as air it has left.
//
// EVERYTHING IS CSS. This is the first screen of onboarding, on a phone, on
// whatever connection somebody signed up over; it must not be the reason a
// motion runtime is downloaded.

import { cx } from '../lib/utils'

// [top, length %, seconds, delay, opacity]. The two nearest the fuselage centre
// are the engine trails - longest and strongest; the outer pair are shorter and
// fainter, which is what stops four bars reading as a barcode.
const TRAILS = [
  { top: '44%', w: 26, dur: 2.1, delay: 0, o: 0.55 },
  { top: '51%', w: 19, dur: 2.5, delay: 0.4, o: 0.38 },
  { top: '37%', w: 14, dur: 2.9, delay: 0.8, o: 0.26 },
  { top: '58%', w: 10, dur: 2.3, delay: 1.2, o: 0.2 },
]

/**
 * @param {string} [className] spacing for the caller; the banner brings only
 *                             its own height.
 */
export default function TrypPlaneBanner({ className = '' }) {
  return (
    <div className={cx('relative h-20 w-full overflow-hidden sm:h-28', className)} aria-hidden="true">
      <style>{`
        /* The entrance and the cruise meet at identity - translate(0,0) scale(1)
           rotate(0) - so the handover between them is invisible. Two animations
           that end and start on different transforms is how the plane in
           SubmissionSuccess used to snap a degree at the join. */
        @keyframes trypbTakeoff {
          0%   { opacity: 0; transform: translate(-26%, 10px) scale(.92); }
          55%  { opacity: 1; }
          100% { opacity: 1; transform: translate(0, 0) scale(1); }
        }
        @keyframes trypbCruise {
          0%, 100% { transform: translate(0, 0) rotate(0deg); }
          50%      { transform: translate(-3px, -5px) rotate(.8deg); }
        }
        /* A trail is air the aircraft has already left, so it is extruded from
           the tail end and then travels away from it, thinning and fading. */
        @keyframes trypbTrail {
          0%   { transform: translateX(0) scaleX(.05); opacity: 0; }
          20%  { opacity: 1; }
          100% { transform: translateX(85%) scaleX(1); opacity: 0; }
        }
        .trypb-plane { animation: trypbTakeoff .9s cubic-bezier(.22,.9,.3,1) both;
                       will-change: transform, opacity; backface-visibility: hidden; }
        .trypb-bob   { animation: trypbCruise 4.2s ease-in-out infinite .9s;
                       transform-origin: center; will-change: transform; backface-visibility: hidden; }
        /* Strongest at the tail end (left) and fading away to the right, which
           is the direction it is travelling. */
        .trypb-trail { position: absolute; height: 2px; border-radius: 999px;
                       background: linear-gradient(90deg, #d94407, rgba(217,68,7,0));
                       transform-origin: 0% 50%;
                       animation: trypbTrail ease-out infinite; will-change: transform, opacity; }

        /* Less motion means the picture without the movement: the plane at its
           resting pose and no trails at all, because a trail that is not moving
           is a set of orange dashes with nothing to explain them. */
        @media (prefers-reduced-motion: reduce) {
          .trypb-plane { animation: none; opacity: 1; }
          .trypb-bob   { animation: none; }
          .trypb-trail { animation: none; opacity: 0; }
        }
      `}</style>

      <div className="absolute inset-0 flex items-center justify-center">
        {/* One box holds the aircraft and its air, so the trails stay attached
            to the tail at whatever width the card happens to be. */}
        <div className="relative w-56 max-w-[78%] sm:w-72">
          {TRAILS.map((t, i) => (
            <span
              key={i}
              className="trypb-trail"
              style={{
                top: t.top,
                // Starts just behind the tail fin; see the note above.
                left: '78%',
                width: `${t.w}%`,
                opacity: t.o,
                animationDuration: `${t.dur}s`,
                // They wait for the aircraft to arrive. Exhaust from a point the
                // plane has not reached yet is not exhaust.
                animationDelay: `${0.9 + t.delay}s`,
              }}
            />
          ))}
          <div className="trypb-plane">
            <div className="trypb-bob">
              <img src="/brand/tryp-plane-cutout.png" alt="" className="w-full" />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
