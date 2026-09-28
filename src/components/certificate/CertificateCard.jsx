import Icon from '../Icon'
import { qrPath, useQrMatrix } from '../../lib/qr'
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
    // The creator's own photo, for the layouts that put a face on it (Horizon,
    // Passport). Optional: every layout still draws without one.
    photo: facts.photo || '',
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

/**
 * A small label with a fact under it.
 *
 * `lead` PUTS THE WEIGHT ON THE LABEL INSTEAD (28 Sep 2026). The Awarded block
 * read as a faint grey "AWARDED" over a bold date, which puts the emphasis on
 * the number rather than on what happened. Ethan: "maybe 'awarded' should be
 * bold, and then below, the date should be in the smaller grey writing."
 * Used for the date; "Certificate ID" and "Issued by" keep the normal order,
 * because there the value IS the fact and the label is just naming a field.
 */
function Fact({ s, label, value, align = 'left', mono = false, color, labelColor, lead = false }) {
  if (!value) return null
  if (lead) {
    return (
      <div style={{ textAlign: align, minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 13, fontWeight: 700, color: color || s.ink, whiteSpace: 'nowrap' }}>
          {label}
        </p>
        <p style={{ margin: '4px 0 0', fontSize: 11, fontWeight: 500, color: labelColor || s.faint, whiteSpace: 'nowrap' }}>
          {value}
        </p>
      </div>
    )
  }
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

/** Where to check it (28 Sep 2026, evening). Ethan: "For the Verify at I
 *  would not have in the code in that link and just say verify at the link and
 *  then have it actually below the certificate ID." The ID is printed right
 *  above it, and /verify asks for it. */
function Verify({ s, serial, align = 'left', color }) {
  if (!serial) return null
  return (
    <p style={{ margin: 0, fontSize: 9.5, fontWeight: 400, color: color || s.faint, textAlign: align, whiteSpace: 'nowrap' }}>
      Verify at <span style={{ fontWeight: 700 }}>{VERIFY_HOST}/verify</span>
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
 *   1st  the full gradient and a white ring (no star: Ethan, 28 Sep, "not
 *        necessary. Keep it simple.")
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
    // ONE FIRST PLACE, EVERYWHERE (28 Sep 2026). Horizon's badge sits on the
    // orange panel, so `onGradient` turned it WHITE while Sky Banner's and the
    // Passport's - which sit on paper - were the orange gradient. Ethan, on
    // Horizon: "the first place in this one is white. I don't like that colour.
    // I prefer the one that's on Sky Banner and Passport, that first place with
    // the orange and that same style."
    //
    // So first place is the orange gradient on every layout. On the panel it
    // would be orange on orange, so there it gets a solid white halo instead of
    // the inset ring: same disc, still the brightest thing on the page.
    const look = p === 1
      ? {
        background: s.grad,
        color: s.onAccent,
        boxShadow: onGradient
          ? `0 0 0 7px #ffffff, 0 16px 32px rgba(0,0,0,0.28)`
          : `0 14px 30px ${alpha(s.accent, 0.35)}, inset 0 0 0 5px rgba(255,255,255,0.4)`,
      }
      : p === 2
        ? { background: '#ffffff', color: s.accentDeep, boxShadow: `0 10px 24px rgba(26,26,26,0.12), inset 0 0 0 5px ${s.accent}` }
        // THIRD IS A SOLID TINT, NOT A TRANSPARENT ONE. It was `alpha(accent,
        // 0.12)`, which let whatever sat behind it show through - on Sky Banner
        // that is the gradient band, and Ethan: "I noticed an issue with third
        // place: it's transparent, and it doesn't look good. Third place should
        // be a light-coloured orange background." Painting the tint over an
        // opaque white makes the same colour solid on any ground.
        : p === 3
          ? {
            background: `linear-gradient(${alpha(s.accent, 0.18)}, ${alpha(s.accent, 0.18)}), #ffffff`,
            color: s.accentDeep,
            boxShadow: `0 10px 24px rgba(26,26,26,0.10), inset 0 0 0 4px ${alpha(s.accent, 0.5)}`,
          }
          // Fourth and beyond: white, with the ordinal doing the work.
          : { background: '#ffffff', color: s.accentDeep, boxShadow: `0 8px 20px rgba(26,26,26,0.10), inset 0 0 0 2px ${alpha(s.accent, 0.45)}` }
    const n = String(p)
    const suffix = ordinal(p).slice(n.length)
    return (
      <div style={{ ...base, ...look }}>
        <span style={{ display: 'flex', alignItems: 'flex-start', lineHeight: 1 }}>
          <span style={{ fontSize: size * (n.length > 1 ? 0.36 : 0.42), fontWeight: 700, letterSpacing: '-0.03em' }}>{n}</span>
          <span style={{ fontSize: size * 0.14, fontWeight: 700, marginTop: size * 0.04, marginLeft: 1 }}>{suffix}</span>
        </span>
        {/* NOTHING UNDER THE NUMBER (28 Sep 2026). The disc printed "1st", then
            the word PLACE, then "of 10" - one fact said three times in a circle
            112px across. Ethan: "don't say 'of 10'. Just say 'first', and you
            don't even need to say 'place'." The ordinal on its own is bigger,
            calmer, and says everything the other two lines did. */}
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
      {/* THE MARK, NOT THE CATEGORY. This used to print PARTICIPANT / MILESTONE
          / HONOUR under the glyph. The certificate's own sentence already says
          what it is for, so the word was the page filing the person under a
          heading. The glyph grows into the space it leaves. */}
      <span style={{ display: 'inline-flex' }}>
        <Icon name={c.kind.icon} className="h-6 w-6" style={{ width: size * 0.4, height: size * 0.4 }} strokeWidth={1.6} />
      </span>
      {c.kind.badgeLabel ? (
        <span style={{ fontSize: Math.max(8, size * 0.08), fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', lineHeight: 1.2, maxWidth: size - 24 }}>
          {c.kind.badgeLabel}
        </span>
      ) : null}
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
      {/* THREE EQUAL COLUMNS (28 Sep 2026). "Awarded looks like it should be
          centred and it's not really centred." Spread with space-between, the
          middle fact sat wherever the widths of its neighbours put it; in a
          1fr/auto/1fr grid it is on the page's true centre line. The verify
          address sits under the ID it verifies. */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'end', gap: 28 }}>
        <div style={{ justifySelf: 'start', minWidth: 0 }}>
          {c.signature
            ? <Signature s={s} name={c.signature} role={c.signatureRole} color={colors.ink} />
            : <Fact s={s} label="Issued by" value="Tryp.com" color={colors.ink} labelColor={colors.faint} />}
        </div>
        <div style={{ justifySelf: 'center' }}>
          <Fact s={s} label="Awarded" value={c.date} align="center" color={colors.ink} labelColor={colors.faint} lead />
        </div>
        <div style={{ justifySelf: 'end', textAlign: 'right' }}>
          <Fact s={s} label="Certificate ID" value={c.serial} align="right" mono color={colors.ink} labelColor={colors.faint} />
          <div style={{ marginTop: 6 }}>
            <Verify s={s} serial={c.serial} align="right" color={colors.faint} />
          </div>
        </div>
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
        {/* THEIR FACE, NOT THE PLANE (28 Sep 2026). Ethan: "make it a bit more
            personal here and maybe also include the profile photo ... rather
            than having the Tryp.com plane on the left side, I would have their
            profile photo there." A large portrait in a white ring, with the
            dotted route looping round it; the plane only when there is no
            photo to show. */}
        {/* NO ROUTE BEHIND THE FACE (28 Sep 2026). The dotted line looped round
            the portrait, which from a foot away reads as a dotted ring drawn on
            the photo rather than a flight path passing behind it. Ethan: "remove
            the dot line that goes around near my profile picture." The route
            stays on the version with the plane, where it is the plane's path and
            has nothing to collide with. */}
        {o.route && !c.photo && (
          <Route d="M -10 470 C 70 440, 120 340, 190 318 C 250 300, 290 250, 300 190 C 310 140, 330 120, 360 110" color={ink} opacity={0.5} />
        )}
        {c.photo ? (
          <div style={{
            position: 'absolute', left: (PANEL - 196) / 2, top: 142, width: 196, height: 196, borderRadius: '50%',
            padding: 6, background: 'rgba(255,255,255,0.95)', boxShadow: '0 18px 40px rgba(0,0,0,0.22)',
          }}>
            <img src={c.photo} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
          </div>
        ) : o.plane && <Plane width={230} left={48} top={262} rotate={-14} />}
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
 * BOARDING PASS - a real one: where you flew from and to, the passenger, class
 * and seat, and a stub with the badge and a QR code that opens this very
 * certificate on /verify. The pass is always a white card; the paper is what
 * it lies on.
 *
 * 28 Sep 2026, evening (Ethan): the dotted line ABOVE the pass is gone; the
 * perforation and its two notches are redrawn as a real tear line; the barcode
 * is a QR code "that could actually take you to the certificate ID website";
 * and the route no longer reads "from RT to TRYP" - it runs from the market to
 * what was won ("Worldwide to 1st place"), and names Tryp.com in full.
 */
function Boarding({ s, c, o }) {
  const L = M
  const T = 62
  const W = CERT_W - L * 2
  const H = CERT_H - T * 2
  const STUB = 252
  const BAND = 72
  const ink = '#1A1A1A'
  const faint = '#8E9099'
  const muted = '#5E6068'
  const onBand = s.onAccent
  const white = { ...s, ink, faint, hair: 'rgba(26,26,26,0.10)', accentText: s.accentDeep, muted }
  const from = c.market || 'Worldwide'
  const to = c.place ? `${ordinal(c.place)} place` : 'Tryp.com'
  // The notches are holes in the pass, so they are the colour of the paper.
  const notch = s.kind === 'ivory' ? '#FBF8F4' : s.light ? '#FFFFFF' : s.accent
  const verifyUrl = c.serial ? `https://${VERIFY_HOST}/verify/${c.serial}` : ''
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
        <div style={{ position: 'absolute', left: 36, top: BAND + 28, right: STUB + 36, bottom: 30, display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
            <div style={{ minWidth: 0 }}>
              <Label s={white}>From</Label>
              <p style={{ margin: '5px 0 0', fontSize: fit(from, 30), fontWeight: 700, color: ink, lineHeight: 1, whiteSpace: 'nowrap' }}>{from}</p>
            </div>
            <div style={{ flex: 1, minWidth: 60, position: 'relative', height: 30, display: 'flex', alignItems: 'center' }}>
              <div style={{ flex: 1, height: 3, backgroundImage: `radial-gradient(circle, ${alpha(s.accent, 0.6)} 1.4px, transparent 1.6px)`, backgroundSize: '9px 3px', backgroundRepeat: 'repeat-x' }} />
              <span style={{ display: 'inline-flex', color: white.accentText, transform: 'rotate(90deg)', margin: '0 8px' }}>
                <Icon name="plane-flight" className="h-6 w-6" />
              </span>
              <div style={{ flex: 1, height: 3, backgroundImage: `radial-gradient(circle, ${alpha(s.accent, 0.6)} 1.4px, transparent 1.6px)`, backgroundSize: '9px 3px', backgroundRepeat: 'repeat-x' }} />
            </div>
            {/* THE DESTINATION SITS ON ITS OWN CENTRE (28 Sep 2026). Ethan
                likes this line - "From Worldwide to First Place. I think that's
                cool" - and asked for the arrival centred rather than shoved
                against the edge: "maybe 'First Place' should be centred, in the
                middle of that right column." */}
            <div style={{ textAlign: 'center', minWidth: 0 }}>
              <Label s={white}>To</Label>
              <p style={{ margin: '5px 0 0', fontSize: fit(to, 30), fontWeight: 700, color: white.accentText, lineHeight: 1, whiteSpace: 'nowrap' }}>{to}</p>
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
            <Fact s={white} label="Class" value={c.kind.label} />
            <Fact s={white} label="Seat" value={c.place ? `${c.place}A` : '1A'} />
            {c.challenge
              ? <Fact s={white} label="Challenge" value={String(c.challenge).length > 26 ? `${String(c.challenge).slice(0, 25)}…` : c.challenge} />
              : <Fact s={white} label="Gate" value={c.market || 'Worldwide'} />}
            {c.signature && <Fact s={white} label={c.signatureRole || 'Signed'} value={c.signature} />}
          </div>
        </div>

        {/* THE TEAR LINE: a column of round perforations, and a notch at each
            end cut the colour of the paper, the way a real stub tears. */}
        <div style={{
          position: 'absolute', top: BAND + 18, bottom: 18, right: STUB - 2, width: 4,
          backgroundImage: 'radial-gradient(circle, #D9D9DE 1.6px, transparent 1.9px)',
          backgroundSize: '4px 11px', backgroundRepeat: 'repeat-y',
        }} />
        <div style={{ position: 'absolute', right: STUB - 13, top: BAND - 13, width: 26, height: 26, borderRadius: '50%', background: notch, boxShadow: 'inset 0 -2px 3px rgba(26,26,26,0.06)' }} />
        <div style={{ position: 'absolute', right: STUB - 13, bottom: -13, width: 26, height: 26, borderRadius: '50%', background: notch, boxShadow: 'inset 0 2px 3px rgba(26,26,26,0.06)' }} />

        {/* The stub */}
        <div style={{ position: 'absolute', right: 0, top: BAND, bottom: 0, width: STUB, padding: '24px 28px 22px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* A block, not a flex item: the snapshot renderer stretched the
              badge to the stub's width when it was one. */}
          {o.medal && (
            <div style={{ display: 'block', flex: '0 0 84px', alignSelf: 'flex-start', minWidth: 84, maxWidth: 84, height: 84, position: 'relative' }}>
              <Badge s={s} c={c} size={84} style={{ left: 0, top: 0, maxWidth: 84, maxHeight: 84 }} />
            </div>
          )}
          <Fact s={white} label="Awarded" value={c.date} />
          <Fact s={white} label="Certificate ID" value={c.serial} mono />
          {/* A BIGGER CODE, AND THE WORDS UNDER IT (28 Sep 2026). "SCAN TO
              VERIFY" sat in a column beside the code, taking a third of the
              stub's width to say something the code already implies - and Ethan
              read it as a status: "I was a bit scared of 'Verify', not as in a
              big thing to the side of it, but just really small text below the
              QR code. The QR code can be bigger on that side."
              Stacked, the code gets the whole width of the stub and the line
              under it is a caption rather than a label. */}
          <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7 }}>
            <QrCode text={verifyUrl} size={STUB - 56} color={ink} />
            <p style={{ margin: 0, fontSize: 8.5, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: faint, lineHeight: 1.4, textAlign: 'center' }}>
              Scan to verify
            </p>
          </div>
        </div>
      </div>
    </>
  )
}

/** A QR code drawn as one SVG path (lib/qr). Blank space of the same size
 *  while it is being made, so nothing shifts when it arrives. */
function QrCode({ text, size = 100, color = '#1A1A1A' }) {
  const m = useQrMatrix(text)
  if (!text) return null
  return (
    <div style={{ width: size, height: size, flexShrink: 0, padding: 6, background: '#ffffff', borderRadius: 10, boxShadow: '0 0 0 1px rgba(26,26,26,0.08)' }}>
      {m && (
        <svg viewBox={`0 0 ${m.size} ${m.size}`} width={size - 12} height={size - 12} shapeRendering="crispEdges" aria-label="QR code to verify this certificate">
          <path d={qrPath(m)} fill={color} />
        </svg>
      )}
    </div>
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
          {/* A PLACE ON THE STAMP, NOT THE PLANE (28 Sep 2026). Ethan: "I don't
              like the Tryp.com plane being on the stamp. I would put something
              else on the stamp instead." A sun going down over hills and the
              sea, drawn in the stamp's own two colours - the thing a postcard
              stamp is always of. */}
          <svg viewBox="0 0 130 162" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
            <circle cx="84" cy="70" r="24" fill="#ffffff" fillOpacity="0.92" />
            <path d="M0 104 C 22 86, 40 84, 58 96 C 76 108, 96 84, 130 92 L130 162 L0 162 Z" fill="#ffffff" fillOpacity="0.28" />
            <path d="M0 118 C 30 104, 58 110, 80 118 C 100 125, 116 116, 130 112 L130 162 L0 162 Z" fill="#ffffff" fillOpacity="0.42" />
            {[0, 1, 2].map((i) => (
              <path key={i} d={`M8 ${134 + i * 9} q 9 -4 18 0 t 18 0 t 18 0 t 18 0 t 18 0 t 18 0`} fill="none" stroke="#ffffff" strokeOpacity={0.75 - i * 0.18} strokeWidth="2" strokeLinecap="round" />
            ))}
          </svg>
          <span style={{ position: 'absolute', left: 9, top: 8, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', color: s.onAccent }}>TRYP.COM</span>
          <span style={{ position: 'absolute', right: 9, top: 7, fontSize: 13, fontWeight: 700, color: s.onAccent }}>{c.place ? ordinal(c.place) : ''}</span>
        </div>
      </div>

      {/* THE POSTMARK SITS BESIDE THE STAMP, NOT ON IT (28 Sep 2026, later).
          It was 300px wide, pinned 24px OUTSIDE the right margin and 96px down -
          so its cancel lines ran straight across the stamp and its outer ring
          clipped the stamp's corner. From a foot away that is not a franking
          mark, it is a second stamp landing on the first, which is exactly what
          Ethan saw: "it should be just the stamp in the right corner, and then
          there are other stamps that are going over the top of it, which looks
          weird."
          Moved to the left of the stamp and narrowed to 220, it clears the
          stamp's left edge by twenty pixels, and the cancel lines run out to the
          right INSIDE its own box - the franking gesture, with nothing under it.
          The stamp now has the corner to itself, which is what a postcard looks
          like. */}
      <svg
        viewBox="0 0 220 130"
        style={{ position: 'absolute', left: MID + 8, top: M + 4, width: 220, height: 130, opacity: 0.78, transform: 'rotate(-10deg)' }}
        aria-hidden="true"
      >
        <defs>
          <path id="pm-top" d="M 20 65 A 45 45 0 0 1 110 65" />
          <path id="pm-bottom" d="M 16 65 A 49 49 0 0 0 114 65" />
        </defs>
        <circle cx="65" cy="65" r="58" fill="none" stroke={s.light ? s.accentText : s.ink} strokeWidth="2.5" />
        <circle cx="65" cy="65" r="40" fill="none" stroke={s.light ? s.accentText : s.ink} strokeWidth="1.5" />
        <text fill={s.light ? s.accentText : s.ink} style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.2em', fontFamily: SANS }}>
          <textPath href="#pm-top" startOffset="50%" textAnchor="middle">CREATOR POST</textPath>
        </text>
        <text fill={s.light ? s.accentText : s.ink} style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.2em', fontFamily: SANS }}>
          <textPath href="#pm-bottom" startOffset="50%" textAnchor="middle">{(c.market || 'Worldwide').toUpperCase()}</textPath>
        </text>
        <text x="65" y="62" textAnchor="middle" fill={s.light ? s.accentText : s.ink} style={{ fontSize: 13, fontWeight: 700, fontFamily: SANS }}>
          {(shortDate(c.date) || 'TRYP.COM').split(' ').slice(0, 2).join(' ')}
        </text>
        <text x="65" y="78" textAnchor="middle" fill={s.light ? s.accentText : s.ink} style={{ fontSize: 11, fontWeight: 700, fontFamily: SANS }}>
          {(shortDate(c.date) || '').split(' ')[2] || ''}
        </text>
        {/* Three waves, ending well inside the 220 box. */}
        {o.route && [0, 1, 2, 3].map((i) => (
          <path key={i} d={`M 128 ${44 + i * 14} q 14 -7 28 0 t 28 0 t 28 0`} fill="none" stroke={s.light ? s.accentText : s.ink} strokeWidth="2.2" strokeLinecap="round" />
        ))}
      </svg>

      {/* THE ADDRESS, REDESIGNED (28 Sep 2026): "those three lines: just
          improve the overall design of this card". The name on its own ruled
          line in large type; the date and the ID as a pair of labelled
          fields on the line under it; how to check it, last. */}
      <div style={{ position: 'absolute', left: MID + 44, right: M + 4, bottom: M - 4 }}>
        {o.medal && c.place && (
          <div style={{ position: 'relative', height: 84, marginBottom: 14 }}>
            <Badge s={s} c={c} size={84} style={{ left: 0, top: 0 }} />
          </div>
        )}
        <Label s={s}>Awarded to</Label>
        <div style={{ borderBottom: `1.5px solid ${line}`, padding: '6px 0 12px' }}>
          <Name s={s} size={38}>{c.name}</Name>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, borderBottom: `1.5px solid ${line}`, padding: '12px 0 10px' }}>
          <Fact s={s} label="Date" value={c.date || '-'} />
          <Fact s={s} label="Certificate ID" value={c.serial || '-'} mono />
        </div>
        <div style={{ marginTop: 9 }}><Verify s={s} serial={c.serial} /></div>
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
 * PASSPORT (the `route` layout key, kept so saved designs still open) - a
 * passport's data page: the creator's photo, the award written as passport
 * fields, an entry stamp, and the machine-readable lines along the foot.
 *
 * 28 Sep 2026, evening. Ethan, of the old dotted-route design: "Flight path
 * card: don't like it at all. I would completely redesign it again ... Maybe go
 * on a different travel theme style." The one travel document every creator
 * has in their bag, with them on it.
 */
function mrzLine(text, len = 44) {
  const clean = String(text || '').toUpperCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Z0-9]+/g, '<')
  return (clean + '<'.repeat(len)).slice(0, len)
}

function Passport({ s, c, o }) {
  const onPaper = s.light ? '#1A1A1A' : s.ink
  const faint = s.light ? '#8E9099' : s.faint
  const accent = s.light ? s.accentDeep : s.ink
  const [first, ...rest] = String(c.name || 'Creator').split(/\s+/)
  const surname = rest.join(' ') || first
  const given = rest.length ? first : ''
  const initials = String(c.name || 'You').split(/\s+/).filter(Boolean).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  const PHOTO_W = 220
  const PHOTO_H = 286
  const TOP = 132
  return (
    <>
      {/* The security print: fine waves across the page, in the accent. */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} aria-hidden="true">
        {Array.from({ length: 16 }).map((_, i) => (
          <path key={i} d={`M -20 ${120 + i * 30} C 180 ${90 + i * 30}, 320 ${160 + i * 30}, 520 ${120 + i * 30} S 860 ${90 + i * 30}, 1020 ${130 + i * 30}`}
            fill="none" stroke={s.accent} strokeOpacity={s.light ? 0.06 : 0.12} strokeWidth="1.2" />
        ))}
      </svg>

      {/* The header band. */}
      <div style={{ position: 'absolute', left: M, right: M, top: M - 6, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.3em', color: accent }}>PASSPORT · PASSEPORT · PASAPORTE</p>
          <p style={{ margin: '6px 0 0', fontSize: 22, fontWeight: 700, letterSpacing: '-0.01em', color: onPaper }}>{c.title}</p>
        </div>
        <Wordmark white={!s.light && isWhite(s.ink)} height={28} style={{ alignSelf: 'center' }} />
      </div>

      {/* The photo, or their initials where there is none. */}
      <div style={{
        position: 'absolute', left: M, top: TOP, width: PHOTO_W, height: PHOTO_H, borderRadius: 18, overflow: 'hidden',
        background: c.photo ? '#EDEDF0' : s.grad, boxShadow: '0 14px 30px rgba(26,26,26,0.16), 0 0 0 5px #ffffff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        {c.photo
          ? <img src={c.photo} alt="" crossOrigin="anonymous" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
          : <span style={{ fontSize: 72, fontWeight: 700, color: s.onAccent, letterSpacing: '-0.02em' }}>{initials}</span>}
      </div>
      {o.medal && <Badge s={s} c={c} size={96} style={{ left: M + PHOTO_W - 60, top: TOP + PHOTO_H - 56 }} />}

      {/* The data. */}
      <div style={{ position: 'absolute', left: M + PHOTO_W + 48, right: M, top: TOP - 4 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px 24px' }}>
          <Fact s={s} label="Type" value="Creator" color={onPaper} labelColor={faint} />
          <Fact s={s} label="Issued by" value="Tryp.com" color={onPaper} labelColor={faint} />
          <Fact s={s} label="Community" value={c.market || 'Worldwide'} color={onPaper} labelColor={faint} />
        </div>
        {/* THEIR NAME THE WAY THEY WRITE IT (28 Sep 2026). This printed
            "SURNAME, Given" - correct for a real passport data page, and the
            reason the layout felt authentic - but it is a certificate with
            somebody's name on it before it is a pastiche. Ethan: "this one
            shows their name backwards. I still want to do this: still put their
            name forwards, just their normal name."
            The machine-readable strip at the foot keeps the passport ordering,
            because that is a barcode rather than a way of addressing somebody. */}
        <div style={{ marginTop: 30 }}>
          <Label s={s} color={faint}>Name</Label>
          <p style={{ margin: '6px 0 0', fontSize: fit(c.name, 44), fontWeight: 700, lineHeight: 1.05, letterSpacing: '-0.02em', color: accent }}>
            {c.name}
          </p>
        </div>
        <div style={{ marginTop: 16 }}>
          <Body s={s} width={430} size={15} color={s.light ? '#5E6068' : s.muted}>{c.body}</Body>
        </div>
        <div style={{ marginTop: 34, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 24 }}>
          <Fact s={s} label="Award" value={c.kind.label} color={onPaper} labelColor={faint} />
          <Fact s={s} label="Date of issue" value={c.date} color={onPaper} labelColor={faint} />
          <div>
            <Fact s={s} label="Certificate ID" value={c.serial} mono color={onPaper} labelColor={faint} />
            <div style={{ marginTop: 5 }}><Verify s={s} serial={c.serial} color={faint} /></div>
          </div>
        </div>
      </div>

      {/* The entry stamp, pressed on at an angle. */}
      {o.route && (
        <div style={{
          position: 'absolute', right: M + 20, top: 452, width: 158, height: 100, borderRadius: 16,
          border: `3px solid ${alpha(s.accent, 0.7)}`, color: alpha(s.accent, 0.85), transform: 'rotate(-9deg)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        }}>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.24em' }}>ADMITTED</span>
          <span style={{ fontSize: 17, fontWeight: 700, marginTop: 3, whiteSpace: 'nowrap' }}>{shortDate(c.date) || 'TRYP.COM'}</span>
          <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', marginTop: 3 }}>{(c.market || 'WORLDWIDE').toUpperCase()}</span>
        </div>
      )}

      {/* The machine-readable zone. */}
      <div style={{
        position: 'absolute', left: M, right: M, bottom: M - 20, paddingTop: 14, borderTop: `1px solid ${s.light ? 'rgba(26,26,26,0.10)' : s.hair}`,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace', fontSize: 19, letterSpacing: '0.2em', lineHeight: 1.45, color: onPaper, opacity: 0.8,
      }}>
        <div>{mrzLine(`P<TRYP${surname}<<${given}`, 44)}</div>
        <div>{mrzLine(`${c.serial || 'TRYP'}<<${c.kind.label}<<${c.market || 'WORLDWIDE'}`, 44)}</div>
      </div>
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
      <div style={{ position: 'absolute', left: M + 40, top: M + 12 }}>
        <Wordmark white={!s.light && isWhite(s.ink)} height={26} />
      </div>
      {/* BIGGER, BECAUSE IT IS THE ONLY ORNAMENT HERE (28 Sep 2026). Ethan:
          "the minimal one looks pretty decent too... maybe make that first place
          icon there slightly bigger." On a layout that is deliberately mostly
          white, the badge is carrying the whole page, and at 100px it read as an
          afterthought in the corner. */}
      {o.medal && <Badge s={s} c={c} size={124} style={{ right: M + 24, top: M }} />}
      {/* One accent band down the left edge: the only decoration. Wider since
          28 Sep ("the orange bit on the left side, I think, should be bigger"). */}
      <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 30, background: s.light ? s.grad : s.hair }} />

      <div style={{ position: 'absolute', left: M + 40, right: M + 24, top: 150, bottom: 170, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <Preamble s={s}>{c.subtitle || c.preamble || 'Awarded to'}</Preamble>
        <div style={{ height: 8 }} />
        <Name s={s} size={80} color={s.ink}>{c.name}</Name>
        <div style={{ height: 18 }} />
        {/* No dash before the title (28 Sep): "I don't like the em dash." */}
        <p style={{ margin: 0, fontSize: 24, fontWeight: 700, color: s.accentText, letterSpacing: '-0.01em' }}>{c.title}</p>
        <div style={{ height: 12 }} />
        <Body s={s} width={640} size={15}>{c.body}</Body>
      </div>
      <Footer s={s} c={c} style={{ left: M + 40, right: M + 24, bottom: M - 20 }} />
    </>
  )
}

const LAYOUTS = {
  horizon: Horizon,
  boarding: Boarding,
  postcard: Postcard,
  banner: Banner,
  route: Passport,
  minimal: Minimal,
}
