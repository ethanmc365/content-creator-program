import { cx } from '../../lib/utils'

// AN AIRCRAFT, DRAWN.
//
// WHY THESE ARE SILHOUETTES AND NOT PHOTOGRAPHS. Ethan asked for "an aircraft
// collection page showing an image of all the aircraft types you've been on",
// and the obvious reading of that is photographs. Photographs are the one thing
// this cannot be:
//
//   * EVERY GOOD PHOTOGRAPH OF AN AIRLINER IS SOMEBODY'S. Airliner photography
//     is a hobby with a licensing culture, and shipping twenty-four of them
//     because they were on an image search is how a small product acquires a
//     large letter.
//   * THE CSP FORBIDS IT ANYWAY. Nothing on this platform loads an image from a
//     host we do not own, so they would have to be twenty-four files in the
//     repository, and twenty-four aircraft photographs at a usable size is
//     several megabytes shipped to look at a page most people open once.
//   * A PHOTOGRAPH OF AN A320 AND A PHOTOGRAPH OF A 737 ARE THE SAME PICTURE to
//     everybody who is not a spotter. What actually distinguishes the types a
//     traveller has been on is the SHAPE CLASS - propellers, a small regional
//     jet, a single-aisle, a twin-aisle, and the four-engined giants - and a
//     drawing can say that at a glance and at any size.
//
// So each type is drawn from its own fleet-table row: `body` decides the
// planform and the engine count comes from the type itself. A wing is a wing,
// but a turboprop has propellers, a widebody is visibly fatter and longer, and
// an A380 has four engines and a double deck. Line art in one colour, which is
// the icon language the rest of this product is drawn in.

// The four-engined ones. Nothing else in the fleet table has more than two, and
// working it out from the seat count would be a rule that quietly breaks the
// day somebody adds a 777-9.
const QUADS = new Set(['a380', 'b747'])

// PROPORTIONS PER CLASS, all in one 200x120 box so a wall of them lines up.
//   span    wingtip to wingtip
//   len     nose to tail
//   sweep   how far back the tips sit - a turboprop's wing is straight, a
//           widebody's is raked
//   engines where along the half-span the nacelles hang
// THE DIFFERENCES ARE EXAGGERATED ON PURPOSE. A drawn A319 and a drawn 787 at
// card size are, in strict proportion, almost the same picture - a fuselage
// with two swept wings - and a collection whose entries all look alike is not a
// collection. So the span, the length, the sweep and above all the FUSELAGE
// WIDTH are pushed apart until the four classes are distinguishable at a
// glance: a turboprop is short, straight-winged and has propellers; a regional
// jet is small and slim; a single aisle is the familiar middle; a widebody is
// visibly long and fat with a heavily raked wing.
const SHAPES = {
  turboprop: { span: 92, len: 66, sweep: 0, chord: 8, engines: [0.32], prop: true, tail: 22, fat: 4.2 },
  regional: { span: 72, len: 74, sweep: 10, chord: 6.5, engines: [0.28], tail: 22, fat: 4.4 },
  narrowbody: { span: 92, len: 94, sweep: 17, chord: 8, engines: [0.34], tail: 26, fat: 5.8 },
  widebody: { span: 118, len: 112, sweep: 24, chord: 10.5, engines: [0.32], tail: 32, fat: 8.8 },
}

/** One aircraft, from above.
 *
 * @param {{key?: string, body?: string, name?: string}} type  a row from AIRCRAFT
 * @param {boolean} owned  drawn solid when you have flown it, ghosted when not
 */
export default function AircraftArt({ type, owned = true, className }) {
  const shape = SHAPES[type?.body] || SHAPES.narrowbody
  const quad = QUADS.has(type?.key)
  const { span, len, sweep, chord, tail, fat } = shape
  const cx0 = 100
  const cy0 = 60
  const nose = cy0 - len / 2
  const back = cy0 + len / 2
  const half = span / 2
  // Four engines sit at two stations per side; two sit at one.
  const stations = quad ? [0.28, 0.55] : shape.engines

  const wing = (dir) => {
    const tip = cx0 + dir * half
    return `M${cx0} ${cy0 - 6}
            L${tip} ${cy0 - 6 + sweep}
            L${tip} ${cy0 - 6 + sweep + chord * 0.5}
            L${cx0} ${cy0 - 6 + chord * 1.9} Z`
  }

  const stabiliser = (dir) => {
    const tip = cx0 + dir * (span * 0.19)
    return `M${cx0} ${back - tail * 0.7}
            L${tip} ${back - tail * 0.7 + 7}
            L${tip} ${back - tail * 0.7 + 11}
            L${cx0} ${back - tail * 0.24} Z`
  }

  return (
    <svg
      viewBox="0 0 200 120"
      className={cx('h-full w-full', className)}
      fill="none"
      aria-hidden
    >
      <g
        className={owned ? 'text-brand' : 'text-gray-300'}
        fill="currentColor"
        opacity={owned ? 1 : 0.55}
      >
        {/* Fuselage: a rounded capsule with a pointed nose. `fat` is the whole
            difference between a regional jet and a 747 at this size. */}
        <path
          d={`M${cx0} ${nose}
              C${cx0 + fat} ${nose + 6} ${cx0 + fat} ${nose + 10} ${cx0 + fat} ${nose + 16}
              L${cx0 + fat} ${back - 12}
              C${cx0 + fat} ${back - 4} ${cx0 + fat * 0.5} ${back} ${cx0} ${back}
              C${cx0 - fat * 0.5} ${back} ${cx0 - fat} ${back - 4} ${cx0 - fat} ${back - 12}
              L${cx0 - fat} ${nose + 16}
              C${cx0 - fat} ${nose + 10} ${cx0 - fat} ${nose + 6} ${cx0} ${nose} Z`}
        />
        <path d={wing(1)} />
        <path d={wing(-1)} />
        <path d={stabiliser(1)} />
        <path d={stabiliser(-1)} />

        {/* Engines. A turboprop gets a disc for the propeller instead of a
            nacelle, which is the one silhouette difference anybody can name. */}
        {[1, -1].flatMap((dir) =>
          stations.map((st, i) => {
            const x = cx0 + dir * half * st
            const y = cy0 - 2 + sweep * st
            return shape.prop ? (
              <g key={`${dir}-${i}`}>
                <rect x={x - 3.4} y={y - 4} width="6.8" height="13" rx="3.2" />
                <ellipse cx={x} cy={y - 7} rx="9.5" ry="2.2" opacity="0.45" />
              </g>
            ) : (
              <rect
                key={`${dir}-${i}`}
                x={x - (type?.body === 'widebody' ? 4.4 : 3.6)}
                y={y - 3}
                width={type?.body === 'widebody' ? 8.8 : 7.2}
                height={type?.body === 'widebody' ? 16 : 13}
                rx="3.4"
              />
            )
          }),
        )}
      </g>
    </svg>
  )
}

/** The same drawing at chip size, for a row in a list. */
export function AircraftGlyph({ type, className }) {
  return (
    <span className={cx('inline-block h-6 w-9 shrink-0', className)}>
      <AircraftArt type={type} />
    </span>
  )
}
