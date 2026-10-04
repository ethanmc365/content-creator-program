import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { Avatar, Modal, Skeleton, Spinner } from '../ui'
import Icon from '../Icon'
import { confirm, notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// THE COLLAB BONUS, AS AN INSTAGRAM COLLAB POST (rebuilt 4 Oct 2026, migration 334).
//
// Ethan, after reading the first version ("two creators connect on the platform and make a video together in any way"): "This isn't really
// going to work ... maybe a collab post on Instagram, where they actually do a collab post ... they would have to both be selected ... this
// wouldn't count as using us twice. They would both get the points."
//
// So: Instagram lets two accounts share ONE post, and that post is a thing both of them can point at. One creator enters it as their entry and
// names the other; the other gets a notification and confirms it; both then earn the collab points (capped by the rule's maximum). The post is
// entered once, so its views count once and it can never be entered a second time by the partner - and the partner needs no entry of their
// own, because the post is already in. A post has one partner, and the team can see every pair.

/** The people picker used here and in the submit form: type a name, press a creator. */
export function PartnerPicker({ meId, value, onChange }) {
  const tr = useT()
  const [q, setQ] = useState('')
  const [found, setFound] = useState([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const term = q.trim()
    if (term.length < 2) { setFound([]); return undefined }
    let alive = true
    setBusy(true)
    const t = setTimeout(() => {
      supabase.from('profiles').select('id, name, photo_url, country').eq('status', 'active').eq('is_admin', false).neq('id', meId)
        .ilike('name', `%${term.replace(/[%_]/g, '')}%`).order('name').limit(8)
        .then(({ data }) => { if (alive) { setFound(data || []); setBusy(false) } })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [q, meId])

  if (value) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-brand/30 bg-brand-tint/30 px-3 py-2.5">
        <Avatar src={value.photo_url} name={value.name} size="sm" />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{value.name}</span>
        <button type="button" onClick={() => onChange(null)} className="text-xs font-semibold text-smoke hover:text-ink">{tr('Change')}</button>
      </div>
    )
  }
  return (
    <div>
      <input className="input" value={q} onChange={(e) => setQ(e.target.value)} placeholder={tr('Search for their name')} aria-label={tr('Search for the other creator')} autoComplete="off" />
      {q.trim().length >= 2 && (
        <ul className="mt-1.5 max-h-52 divide-y divide-gray-50 overflow-y-auto rounded-xl border border-gray-100 bg-white">
          {busy && found.length === 0 && <li className="px-3.5 py-3 text-xs text-smoke">{tr('Searching…')}</li>}
          {!busy && found.length === 0 && <li className="px-3.5 py-3 text-xs text-smoke">{tr('Nobody found. Check the spelling of their name.')}</li>}
          {found.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => { onChange(p); setQ('') }} className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-cloud">
                <Avatar src={p.photo_url} name={p.name} size="xs" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{p.name}</span>
                {p.country && <span className="shrink-0 text-[11px] text-smoke">{p.country}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function CollabCard({ challenge, rule, submissions, meId }) {
  const tr = useT()
  const [rows, setRows] = useState(undefined)
  const [names, setNames] = useState({})
  const [asking, setAsking] = useState(false)
  const [busy, setBusy] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase.from('challenge_collabs').select('*').eq('challenge_id', challenge.id).order('created_at', { ascending: false })
    const list = (data || []).filter((c) => c.requester_id === meId || c.partner_id === meId)
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
  const options = useMemo(() => {
    const claimed = new Set((rows || []).filter((c) => c.status !== 'declined').map((c) => c.submission_id))
    return (submissions || []).filter((s) => s.creator_id === meId && s.platform === 'Instagram' && !claimed.has(s.id))
  }, [submissions, meId, rows])
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
        <Icon name="users" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <h2 className="text-sm font-bold text-ink">{tr('Instagram collab bonus')}</h2>
          <p className="mt-0.5 text-xs leading-relaxed text-smoke">{tr('Post one Instagram collab post with another creator, enter it here, and you both earn +{n} points.', { n: points })}</p>
        </div>
        <span className="shrink-0 text-base font-extrabold tabular-nums text-brand">+{points}</span>
      </div>

      {rows === undefined ? <Skeleton className="mt-3 h-12 w-full rounded-xl" /> : (
        <>
          {toAnswer.length > 0 && (
            <ul className="mt-3 space-y-2">
              {toAnswer.map((c) => {
                const p = who(c)
                return (
                  <li key={c.id} className="rounded-xl border border-brand/30 p-3">
                    <div className="flex items-center gap-2.5">
                      <Avatar src={p?.photo_url} name={p?.name || '?'} size="sm" />
                      <p className="min-w-0 flex-1 text-[13px] font-semibold leading-snug text-ink">{tr('{n} says you made an Instagram collab post together', { n: p?.name || tr('A creator') })}</p>
                    </div>
                    <div className="mt-2.5 flex gap-2">
                      <button type="button" disabled={busy === c.id} onClick={() => respond(c, true)} className="btn-primary flex-1 justify-center !py-2 text-xs">{busy === c.id ? <Spinner className="h-3.5 w-3.5" /> : <Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.6} />}{tr('Yes, confirm')}</button>
                      <button type="button" disabled={busy === c.id} onClick={() => respond(c, false)} className="btn-secondary flex-1 justify-center !py-2 text-xs">{tr('Not me')}</button>
                    </div>
                  </li>
                )
              })}
            </ul>
          )}

          {(earned.length > 0 || waiting.length > 0) && (
            <ul className="mt-3 divide-y divide-gray-50 rounded-xl border border-gray-100">
              {earned.map((c) => {
                const p = who(c)
                return (
                  <li key={c.id} className="flex items-center gap-2.5 px-3 py-2">
                    <Avatar src={p?.photo_url} name={p?.name || '?'} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink">{tr('With {n}', { n: p?.name || tr('a creator') })}</span>
                    <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-brand"><Icon name="check" className="h-3.5 w-3.5" strokeWidth={2.6} />+{points}</span>
                  </li>
                )
              })}
              {waiting.map((c) => {
                const p = who(c)
                return (
                  <li key={c.id} className="flex items-center gap-2.5 px-3 py-2">
                    <Avatar src={p?.photo_url} name={p?.name || '?'} size="xs" />
                    <span className="min-w-0 flex-1 truncate text-[13px] text-smoke">{tr('Waiting for {n} to confirm', { n: p?.name || tr('them') })}</span>
                    <button type="button" onClick={() => cancel(c)} className="shrink-0 text-[11px] font-semibold text-smoke hover:text-red-500">{tr('Cancel')}</button>
                  </li>
                )
              })}
            </ul>
          )}

          {canClaim && (
            <button type="button" onClick={() => setAsking(true)} disabled={options.length === 0} className="btn-secondary mt-3 w-full justify-center !py-2.5 text-sm disabled:opacity-60">
              <Icon name="plus" className="h-4 w-4" strokeWidth={2.4} />{tr('Add a collab partner to an entry')}
            </button>
          )}
          {canClaim && options.length === 0 && <p className="mt-1.5 text-center text-[11px] text-smoke">{tr('Enter your Instagram collab post first. You can also pick the partner when you enter it.')}</p>}
        </>
      )}

      {asking && <AskModal challenge={challenge} entries={options} meId={meId} onClose={() => setAsking(false)} onDone={() => { setAsking(false); load() }} />}
    </section>
  )
}

/** Pick which Instagram entry it was, then who it was made with. */
function AskModal({ challenge, entries, meId, onClose, onDone }) {
  const tr = useT()
  const [entry, setEntry] = useState(entries[0]?.id || '')
  const [partner, setPartner] = useState(null)
  const [busy, setBusy] = useState(false)

  async function send() {
    setBusy(true)
    const { error } = await supabase.rpc('collab_request', { p_challenge: challenge.id, p_submission: entry, p_partner: partner.id })
    setBusy(false)
    if (error) { notice(error.message); return }
    toastSuccess(tr('Sent. They have been asked to confirm.'))
    onDone()
  }

  return (
    <Modal open onClose={onClose} title={tr('Add a collab partner')}>
      <div className="space-y-5">
        <div>
          <p className="label">{tr('Which Instagram entry is the collab post?')}</p>
          <ul className="max-h-44 space-y-1.5 overflow-y-auto">
            {entries.map((e) => (
              <li key={e.id}>
                <button type="button" onClick={() => setEntry(e.id)} aria-pressed={entry === e.id} className={cx('flex w-full items-center gap-2.5 rounded-xl border px-3 py-2 text-left text-sm transition-colors', entry === e.id ? 'border-brand bg-brand-tint/40' : 'border-gray-100')}>
                  <Icon name="video" className="h-4 w-4 shrink-0 text-brand" />
                  <span className="min-w-0 flex-1 truncate">{e.caption?.trim() || e.platform || tr('Entry')}</span>
                  {entry === e.id && <Icon name="check" className="h-4 w-4 shrink-0 text-brand" strokeWidth={2.6} />}
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <p className="label">{tr('Who is on the post with you?')}</p>
          <PartnerPicker meId={meId} value={partner} onChange={setPartner} />
        </div>
        <p className="text-[11px] leading-relaxed text-smoke">{tr('They get a notification and have to confirm it. Only then do you both earn the points. The team can see every pair, so only add a post you really made together.')}</p>
        <button type="button" onClick={send} disabled={!entry || !partner || busy} className="btn-primary w-full justify-center disabled:opacity-50">{busy ? <Spinner className="h-4 w-4" /> : tr('Ask them to confirm')}</button>
      </div>
    </Modal>
  )
}
