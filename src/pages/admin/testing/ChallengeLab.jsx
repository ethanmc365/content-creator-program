import { useMemo, useState } from 'react'
import { Badge } from '../../../components/ui'
import Icon from '../../../components/Icon'
import WinnersPodium from '../../../components/WinnersPodium'
import { scoreForEntries, scoringMode } from '../../../lib/scoring'
import { challengeDeadline, formatDate, formatDateTime, formatViews } from '../../../lib/utils'
import { LabPage, Panel, Note, KeyVal, Code, Choice, useNow, CardGrid } from './kit'
import { CHALLENGE, ENTRIES, CREATORS, asProfile, at, dateOnly } from './fixtures'

// A CHALLENGE, WITH A CLOCK YOU CAN DRAG.
//
// The lifecycle is where most of the platform's automation lives and it is
// almost entirely invisible: a challenge publishes itself, reminds everybody the
// day before it closes, refuses entries after local midnight, and archives
// itself the next morning in ITS OWN market's timezone. All of that happens over
// weeks, which is exactly why it is impossible to demonstrate.
//
// So: a slider. Drag the day and the whole page re-derives - the status, the
// countdown, which scheduled job would have fired, what the creator sees, and
// whether there is a podium yet.

const DAY_MIN = -16
const DAY_MAX = 8

// Two switches, because two of the transitions here are DECISIONS and not
// clocks. Conflating them is the bug that put a half-finished leaderboard on
// the community board the morning the archive job ran.
export default function ChallengeLab() {
  const now = useNow()
  const [day, setDay] = useState(-6)
  const [scored, setScored] = useState(false)
  const [published, setPublished] = useState(false)
  const [scoring, setScoring] = useState(CHALLENGE.scoring)

  const startDay = CHALLENGE.startsInDays
  const endDay = CHALLENGE.endsInDays
  const endDate = dateOnly(endDay, now)
  const deadline = challengeDeadline(endDate)
  // The deadline is local midnight AFTER the end date, so the last full day is
  // day === endDay and entries close at the start of endDay + 1.
  const closed = day > endDay
  const live = day >= startDay && !closed
  const finalDay = day === endDay
  const archived = closed && day >= endDay + 1 && published

  const status = !live && !closed ? 'upcoming' : live ? 'active' : archived ? 'archived' : 'ended'

  // The leaderboard, ranked by the real scoring function.
  const standings = useMemo(() => {
    const byCreator = new Map()
    for (const e of ENTRIES) {
      if (!byCreator.has(e.creator)) byCreator.set(e.creator, [])
      byCreator.get(e.creator).push(e)
    }
    return [...byCreator.entries()]
      .map(([id, entries]) => {
        const creator = CREATORS.find((c) => c.id === id)
        const best = entries.slice().sort((a, b) => b.logged_views - a.logged_views)[0]
        return {
          id,
          creator,
          entries,
          score: scoreForEntries(scoring, entries),
          videoUrl: best.url,
          platform: best.platform,
        }
      })
      .sort((a, b) => b.score - a.score)
  }, [scoring])

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
    .filter((s) => s.score >= CHALLENGE.participation_threshold)
    .map((s) => asProfile(s.creator))

  const totalScore = standings.reduce((sum, s) => sum + s.score, 0)

  // Which scheduled job is relevant at this point on the slider, and what it
  // would do if it ran right now.
  const jobs = [
    {
      when: day < startDay,
      job: 'publish-scheduled-challenges',
      cron: 'every 5 minutes',
      says: `Not yet. This challenge is scheduled for ${formatDate(at(startDay, now))} and the job publishes nothing before then.`,
    },
    {
      when: day >= startDay && day < endDay,
      job: 'challenge-reminders',
      cron: '09:00 daily',
      says: `Nothing to send. Reminders go out on the final day, which is ${formatDate(at(endDay, now))}.`,
    },
    {
      when: finalDay,
      job: 'challenge-reminders',
      cron: '09:00 daily',
      says: 'Fires. Everybody in the market who has not entered gets a deadline notification, and everybody who has gets nothing.',
      hot: true,
    },
    {
      when: closed && !published,
      job: 'archive-ended-challenges',
      cron: 'daily',
      says: 'Moves the challenge to archived once the deadline has passed IN THE MARKET\'S OWN TIMEZONE. It does not publish a podium and it never has.',
      hot: day === endDay + 1,
    },
    {
      when: closed && published,
      job: 'archive-ended-challenges',
      cron: 'daily',
      says: 'Already archived. The podium on the board came from an admin pressing publish, not from this job.',
    },
  ].find((j) => j.when)

  const mode = scoringMode(scoring)

  return (
    <LabPage
      title="Challenge lifecycle"
      icon="flag"
      subtitle="Drag the day. The status, the countdown, the scheduled job, what a creator sees and whether there is a podium are all re-derived from it, using the same functions the live platform uses."
      aside={
        <Badge tone={status === 'active' ? 'brand' : status === 'upcoming' ? 'grey' : status === 'archived' ? 'grey' : 'amber'}>
          {status}
        </Badge>
      }
    >
      <Panel title="The clock" hint="Day zero is today. The challenge runs from day -12 to day +3, and entries close at local midnight after that.">
        <input
          type="range"
          min={DAY_MIN}
          max={DAY_MAX}
          step={1}
          value={day}
          onChange={(e) => setDay(Number(e.target.value))}
          aria-label="Day"
          className="w-full accent-[#d94407]"
        />
        <div className="mt-2 flex justify-between text-[10px] text-smoke">
          <span>{formatDate(at(DAY_MIN, now))}</span>
          <span className="font-semibold text-brand">{day === 0 ? 'Today' : formatDate(at(day, now))}</span>
          <span>{formatDate(at(DAY_MAX, now))}</span>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          {[
            { d: startDay - 2, label: 'Scheduled' },
            { d: startDay, label: 'Published' },
            { d: Math.round((startDay + endDay) / 2), label: 'Running' },
            { d: endDay, label: 'Final day' },
            { d: endDay + 1, label: 'Closed' },
            { d: endDay + 3, label: 'After' },
          ].map((q) => (
            <button
              key={q.label}
              type="button"
              onClick={() => setDay(q.d)}
              className={
                'rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 hover:-translate-y-0.5 ' +
                (day === q.d ? 'bg-brand text-white' : 'bg-cloud text-smoke hover:text-ink')
              }
            >
              {q.label}
            </button>
          ))}
        </div>

        <div className="mt-6 grid gap-5 lg:grid-cols-2">
          <KeyVal
            rows={[
              ['Challenge', CHALLENGE.title],
              ['Market', 'UK & Ireland, Europe/London'],
              ['Status', status],
              ['Runs', `${formatDate(at(startDay, now))} to ${formatDate(at(endDay, now))}`],
              ['Entries close', formatDateTime(deadline)],
              ['Scoring', mode.label],
              ['Winners', `${CHALLENGE.winners_count}, plus a voucher at ${formatViews(CHALLENGE.participation_threshold)} views`],
            ]}
          />
          <div className="space-y-4">
            <div className="rounded-card border border-gray-100 bg-cloud/50 p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-brand">What a creator sees today</p>
              <p className="mt-2 text-sm font-semibold">
                {!live && !closed && 'Nothing. It is not published yet.'}
                {live && !finalDay && `Open for entries. ${endDay - day} day${endDay - day === 1 ? '' : 's'} left.`}
                {finalDay && 'Closes at midnight tonight. A reminder went out this morning.'}
                {closed && !published && 'Closed. Results are being worked out.'}
                {closed && published && 'The winners, on a podium, at the top of the challenge.'}
              </p>
            </div>
            {jobs && (
              <div className={'rounded-card border p-4 ' + (jobs.hot ? 'border-brand/30 bg-brand-tint/30' : 'border-gray-100 bg-white')}>
                <div className="flex items-center gap-2">
                  <Icon name="clock" className={'h-4 w-4 ' + (jobs.hot ? 'text-brand' : 'text-smoke')} />
                  <code className="text-xs font-semibold">{jobs.job}</code>
                  <span className="text-[11px] text-smoke">{jobs.cron}</span>
                  {jobs.hot && <Badge tone="brand" className="!px-2 !py-0.5 !text-[10px]">fires now</Badge>}
                </div>
                <p className="mt-2 text-xs leading-relaxed text-smoke">{jobs.says}</p>
              </div>
            )}
          </div>
        </div>
      </Panel>

      <Panel
        title="Closing it"
        hint="Two things happen after the deadline and they are separate on purpose. One is arithmetic. The other is a decision."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            disabled={!closed}
            onClick={() => setScored((v) => !v)}
            className={
              'card flex items-start gap-3 !p-5 text-left transition-all duration-200 disabled:opacity-40 ' +
              (scored ? 'border-brand/40 bg-brand-tint/30' : 'hover:-translate-y-0.5 hover:shadow-lift')
            }
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
              <Icon name={scored ? 'check' : 'chart'} className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold">1. Log the final view counts</span>
              <span className="mt-1 block text-xs leading-relaxed text-smoke">
                An admin records what each entry actually did. A results row exists from the first view
                logged, including mid-challenge interim standings.
              </span>
            </span>
          </button>

          <button
            type="button"
            disabled={!scored}
            onClick={() => setPublished((v) => !v)}
            className={
              'card flex items-start gap-3 !p-5 text-left transition-all duration-200 disabled:opacity-40 ' +
              (published ? 'border-brand/40 bg-brand-tint/30' : 'hover:-translate-y-0.5 hover:shadow-lift')
            }
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
              <Icon name={published ? 'check' : 'trophy'} className="h-4 w-4" />
            </span>
            <span>
              <span className="block text-sm font-semibold">2. Publish the winners</span>
              <span className="mt-1 block text-xs leading-relaxed text-smoke">
                A deliberate press that stamps winners_published_at. Only then does a podium appear
                anywhere a creator can see it.
              </span>
            </span>
          </button>
        </div>

        <Note className="mt-5" tone="warn" icon="alert">
          <p className="font-semibold">This is the bug that shipped, and the fix for it.</p>
          <p>
            The podium used to be gated on "are there any results", which is true from the first view an
            admin logs. So the morning the archive job ran, a half-finished interim leaderboard appeared on
            the community board as though it were the result. Existing rows are not a decision. The
            publish press is.
          </p>
        </Note>
      </Panel>

      <Panel
        title="The podium"
        hint="The real component, drawn with the real ranking function over the demo entries. Change the scoring mode and watch the order change."
        action={<Choice size="sm" value={scoring} onChange={setScoring} options={[
          { value: 'best_video', label: 'Best video' },
          { value: 'total_views', label: 'Total views' },
          { value: 'points', label: 'Points' },
        ]} />}
      >
        {published ? (
          <WinnersPodium
            winners={winners}
            entries={ENTRIES.length}
            totalScore={totalScore}
            scoring={scoring}
            voucherWinners={voucherWinners}
            voucherPrize={CHALLENGE.participation_prize}
          />
        ) : (
          <div className="rounded-card border border-dashed border-gray-200 bg-white px-6 py-14 text-center">
            <Icon name="trophy" className="mx-auto h-8 w-8 text-gray-300" />
            <p className="mt-3 text-sm font-semibold">No podium yet</p>
            <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-smoke">
              {!closed
                ? 'The challenge is still running. Drag the day past the deadline.'
                : !scored
                  ? 'The views have not been logged yet.'
                  : 'The views are logged, but nobody has published the winners. This empty state is the fix working.'}
            </p>
          </div>
        )}
      </Panel>

      <Panel title="The prizes, as configured" hint="Places live in a JSON structure on the challenge. There is no numeric prize column, and the participation voucher is structured rather than parsed out of a sentence.">
        <div className="grid gap-5 lg:grid-cols-2">
          <CardGrid cols={2} className="!gap-3">
            {CHALLENGE.prize_structure.map((p) => (
              <div key={p.place} className="card !p-4">
                <p className="text-xs font-semibold text-brand">{p.place === 1 ? '1st' : p.place === 2 ? '2nd' : '3rd'} place</p>
                <p className="mt-1 text-lg font-bold">{p.prize}</p>
              </div>
            ))}
            <div className="card !p-4">
              <p className="text-xs font-semibold text-brand">Everybody else</p>
              <p className="mt-1 text-lg font-bold">{CHALLENGE.participation_prize}</p>
              <p className="mt-1 text-[11px] text-smoke">at {formatViews(CHALLENGE.participation_threshold)} views</p>
            </div>
          </CardGrid>
          <Code>{JSON.stringify({
            prize_structure: CHALLENGE.prize_structure,
            participation_threshold: CHALLENGE.participation_threshold,
            participation_prize: CHALLENGE.participation_prize,
            winners_count: CHALLENGE.winners_count,
            scoring,
            winners_published_at: published ? at(endDay + 1, now).toISOString() : null,
          }, null, 2)}</Code>
        </div>
      </Panel>

      <Panel title="Two timezone rules that are easy to get wrong" tone="quiet">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card !p-5">
            <p className="text-sm font-semibold">Entries close at local midnight, not at the end date</p>
            <p className="mt-1.5 text-xs leading-relaxed text-smoke">
              A challenge ending on the {formatDate(at(endDay, now))} means you can post all of that day.
              The deadline is the start of the day after it.
            </p>
            <Code className="mt-3">{`challengeDeadline('${endDate}')\n  -> ${formatDateTime(deadline)}`}</Code>
          </div>
          <div className="card !p-5">
            <p className="text-sm font-semibold">The archive job reads the market's own timezone</p>
            <p className="mt-1.5 text-xs leading-relaxed text-smoke">
              It used to compare a timestamp to midnight UTC, which archived Spain and Romania a day early.
              It resolves communities.timezone now.
            </p>
            <Code className="mt-3">{"archive_ended_challenges()\n  -> now() at time zone communities.timezone"}</Code>
          </div>
        </div>
      </Panel>
    </LabPage>
  )
}
