import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { Avatar, EmptyState, Modal, Skeleton, Spinner } from '../../ui'
import Icon from '../../Icon'
import { cx } from '../../../lib/utils'
import { confirm, notice } from '../../../lib/confirm'
import { formatAwardDate, sortCertificates, tierOf } from '../../../lib/certificates'
import { Preview } from './CertificateStudio'

// WHO HAS WHAT, AND HANDING ONE OUT.
//
// The list is the answer to "did the automatic award actually fire", which is
// the question an admin has the first time they publish winners after building
// a design - and the only honest way to answer it is to show the rows.
//
// AWARDING BY HAND GOES THROUGH THE RPC, NOT THROUGH AN INSERT. `award_certificate`
// freezes the same `facts` the automatic path freezes and mints the same shape
// of serial. An insert from here would produce a certificate with a different
// shape of facts, which is how two kinds of the same object end up in one table
// and every reader has to handle both.
export default function AwardedList() {
  const [rows, setRows] = useState(null)
  const [designs, setDesigns] = useState([])
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(null)
  const [giving, setGiving] = useState(false)
  // Stamped when the rows land - see the note on `summary`.
  const [loadedAt, setLoadedAt] = useState(0)

  const load = useCallback(async () => {
    const [{ data: awards }, { data: ds }] = await Promise.all([
      supabase.from('certificate_awards')
        .select('*, design:certificate_designs(*), creator:profiles!certificate_awards_profile_id_fkey(id, name, photo_url)')
        .order('awarded_at', { ascending: false })
        .limit(400),
      supabase.from('certificate_designs').select('*').order('name'),
    ])
    setRows(awards || [])
    setDesigns(ds || [])
    setLoadedAt(Date.now())
  }, [])
  useEffect(() => { load() }, [load])

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    const list = sortCertificates(rows || [])
    if (!term) return list
    return list.filter((r) =>
      (r.creator?.name || '').toLowerCase().includes(term)
      || (r.design?.name || '').toLowerCase().includes(term)
      || (r.serial || '').toLowerCase().includes(term)
      || JSON.stringify(r.facts || {}).toLowerCase().includes(term))
  }, [rows, q])

  async function revoke(row) {
    if (!await confirm(
      `Take back the certificate "${row.design?.title}" from ${row.creator?.name}? It disappears from their rewards page and their portfolio.`,
      { title: 'Take it back', confirmLabel: 'Take it back', danger: true },
    )) return
    const { error } = await supabase.from('certificate_awards').delete().eq('id', row.id)
    if (error) return notice(error.message, { title: 'Could not do that' })
    setOpen(null)
    load()
  }

  // WHAT THE LIST IS FOR, ANSWERED BEFORE THE LIST.
  //
  // The question an admin opens this tab with is not "who has what" - it is
  // "did the automatic award actually fire", the first time they publish
  // winners after building a design. A list of rows answers that only if you
  // already know what the answer should look like. Four counts answer it
  // immediately, and the last thirty days is the one that separates "the engine
  // is running" from "there are three old rows in here".
  // `loadedAt` RATHER THAN `Date.now()` IN THE MEMO. The purity lint is right
  // to refuse the second one: a clock read during render makes the value change
  // on a re-render that changed nothing, and "last 30 days" is a window that
  // belongs to the moment the rows were fetched anyway.
  const summary = useMemo(() => {
    const list = rows || []
    const since = loadedAt - 30 * 24 * 3600 * 1000
    return {
      total: list.length,
      creators: new Set(list.map((r) => r.profile_id)).size,
      designs: new Set(list.map((r) => r.design_id).filter(Boolean)).size,
      recent: list.filter((r) => new Date(r.awarded_at).getTime() >= since).length,
    }
  }, [rows, loadedAt])

  if (rows === null) return <Skeleton className="h-96 w-full rounded-card" />

  return (
    <div className="space-y-5">
      {rows.length > 0 && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Awarded', value: summary.total, lead: true },
            { label: summary.creators === 1 ? 'Creator' : 'Creators', value: summary.creators },
            { label: summary.designs === 1 ? 'Design in use' : 'Designs in use', value: summary.designs },
            { label: 'Last 30 days', value: summary.recent },
          ].map((s) => (
            <div
              key={s.label}
              className={cx(
                'rounded-card border p-4',
                s.lead ? 'border-transparent bg-brand text-white' : 'border-gray-100 bg-white shadow-card',
              )}
            >
              <p className={cx('text-2xl font-extrabold leading-none tabular-nums', !s.lead && 'text-ink')}>{s.value}</p>
              <p className={cx(
                'mt-1.5 text-[10px] font-bold uppercase tracking-wider',
                s.lead ? 'text-white/80' : 'text-gray-400',
              )}>
                {s.label}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={() => setGiving(true)} className="btn-primary">
          <Icon name="plus" className="h-4 w-4" /> Award one by hand
        </button>
        <div className="relative min-w-[200px] flex-1">
          <Icon name="magnifier" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search a name, a certificate or a serial"
            className="input !pl-9"
          />
        </div>
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon="trophy"
          title={q ? 'Nothing matches that' : 'Nothing awarded yet'}
          hint={q ? 'Try a creator name or a serial.' : 'Certificates appear here the moment winners are published, a milestone is reached, or you hand one out.'}
        />
      ) : (
        <div className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
          {shown.map((row) => {
            const tier = tierOf(row.design?.tier)
            return (
              <button
                key={row.id}
                type="button"
                onClick={() => setOpen(row)}
                // THE ROW CARRIES THE CERTIFICATE'S OWN ACCENT DOWN ITS LEFT
                // EDGE. With ten accents in the studio, the colour is now the
                // fastest way to tell two designs apart in a list of four
                // hundred - and it is the same mark the creator is holding.
                style={{ borderLeft: `4px solid ${row.design?.accent || tier.accent}` }}
                className="flex w-full items-center gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors last:border-0 hover:bg-cloud/60"
              >
                <Avatar src={row.creator?.photo_url} name={row.creator?.name || '?'} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{row.creator?.name || 'Somebody'}</p>
                  <p className="truncate text-[11px] text-smoke">
                    {row.design?.title || 'Certificate'}
                    {row.facts?.challenge ? ` · ${row.facts.challenge}` : ''}
                  </p>
                </div>
                <span
                  className="hidden shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white sm:inline"
                  style={{ background: row.design?.accent || tier.accent }}
                >
                  {tier.label}
                </span>
                <span className="shrink-0 font-mono text-[10px] tabular-nums text-gray-400">{row.serial}</span>
                <span className="hidden shrink-0 text-[11px] text-gray-400 sm:inline">{formatAwardDate(row.awarded_at)}</span>
              </button>
            )
          })}
        </div>
      )}

      <Modal open={!!open} onClose={() => setOpen(null)} title={open?.creator?.name || ''} wide>
        {open && (
          <div className="space-y-4">
            <Preview design={open.design} facts={{ ...open.facts, serial: open.serial }} width={640} />
            <dl className="grid grid-cols-2 gap-3 rounded-xl bg-cloud/60 p-4 sm:grid-cols-4">
              <Fact label="Certificate" value={open.design?.name} />
              <Fact label="Serial" value={open.serial} />
              <Fact label="Awarded" value={formatAwardDate(open.awarded_at)} />
              <Fact label="Seen by them" value={open.seen_at ? formatAwardDate(open.seen_at) : 'Not yet'} />
            </dl>
            <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
              <button type="button" onClick={() => setOpen(null)} className="btn-ghost">← Back</button>
              <button type="button" onClick={() => revoke(open)} className="btn-danger !py-2 text-xs">
                <Icon name="trash" className="h-4 w-4" /> Take it back
              </button>
            </div>
          </div>
        )}
      </Modal>

      <GiveByHand
        open={giving}
        designs={designs.filter((d) => d.is_active)}
        onClose={() => setGiving(false)}
        onDone={() => { setGiving(false); load() }}
      />
    </div>
  )
}

function Fact({ label, value }) {
  return (
    <div className="min-w-0">
      <dt className="truncate text-[10px] font-semibold uppercase tracking-[0.1em] text-gray-400">{label}</dt>
      <dd className="truncate text-[13px] font-bold text-ink">{value || '—'}</dd>
    </div>
  )
}

function GiveByHand({ open, designs, onClose, onDone }) {
  const [creators, setCreators] = useState([])
  const [q, setQ] = useState('')
  const [design, setDesign] = useState('')
  const [picked, setPicked] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    supabase.from('profiles')
      .select('id, name, photo_url')
      .eq('status', 'active').eq('is_test', false)
      .order('name')
      .then(({ data }) => setCreators(data || []))
  }, [open])

  useEffect(() => { if (!open) { setPicked([]); setQ(''); setDesign('') } }, [open])

  const shown = useMemo(() => {
    const term = q.trim().toLowerCase()
    return term ? creators.filter((c) => c.name.toLowerCase().includes(term)) : creators
  }, [creators, q])

  async function give() {
    if (!design || !picked.length) return
    setBusy(true)
    // One call per creator. `award_certificate` is `on conflict do nothing`, so
    // awarding to somebody who already has it is a no-op rather than an error -
    // which is what makes selecting "everybody" safe to press twice.
    const results = await Promise.all(picked.map((id) =>
      supabase.rpc('award_certificate', { p_design: design, p_profile: id })))
    setBusy(false)
    const failed = results.filter((r) => r.error)
    if (failed.length) return notice(failed[0].error.message, { title: 'Some did not go out' })
    onDone()
  }

  return (
    <Modal open={open} onClose={onClose} title="Award a certificate">
      <div className="space-y-5">
        <div>
          <p className="label">Which certificate</p>
          <select value={design} onChange={(e) => setDesign(e.target.value)} className="input">
            <option value="">Choose one…</option>
            {designs.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
          {designs.length === 0 && (
            <p className="mt-1.5 text-[11px] text-smoke">
              There are no live certificates yet. Build one on the Certificates tab and turn it on.
            </p>
          )}
        </div>

        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3">
            <p className="label !mb-0">Who gets it</p>
            <span className="text-[11px] font-semibold text-brand">
              {picked.length ? `${picked.length} chosen` : 'Nobody yet'}
            </span>
          </div>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name" className="input mb-2" />
          <div className="max-h-64 overflow-y-auto overscroll-contain rounded-xl border border-gray-100">
            {shown.map((c) => {
              const on = picked.includes(c.id)
              return (
                <button key={c.id} type="button"
                  onClick={() => setPicked(on ? picked.filter((id) => id !== c.id) : [...picked, c.id])}
                  className={cx(
                    'flex w-full items-center gap-2.5 border-b border-gray-100 px-3 py-2 text-left last:border-0',
                    on ? 'bg-brand-tint/60' : 'hover:bg-cloud/60',
                  )}>
                  <Avatar src={c.photo_url} name={c.name} size="xs" />
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{c.name}</span>
                  {on && <Icon name="check" className="h-4 w-4 shrink-0 text-brand" />}
                </button>
              )
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-gray-100 pt-4">
          <button type="button" onClick={onClose} className="btn-ghost">Cancel</button>
          <button type="button" onClick={give} disabled={busy || !design || !picked.length}
            className="btn-primary ml-auto disabled:opacity-40">
            {busy ? <Spinner /> : `Award to ${picked.length || 'nobody'}`}
          </button>
        </div>
      </div>
    </Modal>
  )
}
