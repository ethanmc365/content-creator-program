import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Icon from '../Icon'
import { Modal } from '../ui'
import { notice } from '../../lib/confirm'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'

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
  const tr = useT()
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
        placeholder={tr("Add your own…")}
        onChange={(e) => setText(e.target.value)}
        // Enter adds the chip. This form has no submit button of its own and
        // sits inside no <form>, so Enter would otherwise do nothing at all.
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        aria-label={tr("Add your own option")}
      />
      <button type="button" onClick={add} disabled={disabled || !text.trim()}
        className="btn-secondary shrink-0 !py-2 !text-sm disabled:opacity-40">
        {tr("Add")}
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

// THE FORM ITSELF, AS A DIALOG. See IntroGate below for who opens it and when.
export function IntroModal({ open, onClose, community, channel, onPosted }) {
  const tr = useT()
  const { profile, user } = useAuth()
  const [busy, setBusy] = useState(false)
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
    onPosted?.()
  }

  return (
    <>
      {/* A CARD, NOT A FULL SCREEN. `sheet={false}` keeps it a floating panel
          with the room visible round the edges on a phone as well as on a
          desktop. A bottom sheet 90vh tall reads as having been sent somewhere
          else, and this is an invitation you should be able to see past. */}
      <Modal open={open} onClose={onClose} title={tr("Introduce yourself")} sheet={false}>
        <p className="-mt-3 mb-5 text-sm text-smoke">
          {tr("Skip anything you would rather not say. Only the last box gets posted.")}
        </p>

        <div className="space-y-5">
          <Field label={tr("Where are you based?")}>
            <input className="input text-base sm:text-sm" value={form.where}
              placeholder={tr("Manchester, UK")}
              onChange={(e) => set({ where: e.target.value })} />
          </Field>

          <Field label={tr("What do you make?")} hint={`Pick up to ${MAKES_MAX}, or add your own.`}>
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

          <Field label={tr("Where are you headed next?")}>
            <input className="input text-base sm:text-sm" value={form.next}
              placeholder={tr("Lisbon in March")}
              onChange={(e) => set({ next: e.target.value })} />
          </Field>

          <Field label={tr("One thing people should ask you about")}>
            <input className="input text-base sm:text-sm" value={form.ask}
              placeholder={tr("Finding cheap flights out of Dublin")}
              onChange={(e) => set({ ask: e.target.value })} />
          </Field>

          {/* THE QUESTION THAT IS NOT ABOUT WORK.
              Every other line here is a professional fact, and a room full of
              professional facts is a directory. This is the one somebody
              actually replies to. */}
          <Field label={tr("A hidden talent or a fun fact about you")}>
            <input className="input text-base sm:text-sm" value={form.fact}
              placeholder={tr("I can name any capital city in under a second")}
              onChange={(e) => set({ fact: e.target.value })} />
          </Field>

          <Field label={tr("What are you hoping to do here?")} hint={`Pick up to ${WANTS_MAX}, or add your own.`}>
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

          {/* "One place you would go back to tomorrow" and "What do you shoot
              on?" were here behind a toggle and are gone at Ethan's call. Both
              were fine questions and neither earned its place: the first is
              answered by the next-trip line above it, and the second turns an
              introduction into a gear thread. */}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-smoke">
              {tr("What gets posted")}
            </p>
            <p className="max-h-44 overflow-y-auto overscroll-contain whitespace-pre-wrap rounded-xl border border-gray-100 bg-cloud/50 px-4 py-3 text-sm">
              {message}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={post} disabled={!enough || busy} className="btn-primary disabled:opacity-40">
              {busy ? 'Posting…' : 'Post my intro'}
            </button>
            <button type="button" onClick={onClose} className="btn-ghost">
              {tr("Not now")}
            </button>
            {!enough && (
              <span className="text-xs text-smoke">{tr("Add where you are based, or pick what you make.")}</span>
            )}
          </div>
        </div>
      </Modal>
    </>
  )
}

// ---------------------------------------------------------------- the invite
//
// WHERE IT APPEARS, AND HOW OFTEN.
//
// This was an app-wide popup that opened on any chat path, which meant it fired
// on every visit to /rooms - Ethan's report - and it fired as a full-height
// bottom sheet, so answering it felt like being sent to a form rather than being
// invited to post in a room.
//
// It belongs to ONE ROOM: the worldwide introductions room. That is the room
// whose entire purpose is this message, it is the only place the resulting post
// will appear, and a prompt that opens where its answer goes needs no
// explaining. Opening it there means the room itself is the trigger, so there is
// no path-matching to get wrong.
//
// AND THE X IS NOT THE END OF IT. Dismissing the card leaves a slim button
// directly above the composer, which is the only affordance that survives every
// way a person can decline: it is not a modal, it costs one line, and it is
// where you are already looking when you think "actually, I should say hello".
// It goes when the intro is posted, and never comes back.
//
// THREE PIECES OF STATE, THREE LIFETIMES:
//   - posted     -> the DB is the truth (localStorage is a per-device cache, and
//                   somebody who introduced themselves on their phone must not
//                   be asked again on a laptop).
//   - dismissed  -> sessionStorage. The card stays shut for this visit; the
//                   button above the composer stays for as long as it takes.
//   - the button -> shown whenever the room is open and the intro is not posted.
const DONE_KEY = 'intro-posted'
const SNOOZE_KEY = 'intro-snoozed'

/**
 * The invitation, scoped to the worldwide introductions room.
 *
 * @param {object} community  the community whose room is open
 * @param {object} channel    the open channel ({ id, key })
 * @param {boolean} canPost   false in a read-only room; no point inviting then
 */
export default function IntroInvite({ community, channel, canPost = true }) {
  const tr = useT()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [posted, setPosted] = useState(true) // assume done until we know better

  const isIntroRoom = community?.kind === 'network' && channel?.key === 'introductions'

  useEffect(() => {
    if (!user?.id || !isIntroRoom || !canPost) { setPosted(true); return undefined }
    let alive = true
    supabase
      .from('messages').select('id')
      .eq('channel', 'introductions').eq('sender_id', user.id).limit(1)
      .then(({ data }) => {
        if (!alive) return
        const done = !!data?.length
        setPosted(done)
        if (done) { try { localStorage.setItem(DONE_KEY, '1') } catch { /* private mode */ } return }
        let snoozed = false
        try { snoozed = sessionStorage.getItem(SNOOZE_KEY) === '1' } catch { /* private mode */ }
        // A beat, so the card lands on a room that has finished arriving rather
        // than on top of its loading skeleton.
        if (!snoozed) setTimeout(() => { if (alive) setOpen(true) }, 900)
      })
    return () => { alive = false }
  }, [user?.id, isIntroRoom, canPost])

  if (!isIntroRoom || posted) return null

  return (
    <>
      {/* The line above the composer. It is the whole reason the X is safe. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mb-2 flex w-full items-center gap-2.5 rounded-xl border border-brand/25 bg-brand-tint/40 px-3 py-2 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/50"
      >
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
          <Icon name="sparkles" className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1 text-xs font-medium text-brand">
          {tr("Introduce yourself")}
          <span className="hidden font-normal text-smoke sm:inline"> · answer a few questions and we will write it</span>
        </span>
        <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-brand/60" />
      </button>

      <IntroModal
        open={open}
        community={community}
        channel={channel}
        onClose={() => {
          setOpen(false)
          try { sessionStorage.setItem(SNOOZE_KEY, '1') } catch { /* private mode */ }
        }}
        onPosted={() => {
          setOpen(false)
          setPosted(true)
          try { localStorage.setItem(DONE_KEY, '1') } catch { /* private mode */ }
        }}
      />
    </>
  )
}
