import { useMemo, useRef, useState } from 'react'
import { Badge } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { SCORING_MODES, STARTER_POINT_RULES, scoreForEntries, scoringMode, isViewRanked } from '../../../lib/scoring'
import { blendEconomics, challengeEconomics, CPM_BANDS, FALLBACK_RATES, groupBy } from '../../../lib/programme'
import { formatMoney, formatViews } from '../../../lib/utils'
import { LabPage, Panel, Note, KeyVal, Choice, Code, CardGrid, InfoList, useFlip, useCountTo } from './kit'
import { CREATORS, ENTRIES, POINT_AWARDS, PAST_CHALLENGES, marketName } from './fixtures'

// SCORING AND WHAT IT COSTS.
//
// Two questions a chief executive asks in the first five minutes: how does
// somebody win, and what are we paying per view. Both are answered here by the
// real functions, over entries you can edit with a slider. Drag a view count
// and the leaderboard reorders, the winner changes, and the cost per thousand
// views moves. That is a far better answer than a slide with a number on it.

const BAND_TONE = { good: 'green', warn: 'amber', bad: 'red', neutral: 'grey' }
const bandMeta = (key) => CPM_BANDS.find((b) => b.key === key) || CPM_BANDS[3]

/**
 * One row of the leaderboard.
 *
 * `data-flip-key` is what useFlip finds it by, and the score counts to its new
 * value rather than jumping - because when three creators all move at once, a
 * number that changes instantly reads as a re-render and a number that travels
 * reads as a result.
 */
function BoardRow({ row, rank, scoring }) {
  const shown = useCountTo(row.score, 520)
  const top = rank < 3
  return (
    <li
      data-flip-key={row.id}
      className={
        'flex items-center gap-3 rounded-card border px-4 py-3 transition-colors duration-500 ' +
        (top ? 'border-brand/25 bg-brand-tint/25' : 'border-gray-100 bg-white')
      }
    >
      <span className={'w-5 shrink-0 text-sm font-bold tabular-nums transition-colors duration-500 ' + (top ? 'text-brand' : 'text-gray-300')}>
        {rank + 1}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{row.creator.name}</span>
        <span className="block text-[11px] text-smoke">
          {row.posts} {row.posts === 1 ? 'entry' : 'entries'}
          {scoring === 'points' ? '' : ` · best ${formatViews(row.bestViews)} · total ${formatViews(row.totalViews)}`}
        </span>
      </span>
      <span className="shrink-0 text-sm font-bold tabular-nums">
        {scoring === 'points' ? `${shown} pts` : formatViews(shown)}
      </span>
    </li>
  )
}

export default function ProgrammeLab() {
  const [scoring, setScoring] = useState('best_video')
  const [views, setViews] = useState(() => Object.fromEntries(ENTRIES.map((e) => [e.id, e.logged_views])))
  const [currency, setCurrency] = useState('GBP')

  const entries = ENTRIES.map((e) => ({ ...e, logged_views: views[e.id] }))

  const standings = useMemo(() => {
    const byCreator = new Map()
    for (const e of entries) {
      if (!byCreator.has(e.creator)) byCreator.set(e.creator, [])
      byCreator.get(e.creator).push(e)
    }
    const pointsFor = (id) => POINT_AWARDS.filter((a) => a.creator === id).reduce((s, a) => s + a.points, 0)
    return [...byCreator.entries()]
      .map(([id, list]) => ({
        id,
        creator: CREATORS.find((c) => c.id === id),
        posts: list.length,
        score: scoring === 'points' ? pointsFor(id) : scoreForEntries(scoring, list),
        totalViews: list.reduce((s, e) => s + e.logged_views, 0),
        bestViews: Math.max(...list.map((e) => e.logged_views)),
      }))
      .sort((a, b) => b.score - a.score)
  // entries is derived from `views` every render; depending on it directly
  // would rebuild this on every unrelated state change.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [views, scoring])

  const mode = scoringMode(scoring)

  // THE REORDER IS THE POINT, SO IT HAS TO BE VISIBLE.
  // A list that simply re-renders in a new order shows you the AFTER and never
  // the change, and which creator overtook which is the entire thing this panel
  // is for. useFlip measures where each row was, lets React put it where it now
  // goes, and animates the difference away. See kit.jsx.
  const boardRef = useRef(null)
  useFlip(boardRef, standings.map((s2) => s2.id).join('|'))

  // Economics over the fabricated history, through the real functions.
  const rows = PAST_CHALLENGES.map((c) => challengeEconomics(c, { currency, rates: FALLBACK_RATES }))
  const blended = blendEconomics(rows, { currency })
  const byMarket = groupBy(rows, (r) => marketName(r.market), { currency })

  const money = (v) => (v == null ? '-' : formatMoney(v, currency))
  const cpm = (v) => (v == null ? '-' : `${currency === 'EUR' ? '€' : '£'}${v.toFixed(2)}`)

  return (
    <LabPage
      title="Scoring and cost per view"
      icon="chart"
      subtitle="How somebody wins, and what a challenge costs. Both answered by the functions the platform actually runs, over entries you can change with a slider."
    >
      <Panel
        i={0}
        title="The three scoring modes"
        hint="Chosen per challenge, never per market. A fourth value exists in the database for every challenge run before August 2026 and is never offered again, because silently remapping an old contest rewrites its history."
      >
        <CardGrid>
          {SCORING_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setScoring(m.value)}
              className={
                'card flex h-full flex-col !p-5 text-left transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift ' +
                (scoring === m.value ? 'border-brand/40 bg-brand-tint/30' : '')
              }
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-tint text-brand">
                <Icon name={m.icon} className="h-4 w-4" />
              </span>
              <p className="mt-3 text-sm font-semibold">{m.label}</p>
              <p className="mt-1.5 flex-1 text-xs leading-relaxed text-smoke">{m.blurb}</p>
              <p className="mt-3 text-[11px] font-semibold text-brand">{m.winner}</p>
            </button>
          ))}
        </CardGrid>
      </Panel>

      <Panel
        i={1}
        title="Change the numbers and watch the winner change"
        hint="These are the view counts an admin logs when a challenge closes. Drag one, or switch the mode, and watch the rows move. Nothing is faked: the order comes from scoreForEntries, exactly as the leaderboard calls it."
      >
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-4">
            {entries.map((e) => {
              const c = CREATORS.find((x) => x.id === e.creator)
              return (
                <div key={e.id}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="truncate text-xs font-medium">
                      {c.name} <span className="text-smoke">{e.platform}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums">{formatViews(e.logged_views)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={600000}
                    step={1000}
                    value={e.logged_views}
                    aria-label={`${c.name} views`}
                    onChange={(ev) => setViews((v) => ({ ...v, [e.id]: Number(ev.target.value) }))}
                    className="mt-1 w-full accent-[#d94407]"
                  />
                </div>
              )
            })}
            <button
              type="button"
              onClick={() => setViews(Object.fromEntries(ENTRIES.map((e) => [e.id, e.logged_views])))}
              className="btn-ghost text-xs"
            >
              Put them back
            </button>
          </div>

          <div>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-smoke">Leaderboard</p>
              <Badge tone="light">{mode.short}</Badge>
            </div>
            <ol ref={boardRef} className="space-y-2">
              {standings.map((row, i) => (
                <BoardRow key={row.id} row={row} rank={i} scoring={scoring} />
              ))}
            </ol>
            <Note className="mt-4">
              <p>
                {scoring === 'total_views' && 'Every entry adds up, so somebody who posts three good videos can beat somebody who posts one great one. This is the mode that rewards showing up.'}
                {scoring === 'best_video' && 'Only the strongest video counts, however many you post. Enter as often as you like without diluting yourself.'}
                {scoring === 'points' && 'The ranking above ignores the sliders entirely, because a points leaderboard comes from the ledger and includes awards a human made. No view count can reproduce it.'}
              </p>
            </Note>
          </div>
        </div>
      </Panel>

      <Panel
        i={2}
        title="The points ledger"
        hint="What a points challenge starts with. Rules live in code, not on a market, so a brand new market can run one on day one."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-smoke">Starter rules</p>
            <KeyVal
              rows={STARTER_POINT_RULES.map((r) => [
                r.label,
                `${r.points} ${r.points === 1 ? 'point' : 'points'}`,
                r.max_points ? `capped at ${r.max_points}` : null,
              ])}
            />
          </div>
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-smoke">Awards on this challenge</p>
            <div className="space-y-1.5">
              {POINT_AWARDS.map((a, i) => {
                const c = CREATORS.find((x) => x.id === a.creator)
                return (
                  <div key={`${a.creator}-${i}`} className="flex items-center gap-3 rounded-xl bg-cloud/60 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-xs">
                      <span className="font-semibold">{c.name.split(' ')[0]}</span>
                      <span className="text-smoke"> · {a.label}</span>
                    </span>
                    {a.kind === 'manual' && <Badge tone="light" className="!px-2 !py-0.5 !text-[10px]">by hand</Badge>}
                    <span className="shrink-0 text-xs font-bold tabular-nums text-brand">+{a.points}</span>
                  </div>
                )
              })}
            </div>
            <Note className="mt-4" icon="bulb">
              <p>
                One of these was awarded by a person. That is why isViewRanked(&apos;points&apos;) is{' '}
                <code className="font-semibold">{String(isViewRanked('points'))}</code> and why a points
                leaderboard is never recomputed from view counts.
              </p>
            </Note>
          </div>
        </div>
      </Panel>

      <Panel
        i={3}
        title="What it costs"
        hint="Six challenges through challengeEconomics, blended the honest way: spend and views summed first and divided once, never an average of averages."
        action={<Choice size="sm" value={currency} onChange={setCurrency} options={[{ value: 'GBP', label: 'Pounds' }, { value: 'EUR', label: 'Euros' }]} />}
      >
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            ['Blended cost per 1,000 views', cpm(blended.cpm)],
            ['Total spend', money(blended.spend)],
            ['Total views', formatViews(blended.views)],
            ['On target', blended.onTargetPct == null ? '-' : `${blended.onTargetPct}%`],
          ].map(([l, v]) => (
            <div key={l} className="card !p-4">
              <p className="text-[11px] font-medium leading-tight text-smoke">{l}</p>
              <p className="mt-1.5 text-2xl font-bold tracking-tight">{v}</p>
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-smoke">
                <th className="pb-2">Challenge</th>
                <th className="pb-2">Market</th>
                <th className="pb-2 text-right">Spend</th>
                <th className="pb-2 text-right">Views</th>
                <th className="pb-2 text-right">Per 1,000</th>
                <th className="pb-2 text-right">Per post</th>
                <th className="pb-2 text-right">Top video</th>
                <th className="pb-2 text-right">Band</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rows.map((r) => {
                const b = bandMeta(r.band)
                return (
                  <tr key={r.id}>
                    <td className="max-w-[14rem] truncate py-3 pr-4 text-xs font-medium">{r.title}</td>
                    <td className="py-3 pr-4 text-xs text-smoke">{marketName(r.market)}</td>
                    <td className="py-3 pr-4 text-right text-xs tabular-nums">{money(r.spend)}</td>
                    <td className="py-3 pr-4 text-right text-xs tabular-nums">{r.views ? formatViews(r.views) : '-'}</td>
                    <td className="py-3 pr-4 text-right text-xs font-semibold tabular-nums">{cpm(r.cpm)}</td>
                    <td className="py-3 pr-4 text-right text-xs tabular-nums">{money(r.costPerPost)}</td>
                    <td className="py-3 pr-4 text-right text-xs tabular-nums">
                      {r.topVideoShare == null ? '-' : `${Math.round(r.topVideoShare * 100)}%`}
                    </td>
                    <td className="py-3 text-right"><Badge tone={BAND_TONE[b.tone]}>{b.label}</Badge></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-smoke">By market</p>
            <KeyVal rows={byMarket.map((g) => [g.key, cpm(g.blended.cpm), `${money(g.blended.spend)} over ${g.blended.challenges}`])} />
          </div>
          <div className="space-y-4">
            <InfoList
              columns={1}
              items={[
                { icon: 'alert', t: 'Blank is not zero', d: 'A challenge with no views logged has an UNKNOWN cost per thousand. Showing it as nothing would make the worst result on the board look like the best one.' },
                { icon: 'chart', t: 'Blended, not an average of averages', d: 'Spend and views are summed first and divided once. Averaging per-challenge figures weights a small express challenge the same as a monthly one.' },
              ]}
            />
            <Code>{`cpm  = spend / (views / 1000)
band = cpm <= target        -> on target
       cpm <= target * 2    -> watch
       otherwise            -> over target
       no views, ended      -> no views logged
       no views, running    -> awaiting results

target defaults to ${currency === 'EUR' ? '€' : '£'}0.50`}</Code>
          </div>
        </div>
      </Panel>
    </LabPage>
  )
}
