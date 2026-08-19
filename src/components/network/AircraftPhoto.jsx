import { useState } from 'react'
import AircraftArt from './AircraftArt'
import credits from '../../lib/aircraftPhotoCredits.json'
import { cx } from '../../lib/utils'

// THE REAL AEROPLANE.
//
// This page shipped with `AircraftArt` - thirty-odd hand-drawn SVG cut-outs -
// and the file next door still holds the argument for why. It was a good
// argument and it was overruled by the person who has to look at the page:
// Ethan, "on the aircraft collection page, I wanted actual real life clean cut
// out photos of all the planes, not just an icon, please search, find, verify
// and add a clean ui of the actual real life images of each of the planes."
//
// HOW THE THREE OBJECTIONS IN AircraftArt WERE ACTUALLY ANSWERED, because none
// of them was wrong, they just had answers:
//
//   LICENSING. Every photograph here is from Wikimedia Commons and every one
//   carries a permissive licence - CC BY, CC BY-SA, GFDL or public domain. The
//   file, the photographer and the licence for all thirty-seven are recorded in
//   `lib/aircraftPhotoCredits.json` and printed at the foot of the collection
//   page, which is what those licences ask for.
//
//   THE CSP. `img-src 'self'` and nothing else, so a remote image was never an
//   option - and it is not one now either. They are downloaded, at 640px wide,
//   into `public/aircraft`. Thirty-seven of them come to 2.6MB in the repo, and
//   nobody downloads more than the handful their own screen shows: they are
//   `loading="lazy"`, so a wall of ghosted widebodies below the fold costs a
//   visitor nothing until they scroll to it.
//
//   "THEY ALL LOOK THE SAME." This is the one that was actually true and it is
//   a framing problem, not a photography problem. A spotter's shot is 80% sky.
//   Every one of these was chosen off a contact sheet for being a side-on or
//   three-quarter view with the aircraft filling the frame - and then it is
//   drawn `object-cover` in a fixed 16:9 box, so the aeroplane, not the sky, is
//   what the card is made of. An A380 and an ATR 72 are not remotely the same
//   picture at that size.
//
// A TYPE WITH NO PHOTOGRAPH STILL GETS A CARD. `AircraftArt` is the fallback
// and always will be: somebody adds a type to the table long before anybody
// finds a freely licensed photograph of it, and a card with a drawing on it is
// a card, where a card with a broken image on it is a bug.

/** Every type we hold a photograph for. */
export const PHOTO_KEYS = new Set(Object.keys(credits))
export const photoCredits = credits

// THE PHOTOGRAPH IS NEVER DRAINED ANY MORE.
//
// An unflown type used to be `opacity-45 grayscale`, recolouring on hover. The
// argument was that it keeps the shape and takes the colour, so a gap reads as
// not-yet-yours. Ethan: "I don't like how all the planes are grayed out. I
// think it looks bad. All the plane photos should be normal. The way to
// identify them is I think the card should normally be white if it's not
// collected, and it should be the bright tryp.com orange if you have collected
// that plane."
//
// He is right about where the signal belongs. A washed-out photograph reads as
// a broken image before it reads as a state, and on a wall that is mostly
// unflown it made the whole page look faulty. The state moved to the CARD -
// white for a gap, brand orange for one you have - which is louder, cannot be
// mistaken for a rendering fault, and leaves every photograph looking like the
// aeroplane it is.
//
// `owned` is kept in the signature because `AircraftArt` (the fallback for a
// type with no photograph) still draws itself differently, and because callers
// pass it.
export default function AircraftPhoto({ typeKey, type, owned = true, className }) {
  // `broken` covers the one case the key check cannot: a file that is in the
  // credits but missing from the build. Falling back to the drawing is silent
  // and correct; an alt-text-in-a-box is neither.
  const [broken, setBroken] = useState(false)
  const has = typeKey && PHOTO_KEYS.has(typeKey) && !broken

  if (!has) {
    return (
      <span className={cx('flex h-full w-full items-center justify-center', className)}>
        <AircraftArt type={type} owned={owned} />
      </span>
    )
  }

  return (
    <span className={cx('relative block h-full w-full overflow-hidden rounded-xl bg-cloud', className)}>
      <img
        src={`/aircraft/${typeKey}.jpg`}
        alt={type?.name || ''}
        loading="lazy"
        decoding="async"
        onError={() => setBroken(true)}
        className={cx(
          'h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.06]',
        )}
      />
      {/* A whisper of a gradient along the bottom edge. The cards carry a name
          under the picture and a bright sky meeting white paper is a hard line;
          this is what makes the photograph sit IN the card rather than on it. */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/15 to-transparent" />
    </span>
  )
}
