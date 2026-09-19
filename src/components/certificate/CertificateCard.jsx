import Icon from '../Icon'
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
export const CERT_W = 1000
export const CERT_H = 707

export default function CertificateCard({ design, facts = {}, cardRef, className }) {
  const d = design || {}
  const tier = tierOf(d.tier)
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

      {/* Two rules rather than a border, so the corners stay square against the
          wash behind them. Same construction as the original Certificate. */}
      <div style={{ position: 'absolute', inset: 26, borderRadius: 20, border: `2px solid ${accent}40` }} />
      <div style={{ position: 'absolute', inset: 38, borderRadius: 14, border: `1px solid ${accent}20` }} />

      <div style={{
        position: 'relative', height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '0 96px', textAlign: 'center',
      }}>
        {subtitle && (
          <p style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.42em', textTransform: 'uppercase', color: accent, margin: 0 }}>
            {subtitle}
          </p>
        )}

        <div style={{
          marginTop: 26, width: 70, height: 70, borderRadius: '50%', background: accent,
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {/* A class rather than a style: `Icon` takes className only, and
              lib/domSnapshot writes computed styles onto its clone, so a
              Tailwind size resolves correctly in the photograph. */}
          <Icon name={d.emblem || tier.emblem} className="h-[34px] w-[34px]" strokeWidth={1.6} />
        </div>

        <p style={{ marginTop: 24, fontSize: 42, fontWeight: 800, lineHeight: 1.05, letterSpacing: '-0.02em', color: '#1c1c1c' }}>
          {title}
        </p>

        <div style={{ margin: '22px 0', height: 1, width: 96, background: `${accent}55` }} />

        {facts.name && (
          <>
            <p style={{ fontSize: 15, fontWeight: 500, color: '#6b6b6b', margin: 0 }}>This certifies that</p>
            <p style={{ marginTop: 8, fontSize: 40, fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', color: accent }}>
              {facts.name}
            </p>
          </>
        )}

        {/* A BODY THAT RENDERED TO NOTHING IS NOT AN EMPTY BOX. `fillTemplate`
            drops any line whose detail is missing and deliberately does not
            invent a replacement - that decision belongs here, where somebody
            can see what it looks like. */}
        <p style={{
          marginTop: 18, maxWidth: 700, fontSize: 19, fontWeight: 600, lineHeight: 1.55,
          color: '#1c1c1c', whiteSpace: 'pre-line',
        }}>
          {body || 'for taking part in the Tryp.com Creator Community'}
        </p>

        <div style={{
          marginTop: 'auto', marginBottom: 58, display: 'flex', alignItems: 'flex-end',
          justifyContent: 'space-between', width: '100%', gap: 24,
        }}>
          <Signed name={d.signature} role={d.signature_role} accent={accent} />
          <div style={{ textAlign: 'center', flex: 1 }}>
            {footnote && (
              <p style={{ fontSize: 12, fontWeight: 500, color: '#9a9a9a', margin: 0 }}>{footnote}</p>
            )}
            {/* THE CREDENTIAL ID, AND WHERE TO CHECK IT. A picture nobody can
                check is a JPEG; a picture with an id, and an address that
                resolves it, is a credential. Both are printed small and in the
                corner because they are for the one person in a hundred who
                looks - but that one person is the entire reason the certificate
                is worth anything to the creator. See pages/VerifyCertificate.

                PLAIN TEXT, NOT A LINK. This node is photographed; an anchor in
                a PNG is a rectangle that does nothing, and one in a PDF that
                the viewer may or may not linkify is worse than a legible
                address somebody can type. */}
            {facts.serial && (
              <p style={{ marginTop: 4, fontSize: 11, letterSpacing: '0.16em', color: '#b5b5b5', fontVariantNumeric: 'tabular-nums' }}>
                {facts.serial}
              </p>
            )}
            {facts.serial && (
              <p style={{ marginTop: 2, fontSize: 9.5, letterSpacing: '0.06em', color: '#c9c9c9' }}>
                Check it at tryp.com/verify
              </p>
            )}
          </div>
          <Dated date={date} accent={accent} />
        </div>
      </div>

      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: 8,
        background: `linear-gradient(90deg, ${accent}, ${accent}80)`,
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
  if (pattern === 'rays') {
    return (
      <div style={{ position: 'absolute', inset: 0, background: '#fff', overflow: 'hidden' }}>
        <div style={{
          position: 'absolute', top: '-60%', left: '50%', width: 1400, height: 1400,
          transform: 'translateX(-50%)',
          background: `conic-gradient(from 0deg, ${accent}0f 0deg, transparent 18deg, ${accent}0f 36deg, transparent 54deg, ${accent}0f 72deg, transparent 90deg, ${accent}0f 108deg, transparent 126deg, ${accent}0f 144deg, transparent 162deg, ${accent}0f 180deg, transparent 198deg, ${accent}0f 216deg, transparent 234deg, ${accent}0f 252deg, transparent 270deg, ${accent}0f 288deg, transparent 306deg, ${accent}0f 324deg, transparent 342deg, ${accent}0f 360deg)`,
        }} />
      </div>
    )
  }
  return (
    <div style={{
      position: 'absolute', inset: 0,
      background: `linear-gradient(135deg, ${accent}0d 0%, #ffffff 45%, ${accent}12 100%)`,
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
