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
import LiveChallengeCard from '../../components/LiveChallengeCard'
import LiveNowRow from '../../components/network/LiveNowRow'
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

// THE LIVE CHALLENGE CARD, AGAINST A CHALLENGE THAT DOES NOT EXIST YET.
//
// The card's whole job is the state nobody can produce on demand: a brief that
// is running, with prizes set, and either nobody on the board or one or two
// people on it. `CHALLENGE_FULL` is the UK's real archived brief with live
// dates; `CHALLENGE_EMPTY` is the Spanish one, which genuinely has no prize
// structure and no entrants, and is the case Ethan asked to see ("so it's
// always showing up, even for the current Spanish challenge, there are no
// creators, just so I can see how it looks").
//
// `end_date` is relative so the countdown is never zero on this bench. The
// clock is read once, at module load, which is fine here and would not be in
// the app - see the note on LiveNowRow's `now` prop.
const BENCH_NOW = Date.now()
const IN_NINE_DAYS = new Date(BENCH_NOW + 9.6 * 86400000).toISOString()
const CHALLENGE_FULL = {
  id: 'bench-full',
  title: 'Test: two groups, one brief',
  description: 'A rehearsal challenge for the grouped leaderboard build. Safe to delete.',
  start_date: '2026-08-31T00:00:00.000Z',
  end_date: IN_NINE_DAYS,
  prize_structure: [
    { place: '1st', prize: '£105 cash' },
    { place: '2nd', prize: '£55 cash' },
    { place: '3rd', prize: '£30 Tryp.com voucher' },
  ],
}
const CHALLENGE_EMPTY = {
  id: 'bench-empty',
  title: 'Descubre España con Tryp.com',
  description: 'Ensena tu rincon favorito de Espana y por que hay que visitarlo.',
  start_date: '2026-08-07T00:00:00.000Z',
  end_date: IN_NINE_DAYS,
  prize_structure: [],
}
const BENCH_LEADERS = [
  { creator_id: 'l1', name: 'Olive Hart', photo_url: null, score: 9400, views: 9400 },
  { creator_id: 'l2', name: 'Jessie Lane', photo_url: null, score: 8300, views: 8300 },
]

// THE GLOBAL BRIEF LAUNCHING NEXT WEEK, AT ITS REAL SHAPE.
//
// It is a POINTS challenge, and that is the case this bench did not have: the
// two fixtures above are both view-scored, so the card's score column was only
// ever exercised on the branch where the number it prints is the number it
// sorts by. On a points board those are two different figures - the row is
// ordered by points and the reach is the second line - and nothing here would
// have caught it printing one and ordering by the other.
//
// Three FULL places, because the empty-place case is already covered by
// CHALLENGE_EMPTY and what nobody had looked at is a board that is actually
// full: three faces, three prizes, three scores and three view counts in a
// column that has to stay aligned.
const CHALLENGE_GLOBAL_POINTS = {
  id: 'bench-global-points',
  title: 'The Tryp.com Worldwide Challenge',
  description: 'One brief, every market. Post your best travel video, collect points for every video, every view milestone and every platform you post on.',
  start_date: '2026-09-08T00:00:00.000Z',
  end_date: IN_NINE_DAYS,
  scoring: 'points',
  prize_structure: [
    { place: '1st', prize: '€500 cash' },
    { place: '2nd', prize: '€250 cash' },
    { place: '3rd', prize: '€100 cash' },
  ],
}
const BENCH_LEADERS_POINTS = [
  { creator_id: 'g1', name: 'Lucia Fernandez', photo_url: null, score: 18, views: 28736 },
  { creator_id: 'g2', name: 'Mateo Serrano', photo_url: null, score: 12, views: 15081 },
  { creator_id: 'g3', name: 'Carmen Ortega', photo_url: null, score: 7, views: 8720 },
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

// The action bar now takes its own row rather than floating, so an overlap is
// a regression rather than a design trade-off. Three things are checked:
//   * does the bar intersect the bubble, the chips or the footer? (it must not)
//   * how far is it, horizontally, from the message it belongs to? That is the
//     "it's floating away over on the side away from the message" report, and
//     it is a number: the gap between the bar's near edge and the bubble's.
//   * is it clipped by the scroller on a message that is actually in view?
function chatCollisions() {
  return [...document.querySelectorAll('[data-msg-bar]')].map((bar, i) => {
    const row = bar.parentElement
    const a = bar.getBoundingClientRect()
    const hit = (sel) => {
      const el = row.querySelector(sel)
      if (!el) return null
      const b = el.getBoundingClientRect()
      const over = !(a.right <= b.left || a.left >= b.right || a.bottom <= b.top || a.top >= b.bottom)
      return over ? `${Math.round(Math.min(a.right, b.right) - Math.max(a.left, b.left))}x${Math.round(Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top))}` : null
    }
    // The visible control inside the animated row, not the full-width grid.
    const pill = bar.querySelector('.rounded-full.border') || bar
    const p = pill.getBoundingClientRect()
    const bub = row.querySelector('[data-msg-bubble]')?.getBoundingClientRect()
    // Positive = the bar starts beyond where the message ends on that side.
    const drift = bub
      ? Math.round(Math.max(0, Math.max(bub.left - p.right, p.left - bub.right)))
      : null
    const scroller = bar.closest('[data-chat-scroller]')
    const s = scroller?.getBoundingClientRect()
    const inView = s && bub ? (bub.top >= s.top - 1 && bub.bottom <= s.bottom + 1) : true
    return {
      i,
      bubble: hit('[data-msg-bubble]'),
      chips: hit('[data-msg-chips]'),
      footer: hit('[data-msg-footer]'),
      drift,
      clipped: s && inView ? (p.top < s.top - 1 || p.bottom > s.bottom + 1) : false,
      offscreen: !inView,
    }
  })
}

function ChatReport() {
  const [rows, setRows] = useState(null)
  useEffect(() => { const t = setTimeout(() => setRows(chatCollisions()), 1400); return () => clearTimeout(t) }, [])
  if (!rows) return <p style={{ font: '12px ui-monospace' }}>measuring…</p>
  // 24px of drift is a hair of rounding; anything more is the bar sitting away
  // from its own message.
  const bad = rows.filter((r) => r.bubble || r.chips || r.footer || r.clipped || (r.drift ?? 0) > 24)
  return (
    <div style={{ marginBottom: 12 }}>
      <p data-chat-verdict style={{ font: '600 13px system-ui', color: bad.length ? '#b91c1c' : '#15803d' }}>
        {bad.length
          ? `${bad.length} message(s) with the bar overlapping or adrift`
          : 'bar clear of bubble, chips, footer and scroller on every message, and beside its own message'}
      </p>
      <pre style={{ font: '11px ui-monospace', color: '#555', margin: '4px 0 0' }}>
        {rows.map((r) => `msg ${r.i}: bubble=${r.bubble || 'clear'} chips=${r.chips || 'clear'} footer=${r.footer || 'clear'} drift=${r.drift}px clipped=${r.clipped}${r.offscreen ? ' (scrolled out)' : ''}`).join('\n')}
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

      <h1 style={{ font: '700 18px system-ui', marginBottom: 8 }}>Live challenge card</h1>
      <p style={{ font: '12px ui-monospace', color: '#666', margin: '0 0 12px' }}>
        The leaderboard column is `lg:` - resize the WINDOW, not this box, to see the two layouts.
      </p>
      <div style={{ display: 'grid', gap: 28, marginBottom: 40 }}>
        <LiveChallengeCard challenge={CHALLENGE_FULL} entries={4} leaders={BENCH_LEADERS} />
        <LiveChallengeCard challenge={CHALLENGE_EMPTY} entries={0} leaders={[]} />
        <LiveChallengeCard challenge={CHALLENGE_FULL} global entries={12} leaders={BENCH_LEADERS} />
        {/* The one launching next week: global, points-scored, board full. */}
        <LiveChallengeCard challenge={CHALLENGE_GLOBAL_POINTS} global entries={37} leaders={BENCH_LEADERS_POINTS} />
        <div style={{ maxWidth: 340 }}>
          {/* `now` from a module constant, not `Date.now()` in the render: the
              purity lint catches the second one, and it is right to. */}
          <LiveNowRow challenge={CHALLENGE_FULL} market={{ name: 'Spain', country_codes: ['ES'] }} now={BENCH_NOW} />
        </div>
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
