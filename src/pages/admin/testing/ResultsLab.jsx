import { useMemo, useRef, useState } from 'react'
import { Badge } from '../../../components/ui'
import Icon from '../../../components/Icon'
import WinnersPodium from '../../../components/WinnersPodium'
import { scoreForEntries, scoringMode } from '../../../lib/scoring'
import { formatViews, formatMoney } from '../../../lib/utils'
import { LabPage, Panel, Choice, Code, KeyVal, InfoList, useFlip, useCountTo, PersonRow } from './kit'
import { CHALLENGE, ENTRIES, CREATORS, asProfile } from './fixtures'

// A CHALLENGE ENDING, FROM THE LAST ENTRY TO THE MONEY.
//
// This is the twenty minutes of a month that nobody outside the team ever sees,
// and it is where the whole programme either feels fair or does not. Four
// things happen in order and they are deliberately separate:
//
//   1  an admin logs the final view count against every entry
//   2  the standings exist, and they are STILL NOT PUBLIC
//   3  an admin publishes, which is a decision and not a calculation
//   4  the podium, the vouchers, the notifications and the invoices follow
//
// Step two is the one worth stopping on. A results row exists from the very
// first view an admin logs, including the interim standings taken halfway
// through, and the podium used to be gated on "are there any results" - so the
// morning the archive job ran, a half-finished leaderboard appeared on the
// community board as though it were the final answer. Existing rows are not a
// decision. The publish press is.

const PHASES = ['logging', 'standings', 'published']

export default function ResultsLab() {
  const [phase, setPhase] = useState('logging')
  const [scoring, setScoring] = useState(CHALLENGE.scoring)
  const [threshold, setThreshold] = useState(CHALLENGE.participation_threshold)
  const [views, setViews] = useState(() => Object.fromEntries(ENTRIES.map((e) => [e.id, e.logged_views])))
  const [logged, setLogged] = useState(() => new Set())

  const entries = ENTRIES.map((e) => ({ ...e, logged_views: views[e.id], done: logged.has(e.id) }))
  const allLogged = logged.size === ENTRIES.length

  const standings = useMemo(() => {
    const by = new Map()
    for (const e of entries) {
      if (!by.has(e.creator)) by.set(e.creator, [])
      by.get(e.creator).push(e)
    }
    return [...by.entries()]
      .map(([id, list]) => {
        const best = list.slice().sort((a, b) => b.logged_views - a.logged_views)[0]
        return {
          id,
          creator: CREATORS.find((c) => c.id === id),
          posts: list.length,
          score: scoreForEntries(scoring, list),
          videoUrl: best.url,
          platform: best.platform,
        }
      })
      .sort((a, b) => b.score - a.score)
  // `entries` is derived from `views` on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views, scoring])

  const boardRef = useRef(null)
  useFlip(boardRef, standings.map((s) => s.id).join('|'))

  const winners = standings.slice(0, CHALLENGE.winners_count).map((s, i) => ({
    rank: i + 1,
    profiles: asProfile(s.creator),
    final_views: s.score,
    points: s.score,
    videoUrl: s.videoUrl,
    platform: s.platform,
  }))

  const voucherWinners = standings
    .slice(CHALLENGE.winners_count)
    .filter((s) => s.score >= threshold)
    .map((s) => asProfile(s.creator))

  const missed = standings.slice(CHALLENGE.winners_count).filter((s) => s.score < threshold)
  const totalScore = standings.reduce((sum, s) => sum + s.score, 0)
  const voucherSpend = voucherWinners.length * 10
  const cashSpend = 500

  function logAll() {
    setLogged(new Set(ENTRIES.map((e) => e.id)))
    setPhase('standings')
  }

  function reset() {
    setLogged(new Set())
    setPhase('logging')
    setViews(Object.fromEntries(ENTRIES.map((e) => [e.id, e.logged_views])))
  }

  return (
    <LabPage
      title="Results and the podium"
      icon="trophy"
      subtitle="The twenty minutes of a month nobody outside the team sees. Log the views, look at standings that are still private, then publish and watch the podium and the vouchers land."
      aside={
        <div className="flex items-center gap-1.5">
          {PHASES.map((p, i) => (
            <span
              key={p}
              className={
                'rounded-full px-2.5 py-1 text-[11px] font-semibold capitalize transition-colors duration-300 ' +
                (PHASES.indexOf(phase) >= i ? 'bg-brand text-white' : 'bg-cloud text-gray-400')
              }
            >
              {p === 'standings' ? 'not public yet' : p}
            </span>
          ))}
        </div>
      }
    >
      {/* -------------------------------------------------- 1. logging --- */}
      <Panel
        i={0}
        title="1. An admin logs the final view counts"
        hint="One number per entry, taken from the platform it was posted on. This is the only manual step in the whole close, and it is manual on purpose: nobody has an API that reports a creator's own view counts honestly."
        action={
          <div className="flex gap-2">
            <button type="button" onClick={logAll} className="btn-secondary text-xs">Log them all</button>
            <button type="button" onClick={reset} className="btn-ghost text-xs">Reset</button>
          </div>
        }
      >
        <div className="space-y-2">
          {entries.map((e) => {
            const c = CREATORS.find((x) => x.id === e.creator)
            return (
              <div
                key={e.id}
                className={
                  'flex flex-wrap items-center gap-3 rounded-card border px-4 py-3 transition-colors duration-300 ' +
                  (e.done ? 'border-green-200 bg-green-50/50' : 'border-gray-100 bg-white')
                }
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{c.name}</span>
                  <span className="block truncate text-[11px] text-smoke">{e.platform} · {e.url}</span>
                </span>
                <input
                  type="number"
                  step={1000}
                  min={0}
                  value={e.logged_views}
                  aria-label={`${c.name} final views`}
                  onChange={(ev) => setViews((v) => ({ ...v, [e.id]: Math.max(0, Number(ev.target.value) || 0) }))}
                  className="input !w-32 !py-1.5 text-right text-sm tabular-nums"
                />
                <button
                  type="button"
                  onClick={() => setLogged((s) => {
                    const n = new Set(s)
                    if (n.has(e.id)) n.delete(e.id); else n.add(e.id)
                    return n
                  })}
                  className={
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-200 hover:scale-110 ' +
                    (e.done ? 'bg-green-600 text-white' : 'bg-cloud text-gray-400')
                  }
                  aria-label={e.done ? 'Mark as not logged' : 'Mark as logged'}
                >
                  <Icon name="check" className="h-4 w-4" />
                </button>
              </div>
            )
          })}
        </div>
        <div className="mt-4 flex items-center justify-between text-xs text-smoke">
          <span>{logged.size} of {ENTRIES.length} logged</span>
          <span className="font-semibold tabular-nums">{formatViews(totalScore)} counted so far</span>
        </div>
      </Panel>

      {/* ----------------------------------------------- 2. standings --- */}
      <Panel
        i={1}
        title="2. The standings exist, and nobody can see them"
        hint="A results row is written from the very first view logged. That is not the same thing as a result, and this is the distinction that once put a half-finished leaderboard on the community board."
        action={<Choice size="sm" value={scoring} onChange={setScoring} options={[
          { value: 'best_video', label: 'Best video' },
          { value: 'total_views', label: 'Total views' },
          { value: 'points', label: 'Points' },
        ]} />}
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wide text-smoke">Admin view</p>
              <Badge tone="amber">private</Badge>
            </div>
            <ol ref={boardRef} className="space-y-2">
              {standings.map((row, i) => (
                <StandingRow key={row.id} row={row} rank={i} scoring={scoring} threshold={threshold} winners={CHALLENGE.winners_count} />
              ))}
            </ol>
            <p className="mt-3 text-[11px] text-smoke">
              Ranked by {scoringMode(scoring).label.toLowerCase()}. Drag a number above and these move.
            </p>
          </div>

          <div className="space-y-4">
            <div className="rounded-card border border-dashed border-gray-200 bg-white px-6 py-10 text-center">
              <Icon name="eye" className="mx-auto h-7 w-7 text-gray-300" />
              <p className="mt-3 text-sm font-semibold">What a creator sees right now</p>
              <p className="mx-auto mt-1.5 max-w-xs text-xs leading-relaxed text-smoke">
                &ldquo;Closed. Results are being worked out.&rdquo; No podium, no ranking, no partial
                order that could be screenshotted and passed around before it is final.
              </p>
            </div>
            <InfoList
              columns={1}
              items={[
                { icon: 'alert', t: 'Rows are not a decision', d: 'Results rows exist from the first logged view, including any interim standings taken mid-challenge. Gating the podium on "are there results" published a half-finished leaderboard once.' },
                { icon: 'check', t: 'winners_published_at is the gate', d: 'One timestamp, set by a person pressing a button. Everything public reads that column and nothing else.' },
              ]}
            />
            <button
              type="button"
              disabled={!allLogged}
              onClick={() => setPhase('published')}
              className="btn-primary w-full disabled:opacity-40"
            >
              {allLogged ? '3. Publish the winners' : `Log all ${ENTRIES.length} entries first`}
            </button>
          </div>
        </div>
      </Panel>

      {/* ----------------------------------------------- 3. published --- */}
      <Panel
        i={2}
        title="3. Published"
        hint="Now, and only now, there is a podium. This is the real component, drawn with the real ranking function over the test entries."
        action={phase === 'published' && (
          <button type="button" onClick={() => setPhase('standings')} className="btn-ghost text-xs">Un-publish</button>
        )}
      >
        {phase === 'published' ? (
          <div key={`${scoring}-${threshold}`} className="podium-in mx-auto max-w-2xl">
            <WinnersPodium
              winners={winners}
              entries={ENTRIES.length}
              totalScore={totalScore}
              scoring={scoring}
              voucherWinners={voucherWinners}
              voucherPrize={CHALLENGE.participation_prize}
            />
          </div>
        ) : (
          <div className="rounded-card border border-dashed border-gray-200 bg-white px-6 py-14 text-center">
            <Icon name="trophy" className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-3 text-sm font-semibold">Not published</p>
            <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-smoke">
              {allLogged
                ? 'Everything is logged and the standings are settled. Press publish above.'
                : 'Log the final view counts first.'}
            </p>
          </div>
        )}
      </Panel>

      {/* ------------------------------------------------- the voucher --- */}
      <Panel
        i={3}
        title={`The ${CHALLENGE.participation_prize}`}
        hint="Everybody who is not on the podium but cleared the bar gets one. Move the bar and watch the row change: this is the control that decides how much a challenge costs beyond its prize pot."
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <div>
            {/* The value sits WITH the label, not centred under the track. It
                was centred, which put "5k" in the middle of a bar whose handle
                was near the left end and read as the midpoint of the range. */}
            <div className="flex items-baseline justify-between gap-3">
              <label htmlFor="threshold" className="label !mb-0">Views needed for a voucher</label>
              <span className="text-lg font-bold tabular-nums text-brand">{formatViews(threshold)}</span>
            </div>
            <input
              id="threshold"
              type="range"
              min={0}
              max={120000}
              step={1000}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="mt-2 w-full accent-[#d94407]"
            />
            <div className="mt-1 flex justify-between text-[11px] text-smoke">
              <span>Everyone who entered</span>
              <span>120k</span>
            </div>

            <div className="mt-6 space-y-2">
              {voucherWinners.length === 0 ? (
                <p className="rounded-card border border-dashed border-gray-200 px-4 py-6 text-center text-xs text-smoke">
                  Nobody clears {formatViews(threshold)}. The voucher row does not render at all rather
                  than rendering empty, because a heading over nothing is worse than no heading.
                </p>
              ) : voucherWinners.map((v) => {
                const c = CREATORS.find((x) => x.id === v.id)
                const row = standings.find((s) => s.id === v.id)
                return (
                  <div key={v.id} className="rounded-card border border-brand/20 bg-brand-tint/25 px-4 py-2.5">
                    <PersonRow
                      creator={c}
                      sub={`${formatViews(row.score)} · cleared the bar`}
                      right={<Badge tone="light">{CHALLENGE.participation_prize}</Badge>}
                    />
                  </div>
                )
              })}
              {missed.map((s) => (
                <div key={s.id} className="rounded-card border border-gray-100 px-4 py-2.5 opacity-60">
                  <PersonRow
                    creator={s.creator}
                    sub={`${formatViews(s.score)} · ${formatViews(threshold - s.score)} short`}
                    right={<span className="text-[11px] text-gray-400">no voucher</span>}
                  />
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            <KeyVal
              rows={[
                ['Entries', String(ENTRIES.length)],
                ['Creators', String(standings.length)],
                ['On the podium', String(Math.min(CHALLENGE.winners_count, standings.length))],
                ['Vouchers earned', String(voucherWinners.length)],
                ['Just missed', String(missed.length)],
                ['Cash prizes', formatMoney(cashSpend)],
                ['Vouchers', formatMoney(voucherSpend)],
                ['Total for this challenge', formatMoney(cashSpend + voucherSpend)],
                ['Total views', formatViews(totalScore)],
                ['Cost per 1,000 views', totalScore ? `£${((cashSpend + voucherSpend) / (totalScore / 1000)).toFixed(2)}` : '-'],
              ]}
            />
            <InfoList
              columns={1}
              items={[
                { icon: 'money', t: 'The voucher is structured, not parsed', d: 'A threshold column and a prize column on the challenge, rather than a sentence somebody has to read the number out of. There is a legacy parser for the challenges written before that, and it is a fallback only.' },
                { icon: 'users', t: 'It exists so second place is not last place', d: 'A challenge where only three people get anything is a challenge most creators enter once. The bar is what turns "did not win" into "got something".' },
              ]}
            />
          </div>
        </div>
      </Panel>

      {/* --------------------------------------------- 4. what follows --- */}
      <Panel i={3} title="4. What publishing sets off" hint="None of this needs anybody to remember it.">
        <div className="space-y-2">
          {[
            ['push', 'Every entrant is notified', `${standings.length} notifications, each one saying where that creator finished.`],
            ['trophy', 'The podium appears', 'On the challenge, on the community board and on the market home page.'],
            ['money', `${Math.min(CHALLENGE.winners_count, standings.length)} cash rewards are created`, 'Each one pending, each one waiting on a payment.'],
            ['copy', `${Math.min(CHALLENGE.winners_count, standings.length)} draft invoices raise themselves`, 'Numbered, addressed, and carrying the bank details as they are at that moment. See the invoicing lab.'],
            ['ticket', `${voucherWinners.length} vouchers are issued`, 'Recorded as rewards too, so the spend figure above is the whole spend and not just the prizes.'],
            ['book', 'The challenge archives itself overnight', "In its own market's timezone, not in UTC."],
          ].map(([icon, title, detail]) => (
            <div key={title} className="flex items-start gap-3 rounded-card bg-cloud/60 px-4 py-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white text-brand">
                <Icon name={icon} className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-smoke">{detail}</p>
              </div>
            </div>
          ))}
        </div>
        <Code className="mt-5">{`update challenges
   set winners_published_at = now()
 where id = '${CHALLENGE.id}';

-- everything public reads THAT column, and nothing else:
--   the podium on the challenge
--   the podium on the community board
--   the "results are in" notification
--   the rewards, and the invoices behind them`}</Code>
      </Panel>
    </LabPage>
  )
}

function StandingRow({ row, rank, scoring, threshold, winners }) {
  const shown = useCountTo(row.score, 520)
  const podium = rank < winners
  const voucher = !podium && row.score >= threshold
  return (
    <li
      data-flip-key={row.id}
      className={
        'flex items-center gap-3 rounded-card border px-4 py-2.5 transition-colors duration-500 ' +
        (podium ? 'border-brand/30 bg-brand-tint/30' : voucher ? 'border-brand/15 bg-brand-tint/15' : 'border-gray-100 bg-white')
      }
    >
      <span className={'w-5 shrink-0 text-sm font-bold tabular-nums transition-colors duration-500 ' + (podium ? 'text-brand' : 'text-gray-300')}>
        {rank + 1}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold">{row.creator.name}</span>
      {voucher && <Badge tone="light" className="!px-2 !py-0.5 !text-[10px]">voucher</Badge>}
      <span className="shrink-0 text-sm font-bold tabular-nums">
        {scoring === 'points' ? `${shown} pts` : formatViews(shown)}
      </span>
    </li>
  )
}
