// EVERY CERTIFICATE LAYOUT, ON ONE SHEET, WITHOUT LOGGING IN.
//
// See Preview.jsx for why this bench exists at all. This one earns its place
// for a reason the others do not: a certificate is the only thing in this
// product whose ENTIRE purpose is how it looks, and it lives three clicks
// inside an admin page behind a login and a Turnstile. Every design claim made
// about it in the last three sessions was made from reading the code, and every
// one of them was wrong in some way that a single screenshot would have caught.
//
// It renders the real `CertificateCard` - not a mock of it - across:
//
//   * all six LAYOUTS, at one accent, so the shapes can be compared,
//   * all ten ACCENTS on one layout, so the palette can be judged as a set,
//   * all five PAPERS, including the dark one,
//   * the three cases that break a fixed-size card: a very long name, a very
//     long title, and a design with nothing optional filled in.
//
// Mounted only under `import.meta.env.DEV`.
import CertificateCard, { CERT_W, CERT_H } from '../../components/certificate/CertificateCard'
import { ACCENTS, LAYOUTS, PAPERS } from '../../lib/certificates'

const FACTS = {
  name: 'Roxanna Travels',
  date: '2026-09-30T12:00:00.000Z',
  serial: 'TRYP-2026-K4M9PX',
  challenge: 'Hidden Gems of Your City',
  market: 'UK & Ireland',
  place: 1,
  views: 124500,
}

const BASE = {
  tier: 'achievement',
  title: 'Certificate of Achievement',
  subtitle: 'Tryp.com Creator Community',
  body: 'for finishing {place} in {challenge}\n{market}',
  footnote: 'Issued by the Tryp.com Content Creator Community.',
  signature: 'Ethan Mc Candless',
  signature_role: 'Creator Community',
  accent: '#D94407',
  layout: 'horizon',
  paper: 'paper',
}

/** One card, drawn at true size and scaled to fit the sheet. */
function Card({ design, facts = FACTS, label, scale = 0.46 }) {
  return (
    <div>
      <div style={{ font: '600 11px ui-monospace', color: '#666', marginBottom: 6 }}>{label}</div>
      <div style={{
        width: CERT_W * scale, height: CERT_H * scale, overflow: 'hidden',
        border: '1px solid #eee', borderRadius: 10,
      }}>
        <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <CertificateCard design={design} facts={facts} />
        </div>
      </div>
    </div>
  )
}

function Row({ title, note, children }) {
  return (
    <>
      <h1 style={{ font: '700 18px system-ui', margin: '32px 0 4px' }}>{title}</h1>
      {note && <p style={{ font: '12px ui-monospace', color: '#666', margin: '0 0 12px' }}>{note}</p>}
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start', flexWrap: 'wrap' }}>{children}</div>
    </>
  )
}

export default function CertificateBench() {
  return (
    <div>
      <Row title="Layouts" note="All six, one accent, one paper. What is being compared here is SHAPE.">
        {LAYOUTS.map((l) => (
          <Card key={l.key} label={l.label} design={{ ...BASE, layout: l.key }} />
        ))}
      </Row>

      <Row title="Accents" note="Ten, on the Horizon layout. Judged as a set: no two should read as the same decision.">
        {ACCENTS.map((a) => (
          <Card key={a.key} label={a.label} scale={0.3} design={{ ...BASE, accent: a.hex }} />
        ))}
      </Row>

      <Row title="Papers" note="The ground, with the accent held constant. The Tryp gradient is the one that flips the type.">
        {PAPERS.map((p) => (
          <Card key={p.key} label={p.label} scale={0.36} design={{ ...BASE, layout: 'route', paper: p.key }} />
        ))}
      </Row>

      <Row
        title="The Tryp gradient, on every layout"
        note="White type on the brand gradient: the case most likely to leave something orange-on-orange."
      >
        {LAYOUTS.map((l) => (
          <Card key={l.key} label={l.label} scale={0.3} design={{ ...BASE, layout: l.key, paper: 'sunset' }} />
        ))}
      </Row>

      <Row
        title="The cases that break a fixed-size card"
        note="A name that is 33 characters is real - Leonardo is in the live database. Nothing here may overflow 1000x707."
      >
        <Card
          label="long name"
          design={{ ...BASE, layout: 'horizon' }}
          facts={{ ...FACTS, name: 'Leonardo Alfonso Guerrero Urrutia' }}
        />
        <Card
          label="long name, minimal"
          design={{ ...BASE, layout: 'minimal' }}
          facts={{ ...FACTS, name: 'Leonardo Alfonso Guerrero Urrutia' }}
        />
        <Card
          label="long title + 4-line body"
          design={{
            ...BASE,
            layout: 'banner',
            title: 'Certificate of Outstanding Creative Achievement',
            body: 'for finishing {place} in {challenge}\nin {market}\nwith {views} views\nacross every platform',
          }}
        />
        <Card
          label="nothing optional"
          design={{ ...BASE, layout: 'boarding', subtitle: '', footnote: '', signature: '', signature_role: '' }}
          facts={{ name: 'Mirsu' }}
        />
        <Card
          label="body all dropped"
          design={{ ...BASE, layout: 'postcard', body: 'for winning {challenge}' }}
          facts={{ name: 'Mirsu', date: FACTS.date, serial: FACTS.serial }}
        />
      </Row>
    </div>
  )
}
