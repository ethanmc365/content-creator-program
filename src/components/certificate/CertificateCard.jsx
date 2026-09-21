import Icon from '../Icon'
import { designStyle, fillTemplate, formatAwardDate, tierOf } from '../../lib/certificates'

// A CERTIFICATE, AS A PICTURE.
//
// Fixed 1000x707 (root-2, A4 landscape) and never responsive: this component is
// PHOTOGRAPHED by `lib/domSnapshot`, and a layout that reflowed would give two
// people the same award as two different objects. Pages scale it with a CSS
// transform, so the screen and the download are the same pixels. Inline styles
// throughout, for the same reason the portfolio uses them: a printed page has
// no dark mode.
//
// ---------------------------------------------------------------------------
// THE 21 SEP REDESIGN
//
// Ethan: "I hate even more how it looks now. The font is really weird. It
// doesn't match the style of the platform... you added the other layouts, and
// I like that there's multiple layout options, but they're all quite similar
// and none of them I like at all. It needs to be well-designed, matching the
// platform, using the fonts like the Poppins Bold, ensuring the logo's correct
// and other graphics like the Tryp.com orange, and the gradients we have on
// the platform."
//
// Three decisions follow from that, and every layout below obeys them:
//
//   1. POPPINS, 400 AND 700, AND NOTHING ELSE. Instrument Serif was the "weird
//      font". 400 and 700 are also the two weights `domSnapshot` embeds, so
//      the downloaded PNG is set in exactly what is on screen.
//
//   2. THE PLATFORM'S OWN PARTS. The hub card's gradient (accent to a LIGHTER
//      tone, with soft white glows), the dotted flight route from the
//      milestone page, the real Tryp livery plane from the hub, and the real
//      wordmark cut out of its white square (`/brand/tryp-wordmark*.svg`) -
//      so there is no white plate anywhere, which was the logo complaint.
//
//   3. SIX OBJECTS, NOT SIX ARRANGEMENTS. Horizon, a boarding pass, a
//      postcard, a sky banner, a flight path and a minimal page are things a
//      travel company would actually hand you. They share parts, never a
//      composition - the previous six were one composition with the bars moved.
// ---------------------------------------------------------------------------

// WHERE /verify ACTUALLY LIVES: this app's canonical host, not tryp.com.
const VERIFY_HOST = 'trypcreators.vercel.app'

export const CERT_W = 1000
export const CERT_H = 707

const SANS = 'Poppins, system-ui, sans-serif'

/** "30 September 2026" -> "30 SEP 2026", for a postmark ring. */
function shortDate(text) {
  const m = /^(\d{1,2}) ([A-Za-z]+) (\d{4})$/.exec(String(text || '').trim())
  return m ? `${m[1]} ${m[2].slice(0, 3).toUpperCase()} ${m[3]}` : String(text || '')
}

/** A display size that survives a long name, in steps so a set stays a set. */
function fit(text, max) {
  const n = String(text || '').length
  if (n <= 14) return max
  if (n <= 20) return Math.round(max * 0.86)
  if (n <= 27) return Math.round(max * 0.72)
  if (n <= 36) return Math.round(max * 0.6)
  return Math.round(max * 0.5)
}

export default function CertificateCard({ design, facts = {}, cardRef, className }) {
  const d = design || {}
  const tier = tierOf(d.tier)
  const s = designStyle(d)

  const c = {
    subtitle: fillTemplate(d.subtitle, facts),
    title: fillTemplate(d.title, facts) || 'Certificate',
    body: fillTemplate(d.body, facts) || 'for taking part in the Tryp.com Content Creator Community',
    footnote: fillTemplate(d.footnote, facts),
    name: facts.name || '',
    date: facts.date ? formatAwardDate(facts.date) : '',
    serial: facts.serial || '',
    signature: d.signature || '',
    signatureRole: d.signature_role || '',
    tier: tier.label,
  }

  const Layout = LAYOUTS[s.layout.key] || LAYOUTS.horizon

  return (
    <div
      ref={cardRef}
      className={className}
      style={{
        width: CERT_W, height: CERT_H, position: 'relative', overflow: 'hidden',
        background: s.bg, color: s.ink, fontFamily: SANS, WebkitFontSmoothing: 'antialiased',
      }}
    >
      <Layout s={s} c={c} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// THE PARTS
// ---------------------------------------------------------------------------

function Kicker({ s, children, align = 'left', color, size = 11 }) {
  if (!children) return null
  const col = color || s.accentText
  return (
    <p style={{
      margin: 0, display: 'flex', alignItems: 'center', gap: 8,
      justifyContent: align === 'center' ? 'center' : 'flex-start',
      fontSize: size, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: col,
    }}>
      <span style={{ display: 'inline-flex', transform: 'rotate(45deg)', color: col }}>
        <Icon name="plane-flight" className="h-3.5 w-3.5" />
      </span>
      {children}
    </p>
  )
}

function Title({ s, children, size = 44, align = 'left', color }) {
  return (
    <p style={{
      margin: 0, fontSize: fit(children, size), fontWeight: 700, lineHeight: 1.08,
      letterSpacing: '-0.02em', color: color || s.ink, textAlign: align,
    }}>
      {children}
    </p>
  )
}

function Preamble({ s, children = 'This certifies that', align = 'left', color }) {
  return (
    <p style={{
      margin: 0, fontSize: 13, fontWeight: 400, letterSpacing: '0.02em',
      color: color || s.faint, textAlign: align,
    }}>
      {children}
    </p>
  )
}

function Name({ s, children, size = 58, align = 'left', color }) {
  if (!children) return null
  return (
    <p style={{
      margin: 0, fontSize: fit(children, size), fontWeight: 700, lineHeight: 1.06,
      letterSpacing: '-0.025em', color: color || s.accentText, textAlign: align,
    }}>
      {children}
    </p>
  )
}

function Body({ s, children, align = 'left', width = 540, size = 16, color }) {
  if (!children) return null
  return (
    <p style={{
      margin: 0, maxWidth: width, fontSize: size, fontWeight: 400, lineHeight: 1.65,
      color: color || s.muted, whiteSpace: 'pre-line', textAlign: align,
      ...(align === 'center' ? { marginLeft: 'auto', marginRight: 'auto' } : null),
    }}>
      {children}
    </p>
  )
}

function Fact({ s, label, value, align = 'left', mono = false, color, labelColor }) {
  if (!value) return null
  return (
    <div style={{ textAlign: align }}>
      <p style={{
        margin: 0, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.16em',
        textTransform: 'uppercase', color: labelColor || s.faint,
      }}>
        {label}
      </p>
      <p style={{
        margin: '4px 0 0', fontSize: 13, fontWeight: 700, color: color || s.ink,
        letterSpacing: mono ? '0.06em' : 'normal',
        ...(mono ? { fontVariantNumeric: 'tabular-nums' } : null),
      }}>
        {value}
      </p>
    </div>
  )
}

function Credential({ s, serial, align = 'left', color, labelColor }) {
  if (!serial) return null
  return (
    <div style={{ textAlign: align }}>
      <Fact s={s} label="Certificate ID" value={serial} align={align} mono color={color} labelColor={labelColor} />
      <p style={{ margin: '3px 0 0', fontSize: 9.5, fontWeight: 400, color: labelColor || s.faint }}>
        Verify at {VERIFY_HOST}/verify
      </p>
    </div>
  )
}

function Signature({ s, name, role, align = 'left', color }) {
  if (!name) return null
  return (
    <div style={{ textAlign: align }}>
      <p style={{ margin: 0, fontSize: 17, fontWeight: 700, lineHeight: 1.2, color: color || s.ink }}>{name}</p>
      <div style={{
        height: 1, width: 150, background: s.hair,
        margin: align === 'right' ? '7px 0 6px auto' : align === 'center' ? '7px auto 6px' : '7px 0 6px',
      }} />
      <p style={{
        margin: 0, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em',
        textTransform: 'uppercase', color: s.faint,
      }}>
        {role || 'Tryp.com'}
      </p>
    </div>
  )
}

/** The real wordmark, orange on a light ground and white on a dark one. */
function Wordmark({ white, height = 30, style }) {
  return (
    <img
      src={white ? '/brand/tryp-wordmark-white.svg' : '/brand/tryp-wordmark.svg'}
      alt="Tryp.com"
      crossOrigin="anonymous"
      // `alignSelf` so a flex column cannot stretch the image to its width -
      // an SVG stretched that way centres its drawing, which is how the
      // postcard's wordmark ended up in the middle of the column.
      style={{ height, width: 'auto', display: 'block', alignSelf: 'flex-start', flexShrink: 0, ...style }}
    />
  )
}

/** The hub card: gradient, rounded, two soft glows. */
function GradientBlock({ s, style, children, radius = 28 }) {
  return (
    <div style={{ position: 'absolute', overflow: 'hidden', borderRadius: radius, background: s.block, ...style }}>
      <div style={{
        position: 'absolute', right: -110, top: -120, width: 360, height: 360, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.26) 0%, rgba(255,255,255,0) 68%)',
      }} />
      <div style={{
        position: 'absolute', left: -120, bottom: -140, width: 380, height: 380, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0) 68%)',
      }} />
      {children}
    </div>
  )
}

/** A dotted flight route, in the coordinate space of the box it sits in. */
function Route({ d, color = '#ffffff', opacity = 0.8, width = 3, gap = 10, style }) {
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', ...style }} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeOpacity={opacity} strokeWidth={width}
        strokeDasharray={`1 ${gap}`} strokeLinecap="round" />
    </svg>
  )
}

/** The Tryp livery, from the hub. Faces left; never mirrored (its side would read backwards). */
function Plane({ width = 240, style }) {
  return (
    <img
      src="/brand/tryp-plane-cutout.png"
      alt=""
      crossOrigin="anonymous"
      style={{ position: 'absolute', width, height: 'auto', filter: 'drop-shadow(0 14px 18px rgba(0,0,0,0.20))', ...style }}
    />
  )
}

/** A round gradient seal with the plane and the tier. */
function Seal({ s, tier, size = 108, style }) {
  return (
    <div style={{
      position: 'absolute', width: size, height: size, borderRadius: '50%', background: s.light ? s.grad : '#ffffff',
      color: s.light ? '#ffffff' : s.accent, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 4, boxShadow: `0 12px 28px rgba(0,0,0,0.16), inset 0 0 0 5px ${s.light ? 'rgba(255,255,255,0.35)' : 'rgba(0,0,0,0.05)'}`,
      ...style,
    }}>
      <span style={{ display: 'inline-flex', transform: 'rotate(45deg)' }}>
        <Icon name="plane-flight" className="h-7 w-7" />
      </span>
      <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.2, maxWidth: size - 22 }}>
        {tier}
      </span>
    </div>
  )
}

// ---------------------------------------------------------------------------
// THE SIX LAYOUTS
// ---------------------------------------------------------------------------

/**
 * HORIZON - the hub card down the left, the Tryp plane on a dotted route
 * through it, and the certificate's words beside it. The default: it is the
 * most "this is the platform" of the six.
 */
function Horizon({ s, c }) {
  const PANEL = 340
  return (
    <>
      <GradientBlock s={s} style={{ left: 28, top: 28, bottom: 28, width: PANEL }}>
        <Wordmark white height={30} style={{ position: 'absolute', left: 36, top: 36 }} />
        <Route d="M -20 520 C 60 520, 90 440, 160 420 S 300 300, 250 210 S 180 90, 330 60" />
        <Plane width={270} style={{ left: 40, top: 360, transform: 'rotate(-8deg)' }} />
        <div style={{ position: 'absolute', left: 36, right: 36, bottom: 36 }}>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
            {c.tier}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 15, fontWeight: 700, color: '#ffffff', lineHeight: 1.3 }}>
            Tryp.com Content Creator Community
          </p>
        </div>
      </GradientBlock>

      <div style={{
        position: 'absolute', left: 28 + PANEL + 64, right: 64, top: 0, bottom: 0,
        display: 'flex', flexDirection: 'column', padding: '64px 0 52px',
      }}>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Kicker s={s}>{c.subtitle}</Kicker>
          <div style={{ height: c.subtitle ? 14 : 0 }} />
          <Title s={s} size={44}>{c.title}</Title>
          <div style={{ height: 34 }} />
          <Preamble s={s} />
          <div style={{ height: 6 }} />
          <Name s={s} size={54}>{c.name}</Name>
          <div style={{ height: 16 }} />
          <Body s={s} width={500}>{c.body}</Body>
        </div>
        <div>
          {c.footnote && <p style={{ margin: '0 0 12px', fontSize: 11, color: s.faint }}>{c.footnote}</p>}
          <div style={{ height: 1, background: s.hair, marginBottom: 18 }} />
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
            <Signature s={s} name={c.signature} role={c.signatureRole} />
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 36, marginLeft: 'auto' }}>
              <Fact s={s} label="Awarded" value={c.date} />
              <Credential s={s} serial={c.serial} />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * BOARDING PASS - a real one: passenger, a route from "you" to Tryp.com, gate
 * and seat, and a perforated stub carrying the date and the code. The pass is
 * always a white card; the paper is what it lies on.
 */
function Boarding({ s, c }) {
  const L = 48
  const T = 64
  const W = CERT_W - L * 2
  const H = CERT_H - T * 2
  const STUB = 250
  const initials = (c.name || 'You').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || 'YOU'
  const ink = '#1A1A1A'
  const faint = '#9A9CA4'
  const muted = '#5E6068'
  return (
    <>
      {s.light && (
        <Route d={`M -20 ${CERT_H - 40} C 200 ${CERT_H - 10}, 360 ${CERT_H - 70}, 520 ${CERT_H - 30} S 860 ${CERT_H - 60}, 1020 ${CERT_H - 20}`}
          color={s.accent} opacity={0.35} />
      )}
      <div style={{
        position: 'absolute', left: L, top: T, width: W, height: H, borderRadius: 26, background: '#ffffff',
        boxShadow: '0 24px 60px rgba(26,26,26,0.14), 0 0 0 1px rgba(26,26,26,0.05)', overflow: 'hidden',
      }}>
        {/* The top band: the airline strip of a real pass. */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 0, height: 74, background: s.grad,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 34px',
        }}>
          <Wordmark white height={28} />
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#ffffff' }}>
            Boarding pass · {c.tier}
          </span>
        </div>

        {/* Main part */}
        <div style={{ position: 'absolute', left: 34, top: 74 + 30, right: STUB + 34, bottom: 30, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', color: faint }}>FROM</p>
              <p style={{ margin: '2px 0 0', fontSize: 40, fontWeight: 700, letterSpacing: '0.02em', color: ink, lineHeight: 1 }}>{initials}</p>
            </div>
            <div style={{ flex: 1, position: 'relative', height: 40, display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1, borderTop: `3px dotted ${s.accent}`, opacity: 0.6 }} />
              <span style={{ display: 'inline-flex', color: s.accent, transform: 'rotate(90deg)', margin: '0 10px' }}>
                <Icon name="plane-flight" className="h-7 w-7" />
              </span>
              <div style={{ flex: 1, borderTop: `3px dotted ${s.accent}`, opacity: 0.6 }} />
            </div>
            <div style={{ textAlign: 'right' }}>
              <p style={{ margin: 0, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', color: faint }}>TO</p>
              <p style={{ margin: '2px 0 0', fontSize: 40, fontWeight: 700, letterSpacing: '0.02em', color: s.accent, lineHeight: 1 }}>TRYP</p>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <p style={{ margin: 0, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', color: faint }}>PASSENGER</p>
            <Name s={{ ...s, accentText: ink }} size={46}>{c.name}</Name>
            <div style={{ height: 12 }} />
            <Title s={{ ...s, ink: s.accent }} size={24}>{c.title}</Title>
            <div style={{ height: 8 }} />
            <Body s={{ ...s, muted }} width={520} size={14}>{c.body}</Body>
          </div>

          <div style={{ display: 'flex', gap: 34 }}>
            <Fact s={{ ...s, ink, faint }} label="Gate" value="Creator Community" />
            <Fact s={{ ...s, ink, faint }} label="Class" value={c.tier} />
            <Fact s={{ ...s, ink, faint }} label="Seat" value="1A" />
            {c.signature && <Fact s={{ ...s, ink, faint }} label={c.signatureRole || 'Signed'} value={c.signature} />}
          </div>
        </div>

        {/* The perforation, with the two notches a real pass has. */}
        <div style={{ position: 'absolute', top: 74, bottom: 0, right: STUB, borderLeft: '2px dashed #E4E4E8' }} />
        <div style={{ position: 'absolute', right: STUB - 16, top: 58, width: 32, height: 32, borderRadius: '50%', background: '#EFEFF2' }} />
        <div style={{ position: 'absolute', right: STUB - 16, bottom: -16, width: 32, height: 32, borderRadius: '50%', background: '#EFEFF2' }} />

        {/* The stub */}
        <div style={{ position: 'absolute', right: 0, top: 74, bottom: 0, width: STUB, padding: '30px 28px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          <Fact s={{ ...s, ink, faint }} label="Awarded" value={c.date} />
          <Credential s={{ ...s, ink, faint }} serial={c.serial} />
          <div style={{ marginTop: 'auto', display: 'flex', gap: 3, height: 46, alignItems: 'stretch' }}>
            {/* A barcode, drawn - no library, no network, photographs cleanly. */}
            {Array.from({ length: 34 }).map((_, i) => (
              <span key={i} style={{ flex: [2, 1, 3, 1, 1, 2, 1, 3][i % 8], background: ink, opacity: i % 5 === 0 ? 0.35 : 0.9 }} />
            ))}
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * POSTCARD - the message on the left, a stamp and a postmark top right, and
 * the creator on the address lines. The dotted divider down the middle is the
 * same dotted line as the routes.
 */
function Postcard({ s, c }) {
  const MID = 560
  const line = s.light ? 'rgba(26,26,26,0.14)' : 'rgba(255,255,255,0.35)'
  return (
    <>
      <div style={{ position: 'absolute', left: 60, top: 60, width: MID - 110, bottom: 56, display: 'flex', flexDirection: 'column' }}>
        <Wordmark white={!s.light} height={28} />
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Kicker s={s}>{c.subtitle || `Greetings from Tryp.com`}</Kicker>
          <div style={{ height: 14 }} />
          <Title s={s} size={42}>{c.title}</Title>
          <div style={{ height: 18 }} />
          <Body s={s} width={430} size={16}>{c.body}</Body>
        </div>
        <Signature s={s} name={c.signature} role={c.signatureRole} />
        {!c.signature && (
          <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: s.ink }}>
            The Tryp.com team
          </p>
        )}
      </div>

      <div style={{ position: 'absolute', left: MID, top: 64, bottom: 64, borderLeft: `3px dotted ${line}` }} />

      {/* The stamp: perforated edge, the gradient, the plane. */}
      <div style={{
        position: 'absolute', right: 62, top: 58, width: 150, height: 184, padding: 7, background: '#ffffff',
        borderRadius: 6, boxShadow: '0 10px 26px rgba(26,26,26,0.14)',
        outline: '3px dotted rgba(26,26,26,0.12)', outlineOffset: -2,
      }}>
        <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 3, overflow: 'hidden', background: s.grad }}>
          <div style={{
            position: 'absolute', right: -60, top: -60, width: 180, height: 180, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 70%)',
          }} />
          <Plane width={170} style={{ left: -16, top: 70, transform: 'rotate(-10deg)' }} />
          <span style={{ position: 'absolute', left: 10, top: 10, fontSize: 18, fontWeight: 700, color: '#ffffff' }}>€0</span>
          <span style={{ position: 'absolute', left: 10, bottom: 8, fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', color: '#ffffff' }}>TRYP.COM</span>
        </div>
      </div>

      {/* The postmark: a ring with the date, and the wavy cancel lines. */}
      <div style={{
        position: 'absolute', right: 186, top: 150, width: 124, height: 124, borderRadius: '50%',
        border: `2.5px solid ${s.light ? s.accent : '#ffffff'}`, opacity: 0.7, transform: 'rotate(-14deg)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: s.light ? s.accent : '#ffffff',
      }}>
        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.16em' }}>CREATOR POST</span>
        <span style={{ fontSize: 15, fontWeight: 700, marginTop: 4, whiteSpace: 'nowrap' }}>{shortDate(c.date) || 'TRYP.COM'}</span>
        <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: '0.16em', marginTop: 4 }}>{c.tier.toUpperCase()}</span>
      </div>
      <svg style={{ position: 'absolute', right: 214, top: 118, width: 150, height: 60, opacity: 0.45 }} aria-hidden="true">
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M 0 ${12 + i * 16} q 18 -10 36 0 t 36 0 t 36 0 t 36 0`} fill="none" stroke={s.light ? s.accent : '#ffffff'} strokeWidth="2.5" />
        ))}
      </svg>

      {/* To: the address lines. */}
      <div style={{ position: 'absolute', left: MID + 50, right: 62, bottom: 60 }}>
        <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', color: s.faint }}>AWARDED TO</p>
        <div style={{ borderBottom: `1.5px solid ${line}`, padding: '8px 0 10px' }}>
          <Name s={s} size={40}>{c.name}</Name>
        </div>
        <div style={{ borderBottom: `1.5px solid ${line}`, padding: '12px 0 8px', fontSize: 13, fontWeight: 700, color: s.ink }}>
          Tryp.com Content Creator Community
        </div>
        <div style={{ borderBottom: `1.5px solid ${line}`, padding: '12px 0 8px' }}>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: s.ink, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
            {c.serial ? `ID ${c.serial}` : (c.date || ' ')}
          </span>
          {c.serial && <span style={{ display: 'block', marginTop: 2, fontSize: 10.5, color: s.faint }}>Verify at {VERIFY_HOST}/verify</span>}
        </div>
        {c.footnote && <p style={{ margin: '10px 0 0', fontSize: 11, color: s.faint }}>{c.footnote}</p>}
      </div>
    </>
  )
}

/**
 * SKY BANNER - a gradient band across the top with the plane flying through
 * it on its route, the title in white on the band, and the name centred and
 * large beneath. The boldest of the six.
 */
function Banner({ s, c }) {
  const BAND = 262
  return (
    <>
      <GradientBlock s={s} radius={0} style={{ left: 0, right: 0, top: 0, height: BAND }}>
        <Route d={`M -20 210 C 180 250, 300 120, 470 150 S 760 230, 1020 60`} />
        <Plane width={250} style={{ right: 70, top: 26, transform: 'rotate(6deg)' }} />
        <div style={{ position: 'absolute', left: 64, top: 44 }}>
          <Wordmark white height={30} />
        </div>
        <div style={{ position: 'absolute', left: 64, right: 360, bottom: 40 }}>
          <Kicker s={s} color="#ffffff">{c.subtitle}</Kicker>
          <div style={{ height: c.subtitle ? 10 : 0 }} />
          <Title s={s} size={44} color="#ffffff">{c.title}</Title>
        </div>
      </GradientBlock>

      <div style={{
        position: 'absolute', left: 80, right: 80, top: BAND, bottom: 0,
        display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '0 0 46px',
      }}>
        <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <Preamble s={s} align="center" />
          <div style={{ height: 6 }} />
          <Name s={s} size={60} align="center">{c.name}</Name>
          <div style={{ height: 14 }} />
          <Body s={s} align="center" width={640} size={16}>{c.body}</Body>
        </div>
        {c.footnote && <p style={{ margin: '0 0 12px', fontSize: 11, color: s.faint, textAlign: 'center' }}>{c.footnote}</p>}
        <div style={{ width: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
          {c.signature ? <Signature s={s} name={c.signature} role={c.signatureRole} /> : <Fact s={s} label="Tier" value={c.tier} />}
          <Fact s={s} label="Awarded" value={c.date} align="center" />
          <Credential s={s} serial={c.serial} align="right" />
        </div>
      </div>
    </>
  )
}

/**
 * FLIGHT PATH - a dotted route arcing across the whole page from the bottom
 * left to the top right, where the seal sits; the certificate centred in
 * front of it. The formal one.
 */
function FlightPath({ s, c }) {
  const routeColor = s.light ? s.accent : '#ffffff'
  return (
    <>
      <Route d="M -30 640 C 180 700, 240 470, 420 520 S 700 560, 760 330 S 820 120, 900 118"
        color={routeColor} opacity={s.light ? 0.28 : 0.5} width={3.5} gap={12} />
      <Seal s={s} tier={c.tier} size={112} style={{ right: 56, top: 60 }} />

      <div style={{
        position: 'absolute', inset: 0, padding: '58px 170px 112px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', textAlign: 'center',
      }}>
        <Wordmark white={!s.light} height={34} style={{ alignSelf: 'center' }} />
        <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          <Kicker s={s} align="center">{c.subtitle}</Kicker>
          <div style={{ height: c.subtitle ? 12 : 0 }} />
          <Title s={s} size={44} align="center">{c.title}</Title>
          <div style={{ height: 28 }} />
          <Preamble s={s} align="center" />
          <div style={{ height: 6 }} />
          <Name s={s} size={58} align="center">{c.name}</Name>
          <div style={{ height: 14 }} />
          <Body s={s} align="center" width={600} size={16}>{c.body}</Body>
        </div>
        {c.footnote && <p style={{ margin: '0 0 12px', fontSize: 11, color: s.faint }}>{c.footnote}</p>}
      </div>
      <div style={{ position: 'absolute', left: 64, right: 64, bottom: 44, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
        {c.signature ? <Signature s={s} name={c.signature} role={c.signatureRole} /> : <Fact s={s} label="Awarded" value={c.date} />}
        {c.signature && <Fact s={s} label="Awarded" value={c.date} align="center" />}
        <Credential s={s} serial={c.serial} align="right" />
      </div>
    </>
  )
}

/**
 * MINIMAL - the name is the headline, the title a line under it, and one small
 * Tryp seal. For when the certificate should look like it was not trying.
 */
function Minimal({ s, c }) {
  return (
    <>
      <div style={{ position: 'absolute', left: 80, top: 70 }}>
        <Wordmark white={!s.light} height={28} />
      </div>
      <Seal s={s} tier={c.tier} size={92} style={{ right: 80, top: 56 }} />

      <div style={{ position: 'absolute', left: 80, right: 80, top: 0, bottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Preamble s={s}>{c.subtitle || 'Awarded to'}</Preamble>
        <div style={{ height: 8 }} />
        <Name s={s} size={84} color={s.ink}>{c.name}</Name>
        <div style={{ height: 18 }} />
        <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 34, height: 4, borderRadius: 4, background: s.light ? s.grad : '#ffffff' }} />
          <span style={{ fontSize: 24, fontWeight: 700, color: s.accentText, letterSpacing: '-0.01em' }}>{c.title}</span>
        </p>
        <div style={{ height: 14 }} />
        <Body s={s} width={620} size={15}>{c.body}</Body>
      </div>

      <div style={{ position: 'absolute', left: 80, right: 80, bottom: 56, display: 'flex', alignItems: 'flex-end', gap: 40 }}>
        <Signature s={s} name={c.signature} role={c.signatureRole} />
        <Fact s={s} label="Awarded" value={c.date} />
        <div style={{ marginLeft: 'auto' }}><Credential s={s} serial={c.serial} align="right" /></div>
      </div>
    </>
  )
}

const LAYOUTS = {
  horizon: Horizon,
  boarding: Boarding,
  postcard: Postcard,
  banner: Banner,
  route: FlightPath,
  minimal: Minimal,
}
