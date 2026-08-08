import { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Icon from '../Icon'
import { notice } from '../../lib/confirm'
import { cx } from '../../lib/utils'

// The introductions room, with the hard part done for you.
//
// "Say hello" is the worst prompt in community software. It asks for a blank
// page from the person with the least context in the room, and what comes back
// is "hey everyone excited to be here", which nobody can reply to. Five specific
// questions produce a post with four things in it somebody can grab: a city, a
// niche, a trip and an ask.
//
// The chips matter more than the free text. A creator who would never write a
// paragraph will tap six things, and taps produce a better intro than most
// paragraphs do.

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
function Chips({ options, value, onToggle, max = 4 }) {
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

export default function IntroPrompt({ community, channel, onPosted }) {
  const { profile, user } = useAuth()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [form, setForm] = useState({
    where: [profile?.city, profile?.country].filter(Boolean).join(', '),
    makes: [],
    next: '',
    ask: '',
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
    <div className="border-b border-gray-100 bg-brand-tint/25 px-4 py-3.5 sm:px-5">
      {!open ? (
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
              Five quick questions. We will write the post for you.
            </span>
          </span>
          <span className="btn-primary shrink-0 !px-4 !py-2 !text-xs">Start</span>
        </button>
      ) : (
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="overflow-hidden"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">Introduce yourself</p>
                <p className="text-xs text-smoke">Skip anything you would rather not say.</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close"
                className="rounded-lg p-1.5 text-smoke transition-colors hover:bg-white hover:text-ink">
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <Field label="Where are you based?">
                <input className="input text-base sm:text-sm" value={form.where}
                  placeholder="Manchester, UK"
                  onChange={(e) => set({ where: e.target.value })} />
              </Field>

              <Field label="What do you make?" hint="Pick up to four.">
                <Chips options={MAKES} value={form.makes} onToggle={(o) => toggle('makes', o, 4)} max={4} />
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

              <Field label="What are you hoping to find here?" hint="Pick up to three.">
                <Chips options={WANTS} value={form.wants} onToggle={(o) => toggle('wants', o, 3)} max={3} />
              </Field>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-smoke">
                  What gets posted
                </p>
                <p className="whitespace-pre-wrap rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm">
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
          </motion.div>
        </AnimatePresence>
      )}
    </div>
  )
}
