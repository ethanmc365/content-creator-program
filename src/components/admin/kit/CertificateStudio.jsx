import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../context/AuthContext'
import { EmptyState, Skeleton, Spinner, Toggle } from '../../ui'
import Icon from '../../Icon'
import { cx } from '../../../lib/utils'
import { pickClass } from '../../../lib/pick'
import { confirm, notice, promptText } from '../../../lib/confirm'
import { downloadBlob, snapshotNode } from '../../../lib/domSnapshot'
import CertificateCard, { CERT_W, CERT_H } from '../../certificate/CertificateCard'
import { useFluidWidth } from '../../portfolio/PortfolioDeck'
import {
  ACCENTS, DEFAULT_ACCENT, LAYOUTS, PAPERS, PLACEHOLDERS, TIERS,
  bodyProblem, designStyle, ruleProblem, sampleFacts, tierOf,
} from '../../../lib/certificates'
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

// THE SEAL PICKER AND THE GROUND PICKER ARE BOTH GONE (20 Sep 2026), AND WHAT
// REPLACED THEM IS THE POINT.
//
// Ethan: "I don't like those random icons" and "no need for the sparkle", and
// then, on the whole object, "I want it completely, completely, utterly
// redesigned."
//
// The emblem disc and the starburst went first. What was left was still one
// composition with a wash behind it, and a control offering three washes of one
// page is a control that cannot answer "redesign it". So the axes are now
// LAYOUT (six real compositions), ACCENT (ten) and PAPER (five) - see
// lib/certificates. `emblem` and `pattern` are still written on save so
// existing rows keep their values and nothing that reads them breaks, but
// nothing draws from them any more.
const BLANK = {
  name: '', tier: 'achievement',
  title: 'Certificate of Achievement',
  subtitle: 'Tryp.com Creator Community',
  body: 'for winning {challenge}\nin {market}',
  footnote: '',
  accent: DEFAULT_ACCENT, layout: 'rail', paper: 'paper',
  emblem: 'trophy', pattern: 'plain',
  signature: 'Tryp.com', signature_role: 'Creator Community',
  award_on: 'manual', ranks: [], community_ids: [], milestone_id: null,
  is_active: true,
}

export default function CertificateStudio() {
  const { profile } = useAuth()
  const [rows, setRows] = useState(null)
  const [editing, setEditing] = useState(null)
  // WHAT IT LOOKED LIKE WHEN IT WAS OPENED. Kept beside the working copy so
  // "Back" can tell an edit from a glance - see `close` below. A JSON snapshot
  // rather than a dirty flag: a flag has to be set by every field, and the one
  // field somebody forgets to set it on is the one that loses work.
  const [original, setOriginal] = useState(null)
  const open = (design) => { setOriginal(JSON.stringify(design)); setEditing(design) }
  const [markets, setMarkets] = useState([])
  const [milestones, setMilestones] = useState([])
  // Whether the "start from" gallery is up. Its own state rather than a route,
  // because nothing has been created yet - backing out of it must leave no
  // trace, and a URL that says `?new` after you changed your mind is a trace.
  const [picking, setPicking] = useState(false)

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

  // DUPLICATE, BECAUSE THE SECOND CERTIFICATE IS ALWAYS A VARIANT OF THE FIRST.
  // "Same but for 2nd and 3rd", "same but for Spain". Retyping a body, a
  // signature and a footnote to change one field is the kind of friction that
  // stops an admin making the right number of certificates.
  //
  // IT ARRIVES AS A DRAFT. A copy that is live the instant it is made would
  // start awarding itself against a rule nobody has looked at yet.
  async function duplicate(row) {
    const name = await promptText('What is this one called?', {
      title: 'Duplicate certificate',
      defaultValue: `${row.name} (copy)`,
      confirmLabel: 'Create the copy',
    })
    if (!name) return
    // The row minus the three things that make it THAT row. Listed rather than
    // destructured away, because a destructure of names nobody reads is three
    // lint errors and reads as a mistake.
    const rest = { ...row }
    for (const key of ['id', 'created_at', 'updated_at']) delete rest[key]
    const { error } = await supabase.from('certificate_designs')
      .insert({ ...rest, name: name.slice(0, 80), is_active: false, created_by: profile?.id })
    if (error) return notice(error.message, { title: 'Could not duplicate that' })
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

  // Which starters are NOT already in the list, so the gallery can say so on
  // the tile rather than letting somebody make a second "Challenge winner".
  const existingNames = new Set((rows || []).map((r) => r.name))

  if (rows === null) return <Skeleton className="h-96 w-full rounded-card" />

  if (editing) {
    return (
      <DesignEditor
        design={editing}
        markets={markets}
        milestones={milestones}
        onChange={setEditing}
        onSave={() => save(editing)}
        onCancel={async () => {
          // A DESIGN IS A PAGE OF WORDS SOMEBODY JUST WROTE. Losing it to a
          // mis-tapped Back is the kind of small betrayal that stops people
          // using a builder. Only asks when something actually changed, so the
          // common case - open it, look at it, go back - is still one tap.
          if (original && JSON.stringify(editing) !== original) {
            if (!await confirm(
              'You have changes that are not saved. Leave them behind?',
              { title: 'Unsaved changes', confirmLabel: 'Discard them', danger: true },
            )) return
          }
          setEditing(null)
        }}
        onDelete={editing.id ? () => remove(editing) : null}
      />
    )
  }

  return (
    <div className="space-y-5">
      {/* THE STARTER BUTTON IS GONE, AND THIS IS WHAT IT SHOULD HAVE BEEN.
          Ethan: "the starter button seeming completely useless. You can get rid
          of it or just improve it a lot."

          He is right twice over. It bulk-inserted four rows in one press, which
          is not a decision anybody wants to make blind, and once they existed
          it sat there permanently disabled saying "Starter set added" - a
          control that has spent its entire useful life in one click and then
          becomes furniture. The previous pass made it look refused BEFORE it
          was pressed, which was an honest fix to the wrong thing.

          What an admin actually wants from a starter is to SEE one and take it.
          So "New certificate" opens a gallery of starting points - the blank
          one and the six written starters - each drawn as the real certificate
          at real fidelity, each labelled with what triggers it. Taking one
          opens the editor with its words already in place; nothing is written
          to the database until Save. The button that had one use now has one
          per starter, and the gallery doubles as the demonstration that the
          studio can make six different-looking things. */}
      <button type="button" onClick={() => setPicking(true)} className="btn-primary">
        <Icon name="plus" className="h-4 w-4" /> New certificate
      </button>

      {picking && (
        <StarterGallery
          existingNames={existingNames}
          onPick={(design) => { setPicking(false); open({ ...design, __isNew: true }) }}
          onClose={() => setPicking(false)}
        />
      )}

      {rows.length === 0 ? (
        <EmptyState
          icon="trophy"
          title="No certificates yet"
          hint="Press New certificate to see six ready-made designs - one of each layout, with their award triggers already set - or start from a blank one."
        />
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          {rows.map((row) => (
            <DesignRow
              key={row.id}
              row={row}
              markets={markets}
              onOpen={() => open(row)}
              onDuplicate={() => duplicate(row)}
            />
          ))}
        </div>
      )}
    </div>
  )
}


// A CARD IS NOT A BUTTON WITH BUTTONS IN IT. The whole card used to be one
// `<button>`, and adding Duplicate inside it would have nested an interactive
// element in an interactive element - invalid HTML, and on a phone the inner
// press is swallowed by the outer one about a third of the time. The card is a
// div; the preview and the name are the button that opens it.
function DesignRow({ row, markets, onOpen, onDuplicate }) {
  const tier = tierOf(row.tier)
  const problem = ruleProblem(row)
  const [holder, width] = useFluidWidth(240)
  return (
    <div className={cx(
      'group overflow-hidden rounded-card border border-gray-100 bg-white shadow-card transition-all duration-200',
      'hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/40 hoverable:hover:shadow-lift',
      !row.is_active && 'opacity-60',
    )}>
      {/* FLUID, NOT 520px. This was a hard-coded width and the card it sits in
          is 335px on a phone, so every certificate in the list was cropped at
          64% - the date and the credential id, which live on the right, were
          simply not on screen. A preview that cannot show the whole thing is
          not a preview. Same measurement the editor uses. */}
      <button ref={holder} type="button" onClick={onOpen} className="block w-full text-left">
        <Preview design={row} width={width} />
      </button>
      <div className="flex items-center gap-3 border-t border-gray-100 p-4">
        {/* THE SWATCH IS THE ACCENT, NOT AN ICON IN THE ACCENT. It used to be
            `row.emblem` in a coloured tile, and the certificate stopped drawing
            an emblem three passes ago - so the list was identifying each design
            by the one property of it that no longer appears anywhere on the
            object. Two circles say the two things that DO: what colour it is
            and what it is printed on. */}
        <span
          className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
          style={{ background: row.accent, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.06)' }}
          title={`${layoutName(row)} · ${row.accent}`}
        >
          <span
            className="h-3.5 w-3.5 rounded-full"
            style={{ background: designStyle(row).bg, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.08)' }}
          />
        </span>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <p className="truncate text-sm font-bold text-ink">{row.name}</p>
          <p className="truncate text-[11px] text-smoke">
            {layoutName(row)} · {tier.label} · {triggerText(row, markets)}
          </p>
        </button>
        {/* A RULE THAT CANNOT FIRE SAYS SO ON THE CARD. It is the one fault this
            builder can ship silently: "nobody matches" looks exactly like
            "nobody has qualified yet" until a winner asks where theirs is. */}
        {problem && !row.is_active && (
          <span className="shrink-0 text-[10px] font-bold uppercase tracking-wider text-gray-400">Draft</span>
        )}
        {problem && row.is_active && (
          <span title={problem} className="shrink-0 text-amber-500"><Icon name="alert" className="h-4 w-4" /></span>
        )}
        <button
          type="button"
          onClick={onDuplicate}
          title="Duplicate"
          aria-label={`Duplicate ${row.name}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-cloud hover:text-brand"
        >
          <Icon name="copy" className="h-4 w-4" />
        </button>
        <button type="button" onClick={onOpen} aria-label={`Edit ${row.name}`}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-cloud hover:text-brand">
          <Icon name="pencil" className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}

/** The layout's own name, for a list that has to say what a design IS. */
function layoutName(row) {
  return designStyle(row).layout.label
}

/**
 * THE STARTING POINTS, SHOWN RATHER THAN DESCRIBED.
 *
 * Replaces the "Add 4 starter designs" button - see the note where it used to
 * be. The argument for a gallery over a button is the same argument the studio
 * already makes about its preview: the certificate is a PICTURE, and no amount
 * of naming one ("Podium finish, achievement tier") tells an admin whether they
 * want it. Six tiles at real fidelity do.
 *
 * NOTHING IS WRITTEN HERE. Picking a tile fills the editor and leaves the
 * database alone until Save, which is the difference between choosing a
 * starting point and creating six rows you now have to delete.
 *
 * A starter whose name is already taken is still SHOWN and still takes - it
 * arrives as "Podium finish (2)". Hiding it would mean the range you can see
 * shrinks as you use the studio, and the second copy of a design is a real
 * thing to want (the same award for a different market).
 */
function StarterGallery({ existingNames, onPick, onClose }) {
  return (
    <div className="space-y-4 rounded-card border border-gray-100 bg-white p-5 shadow-card">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-ink">Start from</h3>
          <p className="mt-1 text-[12px] leading-relaxed text-smoke">
            Six ready-made designs, one of each layout, with their award triggers already set.
            Nothing is saved until you press Save on the next screen.
          </p>
        </div>
        <button type="button" onClick={onClose} className="btn-ghost !py-1.5 text-xs">Cancel</button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <BlankTile onPick={onPick} />
        {STARTERS.map((starter) => (
          <StarterTile
            key={starter.name}
            starter={starter}
            taken={existingNames.has(starter.name)}
            onPick={onPick}
          />
        ))}
      </div>
    </div>
  )
}

function BlankTile({ onPick }) {
  return (
    <button
      type="button"
      onClick={() => onPick({ ...BLANK })}
      className="flex min-h-[190px] flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-gray-200 p-6 text-center transition-colors hoverable:hover:border-brand hoverable:hover:bg-brand-tint/40"
    >
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-cloud text-brand">
        <Icon name="plus" className="h-5 w-5" />
      </span>
      <span className="text-sm font-bold text-ink">Blank</span>
      <span className="text-[11px] leading-relaxed text-smoke">
        The Rail layout on white. Write your own words.
      </span>
    </button>
  )
}

function StarterTile({ starter, taken, onPick }) {
  const [holder, width] = useFluidWidth(240)
  // A second copy needs a second name - `certificate_designs.name` is what the
  // list, the awarded tab and every notification identify a design by, and two
  // rows called "Podium finish" is a support question waiting to happen.
  const pick = () => onPick(taken ? { ...starter, name: `${starter.name} (2)`, is_active: false } : { ...starter })
  return (
    <div className="overflow-hidden rounded-card border border-gray-100 shadow-card transition-all duration-200 hoverable:hover:border-brand/40 hoverable:hover:shadow-lift">
      <button ref={holder} type="button" onClick={pick} className="block w-full text-left">
        <Preview design={starter} width={width} />
      </button>
      <div className="flex items-center gap-2 border-t border-gray-100 px-3.5 py-3">
        <button type="button" onClick={pick} className="min-w-0 flex-1 text-left">
          <p className="truncate text-[13px] font-bold text-ink">{starter.name}</p>
          <p className="truncate text-[10.5px] text-smoke">
            {layoutName(starter)} · {triggerText(starter)}
          </p>
        </button>
        {taken && (
          <span
            title="You already have one called this. Taking it makes a second, as a draft."
            className="shrink-0 rounded-md bg-cloud px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider text-smoke"
          >
            In use
          </span>
        )}
      </div>
    </div>
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
export function Preview({ design, facts, width = 520, cardRef }) {
  const shown = facts || sampleFacts(design)
  const scale = width / CERT_W
  return (
    <div style={{ width, height: CERT_H * scale, overflow: 'hidden' }}>
      <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        <CertificateCard design={design} facts={shown} cardRef={cardRef} />
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
  const problem = ruleProblem(design)
  const wording = bodyProblem(design)
  const [card, setCard] = useState(null)
  const [saving, setSaving] = useState(false)

  // A SAMPLE, DOWNLOADED, BEFORE ANYBODY IS AWARDED ONE. The preview is
  // accurate but it is 380 pixels wide inside a browser; what a creator
  // actually posts is a 2000px PNG, and the only way to know the type holds up
  // at that size is to look at one.
  async function sample() {
    if (!card) return
    setSaving(true)
    try {
      const blob = await snapshotNode(card, { scale: 2 })
      if (!blob) throw new Error('empty')
      await downloadBlob(blob, `sample-${(design.name || 'certificate').toLowerCase().replace(/[^a-z0-9]+/g, '-')}.png`)
    } catch {
      notice('That did not render. Try again in a moment.', { title: 'Could not make a sample' })
    }
    setSaving(false)
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* THE PREVIEW IS FIRST IN THE DOM AND STICKY ON A DESKTOP. What this
            screen is for is watching the certificate change, so on a narrow
            screen it is what you see when you arrive, and on a wide one it
            stays put while the form under your thumb scrolls. */}
        <div className="lg:sticky lg:top-24 lg:self-start">
          <div ref={holder} className="overflow-hidden rounded-card border border-gray-100 bg-white p-3 shadow-card">
            <Preview design={design} width={width - 24} cardRef={setCard} />
          </div>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
            <p className="text-[11px] text-gray-400">
              {/* THE EXAMPLE MATCHES THE TRIGGER. A milestone design previews
                  against a milestone, not against a challenge win it can never
                  print. See `sampleFacts`. */}
              Filled in with an example. A real one carries the creator's own name and result.
            </p>
            <button type="button" onClick={sample} disabled={saving || !card}
              className="text-[11px] font-semibold text-brand hover:underline disabled:opacity-40">
              {saving ? 'Rendering…' : 'Download a sample'}
            </button>
          </div>
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
                    onClick={() => set({ tier: t.key })}
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

          {/* THE THREE AXES, IN THE ORDER THEY MATTER.
              Layout first because it decides the most and is the thing that was
              missing; then the accent, which is the loudest single decision;
              then the paper, which is the quietest. Each control shows its
              answer rather than naming it - a row of words reading "Rail,
              Columns, Crest" tells an admin nothing they can act on. */}
          <Section title="How it looks">
            <Field
              label="Layout"
              hint={designStyle(design).layout.hint}
            >
              <div className="grid grid-cols-3 gap-2">
                {LAYOUTS.map((l) => (
                  <button
                    key={l.key}
                    type="button"
                    onClick={() => set({ layout: l.key })}
                    aria-pressed={designStyle(design).layout.key === l.key}
                    title={l.hint}
                    className={cx(
                      'overflow-hidden rounded-xl border-2 bg-white transition-colors',
                      designStyle(design).layout.key === l.key
                        ? 'border-brand' : 'border-gray-200 hoverable:hover:border-brand/40',
                    )}
                  >
                    {/* A THUMBNAIL OF THE REAL CARD, at 96px. Not a diagram of
                        where the bars go: `Preview` is the same component the
                        big preview uses, so a layout can never be advertised
                        here as something it does not draw. It is illegible at
                        this size ON PURPOSE - what you are picking is a shape,
                        and shape is exactly what survives being shrunk. */}
                    <span className="pointer-events-none block">
                      <Preview design={{ ...design, layout: l.key }} width={96} />
                    </span>
                    <span className="block border-t border-gray-100 px-1 py-1 text-[10px] font-semibold text-ink">
                      {l.label}
                    </span>
                  </button>
                ))}
              </div>
            </Field>

            {/* TEN, NOT FIVE, AND NOT A FREE PICKER. Ethan: "improve the accent
                color, because currently we have one, two, three, four orange
                and one black... I want a lot of different colors."

                Four of the five were the same orange because the tiers had all
                been set to it - so the row offered one real choice and four
                copies of it. Ten now, spread around the wheel, and every one
                picked so white type on it is readable at 14px (see
                `readableOn`). Still a fixed set rather than a colour input: a
                free picker lets somebody make a certificate that is not a
                Tryp.com certificate, and pale accents break the layouts that
                set the tier in white ON the accent. */}
            <Field label="Accent" hint={ACCENTS.find((a) => a.hex.toLowerCase() === String(design.accent || '').toLowerCase())?.label}>
              <div className="flex flex-wrap gap-2.5">
                {ACCENTS.map((a) => {
                  const on = String(design.accent || '').toLowerCase() === a.hex.toLowerCase()
                  return (
                    <button
                      key={a.key}
                      type="button"
                      onClick={() => set({ accent: a.hex })}
                      aria-pressed={on}
                      aria-label={a.label}
                      title={a.label}
                      className={cx(
                        'h-9 w-9 rounded-full transition-transform hoverable:hover:scale-110',
                        on && 'scale-110',
                      )}
                      style={{
                        background: a.hex,
                        // An outline OUTSIDE the swatch, so the colour is never
                        // cut into by the thing marking it as chosen.
                        boxShadow: on
                          ? '0 0 0 2px #fff, 0 0 0 4px #1A1A1A'
                          : 'inset 0 0 0 1px rgba(0,0,0,0.08)',
                      }}
                    />
                  )
                })}
              </div>
            </Field>

            {/* THE GROUND, AND THE GLOW IS GONE. Ethan: "I still don't like the
                background color, is that like weirdly goldeny, orangey glow. I
                just don't like that color."

                It was the accent at 14% bled into two corners, which on orange
                is a goldeny glow and on nothing is paper. These are papers: two
                neutrals, a warm one, ONE flat 5% accent tint for somebody who
                does want colour, and near-black. */}
            <Field label="Paper" hint={PAPERS.find((p) => p.key === (design.paper || 'paper'))?.hint}>
              <div className="flex flex-wrap gap-2">
                {PAPERS.map((p) => {
                  const on = (design.paper || 'paper') === p.key
                  const swatch = p.bg || design.accent
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => set({ paper: p.key })}
                      aria-pressed={on}
                      title={p.hint}
                      className={pickClass(on, 'flex items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-semibold')}
                    >
                      <span
                        className="h-3.5 w-3.5 shrink-0 rounded-full"
                        style={{
                          background: p.key === 'tint' ? `${swatch}1f` : swatch,
                          boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.12)',
                        }}
                      />
                      {p.label}
                    </button>
                  )
                })}
              </div>
            </Field>
          </Section>

          <AwardRules design={design} set={set} markets={markets} milestones={milestones} />

          {design.id && <WhoGetsThis design={design} />}

          {[wording, problem].filter(Boolean).map((msg) => (
            <p key={msg} className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-[12px] leading-relaxed text-amber-700">
              <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
              {msg}
            </p>
          ))}

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

// WHO WOULD GET THIS, AND A BUTTON TO GIVE IT TO THEM.
//
// TWO PROBLEMS, ONE PANEL.
//
// The first is confidence. An admin builds a rule - "1st place, every market" -
// and has no way to know whether it means four people or forty until winners
// are next published. `certificate_candidates` answers it before anything is
// written.
//
// The second is the real gap, and it is not obvious until you have shipped a
// design: `award_challenge_certificates_internal` fires on
// `winners_published_at`, so a certificate built TODAY only ever catches
// challenges published after it. The programme has forty-nine finished
// challenges. Without a backfill, the first design an admin makes reaches
// nobody at all, and the only workaround would be re-publishing old winners -
// which re-runs prize awards. See migration 226.
//
// It counts what it will ACTUALLY create, not what matches: `already` comes
// back per row, so the button never promises eleven and make three.
function WhoGetsThis({ design }) {
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)

  const look = useCallback(async () => {
    const { data, error } = await supabase.rpc('certificate_candidates', { p_design: design.id })
    if (error) { setRows([]); return }
    setRows(data || [])
  }, [design.id])

  useEffect(() => { look() }, [look])

  // A design given out by hand has no rule to match on, so there is nothing
  // honest to count. The Awarded tab is where that one is handed out.
  if (design.award_on === 'manual') return null
  if (rows === null) return <Skeleton className="h-24 w-full rounded-card" />

  const fresh = rows.filter((r) => !r.already)
  const have = rows.length - fresh.length

  async function backfill() {
    if (!await confirm(
      `Award "${design.name}" to ${fresh.length} ${fresh.length === 1 ? 'creator' : 'creators'} who already qualify?\n\nThey get it straight away, and it appears on their rewards page and their portfolio.`,
      { title: 'Award to everybody who qualifies', confirmLabel: `Award ${fresh.length}` },
    )) return
    setBusy(true)
    const { data, error } = await supabase.rpc('backfill_certificate_design', { p_design: design.id })
    setBusy(false)
    if (error) return notice(error.message, { title: 'Could not award those' })
    await notice(`${data} awarded.`, { title: 'Done' })
    look()
  }

  return (
    <section className="space-y-3 rounded-card border border-gray-100 bg-white p-5 shadow-card">
      <h3 className="text-sm font-bold text-ink">Who gets this</h3>

      {rows.length === 0 ? (
        <p className="text-[12px] leading-relaxed text-smoke">
          Nobody matches this rule yet. It will be awarded automatically the next time somebody does.
        </p>
      ) : (
        <>
          <p className="text-[12px] leading-relaxed text-smoke">
            <span className="font-bold text-ink">{have}</span> already {have === 1 ? 'has' : 'have'} it.
            {fresh.length > 0 && <> <span className="font-bold text-ink">{fresh.length}</span> more already qualify from past challenges and have not been given it.</>}
          </p>

          <div className="max-h-40 overflow-y-auto overscroll-contain rounded-xl border border-gray-100">
            {rows.slice(0, 60).map((r, i) => (
              <div key={`${r.profile_id}-${i}`} className="flex items-center gap-2 border-b border-gray-50 px-3 py-1.5 text-[12px] last:border-0">
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{r.creator_name}</span>
                <span className="min-w-0 flex-1 truncate text-right text-smoke">{r.challenge_title}</span>
                {r.place && <span className="shrink-0 font-bold text-brand">#{r.place}</span>}
                {r.already && <Icon name="check" className="h-3.5 w-3.5 shrink-0 text-green-500" />}
              </div>
            ))}
          </div>

          {fresh.length > 0 && (
            <button type="button" onClick={backfill} disabled={busy} className="btn-secondary w-full justify-center">
              {busy ? <Spinner /> : `Award to the ${fresh.length} who already qualify`}
            </button>
          )}
        </>
      )}
    </section>
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
