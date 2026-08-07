import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'motion/react'
import { supabase } from '../lib/supabase'
import { useCommunity } from '../context/CommunityContext'
import NetworkLayout, { flagFromIso } from '../components/network/NetworkLayout'
import NetworkMotion from '../components/NetworkMotion'
import Icon from '../components/Icon'
import { Badge, EmptyState } from '../components/ui'
import { notice } from '../lib/confirm'
import { cx } from '../lib/utils'
import { listContainer, listItem, pageFade } from '../lib/motion'

// Network settings: the things that belong to the whole platform rather than to
// one market, plus the door to opening a new one.
//
// Opening a market goes through the `create_market` RPC rather than a series of
// inserts from here. Five things have to be created together (the community, its
// five rooms, its scoring template, its lead and that lead's membership), and a
// half-created market is worse than no market: it looks fine in a list and
// breaks when someone opens it.

const CURRENCIES = ['EUR', 'GBP', 'USD', 'SEK', 'DKK', 'NOK', 'RON', 'PLN', 'CHF']

const SUGGESTIONS = [
  { slug: 'germany',  name: 'Germany',  codes: 'DE',             currency: 'EUR', tz: 'Europe/Berlin' },
  { slug: 'portugal', name: 'Portugal', codes: 'PT',             currency: 'EUR', tz: 'Europe/Lisbon' },
  { slug: 'romania',  name: 'Romania',  codes: 'RO',             currency: 'RON', tz: 'Europe/Bucharest' },
  { slug: 'nordics',  name: 'Nordics',  codes: 'SE, DK, NO, FI, IS', currency: 'EUR', tz: 'Europe/Stockholm' },
  { slug: 'italy',    name: 'Italy',    codes: 'IT',             currency: 'EUR', tz: 'Europe/Rome' },
  { slug: 'poland',   name: 'Poland',   codes: 'PL',             currency: 'PLN', tz: 'Europe/Warsaw' },
]

const BLANK = { slug: '', name: '', codes: '', currency: 'EUR', tz: 'Europe/Madrid', cpm: 0.5, copyFrom: 'spain' }

export default function GlobalSettings() {
  const navigate = useNavigate()
  const { chapters, isGlobalAdmin, reload } = useCommunity()
  const [form, setForm] = useState(BLANK)
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)

  if (!isGlobalAdmin) {
    return (
      <NetworkLayout>
        <EmptyState icon={<Icon name="shield" className="h-6 w-6" />} title="Global admins only"
          hint="Opening and closing markets is a platform action. Running one market does not grant it."
          action={<Link to="/global" className="btn-secondary">Back to Worldwide</Link>} />
      </NetworkLayout>
    )
  }

  async function createMarket(e) {
    e.preventDefault()
    setBusy(true)
    const codes = form.codes.split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
    const { data, error } = await supabase.rpc('create_market', {
      p_slug: form.slug.trim().toLowerCase(),
      p_name: form.name.trim(),
      p_country_codes: codes,
      p_currency: form.currency,
      p_timezone: form.tz,
      p_cpm_target: Number(form.cpm) || 0.5,
      p_copy_rules_from: form.copyFrom || null,
    })
    setBusy(false)
    if (error) { notice(`Could not open the market: ${error.message}`); return }
    await reload()
    setForm(BLANK)
    setOpen(false)
    notice(`${form.name} created with its five rooms and a scoring template. It is CLOSED until you turn it on in its settings.`)
    if (data) navigate(`/manage/${form.slug.trim().toLowerCase()}`)
  }

  return (
    <NetworkMotion>
      <NetworkLayout>
        <motion.div {...pageFade} className="page space-y-8">
          <section>
            <Link to="/global" className="mb-3 inline-flex items-center gap-2 text-sm font-medium text-smoke transition-colors hover:text-brand">
              <Icon name="chevronLeft" className="h-4 w-4" /> Worldwide
            </Link>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Network settings</h1>
            <p className="mt-2 max-w-2xl text-smoke">
              Everything that belongs to the whole platform rather than to one market.
            </p>
          </section>

          {/* ---------------- Markets ---------------- */}
          <section>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Icon name="flag" className="h-5 w-5 text-brand" /> Markets
                </h2>
                <p className="mt-1 text-sm text-smoke">Each has its own rooms, challenges, scoring and settings.</p>
              </div>
              <button onClick={() => setOpen((o) => !o)} className="btn-primary !py-2.5 !px-5">
                <Icon name={open ? 'close' : 'globe'} className="h-4 w-4" />
                {open ? 'Cancel' : 'Open a new market'}
              </button>
            </div>

            {open && (
              <motion.form
                onSubmit={createMarket}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="card mb-5 overflow-hidden"
              >
                <p className="mb-4 text-sm text-smoke">
                  Pick a starting point, or fill it in yourself. The market is created <span className="font-semibold text-ink">closed</span>, so nothing is visible to creators until you turn it on.
                </p>

                <div className="mb-5 flex flex-wrap gap-2">
                  {SUGGESTIONS.filter((s) => !chapters.some((c) => c.slug === s.slug)).map((s) => (
                    <button key={s.slug} type="button"
                      onClick={() => setForm({ ...form, slug: s.slug, name: s.name, codes: s.codes, currency: s.currency, tz: s.tz })}
                      className="rounded-full border border-gray-200 px-3.5 py-1.5 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand">
                      {s.codes.split(',').map((c) => flagFromIso(c.trim())).join('')} {s.name}
                    </button>
                  ))}
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium">Market name</span>
                    <input className="input" required value={form.name} placeholder="Germany"
                      onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium">URL slug</span>
                    <input className="input" required value={form.slug} placeholder="germany"
                      pattern="[a-z0-9-]{2,32}"
                      onChange={(e) => setForm({ ...form, slug: e.target.value })} />
                    <span className="mt-1 block text-xs text-smoke">Lowercase, no spaces. Becomes /c/{form.slug || 'slug'}.</span>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium">Country codes</span>
                    <input className="input" value={form.codes} placeholder="DE"
                      onChange={(e) => setForm({ ...form, codes: e.target.value })} />
                    <span className="mt-1 block text-xs text-smoke">
                      Two letters, comma separated. Suggests this market at signup; never assigns anyone silently.
                    </span>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium">Currency</span>
                    <select className="input" value={form.currency}
                      onChange={(e) => setForm({ ...form, currency: e.target.value })}>
                      {CURRENCIES.map((c) => <option key={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium">Timezone</span>
                    <input className="input" value={form.tz}
                      onChange={(e) => setForm({ ...form, tz: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-medium">Copy scoring rules from</span>
                    <select className="input" value={form.copyFrom}
                      onChange={(e) => setForm({ ...form, copyFrom: e.target.value })}>
                      <option value="">Start with none</option>
                      {chapters.map((c) => <option key={c.id} value={c.slug}>{c.name}</option>)}
                    </select>
                    <span className="mt-1 block text-xs text-smoke">Spain is the reference set: a point per post capped at ten, plus view milestones.</span>
                  </label>
                </div>

                <div className="mt-5 flex items-center gap-3">
                  <button type="submit" disabled={busy} className="btn-primary">
                    {busy ? 'Opening…' : 'Create market'}
                  </button>
                  <p className="text-xs text-smoke">Creates the market, five rooms and a scoring template in one go.</p>
                </div>
              </motion.form>
            )}

            <motion.div variants={listContainer} initial="hidden" animate="show" className="space-y-2">
              {chapters.map((c) => (
                <motion.div key={c.id} variants={listItem}
                  className="flex flex-wrap items-center gap-3 rounded-card border border-gray-100 bg-white px-5 py-4">
                  <span aria-hidden>{(c.country_codes || []).map(flagFromIso).join('')}</span>
                  <Link to={`/c/${c.slug}`} className="font-medium hover:text-brand">{c.name}</Link>
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
