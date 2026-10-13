import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useCommunity } from '../../context/CommunityContext'
import { Modal, Spinner } from '../ui'
import Icon from '../Icon'
import FlagTile from './FlagTile'
import { confirm, notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'
import { marketsApi } from '../../api/markets'

// CREATING FOR ANOTHER MARKET (migration 378).
//
// It was a small outlined button at the foot of each card on Explore markets, two screens deep. Now it is one sheet,
// opened from the avatar menu, the Worldwide right column and the Markets page: pick the market, say why in a line,
// send. The creator keeps every market they are in; the team sees it highlighted under Applications and answers yes or
// no, and both answers reach the creator's bell. A VIP or official creator never sees it - their market is set by the
// team (and the database refuses the request anyway).
//
// One sheet for the whole app: `openJoinMarket()` from anywhere, `<JoinMarketHost />` mounted once in AppLayout.

const MIN_WHY = 20
const LEVELS = [['native', 'Native'], ['fluent', 'Fluent'], ['some', 'A little'], ['none', 'Not yet']]
const TIES = [['live', 'I live there'], ['part_time', 'I live there part of the year'], ['study', 'I study there'], ['work', 'I work there'], ['family', 'My family is there'], ['audience', 'My audience is there']]
const NORDIC = { SE: 'Swedish', NO: 'Norwegian', DK: 'Danish', FI: 'Finnish' }
const LANG = { en: 'English', es: 'Spanish', pt: 'Portuguese', de: 'German', ro: 'Romanian', fr: 'French', it: 'Italian' }
/** The language a market posts in, as a word: "Spanish", or the Nordic languages for the Nordics. */
export function marketLanguage(c) {
  const nordic = (c?.country_codes || []).map((k) => NORDIC[k]).filter(Boolean)
  if (nordic.length) return nordic.join(', ')
  return LANG[c?.language] || 'English'
}

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
  const can = useCanJoinMarkets()
  const location = useLocation()
  const navigate = useNavigate()
  // A NOTIFICATION CAN OPEN IT: "Tell us more about joining Germany" links to ?join=<market>.
  const asked = new URLSearchParams(location.search).get('join')
  useEffect(() => {
    if (!asked || !can) return
    openJoinMarket(asked)
    const q = new URLSearchParams(location.search)
    q.delete('join')
    navigate({ pathname: location.pathname, search: q.toString() ? `?${q}` : '' }, { replace: true })
  }, [asked, can]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!open) return null
  return <JoinMarketSheet initial={pick} onClose={close} />
}

// `demo` (Testing Centre): { mine: [market ids], requests: [rows] } draws the sheet as that creator would see it and
// writes nothing - sending shows the "Request sent" screen, withdrawing only removes the row on screen. `inline` draws
// it in a card instead of a dialog, so the lab can show several states side by side.
function JoinMarketSheet({ initial, onClose, demo = null, inline = false }) {
  const tr = useT()
  const { user } = useAuth()
  const community = useCommunity()
  const chapters = community.chapters
  const myChapters = demo ? (chapters || []).filter((c) => demo.mine.includes(c.id)) : community.myChapters
  const [requests, setRequests] = useState(demo ? demo.requests : null)
  const [picked, setPicked] = useState(initial)
  const [note, setNote] = useState('')
  const [level, setLevel] = useState(null)
  const [ties, setTies] = useState([])
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(null)

  const load = useCallback(async () => {
    if (demo || !user?.id) return
    const { data } = await marketsApi.marketJoinRequests().select('id, community_id, status, note, created_at, decision_note, language_level, ties')
      .eq('profile_id', user.id).order('created_at', { ascending: false }).limit(20)
    setRequests(data || [])
  }, [user?.id, demo])
  useEffect(() => { load() }, [load])

  const mine = new Set((myChapters || []).map((c) => c.id))
  const pendingFor = (id) => (requests || []).find((r) => r.community_id === id && r.status === 'pending')
  // A request sent before the questions existed (or with no reason) can be finished, not only waited on.
  const unfinished = (r) => !!r && (!r.language_level || (r.note || '').trim().length < MIN_WHY)
  const open = (chapters || []).filter((c) => c.is_active && !c.retired_at && !mine.has(c.id))
  const target = open.find((c) => c.id === picked)
  const minesNames = (myChapters || []).map((c) => c.name)

  // Picking a market that already has an unfinished request fills the form with what they sent.
  useEffect(() => {
    const r = picked ? pendingFor(picked) : null
    if (r) { setNote(r.note || ''); setLevel(r.language_level || null); setTies(r.ties || []) }
  }, [picked, requests]) // eslint-disable-line react-hooks/exhaustive-deps

  const why = note.trim()
  const ready = !!target && !!level && why.length >= MIN_WHY
  async function send() {
    if (!ready) return
    if (demo) { setSent(target); return }
    setBusy(true)
    const { error } = await marketsApi.requestJoinMarket({ p_community: target.id, p_note: why, p_language: level, p_ties: ties })
    setBusy(false)
    if (error) { notice(error.message); return }
    setSent(target)
    setNote('')
    setLevel(null)
    setTies([])
    load()
  }

  async function withdraw(r) {
    const m = (chapters || []).find((c) => c.id === r.community_id)
    if (!await confirm(tr('Withdraw your request to join {m}?', { m: m?.name || tr('that market') }), { confirmLabel: tr('Withdraw') })) return
    if (demo) { setRequests((cur) => cur.filter((x) => x.id !== r.id)); return }
    const { error } = await marketsApi.marketJoinRequests().delete().eq('id', r.id)
    if (error) { notice(error.message); return }
    toastSuccess(tr('Request withdrawn'))
    load()
  }

  const body = (
    <>
      {sent ? (
        <div className="py-6 text-center animate-rise">
          <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-brand to-brand-light text-white shadow-lift animate-pop-in">
            <Icon name="check" className="h-8 w-8" strokeWidth={2.2} />
          </span>
          <p className="mt-4 text-lg font-bold text-ink">{tr('Request sent')}</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-smoke">{tr('The {m} team has it now. You will get a notification when they answer, and you keep your other markets either way.', { m: sent.name })}</p>
          <button type="button" onClick={demo ? () => setSent(null) : onClose} className="btn-primary mx-auto mt-6 justify-center !px-8">{tr('Done')}</button>
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
            <div role="radiogroup" aria-label={tr('Market')} className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {open.map((c, i) => {
                const pendingRow = pendingFor(c.id)
                const pending = pendingRow && !unfinished(pendingRow)
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
                        {pending ? tr('Asked, waiting for the team') : pendingRow ? tr('Asked: add your answers') : c.language && c.language !== 'en' ? tr('Rooms in {l}', { l: c.language.toUpperCase() }) : tr('Briefs, rooms and challenges')}
                      </span>
                    </span>
                    {pending ? <Icon name="clock" className="h-4 w-4 shrink-0 text-smoke" /> : on && <Icon name="check" className="h-5 w-5 shrink-0 animate-pop-in" strokeWidth={2.2} />}
                  </button>
                )
              })}
            </div>
          )}

          {target && (
            <div className="space-y-5 animate-rise">
              {/* THREE QUESTIONS. The team sees every answer, next to the languages on the creator's profile. */}
              <fieldset>
                <legend className="label">{tr('How well do you speak {l}?', { l: tr(marketLanguage(target)) })}</legend>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {LEVELS.map(([k, label]) => (
                    <button key={k} type="button" aria-pressed={level === k} onClick={() => setLevel(k)}
                      className={cx('rounded-xl border px-3 py-2.5 text-sm font-semibold transition-all duration-200', level === k ? 'border-brand bg-brand text-white shadow-card' : 'border-gray-200 bg-white text-ink hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/40')}>
                      {tr(label)}
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend className="label">{tr('What ties you to {m}?', { m: target.name })} <span className="font-normal normal-case text-smoke">{tr('(pick any)')}</span></legend>
                <div className="flex flex-wrap gap-2">
                  {TIES.map(([k, label]) => {
                    const on = ties.includes(k)
                    return (
                      <button key={k} type="button" aria-pressed={on} onClick={() => setTies((cur) => (on ? cur.filter((x) => x !== k) : [...cur, k]))}
                        className={cx('rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200', on ? 'border-brand bg-brand text-white' : 'border-gray-200 bg-white text-ink hoverable:hover:border-brand/40')}>
                        {tr(label)}
                      </button>
                    )
                  })}
                </div>
              </fieldset>

              <label className="block">
                <span className="label">{tr('Why do you want to join {m}?', { m: target.name })}</span>
                <textarea className="input min-h-[6rem] resize-none" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500}
                  placeholder={tr('For example: I live in Madrid part of the year, I post in Spanish and most of my audience is in Spain.')} />
                <span className={cx('mt-1 block text-[11px]', why.length >= MIN_WHY ? 'text-smoke' : 'text-brand')}>
                  {why.length >= MIN_WHY ? tr('Thanks, that helps the team decide.') : tr('A sentence or two, please ({n} more characters).', { n: MIN_WHY - why.length })}
                </span>
              </label>

              <p className="flex items-start gap-2 rounded-xl bg-cloud/70 px-3.5 py-2.5 text-xs leading-relaxed text-smoke">
                <Icon name="bulb" className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
                {tr('Planning a trip there is not a reason to join: you can make videos about anywhere from your own market. A market is for creators who post in its language for people who live there.')}
              </p>
            </div>
          )}

          {open.length > 0 && (
            <button type="button" onClick={send} disabled={!ready || busy} className="btn-primary w-full justify-center disabled:opacity-50">
              {busy ? <Spinner className="h-4 w-4" /> : <Icon name="userPlus" className="h-4 w-4" />}
              {!target ? tr('Pick a market') : pendingFor(target.id) ? tr('Send my answers') : tr('Ask to join {m}', { m: target.name })}
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
    </>
  )
  if (inline) {
    return (
      <div className="rounded-card border border-gray-100 bg-white p-5 shadow-card">
        <h3 className="mb-4 text-lg font-bold text-ink">{tr('Create for another market')}</h3>
        {body}
      </div>
    )
  }
  return <Modal open onClose={onClose} title={tr('Create for another market')}>{body}</Modal>
}

/** The sheet as a given creator would see it, drawn in place and writing nothing (Testing Centre). */
export function JoinMarketPreview({ mine, requests = [], initial = null }) {
  return <JoinMarketSheet inline demo={{ mine, requests }} initial={initial} onClose={() => {}} />
}

/* THE WORLDWIDE RIGHT COLUMN'S DOOR: a small card that says the thing out loud. */
export function JoinMarketCard({ className }) {
  const tr = useT()
  const can = useCanJoinMarkets()
  const { isAdmin } = useAuth()
  const navigate = useNavigate()
  // THE TEAM SEES IT TOO. The team could not find this card because it is for creators only, so the team now sees the
  // same card, marked as what creators see, and it opens the requests they send instead of the sheet.
  if (!can && !isAdmin) return null
  return (
    <button type="button" onClick={() => (can ? openJoinMarket() : navigate('/admin/applications?tab=markets'))}
      className={cx('group relative flex w-full items-center gap-3 overflow-hidden rounded-card border border-gray-100 bg-white px-4 py-3.5 text-left shadow-card transition-all duration-300 hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift', className)}>
      <Icon name="globe" className="relative h-6 w-6 shrink-0 text-brand transition-transform duration-500 group-hover:rotate-12" />
      <span className="relative min-w-0 flex-1">
        {!can && <span className="block text-[10px] font-bold uppercase tracking-[0.14em] text-brand">{tr('What creators see')}</span>}
        <span className="block text-sm font-bold text-ink">{tr('Create for another market?')}</span>
        <span className="block text-xs text-smoke">{can ? tr('Ask to join it as well. You keep yours.') : tr('Their requests land in Applications, Market requests.')}</span>
      </span>
      <Icon name="chevronRight" className="relative h-4 w-4 shrink-0 text-brand transition-transform duration-200 group-hover:translate-x-0.5" />
    </button>
  )
}
