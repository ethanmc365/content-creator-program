// A DEV-ONLY BENCH FOR COMPONENTS THAT NORMALLY SIT BEHIND THE LOGIN.
//
// Most of this app is signed-in, and Turnstile - correctly - will not let an
// automated browser past the "verify you are human" checkbox. That leaves the
// layout work on pages like Milestones unverifiable: the only way to see
// whether cards overlap on a phone was to log in by hand and look.
//
// So the components that are mostly pure functions of their props get rendered
// here against fixtures shaped like the real rows, at a pinned width, with the
// measurements printed underneath. It is the same idea as the contact sheet
// used to vet the aircraft photos: build the thing that can be screenshotted,
// screenshot it, then read the numbers off it.
//
// Mounted only under `import.meta.env.DEV`, so it never reaches production.
import { useEffect, useState } from 'react'
import MilestonePath from '../../components/network/MilestonePath'
import ChatBench from './ChatBench'
import Icon from '../../components/Icon'

// Shaped like milestone_progress() + milestone_standings() return, using the
// real ladder from the live database so the card heights measured here are the
// card heights a creator actually gets.
const MILESTONES = [
  {
    id: 'm1', title: 'Getting Started', description: null,
    reward: 'You are officially a Tryp.com Creator, welcome to the team!',
    reward_kind: 'role', reached: true, blocked: false,
    criteria: [
      { metric: 'videos', threshold: 3, value: 5, done: true },
      { metric: 'views', threshold: 3000, value: 9000, done: true },
    ],
  },
  {
    id: 'm2', title: 'Building Momentum', description: 'Consistency is everything',
    reward: '€10 Tryp.com voucher', reward_kind: 'voucher', reached: false, blocked: false,
    criteria: [
      { metric: 'referrals', threshold: 1, value: 0, done: false },
      { metric: 'videos', threshold: 10, value: 5, done: false },
      { metric: 'views', threshold: 10000, value: 9000, done: false },
    ],
  },
  {
    id: 'm3', title: 'On a roll', description: 'You have found your rhythm.',
    reward: '€30 Tryp.com Voucher', reward_kind: 'voucher', reached: false, blocked: false,
    criteria: [
      { metric: 'referrals', threshold: 2, value: 0, done: false },
      { metric: 'videos', threshold: 50, value: 5, done: false },
      { metric: 'views', threshold: 50000, value: 9000, done: false },
    ],
  },
  {
    id: 'm4', title: 'Senior Creator', description: null,
    reward: 'Tryp.com Senior Creator', reward_kind: 'role', reached: false, blocked: false,
    criteria: [{ metric: 'days', threshold: 183, value: 40, done: false }],
  },
]

const STANDINGS = [
  { id: 'p1', name: 'Sam Rivera', photo_url: null, reached: 1 },
  { id: 'p2', name: 'Alex Kerr', photo_url: null, reached: 1 },
  { id: 'p3', name: 'Jo Blake', photo_url: null, reached: 0 },
  { id: 'p4', name: 'Nils Berg', photo_url: null, reached: 0 },
  { id: 'p5', name: 'Rae Okafor', photo_url: null, reached: 2 },
]

// Every phone width worth caring about, plus the 22rem admin rail that made the
// wide serpentine draw itself into a 340px box.
const WIDTHS = [320, 375, 414, 352]

// Reads back what actually got laid out: the vertical gap between consecutive
// stop cards, and whether any card is taller than the slot it has to live in.
// An overlap is `cardBottom > nextCardTop`, which is the exact condition behind
// "cards overlap and are unreadable".
function measure(root) {
  const cards = [...root.querySelectorAll('[data-stop-card]')]
  const boxes = cards.map((c) => c.getBoundingClientRect())
  const rows = []
  for (let i = 0; i < boxes.length - 1; i += 1) {
    const overlap = Math.round(boxes[i].bottom - boxes[i + 1].top)
    rows.push({
      stop: i,
      height: Math.round(boxes[i].height),
      slot: Math.round(boxes[i + 1].top - boxes[i].top),
      overlap: overlap > 0 ? overlap : 0,
    })
  }
  return rows
}

function Bench({ width }) {
  const [root, setRoot] = useState(null)
  const [rows, setRows] = useState([])

  useEffect(() => {
    if (!root) return undefined
    // The cards animate in, so measure after they have settled.
    const t = setTimeout(() => setRows(measure(root)), 2500)
    return () => clearTimeout(t)
  }, [root])

  const worst = rows.reduce((m, r) => Math.max(m, r.overlap), 0)

  return (
    <div style={{ marginBottom: 40 }}>
      <p style={{ font: '600 13px system-ui', margin: '0 0 6px' }}>
        {width}px —{' '}
        <span
          data-verdict={worst > 0 ? 'overlap' : 'clear'}
          style={{ color: worst > 0 ? '#b91c1c' : '#15803d' }}
        >
          {worst > 0 ? `OVERLAP by ${worst}px` : 'no overlap'}
        </span>
      </p>
      <pre style={{ font: '11px ui-monospace', margin: '0 0 8px', color: '#555' }}>
        {rows.map((r) => `stop ${r.stop}: card ${r.height}px in ${r.slot}px slot${r.overlap ? ` -> ${r.overlap}px over` : ''}`).join('\n')}
      </pre>
      <div ref={setRoot} style={{ width, border: '1px dashed #ccc', padding: '0 16px' }}>
        <MilestonePath milestones={MILESTONES} standings={STANDINGS} />
      </div>
    </div>
  )
}

// Does the action pill overlap the chips or the footer on any message? That
// is the whole of "when I try click on seen ... it just shows up the reaction
// button and I can't see", expressed as a rectangle intersection.
function chatCollisions() {
  const rows = [...document.querySelectorAll('[data-msg-pill]')].map((pill, i) => {
    const row = pill.parentElement
    const hit = (sel) => {
      const el = row.querySelector(sel)
      if (!el) return null
      const a = pill.getBoundingClientRect()
      const b = el.getBoundingClientRect()
      const overlap = !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)
      return overlap ? `${Math.round(Math.min(a.right, b.right) - Math.max(a.left, b.left))}x${Math.round(Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))}` : null
    }
    const scroller = pill.closest('[data-chat-scroller]')
    const p = pill.getBoundingClientRect()
    const s = scroller?.getBoundingClientRect()
    // Only meaningful when the MESSAGE is in view. A message further down the
    // thread is outside the scroller because it has not been scrolled to, which
    // is not the bug - the bug was a pill being cut off by the scroller's edge
    // on a message you were actually looking at.
    const b = pill.parentElement.getBoundingClientRect()
    const inView = s ? (b.top >= s.top - 1 && b.bottom <= s.bottom + 1) : true
    return {
      i,
      chips: hit('[data-msg-chips]'),
      footer: hit('[data-msg-footer]'),
      // How much of the message itself the pill covers. Some overlap on a long
      // paragraph is fine and expected; swallowing a short bubble is not.
      bubble: hit('[data-msg-bubble]'),
      clipped: s && inView ? (p.top < s.top - 1 || p.bottom > s.bottom + 1) : false,
      offscreen: !inView,
    }
  })
  return rows
}

function ChatReport() {
  const [rows, setRows] = useState(null)
  useEffect(() => { const t = setTimeout(() => setRows(chatCollisions()), 1200); return () => clearTimeout(t) }, [])
  if (!rows) return <p style={{ font: '12px ui-monospace' }}>measuring…</p>
  const bad = rows.filter((r) => r.chips || r.footer || r.clipped)
  return (
    <div style={{ marginBottom: 12 }}>
      <p data-chat-verdict style={{ font: '600 13px system-ui', color: bad.length ? '#b91c1c' : '#15803d' }}>
        {bad.length ? `${bad.length} message(s) with the pill over something` : 'pill clear of chips, footer and scroller on every message'}
      </p>
      <pre style={{ font: '11px ui-monospace', color: '#555', margin: '4px 0 0' }}>
        {rows.map((r) => `msg ${r.i}: chips=${r.chips || 'clear'} footer=${r.footer || 'clear'} bubble=${r.bubble || 'clear'} clipped=${r.clipped}${r.offscreen ? ' (scrolled out)' : ''}`).join('\n')}
      </pre>
    </div>
  )
}

export default function Preview() {
  return (
    <div style={{ padding: 24, background: '#fff' }}>
      <h1 style={{ font: '700 18px system-ui', marginBottom: 8 }}>Worldwide icon</h1>
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-end', marginBottom: 8, color: '#E1633B' }}>
        {[24, 32, 48, 96, 160].map((px) => (
          <div key={px} style={{ textAlign: 'center' }}>
            <Icon name="globe" className="" strokeWidth={1.7} />
            <div style={{ width: px, height: px, marginBottom: 4 }}>
              <Icon name="globe" className="h-full w-full" strokeWidth={1.7} />
            </div>
            <span style={{ font: '10px ui-monospace', color: '#666' }}>{px}px</span>
          </div>
        ))}
      </div>

      <h1 style={{ font: '700 18px system-ui', marginBottom: 8 }}>Chat message bench</h1>
      <ChatReport />
      <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', marginBottom: 40 }}>
        <ChatBench width={375} />
        <ChatBench width={768} />
      </div>

      <h1 style={{ font: '700 18px system-ui', marginBottom: 16 }}>MilestonePath bench</h1>
      <div style={{ display: 'flex', gap: 32, alignItems: 'flex-start', flexWrap: 'wrap' }}>
        {WIDTHS.map((w) => <Bench key={w} width={w} />)}
      </div>
    </div>
  )
}
