import { fillTemplate, formatAwardDate, tierOf } from '../../lib/certificates'

// A CERTIFICATE, AS A PICTURE.
//
// Fixed 1000x707 and never responsive, for the reason `lib/domSnapshot` exists:
// this component is PHOTOGRAPHED. A picture has no viewport to be responsive
// to, and a layout that reflows would produce a different certificate on a
// phone than on a laptop - two people with the same award holding different
// objects. The page scales it with a CSS transform instead, so what is on
// screen and what is downloaded are the same pixels.
//
// 1000x707 IS ROOT-2, which is A4 landscape. That is not an aesthetic choice:
// it means the same component is the PDF page in the portfolio export with no
// second layout, and it prints without a border of white down one side.
//
// EVERY DESIGN IS THIS COMPONENT. There is no per-tier variant and there will
// not be one: an admin builds a certificate by choosing words, an accent, an
// emblem and a pattern, and if a tier needed its own JSX then the builder would
// be lying about what it can make. `components/Certificate.jsx` was the earlier,
// hard-coded version of this - one certificate, for a challenge win, with its
// words in the markup. It is still rendered by the rewards page's old modal;
// everything new comes through here.
// WHERE /verify ACTUALLY LIVES. Not tryp.com - that is the main website and has
// no verify page. This app is the canonical host (see lib/canonicalHost), and
// printing the wrong one is why the line on the certificate did nothing.
const VERIFY_HOST = 'trypcreators.vercel.app'

export const CERT_W = 1000
export const CERT_H = 707

export default function CertificateCard({ design, facts = {}, cardRef, className }) {
  const d = design || {}
  const tier = tierOf(d.tier)
  // THE ACCENT DEFAULTS TO TRYP ORANGE FOR EVERY TIER (20 Sep 2026).
  //
  // Each tier used to carry its own colour - orange, gold, teal, slate - on the
  // theory that the ladder should be readable across a feed without reading the
  // words. Ethan, looking at the result: "I don't like the different colors...
  // the tryp.com orange for me, the nice gradient." He is right, and the theory
  // was wrong for this object: a certificate is the creator showing off TRYP,
  // and a teal one does not look like it came from the same company as an
  // orange one. It looks like a template pack. The tier is still named on the
  // face, which is where a reader actually learns it.
  //
  // `d.accent` still overrides, because the accent picker in the studio is
  // per-design and Ethan likes it. Only the DEFAULT changed.
  const accent = d.accent || tier.accent
  const body = fillTemplate(d.body, facts)
  const title = fillTemplate(d.title, facts) || 'Certificate'
  const subtitle = fillTemplate(d.subtitle, facts)
  const footnote = fillTemplate(d.footnote, facts)
  const date = facts.date ? formatAwardDate(facts.date) : ''

  return (
    <div
      ref={cardRef}
      className={className}
      style={{
        width: CERT_W, height: CERT_H,
        fontFamily: 'Poppins, system-ui, sans-serif',
        position: 'relative', overflow: 'hidden', background: '#ffffff',
      }}
    >
      <Ground pattern={d.pattern} accent={accent} />

      {/* A BAND AT THE TOP AS WELL AS THE BOTTOM, so the page is held between
          two brand edges instead of sitting on one. */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, height: 10,
        background: `linear-gradient(90deg, ${accent} 0%, ${accent}99 50%, ${accent} 100%)`,
      }} />

      {/* Two rules rather than a border, so the corners stay square against the
          wash behind them. */}
      <div style={{ position: 'absolute', inset: 30, borderRadius: 18, border: `1.5px solid ${accent}33` }} />
      <div style={{ position: 'absolute', inset: 41, borderRadius: 12, border: `1px solid ${accent}1a` }} />

      <div style={{
        position: 'relative', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '74px 92px 0', textAlign: 'center',
      }}>
        {/* THE REAL LOGO, which the certificate did not carry at all. Ethan:
            "use the actual tryp.com logo somewhere". Fixed height and natural
            width - the asset is a 1200x630 card and squaring it crops it, which
            is the same mistake the portfolio cover was making. */}
        <img
          src="/brand/tryp-logo.png"
          alt="Tryp.com"
          crossOrigin="anonymous"
          style={{ height: 46, width: 'auto', borderRadius: 9, objectFit: 'contain' }}
        />

        {subtitle && (
          /* 0.42em of tracking on 13px is five pixels between every letter -
             "the fonts are a bit weird". 0.2em still reads as a kicker. */
          <p style={{ marginTop: 20, fontSize: 13, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: accent, margin: '20px 0 0' }}>
            {subtitle}
          </p>
        )}

        {/* THE EMBLEM CIRCLE IS GONE. Ethan: "I don't like those random icons",
            and separately "no need for the sparkle". A 70px orange disc with a
            trophy in it directly above the title was the single thing that made
            this read as a template rather than as something Tryp.com issued.
            `d.emblem` is still stored and still pickable, it is simply not the
            centrepiece any more - the logo is. */}

        <p style={{ marginTop: 22, fontSize: 50, fontWeight: 800, lineHeight: 1.04, letterSpacing: '-0.025em', color: '#1c1c1c' }}>
          {title}
        </p>

        <div style={{ margin: '20px 0 0', height: 2, width: 72, background: accent, borderRadius: 2 }} />

        {facts.name && (
          <>
            <p style={{ marginTop: 22, fontSize: 15, fontWeight: 500, color: '#6b6b6b', margin: '22px 0 0' }}>
              This certifies that
            </p>
            {/* "I like the name, but everything should be more centered, should
                be bigger." The name is the thing anybody screenshots. */}
            <p style={{ marginTop: 6, fontSize: 52, fontWeight: 800, lineHeight: 1.08, letterSpacing: '-0.03em', color: accent }}>
              {facts.name}
            </p>
          </>
        )}

        {/* A BODY THAT RENDERED TO NOTHING IS NOT AN EMPTY BOX. `fillTemplate`
            drops any line whose detail is missing and deliberately does not
            invent a replacement. */}
        <p style={{
          marginTop: 16, maxWidth: 720, fontSize: 20, fontWeight: 500, lineHeight: 1.55,
          color: '#3a3a3a', whiteSpace: 'pre-line',
        }}>
          {body || 'for taking part in the Tryp.com Content Creator Community'}
        </p>

        <div style={{
          marginTop: 'auto', marginBottom: 54, display: 'flex', alignItems: 'flex-end',
          justifyContent: 'space-between', width: '100%', gap: 28,
        }}>
          <Signed name={d.signature} role={d.signature_role} accent={accent} />
          <div style={{ textAlign: 'center', flex: 1.2 }}>
            {footnote && (
              <p style={{ fontSize: 12, fontWeight: 500, color: '#9a9a9a', margin: '0 0 8px' }}>{footnote}</p>
            )}
            {/* THE CREDENTIAL ID, LABELLED, AND AT AN ADDRESS THAT EXISTS.
                Ethan: "I don't get the tryp.com 2026 code, I don't think that's
                necessary" and "check it out at tryp.com/verify - what does that
                mean? It doesn't seem to be working."

                Both fair, and the second was a REAL BUG. A serial reads as
                noise when nothing says what it is, so it now says "Certificate
                ID". And the address printed was `tryp.com/verify`, which is the
                main Tryp.com website and has no such page - this app lives at
                `trypcreators.vercel.app`, and that is where /verify resolves.
                So anybody who did type it in got nothing, exactly as reported.

                PLAIN TEXT, NOT A LINK: this node is photographed, and an anchor
                in a PNG is a rectangle that does nothing. */}
            {facts.serial && (
              <>
                <p style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: '#b5b5b5', margin: 0 }}>
                  Certificate ID
                </p>
                <p style={{ marginTop: 3, fontSize: 13, fontWeight: 700, letterSpacing: '0.1em', color: '#6b6b6b', fontVariantNumeric: 'tabular-nums' }}>
                  {facts.serial}
                </p>
                <p style={{ marginTop: 3, fontSize: 10, letterSpacing: '0.02em', color: '#b5b5b5' }}>
                  Verify at {VERIFY_HOST}/verify
                </p>
              </>
            )}
          </div>
          <Dated date={date} accent={accent} />
        </div>
      </div>

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 14,
        background: `linear-gradient(90deg, ${accent} 0%, ${accent}99 50%, ${accent} 100%)`,
      }} />
    </div>
  )
}

// THE THREE GROUNDS, and they are three because an admin needs certificates
// that are TELLABLE APART ACROSS A FEED without reading them. Anything richer
// than this starts competing with the words.
function Ground({ pattern, accent }) {
  if (pattern === 'plain') {
    return <div style={{ position: 'absolute', inset: 0, background: '#fff' }} />
  }
  // THE 'rays' GROUND IS GONE. Ethan: "no need for the sparkle". It was a
  // twenty-stop conic gradient behind the text - the thing that made the whole
  // object read as "AI generated and fake", which is the phrase he used. A
  // design still stored as `rays` falls through to the wash below rather than
  // breaking, so nothing an admin already built stops rendering.
  // "The nice gradient", warmed up. The old one was 5% opacity at both corners,
  // which on a screen is indistinguishable from plain white.
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: `linear-gradient(135deg, ${accent}24 0%, #ffffff 42%, #ffffff 62%, ${accent}1f 100%)`,
    }} />
  )
}

function Signed({ name, role, accent }) {
  if (!name) return <div style={{ flex: 1 }} />
  return (
    <div style={{ flex: 1, textAlign: 'left' }}>
      <div style={{ height: 1, width: 150, background: `${accent}40`, marginBottom: 7 }} />
      <p style={{ fontSize: 14, fontWeight: 700, color: '#1c1c1c', margin: 0 }}>{name}</p>
      {role && <p style={{ fontSize: 11, color: '#9a9a9a', margin: 0 }}>{role}</p>}
    </div>
  )
}

function Dated({ date, accent }) {
  if (!date) return <div style={{ flex: 1 }} />
  return (
    <div style={{ flex: 1, textAlign: 'right' }}>
      <div style={{ height: 1, width: 150, background: `${accent}40`, marginBottom: 7, marginLeft: 'auto' }} />
      <p style={{ fontSize: 14, fontWeight: 700, color: '#1c1c1c', margin: 0 }}>{date}</p>
      <p style={{ fontSize: 11, color: '#9a9a9a', margin: 0 }}>Awarded</p>
    </div>
  )
}
