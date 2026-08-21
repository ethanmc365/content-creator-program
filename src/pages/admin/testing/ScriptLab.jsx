import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Badge } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { LabPage, Panel, Note, KeyVal } from './kit'

// THE RUN OF SHOW.
//
// A demonstration falls over for one of two reasons: the person running it goes
// hunting for a page in front of everybody, or they show the features in the
// order the navigation happens to be in rather than the order the story goes
// in. This page fixes both. It is an agenda with a door on every line.
//
// The order is deliberate. A person, then the money, then the thing that runs
// while nobody is watching, then the toys. Anybody can follow a person joining
// a programme. Almost nobody follows an architecture diagram.

const RUN = [
  {
    minutes: 2,
    title: 'What this replaces',
    to: null,
    say: [
      'Forty five travel creators across six countries were being run out of a WhatsApp group and a spreadsheet.',
      'Briefs got lost in the scroll, view counts were collected by asking, and every invoice was written by hand.',
      'Everything after this slide is one platform doing that job instead.',
    ],
  },
  {
    minutes: 3,
    title: 'The front door',
    to: '/admin/testing/signup',
    say: [
      'Start on the public landing page. The map, the live challenge and the numbers on it are real and they are read anonymously, so nothing about a creator is exposed to draw it.',
      'Then the sign-up page. Point out that signing up gets you nowhere: the account is created with no access at all.',
      'Switch the stage to Desktop to show the same page is not a phone app stretched sideways.',
    ],
  },
  {
    minutes: 4,
    title: 'Somebody joins',
    to: '/admin/testing/onboarding',
    say: [
      'Walk the eight steps. Do not read them out, jump to step 2, step 5 and step 7.',
      'Switch the prefill off and press Continue with the fields empty. The gating is the point: nobody reaches the community with a blank profile, because an admin has to review a complete one.',
      'Step 7 is the market picker. Two memberships explained as two things, which is why creators join a market at all.',
    ],
  },
  {
    minutes: 3,
    title: 'And what happens next',
    to: '/admin/testing/journey',
    say: [
      'Press Step through the timeline rather than playing it.',
      'The two lines worth landing: every admin is notified in the same second, and the applicant can do nothing until a person approves them.',
      'Switch the outcome to Declined to show that the refusal is written to be read by a human being.',
    ],
  },
  {
    minutes: 5,
    title: 'The money',
    to: '/admin/testing/invoice',
    say: [
      'This is the centrepiece. A cash prize raises its own invoice, correctly numbered, with the bank details as they were at that moment.',
      'Set the approver to "the person who raised it" and run it again. It refuses. Say that it refuses in the database too, not only in the browser.',
      'Press Download the PDF. It is a real PDF, on brand, for a creator who does not exist. Open it.',
      'Switch the scenario to No bank details to show the automation stopping itself and asking the creator instead.',
    ],
  },
  {
    minutes: 3,
    title: 'What a challenge costs',
    to: '/admin/testing/programme',
    say: [
      'Drag a view count and let them watch the leaderboard reorder. This is the real ranking function, not an animation.',
      'Then scroll to the cost table. Blended cost per thousand views, per market, in pounds or euros.',
      'The line to say out loud: a challenge with no views logged shows a blank, not a zero, because unknown is not the same as free.',
    ],
  },
  {
    minutes: 4,
    title: 'The bit nobody can see',
    to: '/admin/testing/cron',
    say: [
      'Press "Dry run all nine". Nine jobs evaluate their real conditions against the demo roster and report exactly who they would touch.',
      'Point at inactive-creator-alerts and birthday cards. These run at eight and seven in the morning and nobody is awake for them.',
      'They run inside the database. There is no server to keep up and nothing to pay for.',
    ],
  },
  {
    minutes: 3,
    title: 'Closing a challenge',
    to: '/admin/testing/challenge',
    say: [
      'Drag the day slider from the middle to past the deadline. Watch the status, the countdown and the scheduled job change with it.',
      'Log the views. Then stop, and point out there is still no podium.',
      'Publishing the winners is a separate press, because results existing is not the same as results being ready. That distinction shipped as a bug once.',
    ],
  },
  {
    minutes: 2,
    title: 'Why there is almost no email',
    to: '/admin/testing/email',
    say: [
      'Show the welcome email, then say that it does not send itself: it waits for somebody to read it.',
      'The honest version of the story is the strongest part. One broadcast got the programme filtered as unsolicited mail, so the whole system was removed rather than turned down.',
      'Everything else is push and the bell.',
    ],
  },
  {
    minutes: 2,
    title: 'The reason people come back',
    to: '/admin/testing/flight',
    say: [
      'Type LHR and JFK. The boarding pass builds itself: distance, block time, heading, the clock change, the carbon, who flies it and what they would send.',
      'No API and no network call. Nine hundred airports and ninety airlines, in the app.',
      'This is the part creators show each other, which is worth more than any feature they were told about.',
    ],
  },
  {
    minutes: 2,
    title: 'How big it is, actually',
    to: '/admin/testing/health',
    say: [
      'The only page in here reading real data. Counts only, no rows, nothing that could name anybody.',
      'Good place to finish, because it answers the question they were going to ask anyway.',
    ],
  },
]

const SPARE = [
  { title: 'Notifications', to: '/admin/testing/notifications', why: 'If somebody asks how creators find out about anything.' },
  { title: 'Text, time and media', to: '/admin/testing/toolkit', why: 'If somebody technical asks what happens to a photo on upload.' },
]

export default function ScriptLab() {
  const [done, setDone] = useState(() => new Set())
  const total = RUN.reduce((s, r) => s + r.minutes, 0)
  const left = RUN.filter((_, i) => !done.has(i)).reduce((s, r) => s + r.minutes, 0)

  function toggle(i) {
    setDone((s) => {
      const next = new Set(s)
      if (next.has(i)) next.delete(i); else next.add(i)
      return next
    })
  }

  return (
    <LabPage
      title="Demo run of show"
      icon="book"
      subtitle="Eleven parts, roughly half an hour, in the order the story goes in rather than the order the navigation is in. Every line has a door on it, so nothing has to be hunted for in front of an audience."
      aside={
        <div className="rounded-card border border-gray-200 bg-white px-4 py-3 text-center">
          <p className="text-2xl font-bold tabular-nums">{left}</p>
          <p className="text-[11px] text-smoke">minutes left of {total}</p>
        </div>
      }
    >
      <Note icon="bulb">
        <p className="font-semibold text-ink">Three rules that make this work.</p>
        <p>
          Press Step rather than Play, so you are talking over it instead of racing it. Open every lab in
          a second tab before you start. And say the word sandbox once, at the beginning, so nobody spends
          the next twenty minutes wondering whether Maya Okonjo is a real person.
        </p>
      </Note>

      <div className="space-y-3">
        {RUN.map((r, i) => {
          const isDone = done.has(i)
          return (
            <div
              key={r.title}
              className={'card !p-5 transition-opacity duration-200 ' + (isDone ? 'opacity-50' : '')}
            >
              <div className="flex flex-wrap items-start gap-4">
                <button
                  type="button"
                  onClick={() => toggle(i)}
                  aria-pressed={isDone}
                  className={
                    'mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ' +
                    (isDone ? 'bg-brand text-white' : 'bg-cloud text-smoke hover:bg-brand-tint hover:text-brand')
                  }
                >
                  {isDone ? <Icon name="check" className="h-4 w-4" /> : i + 1}
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold">{r.title}</p>
                    <Badge tone="grey" className="!px-2 !py-0.5 !text-[10px]">{r.minutes} min</Badge>
                  </div>
                  <ul className="mt-2.5 space-y-1.5">
                    {r.say.map((line) => (
                      <li key={line} className="flex gap-2 text-xs leading-relaxed text-smoke">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-brand/50" aria-hidden />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {r.to && (
                  <Link
                    to={r.to}
                    className="btn-secondary shrink-0 text-xs"
                  >
                    Open
                  </Link>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <Panel title="Kept in reserve" hint="Not in the running order. Open one if a question goes there.">
        <div className="grid gap-3 sm:grid-cols-2">
          {SPARE.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="card group flex items-center gap-3 !p-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift"
            >
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold transition-colors group-hover:text-brand">{s.title}</span>
                <span className="mt-0.5 block text-xs text-smoke">{s.why}</span>
              </span>
              <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300" />
            </Link>
          ))}
        </div>
      </Panel>

      <Panel title="Questions that always come" hint="Short answers, so nobody has to improvise one.">
        <KeyVal
          rows={[
            ['Is any of this real?', 'The people are invented. The code is the code that runs in production.'],
            ['Can it handle more creators?', 'Forty five today. Nothing here is per creator work; the scheduled jobs and the queries are set based.'],
            ['What does it cost to run?', 'A database, a static front end and nine jobs inside the database. There is no server.'],
            ['Who can see the money?', 'Admins. And no admin can approve their own invoice.'],
            ['What about a creator\'s personal details?', 'Phone numbers and bank details are in a separate table no other creator can read, ever.'],
            ['Can somebody delete their account?', 'Yes, themselves. Thirty day grace period, then it goes and the files go with it.'],
            ['How long did this take?', 'Answer honestly. It is a better number than they expect.'],
          ]}
        />
      </Panel>
    </LabPage>
  )
}
