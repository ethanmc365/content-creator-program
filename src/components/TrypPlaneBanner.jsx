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
// window. The trail runs RIGHT, away from the tail, which is the direction air
// actually leaves an aeroplane travelling left. (For exactly WHERE the tail is,
// see the measurement note below - 78% was a guess and it was also wrong.)
//
// ONE TRAIL, OUT OF THE VERY BACK (9 Sep 2026). Ethan, on the four: "there's
// multiple contrails, so it should only be that one contrail - the line coming
// at the back, very very back of the plane where you'd expect it coming out. We
// don't need those three different heights of contrails, just the one coming
// out of the back that fades away."
//
// Four bars at four heights is a SPEED effect - the stacked streaks a comic
// draws around something moving fast - and this aircraft is cruising, not
// scrambling. It also put three of the four at heights where no aeroplane emits
// anything: 37% and 58% of the artwork's height are its tail fin and its wing
// root respectively.
//
// WHERE THE BACK ACTUALLY IS, MEASURED RATHER THAN GUESSED. Decoding the
// cutout's alpha channel: the aircraft spans 3.5%-98.0% of the image width; at
// x=95% the only opaque pixels are a sliver at y=49.7%-51.0%, which is the
// tailcone and nothing else; the fin rises away from it by x=90%. So the single
// point where air leaves this aeroplane is (98%, 50.3%), and that is where the
// trail starts. Guessing put the old trails at 78%, which is in front of the
// fin - air appearing out of the middle of an aircraft.
//
// IT GROWS FROM THE AIRCRAFT END AND THINS OUT. `transform-origin: 0% 50%` is
// the whole trick: the bar is scaled from its LEFT-hand edge - the end nearest
// the tail - so it appears to be extruded backwards rather than to slide in
// from off-screen.
//
// It also stops short of the tailcone by a whisker: a trail touching the
// aeroplane reads as a line attached to it rather than as air it has left.
//
// EVERYTHING IS CSS. This is the first screen of onboarding, on a phone, on
// whatever connection somebody signed up over; it must not be the reason a
// motion runtime is downloaded.

import { cx } from '../lib/utils'

// The tailcone's own centreline and the first pixel clear of it, both read off
// the artwork - see the note above. They are named rather than inlined because
// the two numbers are a fact about `tryp-plane-cutout.png`: swap the artwork and
// these are what have to be re-measured.
const TAIL_X = '98.5%'
const TAIL_Y = '50.3%'

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
           the tail end and then travels away from it, thinning and fading.

           It is ONE bar now, so the curve has to carry the whole effect on its
           own: it holds full strength for most of the run and gives back the
           last third to the fade, which is what stops a single repeating line
           reading as a metronome. */
        @keyframes trypbTrail {
          0%   { transform: translateX(0) scaleX(.04); opacity: 0; }
          18%  { opacity: 1; }
          62%  { opacity: .85; }
          100% { transform: translateX(40%) scaleX(1); opacity: 0; }
        }
        .trypb-plane { animation: trypbTakeoff .9s cubic-bezier(.22,.9,.3,1) both;
                       will-change: transform, opacity; backface-visibility: hidden; }
        .trypb-bob   { animation: trypbCruise 4.2s ease-in-out infinite .9s;
                       transform-origin: center; will-change: transform; backface-visibility: hidden; }
        /* Strongest at the tail end (left) and fading away to the right, which
           is the direction it is travelling. */
        .trypb-trail { position: absolute; height: 2px; border-radius: 999px;
                       background: linear-gradient(90deg, #d94407, rgba(217,68,7,0));
                       transform-origin: 0% 50%; translate: 0 -50%;
                       animation: trypbTrail 2.4s ease-out infinite .9s;
                       will-change: transform, opacity; }

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
          {/* `translate: 0 -50%` in the class centres the 2px bar ON the
              measured centreline rather than hanging it below - a two-pixel
              error that is a quarter of the tailcone's own thickness. The
              delay in the class is the aircraft's entrance: exhaust from a
              point the plane has not reached yet is not exhaust. */}
          {/* THE TRAIL HAS TO FIT IN THE AIR BEHIND THE AIRCRAFT, and on a
              phone that air is 58px wide: the box is a fixed `w-56` centred in
              a banner not much wider, and the banner clips. Measured on a
              375px phone: the box lays out 205px wide starting 98px in, so the
              trail begins at 300px and the banner ends at 348px - 48px of air.
              15% of the box travelling 40% of its own length lands at 343px,
              which clears it. (16%/55% was the first pass and overshot by 3px,
              at the very end of the run where the opacity is already 0 - so it
              looked fine and was still a line that stopped rather than faded.)
              Keeps the whole run inside the
              frame at the narrowest width this ever renders at - which matters
              because the tail end of the run is where it fades, and a trail
              that is cut off instead of fading is a line that ends. */}
          <span className="trypb-trail" style={{ top: TAIL_Y, left: TAIL_X, width: '15%' }} />
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
