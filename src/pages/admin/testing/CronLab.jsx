import { useState } from 'react'
import { Badge } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { formatDate } from '../../../lib/utils'
import { LabPage, Panel, Note, Code, KeyVal, useNow, PersonRow } from './kit'
import { CREATORS, CHALLENGE, at, marketName } from './fixtures'

// THE JOBS THAT RUN THEMSELVES.
//
// Nine of them, all pg_cron inside the database rather than a server somewhere
// that has to stay up. Between them they send the birthday cards, nudge the
// people who have gone quiet, publish and close the challenges, post the
// announcements somebody wrote last Tuesday, and permanently delete the
// accounts whose thirty day grace period has run out.
//
// None of it is observable. You cannot press a scheduled job, and the only
// evidence any of them ran is that the right thing happened at seven in the
// morning. So each one here carries a DRY RUN: the same condition, evaluated
// against the invented roster, listing exactly who it would touch and what it
// would write. Pressing it changes nothing.

// Extra state the roster does not carry, kept local so the fixtures stay lean.
// Two birthdays today, three people who have gone quiet, one account in its
// deletion grace period. Enough for every job to have something to say.
const EXTRA = {
  'demo-c1': { lastSeenDays: 0, birthdayToday: false },
  'demo-c2': { lastSeenDays: 1, birthdayToday: true },
  'demo-c3': { lastSeenDays: 2, birthdayToday: false },
  'demo-c4': { lastSeenDays: 31, birthdayToday: false },
  'demo-c5': { lastSeenDays: 44, birthdayToday: false },
  'demo-c6': { lastSeenDays: 0, birthdayToday: true },
  'demo-c7': { lastSeenDays: 66, birthdayToday: false, deletionRequestedDays: 31 },
  'demo-c8': { lastSeenDays: 3, birthdayToday: false },
}

const ex = (id) => EXTRA[id] || { lastSeenDays: 5, birthdayToday: false }

export default function CronLab() {
  const now = useNow()
  const [ran, setRan] = useState({})

  const JOBS = [
    {
      key: 'publish-scheduled-challenges',
      icon: 'flag',
      cron: '*/5 * * * *',
      when: 'Every five minutes',
      checks: 'Challenges with a status of upcoming whose start date has arrived.',
      writes: 'Sets them active and notifies everybody in that market.',
      why: 'So a challenge can be written on a Tuesday and go live on a Saturday morning without anybody being awake for it.',
      run: () => ({
        summary: `Nothing to publish. The next one starts ${formatDate(at(CHALLENGE.startsInDays + 30, now))}.`,
        rows: [],
      }),
    },
    {
      key: 'challenge-reminders',
      icon: 'clock',
      cron: '0 9 * * *',
      when: '09:00 daily',
      checks: 'Any active challenge whose final day is today, and who in that market has not entered it.',
      writes: 'One deadline notification each, to the people who have not entered and to nobody else.',
      why: 'Reminding somebody who already entered is how a useful notification becomes noise.',
      run: () => {
        const entered = new Set(['demo-c1', 'demo-c2', 'demo-c3', 'demo-c4', 'demo-c5', 'demo-c6', 'demo-c7'])
        const rows = CREATORS.filter((c) => c.market === CHALLENGE.market && !entered.has(c.id))
        return {
          summary: rows.length
            ? `${rows.length} ${rows.length === 1 ? 'creator' : 'creators'} in ${marketName(CHALLENGE.market)} ${rows.length === 1 ? 'has' : 'have'} not entered. ${rows.length === 1 ? 'They get' : 'They get'} a reminder. The seven who have entered get nothing.`
            : 'Everybody in the market has entered. Nothing sent.',
          rows: rows.map((c) => ({ creator: c, note: 'Closes at midnight tonight' })),
        }
      },
    },
    {
      key: 'archive-ended-challenges',
      icon: 'book',
      cron: '0 2 * * *',
      when: 'Daily, overnight',
      checks: 'Challenges whose deadline has passed IN THEIR OWN MARKET\'S TIMEZONE.',
      writes: 'Moves them to archived. It does not publish a podium and it never has.',
      why: 'It used to compare a timestamp to midnight UTC, which archived Spain and Romania a day early. It reads communities.timezone now.',
      run: () => ({
        summary: `Nothing yet. "${CHALLENGE.title}" closes ${formatDate(at(CHALLENGE.endsInDays + 1, now))} at 00:00 Europe/London.`,
        rows: [],
      }),
    },
    {
      key: 'post-scheduled-announcements',
      icon: 'megaphone',
      cron: '*/5 * * * *',
      when: 'Every five minutes',
      checks: 'Announcements written earlier with a time on them that has now arrived.',
      writes: 'Posts them into the announcements room, which notifies every active creator.',
      why: 'Write it when you have the words, post it when people will read it.',
      run: () => ({
        summary: 'One announcement is queued for 18:00 today: "September challenge dates are up".',
        rows: [{ label: 'September challenge dates are up', note: 'Queued for 18:00, to every market' }],
      }),
    },
    {
      key: 'daily-birthday-cards',
      icon: 'heart',
      cron: '0 7 * * *',
      when: '07:00 daily',
      checks: 'Whose date of birth falls today, excluding admins and test accounts.',
      writes: 'Posts a card into the room. Not a private message and not an email.',
      why: 'A birthday message from forty people is worth something. The same message in an inbox is not.',
      run: () => {
        const rows = CREATORS.filter((c) => ex(c.id).birthdayToday)
        return {
          summary: rows.length ? `${rows.length} ${rows.length === 1 ? 'birthday' : 'birthdays'} today.` : 'Nobody today.',
          rows: rows.map((c) => ({ creator: c, note: 'Card posted in the room' })),
        }
      },
    },
    {
      key: 'inactive-creator-alerts',
      icon: 'bell',
      cron: '0 8 * * *',
      when: '08:00 daily',
      checks: 'Approved creators who have not been seen for thirty days.',
      writes: 'A notification, and a push if they have registered a device. Never an email.',
      why: 'An unsolicited nudge in an inbox is the exact category of mail that got the programme filtered. In the app it is a bell with a number on it.',
      run: () => {
        const rows = CREATORS.filter((c) => ex(c.id).lastSeenDays >= 30)
        return {
          summary: rows.length ? `${rows.length} ${rows.length === 1 ? 'creator has' : 'creators have'} gone quiet.` : 'Everybody has been in recently.',
          rows: rows.map((c) => ({ creator: c, note: `Last seen ${ex(c.id).lastSeenDays} days ago` })),
        }
      },
    },
    {
      key: 'daily-puzzle-reminder',
      icon: 'joystick',
      cron: '0 9 * * *',
      when: '09:00 UTC',
      checks: 'Who has opted IN to a reminder that the day\'s puzzles are up.',
      writes: 'One notification, with a twenty hour guard so a retry cannot double it.',
      why: 'Opt in by default off, because a daily notification nobody asked for is the fastest way to lose the bell entirely.',
      run: () => ({ summary: 'Two creators have opted in.', rows: [{ creator: CREATORS[0], note: 'Opted in' }, { creator: CREATORS[2], note: 'Opted in' }] }),
    },
    {
      key: 'daily-streak-reminder',
      icon: 'sparkles',
      cron: '0 17 * * *',
      when: '17:00 UTC',
      checks: 'Who played yesterday and has not played today. On by default.',
      writes: 'One notification, same twenty hour guard.',
      why: 'A streak you lost because nobody told you is worse than no streak. This one is on by default because it is about something you already started.',
      run: () => ({ summary: 'One creator has a streak at risk.', rows: [{ creator: CREATORS[1], note: '12 day streak, has not played today' }] }),
    },
    {
      key: 'purge-deleted-creators',
      icon: 'trash',
      cron: '0 3 * * *',
      when: '03:00 daily',
      checks: 'Accounts asked to be deleted more than thirty days ago.',
      writes: 'Deletes them permanently, and the storage triggers remove their files with them.',
      why: 'Thirty days is the grace period. Before it, the creator can restore the account themselves; after it, it goes, and nothing is left behind in a bucket.',
      run: () => {
        const rows = CREATORS.filter((c) => (ex(c.id).deletionRequestedDays ?? 0) > 30)
        return {
          summary: rows.length ? `${rows.length} ${rows.length === 1 ? 'account is' : 'accounts are'} past the grace period.` : 'Nothing past the grace period.',
          rows: rows.map((c) => ({ creator: c, note: `Requested ${ex(c.id).deletionRequestedDays} days ago` })),
        }
      },
    },
  ]

  function runAll() {
    const next = {}
    for (const j of JOBS) next[j.key] = j.run()
    setRan(next)
  }

  const total = Object.values(ran).reduce((s, r) => s + (r?.rows?.length || 0), 0)

  return (
    <LabPage
      title="Jobs that run themselves"
      icon="clock"
      subtitle="Nine scheduled jobs, all inside the database rather than on a server that has to stay up. Each one carries a dry run: the same condition, over the invented roster, listing exactly who it would touch."
      aside={
        <button type="button" onClick={runAll} className="btn-primary text-sm">
          Dry run all nine
        </button>
      }
    >
      {Object.keys(ran).length > 0 && (
        <Note tone="good" icon="check">
          <p className="font-semibold">
            All nine evaluated. {total} {total === 1 ? 'thing' : 'things'} would have happened.
          </p>
          <p>Nothing was written, nobody was notified and no account was touched.</p>
        </Note>
      )}

      <div className="space-y-4">
        {JOBS.map((j) => {
          const result = ran[j.key]
          return (
            <div key={j.key} className="card !p-6">
              <div className="flex flex-wrap items-start gap-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
                  <Icon name={j.icon} className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <code className="text-sm font-semibold">{j.key}</code>
                    <Badge tone="grey" className="!px-2 !py-0.5 !text-[10px]">{j.when}</Badge>
                    <code className="text-[11px] text-gray-400">{j.cron}</code>
                  </div>
                  <dl className="mt-3 space-y-1.5 text-xs leading-relaxed">
                    <div className="flex gap-2">
                      <dt className="w-16 shrink-0 font-semibold text-smoke">Looks for</dt>
                      <dd className="min-w-0 text-smoke">{j.checks}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-16 shrink-0 font-semibold text-smoke">Writes</dt>
                      <dd className="min-w-0 text-smoke">{j.writes}</dd>
                    </div>
                    <div className="flex gap-2">
                      <dt className="w-16 shrink-0 font-semibold text-brand">Why</dt>
                      <dd className="min-w-0 text-smoke">{j.why}</dd>
                    </div>
                  </dl>
                </div>
                <button
                  type="button"
                  onClick={() => setRan((r) => ({ ...r, [j.key]: j.run() }))}
                  className="btn-secondary shrink-0 text-xs"
                >
                  Dry run
                </button>
              </div>

              {result && (
                <div className="mt-5 rounded-card border border-gray-100 bg-cloud/50 p-4">
                  <p className="text-xs font-semibold">{result.summary}</p>
                  {result.rows.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {result.rows.map((r, i) => (
                        <div key={r.creator?.id || r.label || i} className="rounded-xl bg-white px-3 py-2.5">
                          {r.creator ? (
                            <PersonRow
                              creator={r.creator}
                              sub={r.note}
                              right={<Icon name="check" className="h-4 w-4 text-brand" />}
                            />
                          ) : (
                            <div className="flex items-center gap-3">
                              <span className="min-w-0 flex-1">
                                <span className="block truncate text-sm font-semibold">{r.label}</span>
                                <span className="block text-xs text-smoke">{r.note}</span>
                              </span>
                              <Icon name="check" className="h-4 w-4 shrink-0 text-brand" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Panel title="Where they actually run" hint="Not on a server. Inside the database.">
        <div className="grid gap-5 lg:grid-cols-2">
          <Code>{`select cron.schedule(
  'daily-birthday-cards',
  '0 7 * * *',
  $$ select post_birthday_cards() $$
);

select * from cron.job;
select * from cron.job_run_details
  order by start_time desc limit 20;`}</Code>
          <div className="space-y-4">
            <KeyVal
              rows={[
                ['Scheduler', 'pg_cron, inside Postgres'],
                ['Jobs', '9'],
                ['Anything to keep running', 'No'],
                ['Anything to pay for', 'No'],
                ['If one fails', 'It is recorded in cron.job_run_details'],
                ['Testing one in production', 'Disable its trigger inside a transaction, or roll the whole thing back'],
              ]}
            />
            <Note>
              <p className="font-semibold text-ink">Testing a trigger in production has a rule.</p>
              <p>
                Wrap it in a single transaction that raises at the end, so it rolls itself back. Otherwise
                a test insert notifies every creator on the platform, which has happened to somebody
                somewhere and should not happen here.
              </p>
            </Note>
          </div>
        </div>
      </Panel>
    </LabPage>
  )
}
