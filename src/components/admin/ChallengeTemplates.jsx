import { useCallback, useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { Avatar, Modal, Skeleton } from '../ui'
import Icon from '../Icon'
import { cx } from '../../lib/utils'
import { PICK_BASE } from '../../lib/pick'
import { confirm, notice, promptText } from '../../lib/confirm'
import { formFromTemplate, templateSummary } from '../../lib/challengeTemplates'
import { useT } from '../../lib/i18n'
import { mdToHtml } from '../../lib/richEditor'

// START FROM THE BEST BRIEF THE PROGRAMME HAS EVER RUN.
//
// Ethan: "rather than admins starting from scratch every time, they can save the
// challenge as a template... I think this should be in a nice UI at the top that
// you scroll horizontally to view and select through them. It should show the
// template name, and the admin profile picture and name that created it."
//
// A HORIZONTAL RAIL AND NOT A DROPDOWN, and the reason is what a template
// actually is. A dropdown of names asks somebody to remember what "September
// hidden gems v2" contained; a rail of cards with a face on them is a
// BOOKSHELF, and the thing you recognise a brief by is usually who wrote it and
// roughly how big it was. It also degrades honestly: one template is one card
// and looks deliberate, where a select with one option looks broken.
//
// PRESSING A CARD DOES NOT APPLY IT. It opens the template and shows what is
// in it. Ethan asked for exactly that - "Clicking on the button should open a
// pop-up where you can see the key details... and then there should be a button
// to click Use this template" - and it is the right shape for a destructive
// action wearing a friendly coat: applying a template OVERWRITES a form the
// admin may have already typed into, so it needs a sentence and a second press
// rather than happening under their finger.

function timeAgo(iso, tr) {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000)
  if (!Number.isFinite(days)) return ''
  if (days <= 0) return tr('today')
  if (days === 1) return tr('yesterday')
  if (days < 30) return `${days}${tr('d ago')}`
  const months = Math.round(days / 30)
  return `${months}${tr('mo ago')}`
}

export default function ChallengeTemplates({ onUse, markets = [] }) {
  const tr = useT()
  const { profile } = useAuth()
  const [rows, setRows] = useState(null)
  const [open, setOpen] = useState(null)
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('challenge_templates')
      .select('id, name, payload, created_at, created_by, community_id, author:profiles!challenge_templates_created_by_fkey(id, name, photo_url)')
      .order('created_at', { ascending: false })
    setRows(data || [])
  }, [])

  useEffect(() => { load() }, [load])

  // WHO MAY DELETE WHAT, ANSWERED THE SAME WAY THE DATABASE ANSWERS IT.
  // This is only ever the button's appearance - the policy on the table is what
  // actually decides - but the two have to agree or an admin is offered a
  // button that fails. Owner and global_admin can remove any of them; everybody
  // else only their own.
  const topTier = profile?.platform_role === 'owner' || profile?.platform_role === 'global_admin'
  const mine = (row) => row.created_by && row.created_by === profile?.id
  const canDelete = (row) => topTier || mine(row)

  const marketName = (id) => markets.find((m) => m.id === id)?.name || null

  async function remove(row) {
    if (!await confirm(
      tr('Delete the template "{name}"? Every admin loses it, and challenges already created from it are untouched.', { name: row.name }),
      { title: tr('Delete template'), confirmLabel: tr('Delete'), danger: true },
    )) return
    setBusy(true)
    const { error } = await supabase.from('challenge_templates').delete().eq('id', row.id)
    setBusy(false)
    if (error) return notice(error.message, { title: tr('Could not delete that') })
    setOpen(null)
    load()
  }

  function use(row) {
    onUse(formFromTemplate(row.payload || {}), row)
    setOpen(null)
  }

  // NOTHING AT ALL UNTIL THERE IS SOMETHING. An empty rail with an
  // explanatory paragraph above every new challenge is a permanent tax on the
  // admin who never uses templates, to advertise a feature to the admin who
  // already knows about it because the button is at the bottom of this form.
  if (rows === null) return <Skeleton className="mb-6 h-[104px] w-full rounded-card" />
  if (rows.length === 0) return null

  return (
    <>
      <section className="mb-7">
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-smoke">
            {tr('Start from a template')}
          </p>
          <p className="text-[11px] text-gray-400">
            {rows.length === 1 ? tr('1 saved') : tr('{n} saved', { n: rows.length })}
          </p>
        </div>

        {/* The rail bleeds to the screen edge on a phone so the last card is
            obviously cut off rather than obviously missing - the cue that tells
            a thumb there is more to the right. `snap-x` makes the flick land on
            a card rather than between two. */}
        <div className="-mx-4 -my-1.5 flex snap-x gap-3 overflow-x-auto px-4 py-1.5 [scrollbar-width:none] sm:-mx-1.5 sm:px-1.5 [&::-webkit-scrollbar]:hidden">
          {rows.map((row) => {
            const summary = templateSummary(row.payload, tr)
            const market = marketName(row.community_id)
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => setOpen(row)}
                className={cx(
                  PICK_BASE,
                  'flex w-[210px] shrink-0 snap-start flex-col justify-between gap-3 rounded-card border border-gray-200 bg-white p-3.5 text-left shadow-card hoverable:hover:border-brand/40',
                )}
              >
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-bold leading-tight text-ink">{row.name}</p>
                  <p className="mt-1 h-4 truncate text-[11px] leading-4 text-smoke">
                    {summary || (market ? tr('Made for {market}', { market }) : tr('A blank start'))}
                  </p>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                  <Avatar src={row.author?.photo_url} name={row.author?.name || '?'} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-smoke">
                    {row.author?.name || tr('A past admin')}
                  </span>
                  <span className="shrink-0 text-[10px] text-gray-400">{timeAgo(row.created_at, tr)}</span>
                </div>
              </button>
            )
          })}
        </div>
      </section>

      <Modal
        open={!!open}
        onClose={() => setOpen(null)}
        title={open?.name || ''}
        wide
      >
        {open && <TemplateDetail
          row={open}
          market={marketName(open.community_id)}
          onUse={() => use(open)}
          onDelete={canDelete(open) ? () => remove(open) : null}
          onBack={() => setOpen(null)}
          busy={busy}
          tr={tr}
        />}
      </Modal>
    </>
  )
}

// WHAT IS IN A TEMPLATE, WITHOUT APPLYING IT TO FIND OUT.
//
// The brief and the rules are rendered as the RICH TEXT they are, in a box that
// scrolls, and not as a `line-clamp` preview. A brief is the thing an admin is
// choosing between templates ON, so showing four lines of it and an ellipsis
// answers the wrong question. It is the same decision the message report card
// made and for the same reason.
function TemplateDetail({ row, market, onUse, onDelete, onBack, busy, tr }) {
  const p = row.payload || {}
  const facts = [
    [tr('How it is won'), p.scoring === 'points' ? tr('Points') : tr('Most views')],
    [tr('Length'), p.format || '—'],
    [tr('Platforms'), (p.platforms || []).join(', ') || '—'],
    [tr('Prizes'), (p.prize_structure || []).length || '—'],
    [tr('Point rules'), (p.point_rules || []).length || '—'],
    [tr('Leaderboards'), (p.groups || []).length || tr('One')],
    [tr('Written for'), market || tr('No market')],
    [tr('Saved by'), row.author?.name || tr('A past admin')],
  ]

  return (
    <div className="space-y-5">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-xl bg-cloud/60 p-4 sm:grid-cols-4">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400">{label}</dt>
            <dd className="truncate text-[13px] font-bold text-ink">{value}</dd>
          </div>
        ))}
      </dl>

      {p.title && (
        <div>
          <p className="label">{tr('Challenge title')}</p>
          <p className="mt-1 text-[15px] font-bold text-ink">{p.title}</p>
        </div>
      )}

      <TextBlock label={tr('The brief')} md={p.description} tr={tr} />
      <TextBlock label={tr('The rules')} md={p.rules} tr={tr} />

      {(p.prize_structure || []).length > 0 && (
        <div>
          <p className="label">{tr('Prizes')}</p>
          <ul className="mt-1.5 divide-y divide-gray-100 rounded-xl border border-gray-100">
            {p.prize_structure.map((prize, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                <span className="shrink-0 font-bold text-smoke">
                  {prize.place ? `#${prize.place}` : tr('Prize')}
                </span>
                <span className="min-w-0 flex-1 truncate text-right font-medium text-ink">{prize.prize || '—'}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(p.point_rules || []).length > 0 && (
        <div>
          <p className="label">{tr('Point rules')}</p>
          <ul className="mt-1.5 divide-y divide-gray-100 rounded-xl border border-gray-100">
            {p.point_rules.map((rule, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-[13px]">
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{rule.label || rule.kind}</span>
                <span className="shrink-0 font-bold text-brand">
                  {rule.points > 0 ? `+${rule.points}` : rule.points}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* IT SAYS WHAT IT WILL NOT DO. An admin about to press "Use this
          template" is entitled to know that the dates are not coming with it -
          otherwise the first thing they do is publish a challenge whose dates
          they never looked at because they assumed it had them. */}
      <p className="rounded-xl bg-brand-tint/50 px-4 py-3 text-[12px] leading-relaxed text-smoke">
        {tr('Dates, the market and the status are never part of a template. Everything above fills in, you set when it runs, and nothing is published until you say so.')}
      </p>

      <div className="flex flex-wrap items-center gap-3 border-t border-gray-100 pt-4">
        <button type="button" onClick={onBack} className="btn-ghost">← {tr('Back')}</button>
        {onDelete && (
          <button type="button" onClick={onDelete} disabled={busy} className="btn-danger !py-2 text-xs">
            <Icon name="trash" className="h-4 w-4" /> {tr('Delete this template')}
          </button>
        )}
        <button type="button" onClick={onUse} disabled={busy} className="btn-primary ml-auto">
          {tr('Use this template')} →
        </button>
      </div>
    </div>
  )
}

// A BRIEF IS STORED AS MARKDOWN AND RENDERED THROUGH `mdToHtml`, exactly as
// ChallengeDetail renders it, onto the `rt-editor` stylesheet those tags are
// already written for. Rendering the stored string as HTML directly would put
// raw asterisks on screen - and it is the same string, so there is no second
// implementation to drift.
//
// `overscroll-contain` stops a thumb that reaches the end of the brief from
// handing the rest of the gesture to the modal behind it.
function TextBlock({ label, md, tr }) {
  if (!md || !String(md).trim()) return null
  return (
    <div>
      <p className="label">{label}</p>
      <div
        className="rt-editor mt-1.5 max-h-44 overflow-y-auto overscroll-contain rounded-xl border border-gray-100 p-3 text-[13px] leading-relaxed text-smoke"
        dangerouslySetInnerHTML={{ __html: mdToHtml(String(md)) }}
        aria-label={label}
        title={tr('Scroll to read all of it')}
      />
    </div>
  )
}

/**
 * The "Save as template" control for the bottom of the challenge form.
 *
 * It is a separate export rather than part of the rail because the two live at
 * opposite ends of a long form and share nothing but the table. Keeping them in
 * one file keeps the table's shape in one place.
 */
export function SaveAsTemplate({ build, communityId, onSaved, disabled }) {
  const tr = useT()
  const { profile } = useAuth()
  const [busy, setBusy] = useState(false)

  async function save() {
    const name = await promptText(
      tr('Give it a name other admins will recognise.'),
      {
        title: tr('Save as template'),
        placeholder: tr('e.g. Monthly hidden gems'),
        confirmLabel: tr('Save template'),
      },
    )
    if (!name) return
    setBusy(true)
    const { error } = await supabase.from('challenge_templates').insert({
      name: name.slice(0, 80),
      created_by: profile?.id,
      community_id: communityId || null,
      payload: build(),
    })
    setBusy(false)
    if (error) return notice(error.message, { title: tr('Could not save that template') })
    await notice(
      tr('Saved. Every admin will see "{name}" at the top of a new challenge.', { name }),
      { title: tr('Template saved') },
    )
    onSaved?.()
  }

  return (
    <button type="button" onClick={save} disabled={busy || disabled} className="btn-secondary">
      <Icon name="copy" className="h-4 w-4" />
      {busy ? tr('Saving…') : tr('Save as template')}
    </button>
  )
}
