import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useCommunity } from '../context/CommunityContext'
import NetworkLayout, { flagFromIso } from '../components/network/NetworkLayout'
import NetworkMotion from '../components/NetworkMotion'
import TrypPlane from '../components/network/TrypPlane'
import Icon from '../components/Icon'
import { Avatar, Badge, EmptyState, Select } from '../components/ui'
import { confirm, notice } from '../lib/confirm'
import { COUNTRIES } from '../lib/countries'
import { COMMON_ZONES, CURRENCIES, zoneForCountries, currencyForCountries } from '../lib/timezones'
import { cx, timeAgo } from '../lib/utils'
import { listContainer, listItem, pageFade } from '../lib/motion'

// Manage markets: every market, the door to opening another, and the ones that
// have been retired.
//
// It was called "Network settings", which described where the page sat in the
// system rather than what anybody opens it to do. Nobody goes looking for
// settings; they go looking for Spain.
//
// WHY OPENING A MARKET IS A WIZARD AND NOT A FORM
//
// It was a form, and the form was the problem the user actually hit: they went
// looking for how to create a market and did not find it, because "open a new
// market" was a button inside a settings page inside a preview. A market is
// also not one decision. It is an identity, a locale, an access rule, a set of
// rooms and a team, and a single grid of twelve inputs asks all five at once
// and reads as configuration rather than as founding something.
//
// It still ends in ONE call. `create_market` writes the community, its rooms,
// its lead and that lead's membership in a single transaction, because a
// half-created market looks fine in a list and breaks when someone opens it.

// TWO CURRENCIES, and the market's own clock chosen from a list.
//
// The old form offered nine currencies and a FREE TEXT timezone box. Ethan
// typed "Europe Berlin" into it when he created France - one missing slash -
// and the market was saved with a zone no engine recognises, which would have
// landed every deadline in that market at the wrong hour with nothing on screen
// to suggest anything was wrong. A control that accepts a typo silently is the
// bug; the list is the fix.
//
// The presets that used to sit above the name ("start from somewhere: Italy,
// Poland, France, Benelux") are gone at Ethan's request. They were a shortcut
// past the two fields that matter, and one of them is why France exists.

const ROOM_CHOICES = [
  { key: 'general', label: 'General', hint: 'The main room. Always created.', locked: true, icon: 'chat' },
  { key: 'announcements', label: 'Announcements', hint: 'Team posts only. Always created.', locked: true, icon: 'megaphone' },
  { key: 'meetups', label: 'Meetups', hint: 'Who is filming where, and when.', icon: 'calendar' },
  { key: 'introductions', label: 'Introductions', hint: 'New here? Say hello.', icon: 'users' },
  { key: 'feedback', label: 'Feedback', hint: 'Tell the team what would help.', icon: 'bulb' },
]

const JOIN_POLICIES = [
  {
    value: 'country', label: 'Creators based here', icon: 'pin',
    blurb: 'A creator whose profile country matches one of this market\'s countries can join themselves. This is what "your market" means, and it is the right answer almost always.',
  },
  {
    value: 'open', label: 'Any creator', icon: 'globe',
    blurb: 'Anyone in the network can join, wherever they live. Good for a market defined by a language or a theme rather than a border.',
  },
  {
    value: 'invite', label: 'Invite only', icon: 'key',
    blurb: 'Nobody joins themselves. A manager adds each creator. Use for a pilot or a paid tier.',
  },
]

const STEPS = ['Identity', 'Locale', 'Access', 'Rooms', 'Review']

const BLANK = {
  name: '', slug: '', codes: [], tagline: '',
  currency: 'EUR', tz: 'Europe/Madrid', cpm: '0.50',
  joinPolicy: 'country', openNow: false,
  // EVERY MARKET STARTS WITH INTRODUCTIONS. Ethan asked for four rooms rather
  // than three, and introductions is the one that earns its place on day one:
  // a market with nobody in it yet needs somewhere for the first arrivals to
  // say hello, and "general" fills up with everything else within a week.
  rooms: ['general', 'announcements', 'meetups', 'introductions'],
  leads: [],
}

// A slug you can still edit, but never have to type.
const slugify = (s) =>
  s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 32)

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-smoke">{hint}</span>}
    </label>
  )
}

// A big, obvious switch. The plain checkbox this replaces was 16px of browser
// chrome in the middle of a designed page, and "open to creators" is the single
// most consequential setting a market has.
export function BigToggle({ on, onChange, title, hint, onLabel = 'On', offLabel = 'Off' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cx(
        'flex w-full items-center gap-4 rounded-card border p-4 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card',
        on ? 'border-brand bg-brand-tint/40' : 'border-gray-200 bg-white',
      )}
    >
      <span
        aria-hidden
        className={cx(
          'relative flex h-7 w-12 shrink-0 items-center rounded-full transition-colors duration-200',
          on ? 'bg-brand' : 'bg-gray-200',
        )}
      >
        <span
          className={cx(
            'absolute h-5 w-5 rounded-full bg-white shadow transition-transform duration-200',
            on ? 'translate-x-6' : 'translate-x-1',
          )}
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{title}</span>
        {hint && <span className="mt-0.5 block text-xs text-smoke">{hint}</span>}
      </span>
      <span className={cx('shrink-0 text-xs font-semibold uppercase tracking-wide', on ? 'text-brand' : 'text-smoke')}>
        {on ? onLabel : offLabel}
      </span>
    </button>
  )
}

export default function GlobalSettings() {
  const navigate = useNavigate()
  const { chapters, network, isGlobalAdmin, reload } = useCommunity()
  const [form, setForm] = useState(BLANK)
  const [step, setStep] = useState(0)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [countryQuery, setCountryQuery] = useState('')
  const [admins, setAdmins] = useState([])

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  useEffect(() => {
    if (!isGlobalAdmin) return
    supabase.from('profiles').select('id, name, photo_url, country_code')
      .eq('status', 'active').eq('is_test', false)
      .order('is_admin', { ascending: false }).order('name').limit(200)
      .then(({ data }) => setAdmins(data || []))
  }, [isGlobalAdmin])

  const countryHits = useMemo(() => {
    const q = countryQuery.trim().toLowerCase()
    if (!q) return []
    return COUNTRIES.filter(
      (c) => c.name.toLowerCase().includes(q) || c.iso2.toLowerCase() === q
        || (c.aliases || []).some((a) => a.includes(q)),
    ).slice(0, 6)
  }, [countryQuery])

  // WHO IS ASKING TO GET IN.
  const [joinRequests, setJoinRequests] = useState([])
  const loadRequests = useCallback(async () => {
    const { data } = await supabase
      .from('market_join_requests')
      .select('id, created_at, community_id, profiles:profile_id(id, name, photo_url, country), communities:community_id(name)')
      .eq('status', 'pending')
      .order('created_at')
    setJoinRequests(data ?? [])
  }, [])
  useEffect(() => { loadRequests() }, [loadRequests])

  if (!isGlobalAdmin) {
    return (
      <NetworkLayout>
        <EmptyState icon={<Icon name="shield" className="h-6 w-6" />} title="Global admins only"
          hint="Opening and closing markets is a platform action. Running one market does not grant it."
          action={<Link to="/global" className="btn-secondary">Back to Worldwide</Link>} />
      </NetworkLayout>
    )
  }

  const slugTaken = chapters.some((c) => c.slug === form.slug) || form.slug === network?.slug
  // A MARKET WITH NO COUNTRIES IS A MARKET NOBODY CAN JOIN.
  //
  // The default access rule is "creators based here", which matches a creator's
  // country against this list - so an empty list means the rule can never match
  // anybody. It is also why France came out with the worldwide globe instead of
  // a flag: the mark is drawn from the countries, and there were none. The form
  // let all of that through because countries were optional.
  const stepValid = [
    form.name.trim().length >= 2 && /^[a-z0-9-]{2,32}$/.test(form.slug) && !slugTaken
      && form.codes.length > 0,
    !!form.currency && !!form.tz,
    true,
    true,
    true,
  ][step]


  // A DECLINE CARRIES A REASON, and the database refuses one without it.
  //
  // "No" with no reason is the version that makes somebody feel shut out rather
  // than redirected - a creator who applied to Romania but does not make
  // Romanian content should be told that, because it is answerable.
  async function decideRequest(r, accept) {
    let reason = null
    if (!accept) {
      reason = window.prompt(
        `Why is ${r.profiles?.name ?? 'this creator'} not joining ${r.communities?.name}?\n\nThey are sent this, so make it something they can act on.`,
      )
      if (reason == null || !reason.trim()) return
    }
    const { error } = await supabase.rpc('decide_join_request', {
      p_request: r.id, p_accept: accept, p_reason: reason,
    })
    if (error) { notice(error.message); return }
    await loadRequests()
    await reload()
    notice(accept
      ? `${r.profiles?.name ?? 'They'} are in ${r.communities?.name}.`
      : `Declined, and told why.`)
  }

  // A retired market leaves the working list and appears under Retired. Both
  // lists come from the same array, so nothing can be in neither.
  const live = chapters.filter((c) => !c.retired_at)
  const retired = chapters.filter((c) => c.retired_at)

  // DELETE IS NOT RETIRE, and the difference is history.
  //
  // Retire is for a market that ran and stopped: it keeps its members, its
  // challenges and its results. Delete is for one that should never have
  // existed - the France Ethan made to see how the flow worked. The RPC refuses
  // whenever there is anything worth keeping, so this can be offered without
  // the confirm being the only thing standing between a slip and a market.
  async function removeMarket(c) {
    if (!await confirm(
      `Permanently delete ${c.name}?\n\nThis is for a market created by mistake. Anything with members or challenges is refused - retire those instead.`,
    )) return
    const { error } = await supabase.rpc('delete_market', { p_market: c.id })
    if (error) { notice(error.message); return }
    await reload()
    notice(`${c.name} deleted.`)
  }

  async function createMarket() {
    setBusy(true)
    const { error } = await supabase.rpc('create_market', {
      p_slug: form.slug,
      p_name: form.name.trim(),
      p_country_codes: form.codes,
      p_currency: form.currency,
      p_timezone: form.tz,
      p_lead: form.leads[0] || null,
      p_cpm_target: Number(form.cpm) || 0.5,
      p_tagline: form.tagline.trim() || null,
      p_join_policy: form.joinPolicy,
      p_rooms: form.rooms,
      p_open_now: form.openNow,
      p_settings: {},
    })
    if (!error && form.leads.length > 1) {
      // create_market takes one lead; the rest are set in the same breath so a
      // market never briefly exists with only half its team.
      const { data: made } = await supabase.from('communities').select('id').eq('slug', form.slug).maybeSingle()
      if (made?.id) await supabase.rpc('set_market_leads', { p_market: made.id, p_leads: form.leads })
    }
    setBusy(false)
    if (error) { notice(`Could not open the market: ${error.message}`); return }
    await reload()
    const slug = form.slug
    setForm(BLANK)
    setStep(0)
    setOpen(false)
    notice(form.openNow
      ? `${form.name} is open. Creators based there can join it now.`
      : `${form.name} is created and CLOSED. Turn it on in its settings when you are ready.`)
    navigate(`/manage/${slug}`)
  }


  // --------------------------------------------------------------- the steps
  const stepBody = [
    // 0 Identity
    <div key="identity" className="space-y-5">
      {/* THE NAME, WITH ITS FLAG ON IT. The address is derived and no longer
          announced: "becomes /c/france" is machinery, and a market whose slug
          needs hand-editing is rare enough to earn a link rather than a field
          everybody has to read past. */}
      <Field label="Market name">
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg leading-none" aria-hidden>
            {form.codes.map(flagFromIso).join('') || '🏳️'}
          </span>
          <input className="input !pl-11" value={form.name} placeholder="France"
            onChange={(e) => set({
              name: e.target.value,
              // Only auto-slug while the slug is still the machine's guess, so
              // a hand-typed slug is never overwritten mid-sentence.
              slug: !form.slug || form.slug === slugify(form.name) ? slugify(e.target.value) : form.slug,
            })} />
        </div>
        {slugTaken && (
          <p className="mt-1 text-xs font-medium text-red-600">
            /c/{form.slug} is taken. <button type="button" className="underline"
              onClick={() => set({ slug: `${form.slug}-2` })}>Use /c/{form.slug}-2</button>
          </p>
        )}
      </Field>

      <Field label="Tagline">
        <input className="input" value={form.tagline} maxLength={120}
          placeholder="Briefs and challenges for creators across Germany."
          onChange={(e) => set({ tagline: e.target.value })} />
      </Field>

      <div>
        <p className="mb-2 text-sm font-medium">Countries</p>
        <div className="mb-2 flex flex-wrap gap-2">
          {form.codes.map((c) => (
            <button key={c} type="button" onClick={() => set({ codes: form.codes.filter((x) => x !== c) })}
              className="flex items-center gap-1.5 rounded-full border border-brand bg-brand-tint px-3 py-1.5 text-sm font-medium text-brand transition-transform duration-200 hover:scale-105">
              {flagFromIso(c)} {COUNTRIES.find((x) => x.iso2 === c)?.name || c}
              <Icon name="close" className="h-3 w-3" />
            </button>
          ))}
          {form.codes.length === 0 && <span className="text-xs text-smoke">None yet.</span>}
        </div>
        <input className="input" value={countryQuery} placeholder="Search a country to add…"
          onChange={(e) => setCountryQuery(e.target.value)} />
        {countryHits.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {countryHits.map((c) => (
              <button key={c.iso2} type="button"
                disabled={form.codes.includes(c.iso2)}
                onClick={() => {
                  const codes = [...form.codes, c.iso2]
                  // Adding the first country answers the two questions the next
                  // step was going to ask anyway. Both stay editable.
                  set({
                    codes,
                    tz: form.tz || zoneForCountries(codes) || '',
                    currency: form.codes.length === 0 ? currencyForCountries(codes) : form.currency,
                  })
                  setCountryQuery('')
                }}
                className="rounded-full border border-gray-200 px-3 py-1.5 text-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand disabled:opacity-40">
                {flagFromIso(c.iso2)} {c.name}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,

    // 1 Locale
    <div key="locale" className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Currency">
          <Select variant="field" ariaLabel="Currency" value={form.currency} onChange={(v) => set({ currency: v })}
            options={CURRENCIES} />
        </Field>
        {/* A LIST, NOT A TEXT BOX. "Europe Berlin" - one missing slash - is a
            zone no engine knows, and a market saved with it lands every deadline
            at the wrong hour with nothing on screen to say so. */}
        <Field label="Timezone">
          <Select variant="field" ariaLabel="Timezone" value={form.tz} onChange={(v) => set({ tz: v })}
            placeholder="Pick the market's clock" options={COMMON_ZONES} />
        </Field>
      </div>

      <Field label="CPM target">
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-smoke">
            {form.currency === 'GBP' ? '£' : '€'}
          </span>
          <input className="input !pl-8" inputMode="decimal" value={form.cpm}
            onChange={(e) => set({ cpm: e.target.value.replace(/[^0-9.]/g, '') })} />
        </div>
      </Field>

      {/* MORE THAN ONE LEAD, and only ever an admin.
          The old control was a single-choice list of EVERY creator, which is two
          mistakes: a market the size of Spain is not run by one person, and
          somebody has to be made an admin before they can run a market, so
          offering the other forty-nine names is offering a wrong answer. */}
      <div>
        <p className="mb-2 text-sm font-medium">Market leads</p>
        <div className="flex flex-wrap gap-2">
          {admins.map((a) => {
            const on = form.leads.includes(a.id)
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => set({ leads: on ? form.leads.filter((x) => x !== a.id) : [...form.leads, a.id] })}
                aria-pressed={on}
                className={cx(
                  'flex items-center gap-2 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-all duration-200',
                  on ? 'border-brand bg-brand-tint text-brand' : 'border-gray-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand',
                )}
              >
                {a.name}
                {on && <Icon name="check" className="h-3.5 w-3.5" />}
              </button>
            )
          })}
          {admins.length === 0 && (
            <span className="text-xs text-smoke">
              Nobody is an admin yet. Promote somebody on the Tryp.com team page first.
            </span>
          )}
        </div>
      </div>
    </div>,

    // 2 Access
    <div key="access" className="space-y-5">
      <div>
        <p className="mb-1.5 text-sm font-medium">Who can join</p>
        <div className="grid gap-3 sm:grid-cols-3">
          {JOIN_POLICIES.map((p) => (
            <button key={p.value} type="button" onClick={() => set({ joinPolicy: p.value })}
              aria-pressed={form.joinPolicy === p.value}
              className={cx(
                'flex flex-col rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5',
                form.joinPolicy === p.value ? 'border-brand bg-brand-tint/40 shadow-card' : 'border-gray-200 bg-white hover:border-brand/40',
              )}>
              <span className="flex items-center gap-2">
                <Icon name={p.icon} className={cx('h-5 w-5', form.joinPolicy === p.value ? 'text-brand' : 'text-smoke')} />
                <span className="text-sm font-semibold">{p.label}</span>
              </span>
              <span className="mt-2 text-xs leading-relaxed text-smoke">{p.blurb}</span>
            </button>
          ))}
        </div>
      </div>

      <BigToggle
        on={form.openNow}
        onChange={(v) => set({ openNow: v })}
        title="Open to creators straight away"
        hint={form.openNow
          ? 'It appears in the market list the moment you create it. Make sure the brief and the rooms are ready.'
          : 'Recommended. It is created invisible, so you can set it up properly and turn it on when it is ready.'}
        onLabel="Open"
        offLabel="Closed"
      />
    </div>,

    // 3 Rooms
    <div key="rooms" className="space-y-3">
      <p className="text-sm text-smoke">
        Rooms are this market&rsquo;s own. You can add and rename them later.
      </p>
      {ROOM_CHOICES.map((r) => {
        const on = r.locked || form.rooms.includes(r.key)
        return (
          <button key={r.key} type="button" disabled={r.locked}
            onClick={() => set({
              rooms: form.rooms.includes(r.key)
                ? form.rooms.filter((x) => x !== r.key)
                : [...form.rooms, r.key],
            })}
            className={cx(
              'flex w-full items-center gap-3 rounded-xl border p-4 text-left transition-all duration-200',
              on ? 'border-brand/50 bg-brand-tint/30' : 'border-gray-200 bg-white hover:-translate-y-0.5 hover:border-brand/40',
              r.locked && 'cursor-default opacity-90',
            )}>
            <Icon name={r.icon} className={cx('h-5 w-5 shrink-0', on ? 'text-brand' : 'text-smoke')} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{r.label}</span>
              <span className="block text-xs text-smoke">{r.hint}</span>
            </span>
            {on && <Icon name="check" className="h-4 w-4 shrink-0 text-brand" />}
          </button>
        )
      })}
    </div>,

    // 4 Review
    <div key="review" className="space-y-4">
      <div className="rounded-card border border-brand/25 bg-brand-tint/20 p-5">
        <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
          <span aria-hidden>{form.codes.map(flagFromIso).join(' ') || '🌍'}</span>
          {form.name || 'Untitled market'}
          <Badge tone={form.openNow ? 'green' : 'grey'}>{form.openNow ? 'Open' : 'Closed'}</Badge>
        </p>
        <p className="mt-1 text-sm text-smoke">{form.tagline || `Challenges, briefs and rooms for ${form.name || 'this market'}.`}</p>
        <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div className="flex justify-between gap-3"><dt className="text-smoke">Address</dt><dd className="font-medium">/c/{form.slug}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-smoke">Currency</dt><dd className="font-medium">{form.currency}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-smoke">Timezone</dt><dd className="truncate font-medium">{form.tz}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-smoke">CPM target</dt><dd className="font-medium">{form.cpm}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-smoke">Who can join</dt><dd className="font-medium">{JOIN_POLICIES.find((p) => p.value === form.joinPolicy)?.label}</dd></div>
          <div className="flex justify-between gap-3"><dt className="text-smoke">Leads</dt><dd className="truncate font-medium">{form.leads.map((id) => admins.find((a) => a.id === id)?.name).filter(Boolean).join(', ') || 'Nobody yet'}</dd></div>
          <div className="flex justify-between gap-3 sm:col-span-2">
            <dt className="text-smoke">Rooms</dt>
            <dd className="font-medium">
              {[...new Set(['general', 'announcements', ...form.rooms])]
                .map((k) => ROOM_CHOICES.find((r) => r.key === k)?.label || k).join(', ')}
            </dd>
          </div>
        </dl>
      </div>
      <p className="text-xs text-smoke">
        Scoring is set per challenge, not here. When you create this market&rsquo;s first challenge you pick how it is
        won and, for a points challenge, write its rules there.
      </p>
    </div>,
  ][step]

  return (
    <NetworkMotion>
      <NetworkLayout>
        <motion.div {...pageFade} className="space-y-9">
          <section>
            <Link to="/global" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-smoke transition-colors hover:text-brand">
              <Icon name="chevronLeft" className="h-4 w-4" /> Worldwide
            </Link>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Manage markets</h1>
          </section>

          {/* ---------------- Open a market ---------------- */}
          <section>
            {!open ? (
              <button onClick={() => setOpen(true)}
                className="relative w-full overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-6 text-left text-white shadow-lift transition-transform duration-200 hover:-translate-y-1 sm:p-8">
                <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
                {/* Centred, not parked in the corner: this card is a wide banner
                    with a short block of copy on the left, so the free space is the
                    middle-right rather than the bottom edge. */}
                <TrypPlane variant="hero" anchor="center" id="new-market" className="right-4" />
                <div className="relative">
                  <p className="text-xs font-semibold uppercase tracking-widest text-white/75">New market</p>
                  <p className="mt-2 text-2xl font-bold sm:text-3xl">Open somewhere new</p>
                  <p className="mt-2 max-w-xl text-white/85">
                    Five short steps. Creates the market, its rooms, its lead and its access rule in one go,
                    and leaves it closed until you say otherwise.
                  </p>
                  <span className="mt-5 inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-semibold text-brand">
                    Start <Icon name="chevronRight" className="h-4 w-4" />
                  </span>
                </div>
              </button>
            ) : (
              <div className="card">
                {/* Step rail */}
                <div className="mb-6 flex items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                  {STEPS.map((s, i) => (
                    <button key={s} type="button" onClick={() => i < step && setStep(i)}
                      disabled={i > step}
                      className={cx(
                        'flex shrink-0 items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors',
                        i === step ? 'bg-brand text-white'
                          : i < step ? 'bg-brand-tint text-brand hover:bg-brand-tint/70'
                            : 'text-gray-300',
                      )}>
                      <span className={cx('flex h-5 w-5 items-center justify-center rounded-full text-[10px]',
                        i === step ? 'bg-white/25' : i < step ? 'bg-brand/15' : 'bg-gray-100')}>
                        {i < step ? '✓' : i + 1}
                      </span>
                      {s}
                    </button>
                  ))}
                </div>

                <h2 className="mb-5 text-lg font-semibold">{STEPS[step]}</h2>

                {stepBody}

                <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-5">
                  <button type="button"
                    onClick={() => (step === 0 ? (setOpen(false), setStep(0)) : setStep(step - 1))}
                    className="btn-ghost">
                    {step === 0 ? 'Cancel' : 'Back'}
                  </button>
                  {step < STEPS.length - 1 ? (
                    <button type="button" disabled={!stepValid} onClick={() => setStep(step + 1)}
                      className="btn-primary disabled:opacity-40">
                      Continue
                    </button>
                  ) : (
                    <button type="button" disabled={busy} onClick={createMarket} className="btn-primary">
                      {busy ? 'Opening…' : `Create ${form.name}`}
                    </button>
                  )}
                </div>
              </div>
            )}
          </section>

          {/* ---------------- Asking to join ----------------
              A creator can now put their hand up from the markets page. This is
              where the hand goes up. It sits ABOVE the market list because it is
              the only thing on this page with somebody waiting on it. */}
          {joinRequests.length > 0 && (
            <section>
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
                <Icon name="users" className="h-5 w-5 text-brand" />
                Asking to join
                <span className="rounded-full bg-brand px-2 py-0.5 text-xs font-bold text-white">{joinRequests.length}</span>
              </h2>
              <div className="space-y-2">
                {joinRequests.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-card border border-brand/20 bg-brand-tint/25 px-5 py-4">
                    <Avatar src={r.profiles?.photo_url} name={r.profiles?.name} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{r.profiles?.name ?? 'A creator'}</span>
                      <span className="block truncate text-xs text-smoke">
                        {r.communities?.name} · asked {timeAgo(r.created_at)}
                        {r.profiles?.country ? ` · based in ${r.profiles.country}` : ''}
                      </span>
                    </span>
                    <div className="flex shrink-0 gap-2">
                      <button type="button" onClick={() => decideRequest(r, false)}
                        className="rounded-full border border-gray-200 bg-white px-3.5 py-1.5 text-xs font-medium transition-colors hover:border-red-300 hover:text-red-600">
                        Decline
                      </button>
                      <button type="button" onClick={() => decideRequest(r, true)}
                        className="rounded-full bg-brand px-3.5 py-1.5 text-xs font-semibold text-white transition-transform duration-200 hover:scale-105">
                        Accept
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ---------------- Markets ----------------
              The whole row opens the settings, because that is what you came
              here to do. Ethan: "every market clickable straight to its
              settings". The old row had the name going one place and a small
              pill going another, so the obvious target was the wrong one. */}
          <section>
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold">
              <Icon name="flag" className="h-5 w-5 text-brand" /> Markets
            </h2>
            <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-2">
              {live.map((c) => (
                <motion.div key={c.id} variants={listItem}>
                  <Link
                    to={`/manage/${c.slug}`}
                    className="flex flex-wrap items-center gap-3 rounded-card border border-gray-100 bg-white px-5 py-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/40 hover:shadow-card"
                  >
                    <span className="text-lg leading-none" aria-hidden>
                      {(c.country_codes || []).map(flagFromIso).join('') || '🏳️'}
                    </span>
                    <span className="font-medium">{c.name}</span>
                    <span className="text-xs text-smoke">{c.currency}</span>
                    <Badge tone={c.is_active ? 'green' : 'grey'} className="ml-auto shrink-0">
                      {c.is_active ? 'Open' : 'Closed'}
                    </Badge>
                    <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300" />
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          </section>

          {/* ---------------- Retired ----------------
              RETIRING WORKED AND LOOKED LIKE IT HAD NOT. `set_market_retired`
              stamps retired_at and clears is_active - Ethan retired France and
              the row sat in the list exactly as before, so the only reasonable
              conclusion was that the button did nothing. A retired market has to
              LEAVE the list it was in and appear somewhere that says retired,
              or the act has no visible consequence. */}
          {retired.length > 0 && (
            <section>
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-smoke">
                <Icon name="clock" className="h-5 w-5" /> Retired
              </h2>
              <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-2">
                {retired.map((c) => (
                  <motion.div key={c.id} variants={listItem}
                    className="flex flex-wrap items-center gap-3 rounded-card border border-dashed border-gray-200 px-5 py-4">
                    <span className="text-lg leading-none opacity-60" aria-hidden>
                      {(c.country_codes || []).map(flagFromIso).join('') || '🏳️'}
                    </span>
                    <span className="font-medium text-smoke">{c.name}</span>
                    <span className="text-xs text-gray-400">retired {c.retired_at ? timeAgo(c.retired_at) : ''}</span>
                    <div className="ml-auto flex shrink-0 gap-2">
                      <Link to={`/manage/${c.slug}`}
                        className="rounded-full border border-gray-200 px-3 py-1 text-xs font-medium transition-colors hover:border-brand hover:text-brand">
                        Settings
                      </Link>
                      <button type="button" onClick={() => removeMarket(c)}
                        className="rounded-full border border-red-100 px-3 py-1 text-xs font-medium text-red-500 transition-colors hover:border-red-300 hover:bg-red-50">
                        Delete
                      </button>
                    </div>
                  </motion.div>
                ))}
              </motion.div>
            </section>
          )}
        </motion.div>
      </NetworkLayout>
    </NetworkMotion>
  )
}
