import { Marker } from 'react-simple-maps'
import { thumbUrl } from '../lib/avatarUrl'
import { BRAND, initials } from './CreatorMapParts'

export function Pin({ group, zoom, active, dim, onSelect, landing = false, queue = 0 }) {
  const lead = group.creators[0]
  const count = group.creators.length
  // Counter-scale so pins are small at the default zoom (you can see the
  // countries underneath) but grow noticeably as you zoom in to find people:
  // net on-screen size ~ zoom^0.3.
  const s = Math.pow(1 / Math.max(zoom, 1), 0.7)
  const r = 12 // avatar radius (smaller base than before)
  const cy = -26 // avatar centre above the tip
  const disc = r + 3 // white ring around the photo
  const body = `M${-r * 0.62} ${cy + disc * 0.5} L0 0 L${r * 0.62} ${cy + disc * 0.5} Z`
  return (
    <Marker coordinates={group.coords} onClick={() => onSelect(group)}>
      {/* THE LANDING WRAPPER IS ITS OWN ELEMENT, AND IT HAS TO BE.
          A CSS `transform` OVERRIDES an SVG `transform` attribute on the same
          element, so putting the drop animation on the counter-scaled group
          below would silently throw the counter-scale away for the length of
          the animation and every pin would balloon on arrival. This g carries
          only the animation; the one inside it carries only the scale. */}
      {/* THE PINS COME DOWN IN A SHOWER, NOT ALL ON ONE FRAME.

          They already drop and squash; they all dropped on the SAME frame,
          which reads as one object appearing rather than as forty-four pins
          landing. The ladder that used to be here was removed for a good
          reason - an uncapped per-pin delay is a two-second entrance on a busy
          map - so this is the threads' answer applied to the pins: a ladder
          CAPPED at eight steps, so the shower lasts under half a second whether
          there are nine pins or nine hundred. `queue` is that position; the
          stylesheet turns it into the delay. See `.map-pin-land`. */}
      <g className={landing ? 'map-pin-land' : undefined} style={landing ? pinStep(queue) : undefined}>
      <g
        transform={`scale(${s})`}
        style={{ cursor: 'pointer', opacity: dim ? 0.25 : 1, transition: 'opacity 0.2s' }}
      >
        {/* THE SHADOW IS PAINTED, NOT FILTERED.
            THE BUG THIS FIXES: this was `filter: drop-shadow(...)` on every pin, which is a separate offscreen render
            pass per pin per frame. With forty-five pins on a map that is survivable inside a 700px card and it is not
            survivable full screen, where the same forty-five passes are run at twice the linear size - four times the
            pixels - on every frame of a drag. That is most of the team's "when I click on full screen now it's really
            laggy, a lot of glitching". The same shape drawn twice, once offset and translucent, is two ordinary fills.
            It reads identically at this size and it composites like anything else on the map. */}
        <g fill="rgba(20,20,30,0.22)" transform="translate(0 1.8)">
          <path d={body} />
          <circle cx={0} cy={cy} r={disc} />
        </g>
        <g fill="#ffffff">
          <path d={body} />
          <circle cx={0} cy={cy} r={disc} />
        </g>
        {/* THE INITIALS ARE ALWAYS UNDERNEATH, AND THAT IS THE FALLBACK.
            They used to be the `else` of the photo, so a pin whose image failed
            to load - a deleted object, a transform the edge could not produce -
            drew an empty white disc with nothing in it. Painting them first and
            letting the photo cover them costs one circle and one string per
            pin, needs no error handling in an SVG element that is awkward to
            attach any to, and means a missing photo degrades to the same thing
            a creator with no photo at all gets. */}
        <circle cx={0} cy={cy} r={r} fill="#fbe6da" />
        <text x={0} y={cy} textAnchor="middle" dominantBaseline="central"
          fontSize={r * 0.8} fontWeight="600" fill={BRAND}>{initials(lead.name)}</text>
        {lead.photo_url && (
          <image
            // AT PIN SIZE, NOT AT UPLOAD SIZE. See lib/avatarUrl: forty pins were pulling about two and a half megabytes
            // of full-resolution photographs to fill circles 24 units across, which is the team's "it takes a lot of
            // time for the profile pictures to load in on the pins". 64 is generous for the default zoom and still sharp
            // deep into one: the pin counter-scales at `zoom^0.3`, so it is about 72 CSS pixels across at the maximum
            // zoom this map allows.
            href={thumbUrl(lead.photo_url, 64)}
            x={-r} y={cy - r} width={r * 2} height={r * 2}
            clipPath="url(#creator-pin-clip)"
            preserveAspectRatio="xMidYMid slice"
          />
        )}
        <circle cx={0} cy={cy} r={r} fill="none" stroke={active ? BRAND : '#ffffff'} strokeWidth={active ? 3 : 2} />
        {count > 1 && (
          <g transform={`translate(${r - 3}, ${cy - r + 3})`}>
            <circle r={9.5} fill={BRAND} stroke="#ffffff" strokeWidth={2} />
            <text x={0} y={0.5} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight="700" fill="#ffffff">
              {count}
            </text>
          </g>
        )}
      </g>
      </g>
    </Marker>
  )
}

// Same capped ladder for the pins. Eight steps at 45ms is 315ms of shower on
// top of the 360ms the land takes to arrive, whatever the community's size.
const PIN_STEPS = 8

const pinStep = (i) => ({ '--pin-i': (i || 0) % PIN_STEPS })
