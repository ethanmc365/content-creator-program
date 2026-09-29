import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Avatar, Badge, CopyButton, EmptyState, Modal, Spinner } from '../../components/ui'
import Icon from '../../components/Icon'
import Segmented from '../../components/network/Segmented'
import VoucherTicket from '../../components/VoucherTicket'
import { cx, formatDate, formatMoney } from '../../lib/utils'
import { notice, confirm } from '../../lib/confirm'
import { ticketsOf } from '../../lib/wallet'
import { rewardsTotal } from '../../lib/programme'

// EVERY VOUCHER, IN ONE PLACE, WITH THE THINGS A TEAM ACTUALLY DOES TO ONE.
//
// Ethan: a creator who wins a EUR 10 voucher and then another EUR 10 in the next
// challenge should end up holding ONE EUR 20 voucher; but if they have spent the
// first, that has to be recorded, and a voucher may need re-coding or marking
// used on their behalf. So a voucher here can be:
//
//   given a code        the code is what the creator sees on their ticket
//   marked sent by chat for the old ones that went out by DM before codes lived here
//   combined            tick two or more of one creator's unspent vouchers, type the
//                       new code, and they become one ticket worth the sum
//   marked used / not   on the creator's behalf, or to undo a mistaken tick
//   split               undo a combine; the parts need a code each again
//
// A COMBINED VOUCHER IS NOT A MERGED ROW. Each reward keeps its own amount and its
// own challenge, so what a challenge paid out never moves; they share a group and a
// code, and every action here reaches the whole group (see migration 281).

const STATES = {
  handover: { label: 'To hand over', tone: 'amber' },
  needs_code: { label: 'Needs a code', tone: 'amber' },
  chat: { label: 'Sent by chat', tone: 'grey' },
  ready: { label: 'Ready to spend', tone: 'green' },
  used: { label: 'Used', tone: 'light' },
}

const stateOf = (t) => {
  if (t.status === 'pending') return 'handover'
  if (t.used_at) return 'used'
  if (!t.voucher_code?.trim()) return t.issued_via === 'chat' ? 'chat' : 'needs_code'
  return 'ready'
}

const money = (t) => `${t.converted ? '≈ ' : ''}${formatMoney(t.amount, t.currency)}`

export default function VouchersPanel({ rewards, loading, onChanged, onHandOver }) {
  const [filter, setFilter] = useState('active')
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState(() => new Set())
  const [editing, setEditing] = useState(null) // a ticket, for its code
  const [combining, setCombining] = useState(null) // { creator, tickets }
  const [busy, setBusy] = useState(null)

  // Pending vouchers are not tickets yet - they are jobs - so they sit alongside.
  const tickets = useMemo(() => {
    const vouchers = (rewards || []).filter((r) => r.reward_type === 'voucher' && r.source !== 'referral')
    const pending = vouchers.filter((r) => r.status === 'pending').map((r) => ({ ...r, rewardIds: [r.id], parts: null }))
    const given = ticketsOf(vouchers.filter((r) => r.status === 'distributed'))
    return [...pending, ...given]
  }, [rewards])
  const referralPending = useMemo(
    () => (rewards || []).filter((r) => r.reward_type === 'voucher' && r.source === 'referral' && r.status === 'pending'),
    [rewards],
  )

  const counts = useMemo(() => {
    const c = { active: 0, handover: 0, needs_code: 0, chat: 0, ready: 0, used: 0 }
    for (const t of tickets) {
      const s = stateOf(t)
      c[s] += 1
      if (s !== 'used') c.active += 1
    }
    return c
  }, [tickets])

  const stat = useMemo(() => ({
    toSpend: rewardsTotal(tickets.filter((t) => ['ready', 'chat', 'needs_code'].includes(stateOf(t)))),
    used: rewardsTotal(tickets.filter((t) => stateOf(t) === 'used')),
  }), [tickets])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return tickets.filter((t) => {
      const s = stateOf(t)
      if (filter === 'active' ? s === 'used' : filter !== 'all' && s !== filter) return false
      return !q || (t.profiles?.name || '').toLowerCase().includes(q)
    })
  }, [tickets, filter, search])

  const byCreator = useMemo(() => {
    const m = new Map()
    for (const t of shown) {
      if (!m.has(t.creator_id)) m.set(t.creator_id, { id: t.creator_id, profile: t.profiles, tickets: [] })
      m.get(t.creator_id).tickets.push(t)
    }
    return [...m.values()].sort((a, b) => (a.profile?.name || '').localeCompare(b.profile?.name || ''))
  }, [shown])

  const canPick = (t) => t.status === 'distributed' && !t.used_at
  function toggle(t) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(t.id)) { next.delete(t.id); return next }
      // Only one creator, and one currency, at a time: a combined voucher is one code.
      const first = [...prev].map((id) => tickets.find((x) => x.id === id)).find(Boolean)
      if (first && (first.creator_id !== t.creator_id || first.currency !== t.currency)) return new Set([t.id])
      next.add(t.id)
      return next
    })
  }

  async function run(key, fn) {
    setBusy(key)
    const { error } = await fn()
    setBusy(null)
    if (error) { notice(error.message); return false }
    onChanged()
    return true
  }

  const markUsed = (t, used) => run(t.id, () => supabase.rpc('admin_set_voucher_used', { p_reward: t.id, p_used: used }))
  const split = async (t) => {
    const ok = await confirm(
      'Split this back into separate vouchers? The combined code is removed from each part, so each will need its own code again.',
      { confirmLabel: 'Split them' },
    )
    if (ok) run(t.id, () => supabase.rpc('admin_split_vouchers', { p_reward: t.id }))
  }

  const selected = [...picked].map((id) => tickets.find((t) => t.id === id)).filter(Boolean)

  return (
    <div>
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['To hand over', counts.handover, counts.handover > 0 ? 'amber' : null],
          ['Need a code', counts.needs_code, counts.needs_code > 0 ? 'amber' : null],
          ['Unspent', money(stat.toSpend), null],
          ['Used', money(stat.used), null],
        ].map(([label, value, tone]) => (
          <div key={label} className="rounded-card border border-gray-100 bg-white px-4 py-3 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
            <p className={cx('mt-1 text-xl font-bold tabular-nums', tone === 'amber' ? 'text-amber-600' : 'text-ink')}>{value}</p>
          </div>
        ))}
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="max-w-full overflow-x-auto overscroll-contain [&>*]:w-max">
        <Segmented
          value={filter}
          onChange={(v) => { setFilter(v); setPicked(new Set()) }}
          size="sm"
          label="Which vouchers"
          options={[
            { value: 'active', label: `Not used (${counts.active})` },
            { value: 'handover', label: `To hand over (${counts.handover})` },
            { value: 'needs_code', label: `Needs a code (${counts.needs_code})` },
            { value: 'used', label: `Used (${counts.used})` },
            { value: 'all', label: 'All' },
          ]}
        />
        </div>
        <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
          <Icon name="magnifier" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-smoke" />
          <input type="search" className="input !py-2 !pl-9 text-sm" placeholder="Search creators…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {referralPending.length > 0 && (
        <p className="mb-4 rounded-xl bg-cloud px-4 py-3 text-xs text-smoke">
          {referralPending.length} referral voucher{referralPending.length === 1 ? ' is' : 's are'} waiting to be handed over. They sit under Payouts, in their own section.
        </p>
      )}

      {loading ? null : byCreator.length === 0 ? (
        <EmptyState icon={<Icon name="ticket" className="h-7 w-7" />} title="No vouchers here" hint="Try another filter, or a different search." />
      ) : (
        <div className="space-y-4">
          {byCreator.map((c) => {
            const mine = selected.filter((t) => t.creator_id === c.id)
            return (
              <section key={c.id} className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card animate-fade-up">
                <div className="flex flex-wrap items-center gap-3 border-b border-gray-50 px-4 py-3 sm:px-6">
                  <Avatar src={c.profile?.photo_url} name={c.profile?.name} size="sm" />
                  <p className="min-w-0 flex-1 truncate text-sm font-semibold">{c.profile?.name}</p>
                  {mine.length >= 2 ? (
                    <button
                      type="button"
                      onClick={() => setCombining({ creator: c.profile, tickets: mine })}
                      className="btn-primary !py-1.5 text-xs"
                    >
                      <Icon name="link" className="h-3.5 w-3.5" />
                      Combine {mine.length} into one ({formatMoney(mine.reduce((s, t) => s + Number(t.amount), 0), mine[0].currency)})
                    </button>
                  ) : (
                    c.tickets.filter(canPick).length >= 2 && (
                      <span className="text-[11px] text-gray-400">Tick two or more to combine them</span>
                    )
                  )}
                </div>
                <ul>
                  {c.tickets.map((t) => (
                    <TicketRow
                      key={t.id}
                      t={t}
                      picked={picked.has(t.id)}
                      pickable={canPick(t) && c.tickets.filter(canPick).length >= 2}
                      onPick={() => toggle(t)}
                      busy={busy === t.id}
                      onCode={() => (t.status === 'pending' ? onHandOver(t) : setEditing(t))}
                      onUsed={(used) => markUsed(t, used)}
                      onSplit={() => split(t)}
                    />
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      <CodeModal
        ticket={editing}
        onClose={() => setEditing(null)}
        onSave={async (code, viaChat) => {
          const ok = await run(editing.id, () => supabase.rpc('admin_set_voucher_code', {
            p_reward: editing.id, p_code: viaChat ? '' : code, p_via: viaChat ? 'chat' : null,
          }))
          if (ok) setEditing(null)
        }}
      />
      <CombineModal
        data={combining}
        onClose={() => setCombining(null)}
        onSave={async (code, note) => {
          const ok = await run('combine', () => supabase.rpc('admin_combine_vouchers', {
            p_rewards: combining.tickets.flatMap((t) => t.rewardIds), p_code: code, p_note: note || null,
          }))
          if (ok) { setCombining(null); setPicked(new Set()) }
        }}
        busy={busy === 'combine'}
      />
    </div>
  )
}

function TicketRow({ t, picked, pickable, onPick, busy, onCode, onUsed, onSplit }) {
  const state = stateOf(t)
  const meta = STATES[state]
  const source = t.parts
    ? t.parts.map((p) => p.title).filter(Boolean).join(' + ')
    : t.challenges?.title || (t.source === 'milestone' ? 'Milestone' : t.source === 'referral' ? 'Referral' : 'Not tied to a challenge')
  return (
    <li className={cx('flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-gray-50 px-4 py-3.5 last:border-0 sm:px-6', picked && 'bg-brand-tint/40')}>
      {pickable ? (
        <button
          type="button"
          onClick={onPick}
          aria-pressed={picked}
          aria-label="Select to combine"
          className={cx('flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors', picked ? 'border-brand bg-brand text-white' : 'border-gray-300 hoverable:hover:border-brand')}
        >
          {picked && <Icon name="check" className="h-3 w-3" />}
        </button>
      ) : <span className="w-5 shrink-0" aria-hidden />}

      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          <span className="tabular-nums">{formatMoney(t.amount, t.currency)}</span>
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {t.parts && <Badge tone="brand">Combined ×{t.parts.length}</Badge>}
        </p>
        <p className="truncate text-xs text-smoke">
          {source}
          {t.parts && ` · ${t.parts.map((p) => formatMoney(p.amount, p.currency)).join(' + ')}`}
        </p>
        {t.voucher_code && (
          <p className="mt-1 flex items-center gap-1.5 text-xs">
            <code className="rounded bg-cloud px-1.5 py-0.5 font-mono font-semibold tracking-wider text-ink">{t.voucher_code}</code>
            <CopyButton value={t.voucher_code} label="Copy the code" />
          </p>
        )}
        {state === 'chat' && <p className="mt-1 flex items-center gap-1 text-xs text-smoke"><Icon name="chat" className="h-3.5 w-3.5" /> Sent to them by chat, before codes lived here.</p>}
        {state === 'used' && (
          <p className="mt-1 text-xs text-smoke">
            Used {formatDate(t.used_at)}{t.used_by && t.used_by !== t.creator_id ? ' · marked by the team' : ' · ticked by the creator'}
          </p>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-1.5">
        {state === 'handover' ? (
          <button type="button" onClick={onCode} className="btn-primary !py-1.5 text-xs">Hand over</button>
        ) : (
          <>
            {state !== 'used' && <button type="button" onClick={onCode} className="btn-secondary !py-1.5 text-xs">{t.voucher_code ? 'Change code' : 'Add code'}</button>}
            {t.parts && state !== 'used' && <button type="button" onClick={onSplit} disabled={busy} className="btn-ghost !py-1.5 text-xs">Split</button>}
            <button
              type="button"
              onClick={() => onUsed(state !== 'used')}
              disabled={busy}
              className={cx('inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors', state === 'used' ? 'border-gray-200 text-smoke hoverable:hover:text-ink' : 'border-gray-200 text-ink hoverable:hover:border-brand hoverable:hover:text-brand')}
            >
              {busy ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="check" className="h-3.5 w-3.5" />}
              {state === 'used' ? 'Mark not used' : 'Mark used'}
            </button>
          </>
        )}
      </div>
    </li>
  )
}

function CodeModal({ ticket, onClose, onSave }) {
  return (
    <Modal open={!!ticket} onClose={onClose} title={ticket?.voucher_code ? 'Change the voucher code' : 'Add the voucher code'}>
      {/* Keyed by the ticket, so its fields start from THAT voucher every time. */}
      {ticket && <CodeForm key={ticket.id} ticket={ticket} onSave={onSave} />}
    </Modal>
  )
}

function CodeForm({ ticket, onSave }) {
  const [code, setCode] = useState(ticket.voucher_code || '')
  const [chat, setChat] = useState(false)
  const [saving, setSaving] = useState(false)
  return (
    <form onSubmit={async (e) => { e.preventDefault(); setSaving(true); await onSave(code, chat); setSaving(false) }} className="space-y-5">
      <p className="text-sm text-smoke">
        A {formatMoney(ticket.amount, ticket.currency)} voucher for <span className="font-semibold text-ink">{ticket.profiles?.name}</span>.
        {ticket.parts && ' It is a combined voucher, so the new code replaces the code on every part of it.'}
      </p>
      <div>
        <label htmlFor="vc-code" className="label">Voucher code <span className="font-normal text-smoke">(shown to the creator)</span></label>
        <input
          id="vc-code" type="text" className="input font-mono tracking-wider" value={code} disabled={chat}
          onChange={(e) => setCode(e.target.value)} placeholder="e.g. TRYP-10-ABCD"
          autoComplete="off" autoCapitalize="characters" spellCheck={false}
        />
      </div>
      {code.trim() && !chat && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-smoke">What they will see</p>
          <VoucherTicket reward={{ ...ticket, voucher_code: code.trim(), used_at: null }} />
        </div>
      )}
      <label className="flex cursor-pointer items-start gap-2.5 text-sm text-ink">
        <input type="checkbox" checked={chat} onChange={(e) => setChat(e.target.checked)} className="mt-1 h-4 w-4 accent-[#d94407]" />
        <span>I sent this one by chat instead. <span className="text-smoke">Their ticket will say it was issued by chat, with no code.</span></span>
      </label>
      <button type="submit" disabled={saving || (!chat && !code.trim())} className="btn-primary w-full disabled:opacity-60">
        {saving ? <Spinner /> : 'Save'}
      </button>
    </form>
  )
}

function CombineModal({ data, onClose, onSave, busy }) {
  const [code, setCode] = useState('')
  const [note, setNote] = useState('')
  const total = data ? data.tickets.reduce((s, t) => s + Number(t.amount), 0) : 0
  const currency = data?.tickets[0]?.currency
  return (
    <Modal open={!!data} onClose={onClose} title="Combine into one voucher">
      {data && (
        <form onSubmit={(e) => { e.preventDefault(); onSave(code, note) }} className="space-y-5">
          <p className="text-sm text-smoke">
            {data.creator?.name} will hold <span className="font-semibold text-ink">one {formatMoney(total, currency)} voucher</span> instead of{' '}
            {data.tickets.map((t) => formatMoney(t.amount, t.currency)).join(' and ')}. Issue a new {formatMoney(total, currency)} code for it and type it below.
            Each part keeps its own challenge, so what every challenge paid out does not change.
          </p>
          <div>
            <label htmlFor="cm-code" className="label">The new code</label>
            <input
              id="cm-code" type="text" className="input font-mono tracking-wider" value={code} onChange={(e) => setCode(e.target.value)}
              placeholder="e.g. TRYP-20-ABCD" autoComplete="off" autoCapitalize="characters" spellCheck={false} autoFocus
            />
          </div>
          <div>
            <label htmlFor="cm-note" className="label">Note <span className="font-normal text-smoke">(optional)</span></label>
            <input id="cm-note" type="text" className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Combined at their request" />
          </div>
          {code.trim() && (
            <div>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-smoke">What they will see</p>
              <VoucherTicket
                reward={{
                  ...data.tickets[0], amount: total, voucher_code: code.trim(), used_at: null,
                  parts: data.tickets.map((t) => ({ id: t.id, amount: t.amount, currency: t.currency, title: t.challenges?.title })),
                }}
              />
            </div>
          )}
          <p className="rounded-xl bg-cloud px-4 py-3 text-xs text-smoke">They get one notification saying their vouchers are now one. Any old codes stop being shown.</p>
          <button type="submit" disabled={busy || !code.trim()} className="btn-primary w-full disabled:opacity-60">
            {busy ? <Spinner /> : `Combine into ${formatMoney(total, currency)}`}
          </button>
        </form>
      )}
    </Modal>
  )
}
