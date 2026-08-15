import { cx } from '../../lib/utils'

// AN AIRCRAFT, DRAWN AS A CUT-OUT.
//
// WHY THESE ARE DRAWINGS AND NOT PHOTOGRAPHS. Ethan asked for "an actual clean
// image of the airplane, all the images should be like a cut out plane in the
// same style, so the design looks clean" and for the picture to be right for the
// type. The second half of that is the achievable half, and photographs are the
// one thing this cannot be:
//
//   * EVERY GOOD PHOTOGRAPH OF AN AIRLINER IS SOMEBODY'S. Airliner photography
//     is a hobby with a licensing culture, and shipping thirty of them because
//     they were on an image search is how a small product acquires a large
//     letter.
//   * THE CSP FORBIDS A REMOTE IMAGE ANYWAY. Nothing on this platform loads a
//     picture from a host we do not own, so they would have to be thirty files
//     in the repository - several megabytes, at a usable size, to look at a page
//     most people open twice.
//   * A PHOTOGRAPH OF AN A320 AND A PHOTOGRAPH OF A 737 ARE THE SAME PICTURE to
//     everybody who is not a spotter, because a photograph is mostly livery.
//
// A cut-out is what he actually described, and a drawn one is better than a
// traced one here: it is the same style for every type by construction, it is
// two kilobytes, it scales, it recolours for the flown/unflown state, and it can
// be made ACCURATE in the ways that are visible from a passenger seat.
//
// WHAT MAKES ONE TYPE DIFFERENT FROM ANOTHER, AND ALL OF IT IS DRAWN
//
//   engine count      two or four, and the four-engined ones are the whole
//                     reason anybody remembers flying an A380 or a 747
//   where the engines are   under the wing, or on the rear fuselage - which is
//                     the single most recognisable thing about a CRJ or an
//                     ERJ-145 and what makes them read as regional jets
//   the tail          a T-tail rides at the top of the fin (rear-engined jets
//                     and most turboprops); everything else carries it low
//   the wingtip       a raked tip (787, 350), a blended winglet (737NG, A330),
//                     a sharklet (A320neo family), or nothing at all
//   proportion        length, span, sweep and above all FUSELAGE WIDTH: a
//                     regional jet is a pencil and a 777 is a barrel
//   the deck          the A380's upper deck, drawn as a second window line, and
//                     the 747's hump
//
// Those are drawn from the fleet table row, with per-type overrides where the
// class default is wrong (an E175 has underwing engines; an ERJ-145 does not).
// The proportions are DELIBERATELY EXAGGERATED - in strict scale a drawn A319
// and a drawn 787 at card size are nearly the same picture, and a collection
// whose entries all look alike is not a collection.

// Four engines. Nothing else in the fleet table has more than two, and deriving
// it from the seat count would be a rule that breaks the day somebody adds a
// 777-9.
const QUADS = new Set(['a380', 'b747', 'b744', 'a340'])

// Engines on the REAR FUSELAGE rather than under the wing, with the tailplane
// carried at the top of the fin. The defining silhouette of the small regional
// jets - and the reason a CRJ is instantly not an Embraer E-Jet, which hangs
// its engines under the wing like everything bigger.
const REAR_ENGINED = new Set(['crj900', 'crj200', 'e145'])

// The hump. Only one shape in the world has it.
const HUMPED = new Set(['b747', 'b744'])

// The full-length upper deck.
const DOUBLE_DECK = new Set(['a380'])

// WINGTIPS, by type. The most visible thing out of a window seat and the
// cheapest way to make two single-aisles read as different aircraft.
//   'sharklet' the tall thin blade of the A320neo family and A220
//   'winglet'  the blended winglet of a 737NG, 767 or A330
//   'raked'    the swept, upturned tip of a 787, A350 or 777-300ER
//   'split'    the 737 MAX's split scimitar
//   'none'     turboprops, older narrowbodies, the A380
const WINGTIPS = {
  a220: 'sharklet', a319: 'winglet', a320: 'none', a320neo: 'sharklet',
  a321: 'winglet', a321neo: 'sharklet', a321xlr: 'sharklet',
  b737: 'winglet', b737max8: 'split', b739: 'winglet', b73g: 'winglet',
  b757: 'winglet', b767: 'winglet',
  a330: 'winglet', a330neo: 'raked', a340: 'winglet',
  b787: 'raked', b788: 'raked', b78x: 'raked',
  b777: 'raked', b772: 'raked', a350: 'raked', a35k: 'raked',
  b747: 'raked', b744: 'winglet', a380: 'none',
  e175: 'winglet', e190: 'winglet', e195e2: 'sharklet',
  crj900: 'none', crj200: 'none', e145: 'none',
  atr72: 'none', atr42: 'none', q400: 'none', c208: 'none', dhc6: 'none',
}

// PROPORTIONS PER CLASS, all in one 200x120 box so a wall of them lines up.
//   span    wingtip to wingtip
//   len     nose to tail
//   sweep   how far back the tips sit - a turboprop's wing is straight, a
//           widebody's is heavily raked
//   chord   how deep the wing is front to back
//   fat     half the fuselage width, which does more work than anything else
//   engine  where along the half-span the nacelle hangs
const SHAPES = {
  turboprop: { span: 96, len: 64, sweep: 0, chord: 8, fat: 4.4, engine: 0.30, tail: 20, prop: true, tTail: true },
  regional: { span: 74, len: 78, sweep: 11, chord: 6.5, fat: 4.2, engine: 0.30, tail: 22 },
  narrowbody: { span: 94, len: 96, sweep: 18, chord: 8, fat: 5.8, engine: 0.34, tail: 26 },
  widebody: { span: 122, len: 114, sweep: 25, chord: 10.5, fat: 9.2, engine: 0.32, tail: 32 },
}

/** One aircraft, seen from above.
 *
 * @param {{key?: string, body?: string, name?: string}} type  a row from AIRCRAFT
 * @param {boolean} owned  drawn solid when you have flown it, ghosted when not
 */
export default function AircraftArt({ type, owned = true, className }) {
  const base = SHAPES[type?.body] || SHAPES.narrowbody
  const key = type?.key
  const quad = QUADS.has(key)
  const rear = REAR_ENGINED.has(key)
  const tTail = base.tTail || rear
  const tip = WINGTIPS[key] || (type?.body === 'widebody' ? 'winglet' : 'none')
  const { span, len, sweep, chord, tail, fat } = base

  const cx0 = 100
  const cy0 = 60
  const nose = cy0 - len / 2
  const back = cy0 + len / 2
  const half = span / 2
  // Four engines sit at two stations per side; two sit at one.
  const stations = quad ? [0.30, 0.58] : [base.engine]

  // The wing root sits a little forward of centre on everything - which is
  // where it actually is, because the wing carries the aeroplane's balance
  // point rather than its middle.
  const rootY = cy0 - 5

  // A WING WITH A TIP ON IT. The leading edge sweeps back, the trailing edge
  // sweeps back further (so the wing narrows outboard, which every swept wing
  // does), and the tip device is drawn as a small tab continuing the line.
  const wing = (dir) => {
    const tx = cx0 + dir * half
    const le = rootY + sweep
    const te = le + chord * 0.55
    return `M${cx0} ${rootY}
            L${tx} ${le}
            L${tx} ${te}
            L${cx0} ${rootY + chord * 1.9} Z`
  }

  const tipDevice = (dir) => {
    if (tip === 'none') return null
    const tx = cx0 + dir * half
    const le = rootY + sweep
    if (tip === 'raked') {
      // A raked tip is a continuation of the wing, swept further back and
      // pointed - it has no vertical blade at all.
      return (
        <path
          key={`tip${dir}`}
          d={`M${tx} ${le} L${tx + dir * 9} ${le + 7} L${tx + dir * 8.5} ${le + 9.6} L${tx} ${le + chord * 0.55} Z`}
        />
      )
    }
    // Seen from above, a winglet is a short bar standing across the tip. The
    // sharklet is taller and thinner than the blended winglet, and the MAX's
    // split scimitar gets a second bar the other way.
    const w = tip === 'sharklet' ? 2.1 : 2.8
    const h = tip === 'sharklet' ? 11 : 8.5
    return (
      <g key={`tip${dir}`}>
        <rect x={tx - (dir > 0 ? 0 : w)} y={le - h * 0.35} width={w} height={h} rx={1} />
        {tip === 'split' && (
          <rect x={tx - (dir > 0 ? 0 : w)} y={le + h * 0.45} width={w} height={h * 0.5} rx={1} />
        )}
      </g>
    )
  }

  // The tailplane. A T-tail is drawn AT THE VERY BACK and a little wider,
  // because from above that is exactly where it appears to be - out on the top
  // of the fin, past the end of the fuselage.
  const stabiliser = (dir) => {
    const y = tTail ? back - tail * 0.16 : back - tail * 0.62
    const reach = span * (tTail ? 0.22 : 0.19)
    const tx = cx0 + dir * reach
    return `M${cx0} ${y}
            L${tx} ${y + (tTail ? 3 : 6)}
            L${tx} ${y + (tTail ? 6.5 : 10)}
            L${cx0} ${y + (tTail ? 8 : 12)} Z`
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
        {/* THE FUSELAGE. A pointed nose, a constant barrel, and a tail cone
            that narrows rather than stopping square - the last of those is
            most of what makes a drawn aeroplane look like an aeroplane. */}
        <path
          d={`M${cx0} ${nose}
              C${cx0 + fat * 0.85} ${nose + 5} ${cx0 + fat} ${nose + 9} ${cx0 + fat} ${nose + 15}
              L${cx0 + fat} ${back - 20}
              C${cx0 + fat} ${back - 12} ${cx0 + fat * 0.55} ${back - 4} ${cx0 + fat * 0.3} ${back}
              L${cx0 - fat * 0.3} ${back}
              C${cx0 - fat * 0.55} ${back - 4} ${cx0 - fat} ${back - 12} ${cx0 - fat} ${back - 20}
              L${cx0 - fat} ${nose + 15}
              C${cx0 - fat} ${nose + 9} ${cx0 - fat * 0.85} ${nose + 5} ${cx0} ${nose} Z`}
        />

        {/* The 747's hump: the flight deck sits on top of it, so from above the
            forward fuselage is visibly wider than the rest. */}
        {HUMPED.has(key) && (
          <path
            d={`M${cx0 - fat * 0.9} ${nose + 14}
                L${cx0 + fat * 0.9} ${nose + 14}
                L${cx0 + fat * 0.75} ${nose + 34}
                L${cx0 - fat * 0.75} ${nose + 34} Z`}
            className="text-white"
            fill="#ffffff"
            opacity="0.32"
          />
        )}

        {/* The A380's upper deck runs the whole length, so the cue is a second
            line down the spine rather than a bulge at the front. */}
        {DOUBLE_DECK.has(key) && (
          <rect
            x={cx0 - fat * 0.42}
            y={nose + 12}
            width={fat * 0.84}
            height={len - 30}
            rx={fat * 0.4}
            fill="#ffffff"
            opacity="0.3"
          />
        )}

        <path d={wing(1)} />
        <path d={wing(-1)} />
        {tipDevice(1)}
        {tipDevice(-1)}
        <path d={stabiliser(1)} />
        <path d={stabiliser(-1)} />

        {/* ENGINES. Three arrangements, and which one a type has is the
            difference between reading as a turboprop, a regional jet or
            everything else. */}
        {base.prop
          ? [1, -1].map((dir) => {
            const x = cx0 + dir * half * base.engine
            const y = rootY - 1
            return (
              <g key={`p${dir}`}>
                {/* The nacelle sits ON the wing and reaches forward of it. */}
                <rect x={x - 3.6} y={y - 7} width="7.2" height="16" rx="3.4" />
                {/* The propeller disc, with a blade across it so it reads as
                    turning rather than as a hoop. */}
                <ellipse cx={x} cy={y - 10} rx="10.5" ry="2.4" opacity="0.4" />
                <rect x={x - 10.5} y={y - 10.7} width="21" height="1.4" rx="0.7" opacity="0.75" />
              </g>
            )
          })
          : rear
            ? [1, -1].map((dir) => (
              // On the rear fuselage, level with the back of the wing.
              <rect
                key={`r${dir}`}
                x={cx0 + dir * fat - (dir > 0 ? 0 : 6.4)}
                y={back - tail * 1.5}
                width="6.4"
                height="15"
                rx="3.1"
              />
            ))
            : [1, -1].flatMap((dir) =>
              stations.map((st, i) => {
                const x = cx0 + dir * half * st
                const y = rootY + sweep * st
                const w = type?.body === 'widebody' ? 8.8 : 7.2
                const h = type?.body === 'widebody' ? 17 : 13.5
                return (
                  // Hung FORWARD of the leading edge, which is where a
                  // podded engine actually is and what stops it reading as a
                  // fence sitting on the wing.
                  <rect key={`${dir}-${i}`} x={x - w / 2} y={y - h * 0.62} width={w} height={h} rx={w / 2} />
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
