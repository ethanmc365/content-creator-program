import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Icon from '../Icon'
import { Modal } from '../ui'
import { notice } from '../../lib/confirm'
import { cx } from '../../lib/utils'

// The introductions room, with the hard part done for you.
//
// "Say hello" is the worst prompt in community software. It asks for a blank
// page from the person with the least context in the room, and what comes back
// is "hey everyone excited to be here", which nobody can reply to. Specific
// questions produce a post with things in it somebody can grab: a city, a
// niche, a trip, an ask, and one human detail that has nothing to do with work.
//
// The chips matter more than the free text. A creator who would never write a
// paragraph will tap six things, and taps produce a better intro than most
// paragraphs do. But a fixed list of chips is also somebody else's idea of what
// you make, so every chip group takes YOUR OWN as well - the list is a
// shortcut, not a menu you are limited to.
//
// A CARD IN THE MIDDLE, NOT A PANEL AT THE TOP.
//
// This used to expand in place at the top of the room, which pushed the
// conversation down until it was a squashed strip along the bottom of the
// screen - "the chat is squished at the bottom whenever you're doing this". A
// form with eight questions in it is a task, and a task belongs in a card over
// the room rather than inside its layout. The invitation stays a one-line bar;
// only the form moved.

const MAKES = [
  'City guides', 'Budget travel', 'Luxury stays', 'Food', 'Hotels', 'Solo travel',
  'Family travel', 'Adventure', 'Road trips', 'Hidden gems', 'Deals', 'Vlogs',
]

const WANTS = [
  'Collabs', 'Feedback on my videos', 'Meeting people near me',
  'Getting better at hooks', 'Paid briefs', 'Travel buddies',
]

// onToggle takes the option, NOT the next array. Computing the next array here
// would close over `value` from the render that drew the chip, so two toggles
// inside one React batch both start from the same stale list and the second
// silently discards the first. The parent applies it with a functional update
// instead, which cannot go stale.
function Chips({ options, value, onToggle, max }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o)
        return (
          <button
            key={o}
            type="button"
            onClick={() => onToggle(o)}
            aria-pressed={on}
            disabled={!on && value.length >= max}
            className={cx(
              'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
              on
                ? 'border-brand bg-brand text-white'
                : 'border-gray-200 bg-white text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:border-gray-200 disabled:hover:text-smoke',
            )}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}

// "Or add your own." A chip list is a shortcut for the common answers, and the
// moment it is the ONLY way to answer it stops being a shortcut and starts
// being a constraint - somebody who makes sailing content should not have to
// call it "Adventure" because that is the nearest chip we thought of.
function CustomChip({ onAdd, disabled }) {
  const [text, setText] = useState('')
  const add = () => {
    const v = text.trim()
    if (!v) return
    onAdd(v)
    setText('')
  }
  return (
    <div className="mt-2.5 flex items-center gap-2">
      <input
        className="input !py-2 text-base sm:text-sm"
        value={text}
        disabled={disabled}
        placeholder="Add your own…"
        onChange={(e) => setText(e.target.value)}
        // Enter adds the chip. This form has no submit button of its own and
        // sits inside no <form>, so Enter would otherwise do nothing at all.
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        aria-label="Add your own option"
      />
      <button type="button" onClick={add} disabled={disabled || !text.trim()}
        className="btn-secondary shrink-0 !py-2 !text-sm disabled:opacity-40">
        Add
      </button>
    </div>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <p className="text-sm font-semibold">{label}</p>
      {hint && <p className="mb-2 mt-0.5 text-xs text-smoke">{hint}</p>}
      {!hint && <div className="mb-2" />}
      {children}
    </div>
  )
}

const MAKES_MAX = 5
const WANTS_MAX = 3

export default function IntroPrompt({ community, channel, onPosted }) {
  const { profile, user } = useAuth()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [more, setMore] = useState(false)
  // Options the creator typed themselves, kept beside the built-in lists so
  // they render as chips like everything else and can be un-picked again.
  const [ownMakes, setOwnMakes] = useState([])
  const [ownWants, setOwnWants] = useState([])
  const [form, setForm] = useState({
    where: [profile?.city, profile?.country].filter(Boolean).join(', '),
    makes: [],
    next: '',
    ask: '',
    fact: '',
    again: '',
    kit: '',
    wants: [],
  })
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  const toggle = (key, option, max) =>
    setForm((f) => {
      const list = f[key]
      if (list.includes(option)) return { ...f, [key]: list.filter((v) => v !== option) }
      if (list.length >= max) return f
      return { ...f, [key]: [...list, option] }
    })

  // Adding your own option selects it too. Typing something and then having to
  // tap it as well is a step that exists only because of how this is built.
  const addOwn = (key, setOwn, option, max) => {
    const v = option.trim()
    if (!v) return
    setOwn((cur) => (cur.some((o) => o.toLowerCase() === v.toLowerCase()) ? cur : [...cur, v]))
    setForm((f) => {
      const list = f[key]
      if (list.some((o) => o.toLowerCase() === v.toLowerCase()) || list.length >= max) return f
      return { ...f, [key]: [...list, v] }
    })
  }

  // Built as the creator types so what they are about to post is never a
  // surprise. Every line is optional and an empty one is dropped rather than
  // posted as a label with nothing after it.
  const message = useMemo(() => {
    const lines = []
    const first = profile?.name?.split(' ')[0] || 'Hi'
    lines.push(`👋 ${first} here${form.where ? `, based in ${form.where}` : ''}.`)
    if (form.makes.length) lines.push(`I make: ${form.makes.join(', ')}.`)
    if (form.next.trim()) lines.push(`Next trip: ${form.next.trim()}.`)
    if (form.ask.trim()) lines.push(`Ask me about: ${form.ask.trim()}.`)
    if (form.fact.trim()) lines.push(`Fun fact: ${form.fact.trim()}.`)
    if (form.again.trim()) lines.push(`I would go back to ${form.again.trim()} tomorrow.`)
    if (form.kit.trim()) lines.push(`I shoot on: ${form.kit.trim()}.`)
    if (form.wants.length) lines.push(`Hoping to find: ${form.wants.join(', ')}.`)
    return lines.join('\n')
  }, [form, profile?.name])

  const enough = form.where.trim() || form.makes.length > 0

  async function post() {
    if (!enough || busy) return
    setBusy(true)
    const key = community.kind === 'network' ? channel.key : `${community.slug}:${channel.key}`
    const { error } = await supabase.from('messages').insert({
      channel: key,
      channel_id: channel.id,
      community_id: community.id,
      sender_id: user.id,
      body: message,
    })
    setBusy(false)
    if (error) { notice(`Could not post: ${error.message}`); return }
    setOpen(false)
    onPosted?.()
  }

  return (
    <>
      <div className="border-b border-gray-100 bg-brand-tint/25 px-4 py-3 sm:px-5">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex w-full items-center gap-3 text-left"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white">
            <Icon name="smile" className="h-4 w-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Introduce yourself</span>
            <span className="block text-xs text-smoke">
              A few quick questions. We will write the post for you.
            </span>
          </span>
          <span className="btn-primary shrink-0 !px-4 !py-2 !text-xs">Start</span>
        </button>
      </div>

      <Modal open={open} onClose={() => setOpen(false)} title="Introduce yourself">
        <p className="-mt-3 mb-5 text-sm text-smoke">
          Skip anything you would rather not say. Only the last box gets posted.
        </p>

        <div className="space-y-5">
          <Field label="Where are you based?">
            <input className="input text-base sm:text-sm" value={form.where}
              placeholder="Manchester, UK"
              onChange={(e) => set({ where: e.target.value })} />
          </Field>

          <Field label="What do you make?" hint={`Pick up to ${MAKES_MAX}, or add your own.`}>
            <Chips
              options={[...MAKES, ...ownMakes]}
              value={form.makes}
              onToggle={(o) => toggle('makes', o, MAKES_MAX)}
              max={MAKES_MAX}
            />
            <CustomChip
              disabled={form.makes.length >= MAKES_MAX}
              onAdd={(v) => addOwn('makes', setOwnMakes, v, MAKES_MAX)}
            />
          </Field>

          <Field label="Where are you headed next?">
            <input className="input text-base sm:text-sm" value={form.next}
              placeholder="Lisbon in March"
              onChange={(e) => set({ next: e.target.value })} />
          </Field>

          <Field label="One thing people should ask you about">
            <input className="input text-base sm:text-sm" value={form.ask}
              placeholder="Finding cheap flights out of Dublin"
              onChange={(e) => set({ ask: e.target.value })} />
          </Field>

          {/* THE QUESTION THAT IS NOT ABOUT WORK.
              Every other line here is a professional fact, and a room full of
              professional facts is a directory. This is the one somebody
              actually replies to. */}
          <Field label="A hidden talent or a fun fact about you">
            <input className="input text-base sm:text-sm" value={form.fact}
              placeholder="I can name any capital city in under a second"
              onChange={(e) => set({ fact: e.target.value })} />
          </Field>

          <Field label="What are you hoping to do here?" hint={`Pick up to ${WANTS_MAX}, or add your own.`}>
            <Chips
              options={[...WANTS, ...ownWants]}
              value={form.wants}
              onToggle={(o) => toggle('wants', o, WANTS_MAX)}
              max={WANTS_MAX}
            />
            <CustomChip
              disabled={form.wants.length >= WANTS_MAX}
              onAdd={(v) => addOwn('wants', setOwnWants, v, WANTS_MAX)}
            />
          </Field>

          {/* Behind a toggle on purpose. Eight boxes on the screen at once is a
              form; six with two more if you want them is a conversation. */}
          {!more ? (
            <button type="button" onClick={() => setMore(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-brand transition-transform duration-200 hover:translate-x-0.5">
              <Icon name="plus" className="h-4 w-4" /> Two more, if you fancy
            </button>
          ) : (
            <div className="space-y-5 border-t border-gray-100 pt-5">
              <Field label="One place you would go back to tomorrow">
                <input className="input text-base sm:text-sm" value={form.again}
                  placeholder="Kotor"
                  onChange={(e) => set({ again: e.target.value })} />
              </Field>
              <Field label="What do you shoot on?">
                <input className="input text-base sm:text-sm" value={form.kit}
                  placeholder="iPhone 15 Pro and a DJI Mini"
                  onChange={(e) => set({ kit: e.target.value })} />
              </Field>
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-smoke">
              What gets posted
            </p>
            <p className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl border border-gray-100 bg-cloud/50 px-4 py-3 text-sm">
              {message}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={post} disabled={!enough || busy} className="btn-primary disabled:opacity-40">
              {busy ? 'Posting…' : 'Post my intro'}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="btn-ghost">
              Not now
            </button>
            {!enough && (
              <span className="text-xs text-smoke">Add where you are based, or pick what you make.</span>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}
