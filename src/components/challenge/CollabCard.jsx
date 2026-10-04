import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Avatar, Modal, Skeleton, Spinner } from '../ui'
import Icon from '../Icon'
import { confirm, notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// THE COLLAB BONUS (4 Oct 2026, migration 325).
//
// Ethan: "we can give a bonus point for creators that collab. Not really sure how to go about this, though: how we could track it ...
// maybe just a connection feature where they have to connect with someone, say this on the platform, and then do it."
//
// That is what this is. Two creators who are CONNECTED on the platform make a video together. One of them says so on one of their own
// entries and names the other; the other gets a notification and confirms (they must have an entry in the challenge too, so a
// collab always brings a second creator in); both then earn the collab rule's points. A pair counts once per challenge, the rule's
// maximum caps what one creator can earn, and the team can take a pair out. Nothing here can be claimed alone.
export default function CollabCard({ challenge, rule, submissions, meId }) {
  const tr = useT()
  const [rows, setRows] = useState(undefined)
  const [names, setNames] = useState({})
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('challenge_collabs').select('*').eq('challenge_id', challenge.id).order('created_at', { ascending: false })
    const list = data || []
    setRows(list)
    const ids = [...new Set(list.flatMap((c) => [c.requester_id, c.partner_id]).filter((id) => id !== meId))]
    if (ids.length) {
      const { data: ps } = await supabase.from('profiles').select('id, name, photo_url').in('id', ids)
      setNames(Object.fromEntries((ps || []).map((p) => [p.id, p])))
    }
  }, [challenge.id, meId])
  useEffect(() => { load() }, [load])

  const points = Number(rule.points) || 0
  const mine = (rows || []).filter((c) => c.status !== 'declined')
  const toAnswer = mine.filter((c) => c.status === 'asked' && c.partner_id === meId)
  const earned = mine.filter((c) => c.status === 'confirmed')
  const waiting = mine.filter((c) => c.status === 'asked' && c.requester_id === meId)
  const myEntries = useMemo(() => (submissions || []).filter((s) => s.creator_id === meId), [submissions, meId])
  const canClaim = challenge.status === 'active'

  async function respond(c, accept) {
    setBusy(c.id)
    try {
      await supabase.rpc('collab_respond', { p_id: c.id, p_accept: accept }).then(({ error }) => { if (error) throw new Error(error.message) })
      toastSuccess(accept ? tr('Confirmed. You both earn the points.') : tr('Declined.'))
      load()
    } catch (e) { notice(e.message) } finally { setBusy('') }
  }
  async function cancel(c) {
    if (!await confirm(tr('Take this request back?'), { confirmLabel: tr('Take it back') })) return
    await supabase.rpc('collab_cancel', { p_id: c.id }); load()
  }
  const who = (c) => names[c.requester_id === meId ? c.partner_id : c.requester_id]

  return (
    <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-tint text-brand"><Icon name="users" className="h-[18px] w-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-ink">{tr('Collab bonus')}</h2>
          <p className="text-xs text-smoke">{tr('Make a video with a creator you are connected to and you both earn +{n} points.', { n: points })}</p>
        </div>
        <span className="shrink-0 rounded-full bg-brand px-2.5 py-1 text-xs font-bold tabular-nums text-white">+{points}</span>
      </div>

      {rows === undefined ? <Skeleton className="mt-3 h-12 w-full rounded-xl" /> : (
        <>
          {toAnswer.length > 0 && (
            <ul className="mt-3 space-y-2">
              {toAnswer.map((c) => {
                const p = who(c)
                return (
                  <li key={c.id} className="rounded-xl border border-brand/25 bg-brand-tint/40 p-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar src={p?.photo_url} name={p?.name || '?'} size="sm" />
                      <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-ink">{tr('{n} says you made a video together', { n: p?.name || tr('A creator') })}</p>
                    </div>
                    <div className="mt-2.5 flex gap-2">
                      <button type="button" disabled={busy === c.id} onClick={() => respond(c, true)} className="btn-primary flex-1 justify-center !py-2 text-xs">{busy === c.id ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.4} />}{tr('Yes, confirm')}</button>
                      <button type="button" disabled={busy === c.id} onClick={() => respond(c, false)} className="btn-secondary flex-1 justify-center !py-2 text-xs">{tr('Not me')}</button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {earned.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {earned.map((c) => {
                const p = who(c)
                return (
                  <li key={c.id} className="flex items-center gap-2.5 rounded-xl bg-cloud/60 px-3 py-2">
                    <Avatar src={p?.photo_url} name={p?.name || '?'} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{tr('With {n}', { n: p?.name || tr('a creator') })}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-brand"><Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.6} />+{points}</span>
                  </li>
                )
              })}
            </ul>
          )}

          {waiting.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {waiting.map((c) => {
                const p = who(c)
                return (
                  <li key={c.id} className="flex items-center gap-2.5 rounded-xl border border-dashed border-gray-200 px-3 py-2">
                    <Avatar src={p?.photo_url} name={p?.name || '?'} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-smoke">{tr('Waiting for {n} to confirm', { n: p?.name || tr('them') })}</span>
                    <button type="button" onClick={() => cancel(c)} className="shrink-0 text-[11px] font-semibold text-smoke hover:text-red-500">{tr('Cancel')}</button>
                  </li>
                )
              })}
            </ul>
          )}

          {canClaim && (
            <button type="button" onClick={() => setAsking(true)} disabled={myEntries.length === 0} className="btn-secondary mt-3 w-full justify-center !py-2.5 text-sm disabled:opacity-60">
              <Icon name="plus" className="h-4 w-4" strokeWidth={2.4} />{tr('I made a video with someone')}
            </button>
          )}
          {canClaim && myEntries.length === 0 && <p className="mt-1.5 text-center text-[11px] text-smoke">{tr('Add your own entry first, then claim the collab on it.')}</p>}
        </>
      )}

      {asking && <AskModal challenge={challenge} entries={myEntries} submissions={submissions} meId={meId} taken={mine} onClose={() => setAsking(false)} onDone={() => { setAsking(false); load() }} />}
    </section>
  )
}

/** Pick which of your entries it was, then who you made it with: only people you are connected to who have entered too. */
function AskModal({ challenge, entries, submissions, meId, taken, onClose, onDone }) {
  const tr = useT()
  const [entry, setEntry] = useState(entries[0]?.id || '')
  const [friends, setFriends] = useState(undefined)
  const [partner, setPartner] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    supabase.from('connections').select('creator_id, connected_creator_id').eq('status', 'accepted').or(`creator_id.eq.${meId},connected_creator_id.eq.${meId}`)
      .then(async ({ data }) => {
        const ids = [...new Set((data || []).map((c) => (c.creator_id === meId ? c.connected_creator_id : c.creator_id)))]
        if (!ids.length) { if (alive) setFriends([]); return }
        const { data: ps } = await supabase.from('profiles').select('id, name, photo_url').in('id', ids)
        if (alive) setFriends(ps || [])
      })
    return () => { alive = false }
  }, [meId])

  const entered = useMemo(() => new Set((submissions || []).map((s) => s.creator_id)), [submissions])
  const used = useMemo(() => new Set(taken.map((c) => (c.requester_id === meId ? c.partner_id : c.requester_id))), [taken, meId])
  const list = (friends || []).map((f) => ({ ...f, entered: entered.has(f.id), used: used.has(f.id) })).sort((a, b) => Number(b.entered) - Number(a.entered) || String(a.name).localeCompare(String(b.name)))

  async function send() {
    setBusy(true)
    const { error } = await supabase.rpc('collab_request', { p_challenge: challenge.id, p_submission: entry, p_partner: partner })
    setBusy(false)
    if (error) { notice(error.message); return }
    toastSuccess(tr('Sent. They have been asked to confirm.'))
    onDone()
  }

  return (
    <Modal open onClose={onClose} title={tr('Claim a collab')}>
      <div className="space-y-5">
        <div>
          <p className="label">{tr('Which of your entries was it?')}</p>
          <ul className="max-h-44 space-y-1.5 overflow-y-auto">
            {entries.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => setEntry(e.id)} aria-pressed={entry === e.id} className={cx('flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition-colors', entry === e.id ? 'border-brand bg-brand-tint/50 font-semibold text-ink' : 'border-gray-100 text-smoke hover:border-brand/30')}>
                  <Icon name="video" className="h-4 w-4 shrink-0 text-brand" />
                  <span className="min-w-0 flex-1 truncate">{e.caption?.trim() || e.platform || tr('Entry')}</span>
                  {entry === e.id && <Icon name="check" className="h-4 w-4 shrink-0 text-brand" strokeWidth={2.6} />}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="label">{tr('Who did you make it with?')}</p>
          {friends === undefined ? <Skeleton className="h-24 w-full rounded-xl" /> : list.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center">
              <p className="text-sm text-smoke">{tr('You can only claim a collab with a creator you are connected to. Connect with them first, then come back.')}</p>
              <Link to="/connections" className="btn-secondary mt-3 inline-flex !py-2 text-xs">{tr('Find and connect with creators')}</Link>
            </div>
          ) : (
            <ul className="max-h-60 space-y-1.5 overflow-y-auto">
              {list.map((f) => {
                const off = !f.entered || f.used
                return (
                  <li key={f.id}>
                    <button type="button" disabled={off} onClick={() => setPartner(f.id)} aria-pressed={partner === f.id}
                      className={cx('flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors', partner === f.id ? 'border-brand bg-brand-tint/50' : 'border-gray-100', off ? 'cursor-not-allowed opacity-55' : 'hover:border-brand/30')}>
                      <Avatar src={f.photo_url} name={f.name} size="sm" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{f.name}</span>
                        <span className="block text-[11px] text-smoke">{f.used ? tr('Already counted with you') : f.entered ? tr('Has entered this challenge') : tr('Has not entered yet. Ask them to post a video first.')}</span>
                      </span>
                      {partner === f.id && <Icon name="check" className="h-4 w-4 shrink-0 text-brand" strokeWidth={2.6} />}
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
        <p className="text-[11px] leading-relaxed text-smoke">{tr('They get a notification and must confirm it. Only when they do, you both earn the points. The team can check the video, so only claim a collab you really made together.')}</p>
        <button type="button" onClick={send} disabled={!entry || !partner || busy} className="btn-primary w-full justify-center disabled:opacity-50">{busy ? <Spinner className="h-4 w-4" /> : tr('Ask them to confirm')}</button>
      </div>
    </Modal>
  )
}
