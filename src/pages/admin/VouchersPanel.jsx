import { useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Avatar, Badge, CopyButton, EmptyState, Modal, Spinner } from '../../components/ui'
import Icon from '../../components/Icon'
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
//   combined            tick two or more of one creator's unspent vouchers, type the
//                       new code, and they become one ticket worth the sum
//   marked used / not   on the creator's behalf, or to undo a mistaken tick
//   split               undo a combine; the parts need a code each again
//
// A COMBINED VOUCHER IS NOT A MERGED ROW. Each reward keeps its own amount and its
// own challenge, so what a challenge paid out never moves; they share a group and a
// code, and every action here reaches the whole group (see migration 281).

// ONE LIST, THE JOBS FIRST (1 Oct 2026). Ethan: "To hand over" does not make sense - "there's a
// voucher that needs the code. We give the code, and then it's done" - and there should be no
// Not used / Used filters, just All, with what needs doing at the top and the newest first. The
// cards were also "taking up a lot of space". So: a voucher that has not been handed over and one
// handed over with no code are the SAME state, "Needs a code"; the list is one compact card of
// rows, needs-a-code first, then spendable, then used; and combining is a bar that appears once
// two of one creator's vouchers are ticked, in any currency (a mix is worth its euro total).
const STATES = {
  needs_code: { label: 'Needs a code', tone: 'amber' },
  chat: { label: 'Sent by chat', tone: 'grey' },
  ready: { label: 'Ready to spend', tone: 'green' },
  used: { label: 'Used', tone: 'light' },
}
const ORDER = { needs_code: 0, ready: 1, chat: 1, used: 2 }

const stateOf = (t) => {
  if (t.status === 'pending') return 'needs_code'
  if (t.used_at) return 'used'
  if (!t.voucher_code?.trim()) return t.issued_via === 'chat' ? 'chat' : 'needs_code'
  return 'ready'
}

const money = (t) => `${t.converted ? '≈ ' : ''}${formatMoney(t.amount, t.currency)}`
const sumOf = (list) => {
  const total = rewardsTotal(list.flatMap((t) => (t.parts ? t.parts : [t])))
  return `${total.converted ? '≈ ' : ''}${formatMoney(total.amount, total.currency)}`
}

export default function VouchersPanel({ rewards, loading, onChanged, onHandOver }) {
  const [search, setSearch] = useState('')
  const [picked, setPicked] = useState(() => new Set())
  const [editing, setEditing] = useState(null) // a ticket, for its code
  const [combining, setCombining] = useState(null) // { creator, tickets }
  const [done, setDone] = useState(null) // the voucher a combine just made, to show its code
  const [busy, setBusy] = useState(null)

  // A voucher not yet handed over is a ticket that needs its code, drawn in the same list.
  const tickets = useMemo(() => {
    const vouchers = (rewards || []).filter((r) => r.reward_type === 'voucher' && r.source !== 'referral')
    const pending = vouchers.filter((r) => r.status === 'pending').map((r) => ({ ...r, rewardIds: [r.id], parts: null }))
    const given = ticketsOf(vouchers.filter((r) => r.status === 'distributed'))
    const when = (t) => new Date(t.distributed_at || t.created_at || 0).getTime()
    return [...pending, ...given].sort((a, b) => (ORDER[stateOf(a)] - ORDER[stateOf(b)]) || (when(b) - when(a)))
  }, [rewards])

  const counts = useMemo(() => {
    const c = { needs_code: 0, chat: 0, ready: 0, used: 0 }
    for (const t of tickets) c[stateOf(t)] += 1
    return c
  }, [tickets])

  const stat = useMemo(() => ({
    toSpend: rewardsTotal(tickets.filter((t) => ['ready', 'chat', 'needs_code'].includes(stateOf(t)))),
    used: rewardsTotal(tickets.filter((t) => stateOf(t) === 'used')),
  }), [tickets])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    return q ? tickets.filter((t) => (t.profiles?.name || '').toLowerCase().includes(q)) : tickets
  }, [tickets, search])

  // How many combinable vouchers each creator has: a tick box only appears where there is a pair.
  const pickableBy = useMemo(() => {
    const m = new Map()
    for (const t of tickets) if (canPick(t)) m.set(t.creator_id, (m.get(t.creator_id) || 0) + 1)
    return m
  }, [tickets])

  function toggle(t) {
    setPicked((prev) => {
      const next = new Set(prev)
      if (next.has(t.id)) { next.delete(t.id); return next }
      // One creator at a time: a combined voucher is one code on one person's wallet.
      const first = [...prev].map((id) => tickets.find((x) => x.id === id)).find(Boolean)
      if (first && first.creator_id !== t.creator_id) return new Set([t.id])
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
      <div className="mb-4 grid grid-cols-3 gap-2.5">
        {[
          ['Need a code', counts.needs_code, counts.needs_code > 0],
          ['Unspent', money(stat.toSpend), false],
          ['Used', money(stat.used), false],
        ].map(([label, value, warn]) => (
          <div key={label} className="rounded-card border border-gray-100 bg-white px-3.5 py-2.5 shadow-card">
            <p className="truncate text-[10.5px] font-semibold uppercase tracking-wide text-gray-400">{label}</p>
            <p className={cx('mt-0.5 text-lg font-bold tabular-nums', warn ? 'text-brand' : 'text-ink')}>{value}</p>
          </div>
        ))}
      </div>

      <div className="relative mb-4">
        <Icon name="magnifier" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-smoke" />
        <input type="search" className="input !py-2 !pl-9 text-sm" placeholder="Search creators…" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* THE COMBINE BAR, AT THE TOP (2 Oct 2026). Ethan: "I'd rather it show up at the top". It sits
          over the list, sticky under the header, as soon as two of one creator's vouchers are ticked. */}
      {selected.length >= 2 && (
        <div className="sticky top-20 z-20 mb-3 flex flex-wrap items-center gap-3 rounded-card bg-ink px-4 py-3 text-white shadow-lift animate-pop-in">
          <Avatar src={selected[0].profiles?.photo_url} name={selected[0].profiles?.name} size="xs" />
          <p className="min-w-0 flex-1 text-sm">
            <span className="font-semibold">{selected.length} of {selected[0].profiles?.name?.split(' ')[0]}&rsquo;s vouchers</span>
            <span className="text-white/70"> · {sumOf(selected)} together</span>
          </p>
          <button type="button" onClick={() => setPicked(new Set())} className="rounded-lg px-3 py-1.5 text-xs font-semibold text-white/80 hover:text-white">Clear</button>
          <button
            type="button"
            onClick={() => setCombining({ creator: selected[0].profiles, tickets: selected })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-xs font-bold text-white transition-transform hoverable:hover:-translate-y-0.5"
          >
            <Icon name="link" className="h-3.5 w-3.5" /> Combine into one
          </button>
        </div>
      )}

      {loading ? null : shown.length === 0 ? (
        <EmptyState icon={<Icon name="ticket" className="h-7 w-7" />} title="No vouchers here" hint={search ? 'Try a different search.' : 'Vouchers appear here once a challenge awards them.'} />
      ) : (
        <ul className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
          {shown.map((t) => (
            <TicketRow
              key={t.id}
              t={t}
              picked={picked.has(t.id)}
              pickable={canPick(t) && (pickableBy.get(t.creator_id) || 0) >= 2}
              onPick={() => toggle(t)}
              busy={busy === t.id}
              onCode={() => (t.status === 'pending' ? onHandOver(t) : setEditing(t))}
              onUsed={(used) => markUsed(t, used)}
              onSplit={() => split(t)}
            />
          ))}
        </ul>
      )}

      <CodeModal
        ticket={editing}
        onClose={() => setEditing(null)}
        onSave={async (code) => {
          const ok = await run(editing.id, () => supabase.rpc('admin_set_voucher_code', {
            p_reward: editing.id, p_code: code, p_via: null,
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
          if (ok) {
            const parts = combining.tickets.flatMap((t) => (t.parts ? t.parts : [t]))
            const mixed = new Set(parts.map((t) => t.currency || 'EUR')).size > 1
            setDone({
              name: combining.creator?.name,
              code,
              total: mixed ? rewardsTotal(parts).amount : parts.reduce((x, t) => x + Number(t.amount), 0),
              currency: mixed ? 'EUR' : combining.tickets[0]?.currency,
            })
            setCombining(null); setPicked(new Set())
          }
        }}
        busy={busy === 'combine'}
      />
      {/* AND IT SAYS WHAT IT MADE: the one new code, ready to copy and send. */}
      <Modal open={!!done} onClose={() => setDone(null)} title="Combined into one voucher">
        {done && (
          <div className="space-y-5 text-center animate-pop-in">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand text-white shadow-card">
              <Icon name="check" className="h-6 w-6" strokeWidth={2.4} />
            </span>
            <p className="text-sm text-smoke">
              {done.name} now holds <span className="font-semibold text-ink">one {formatMoney(done.total, done.currency)} voucher</span>. Their wallet shows this code:
            </p>
            <div className="flex items-center justify-center gap-2 rounded-xl border border-gray-100 bg-cloud px-4 py-3">
              <code className="font-mono text-lg font-bold tracking-wider text-ink">{done.code}</code>
              <CopyButton value={done.code} label="Copy the code" />
            </div>
            <button type="button" onClick={() => setDone(null)} className="btn-primary w-full">Done</button>
          </div>
        )}
      </Modal>
    </div>
  )
}

const canPick = (t) => t.status === 'distributed' && !t.used_at

function TicketRow({ t, picked, pickable, onPick, busy, onCode, onUsed, onSplit }) {
  const state = stateOf(t)
  const meta = STATES[state]
  const source = t.parts
    ? t.parts.map((p) => p.title).filter(Boolean).join(' + ')
    : t.challenges?.title || (t.source === 'milestone' ? 'Milestone' : 'Not tied to a challenge')
  return (
    <li className={cx('flex items-center gap-3 border-b border-gray-50 px-3 py-2.5 last:border-0 sm:px-4', picked && 'bg-brand-tint/40', state === 'used' && 'opacity-70')}>
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
      <Avatar src={t.profiles?.photo_url} name={t.profiles?.name} size="xs" />
      <div className="min-w-0 flex-1">
        <p className="flex min-w-0 items-center gap-2 text-sm">
          <span className="truncate font-semibold">{t.profiles?.name}</span>
          <span className="shrink-0 font-bold tabular-nums">{money(t)}</span>
          {t.parts && <span className="shrink-0 rounded bg-brand-tint px-1.5 text-[10px] font-bold text-brand">×{t.parts.length}</span>}
        </p>
        <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-smoke">
          <Badge tone={meta.tone}>{meta.label}</Badge>
          {t.voucher_code
            ? <code className="truncate rounded bg-cloud px-1.5 font-mono font-semibold tracking-wider text-ink">{t.voucher_code}</code>
            : <span className="truncate">{source}</span>}
          {t.voucher_code && <CopyButton value={t.voucher_code} label="Copy the code" />}
          {state === 'used' && <span className="shrink-0">· {formatDate(t.used_at)}</span>}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {state === 'needs_code' ? (
          <button type="button" onClick={onCode} className="btn-primary !px-3 !py-1.5 text-xs">Add code</button>
        ) : (
          <>
            {state !== 'used' && (
              <button type="button" onClick={onCode} aria-label={t.voucher_code ? 'Change code' : 'Add code'} title={t.voucher_code ? 'Change code' : 'Add code'} className="flex h-8 w-8 items-center justify-center rounded-lg text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-brand">
                <Icon name="pencil" className="h-3.5 w-3.5" />
              </button>
            )}
            {t.parts && state !== 'used' && (
              <button type="button" onClick={onSplit} disabled={busy} className="rounded-lg px-2 py-1.5 text-xs font-semibold text-smoke hoverable:hover:bg-cloud hoverable:hover:text-ink">Split</button>
            )}
            <button
              type="button"
              onClick={() => onUsed(state !== 'used')}
              disabled={busy}
              title={state === 'used' ? 'Mark not used' : 'Mark used'}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-200 px-2.5 text-xs font-semibold text-ink transition-colors hoverable:hover:border-brand hoverable:hover:text-brand"
            >
              {busy ? <Spinner className="h-3.5 w-3.5" /> : <Icon name={state === 'used' ? 'refresh' : 'check'} className="h-3.5 w-3.5" />}
              <span className="hidden sm:inline">{state === 'used' ? 'Not used' : 'Used'}</span>
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
  const [saving, setSaving] = useState(false)
  return (
    <form onSubmit={async (e) => { e.preventDefault(); setSaving(true); await onSave(code); setSaving(false) }} className="space-y-5">
      <p className="text-sm text-smoke">
        A {formatMoney(ticket.amount, ticket.currency)} voucher for <span className="font-semibold text-ink">{ticket.profiles?.name}</span>.
        {ticket.parts && ' It is a combined voucher, so the new code replaces the code on every part of it.'}
      </p>
      <div>
        <label htmlFor="vc-code" className="label">Voucher code <span className="font-normal text-smoke">(shown to the creator)</span></label>
        <input
          id="vc-code" type="text" className="input font-mono tracking-wider" value={code}
          onChange={(e) => setCode(e.target.value)} placeholder="e.g. TRYP-10-ABCD"
          autoComplete="off" autoCapitalize="characters" spellCheck={false}
        />
      </div>
      {code.trim() && (
        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-smoke">What they will see</p>
          <VoucherTicket reward={{ ...ticket, voucher_code: code.trim(), used_at: null }} />
        </div>
      )}
      <button type="submit" disabled={saving || !code.trim()} className="btn-primary w-full disabled:opacity-60">
        {saving ? <Spinner /> : 'Save'}
      </button>
    </form>
  )
}

function CombineModal({ data, onClose, onSave, busy }) {
  const [code, setCode] = useState('')
  const [note, setNote] = useState('')
  // In one currency the plain sum; across currencies the euro total, like the wallet shows it.
  const parts = data ? data.tickets.flatMap((t) => (t.parts ? t.parts : [t])) : []
  const mixed = new Set(parts.map((t) => t.currency || 'EUR')).size > 1
  const summed = mixed ? rewardsTotal(parts) : null
  const total = data ? (mixed ? summed.amount : parts.reduce((s, t) => s + Number(t.amount), 0)) : 0
  const currency = mixed ? 'EUR' : data?.tickets[0]?.currency
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
                  ...data.tickets[0], amount: total, currency, converted: mixed, voucher_code: code.trim(), used_at: null,
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
