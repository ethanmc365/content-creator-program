import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Avatar, Badge, EmptyState, Modal, PageHeader, Skeleton, Spinner, StatCard } from '../../components/ui'
import { formatDate, formatMoney, downloadCsv } from '../../lib/utils'

// Rewards management: every reward across the program. Add new ones,
// mark them distributed (with payment notes), export for accounting.
export default function AdminRewards() {
  const [rewards, setRewards] = useState([])
  const [creators, setCreators] = useState([])
  const [challenges, setChallenges] = useState([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('')
  const [busyId, setBusyId] = useState(null)

  // "Add reward" modal
  const [showAdd, setShowAdd] = useState(false)
  const [adding, setAdding] = useState(false)
  const [newReward, setNewReward] = useState({ creator_id: '', challenge_id: '', reward_type: 'cash', amount: '', payment_notes: '' })

  // "Mark distributed" modal (replaces a flaky window.prompt).
  const [distributing, setDistributing] = useState(null) // the reward being marked
  const [distNotes, setDistNotes] = useState('')

  async function load() {
    const [{ data: r }, { data: c }, { data: ch }] = await Promise.all([
      supabase.from('rewards').select('*, profiles:creator_id(id, name, photo_url), challenges(title)').order('created_at', { ascending: false }),
      supabase.from('profiles').select('id, name').order('name'),
      supabase.from('challenges').select('id, title').order('created_at', { ascending: false }),
    ])
    setRewards(r ?? [])
    setCreators(c ?? [])
    setChallenges(ch ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  // Open the "mark distributed" modal, pre-filling any existing note.
  function openDistribute(reward) {
    setDistributing(reward)
    setDistNotes(reward.payment_notes || 'Bank transfer')
  }

  // Confirm distribution: set status + notes + timestamp.
  // The DB trigger notifies the creator automatically.
  async function confirmDistribute(e) {
    e.preventDefault()
    setBusyId(distributing.id)
    const { error } = await supabase
      .from('rewards')
      .update({ status: 'distributed', payment_notes: distNotes, distributed_at: new Date().toISOString() })
      .eq('id', distributing.id)
    setBusyId(null)
    setDistributing(null)
    if (!error) load()
    else alert(`Could not update: ${error.message}`)
  }

  async function addReward(e) {
    e.preventDefault()
    setAdding(true)
    const { error } = await supabase.from('rewards').insert({
      creator_id: newReward.creator_id,
      challenge_id: newReward.challenge_id || null,
      reward_type: newReward.reward_type,
      amount: Number(newReward.amount),
      currency: 'GBP',
      payment_notes: newReward.payment_notes,
    })
    setAdding(false)
    if (!error) {
      setShowAdd(false)
      setNewReward({ creator_id: '', challenge_id: '', reward_type: 'cash', amount: '', payment_notes: '' })
      load()
    }
  }

  function exportRewards() {
    downloadCsv(
      'tryp-rewards.csv',
      filtered.map((r) => ({
        creator: r.profiles?.name ?? '',
        challenge: r.challenges?.title ?? '',
        type: r.reward_type,
        amount: r.amount,
        currency: r.currency,
        status: r.status,
        payment_notes: r.payment_notes ?? '',
        created: formatDate(r.created_at),
        distributed: r.distributed_at ? formatDate(r.distributed_at) : '',
      }))
    )
  }

  const filtered = useMemo(
    () => rewards.filter((r) => !statusFilter || r.status === statusFilter),
    [rewards, statusFilter]
  )

  const totalPaid = rewards.filter((r) => r.status === 'distributed').reduce((s, r) => s + Number(r.amount), 0)
  const totalPending = rewards.filter((r) => r.status === 'pending').reduce((s, r) => s + Number(r.amount), 0)

  return (
    <div className="page">
      <PageHeader
        title="Rewards"
        subtitle="The program's money trail. Keep it tidy for accounting."
        action={
          <div className="flex gap-2">
            <button onClick={exportRewards} className="btn-secondary">Export CSV ↓</button>
            <button onClick={() => setShowAdd(true)} className="btn-primary">+ Add reward</button>
          </div>
        }
      />

      <div className="mb-10 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Total program spend" value={formatMoney(totalPaid + totalPending)} />
        <StatCard label="Distributed" value={formatMoney(totalPaid)} accent />
        <StatCard label="Pending payout" value={formatMoney(totalPending)} hint={totalPending > 0 ? "Don't keep creators waiting 😉" : 'All settled ✓'} />
      </div>

      <div className="mb-6 flex gap-2">
        {['', 'pending', 'distributed'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={statusFilter === s ? 'btn-primary !py-2 text-xs' : 'btn-secondary !py-2 text-xs'}
          >
            {s === '' ? 'All' : s}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState emoji="💷" title="No rewards here" hint="Add rewards after a challenge closes. Winners first!" />
      ) : (
        <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
          {filtered.map((r) => (
            <div key={r.id} className="flex flex-wrap items-center gap-4 border-b border-gray-50 px-5 py-4 last:border-0 sm:px-7">
              <Avatar src={r.profiles?.photo_url} name={r.profiles?.name} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{r.profiles?.name}</p>
                <p className="truncate text-xs text-smoke">
                  {r.reward_type === 'cash' ? '💷 Cash' : '🎟️ Voucher'}
                  {r.challenges?.title && ` · ${r.challenges.title}`}
                  {r.payment_notes && ` · ${r.payment_notes}`}
                </p>
              </div>
              <span className="font-bold tabular-nums">{formatMoney(r.amount, r.currency)}</span>
              <Badge tone={r.status === 'distributed' ? 'green' : 'amber'}>{r.status}</Badge>
              {r.status === 'pending' && (
                <button onClick={() => openDistribute(r)} disabled={busyId === r.id} className="btn-primary !py-2 text-xs">
                  {busyId === r.id ? <Spinner className="h-4 w-4" /> : 'Mark distributed ✓'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ---------- Add reward modal ---------- */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add a reward">
        <form onSubmit={addReward} className="space-y-5">
          <div>
            <label htmlFor="r-creator" className="label">Creator</label>
            <select id="r-creator" required className="input" value={newReward.creator_id} onChange={(e) => setNewReward({ ...newReward, creator_id: e.target.value })}>
              <option value="">Choose a creator…</option>
              {creators.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label htmlFor="r-challenge" className="label">Challenge <span className="font-normal text-smoke">(optional)</span></label>
            <select id="r-challenge" className="input" value={newReward.challenge_id} onChange={(e) => setNewReward({ ...newReward, challenge_id: e.target.value })}>
              <option value="">Not tied to a challenge</option>
              {challenges.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="r-type" className="label">Type</label>
              <select id="r-type" className="input" value={newReward.reward_type} onChange={(e) => setNewReward({ ...newReward, reward_type: e.target.value })}>
                <option value="cash">Cash (£)</option>
                <option value="voucher">Tryp.com voucher</option>
              </select>
            </div>
            <div>
              <label htmlFor="r-amount" className="label">Amount (£)</label>
              <input id="r-amount" type="number" min="1" step="0.01" required className="input" value={newReward.amount} onChange={(e) => setNewReward({ ...newReward, amount: e.target.value })} placeholder="150" />
            </div>
          </div>
          <div>
            <label htmlFor="r-notes" className="label">Notes <span className="font-normal text-smoke">(optional)</span></label>
            <input id="r-notes" type="text" className="input" value={newReward.payment_notes} onChange={(e) => setNewReward({ ...newReward, payment_notes: e.target.value })} placeholder="e.g. 1st place prize" />
          </div>
          <button type="submit" disabled={adding} className="btn-primary w-full">
            {adding ? <Spinner /> : 'Add reward (pending)'}
          </button>
        </form>
      </Modal>

      {/* ---------- Mark distributed modal ---------- */}
      <Modal open={!!distributing} onClose={() => setDistributing(null)} title="Mark reward as distributed">
        {distributing && (
          <form onSubmit={confirmDistribute} className="space-y-5">
            <p className="text-sm text-smoke">
              Confirming payout of <span className="font-semibold text-ink">{formatMoney(distributing.amount, distributing.currency)}</span>{' '}
              to <span className="font-semibold text-ink">{distributing.profiles?.name}</span>. They'll be notified automatically.
            </p>
            <div>
              <label htmlFor="dist-notes" className="label">Payment notes <span className="font-normal text-smoke">(method, reference)</span></label>
              <input id="dist-notes" type="text" className="input" value={distNotes} onChange={(e) => setDistNotes(e.target.value)} placeholder="e.g. Bank transfer, ref TRYP-001" />
            </div>
            <button type="submit" disabled={busyId === distributing.id} className="btn-primary w-full">
              {busyId === distributing.id ? <Spinner /> : 'Confirm distributed ✓'}
            </button>
          </form>
        )}
      </Modal>
    </div>
  )
}
