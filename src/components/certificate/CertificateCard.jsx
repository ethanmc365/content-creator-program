import Icon from '../Icon'
import { alpha, awardKind, designStyle, fillTemplate, formatAwardDate, optionsOf, ordinal } from '../../lib/certificates'

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
// THE 28 SEP REDESIGN
//
// Ethan: "the Tryp.com plane is looking randomly placed ... other issues about
// the fonts and the styling. The colors, some of the graphics, like those
// dotted lines going behind the text, which makes it look weird. Although I do
// like those dotted lines, but it's just placing everything properly. Have a
// proper UI, like the badges. Some of them look weird."
//
// The six objects stay (they were the right idea); every one was rebuilt to
// the same rules:
//
//   1. ONE GRID. A 56px margin on every side, content columns on 8px steps,
//      and the same type scale everywhere: 11px kicker, 36-40px title, the
//      name as the hero (up to 64px), 16px body, 9px labels over 13px values.
//      Poppins 400/700 only - the two weights `domSnapshot` embeds.
//
//   2. DECORATION HAS ITS OWN ZONE. A dotted route or the plane is drawn only
//      where no words will ever be: inside the gradient panel, along a margin,
//      or trailing off the edge of the band. Never behind a title or a footer.
//      The plane sits ON its route at a fixed anchor, tail on the line, so it
//      reads as flying the route rather than as a sticker.
//
//   3. THE BADGE SAYS WHAT WAS WON. A place award carries a medal - 1st, 2nd,
//      3rd and the rest each drawn differently - and every other award a seal
//      naming it (Participant, Milestone, Honour). The tier word is gone.
//
//   4. THE ID IS A LINK YOU CAN TYPE. "Verify at .../verify" became the full
//      address with the code in it, which /verify/:serial opens directly.
//
//   5. ANY ACCENT CAN BE READ. Words on the accent use `onBlock`, so the new
//      yellow gets dark type and every other accent white.
// ---------------------------------------------------------------------------

// WHERE /verify ACTUALLY LIVES: this app's canonical host, not tryp.com.
const VERIFY_HOST = 'trypcreators.vercel.app'

export const CERT_W = 1000
export const CERT_H = 707
const M = 56 // the margin, on every side of every layout

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
  const s = designStyle(d)
  const o = optionsOf(d)
  const kind = awardKind(d, facts)

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
    market: facts.market || '',
    challenge: facts.challenge || '',
    kind,
    place: kind.place || null,
    places: Number(facts.places) || null,
    preamble: o.preamble ?? 'This certifies that',
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
      <Layout s={s} c={c} o={o} />
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
      fontSize: size, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: col,
    }}>
      <span style={{ display: 'inline-flex', transform: 'rotate(45deg)', color: col }}>
        <Icon name="plane-flight" className="h-3.5 w-3.5" />
      </span>
      {children}
    </p>
  )
}

function Title({ s, children, size = 38, align = 'left', color }) {
  return (
    <p style={{
      margin: 0, fontSize: fit(children, size), fontWeight: 700, lineHeight: 1.1,
      letterSpacing: '-0.02em', color: color || s.ink, textAlign: align,
    }}>
      {children}
    </p>
  )
}

function Preamble({ s, children, align = 'left', color }) {
  if (!children) return null
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
      margin: 0, fontSize: fit(children, size), fontWeight: 700, lineHeight: 1.05,
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
      margin: 0, maxWidth: width, fontSize: size, fontWeight: 400, lineHeight: 1.6,
      color: color || s.muted, whiteSpace: 'pre-line', textAlign: align,
      ...(align === 'center' ? { marginLeft: 'auto', marginRight: 'auto' } : null),
    }}>
      {children}
    </p>
  )
}

function Label({ s, children, color }) {
  return (
    <p style={{
      margin: 0, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em',
      textTransform: 'uppercase', color: color || s.faint,
    }}>
      {children}
    </p>
  )
}

function Fact({ s, label, value, align = 'left', mono = false, color, labelColor }) {
  if (!value) return null
  return (
    <div style={{ textAlign: align, minWidth: 0 }}>
      <Label s={s} color={labelColor}>{label}</Label>
      <p style={{
        margin: '5px 0 0', fontSize: 13, fontWeight: 700, color: color || s.ink,
        letterSpacing: mono ? '0.06em' : 'normal', whiteSpace: 'nowrap',
        ...(mono ? { fontVariantNumeric: 'tabular-nums' } : null),
      }}>
        {value}
      </p>
    </div>
  )
}

function Signature({ s, name, role, align = 'left', color }) {
  if (!name) return null
  return (
    <div style={{ textAlign: align, minWidth: 0 }}>
      <p style={{ margin: 0, fontSize: 16, fontWeight: 700, lineHeight: 1.2, color: color || s.ink, whiteSpace: 'nowrap' }}>{name}</p>
      <div style={{
        height: 1.5, width: 132, background: s.rule,
        margin: align === 'right' ? '8px 0 6px auto' : align === 'center' ? '8px auto 6px' : '8px 0 6px',
      }} />
      <Label s={s}>{role || 'Tryp.com'}</Label>
    </div>
  )
}

/** The code and where to check it, as one line anyone can type. */
function Verify({ s, serial, align = 'left', color }) {
  if (!serial) return null
  return (
    <p style={{ margin: 0, fontSize: 10, fontWeight: 400, color: color || s.faint, textAlign: align, whiteSpace: 'nowrap' }}>
      Verify at <span style={{ fontWeight: 700 }}>{VERIFY_HOST}/verify/{serial}</span>
    </p>
  )
}

/** The real wordmark: white, or orange on a light ground. */
function Wordmark({ white, height = 28, style }) {
  return (
    <img
      src={white ? '/brand/tryp-wordmark-white.svg' : '/brand/tryp-wordmark.svg'}
      alt="Tryp.com"
      crossOrigin="anonymous"
      // `alignSelf` so a flex column cannot stretch the image to its width.
      style={{ height, width: 'auto', display: 'block', alignSelf: 'flex-start', flexShrink: 0, ...style }}
    />
  )
}
const isWhite = (hex) => String(hex).toLowerCase() === '#ffffff'

/** The hub card: gradient, rounded, two soft glows. */
function GradientBlock({ s, style, children, radius = 28 }) {
  return (
    <div style={{ position: 'absolute', overflow: 'hidden', borderRadius: radius, background: s.block, ...style }}>
      <div style={{
        position: 'absolute', right: -110, top: -120, width: 360, height: 360, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.24) 0%, rgba(255,255,255,0) 68%)',
      }} />
      <div style={{
        position: 'absolute', left: -120, bottom: -140, width: 380, height: 380, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 68%)',
      }} />
      {children}
    </div>
  )
}

/** A dotted flight route, in the coordinate space of the box it sits in. */
function Route({ d, color = '#ffffff', opacity = 0.75, width = 3, gap = 10, style }) {
  return (
    <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', overflow: 'visible', ...style }} aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeOpacity={opacity} strokeWidth={width}
        strokeDasharray={`1 ${gap}`} strokeLinecap="round" />
    </svg>
  )
}

// The livery image is 1200x471 and faces LEFT. Its tail fin is ~88% across
// and ~18% down; routes end there so the plane is flying the line.
const PLANE_RATIO = 471 / 1200
function Plane({ width = 240, left, top, rotate = -8 }) {
  return (
    <img
      src="/brand/tryp-plane-cutout.png"
      alt=""
      crossOrigin="anonymous"
      style={{
        position: 'absolute', left, top, width, height: width * PLANE_RATIO,
        transform: `rotate(${rotate}deg)`, transformOrigin: '50% 50%',
        filter: 'drop-shadow(0 12px 16px rgba(0,0,0,0.18))',
      }}
    />
  )
}

/**
 * THE BADGE. A place gets a medal that is visibly its own place:
 *   1st  the full gradient, a white ring and a star
 *   2nd  white with a heavy accent ring
 *   3rd  a soft accent tint with a lighter ring
 *   4th+ white with a dashed ring
 * Anything else gets a seal naming the award. `onDark` is true when the badge
 * sits on the gradient, where the white versions stay white and read cleanly.
 */
function Badge({ s, c, size = 112, style, onGradient = false }) {
  const base = {
    position: 'absolute', width: size, height: size, borderRadius: '50%',
    display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
    textAlign: 'center', ...style,
  }
  if (c.place) {
    const p = c.place
    const look = p === 1
      ? { background: onGradient ? '#ffffff' : s.grad, color: onGradient ? s.accentDeep : s.onAccent,
        boxShadow: `0 14px 30px ${alpha(s.accent, 0.35)}, inset 0 0 0 5px ${onGradient ? alpha(s.accent, 0.18) : 'rgba(255,255,255,0.4)'}` }
      : p === 2
        ? { background: '#ffffff', color: s.accentDeep, boxShadow: `0 10px 24px rgba(26,26,26,0.12), inset 0 0 0 5px ${s.accent}` }
        : p === 3
          ? { background: onGradient ? '#ffffff' : alpha(s.accent, 0.12), color: s.accentDeep, boxShadow: `inset 0 0 0 3px ${alpha(s.accent, 0.55)}` }
          : { background: '#ffffff', color: s.accentDeep, border: `2px dashed ${alpha(s.accent, 0.55)}` }
    const n = String(p)
    const suffix = ordinal(p).slice(n.length)
    return (
      <div style={{ ...base, ...look }}>
        {p === 1 && (
          <span style={{ display: 'inline-flex', marginBottom: 2, opacity: 0.95 }}><Icon name="star" className="h-4 w-4" /></span>
        )}
        <span style={{ display: 'flex', alignItems: 'flex-start', lineHeight: 1 }}>
          <span style={{ fontSize: size * (n.length > 1 ? 0.36 : 0.42), fontWeight: 700, letterSpacing: '-0.03em' }}>{n}</span>
          <span style={{ fontSize: size * 0.14, fontWeight: 700, marginTop: size * 0.04, marginLeft: 1 }}>{suffix}</span>
        </span>
        <span style={{ fontSize: Math.max(8, size * 0.078), fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', marginTop: 4 }}>
          Place
        </span>
        {c.places && (
          <span style={{ fontSize: Math.max(7.5, size * 0.07), fontWeight: 400, marginTop: 2, opacity: 0.8 }}>of {c.places}</span>
        )}
      </div>
    )
  }
  return (
    <div style={{
      ...base,
      background: onGradient ? '#ffffff' : s.grad,
      color: onGradient ? s.accentDeep : s.onAccent,
      boxShadow: `0 12px 26px ${alpha(s.accent, 0.3)}, inset 0 0 0 5px ${onGradient ? alpha(s.accent, 0.15) : 'rgba(255,255,255,0.35)'}`,
      gap: 5,
    }}>
      <span style={{ display: 'inline-flex' }}><Icon name={c.kind.icon} className="h-6 w-6" /></span>
      <span style={{ fontSize: Math.max(8, size * 0.08), fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', lineHeight: 1.2, maxWidth: size - 24 }}>
        {c.kind.label}
      </span>
    </div>
  )
}

/** The three facts every certificate ends on, on one line. */
function Footer({ s, c, style, align = 'split', colors = {} }) {
  return (
    <div style={{ position: 'absolute', ...style }}>
      {c.footnote && (
        <p style={{ margin: '0 0 12px', fontSize: 11, color: colors.faint || s.faint, textAlign: align === 'center' ? 'center' : 'left' }}>{c.footnote}</p>
      )}
      <div style={{ height: 1, background: colors.hair || s.hair, marginBottom: 18 }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 28 }}>
        {c.signature
          ? <Signature s={s} name={c.signature} role={c.signatureRole} color={colors.ink} />
          : <Fact s={s} label="Issued by" value="Tryp.com" color={colors.ink} labelColor={colors.faint} />}
        <Fact s={s} label="Awarded" value={c.date} align={align === 'split' ? 'center' : 'left'} color={colors.ink} labelColor={colors.faint} />
        <Fact s={s} label="Certificate ID" value={c.serial} align="right" mono color={colors.ink} labelColor={colors.faint} />
      </div>
      <div style={{ marginTop: 10 }}>
        <Verify s={s} serial={c.serial} align={align === 'center' ? 'center' : 'right'} color={colors.faint} />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// THE SIX LAYOUTS
// ---------------------------------------------------------------------------

/**
 * HORIZON - the hub card down the left, the Tryp plane flying a dotted route
 * across it, the badge at its foot; the certificate's words beside it.
 */
function Horizon({ s, c, o }) {
  const PANEL = 332
  const ink = s.onBlock
  const white = isWhite(ink)
  return (
    <>
      <GradientBlock s={s} style={{ left: 28, top: 28, bottom: 28, width: PANEL }}>
        <Wordmark white={white} height={28} style={{ position: 'absolute', left: 32, top: 34 }} />
        {/* The route climbs from the panel's lower left to the plane's tail
            and on up and out of the top right corner - through the middle of
            the panel, where nothing else is. */}
        {o.route && <Route d="M -10 470 C 70 440, 120 340, 190 318 C 250 300, 290 250, 300 190 C 310 140, 330 120, 360 110" color={ink} opacity={0.55} />}
        {o.plane && <Plane width={230} left={48} top={262} rotate={-14} />}
        {o.medal && <Badge s={s} c={c} size={104} onGradient style={{ left: 30, bottom: 30 }} />}
        <div style={{ position: 'absolute', left: o.medal ? 150 : 32, right: 28, bottom: 42 }}>
          <p style={{ margin: 0, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: ink, opacity: 0.8 }}>
            {c.kind.label}
          </p>
          <p style={{ margin: '6px 0 0', fontSize: 13, fontWeight: 700, color: ink, lineHeight: 1.3 }}>
            Tryp.com Creator<br />Community
          </p>
        </div>
      </GradientBlock>

      <div style={{
        position: 'absolute', left: 28 + PANEL + 60, right: M + 8, top: M, bottom: 170,
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}>
        <Kicker s={s}>{c.subtitle}</Kicker>
        <div style={{ height: c.subtitle ? 12 : 0 }} />
        <Title s={s} size={38}>{c.title}</Title>
        <div style={{ height: 34 }} />
        <Preamble s={s}>{c.preamble}</Preamble>
        <div style={{ height: 6 }} />
        <Name s={s} size={56}>{c.name}</Name>
        <div style={{ height: 14 }} />
        <Body s={s} width={500}>{c.body}</Body>
      </div>
      <Footer s={s} c={c} style={{ left: 28 + PANEL + 60, right: M + 8, bottom: M - 6 }} />
    </>
  )
}

/**
 * BOARDING PASS - a real one: passenger, route from you to Tryp, gate, class
 * and seat, and a stub with the badge and a barcode. The pass is always a white
 * card; the paper is what it lies on.
 */
function Boarding({ s, c, o }) {
  const L = M
  const T = 62
  const W = CERT_W - L * 2
  const H = CERT_H - T * 2
  const STUB = 250
  const BAND = 72
  const initials = (c.name || 'You').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 3).toUpperCase() || 'YOU'
  const ink = '#1A1A1A'
  const faint = '#8E9099'
  const muted = '#5E6068'
  const onBand = s.onAccent
  const white = { ...s, ink, faint, hair: 'rgba(26,26,26,0.10)', accentText: s.accentDeep, muted }
  return (
    <>
      <div style={{
        position: 'absolute', left: L, top: T, width: W, height: H, borderRadius: 26, background: '#ffffff',
        boxShadow: '0 24px 60px rgba(26,26,26,0.16), 0 0 0 1px rgba(26,26,26,0.05)', overflow: 'hidden',
      }}>
        {/* The airline strip. */}
        <div style={{
          position: 'absolute', left: 0, right: 0, top: 0, height: BAND, background: s.grad,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 34px',
        }}>
          <Wordmark white={isWhite(onBand)} height={26} style={{ alignSelf: 'center' }} />
          <span style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: onBand }}>
            Boarding pass
          </span>
        </div>

        {/* Main part */}
        <div style={{ position: 'absolute', left: 36, top: BAND + 30, right: STUB + 36, bottom: 30, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
            <div>
              <Label s={white}>From</Label>
              <p style={{ margin: '4px 0 0', fontSize: 38, fontWeight: 700, letterSpacing: '0.02em', color: ink, lineHeight: 1 }}>{initials}</p>
            </div>
            <div style={{ flex: 1, position: 'relative', height: 40, display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1, borderTop: `3px dotted ${alpha(s.accent, 0.55)}` }} />
              <span style={{ display: 'inline-flex', color: white.accentText, transform: 'rotate(90deg)', margin: '0 10px' }}>
                <Icon name="plane-flight" className="h-7 w-7" />
              </span>
              <div style={{ flex: 1, borderTop: `3px dotted ${alpha(s.accent, 0.55)}` }} />
            </div>
            <div style={{ textAlign: 'right' }}>
              <Label s={white}>To</Label>
              <p style={{ margin: '4px 0 0', fontSize: 38, fontWeight: 700, letterSpacing: '0.02em', color: white.accentText, lineHeight: 1 }}>TRYP</p>
            </div>
          </div>

          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Label s={white}>Passenger</Label>
            <div style={{ height: 4 }} />
            <Name s={white} size={46} color={ink}>{c.name}</Name>
            <div style={{ height: 12 }} />
            <Title s={white} size={22} color={white.accentText}>{c.title}</Title>
            <div style={{ height: 6 }} />
            <Body s={white} width={500} size={14}>{c.body}</Body>
          </div>

          <div style={{ display: 'flex', gap: 30, borderTop: '1px solid rgba(26,26,26,0.08)', paddingTop: 16 }}>
            <Fact s={white} label="Gate" value={c.market || 'Worldwide'} />
            <Fact s={white} label="Class" value={c.kind.label} />
            <Fact s={white} label="Seat" value={c.place ? `${c.place}A` : '1A'} />
            {c.signature && <Fact s={white} label={c.signatureRole || 'Signed'} value={c.signature} />}
          </div>
        </div>

        {/* The perforation, with the two notches a real pass has. */}
        <div style={{ position: 'absolute', top: BAND, bottom: 0, right: STUB, borderLeft: '2px dashed #E4E4E8' }} />
        <div style={{ position: 'absolute', right: STUB - 15, top: BAND - 15, width: 30, height: 30, borderRadius: '50%', background: s.light ? '#F1F1F3' : 'rgba(0,0,0,0.12)' }} />
        <div style={{ position: 'absolute', right: STUB - 15, bottom: -15, width: 30, height: 30, borderRadius: '50%', background: s.light ? '#F1F1F3' : 'rgba(0,0,0,0.12)' }} />

        {/* The stub */}
        <div style={{ position: 'absolute', right: 0, top: BAND, bottom: 0, width: STUB, padding: '26px 28px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {o.medal && (
            <div style={{ position: 'relative', height: 96 }}>
              <Badge s={s} c={c} size={96} style={{ left: 0, top: 0 }} />
            </div>
          )}
          <Fact s={white} label="Awarded" value={c.date} />
          <Fact s={white} label="Certificate ID" value={c.serial} mono />
          <div style={{ marginTop: 'auto', display: 'flex', gap: 3, height: 40, alignItems: 'stretch' }}>
            {Array.from({ length: 34 }).map((_, i) => (
              <span key={i} style={{ flex: [2, 1, 3, 1, 1, 2, 1, 3][i % 8], background: ink, opacity: i % 5 === 0 ? 0.35 : 0.9 }} />
            ))}
          </div>
        </div>
      </div>
      {/* The verify address under the pass, on the paper. */}
      <div style={{ position: 'absolute', left: L, right: L, bottom: 26 }}>
        <Verify s={s} serial={c.serial} align="center" />
      </div>
      {/* A route along the top margin, above the pass, never on it. */}
      {o.route && (
        <Route d={`M -20 40 C 180 14, 360 50, 540 30 S 860 12, 1020 36`} color={s.light ? s.accent : s.ink} opacity={s.light ? 0.3 : 0.45} />
      )}
    </>
  )
}

/**
 * POSTCARD - the message on the left, a stamp and a postmark top right, and
 * the creator on the address lines. The dotted divider is the same dotted line
 * as the routes.
 */
function Postcard({ s, c, o }) {
  const MID = 548
  const line = s.light ? 'rgba(26,26,26,0.14)' : s.hair
  return (
    <>
      <div style={{ position: 'absolute', left: M + 4, top: M + 4, width: MID - M - 60, bottom: M, display: 'flex', flexDirection: 'column' }}>
        <Wordmark white={!s.light && isWhite(s.ink)} height={26} />
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Kicker s={s}>{c.subtitle || 'Greetings from Tryp.com'}</Kicker>
          <div style={{ height: 14 }} />
          <Title s={s} size={38}>{c.title}</Title>
          <div style={{ height: 16 }} />
          <Body s={s} width={420} size={16}>{c.body}</Body>
        </div>
        {c.signature
          ? <Signature s={s} name={c.signature} role={c.signatureRole} />
          : <p style={{ margin: 0, fontSize: 15, fontWeight: 700, color: s.ink }}>The Tryp.com team</p>}
      </div>

      <div style={{ position: 'absolute', left: MID, top: M + 8, bottom: M + 8, borderLeft: `3px dotted ${line}` }} />

      {/* The stamp: a white perforated frame, the gradient, the plane. */}
      <div style={{
        position: 'absolute', right: M + 4, top: M, width: 144, height: 176, padding: 7, background: '#ffffff',
        borderRadius: 6, boxShadow: '0 10px 26px rgba(26,26,26,0.14)',
        outline: '3px dotted rgba(26,26,26,0.12)', outlineOffset: -2,
      }}>
        <div style={{ position: 'relative', width: '100%', height: '100%', borderRadius: 3, overflow: 'hidden', background: s.grad }}>
          <div style={{
            position: 'absolute', right: -60, top: -60, width: 180, height: 180, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.3) 0%, rgba(255,255,255,0) 70%)',
          }} />
          {o.plane && <Plane width={150} left={-10} top={64} rotate={-10} />}
          <span style={{ position: 'absolute', left: 9, top: 8, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', color: s.onAccent }}>TRYP.COM</span>
          <span style={{ position: 'absolute', left: 9, bottom: 8, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', color: s.onAccent, textTransform: 'uppercase' }}>{c.kind.label}</span>
        </div>
      </div>

      {/* The postmark: a ring with the date, and the wavy cancel lines. */}
      <div style={{
        position: 'absolute', right: M + 176, top: M + 70, width: 118, height: 118, borderRadius: '50%',
        border: `2.5px solid ${s.light ? s.accentText : s.ink}`, opacity: 0.7, transform: 'rotate(-14deg)',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        color: s.light ? s.accentText : s.ink,
      }}>
        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.16em' }}>CREATOR POST</span>
        <span style={{ fontSize: 14, fontWeight: 700, marginTop: 4, whiteSpace: 'nowrap' }}>{shortDate(c.date) || 'TRYP.COM'}</span>
        <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: '0.16em', marginTop: 4 }}>{(c.market || 'WORLDWIDE').toUpperCase()}</span>
      </div>
      {o.route && (
        <svg style={{ position: 'absolute', right: M + 200, top: M + 20, width: 150, height: 54, opacity: 0.4 }} aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <path key={i} d={`M 0 ${10 + i * 15} q 18 -9 36 0 t 36 0 t 36 0 t 36 0`} fill="none" stroke={s.light ? s.accentText : s.ink} strokeWidth="2.5" />
          ))}
        </svg>
      )}

      {/* To: the address lines. */}
      <div style={{ position: 'absolute', left: MID + 44, right: M + 4, bottom: M - 4 }}>
        {o.medal && c.place && (
          <div style={{ position: 'relative', height: 84, marginBottom: 12 }}>
            <Badge s={s} c={c} size={84} style={{ left: 0, top: 0 }} />
          </div>
        )}
        <Label s={s}>Awarded to</Label>
        <div style={{ borderBottom: `1.5px solid ${line}`, padding: '6px 0 10px' }}>
          <Name s={s} size={38}>{c.name}</Name>
        </div>
        <div style={{ borderBottom: `1.5px solid ${line}`, padding: '11px 0 8px', fontSize: 13, fontWeight: 700, color: s.ink, whiteSpace: 'nowrap' }}>
          {c.date || 'Tryp.com Content Creator Community'}
        </div>
        <div style={{ borderBottom: `1.5px solid ${line}`, padding: '11px 0 8px' }}>
          <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: s.ink, letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
            {c.serial ? `ID ${c.serial}` : 'Tryp.com Content Creator Community'}
          </span>
        </div>
        <div style={{ marginTop: 8 }}><Verify s={s} serial={c.serial} /></div>
        {c.footnote && <p style={{ margin: '8px 0 0', fontSize: 11, color: s.faint }}>{c.footnote}</p>}
      </div>
    </>
  )
}

/**
 * SKY BANNER - a gradient band across the top with the title on it and the
 * plane at its right, trailing its route off the edge; the badge hangs from
 * the band's lower edge; the name centred and large beneath.
 */
function Banner({ s, c, o }) {
  const BAND = 250
  const ink = s.onBlock
  const white = isWhite(ink)
  return (
    <>
      <GradientBlock s={s} radius={0} style={{ left: 0, right: 0, top: 0, height: BAND }}>
        {/* The trail runs from the plane's tail off the top right edge only. */}
        {o.route && <Route d="M 905 104 C 940 96, 965 70, 1010 30" color={ink} opacity={0.6} />}
        {o.plane && <Plane width={270} left={1000 - M - 290} top={70} rotate={-6} />}
        <div style={{ position: 'absolute', left: M + 8, top: 44 }}>
          <Wordmark white={white} height={28} />
        </div>
        <div style={{ position: 'absolute', left: M + 8, right: 380, bottom: 42 }}>
          <Kicker s={s} color={ink}>{c.subtitle}</Kicker>
          <div style={{ height: c.subtitle ? 10 : 0 }} />
          <Title s={s} size={40} color={ink}>{c.title}</Title>
        </div>
      </GradientBlock>
      {/* The badge hangs from the band's lower edge on the right, under the
          plane, clear of the title. */}
      {o.medal && <Badge s={s} c={c} size={116} style={{ right: M + 20, top: BAND - 58 }} />}

      <div style={{
        position: 'absolute', left: 150, right: 150, top: BAND + 20, bottom: 150,
        display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      }}>
        <Preamble s={s} align="center">{c.preamble}</Preamble>
        <div style={{ height: 6 }} />
        <Name s={s} size={58} align="center">{c.name}</Name>
        <div style={{ height: 12 }} />
        <Body s={s} align="center" width={640} size={16}>{c.body}</Body>
      </div>
      <Footer s={s} c={c} align="center" style={{ left: M + 24, right: M + 24, bottom: M - 20 }} />
    </>
  )
}

/**
 * FLIGHT PATH - a dotted route climbing the left margin and crossing the top
 * margin to the badge at the top right; the certificate centred inside it. The
 * route never enters the text box, which is what made the old one look messy.
 */
function FlightPath({ s, c, o }) {
  const routeColor = s.light ? s.accent : s.ink
  return (
    <>
      {o.route && (
        <Route d="M 30 720 C 34 600, 40 420, 60 300 C 80 190, 140 96, 300 66 C 460 38, 700 40, 818 88"
          color={routeColor} opacity={s.light ? 0.32 : 0.5} width={3.5} gap={12} />
      )}
      {o.medal && <Badge s={s} c={c} size={112} style={{ right: M, top: M - 8 }} />}

      <div style={{
        position: 'absolute', left: 150, right: 150, top: 118, bottom: 176,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
      }}>
        <Wordmark white={!s.light && isWhite(s.ink)} height={30} style={{ alignSelf: 'center' }} />
        <div style={{ height: 26 }} />
        <Kicker s={s} align="center">{c.subtitle}</Kicker>
        <div style={{ height: c.subtitle ? 10 : 0 }} />
        <Title s={s} size={38} align="center">{c.title}</Title>
        <div style={{ height: 26 }} />
        <Preamble s={s} align="center">{c.preamble}</Preamble>
        <div style={{ height: 6 }} />
        <Name s={s} size={56} align="center">{c.name}</Name>
        <div style={{ height: 12 }} />
        <Body s={s} align="center" width={580} size={16}>{c.body}</Body>
      </div>
      <Footer s={s} c={c} align="center" style={{ left: 120, right: M + 8, bottom: M - 20 }} />
    </>
  )
}

/**
 * MINIMAL - the name is the headline, the title a line under it, the badge in
 * the corner. For when the certificate should look like it was not trying.
 */
function Minimal({ s, c, o }) {
  return (
    <>
      <div style={{ position: 'absolute', left: M + 24, top: M + 12 }}>
        <Wordmark white={!s.light && isWhite(s.ink)} height={26} />
      </div>
      {o.medal && <Badge s={s} c={c} size={100} style={{ right: M + 24, top: M }} />}
      {/* One accent stroke down the left edge: the only decoration. */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 10, background: s.light ? s.grad : s.hair }} />

      <div style={{ position: 'absolute', left: M + 24, right: M + 24, top: 150, bottom: 170, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Preamble s={s}>{c.subtitle || c.preamble || 'Awarded to'}</Preamble>
        <div style={{ height: 8 }} />
        <Name s={s} size={80} color={s.ink}>{c.name}</Name>
        <div style={{ height: 18 }} />
        <p style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ width: 34, height: 4, borderRadius: 4, background: s.light ? s.grad : s.ink }} />
          <span style={{ fontSize: 24, fontWeight: 700, color: s.accentText, letterSpacing: '-0.01em' }}>{c.title}</span>
        </p>
        <div style={{ height: 12 }} />
        <Body s={s} width={640} size={15}>{c.body}</Body>
      </div>
      <Footer s={s} c={c} style={{ left: M + 24, right: M + 24, bottom: M - 20 }} />
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
