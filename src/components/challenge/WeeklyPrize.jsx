import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, Spinner } from '../ui'
import Icon from '../Icon'
import SocialMark from '../SocialMark'
import { cx, formatDate, formatMoney, formatViews } from '../../lib/utils'
import { useT } from '../../lib/i18n'
import { confirm, notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { pickClass } from '../../lib/pick'
import { safeUrl } from '../../lib/safeUrl'
import { challengesApi } from '../../api/challenges'

// VIDEO OF THE WEEK (migration 435, 19 Oct 2026).
//
// Ethan: "the top video in a set week gets a bonus voucher or cash... I would click to award it, but it would show it up
// so I can just verify it". One board read (`weekly_prize_board`) feeds both faces of it:
//   WeeklyPrizeCard   the creators' card: this round's prize, its countdown, the top three so far, past winners.
//   WeeklyPrizeAdmin  the results page: every round of every group, frozen winners with Award, the live ones read-only.
// A round is decided between the videos POSTED in it, so a big video from week one cannot win week three.

const BRAND = { Instagram: 'instagram', TikTok: 'tiktok', YouTube: 'youtube', Facebook: 'facebook' }

export function useWeeklyBoard(challengeId, enabled = true, refreshKey = 0) {
  const [rows, setRows] = useState(null)
  const load = useCallback(async () => {
    if (!challengeId || !enabled) { setRows([]); return }
    const { data, error } = await challengesApi.weeklyPrizeBoard({ p_challenge: challengeId, p_top: 5 })
    setRows(error ? [] : data || [])
  }, [challengeId, enabled])
  useEffect(() => { load() }, [load, refreshKey])
  return { rows, reload: load }
}

/** [{ round, startsAt, endsAt, state, boards: [{ groupId, groupName, state, rowId, rewardId, awardedAt, entries: [...] }] }] */
export function roundsOf(rows) {
  const out = new Map()
  for (const r of rows || []) {
    if (!out.has(r.round)) out.set(r.round, { round: r.round, startsAt: r.starts_at, endsAt: r.ends_at, boards: new Map() })
    const rd = out.get(r.round)
    const key = r.group_id || 'all'
    if (!rd.boards.has(key)) {
      rd.boards.set(key, {
        groupId: r.group_id, groupName: r.group_name, state: r.state, rowId: r.row_id, rewardId: r.reward_id,
        awardedAt: r.awarded_at, entries: [],
      })
    }
    if (r.submission_id) rd.boards.get(key).entries.push(r)
  }
  return [...out.values()].map((rd) => {
    const boards = [...rd.boards.values()]
    return { ...rd, boards, state: boards[0]?.state || 'upcoming' }
  })
}

function timeLeft(iso, tr) {
  const ms = Date.parse(iso) - Date.now()
  if (!(ms > 0)) return tr('ending now')
  const h = Math.floor(ms / 3600_000)
  const d = Math.floor(h / 24)
  return d >= 1 ? tr('{d}d {h}h left', { d, h: h % 24 }) : tr('{h}h left', { h: Math.max(1, h) })
}

function prizeLabel(w, tr) {
  if (!w) return ''
  return w.type === 'cash'
    ? tr('{amount} cash', { amount: formatMoney(w.amount, w.currency || 'EUR') })
    : tr('{amount} Tryp.com voucher', { amount: formatMoney(w.amount, w.currency || 'EUR') })
}

/**
 * THE CREATORS' CARD. `groupId` is the reader's board on a split challenge (null otherwise); `meId` marks you.
 */
export function WeeklyPrizeCard({ challenge, groupId = null, meId }) {
  const tr = useT()
  const weekly = challenge?.weekly_prize
  const { rows } = useWeeklyBoard(challenge?.id, !!weekly)
  if (!weekly || !rows) return null
  const rounds = roundsOf(rows)
  if (!rounds.length) return null
  const pick = (rd) => rd.boards.find((b) => (b.groupId ?? null) === (groupId ?? null)) || rd.boards[0]
  const current = rounds.find((r) => r.state === 'live') || null
  const past = rounds.filter((r) => ['ready', 'awarded'].includes(r.state))
  const next = !current ? rounds.find((r) => r.state === 'upcoming') : null
  const board = current ? pick(current) : null
  const top = (board?.entries || []).slice(0, 3)

  return (
    <section className="overflow-hidden rounded-card bg-white shadow-card animate-fade-up">
      <div className="relative overflow-hidden bg-gradient-to-br from-brand to-brand-light px-5 py-4 text-white">
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/15 blur-2xl" />
        <p className="relative flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/85">
          <Icon name="fire" className="h-4 w-4" />{tr('Video of the Week')}
        </p>
        <p className="relative mt-1 text-xl font-bold">{prizeLabel(weekly, tr)}</p>
        <p className="relative mt-0.5 text-xs text-white/85">
          {current
            ? tr('Round {n} · {left}', { n: current.round, left: timeLeft(current.endsAt, tr) })
            : next ? tr('Round {n} starts {d}', { n: next.round, d: formatDate(next.startsAt) }) : tr('Every round has been decided')}
        </p>
      </div>
      <div className="space-y-3 p-4">
        <p className="text-xs leading-relaxed text-smoke">{tr('The most viewed video posted in each round wins, on top of any other prize.')}</p>
        {current && (
          top.length ? (
            <ol className="space-y-1.5">
              {top.map((e, i) => (
                <li key={e.submission_id} className={cx('flex items-center gap-2.5 rounded-xl px-2 py-1.5 animate-fade-up', e.creator_id === meId ? 'bg-brand-tint/50' : 'bg-cloud/60')} style={{ animationDelay: `${i * 60}ms` }}>
                  <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold', i === 0 ? 'bg-brand text-white' : 'bg-white text-smoke')}>{i + 1}</span>
                  <Link to={`/profile/${e.creator_id}`} className="flex min-w-0 flex-1 items-center gap-2 transition-transform duration-200 hoverable:hover:translate-x-0.5">
                    <Avatar src={e.photo_url} name={e.name || ''} size="xs" />
                    <span className="min-w-0 truncate text-[13px] font-semibold text-ink">{e.name}</span>
                  </Link>
                  {e.platform && <SocialMark brand={BRAND[e.platform] || 'link'} colored className="h-3.5 w-3.5 shrink-0" />}
                  <span className="shrink-0 text-[13px] font-bold tabular-nums text-ink">{formatViews(e.views)}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="rounded-xl border border-dashed border-gray-200 px-3 py-3 text-center text-xs text-smoke">{tr('No videos posted this round yet. The first one leads.')}</p>
          )
        )}
        {past.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Winners so far')}</p>
            <ul className="space-y-1">
              {past.map((rd) => {
                const b = pick(rd)
                const w = b?.entries?.[0]
                return (
                  <li key={rd.round} className="flex items-center gap-2 text-[13px]">
                    <span className="w-14 shrink-0 text-xs text-smoke">{tr('Round {n}', { n: rd.round })}</span>
                    {w ? (
                      <Link to={`/profile/${w.creator_id}`} className="flex min-w-0 flex-1 items-center gap-2">
                        <Avatar src={w.photo_url} name={w.name || ''} size="xs" />
                        <span className="min-w-0 truncate font-semibold text-ink">{w.name}</span>
                        <span className="shrink-0 text-xs tabular-nums text-smoke">{formatViews(w.views)}</span>
                      </Link>
                    ) : <span className="text-xs text-smoke">{tr('Nobody posted')}</span>}
                  </li>
                )
              })}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}

/** THE RESULTS PAGE: check each frozen winner and award it, cash or voucher. */
export function WeeklyPrizeAdmin({ challenge, onAwarded }) {
  const weekly = challenge?.weekly_prize
  const [key, setKey] = useState(0)
  const { rows } = useWeeklyBoard(challenge?.id, !!weekly, key)
  const [busy, setBusy] = useState(null)
  const [types, setTypes] = useState({})
  if (!weekly) return null
  const rounds = roundsOf(rows)

  async function award(b, rd) {
    const type = types[b.rowId] || weekly.type || 'voucher'
    const w = b.entries[0]
    if (!await confirm(`Award round ${rd.round}${b.groupName ? ` (${b.groupName})` : ''} to ${w?.name}: ${formatMoney(weekly.amount, weekly.currency || 'EUR')} ${type === 'cash' ? 'cash' : 'Tryp.com voucher'}? ${type === 'cash' ? 'Their invoice is drafted automatically.' : 'The voucher then needs its code on Rewards & Payouts.'}`, { confirmLabel: 'Award it' })) return
    setBusy(b.rowId)
    const { error } = await challengesApi.awardWeeklyPrize({ p_row: b.rowId, p_type: type })
    setBusy(null)
    if (error) { notice(error.message); return }
    toastSuccess(`Round ${rd.round} awarded. ${w?.name?.split(' ')[0] || 'They'} has been told.`)
    setKey((k) => k + 1)
    onAwarded?.()
  }
  async function refresh(b) {
    setBusy(b.rowId)
    const { error } = await challengesApi.weeklyPrizeRefresh({ p_row: b.rowId })
    setBusy(null)
    if (error) { notice(error.message); return }
    setKey((k) => k + 1)
  }

  return (
    <section id="weekly" className="mb-8 scroll-mt-24 overflow-hidden rounded-card border border-gray-100 shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5 sm:px-7">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold"><Icon name="fire" className="h-4 w-4 text-brand" />Video of the Week</h2>
          <p className="mt-0.5 text-sm text-smoke">
            {formatMoney(weekly.amount, weekly.currency || 'EUR')} {weekly.type === 'cash' ? 'cash' : 'voucher'} a round. Each round is read one last time when it ends, then frozen here for you to check and award.
          </p>
        </div>
      </div>
      {!rows ? <div className="px-7 pb-6"><Spinner /></div> : (
        <ul className="divide-y divide-gray-100 border-t border-gray-100">
          {rounds.map((rd) => rd.boards.map((b) => {
            const w = b.entries[0]
            const type = types[b.rowId] || weekly.type || 'voucher'
            return (
              <li key={`${rd.round}:${b.groupId || 'all'}`} className="flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:px-7">
                <div className="w-40 shrink-0">
                  <p className="text-sm font-semibold text-ink">Round {rd.round}{b.groupName ? ` · ${b.groupName}` : ''}</p>
                  <p className="text-xs text-smoke">{formatDate(rd.startsAt)} to {formatDate(rd.endsAt)}</p>
                </div>
                <div className="flex min-w-0 flex-1 items-center gap-2.5">
                  {w ? (
                    <>
                      <Link to={`/profile/${w.creator_id}`}><Avatar src={w.photo_url} name={w.name || ''} size="sm" /></Link>
                      <div className="min-w-0">
                        <Link to={`/profile/${w.creator_id}`} className="block truncate text-sm font-semibold text-ink hover:text-brand">{w.name}</Link>
                        <p className="flex items-center gap-1.5 text-xs text-smoke">
                          {w.platform && <SocialMark brand={BRAND[w.platform] || 'link'} colored className="h-3.5 w-3.5" />}
                          <span className="tabular-nums">{Number(w.views || 0).toLocaleString('en-GB')} views</span>
                          {safeUrl(w.video_url) && <a href={safeUrl(w.video_url)} target="_blank" rel="noreferrer" className="font-medium text-brand hover:underline">Open video</a>}
                        </p>
                      </div>
                    </>
                  ) : <p className="text-sm text-smoke">{b.state === 'upcoming' ? 'Not started' : 'No videos posted in this round'}</p>}
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  {b.state === 'upcoming' && <span className="text-xs font-semibold text-smoke">Upcoming</span>}
                  {b.state === 'live' && <span className="rounded-full bg-cloud px-2.5 py-1 text-xs font-semibold text-ink">Running, leader so far</span>}
                  {b.state === 'reading' && <span className="rounded-full bg-cloud px-2.5 py-1 text-xs font-semibold text-smoke">Reading final views</span>}
                  {b.state === 'ready' && w && (
                    <>
                      {['voucher', 'cash'].map((k) => (
                        <button key={k} type="button" aria-pressed={type === k} onClick={() => setTypes((t) => ({ ...t, [b.rowId]: k }))} className={cx('rounded-full border px-3 py-1 text-xs font-semibold', pickClass(type === k))}>{k === 'cash' ? 'Cash' : 'Voucher'}</button>
                      ))}
                      <button type="button" onClick={() => refresh(b)} disabled={busy === b.rowId} title="Read the winner again from the latest views" className="flex h-8 w-8 items-center justify-center rounded-lg text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-brand">
                        <Icon name="refresh" className="h-3.5 w-3.5" />
                      </button>
                      <button type="button" onClick={() => award(b, rd)} disabled={busy === b.rowId} className="btn-primary !py-1.5 text-xs">
                        {busy === b.rowId ? <Spinner className="h-3.5 w-3.5" /> : 'Award'}
                      </button>
                    </>
                  )}
                  {b.state === 'awarded' && (
                    <Link to="/admin/rewards" className="inline-flex items-center gap-1.5 rounded-full bg-green-50 px-3 py-1.5 text-xs font-semibold text-green-700">
                      <Icon name="check" className="h-3.5 w-3.5" />Awarded
                    </Link>
                  )}
                </div>
              </li>
            )
          }))}
        </ul>
      )}
    </section>
  )
}
