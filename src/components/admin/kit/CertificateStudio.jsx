import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import { EmptyState, Skeleton, Toggle } from '../../ui'
import Icon from '../../Icon'
import { cx } from '../../../lib/utils'
import { pickClass } from '../../../lib/pick'
import { confirm, notice } from '../../../lib/confirm'
import CertificateCard, { CERT_W, CERT_H } from '../../certificate/CertificateCard'
import { useFluidWidth } from '../../portfolio/PortfolioDeck'
import { PLACEHOLDERS, TIERS, tierOf } from '../../../lib/certificates'
import { STARTERS } from './certificateStarters'

// THE CERTIFICATE BUILDER.
//
// Ethan: "on this new admin page you should create a certificate builder for
// admins. Similar to how the invoice generator works, this should be used to
// create custom certificates with custom graphics, titles, descriptions, you
// can start by creating some generic ones I can choose from as examples."
//
// THE PREVIEW IS THE REAL COMPONENT, SCALED. Not a mock-up of one, not a second
// layout that approximates it: `CertificateCard` at its true 1000x707 with a
// CSS transform on it. `lib/domSnapshot` exists in this repo because the
// shareable result used to be re-drawn on a canvas as a second implementation,
// and it drifted - the canvas version had its own bar heights and its own idea
// of what a row looked like. A builder whose preview is a second implementation
// has that bug by construction, and worse: the admin approves the preview and
// the creator receives the other one.
//
// WHAT AN ADMIN CAN AND CANNOT CHANGE, because the limits are the design.
// Words, tier, emblem, ground and accent - and the accent comes from a fixed
// set rather than a colour picker. A free picker would let somebody make a
// certificate that is not a Tryp.com certificate, and the platform rule is
// white-dominant with orange accents. The four tier colours plus a neutral are
// enough to tell four kinds of award apart and no more than that.

const EMBLEMS = ['trophy', 'star', 'flag', 'check', 'sparkles', 'heart', 'globe', 'plane', 'shield', 'ticket', 'chart', 'bulb']
const PATTERNS = [
  { key: 'wash', label: 'Wash', hint: 'A soft diagonal in the accent' },
  { key: 'rays', label: 'Rays', hint: 'A faint starburst behind the seal' },
  { key: 'plain', label: 'Plain', hint: 'White. Prints best' },
]

const BLANK = {
  name: '', tier: 'achievement',
  title: 'Certificate of Achievement',
  subtitle: 'Tryp.com Creator Community',
  body: 'for winning {challenge}\nin {market}',
  footnote: '', accent: '#d94407', emblem: 'trophy', pattern: 'wash',
  signature: '', signature_role: '',
  award_on: 'manual', ranks: [], community_ids: [], milestone_id: null,
  is_active: true,
}

export default function CertificateStudio() {
  const { profile } = useAuth()
  const [rows, setRows] = useState(null)
  const [editing, setEditing] = useState(null)
  const [markets, setMarkets] = useState([])
  const [milestones, setMilestones] = useState([])

  const load = useCallback(async () => {
    const [{ data: designs }, { data: coms }, { data: miles }] = await Promise.all([
      supabase.from('certificate_designs').select('*').order('created_at', { ascending: false }),
      supabase.from('communities').select('id, name, kind').order('kind', { ascending: false }).order('name'),
      supabase.from('milestones').select('id, title').eq('is_active', true).order('sort_order'),
    ])
    setRows(designs || [])
    setMarkets(coms || [])
    setMilestones(miles || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function save(design) {
    const row = { ...design, created_by: design.created_by || profile?.id, updated_at: new Date().toISOString() }
    delete row.__isNew
    const { error } = row.id
      ? await supabase.from('certificate_designs').update(row).eq('id', row.id)
      : await supabase.from('certificate_designs').insert(row)
    if (error) return notice(error.message, { title: 'Could not save that design' })
    setEditing(null)
    load()
  }

  async function remove(row) {
    if (!await confirm(
      `Delete "${row.name}"? Certificates already awarded from it are deleted too, and creators lose them.`,
      { title: 'Delete design', confirmLabel: 'Delete', danger: true },
    )) return
    const { error } = await supabase.from('certificate_designs').delete().eq('id', row.id)
    if (error) return notice(error.message, { title: 'Could not delete that' })
    setEditing(null)
    load()
  }

  // THE STARTERS ARE WRITTEN, NOT GENERATED. Ethan asked for "some generic ones
  // I can choose from as examples", and an example is only useful if it is the
  // thing you would actually have made - so each one is a real award this
  // programme gives, with its trigger already set.
  async function addStarters() {
    const existing = new Set((rows || []).map((r) => r.name))
    const fresh = STARTERS.filter((s) => !existing.has(s.name))
    if (!fresh.length) return notice('They are all here already.', { title: 'Nothing to add' })
    const { error } = await supabase.from('certificate_designs')
      .insert(fresh.map((s) => ({ ...s, created_by: profile?.id })))
    if (error) return notice(error.message, { title: 'Could not add those' })
    load()
  }

  if (rows === null) return <Skeleton className="h-96 w-full rounded-card" />

  if (editing) {
    return (
      <DesignEditor
        design={editing}
        markets={markets}
        milestones={milestones}
        onChange={setEditing}
        onSave={() => save(editing)}
        onCancel={() => setEditing(null)}
        onDelete={editing.id ? () => remove(editing) : null}
      />
    )
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setEditing({ ...BLANK, __isNew: true })} className="btn-primary">
          <Icon name="plus" className="h-4 w-4" /> New certificate
        </button>
        <button type="button" onClick={addStarters} className="btn-secondary">
          <Icon name="sparkles" className="h-4 w-4" /> Add the starter set
        </button>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon="trophy"
          title="No certificates yet"
          hint="Add the starter set to get four that cover most of what the programme gives out, then edit them until they read the way you want."
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {rows.map((row) => (
            <DesignRow key={row.id} row={row} markets={markets} onOpen={() => setEditing(row)} />
          ))}
        </div>
      )}
    </div>
  )
}

// Sample facts for every preview on this page. Real-looking rather than
// "Lorem": an admin judging whether a body line fits needs to see a name and a
// challenge title of plausible length, not "Name" and "Challenge".
export const SAMPLE = {
  name: 'Roxanna Travels',
  challenge: 'Hidden Gems of Your City',
  market: 'UK & Ireland',
  place: 1,
  views: 124500,
  milestone: 'Ten videos',
  date: new Date().toISOString(),
  serial: 'TRYP-2026-K4M9PX',
}

function DesignRow({ row, markets, onOpen }) {
  const tier = tierOf(row.tier)
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cx(
        'group overflow-hidden rounded-card border border-gray-100 bg-white text-left shadow-card transition-all duration-200',
        'hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/40 hoverable:hover:shadow-lift',
        !row.is_active && 'opacity-60',
      )}
    >
      <Preview design={row} width={520} />
      <div className="flex items-center gap-3 border-t border-gray-100 p-4">
        <span
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white"
          style={{ background: row.accent }}
        >
          <Icon name={row.emblem} className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-ink">{row.name}</p>
          <p className="truncate text-[11px] text-smoke">
            {tier.label} · {triggerText(row, markets)}
          </p>
        </div>
        {!row.is_active && <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-gray-400">Draft</span>}
        <Icon name="pencil" className="h-4 w-4 shrink-0 text-gray-300 group-hover:text-brand" />
      </div>
    </button>
  )
}

/** One sentence saying when this certificate is handed out. */
export function triggerText(row, markets = []) {
  const where = row.community_ids?.length
    ? row.community_ids.map((id) => markets.find((m) => m.id === id)?.name).filter(Boolean).join(', ')
    : 'every market'
  if (row.award_on === 'challenge_rank') {
    const places = (row.ranks || []).slice().sort((a, b) => a - b)
    if (!places.length) return 'No places chosen yet, so nobody gets it'
    return `Finishing ${places.map((p) => `#${p}`).join(', ')} in ${where}`
  }
  if (row.award_on === 'challenge_entry') return `Entering any challenge in ${where}`
  if (row.award_on === 'milestone') return row.milestone_id ? 'Reaching a milestone' : 'No milestone chosen yet'
  return 'Given by hand'
}

/**
 * The real certificate, scaled to fit a column.
 *
 * `transform: scale` and a wrapper of the SCALED height. A transform does not
 * affect layout, so without the wrapper the browser still reserves 707px for a
 * card drawn at 368 and every row on this page has a third of a screen of white
 * under it.
 */
export function Preview({ design, facts = SAMPLE, width = 520, cardRef }) {
  const scale = width / CERT_W
  return (
    <div style={{ width, height: CERT_H * scale, overflow: 'hidden' }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <CertificateCard design={design} facts={facts} cardRef={cardRef} />
      </div>
    </div>
  )
}

function DesignEditor({ design, markets, milestones, onChange, onSave, onCancel, onDelete }) {
  const set = (patch) => onChange({ ...design, ...patch })
  // The preview column is fluid and the certificate inside it is not. One
  // implementation of that measurement, shared with the portfolio deck - the
  // inline copy that used to live here had the same latent `useRef` bug the
  // note on `useFluidWidth` describes.
  const [holder, width] = useFluidWidth(260)

  const tier = tierOf(design.tier)
  const canSave = design.name.trim() && design.title.trim()

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* THE PREVIEW IS FIRST IN THE DOM AND STICKY ON A DESKTOP. What this
            screen is for is watching the certificate change, so on a narrow
            screen it is what you see when you arrive, and on a wide one it
            stays put while the form under your thumb scrolls. */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div ref={holder} className="overflow-hidden rounded-card border border-gray-100 bg-white p-3 shadow-card">
            <Preview design={design} width={width - 24} />
          </div>
          <p className="mt-2 text-center text-[11px] text-gray-400">
            Filled in with an example. A real one carries the creator's own name and result.
          </p>
        </div>

        <div className="space-y-6">
          <Section title="What it is">
            <Field label="Name (only admins see this)">
              <input value={design.name} onChange={(e) => set({ name: e.target.value })}
                placeholder="e.g. Challenge winner" className="input" />
            </Field>

            <Field label="Tier" hint={tier.hint}>
              <div className="flex flex-wrap gap-2">
                {TIERS.map((t) => (
                  <button key={t.key} type="button"
                    onClick={() => set({ tier: t.key, accent: t.accent, emblem: t.emblem })}
                    className={pickClass(design.tier === t.key, 'rounded-xl border px-3 py-1.5 text-xs font-semibold')}>
                    {t.label}
                  </button>
                ))}
              </div>
            </Field>
          </Section>

          <Section title="What it says">
            <Field label="Title">
              <input value={design.title} onChange={(e) => set({ title: e.target.value })} className="input" />
            </Field>
            <Field label="Line above the title">
              <input value={design.subtitle} onChange={(e) => set({ subtitle: e.target.value })} className="input" />
            </Field>
            <Field
              label="Body"
              hint="One clause per line. A line whose detail is missing is left out rather than printed half-empty."
            >
              <textarea value={design.body} onChange={(e) => set({ body: e.target.value })}
                rows={3} className="input resize-y font-medium" />
              <Placeholders onInsert={(token) => set({ body: `${design.body}${design.body.endsWith('\n') || !design.body ? '' : ' '}${token}` })} />
            </Field>
            <Field label="Small print (optional)">
              <input value={design.footnote || ''} onChange={(e) => set({ footnote: e.target.value })}
                placeholder="e.g. Verify at tryp.com" className="input" />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Signed by (optional)">
                <input value={design.signature || ''} onChange={(e) => set({ signature: e.target.value })}
                  placeholder="e.g. Ethan Mc Candless" className="input" />
              </Field>
              <Field label="Their role">
                <input value={design.signature_role || ''} onChange={(e) => set({ signature_role: e.target.value })}
                  placeholder="e.g. Creator Community" className="input" />
              </Field>
            </div>
          </Section>

          <Section title="How it looks">
            <Field label="Accent">
              <div className="flex flex-wrap gap-2">
                {[...TIERS.map((t) => t.accent), '#1c1c1c'].map((hex) => (
                  <button key={hex} type="button" onClick={() => set({ accent: hex })}
                    aria-label={hex}
                    className={cx(
                      'h-8 w-8 rounded-full border-2 transition-transform hoverable:hover:scale-110',
                      design.accent === hex ? 'border-ink' : 'border-transparent',
                    )}
                    style={{ background: hex }} />
                ))}
              </div>
            </Field>
            <Field label="Seal">
              <div className="flex flex-wrap gap-2">
                {EMBLEMS.map((name) => (
                  <button key={name} type="button" onClick={() => set({ emblem: name })}
                    aria-label={name}
                    className={cx(
                      'flex h-9 w-9 items-center justify-center rounded-xl border transition-all duration-200 hoverable:hover:scale-105',
                      design.emblem === name ? 'border-brand bg-brand text-white' : 'border-gray-200 text-smoke',
                    )}>
                    <Icon name={name} className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Background">
              <div className="flex flex-wrap gap-2">
                {PATTERNS.map((p) => (
                  <button key={p.key} type="button" onClick={() => set({ pattern: p.key })}
                    title={p.hint}
                    className={pickClass(design.pattern === p.key, 'rounded-xl border px-3 py-1.5 text-xs font-semibold')}>
                    {p.label}
                  </button>
                ))}
              </div>
            </Field>
          </Section>

          <AwardRules design={design} set={set} markets={markets} milestones={milestones} />

          <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-5">
            <button type="button" onClick={onCancel} className="btn-ghost">← Back</button>
            {onDelete && (
              <button type="button" onClick={onDelete} className="btn-danger !py-2 text-xs">
                <Icon name="trash" className="h-4 w-4" /> Delete
              </button>
            )}
            <button type="button" onClick={onSave} disabled={!canSave} className="btn-primary ml-auto disabled:opacity-40">
              Save certificate
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function AwardRules({ design, set, markets, milestones }) {
  const OPTIONS = [
    { key: 'challenge_rank', label: 'Finishing on the podium', hint: 'Given when winners are published' },
    { key: 'challenge_entry', label: 'Entering a challenge', hint: 'Everyone who submitted gets one' },
    { key: 'milestone', label: 'Reaching a milestone', hint: 'Given the moment they reach it' },
    { key: 'manual', label: 'By hand', hint: 'You award it from the Awarded tab' },
  ]
  return (
    <Section title="When it is given">
      <div className="space-y-2">
        {OPTIONS.map((o) => (
          <button key={o.key} type="button" onClick={() => set({ award_on: o.key })}
            aria-pressed={design.award_on === o.key}
            className={pickClass(design.award_on === o.key, 'flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left')}>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{o.label}</span>
              <span className={cx('block text-[11px]', design.award_on === o.key ? 'text-white/80' : 'text-smoke')}>{o.hint}</span>
            </span>
            {design.award_on === o.key && <Icon name="check" className="h-4 w-4 shrink-0" />}
          </button>
        ))}
      </div>

      {design.award_on === 'challenge_rank' && (
        <Field label="Which places" hint="A podium is 1, 2 and 3. Winner only is just 1.">
          <div className="flex flex-wrap gap-2">
            {[1, 2, 3, 4, 5].map((n) => {
              const on = (design.ranks || []).includes(n)
              return (
                <button key={n} type="button"
                  onClick={() => set({ ranks: on ? design.ranks.filter((r) => r !== n) : [...(design.ranks || []), n].sort((a, b) => a - b) })}
                  className={pickClass(on, 'h-10 w-10 rounded-xl border text-sm font-bold')}>
                  {n}
                </button>
              )
            })}
          </div>
        </Field>
      )}

      {design.award_on === 'milestone' && (
        <Field label="Which milestone">
          <select value={design.milestone_id || ''} onChange={(e) => set({ milestone_id: e.target.value || null })} className="input">
            <option value="">Choose one…</option>
            {milestones.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
          </select>
        </Field>
      )}

      {(design.award_on === 'challenge_rank' || design.award_on === 'challenge_entry') && (
        <Field
          label="Which markets"
          hint="Choose none and it covers every market, including any added later. That is usually what you want."
        >
          <div className="flex flex-wrap gap-2">
            {markets.map((m) => {
              const on = (design.community_ids || []).includes(m.id)
              return (
                <button key={m.id} type="button"
                  onClick={() => set({ community_ids: on ? design.community_ids.filter((id) => id !== m.id) : [...(design.community_ids || []), m.id] })}
                  className={pickClass(on, 'rounded-xl border px-3 py-1.5 text-xs font-semibold')}>
                  {m.name}
                </button>
              )
            })}
          </div>
          {(design.community_ids || []).length === 0 && (
            <p className="mt-2 text-[11px] font-semibold text-brand">Every market</p>
          )}
        </Field>
      )}

      <div className="flex items-center justify-between gap-3 rounded-xl bg-cloud/60 px-4 py-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-ink">Live</p>
          <p className="text-[11px] text-smoke">
            A draft is never awarded and creators cannot see it. Turn this on when the wording is right.
          </p>
        </div>
        <Toggle on={design.is_active} onChange={(on) => set({ is_active: on })} label="Live" />
      </div>
    </Section>
  )
}

function Placeholders({ onInsert }) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {PLACEHOLDERS.map((p) => (
        <button key={p.key} type="button" onClick={() => onInsert(`{${p.key}}`)}
          title={`${p.what} - e.g. ${p.example}`}
          className="rounded-md bg-cloud px-2 py-1 font-mono text-[10px] font-semibold text-smoke transition-colors hoverable:hover:bg-brand hoverable:hover:text-white">
          {'{'}{p.key}{'}'}
        </button>
      ))}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <section className="space-y-4 rounded-card border border-gray-100 bg-white p-5 shadow-card">
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      {children}
    </section>
  )
}

function Field({ label, hint, children }) {
  return (
    <div>
      <p className="label">{label}</p>
      {children}
      {hint && <p className="mt-1.5 text-[11px] leading-relaxed text-smoke">{hint}</p>}
    </div>
  )
}
