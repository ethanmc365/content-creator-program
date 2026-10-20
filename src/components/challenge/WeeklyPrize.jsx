import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Avatar, Spinner } from '../ui'
import Icon from '../Icon'
import SocialMark from '../SocialMark'
import { cx, dateTag, formatDate, formatMoney, formatViews } from '../../lib/utils'
import { useLocale, useT } from '../../lib/i18n'
import { confirm, notice } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { pickClass } from '../../lib/pick'
import { safeUrl } from '../../lib/safeUrl'
import { challengesApi } from '../../api/challenges'
import EntryPreview from './EntryPreview'

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

// "Sat 31 Oct - Fri 6 Nov". A round ends at midnight, so its last day is the day before `endsAt`. Read in the
// challenge's own clock, so a creator in Madrid sees the same days as the brief.
function roundDays(rd, tz, locale) {
  const opts = { weekday: 'short', day: 'numeric', month: 'short', timeZone: tz }
  const a = new Date(rd.startsAt).toLocaleDateString(locale, opts)
  const b = new Date(Date.parse(rd.endsAt) - 60_000).toLocaleDateString(locale, opts)
  return `${a} - ${b}`
}

/** A board row in the shape EntryPreview and the player take. */
const asEntry = (e) => ({
  id: e.submission_id, creator_id: e.creator_id, video_url: e.video_url, platform: e.platform,
  thumbnail_url: e.thumbnail_url, platform_video_id: e.platform_video_id, logged_views: e.views,
  profiles: { name: e.name, photo_url: e.photo_url },
})

/**
 * THE CREATORS' CARD (rebuilt 20 Oct 2026). Ethan: "It'll show a little mini leaderboard of just that week and also show
 * who previously won the vouchers there, with a nice UI showing their profile pictures, etc. The actual videos, like the
 * entries." So: the round you are in and how far through the challenge it is, this round's top five with the leading
 * videos themselves (press one to watch it), and every past winner with their photo and the video that won.
 * `groupId` is the reader's board on a split challenge (null otherwise); `meId` marks you; `onPlay(entry)` is the
 * page's own player.
 */
export function WeeklyPrizeCard({ challenge, groupId = null, meId, onPlay, boardRows = null }) {
  const tr = useT()
  useLocale() // re-render on a language change
  const locale = dateTag()
  const weekly = challenge?.weekly_prize
  const tz = challenge?.timezone || 'Europe/London'
  // `boardRows` is the dev bench's fixture (pages/dev/WeeklyBench); the page always reads the board.
  const { rows: fetched } = useWeeklyBoard(challenge?.id, !!weekly && !boardRows)
  const rows = boardRows || fetched
  // Captured once (render stays pure); the page re-reads the board on its next visit.
  const [now] = useState(() => Date.now())
  if (!weekly || !rows) return null
  const rounds = roundsOf(rows)
  if (!rounds.length) return null
  const pick = (rd) => rd.boards.find((b) => (b.groupId ?? null) === (groupId ?? null)) || rd.boards[0]
  const current = rounds.find((r) => r.state === 'live') || null
  const reading = rounds.find((r) => r.state === 'reading') || null
  const past = rounds.filter((r) => ['ready', 'awarded'].includes(r.state))
  const next = !current ? rounds.find((r) => r.state === 'upcoming') : null
  const shown = current || reading
  const board = shown ? pick(shown) : null
  const top = (board?.entries || []).slice(0, 5)
  const videos = top.filter((e) => e.video_url).slice(0, 3)
  const play = (e) => onPlay?.(asEntry(e))

  return (
    <section className="overflow-hidden rounded-card bg-white shadow-card animate-fade-up">
      <div className="relative overflow-hidden bg-gradient-to-br from-brand to-brand-light px-5 pb-4 pt-4 text-white">
        <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-white/15 blur-2xl" />
        <p className="relative flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.14em] text-white/85">
          <Icon name="fire" className="h-4 w-4" />{tr('Video of the Week')}
        </p>
        <p className="relative mt-1 text-xl font-bold">{prizeLabel(weekly, tr)}</p>
        <p className="relative mt-0.5 text-xs text-white/85">
          {current
            ? tr('Round {n} of {total} · {left}', { n: current.round, total: rounds.length, left: timeLeft(current.endsAt, tr) })
            : reading ? tr('Round {n} has ended. Reading the final views', { n: reading.round })
              : next ? tr('Round {n} starts {d}', { n: next.round, d: roundDays(next, tz, locale).split(' - ')[0] }) : tr('Every round has been decided')}
        </p>
        {/* ONE SEGMENT PER ROUND: decided ones solid, the running one filling up, the rest faint. */}
        <ol className="relative mt-3 flex gap-1" aria-label={tr('Rounds')}>
          {rounds.map((rd) => {
            const done = ['ready', 'awarded', 'reading'].includes(rd.state)
            const live = rd.state === 'live'
            const pct = live ? Math.min(100, Math.max(4, ((now - Date.parse(rd.startsAt)) / (Date.parse(rd.endsAt) - Date.parse(rd.startsAt))) * 100)) : 0
            return (
              <li key={rd.round} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/25" title={tr('Round {n}: {d}', { n: rd.round, d: roundDays(rd, tz, locale) })}>
                <span className={cx('block h-full rounded-full bg-white', done ? 'w-full' : !live && 'w-0')} style={live ? { width: `${pct}%` } : undefined} />
              </li>
            )
          })}
        </ol>
      </div>

      <div className="space-y-4 p-4">
        {shown ? (
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('This round')}</p>
              <p className="text-xs text-smoke">{roundDays(shown, tz, locale)}</p>
            </div>
            {top.length ? (
              <>
                {videos.length > 0 && (
                  <ul className="mb-2.5 grid grid-cols-3 gap-2">
                    {videos.map((e, i) => (
                      <li key={e.submission_id} className="animate-fade-up" style={{ animationDelay: `${i * 70}ms` }}>
                        <div className={cx('relative overflow-hidden rounded-xl', i === 0 && 'ring-2 ring-brand ring-offset-1')}>
                          <EntryPreview submission={asEntry(e)} onPlay={onPlay ? () => play(e) : undefined} compact />
                          <span className={cx('pointer-events-none absolute left-1.5 top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] font-bold', i === 0 ? 'bg-brand text-white' : 'bg-white/90 text-ink')}>{i + 1}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                <ol className="space-y-1">
                  {top.map((e, i) => (
                    <li key={e.submission_id} className={cx('flex items-center gap-2.5 rounded-xl px-2 py-1.5 animate-fade-up', e.creator_id === meId ? 'bg-brand-tint/50' : i === 0 ? 'bg-cloud' : '')} style={{ animationDelay: `${i * 50}ms` }}>
                      <span className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-bold', i === 0 ? 'bg-brand text-white' : 'bg-cloud text-smoke')}>{i + 1}</span>
                      <Link to={`/profile/${e.creator_id}`} className="flex min-w-0 flex-1 items-center gap-2 transition-transform duration-200 hoverable:hover:translate-x-0.5">
                        <Avatar src={e.photo_url} name={e.name || ''} size="xs" />
                        <span className="min-w-0 truncate text-[13px] font-semibold text-ink">{e.creator_id === meId ? tr('You') : e.name}</span>
                      </Link>
                      {e.platform && <SocialMark brand={BRAND[e.platform] || 'link'} colored className="h-3.5 w-3.5 shrink-0" />}
                      <span className="shrink-0 text-[13px] font-bold tabular-nums text-ink">{formatViews(e.views)}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="rounded-xl border border-dashed border-gray-200 px-3 py-3 text-center text-xs text-smoke">{tr('No videos posted this round yet. The first one leads.')}</p>
            )}
          </div>
        ) : (
          <p className="text-xs leading-relaxed text-smoke">{tr('The most viewed video posted in each round wins, on top of any other prize.')}</p>
        )}

        {past.length > 0 && (
          <div>
            <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-400">{tr('Winners so far')}</p>
            <ul className="space-y-2">
              {[...past].reverse().map((rd, i) => {
                const w = pick(rd)?.entries?.[0]
                return (
                  <li key={rd.round} className="flex items-center gap-3 rounded-xl border border-gray-100 p-2 animate-fade-up" style={{ animationDelay: `${i * 60}ms` }}>
                    {w ? (
                      <>
                        <Link to={`/profile/${w.creator_id}`} className="relative shrink-0">
                          <span className="block rounded-full ring-2 ring-brand ring-offset-2">
                            <Avatar src={w.photo_url} name={w.name || ''} size="sm" />
                          </span>
                          <span aria-hidden className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-brand text-white shadow-sm">
                            <Icon name="trophy" className="h-3 w-3" />
                          </span>
                        </Link>
                        <div className="min-w-0 flex-1">
                          <Link to={`/profile/${w.creator_id}`} className="block truncate text-sm font-semibold text-ink hover:text-brand">{w.creator_id === meId ? tr('You') : w.name}</Link>
                          <p className="truncate text-xs text-smoke">{tr('Round {n}', { n: rd.round })} · {roundDays(rd, tz, locale)}</p>
                          <p className="text-xs font-semibold tabular-nums text-ink">{tr('{n} views', { n: formatViews(w.views) })}</p>
                        </div>
                        {w.video_url && (
                          <div className="w-14 shrink-0 overflow-hidden rounded-lg">
                            <EntryPreview submission={asEntry(w)} onPlay={onPlay ? () => play(w) : undefined} compact bare />
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="px-1 text-xs text-smoke">{tr('Round {n}', { n: rd.round })} · {tr('Nobody posted')}</p>
                    )}
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
            {formatMoney(weekly.amount, weekly.currency || 'EUR')} {weekly.type === 'cash' ? 'cash' : 'voucher'} a round. Each round is read one last time when it ends, then frozen.{' '}
            {weekly.auto_award !== false
              ? 'The winner\'s reward is then created by itself and waits on Rewards & Payouts for you to pay out.'
              : 'Check each winner here and press Award.'}
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
                      {w.video_url && (
                        <div className="w-12 shrink-0 overflow-hidden rounded-lg">
                          <EntryPreview submission={asEntry(w)} compact bare />
                        </div>
                      )}
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
