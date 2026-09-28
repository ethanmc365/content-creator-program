import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import Icon from '../Icon'
import { Modal } from '../ui'
import { notice } from '../../lib/confirm'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'
import IntroCard from './IntroCard'
import AutoTextarea from '../AutoTextarea'
import { INTRO_WANTS, INTRO_SINCE, INTRO_PLATFORMS, buildIntro, introToText } from '../../lib/intro'
import { airport } from '../../lib/airports'
import { COUNTRIES } from '../../lib/countries'

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
                ? 'border-brand bg-brand text-white glow-brand'
                : 'border-gray-200 bg-white text-smoke hoverable:hover:-translate-y-0.5 hoverable:hover:scale-[1.03] hover:border-brand hover:text-brand disabled:opacity-40 disabled:hover:translate-y-0 disabled:hover:border-gray-200 disabled:hover:text-smoke',
            )}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}

// One answer from a short list. Pressing the picked one again clears it.
function OneOf({ options, value, onChange }) {
  const tr = useT()
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value === o
        return (
          <button
            key={o}
            type="button"
            onClick={() => onChange(on ? '' : o)}
            aria-pressed={on}
            className={cx(
              'rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
              on
                ? 'border-brand bg-brand text-white glow-brand'
                : 'border-gray-200 bg-white text-smoke hoverable:hover:-translate-y-0.5 hover:border-brand hover:text-brand',
            )}
          >
            {tr(o)}
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

const WANTS_MAX = 3

// THE FORM ITSELF, AS A DIALOG. See IntroGate below for who opens it and when.
export function IntroModal({ open, onClose, community, channel, onPosted }) {
  const tr = useT()
  const { profile, user } = useAuth()
  const [busy, setBusy] = useState(false)
  const [ownWants, setOwnWants] = useState([])
  // WHAT THE PROFILE ALREADY KNOWS, fetched when the card opens: the stats
  // on the card (flights logged, challenge videos) and a next trip taken
  // from their next logged flight. Prompted, never forced - every field stays
  // theirs to change.
  const [extras, setExtras] = useState({ flights: 0, videos: 0 })
  const [form, setForm] = useState({
    where: [profile?.city, profile?.country].filter(Boolean).join(', '),
    makes: [],
    next: '',
    ask: '',
    fact: '',
    wants: [],
    since: '',
    platform: '',
    fav: '',
    hack: '',
    local: '',
    about: '',
    more: '',
  })
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  useEffect(() => {
    if (!open || !user?.id) return undefined
    let alive = true
    const today = new Date().toISOString().slice(0, 10)
    Promise.all([
      supabase.from('flights').select('id', { count: 'exact', head: true }).eq('creator_id', user.id),
      supabase.from('submissions').select('id', { count: 'exact', head: true }).eq('creator_id', user.id),
      supabase.from('flights').select('to_iata, flown_on').eq('creator_id', user.id).gte('flown_on', today).order('flown_on').limit(1),
    ]).then(([f, sub, up]) => {
      if (!alive) return
      setExtras({ flights: f.count || 0, videos: sub.count || 0 })
      const trip = up.data?.[0]
      const a = trip && airport(trip.to_iata)
      if (a) {
        const month = new Date(trip.flown_on).toLocaleDateString('en-GB', { month: 'long' })
        const country = COUNTRIES.find((c) => c.iso2 === a.country)?.name
        setForm((cur) => (cur.next ? cur : { ...cur, next: `${a.city}${country ? `, ${country}` : ''} in ${month}` }))
      }
    }).catch(() => {})
    return () => { alive = false }
  }, [open, user?.id])

  const toggle = (key, option, max) =>
    setForm((f) => {
      const list = f[key]
      if (list.includes(option)) return { ...f, [key]: list.filter((v) => v !== option) }
      if (list.length >= max) return f
      return { ...f, [key]: [...list, option] }
    })

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

  // THE CARD IS THE PREVIEW (24 Sep 2026). What gets posted is exactly what
  // is drawn beside the form - the same component the room uses.
  const intro = useMemo(() => buildIntro(profile || {}, form, extras), [profile, form, extras])

  const enough = form.where.trim() || form.about.trim()

  async function post() {
    if (!enough || busy) return
    setBusy(true)
    const key = community.kind === 'network' ? channel.key : `${community.slug}:${channel.key}`
    const { error } = await supabase.from('messages').insert({
      channel: key,
      channel_id: channel.id,
      community_id: community.id,
      sender_id: user.id,
      body: introToText(intro),
      intro,
    })
    setBusy(false)
    if (error) { notice(`Could not post: ${error.message}`); return }
    onPosted?.()
  }

  return (
    <Modal open={open} onClose={onClose} title={tr("Introduce yourself")} sheet={false} wide>
      <p className="-mt-3 mb-5 text-sm text-smoke">
        {tr("We filled in what your profile already says. Answer what you like, and your card builds itself as you go.")}
      </p>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <div className="space-y-5">
          <Field label={tr("Where are you based?")}>
            <AutoTextarea className="input resize-none text-base leading-relaxed sm:text-sm" minRows={1} maxLength={400} value={form.where}
              placeholder={tr("Manchester, UK")}
              onChange={(e) => set({ where: e.target.value })} />
          </Field>

          {/* IN YOUR OWN WORDS (28 Sep 2026). Ethan: "add the space for them
              to write more about themselves, like adding a bit about their
              hobbies ... I would remove the 'What do you make?' section." */}
          <Field label={tr("A bit about you")} hint={tr("What you do, what you love, your hobbies. Write as much as you like.")}>
            <AutoTextarea
              className="input resize-none text-base leading-relaxed sm:text-sm"
              minRows={3}
              maxLength={1200}
              value={form.about}
              placeholder={tr("I film budget city breaks around my 9 to 5, and when I'm not travelling I'm climbing or hunting down the best coffee in town.")}
              onChange={(e) => set({ about: e.target.value })}
            />
          </Field>

          <Field label={tr("How long have you been creating?")}>
            <OneOf options={INTRO_SINCE} value={form.since} onChange={(v) => set({ since: v })} />
          </Field>

          <Field label={tr("Where do you post the most?")}>
            <OneOf options={INTRO_PLATFORMS} value={form.platform} onChange={(v) => set({ platform: v })} />
          </Field>

          <Field label={tr("Where are you headed next?")}>
            <AutoTextarea className="input resize-none text-base leading-relaxed sm:text-sm" minRows={1} maxLength={400} value={form.next}
              placeholder={tr("Lisbon, Portugal in March")}
              onChange={(e) => set({ next: e.target.value })} />
          </Field>

          <Field label={tr("Your best trip so far")}>
            <AutoTextarea className="input resize-none text-base leading-relaxed sm:text-sm" minRows={1} maxLength={400} value={form.fav}
              placeholder={tr("Three days in Porto for under 200")}
              onChange={(e) => set({ fav: e.target.value })} />
          </Field>

          <Field label={tr("One thing people should ask you about")}>
            <AutoTextarea className="input resize-none text-base leading-relaxed sm:text-sm" minRows={1} maxLength={400} value={form.ask}
              placeholder={tr("Finding cheap flights out of Dublin")}
              onChange={(e) => set({ ask: e.target.value })} />
          </Field>

          <Field label={tr("Your best travel hack")}>
            <AutoTextarea className="input resize-none text-base leading-relaxed sm:text-sm" minRows={1} maxLength={400} value={form.hack}
              placeholder={tr("Search one-way flights both ways, then book the cheaper pair")}
              onChange={(e) => set({ hack: e.target.value })} />
          </Field>

          <Field label={tr("Your favourite spot in your home town")}>
            <AutoTextarea className="input resize-none text-base leading-relaxed sm:text-sm" minRows={1} maxLength={400} value={form.local}
              placeholder={tr("The rooftop bar above the old market")}
              onChange={(e) => set({ local: e.target.value })} />
          </Field>

          <Field label={tr("A hidden talent or a fun fact about you")}>
            <AutoTextarea className="input resize-none text-base leading-relaxed sm:text-sm" minRows={1} maxLength={400} value={form.fact}
              placeholder={tr("I can name any capital city in under a second")}
              onChange={(e) => set({ fact: e.target.value })} />
          </Field>

          <Field label={tr("What are you hoping to find here?")} hint={`Pick up to ${WANTS_MAX}, or add your own.`}>
            <Chips
              options={[...INTRO_WANTS, ...ownWants]}
              value={form.wants}
              onToggle={(o) => toggle('wants', o, WANTS_MAX)}
              max={WANTS_MAX}
            />
            <CustomChip
              disabled={form.wants.length >= WANTS_MAX}
              onAdd={(v) => addOwn('wants', setOwnWants, v, WANTS_MAX)}
            />
          </Field>

          <Field label={tr("Anything else you want to share?")} hint={tr("A project you're working on, a question for the community, something you're proud of.")}>
            <AutoTextarea
              className="input resize-none text-base leading-relaxed sm:text-sm"
              minRows={2}
              maxLength={1200}
              value={form.more}
              placeholder={tr("I'm planning a Balkans road trip next spring and would love to team up with anyone heading that way.")}
              onChange={(e) => set({ more: e.target.value })}
            />
          </Field>
        </div>

        {/* THE CARD, LIVE. Sticky on a desktop so it stays beside whatever
            field is being filled in; under the form on a phone. */}
        <div className="lg:sticky lg:top-0 lg:self-start">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-smoke">{tr("Your card")}</p>
          <IntroCard intro={intro} sender={{ id: user?.id, name: profile?.name, photo_url: profile?.photo_url }} myId={user?.id} />
          <p className="mt-2 text-[11px] leading-relaxed text-smoke">
            {tr("Countries, dream trips and socials come from your profile. Edit them there.")}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={post} disabled={!enough || busy} className="btn-primary disabled:opacity-40">
              {busy ? tr('Posting…') : tr('Post my intro')}
            </button>
            <button type="button" onClick={onClose} className="btn-ghost">
              {tr("Not now")}
            </button>
          </div>
          {!enough && (
            <p className="mt-2 text-xs text-smoke">{tr("Add where you are based, or a bit about you.")}</p>
          )}
        </div>
      </div>
    </Modal>
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
    if (!user?.id || !isIntroRoom || !canPost) return undefined
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

  // ALWAYS THERE IN THIS ROOM (26 Sep 2026). Ethan: "there should be a button
  // ... so that anyone can always redo it if they want to, so they can post
  // another one. Because currently, once you've done it, there's no button to
  // redo it again." It still only opens ITSELF for somebody who has never
  // posted; after that it is a quieter "post a new intro".
  if (!isIntroRoom || !canPost || !user?.id) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        // ALWAYS MOVING, ALWAYS COLOURFUL (28 Sep 2026). Ethan: "improve the
        // UI if it maybe had some constant animations. Maybe make it a little
        // bit colourful so it stands out." A warm gradient that drifts, a pass
        // of light across it and twinkling sparkles; the same whether or not
        // you have posted before. Decoration only - it stops under reduced
        // motion and nothing moves position.
        className="intro-cta group relative mb-2 flex w-full items-center gap-2.5 overflow-hidden rounded-xl px-3 py-2.5 text-left text-white shadow-card transition-transform duration-200 hoverable:hover:-translate-y-0.5 active:scale-[0.99]"
      >
        <span aria-hidden className="challenge-sheen pointer-events-none absolute inset-y-0" />
        <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/25 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.35)]">
          <Icon name="sparkles" className="hook-sparkles h-4 w-4" />
        </span>
        <span className="relative min-w-0 flex-1 text-[13px] font-semibold">
          {posted ? tr("Post a new intro") : tr("Introduce yourself")}
          <span className="hidden font-normal text-white/90 sm:inline">
            {posted ? ` · ${tr('share what is new with you')}` : ` · ${tr('answer a few questions and we will write it')}`}
          </span>
        </span>
        <span className="relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white/25">
          <Icon name="chevronRight" className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
        </span>
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
