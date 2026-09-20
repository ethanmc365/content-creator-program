import { alpha, designStyle, fillTemplate, formatAwardDate, shift, tierOf } from '../../lib/certificates'

// A CERTIFICATE, AS A PICTURE.
//
// Fixed 1000x707 and never responsive, for the reason `lib/domSnapshot` exists:
// this component is PHOTOGRAPHED. A picture has no viewport to be responsive
// to, and a layout that reflowed would produce a different certificate on a
// phone than on a laptop - two people with the same award holding different
// objects. Every page scales it with a CSS transform instead, so what is on
// screen and what is downloaded are the same pixels.
//
// 1000x707 IS ROOT-2, which is A4 landscape, and it does not change. Ethan:
// "make sure you keep the correct aspect ratio." It is also what lets the same
// component be a page of the portfolio PDF with no second layout.
//
// ---------------------------------------------------------------------------
// THE REDESIGN (20 Sep 2026), AND WHAT IT IS ACTUALLY FIXING
//
// Ethan, on the previous version: "I still do not like how they look at all. I
// think it's really like AI style, really bad. I want it completely,
// completely, utterly redesigned. Like instead of just changing how it
// currently looks like, I want it completely redesigned."
//
// The previous version was ONE composition - kicker, centred title, rule,
// centred name, centred paragraph, three things along the bottom, a full-width
// orange bar top and bottom - with a colour wash behind it. That shape is the
// shape every certificate generator produces, which is exactly why it read as
// generated, and no amount of re-colouring it was going to help. Three earlier
// passes had tried: per-tier colours, then all-orange, then removing the emblem
// and the starburst. Each was an improvement and none of them touched the
// reason.
//
// So the composition is now a CHOICE, and there are six of them - see LAYOUTS
// in lib/certificates. A layout here is a real, separate piece of page design
// with its own margins, its own hierarchy and its own idea of where the accent
// lives. They do not share a skeleton with the accent moved around; they share
// ATOMS (Kicker, Title, Name, Body, Credential) and nothing else.
//
// THE FOUR SPECIFIC THINGS HE ASKED FOR:
//
//  "improve the accent color, because currently we have one, two, three, four
//   orange and one black... I want a lot of different colors"
//     -> ten accents, every one able to carry white type (lib/certificates).
//
//  "I still don't like the background color, is that like weirdly goldeny,
//   orangey glow. I just don't like that color."
//     -> gone entirely. The ground used to be the accent at 14% bled into two
//        corners, which on orange is precisely a goldeny glow. Grounds are
//        PAPERS now - white, ivory, mist, a flat 5% accent tint, near-black -
//        and not one of them is a gradient.
//
//  "it's quite weird the way the bars are at the bottom and not on the sides"
//     -> nothing has a bar along the bottom. Four of the six layouts carry the
//        accent on a VERTICAL edge, and the other two have no bar at all.
//
//  "improve the fonts, the style, the spacing, the UI, everything"
//     -> Instrument Serif for the display line and the name, Poppins for
//        everything a reader scans rather than reads. A certificate set wholly
//        in a geometric sans is a slide; the serif is what makes it a document.
//        Self-hosted so the photograph and the screen are the same face - see
//        the note in index.css.
//
// EVERY DESIGN IS STILL THIS ONE COMPONENT. An admin picks words, a layout, an
// accent and a paper; if a tier needed its own JSX the builder would be lying
// about what it can make.
// ---------------------------------------------------------------------------

// WHERE /verify ACTUALLY LIVES. Not tryp.com - that is the main website and has
// no verify page. This app is the canonical host (see lib/canonicalHost), and
// printing the wrong one is why the line on the certificate did nothing.
const VERIFY_HOST = 'trypcreators.vercel.app'

export const CERT_W = 1000
export const CERT_H = 707

const SANS = 'Poppins, system-ui, sans-serif'
const SERIF = '"Instrument Serif", Georgia, "Times New Roman", serif'

/**
 * A display size that survives a long name.
 *
 * "Leonardo Alfonso Guerrero Urrutia" is a real creator in this programme and
 * it is thirty-three characters. Set at the size "Mirsu" wants, it wraps to
 * three lines and pushes the body off the card - and because this component is
 * photographed at a fixed height, "off the card" means silently cropped rather
 * than scrolled. So the one thing that has to flex is the type size, and it
 * flexes in STEPS rather than continuously: a smooth function gives every
 * certificate its own slightly different size, and certificates in one set
 * should look like each other.
 */
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
    // A BODY THAT RENDERED TO NOTHING IS NOT AN EMPTY BOX. `fillTemplate` drops
    // any line whose detail is missing and deliberately does not invent a
    // replacement - that decision belongs here, where somebody can see it.
    body: fillTemplate(d.body, facts) || 'for taking part in the Tryp.com Content Creator Community',
    footnote: fillTemplate(d.footnote, facts),
    name: facts.name || '',
    date: facts.date ? formatAwardDate(facts.date) : '',
    serial: facts.serial || '',
    signature: d.signature || '',
    signatureRole: d.signature_role || '',
    tier: tier.label,
  }

  const Layout = LAYOUTS[s.layout.key] || LAYOUTS.rail

  return (
    <div
      ref={cardRef}
      className={className}
      style={{
        width: CERT_W,
        height: CERT_H,
        position: 'relative',
        overflow: 'hidden',
        background: s.bg,
        color: s.ink,
        fontFamily: SANS,
        // A photograph has no hinting context to inherit, and the serif at 60px
        // is noticeably softer in the PNG without this.
        WebkitFontSmoothing: 'antialiased',
      }}
    >
      <Layout s={s} c={c} />
    </div>
  )
}

// ---------------------------------------------------------------------------
// THE ATOMS
//
// Deliberately small, and deliberately with no opinion about position: a layout
// owns its own margins and its own stacking. An atom that decided its own
// `marginTop` would make all six layouts agree about rhythm, and six
// compositions with one rhythm is one composition.
// ---------------------------------------------------------------------------

/** The line above the title. Small, wide-tracked, never the loudest thing. */
function Kicker({ s, children, align = 'left', size = 11 }) {
  if (!children) return null
  return (
    <p style={{
      margin: 0,
      fontFamily: SANS,
      fontSize: size,
      fontWeight: 700,
      // 0.42em at 13px was five pixels between every letter - "the fonts are a
      // bit weird". 0.18em still reads as a kicker and is still a word.
      letterSpacing: '0.18em',
      textTransform: 'uppercase',
      color: s.accentText,
      textAlign: align,
    }}>
      {children}
    </p>
  )
}

function Title({ s, children, size = 54, align = 'left' }) {
  return (
    <p style={{
      margin: 0,
      fontFamily: SERIF,
      fontWeight: 400,
      fontSize: fit(children, size),
      lineHeight: 1.05,
      letterSpacing: '-0.005em',
      color: s.ink,
      textAlign: align,
    }}>
      {children}
    </p>
  )
}

/** "This certifies that". Quiet on purpose - the name under it is the statement. */
function Preamble({ s, children = 'This certifies that', align = 'left' }) {
  return (
    <p style={{
      margin: 0,
      fontFamily: SANS,
      fontSize: 12,
      fontWeight: 500,
      letterSpacing: '0.04em',
      color: s.faint,
      textAlign: align,
    }}>
      {children}
    </p>
  )
}

function Name({ s, children, size = 62, align = 'left', color }) {
  if (!children) return null
  return (
    <p style={{
      margin: 0,
      fontFamily: SERIF,
      fontWeight: 400,
      fontSize: fit(children, size),
      lineHeight: 1.08,
      letterSpacing: '-0.01em',
      color: color || s.accentText,
      textAlign: align,
    }}>
      {children}
    </p>
  )
}

/**
 * The sentence the admin wrote.
 *
 * `whiteSpace: 'pre-line'` because `fillTemplate` works a LINE at a time and
 * drops any line whose detail is missing - so the line breaks an admin typed
 * are load-bearing, not decoration.
 */
function Body({ s, children, align = 'left', width = 560, size = 18 }) {
  if (!children) return null
  return (
    <p style={{
      margin: 0,
      maxWidth: width,
      fontFamily: SANS,
      fontSize: size,
      fontWeight: 400,
      lineHeight: 1.62,
      color: s.muted,
      whiteSpace: 'pre-line',
      textAlign: align,
      ...(align === 'center' ? { marginLeft: 'auto', marginRight: 'auto' } : null),
    }}>
      {children}
    </p>
  )
}

/** A label over a value. The bottom of most layouts is two or three of these. */
function Fact({ s, label, value, align = 'left', mono = false }) {
  if (!value) return null
  return (
    <div style={{ textAlign: align }}>
      <p style={{
        margin: 0, fontFamily: SANS, fontSize: 8.5, fontWeight: 700,
        letterSpacing: '0.16em', textTransform: 'uppercase', color: s.faint,
      }}>
        {label}
      </p>
      <p style={{
        margin: '4px 0 0', fontFamily: SANS, fontSize: 13, fontWeight: 600,
        letterSpacing: mono ? '0.08em' : 'normal', color: s.ink,
        ...(mono ? { fontVariantNumeric: 'tabular-nums' } : null),
      }}>
        {value}
      </p>
    </div>
  )
}

/**
 * THE CREDENTIAL ID, LABELLED, AND AT AN ADDRESS THAT EXISTS.
 *
 * Ethan, on the first version: "I don't get the tryp.com 2026 code, I don't
 * think that's necessary" and "check it out at tryp.com/verify - what does that
 * mean? It doesn't seem to be working."
 *
 * Both fair, and the second was a real bug: `tryp.com` is the main website and
 * has no such page. A serial reads as noise when nothing says what it is, and
 * an address that resolves nowhere is worse than no address - so it is labelled
 * and it points at the host that actually answers.
 *
 * PLAIN TEXT, NOT A LINK: this node is photographed, and an anchor inside a PNG
 * is a rectangle that does nothing.
 */
function Credential({ s, serial, align = 'left' }) {
  if (!serial) return null
  return (
    <div style={{ textAlign: align }}>
      <Fact s={s} label="Certificate ID" value={serial} align={align} mono />
      <p style={{
        margin: '3px 0 0', fontFamily: SANS, fontSize: 9.5, fontWeight: 400,
        letterSpacing: '0.02em', color: s.faint,
      }}>
        Verify at {VERIFY_HOST}/verify
      </p>
    </div>
  )
}

/**
 * The real logo.
 *
 * Ethan: "use the actual tryp.com logo somewhere." Natural aspect and a fixed
 * HEIGHT - the asset is a 1200x630 card and squaring it crops it, which is the
 * same mistake the portfolio cover and the verify page's header were making.
 *
 * ON A DARK PAPER IT SITS ON A WHITE PLATE, because the asset has a white
 * ground baked into it. Inverting it would give black on black; a plate is what
 * a brand actually does with a light-only mark, and it reads as deliberate.
 *
 * `crossOrigin` because `domSnapshot` has to read the pixels back out of it.
 */
function Logo({ s, height = 40 }) {
  const img = (
    <img
      src="/brand/tryp-logo.png"
      alt="Tryp.com"
      crossOrigin="anonymous"
      style={{ height, width: 'auto', display: 'block', objectFit: 'contain', borderRadius: 6 }}
    />
  )
  if (s.light) return img
  return (
    <span style={{ display: 'inline-flex', padding: 7, borderRadius: 10, background: '#ffffff' }}>
      {img}
    </span>
  )
}

/** A short, heavy accent rule. Structure, not decoration - it separates. */
function Rule({ s, width = 72, height = 3, align = 'left' }) {
  return (
    <div style={{
      width,
      height,
      background: s.accent,
      borderRadius: height,
      ...(align === 'center' ? { marginLeft: 'auto', marginRight: 'auto' } : null),
    }} />
  )
}

/** A hairline across the page. Belongs to the paper, not to the accent. */
function Hair({ s, style }) {
  return <div style={{ height: 1, width: '100%', background: s.hair, ...style }} />
}

/** The signed-by block. Empty when nobody signed it, and takes no space then. */
function Signature({ s, name, role, align = 'left' }) {
  if (!name) return null
  return (
    <div style={{ textAlign: align }}>
      <p style={{ margin: 0, fontFamily: SERIF, fontSize: 22, lineHeight: 1.2, color: s.ink }}>
        {name}
      </p>
      <div style={{
        height: 1, width: 150, background: s.hair,
        margin: align === 'right' ? '7px 0 6px auto' : '7px 0 6px',
      }} />
      <p style={{
        margin: 0, fontFamily: SANS, fontSize: 9.5, fontWeight: 600,
        letterSpacing: '0.14em', textTransform: 'uppercase', color: s.faint,
      }}>
        {role || 'Tryp.com'}
      </p>
    </div>
  )
}

/** Set sideways down an edge. The tier, on the rail and on the ticket stub. */
function Upright({ children, color, size = 11, gap = '0.3em' }) {
  return (
    <span style={{
      fontFamily: SANS, fontSize: size, fontWeight: 700, letterSpacing: gap,
      textTransform: 'uppercase', color, whiteSpace: 'nowrap',
      writingMode: 'vertical-rl', transform: 'rotate(180deg)',
    }}>
      {children}
    </span>
  )
}

// ---------------------------------------------------------------------------
// THE SIX LAYOUTS
// ---------------------------------------------------------------------------

/**
 * RAIL - a solid accent column down the left, everything else left-aligned.
 *
 * The one that looks least like a certificate and most like something a design
 * team made, which is why it is the default. The rail does three jobs at once:
 * it is the brand block, it carries the logo somewhere that is not floating
 * above the title, and it names the tier without spending a line of the page on
 * it. What is left beside it is a single left margin with nothing centred,
 * which is the most direct possible break from the old composition.
 */
function Rail({ s, c }) {
  const RAIL = 104
  return (
    <>
      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, width: RAIL,
        background: `linear-gradient(180deg, ${s.accent} 0%, ${shift(s.accent, -0.18)} 100%)`,
        display: 'flex', flexDirection: 'column', alignItems: 'center',
        justifyContent: 'space-between', padding: '40px 0 44px',
      }}>
        <img
          src="/brand/tryp-logo.png"
          alt="Tryp.com"
          crossOrigin="anonymous"
          style={{ height: 40, width: 'auto', display: 'block', objectFit: 'contain', borderRadius: 6 }}
        />
        <Upright color={s.onAccent} gap="0.34em">{c.tier}</Upright>
      </div>

      {/* The quiet second edge. Without it the page leans left; with a second
          solid rail it would be a frame, which is the layout below. */}
      <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 7, background: alpha(s.accent, 0.35) }} />

      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: RAIL, right: 7,
        padding: '58px 74px 50px', display: 'flex', flexDirection: 'column',
      }}>
        {/* THE BLOCK IS CENTRED IN THE SPACE IT HAS, NOT PINNED TO THE TOP.
            A certificate's words sit in the middle of the sheet; top-aligning
            them and pushing the footer down left a hand's width of nothing
            across the middle of the page, which reads as unfinished rather than
            as air. `flex: 1` + centre gives the same result at any body
            length. */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <Kicker s={s}>{c.subtitle}</Kicker>
          <div style={{ height: c.subtitle ? 16 : 0 }} />
          <Title s={s} size={56}>{c.title}</Title>
          <div style={{ height: 22 }} />
          <Rule s={s} width={80} height={4} />
          <div style={{ height: 30 }} />
          <Preamble s={s} />
          <div style={{ height: 6 }} />
          <Name s={s} size={64}>{c.name}</Name>
          <div style={{ height: 18 }} />
          <Body s={s} width={600}>{c.body}</Body>
        </div>

        <div>
          {c.footnote && (
            <p style={{ margin: '0 0 14px', fontFamily: SANS, fontSize: 11, color: s.faint }}>{c.footnote}</p>
          )}
          <Hair s={s} style={{ marginBottom: 18 }} />
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 28 }}>
            <Signature s={s} name={c.signature} role={c.signatureRole} />
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 40 }}>
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
 * COLUMNS - two slim accent edges holding a centred, classical page.
 *
 * The formal one, and the only centred layout with bars on it. It exists
 * because a certificate for a first place SHOULD be allowed to look like a
 * certificate; what was wrong before was that EVERY certificate looked like
 * this one, and that its bars ran along the bottom, where they read as the
 * footer of a slide rather than as the edge of a printed page.
 */
function Columns({ s, c }) {
  const BAR = 18
  const bar = `linear-gradient(180deg, ${s.accent} 0%, ${shift(s.accent, -0.22)} 100%)`
  return (
    <>
      <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, width: BAR, background: bar }} />
      <div style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: BAR, background: bar }} />

      {/* Two rules rather than a border, so the corners stay square against the
          paper. Square is the point: a rounded frame is a card, and this is
          meant to read as a printed sheet. */}
      <div style={{ position: 'absolute', top: 36, bottom: 36, left: BAR + 30, right: BAR + 30, border: `1.5px solid ${s.rule}` }} />
      <div style={{ position: 'absolute', top: 44, bottom: 44, left: BAR + 38, right: BAR + 38, border: `1px solid ${s.hair}` }} />

      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: BAR, right: BAR,
        padding: '58px 96px 52px', display: 'flex', flexDirection: 'column',
        alignItems: 'center', textAlign: 'center',
      }}>
        {/* Centred in the space it has - see the note on Rail. */}
        <div style={{
          flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Logo s={s} height={44} />
          <div style={{ height: 22 }} />
          <Kicker s={s} align="center">{c.subtitle}</Kicker>
          <div style={{ height: c.subtitle ? 14 : 0 }} />
          <Title s={s} size={50} align="center">{c.title}</Title>

          {/* A rule with a mark in the middle of it. One piece of ornament, and
              it is a geometric mark rather than a flourish - a flourish is the
              other half of what made the old one look bought. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 22px' }}>
            <div style={{ width: 84, height: 1, background: s.rule }} />
            <div style={{ width: 7, height: 7, background: s.accent, transform: 'rotate(45deg)' }} />
            <div style={{ width: 84, height: 1, background: s.rule }} />
          </div>

          <Preamble s={s} align="center" />
          <div style={{ height: 6 }} />
          <Name s={s} size={56} align="center">{c.name}</Name>
          <div style={{ height: 16 }} />
          <Body s={s} align="center" width={600} size={17}>{c.body}</Body>
        </div>

        <div style={{ width: '100%' }}>
          {c.footnote && (
            <p style={{ margin: '0 0 12px', fontFamily: SANS, fontSize: 11, color: s.faint, textAlign: 'center' }}>{c.footnote}</p>
          )}
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
            <Signature s={s} name={c.signature} role={c.signatureRole} />
            <Credential s={s} serial={c.serial} align="center" />
            <Fact s={s} label="Awarded" value={c.date} align="right" />
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * CREST - editorial. A wide left margin, a heavy rule, the name set large.
 *
 * Borrowed from a magazine opener rather than from a certificate, which is the
 * whole idea: the thing a creator posts is a PICTURE, and a picture composed
 * asymmetrically reads as designed. The credential moves into its own column on
 * the right so the foot of the page is not a row of three centred items, which
 * is the single most template-looking arrangement there is.
 */
function Crest({ s, c }) {
  return (
    <>
      {/* A part-height bar rather than a full one. It starts and stops with the
          text block, so it reads as a margin mark and not as a border. */}
      <div style={{ position: 'absolute', top: 76, bottom: 76, left: 0, width: 11, background: s.accent }} />

      <div style={{ position: 'absolute', inset: 0, padding: '56px 62px 50px 80px', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 24 }}>
          <Logo s={s} height={44} />
          <div style={{ textAlign: 'right' }}>
            <Kicker s={s} align="right" size={10}>{c.tier}</Kicker>
            {c.date && (
              <p style={{ margin: '6px 0 0', fontFamily: SANS, fontSize: 11, color: s.faint }}>{c.date}</p>
            )}
          </div>
        </div>

        <div style={{ marginTop: 40, display: 'flex', gap: 44, flex: 1, minHeight: 0 }}>
          {/* Centred in its column, like the other layouts - see the note on
              Rail. Crest is the one with the most furniture above it, so a
              top-aligned block here left the largest hole. */}
          <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <Kicker s={s} size={10}>{c.subtitle}</Kicker>
            <div style={{ height: c.subtitle ? 12 : 0 }} />
            <Title s={s} size={46}>{c.title}</Title>
            <div style={{ height: 18 }} />
            <Rule s={s} width={96} height={5} />
            <div style={{ height: 24 }} />
            <Preamble s={s} />
            <div style={{ height: 4 }} />
            <Name s={s} size={64}>{c.name}</Name>
            <div style={{ height: 16 }} />
            <Body s={s} width={500} size={16.5}>{c.body}</Body>
            <div style={{ height: 34 }} />
            <Signature s={s} name={c.signature} role={c.signatureRole} />
          </div>

          {/* The right column: everything that is evidence rather than prose. */}
          <div style={{
            width: 206, flexShrink: 0, borderLeft: `1px solid ${s.hair}`, paddingLeft: 26,
            display: 'flex', flexDirection: 'column', gap: 20,
          }}>
            <Credential s={s} serial={c.serial} />
            <Fact s={s} label="Issued by" value="Tryp.com Creator Community" />
            {c.footnote && (
              <p style={{ margin: 0, fontFamily: SANS, fontSize: 10.5, lineHeight: 1.6, color: s.faint }}>{c.footnote}</p>
            )}
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * PLAQUE - a framed panel with corner marks. The formal one, done properly.
 *
 * This is the closest thing here to what the old certificate was trying to be,
 * and it is kept for one reason: designs written before the layouts existed
 * land on it (see `designStyle`), so what an admin approved last week still
 * looks like what they approved. It is a better version of that page - corner
 * marks instead of two rounded rectangles, a real serif, and a paper instead of
 * a glow - not a copy of it.
 */
function Plaque({ s, c }) {
  const M = 34
  const ARM = 30
  return (
    <>
      <div style={{ position: 'absolute', inset: M, border: `1px solid ${s.hair}` }} />
      <div style={{ position: 'absolute', inset: M + 9, border: `1px solid ${s.hair}` }} />

      {/* Four corner marks. Two bars each rather than a border, so the arms can
          be heavier than the frame they sit on without thickening it. */}
      {[
        { top: M - 1, left: M - 1 }, { top: M - 1, right: M - 1 },
        { bottom: M - 1, left: M - 1 }, { bottom: M - 1, right: M - 1 },
      ].map((pos, i) => {
        const vertical = pos.top != null ? { top: 0 } : { bottom: 0 }
        const horizontal = pos.left != null ? { left: 0 } : { right: 0 }
        return (
          <div key={i} style={{ position: 'absolute', width: ARM, height: ARM, ...pos }}>
            <div style={{ position: 'absolute', background: s.accent, height: 3, width: ARM, ...vertical, ...horizontal }} />
            <div style={{ position: 'absolute', background: s.accent, width: 3, height: ARM, ...vertical, ...horizontal }} />
          </div>
        )
      })}

      <div style={{
        position: 'absolute', inset: M + 9, padding: '42px 92px 38px',
        display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
      }}>
        <div style={{
          flex: 1, minHeight: 0, width: '100%', display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Logo s={s} height={42} />
          <div style={{ height: 20 }} />
          <Kicker s={s} align="center">{c.subtitle || c.tier}</Kicker>
          <div style={{ height: 14 }} />
          <Title s={s} size={48} align="center">{c.title}</Title>
          <div style={{ height: 22 }} />
          <Rule s={s} width={64} height={3} align="center" />
          <div style={{ height: 24 }} />
          <Preamble s={s} align="center" />
          <div style={{ height: 6 }} />
          <Name s={s} size={54} align="center">{c.name}</Name>
          <div style={{ height: 16 }} />
          <Body s={s} align="center" width={560} size={16.5}>{c.body}</Body>
        </div>

        <div style={{ width: '100%' }}>
          {c.footnote && (
            <p style={{ margin: '0 0 12px', fontFamily: SANS, fontSize: 10.5, color: s.faint }}>{c.footnote}</p>
          )}
          <Hair s={s} style={{ marginBottom: 14 }} />
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
            <Signature s={s} name={c.signature} role={c.signatureRole} />
            <Credential s={s} serial={c.serial} align="center" />
            <Fact s={s} label="Awarded" value={c.date} align="right" />
          </div>
        </div>
      </div>
    </>
  )
}

/**
 * TICKET - a boarding pass, with a perforated stub down the right.
 *
 * The one that could only belong to this programme. Tryp.com is a travel
 * company and the community's own daily puzzle is called Flight Path; a
 * certificate shaped like a boarding pass makes the same joke the rest of the
 * product already makes, and it is the layout least mistakable for something a
 * generator produced.
 *
 * The stub is functionally right as well as thematic: the date and the
 * credential id are the two things somebody CHECKS rather than reads, and a
 * stub is where a ticket puts the part you tear off and keep.
 */
function Ticket({ s, c }) {
  const STUB = 268
  const EDGE = 14
  const notch = (pos) => ({
    position: 'absolute', width: 26, height: 26, borderRadius: '50%',
    background: s.bg, right: STUB - 13, ...pos,
  })
  return (
    <>
      <div style={{
        position: 'absolute', top: 0, bottom: 0, right: 0, width: EDGE,
        background: `linear-gradient(180deg, ${s.accent} 0%, ${shift(s.accent, -0.22)} 100%)`,
      }} />

      {/* The perforation. A dashed rule between two notches, which is what makes
          the eye read "tear here" rather than "divider". */}
      <div style={{ position: 'absolute', top: 18, bottom: 18, right: STUB, borderLeft: `2px dashed ${s.hair}` }} />
      <div style={notch({ top: -13 })} />
      <div style={notch({ bottom: -13 })} />

      <div style={{
        position: 'absolute', top: 0, bottom: 0, left: 0, right: STUB + 2,
        padding: '56px 52px 48px 62px', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
          <Logo s={s} height={40} />
          <Kicker s={s} align="right" size={10}>{c.subtitle}</Kicker>
        </div>

        <div style={{ height: 38 }} />
        <Title s={s} size={44}>{c.title}</Title>
        <div style={{ height: 18 }} />
        <Rule s={s} width={72} height={4} />
        <div style={{ height: 24 }} />
        <Preamble s={s} />
        <div style={{ height: 4 }} />
        <Name s={s} size={56}>{c.name}</Name>
        <div style={{ height: 16 }} />
        <Body s={s} width={460} size={16}>{c.body}</Body>

        <div style={{ marginTop: 'auto' }}>
          <Signature s={s} name={c.signature} role={c.signatureRole} />
        </div>
      </div>

      <div style={{
        position: 'absolute', top: 0, bottom: 0, right: EDGE, width: STUB - EDGE,
        padding: '52px 30px 46px 38px', display: 'flex', flexDirection: 'column',
        alignItems: 'flex-start',
      }}>
        <Upright color={s.accentText} gap="0.34em">{c.tier}</Upright>
        <div style={{ height: 24 }} />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, width: '100%' }}>
          <Fact s={s} label="Awarded" value={c.date} />
          <Credential s={s} serial={c.serial} />
          {c.footnote && (
            <p style={{ margin: 0, fontFamily: SANS, fontSize: 10, lineHeight: 1.6, color: s.faint }}>{c.footnote}</p>
          )}
        </div>
        <div style={{ marginTop: 'auto', width: '100%' }}>
          <Hair s={s} style={{ marginBottom: 12 }} />
          <p style={{
            margin: 0, fontFamily: SANS, fontSize: 9, fontWeight: 700,
            letterSpacing: '0.16em', textTransform: 'uppercase', color: s.faint,
          }}>
            Tryp.com
          </p>
        </div>
      </div>
    </>
  )
}

/**
 * MINIMAL - almost nothing, and the name is the headline.
 *
 * The hierarchy is deliberately upside down: on every other layout the TITLE is
 * the biggest thing and the name sits under "This certifies that". Here the
 * name IS the page and the title is a small line beneath it, which is honest
 * about what the object is for - nobody screenshots "Certificate of
 * Achievement", they screenshot their own name.
 *
 * It is also the layout that survives the most words. There is no frame to run
 * into and no stub to avoid, so a long title and a four-line body still sit
 * comfortably.
 */
function Minimal({ s, c }) {
  return (
    <div style={{ position: 'absolute', inset: 0, padding: '54px 84px 48px', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20 }}>
        <Logo s={s} height={38} />
        <Kicker s={s} align="right" size={10}>{c.tier}</Kicker>
      </div>

      <div style={{
        flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
        justifyContent: 'center', alignItems: 'center', textAlign: 'center',
      }}>
        <Kicker s={s} align="center" size={10}>{c.subtitle}</Kicker>
        <div style={{ height: c.subtitle ? 24 : 0 }} />
        <Name s={s} size={76} align="center" color={s.ink}>{c.name}</Name>
        <div style={{ height: 24 }} />
        <div style={{ width: 120, height: 2, background: s.accent, borderRadius: 2 }} />
        <div style={{ height: 22 }} />
        <p style={{
          margin: 0, fontFamily: SANS, fontSize: 13, fontWeight: 700,
          letterSpacing: '0.2em', textTransform: 'uppercase', color: s.accentText,
        }}>
          {c.title}
        </p>
        <div style={{ height: 18 }} />
        <Body s={s} align="center" width={540} size={16.5}>{c.body}</Body>
      </div>

      <div>
        {c.footnote && (
          <p style={{ margin: '0 0 12px', fontFamily: SANS, fontSize: 10.5, color: s.faint, textAlign: 'center' }}>{c.footnote}</p>
        )}
        <Hair s={s} style={{ marginBottom: 14 }} />
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24 }}>
          <Signature s={s} name={c.signature} role={c.signatureRole} />
          <Credential s={s} serial={c.serial} align="center" />
          <Fact s={s} label="Awarded" value={c.date} align="right" />
        </div>
      </div>
    </div>
  )
}

const LAYOUTS = {
  rail: Rail,
  columns: Columns,
  crest: Crest,
  plaque: Plaque,
  ticket: Ticket,
  minimal: Minimal,
}
