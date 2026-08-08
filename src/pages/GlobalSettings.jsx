import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useCommunity } from '../context/CommunityContext'
import NetworkLayout, { flagFromIso } from '../components/network/NetworkLayout'
import NetworkMotion from '../components/NetworkMotion'
import TrypPlane from '../components/network/TrypPlane'
import Icon from '../components/Icon'
import { Badge, EmptyState } from '../components/ui'
import { notice } from '../lib/confirm'
import { COUNTRIES } from '../lib/countries'
import { cx } from '../lib/utils'
import { listContainer, listItem, pageFade } from '../lib/motion'

// Network settings: the things that belong to the whole platform rather than to
// one market, plus the door to opening a new one.
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

const CURRENCIES = ['EUR', 'GBP', 'USD', 'SEK', 'DKK', 'NOK', 'RON', 'PLN', 'CHF']

const PRESETS = [
  { slug: 'germany', name: 'Germany', codes: ['DE'], currency: 'EUR', tz: 'Europe/Berlin' },
  { slug: 'portugal', name: 'Portugal', codes: ['PT'], currency: 'EUR', tz: 'Europe/Lisbon' },
  { slug: 'romania', name: 'Romania', codes: ['RO'], currency: 'RON', tz: 'Europe/Bucharest' },
  { slug: 'nordics', name: 'Nordics', codes: ['SE', 'DK', 'NO', 'FI', 'IS'], currency: 'EUR', tz: 'Europe/Stockholm' },
  { slug: 'italy', name: 'Italy', codes: ['IT'], currency: 'EUR', tz: 'Europe/Rome' },
  { slug: 'poland', name: 'Poland', codes: ['PL'], currency: 'PLN', tz: 'Europe/Warsaw' },
  { slug: 'france', name: 'France', codes: ['FR'], currency: 'EUR', tz: 'Europe/Paris' },
  { slug: 'benelux', name: 'Benelux', codes: ['NL', 'BE', 'LU'], currency: 'EUR', tz: 'Europe/Amsterdam' },
]

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
  rooms: ['general', 'announcements', 'meetups'],
  lead: '',
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
  const stepValid = [
    form.name.trim().length >= 2 && /^[a-z0-9-]{2,32}$/.test(form.slug) && !slugTaken,
    !!form.currency && !!form.tz,
    true,
    true,
    true,
  ][step]

  async function createMarket() {
    setBusy(true)
    const { error } = await supabase.rpc('create_market', {
      p_slug: form.slug,
      p_name: form.name.trim(),
      p_country_codes: form.codes,
      p_currency: form.currency,
      p_timezone: form.tz,
      p_lead: form.lead || null,
      p_cpm_target: Number(form.cpm) || 0.5,
      p_tagline: form.tagline.trim() || null,
      p_join_policy: form.joinPolicy,
      p_rooms: form.rooms,
      p_open_now: form.openNow,
      p_settings: {},
    })
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

  function applyPreset(p) {
    set({ slug: p.slug, name: p.name, codes: p.codes, currency: p.currency, tz: p.tz })
  }

  // --------------------------------------------------------------- the steps
  const stepBody = [
    // 0 Identity
    <div key="identity" className="space-y-5">
      <div>
        <p className="mb-2 text-sm font-medium">Start from somewhere</p>
        <div className="flex flex-wrap gap-2">
          {PRESETS.filter((p) => !chapters.some((c) => c.slug === p.slug)).map((p) => (
            <button key={p.slug} type="button" onClick={() => applyPreset(p)}
              className="rounded-full border border-gray-200 px-3.5 py-1.5 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand">
              {p.codes.map(flagFromIso).join('')} {p.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Market name">
          <input className="input" value={form.name} placeholder="Germany"
            onChange={(e) => set({
              name: e.target.value,
              // Only auto-slug while the slug is still the machine's guess, so
              // a hand-typed slug is never overwritten mid-sentence.
              slug: !form.slug || form.slug === slugify(form.name) ? slugify(e.target.value) : form.slug,
            })} />
        </Field>
        <Field label="URL slug" hint={
          slugTaken ? 'Taken. Pick another.' : `Becomes /c/${form.slug || 'slug'}`
        }>
          <input className={cx('input', slugTaken && '!border-red-300')} value={form.slug} placeholder="germany"
            onChange={(e) => set({ slug: slugify(e.target.value) })} />
        </Field>
      </div>

      <Field label="Tagline" hint="One line under the market name. Leave blank for a sensible default.">
        <input className="input" value={form.tagline} maxLength={120}
          placeholder="Briefs and challenges for creators across Germany."
          onChange={(e) => set({ tagline: e.target.value })} />
      </Field>

      <div>
        <p className="mb-1.5 text-sm font-medium">Countries</p>
        <p className="mb-2 text-xs text-smoke">
          Decides who is suggested this market at signup, and who may join it under the default access rule.
        </p>
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
                onClick={() => { set({ codes: [...form.codes, c.iso2] }); setCountryQuery('') }}
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
        <Field label="Currency" hint="Prizes and invoices in this market are quoted in it.">
          <select className="input" value={form.currency} onChange={(e) => set({ currency: e.target.value })}>
            {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Timezone" hint="Deadlines land at local midnight in this zone.">
          <input className="input" value={form.tz} onChange={(e) => set({ tz: e.target.value })}
            placeholder="Europe/Berlin" />
        </Field>
      </div>
      <Field label="CPM target" hint="Cost per thousand views this market aims to beat. Admin reporting only, never shown to a creator.">
        <input className="input" inputMode="decimal" value={form.cpm}
          onChange={(e) => set({ cpm: e.target.value.replace(/[^0-9.]/g, '') })} />
      </Field>
      <div>
        <p className="mb-1.5 text-sm font-medium">Market lead</p>
        <p className="mb-2 text-xs text-smoke">
          Becomes a manager of this market: they can edit it, run its challenges and award its points. You can add more later.
        </p>
        <select className="input" value={form.lead} onChange={(e) => set({ lead: e.target.value })}>
          <option value="">Nobody yet</option>
          {admins.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
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
        Rooms are this market&rsquo;s own. Nothing posted in one reaches another market. You can add and rename them later.
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
          <div className="flex justify-between gap-3"><dt className="text-smoke">Lead</dt><dd className="truncate font-medium">{admins.find((a) => a.id === form.lead)?.name || 'Nobody yet'}</dd></div>
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
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Network settings</h1>
            <p className="mt-2 max-w-2xl text-smoke">
              Everything that belongs to the whole platform rather than to one market.
            </p>
          </section>

          {/* ---------------- Open a market ---------------- */}
          <section>
            {!open ? (
              <button onClick={() => setOpen(true)}
                className="relative w-full overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light p-6 text-left text-white shadow-lift transition-transform duration-200 hover:-translate-y-1 sm:p-8">
                <div className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />
                <TrypPlane variant="corner" />
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

                <h2 className="mb-1 text-lg font-semibold">{STEPS[step]}</h2>
                <p className="mb-5 text-sm text-smoke">
                  {['What it is called and where it covers.',
                    'Money, time and who runs it.',
                    'Who gets in, and whether it is visible yet.',
                    'The rooms it starts with.',
                    'One last look before it exists.'][step]}
                </p>

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

          {/* ---------------- Markets ---------------- */}
          <section>
            <div className="mb-4">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Icon name="flag" className="h-5 w-5 text-brand" /> Markets
              </h2>
              <p className="mt-1 text-sm text-smoke">Each has its own rooms, challenges, scoring and settings.</p>
            </div>
            <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-2">
              {chapters.map((c) => (
                <motion.div key={c.id} variants={listItem}
                  className="flex flex-wrap items-center gap-3 rounded-card border border-gray-100 bg-white px-5 py-4">
                  <span aria-hidden>{(c.country_codes || []).map(flagFromIso).join('')}</span>
                  <Link to={`/c/${c.slug}`}
                    className="inline-block origin-left font-medium transition-transform duration-200 hover:scale-105">
                    {c.name}
                  </Link>
                  <span className="text-xs text-smoke">{c.currency}</span>
                  <Badge tone={c.is_active ? 'green' : 'grey'} className="ml-auto shrink-0">
                    {c.is_active ? 'Open' : 'Closed'}
                  </Badge>
                  <Link to={`/manage/${c.slug}`}
                    className={cx('shrink-0 rounded-full border border-gray-200 px-3 py-1 text-xs font-medium',
                      'transition-transform duration-200 hover:scale-105 hover:border-brand hover:text-brand')}>
                    Settings
                  </Link>
                </motion.div>
              ))}
            </motion.div>
          </section>

          {/* ---------------- Worldwide rooms ---------------- */}
          <section>
            <h2 className="flex items-center gap-2 text-lg font-semibold">
              <Icon name="chat" className="h-5 w-5 text-brand" /> Worldwide rooms
            </h2>
            <p className="mt-1 text-sm text-smoke">
              The network-wide conversation. Every creator in every market is in these.
            </p>
            <Link to="/global/chat/general" className="btn-secondary mt-4 !py-2.5">
              <Icon name="chat" className="h-4 w-4" /> Open worldwide rooms
            </Link>
          </section>
        </motion.div>
      </NetworkLayout>
    </NetworkMotion>
  )
}
