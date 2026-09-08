import { useState } from 'react'
import { Modal } from '../ui'
import { cx, formatMoney } from '../../lib/utils'
import { PICK_BASE, PICKED, UNPICKED } from '../../lib/pick'
import {
  CADENCES, COHORTS, CONTENT_TYPES, OBJECTIVES, PRIZE_TYPES, STATUSES,
  historyMetrics, saveHistory,
} from '../../lib/challengeHistory'
import { useT } from '../../lib/i18n'

// LOGGING A CHALLENGE THAT DID NOT RUN ON THIS PLATFORM.
//
// EXTRACTED FROM /admin/challenges/history ON 8 SEP 2026, unchanged except for
// being importable. Ethan: "there also seems to be no way to add challenges.
// Let's say someone still runs a challenge on the WhatsApp community because
// they're just getting started - I need to be able to add this data easily
// rather than having to create an Excel and upload it. Just a simple thing
// where they can add the prize, the views, the creators, the posts, and it
// calculates the CPM and adds it into all the data. Also the ability to fill in
// the other ones, because currently clicking on them just doesn't do anything."
//
// It did exist, on one page, that nothing linked to from the place people
// actually look at challenge numbers. A form reachable only from a URL you have
// to already know is a form that does not exist. It is now opened from three
// places - the log page it came from, the Challenge performance tab, and the
// per-challenge page a logged challenge opens - and all three are the same
// component writing the same row, so there is no second definition of what a
// logged challenge is.
//
// IT IS DELIBERATELY NOT THE CHALLENGE EDITOR. A `challenges` row is a live
// machine - submissions, a leaderboard, a prize engine that raises real
// invoices. These are AGGREGATES: what it cost, how many entered, how many
// views. Nothing here can pay anybody, and that is the point. See migration 197.

// THE FORM. Four numbers matter; everything else has a sensible default.
export default function HistoryForm({ row, markets, userId, onClose, onSaved, onDelete }) {
  const tr = useT()
  const [f, setF] = useState(() => ({
    community_id: row.community_id ?? '',
    country_code: row.country_code ?? '',
    title: row.title ?? '',
    starts_at: row.starts_at ?? '',
    ends_at: row.ends_at ?? '',
    cadence: row.cadence ?? 'monthly',
    cohort: row.cohort ?? 'General',
    prize_type: row.prize_type ?? 'Cash & Travel voucher',
    content_type: row.content_type ?? 'Free',
    objective: row.objective ?? 'Views',
    status: row.status ?? 'done',
    prize_total: row.prize_total ?? '',
    winners: row.winners ?? '',
    total_views: row.total_views ?? '',
    creators: row.creators ?? '',
    posts: row.posts ?? '',
    notes: row.notes ?? '',
    id: row.id,
  }))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const set = (patch) => { setError(''); setF((p) => ({ ...p, ...patch })) }

  // The live preview is the whole reason this is a form and not a spreadsheet
  // row: it shows what the four numbers MEAN as they are typed, so a transposed
  // digit in a view count is visible immediately as an impossible CPM.
  const preview = historyMetrics({
    prize_total: num(f.prize_total), total_views: num(f.total_views),
    creators: num(f.creators), posts: num(f.posts),
    starts_at: f.starts_at, ends_at: f.ends_at,
  })

  async function submit() {
    if (!f.country_code.trim()) { setError('Which country was this challenge in?'); return }
    if (!f.starts_at || !f.ends_at) { setError('A challenge needs a start and an end date.'); return }
    if (new Date(f.ends_at) < new Date(f.starts_at)) { setError('It cannot end before it starts.'); return }
    setBusy(true)
    const { error: e } = await saveHistory({
      ...f,
      community_id: f.community_id || null,
      prize_total: num(f.prize_total), winners: num(f.winners),
      total_views: num(f.total_views), creators: num(f.creators), posts: num(f.posts),
    }, userId)
    setBusy(false)
    if (e) { setError(e); return }
    onSaved()
  }

  return (
    <Modal open onClose={onClose} title={row.id ? tr('Edit logged challenge') : tr('Log a challenge')} wide>
      <div className="space-y-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tr('Market')}>
            <select className="input" value={f.community_id}
              onChange={(e) => {
                const m = markets.find((x) => x.id === e.target.value)
                set({ community_id: e.target.value, country_code: f.country_code || (m?.name?.slice(0, 2).toUpperCase() ?? '') })
              }}>
              <option value="">{tr('Not on the platform')}</option>
              {markets.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </Field>
          <Field label={tr('Country code')} hint={tr('Two letters, e.g. ES')}>
            <input className="input" value={f.country_code} maxLength={3}
              onChange={(e) => set({ country_code: e.target.value.toUpperCase() })} />
          </Field>
        </div>

        <Field label={tr('Title')}>
          <input className="input" value={f.title} placeholder={tr('Spain Monthly · 2026-09')}
            onChange={(e) => set({ title: e.target.value })} />
        </Field>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tr('Started')}>
            <input type="date" className="input" value={f.starts_at} onChange={(e) => set({ starts_at: e.target.value })} />
          </Field>
          <Field label={tr('Ended')}>
            <input type="date" className="input" value={f.ends_at} onChange={(e) => set({ ends_at: e.target.value })} />
          </Field>
        </div>

        <Chips label={tr('Status')} options={STATUSES} value={f.status} onChange={(v) => set({ status: v })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Chips label={tr('Cadence')} options={CADENCES} value={f.cadence} onChange={(v) => set({ cadence: v })} />
          <Chips label={tr('Group')} options={COHORTS} value={f.cohort} onChange={(v) => set({ cohort: v })} />
        </div>

        {/* ---- The four numbers everything is computed from ---- */}
        <div className="rounded-card border border-brand/20 bg-brand-tint/25 p-4">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-brand">{tr('The results')}</p>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label={tr('Prize (EUR)')}><Num value={f.prize_total} onChange={(v) => set({ prize_total: v })} /></Field>
            <Field label={tr('Total views')}><Num value={f.total_views} onChange={(v) => set({ total_views: v })} /></Field>
            <Field label={tr('Creators')}><Num value={f.creators} onChange={(v) => set({ creators: v })} /></Field>
            <Field label={tr('Posts')}><Num value={f.posts} onChange={(v) => set({ posts: v })} /></Field>
          </div>
          {/* LEAVING A BOX EMPTY IS AN ANSWER, and the form says which answer.
              Fourteen imported rows have no view count because nobody ever
              logged one, and the difference between that and zero is the
              difference between an honest average and a wrong one. */}
          <p className="mt-2.5 text-[11px] leading-relaxed text-smoke">
            {tr('Leave a box empty if it was never measured. Empty means "we do not know" and is left out of every average; 0 means "it genuinely got none".')}
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3 border-t border-brand/15 pt-3 sm:grid-cols-4">
            <Derived label={tr('CPM')} value={preview.cpm} money />
            <Derived label={tr('Cost / post')} value={preview.costPerPost} money />
            <Derived label={tr('Views / post')} value={preview.viewsPerPost} />
            <Derived label={tr('Posts / creator')} value={preview.postsPerCreator} decimals={1} />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={tr('Winners')}><Num value={f.winners} onChange={(v) => set({ winners: v })} /></Field>
          <Field label={tr('Prize type')}>
            <select className="input" value={f.prize_type} onChange={(e) => set({ prize_type: e.target.value })}>
              {PRIZE_TYPES.map((o) => <option key={o}>{o}</option>)}
            </select>
          </Field>
          <Field label={tr('Content type')}>
            <select className="input" value={f.content_type} onChange={(e) => set({ content_type: e.target.value })}>
              {CONTENT_TYPES.map((o) => <option key={o}>{o}</option>)}
            </select>
          </Field>
        </div>

        <Field label={tr('Objective')}>
          <select className="input" value={f.objective} onChange={(e) => set({ objective: e.target.value })}>
            {OBJECTIVES.map((o) => <option key={o}>{o}</option>)}
          </select>
        </Field>

        <Field label={tr('Notes')} hint={tr('Anything that explains the numbers.')}>
          <textarea rows={2} className="input resize-none" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>

        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button type="button" onClick={submit} disabled={busy} className="btn-primary flex-1 justify-center">
            {busy ? tr('Saving…') : tr('Save')}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">{tr('Cancel')}</button>
          {onDelete && (
            <button type="button" onClick={onDelete} className="btn-danger sm:mr-auto">{tr('Delete')}</button>
          )}
        </div>
      </div>
    </Modal>
  )
}

const num = (v) => (v === '' || v == null ? null : Number(v))

function Field({ label, hint, children }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-smoke">{hint}</span>}
    </label>
  )
}

function Num({ value, onChange }) {
  return (
    <input
      type="number"
      inputMode="decimal"
      className="input tabular-nums"
      value={value ?? ''}
      placeholder="—"
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function Derived({ label, value, money, decimals = 0 }) {
  const shown = value == null
    ? '—'
    : money
      ? formatMoney(value, 'EUR')
      : value.toLocaleString(undefined, { maximumFractionDigits: decimals })
  return (
    <span className="block">
      <span className={cx('block text-sm font-bold tabular-nums', value == null && 'text-gray-300')}>{shown}</span>
      <span className="block text-[10px] font-semibold uppercase tracking-wide text-gray-400">{label}</span>
    </span>
  )
}

function Chips({ label, options, value, onChange }) {
  return (
    <div>
      <p className="label">{label}</p>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            onClick={() => onChange(o)}
            aria-pressed={value === o}
            className={cx('rounded-full border px-3.5 py-1.5 text-xs font-semibold capitalize',
              PICK_BASE, value === o ? PICKED : UNPICKED)}
          >
            {o}
          </button>
        ))}
      </div>
    </div>
  )
}
