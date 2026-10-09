import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { useCommunity } from '../../context/CommunityContext'
import { Modal, Spinner } from '../ui'
import Icon from '../Icon'
import FlagTile from './FlagTile'
import { confirm, notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// CREATING FOR ANOTHER MARKET (10 Oct 2026, migration 378).
//
// Ethan: "there is a Portuguese creator that also creates content in Spanish but currently she's only in the Portugal
// community. We have the function for them to request to join other markets but it's quite hidden." It was a small
// outlined button at the foot of each card on Explore markets, two screens deep. Now it is one sheet, opened from the
// avatar menu, the Worldwide right column and the Markets page: pick the market, say why in a line, send. The creator
// keeps every market they are in; the team sees it highlighted under Applications and answers yes or no, and both
// answers reach the creator's bell. A VIP or official creator never sees it - their market is set by the team (and the
// database refuses the request anyway).
//
// One sheet for the whole app: `openJoinMarket()` from anywhere, `<JoinMarketHost />` mounted once in AppLayout.

let state = { open: false, pick: null }
const subs = new Set()
const emit = () => subs.forEach((fn) => fn())
/** Open the sheet, optionally with a market already picked. */
export function openJoinMarket(pick = null) { state = { open: true, pick }; emit() }
const close = () => { state = { ...state, open: false }; emit() }
const useSheet = () => useSyncExternalStore((fn) => { subs.add(fn); return () => subs.delete(fn) }, () => state, () => state)

/** Whether this person can ask at all: an approved creator who is not on a paid programme. */
export function useCanJoinMarkets() {
  const { profile, isAdmin } = useAuth()
  return !!profile && !isAdmin && !profile.is_vip && ['active', 'muted'].includes(profile.status)
}

export function JoinMarketHost() {
  const { open, pick } = useSheet()
  if (!open) return null
  return <JoinMarketSheet initial={pick} onClose={close} />
}

function JoinMarketSheet({ initial, onClose }) {
  const tr = useT()
  const { user } = useAuth()
  const { chapters, myChapters } = useCommunity()
  const [requests, setRequests] = useState(null)
  const [picked, setPicked] = useState(initial)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(null)

  const load = useCallback(async () => {
    if (!user?.id) return
    const { data } = await supabase.from('market_join_requests').select('id, community_id, status, note, created_at, decision_note')
      .eq('profile_id', user.id).order('created_at', { ascending: false }).limit(20)
    setRequests(data || [])
  }, [user?.id])
  useEffect(() => { load() }, [load])

  const mine = new Set((myChapters || []).map((c) => c.id))
  const pendingFor = (id) => (requests || []).find((r) => r.community_id === id && r.status === 'pending')
  const open = (chapters || []).filter((c) => c.is_active && !c.retired_at && !mine.has(c.id))
  const target = open.find((c) => c.id === picked)
  const minesNames = (myChapters || []).map((c) => c.name)

  async function send() {
    if (!target) return
    setBusy(true)
    const { error } = await supabase.rpc('request_join_market', { p_community: target.id, p_note: note.trim() || null })
    setBusy(false)
    if (error) { notice(error.message); return }
    setSent(target)
    setNote('')
    load()
  }

  async function withdraw(r) {
    const m = (chapters || []).find((c) => c.id === r.community_id)
    if (!await confirm(tr('Withdraw your request to join {m}?', { m: m?.name || tr('that market') }), { confirmLabel: tr('Withdraw') })) return
    const { error } = await supabase.from('market_join_requests').delete().eq('id', r.id)
    if (error) { notice(error.message); return }
    toastSuccess(tr('Request withdrawn'))
    load()
  }

  return (
    <Modal open onClose={onClose} title={tr('Create for another market')}>
      {sent ? (
        <div className="py-6 text-center animate-rise">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-light text-white shadow-lift animate-pop-in">
            <Icon name="check" className="h-8 w-8" strokeWidth={2.2} />
          </span>
          <p className="mt-4 text-lg font-bold text-ink">{tr('Request sent')}</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-smoke">{tr('The {m} team has it now. You will get a notification when they answer, and you keep your other markets either way.', { m: sent.name })}</p>
          <button type="button" onClick={onClose} className="btn-primary mx-auto mt-6 justify-center !px-8">{tr('Done')}</button>
        </div>
      ) : (
        <div className="space-y-5">
          <p className="text-sm leading-relaxed text-smoke">
            {minesNames.length
              ? tr('You are in {m}. If you also make videos for another market, ask to join it too. You keep the markets you are in.', { m: minesNames.join(', ') })
              : tr('Pick the market you make videos for. The team looks at every request.')}
          </p>

          {open.length === 0 ? (
            <p className="rounded-card border border-dashed border-gray-200 px-5 py-8 text-center text-sm text-smoke">{tr('You are already in every open market.')}</p>
          ) : (
            <div role="radiogroup" aria-label={tr('Market')} className="grid gap-2 sm:grid-cols-2">
              {open.map((c, i) => {
                const pending = pendingFor(c.id)
                const on = picked === c.id
                return (
                  <button key={c.id} type="button" role="radio" aria-checked={on} disabled={!!pending}
                    onClick={() => setPicked(c.id)}
                    className={cx('flex items-center gap-3 rounded-2xl border px-3.5 py-3 text-left transition-all duration-200 animate-rise disabled:cursor-default',
                      on ? 'border-brand bg-brand text-white shadow-card' : pending ? 'border-gray-100 bg-cloud/50' : 'border-gray-100 bg-white hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/40 hoverable:hover:shadow-card')}
                    style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
                    <FlagTile codes={c.country_codes} kind="chapter" size="h-9 w-9" glyph="text-[20px]" title={c.name} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{c.name}</span>
                      <span className={cx('block truncate text-[11px]', on ? 'text-white/85' : 'text-smoke')}>
                        {pending ? tr('Asked, waiting for the team') : c.language && c.language !== 'en' ? tr('Rooms in {l}', { l: c.language.toUpperCase() }) : tr('Briefs, rooms and challenges')}
                      </span>
                    </span>
                    {pending ? <Icon name="clock" className="h-4 w-4 shrink-0 text-smoke" /> : on && <Icon name="check" className="h-5 w-5 shrink-0 animate-pop-in" strokeWidth={2.2} />}
                  </button>
                )
              })}
            </div>
          )}

          {target && (
            <label className="block animate-rise">
              <span className="label">{tr('Why {m}? (optional)', { m: target.name })}</span>
              <textarea className="input min-h-[5rem] resize-none" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
                placeholder={tr('For example: I also post in Spanish and most of my audience is in Spain.')} />
            </label>
          )}

          {open.length > 0 && (
            <button type="button" onClick={send} disabled={!target || busy} className="btn-primary w-full justify-center disabled:opacity-50">
              {busy ? <Spinner className="h-4 w-4" /> : <Icon name="userPlus" className="h-4 w-4" />}
              {target ? tr('Ask to join {m}', { m: target.name }) : tr('Pick a market')}
            </button>
          )}

          {(requests || []).length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-gray-400">{tr('Your requests')}</h3>
              <ul className="divide-y divide-gray-50 rounded-2xl border border-gray-100">
                {requests.slice(0, 6).map((r) => {
                  const m = (chapters || []).find((c) => c.id === r.community_id)
                  return (
                    <li key={r.id} className="flex items-center gap-3 px-3.5 py-2.5">
                      <FlagTile codes={m?.country_codes} kind="chapter" size="h-7 w-7" glyph="text-[15px]" title={m?.name} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-ink">{m?.name || tr('A market')}</span>
                        {r.status === 'declined' && r.decision_note && <span className="block truncate text-[11px] text-smoke">{r.decision_note}</span>}
                      </span>
                      <span className={cx('shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold',
                        r.status === 'accepted' ? 'bg-brand text-white' : r.status === 'declined' ? 'bg-cloud text-smoke' : 'bg-brand-tint text-brand')}>
                        {r.status === 'accepted' ? tr('Accepted') : r.status === 'declined' ? tr('Declined') : tr('Waiting')}
                      </span>
                      {r.status === 'pending' && <button type="button" onClick={() => withdraw(r)} className="shrink-0 text-[11px] font-semibold text-smoke hover:text-red-500">{tr('Withdraw')}</button>}
                    </li>
                  )
                })}
              </ul>
            </section>
          )}
        </div>
      )}
    </Modal>
  )
}

/** THE WORLDWIDE RIGHT COLUMN'S DOOR (10 Oct 2026): a small card that says the thing out loud. */
export function JoinMarketCard({ className }) {
  const tr = useT()
  const can = useCanJoinMarkets()
  if (!can) return null
  return (
    <button type="button" onClick={() => openJoinMarket()}
      className={cx('group relative flex w-full items-center gap-3 overflow-hidden rounded-card border border-gray-100 bg-white px-4 py-3.5 text-left shadow-card transition-all duration-300 hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift', className)}>
      <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-24 w-24 rounded-full bg-brand/10 blur-2xl transition-transform duration-500 group-hover:scale-125" />
      <Icon name="globe" className="relative h-6 w-6 shrink-0 text-brand transition-transform duration-500 group-hover:rotate-12" />
      <span className="relative min-w-0 flex-1">
        <span className="block text-sm font-bold text-ink">{tr('Create for another market?')}</span>
        <span className="block text-xs text-smoke">{tr('Ask to join it as well. You keep yours.')}</span>
      </span>
      <Icon name="chevronRight" className="relative h-4 w-4 shrink-0 text-brand transition-transform duration-200 group-hover:translate-x-0.5" />
    </button>
  )
}
