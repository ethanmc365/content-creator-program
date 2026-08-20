import { airlineBrand } from '../../lib/airlineBrand'

// A TAIL FIN IN THE AIRLINE'S OWN COLOURS, CARRYING ITS CODE.
//
// This is what replaced the 1 / 2 / 3 rank badges in airline loyalty. See
// `lib/airlineBrand` for why it is a fin rather than 172 downloaded logos: the
// production CSP is `img-src 'self'`, and at 28px the colour is doing all of
// the recognising anyway.
//
// The shape is a tile with a raked leading edge - the sweep of a vertical
// stabiliser, with room on it for two characters to actually be read. The code
// sits in whichever of white or ink carries against that livery.
export default function AirlineMark({ iata, name, size = 28, className = '' }) {
  const { fin, ink } = airlineBrand(iata)
  const code = String(iata || '').toUpperCase()
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      title={name || code}
      aria-label={name || code}
      role="img"
    >
      <svg viewBox="0 0 28 28" width={size} height={size} aria-hidden>
        {/* A TAIL, BUT A LEGIBLE ONE.
            The first pass drew an accurate swept stabiliser and it failed the
            only test that matters at 28px: the code on it was unreadable. A fin
            is narrow by nature, so there is nowhere for two characters to go.
            This keeps the RAKE - the swept leading edge that says "tail" - and
            gives the code the full width of the tile to sit in, upright. */}
        <path
          d="M9.4 2 H24 C25.1 2 26 2.9 26 4 V24 C26 25.1 25.1 26 24 26 H2 Z"
          fill={fin}
        />
        <text
          x="16.5" y="17.6"
          textAnchor="middle"
          fontSize={code.length > 2 ? 9 : 10.5}
          fontWeight="700"
          fill={ink}
          style={{ fontFamily: 'Poppins, system-ui, sans-serif', letterSpacing: '-0.03em' }}
        >
          {code}
        </text>
      </svg>
    </span>
  )
}
