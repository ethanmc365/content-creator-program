import { useState } from 'react'
import { Modal, Select } from '../ui'
import Icon from '../Icon'
import { cx, formatMoney } from '../../lib/utils'
import { historyMetrics, saveHistory, deleteHistory, PRIZE_TYPES } from '../../lib/challengeHistory'
import { useT } from '../../lib/i18n'

// LOGGING A CHALLENGE THAT DID NOT RUN ON THIS PLATFORM.
//
// It is opened from three places - the log page, the Challenges tab, and the
// per-challenge page a logged challenge opens - and all three are this one
// component writing the same row, so there is no second definition of what a
// logged challenge is.
//
// IT IS DELIBERATELY NOT THE CHALLENGE EDITOR. A `challenges` row is a live
// machine - submissions, a leaderboard, a prize engine that raises real
// invoices. These are AGGREGATES: what it cost, how many entered, how many
// views. Nothing here can pay anybody, and that is the point. See migration 197.
//
// ---------------------------------------------------------------------------
// THE SECOND PASS (8 Sep 2026). Every change below is Ethan's, and the theme
// running through all of them is that the form was a transcription of a
// SPREADSHEET's columns rather than a description of the thing being recorded.
// The import needed all fourteen; a person typing one in does not.
//
//   "It shows up to select a market, and it should say at the top - not 'on a
//    platform' - because if you're logging a challenge it should obviously be
//    one that wasn't done on the platform. If I select 'not on the platform' I
//    can't select the market then, so that's weird."
//   Exactly right, and it was a real trap rather than a wording problem: the
//   market select's EMPTY option was labelled "Not on the platform", so the one
//   thing every row of this form is - off-platform - was spelled as the absence
//   of a market. Choosing it threw away Spain. The sentence moved to the top of
//   the dialog where it belongs, and the empty option now says what it actually
//   means, which is that some of these ran somewhere we have no market for.
//
//   "The status should just be done. We shouldn't be running or planning a
//    challenge, only logging a finished one."   Gone; written as 'done'.
//   "You don't need to choose monthly or express."   Gone; DERIVED from the
//   dates, because the distinction is real (it drives nothing today but it is
//   in every row of the imported sheet) and a start and an end already contain
//   it. Over twenty days is a monthly.
//   "You do see VIP or general - obviously it's a general community for now."
//   Gone; the column keeps whatever the import put there.
//   "I said we're not tracking content type any more. If we're not, remove it."
//   Gone, and the Challenges tab's card was already switched to prize type.
//   "The objective - we don't need that. It's not necessary, we're not
//    tracking that."   Gone.
//   "There should be the ability to delete a challenge, with an added pop up,
//    so clicking delete there should be a second pop up to fully delete it."
//   Below, and it is two DELIBERATE presses rather than two identical dialogs.
//
// WHAT SURVIVED IS WHAT IS ACTUALLY READ SOMEWHERE: the market, the country,
// the title, the two dates, the four numbers every programme average is built
// from, the winner count, the prize type (which the Challenges tab breaks down
// by) and a free note. Nine fields instead of fourteen, and every one of them
// appears on a screen somebody looks at.

// Over twenty days is a monthly; anything shorter is an express. Ethan's own
// rule, and it is the reason the question does not need asking: "express is
// around a week or ten days, over twenty days is monthly."
const MONTHLY_FROM_DAYS = 20
function cadenceFor(startsAt, endsAt) {
  if (!startsAt || !endsAt) return null
  const days = Math.round((new Date(endsAt) - new Date(startsAt)) / 86400000)
  return days > MONTHLY_FROM_DAYS ? 'monthly' : 'express'
}

export default function HistoryForm({ row, markets, userId, onClose, onSaved, onDelete }) {
  const tr = useT()
  const [f, setF] = useState(() => ({
    community_id: row.community_id ?? '',
    country_code: row.country_code ?? '',
    title: row.title ?? '',
    starts_at: row.starts_at ?? '',
    ends_at: row.ends_at ?? '',
    prize_type: row.prize_type ?? 'Cash & Travel voucher',
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
  // THE SECOND PRESS. Not a second dialog on top of this one - a dialog over a
  // dialog is how somebody dismisses both by pressing the scrim - but a panel
  // that replaces the form's buttons with the consequence spelled out and the
  // challenge named. You have to read the title of the thing you are deleting
  // to press the button that deletes it.
  const [confirming, setConfirming] = useState(false)
  const set = (patch) => { setError(''); setF((p) => ({ ...p, ...patch })) }

  // The live preview is the whole reason this is a form and not a spreadsheet
  // row: it shows what the four numbers MEAN as they are typed, so a transposed
  // digit in a view count is visible immediately as an impossible CPM.
  const preview = historyMetrics({
    prize_total: num(f.prize_total), total_views: num(f.total_views),
    creators: num(f.creators), posts: num(f.posts),
    starts_at: f.starts_at, ends_at: f.ends_at,
  })
  const cadence = cadenceFor(f.starts_at, f.ends_at)

  async function submit() {
    if (!f.country_code.trim()) { setError(tr('Which country was this challenge in?')); return }
    if (!f.starts_at || !f.ends_at) { setError(tr('A challenge needs a start and an end date.')); return }
    if (new Date(f.ends_at) < new Date(f.starts_at)) { setError(tr('It cannot end before it starts.')); return }
    setBusy(true)
    const { error: e } = await saveHistory({
      ...f,
      community_id: f.community_id || null,
      // Written rather than asked. See the note on the constants above.
      status: 'done',
      cadence,
      prize_total: num(f.prize_total), winners: num(f.winners),
      total_views: num(f.total_views), creators: num(f.creators), posts: num(f.posts),
    }, userId)
    setBusy(false)
    if (e) { setError(e); return }
    onSaved()
  }

  async function reallyDelete() {
    setBusy(true)
    const { error: e } = await deleteHistory(f.id)
    setBusy(false)
    if (e) { setError(e); return }
    onDelete()
  }

  return (
    <Modal open onClose={onClose} title={row.id ? tr('Edit logged challenge') : tr('Log a challenge')} wide>
      <div className="space-y-5">
        {/* WHAT THIS FORM IS FOR, AT THE TOP, IN ONE SENTENCE. It used to be
            implied by a dropdown option, which is not the same as being said. */}
        <p className="flex items-start gap-2.5 rounded-card border border-brand/20 bg-brand-tint/30 px-4 py-3 text-xs leading-relaxed text-smoke">
          <Icon name="bulb" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
          <span>
            {tr('For a challenge that ran off the platform - on WhatsApp, or before this was built. It joins every programme average; it has no entries, leaderboard or payouts.')}
          </span>
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tr('Market')}>
            <Select
              variant="field"
              inFlow
              ariaLabel={tr('Market')}
              value={f.community_id}
              onChange={(v) => {
                const m = markets.find((x) => x.id === v)
                set({ community_id: v, country_code: f.country_code || (m?.name?.slice(0, 2).toUpperCase() ?? '') })
              }}
              options={[
                // NOT "Not on the platform" ANY MORE. Every row here is off the
                // platform; what this option means is that it ran somewhere no
                // market covers, which is true of several imported rows.
                { value: '', label: tr('Somewhere else') },
                ...markets.map((m) => ({ value: m.id, label: m.name })),
              ]}
            />
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
          <Field
            label={tr('Ended')}
            /* THE DERIVED ANSWER IS SHOWN, NOT HIDDEN. The cadence question was
               removed because the dates already contain it - and something
               removed silently is something the next person re-adds. */
            hint={preview.days ? `${preview.days} ${tr('days')} · ${tr(cadence === 'monthly' ? 'a monthly' : 'an express')}` : undefined}
          >
            <input type="date" className="input" value={f.ends_at} onChange={(e) => set({ ends_at: e.target.value })} />
          </Field>
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

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={tr('Winners')}><Num value={f.winners} onChange={(v) => set({ winners: v })} /></Field>
          <Field label={tr('Prize type')} hint={tr('The Challenges tab breaks the spend down by this.')}>
            <Select
              variant="field"
              inFlow
              ariaLabel={tr('Prize type')}
              value={f.prize_type}
              onChange={(v) => set({ prize_type: v })}
              options={PRIZE_TYPES.map((o) => ({ value: o, label: o }))}
            />
          </Field>
        </div>

        <Field label={tr('Notes')} hint={tr('Anything that explains the numbers.')}>
          <textarea rows={2} className="input resize-none" value={f.notes} onChange={(e) => set({ notes: e.target.value })} />
        </Field>

        {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>}

        {/* ---- THE SECOND PRESS ---- */}
        {confirming ? (
          <div className="rounded-card border border-red-200 bg-red-50/60 p-4">
            <p className="text-sm font-semibold text-red-700">
              {tr('Delete')} “{f.title || f.country_code || tr('this challenge')}”?
            </p>
            <p className="mt-1 text-xs leading-relaxed text-red-600/90">
              {tr('It is removed from the challenge log and from every programme average that counted it. There is no undo.')}
            </p>
            <div className="mt-4 flex flex-col gap-2 sm:flex-row-reverse">
              <button type="button" onClick={reallyDelete} disabled={busy} className="btn-danger flex-1 justify-center">
                {busy ? tr('Deleting…') : tr('Yes, delete it permanently')}
              </button>
              <button type="button" onClick={() => setConfirming(false)} className="btn-secondary flex-1 justify-center">
                {tr('Keep it')}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2 sm:flex-row-reverse">
            <button type="button" onClick={submit} disabled={busy} className="btn-primary flex-1 justify-center">
              {busy ? tr('Saving…') : tr('Save')}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">{tr('Cancel')}</button>
            {/* Only an existing row can be deleted, which is why this asks for
                `onDelete` AND an id rather than either alone. */}
            {onDelete && f.id && (
              <button type="button" onClick={() => setConfirming(true)} className="btn-danger sm:mr-auto">
                {tr('Delete challenge')}
              </button>
            )}
          </div>
        )}
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
