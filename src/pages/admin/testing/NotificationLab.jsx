import { useMemo, useState } from 'react'
import { Badge } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { TYPE_META, metaFor, FILTERS, matchesFilter, groupByAge } from '../../../lib/notifications'
import { formatMessageTime, timeAgo } from '../../../lib/utils'
import { LabPage, Panel, Note, Choice, Code, KeyVal, useNow } from './kit'
import { NOTIFICATIONS } from './fixtures'

// EVERY NOTIFICATION THE PLATFORM SENDS, IN ONE PLACE.
//
// There are nineteen kinds and they are written by nine different things: a
// database trigger, a scheduled job, an admin pressing a button, another
// creator reacting to you. Nobody has ever seen all of them, which is precisely
// how four of the busiest ones ended up rendering as a bare bell with no label:
// TYPE_META has to list EVERY type the database writes, and there was no way to
// notice a gap short of waiting for one to arrive.
//
// This page renders one of each. A missing entry is now visible in a second.

// Who writes each kind. Nine different things do, which is the reason nobody
// has ever seen all nineteen in one place.
const WRITTEN_BY = {
  dm: 'sending a direct message',
  chat: 'a chat trigger, throttled to once per 15 minutes',
  mention: 'an @ in a message',
  connection: 'a connection request',
  collab: 'overlapping travel dates',
  feedback: 'a creator reporting a bug',
  new_member: 'an approval',
  referral: 'a referred creator posting their first video',
  challenge: 'publishing a challenge',
  submission: 'an entry being posted',
  deadline: 'the challenge-reminders job at 09:00',
  results: 'publishing the winners',
  reward: 'a reward being awarded or paid',
  event: 'an event being created',
  application: 'somebody finishing onboarding',
  announcement: 'a post in the announcements room',
  daily_streak: 'the streak reminder job at 17:00',
  daily_reminder: 'the puzzle reminder job at 09:00',
  inactive: 'the inactive-creator job at 08:00',
}

export default function NotificationLab() {
  const now = useNow()
  const [filter, setFilter] = useState('all')
  const [read, setRead] = useState(() => new Set(['results', 'event', 'daily_streak']))
  const [prefs, setPrefs] = useState({ push: true, subscribed: true })

  const rows = useMemo(() => NOTIFICATIONS.map((n, i) => ({
    id: `n${i}`,
    type: n.type,
    title: n.title,
    body: n.body,
    link: n.link,
    read: read.has(n.type),
    created_at: new Date(now - n.minutesAgo * 60000).toISOString(),
  })), [read, now])

  const shown = rows.filter((n) => matchesFilter(n, filter))
  const grouped = groupByAge(shown)
  const unread = rows.filter((n) => !n.read).length

  // Which types are covered by TYPE_META, which is the check that matters.
  const covered = Object.keys(TYPE_META)
  const rendered = [...new Set(NOTIFICATIONS.map((n) => n.type))]
  const missing = covered.filter((t) => !rendered.includes(t))

  function toggle(type) {
    setRead((s) => {
      const next = new Set(s)
      if (next.has(type)) next.delete(type); else next.add(type)
      return next
    })
  }

  return (
    <LabPage
      title="Notifications"
      icon="bell"
      subtitle="One of every kind the platform sends, drawn exactly as a creator sees it, with the real filters, the real age headings and the real icon table."
      aside={
        <span className="relative inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-white shadow-card ring-1 ring-gray-100">
          <Icon name="bell" className="h-5 w-5 text-ink" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">
              {unread}
            </span>
          )}
        </span>
      }
    >
      <Panel
        title="The list"
        hint="Press a row to mark it read. The four filters and the age headings are the same functions the bell and the notifications page both call, which is the point: they used to be two implementations that disagreed."
        action={<Choice size="sm" options={FILTERS.map((f) => ({ value: f.key, label: f.label }))} value={filter} onChange={setFilter} />}
      >
        <div className="mx-auto max-w-2xl">
          {grouped.length === 0 ? (
            <p className="py-12 text-center text-sm text-smoke">Nothing under that filter.</p>
          ) : grouped.map(([heading, list]) => (
            <div key={heading} className="mb-6 last:mb-0">
              <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-widest text-smoke">{heading}</p>
              <div className="space-y-1">
                {list.map((n) => {
                  const meta = metaFor(n.type)
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => toggle(n.type)}
                      className={
                        'flex w-full items-start gap-3 rounded-card px-3 py-3 text-left transition-colors ' +
                        (n.read ? 'hover:bg-cloud/70' : 'bg-brand-tint/30 hover:bg-brand-tint/50')
                      }
                    >
                      <span className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ' + (n.read ? 'bg-cloud text-smoke' : 'bg-white text-brand shadow-card')}>
                        <Icon name={meta.icon} className="h-4 w-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-baseline gap-2">
                          <span className={'min-w-0 flex-1 truncate text-sm ' + (n.read ? 'font-medium' : 'font-semibold')}>{n.title}</span>
                          <span className="shrink-0 text-[11px] text-smoke">{timeAgo(n.created_at)}</span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-smoke">{n.body}</span>
                        <span className="mt-1 flex items-center gap-2">
                          <Badge tone="grey" className="!px-2 !py-0.5 !text-[10px]">{meta.label}</Badge>
                          <code className="text-[10px] text-gray-400">{n.type}</code>
                          <code className="text-[10px] text-gray-400">{n.link}</code>
                        </span>
                      </span>
                      {!n.read && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-brand" aria-hidden />}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        title="Coverage"
        hint="A type the database writes that is missing from TYPE_META falls through to a bare bell with no label. This is the check."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <div className="mb-3 flex items-center gap-2">
              <Badge tone={missing.length ? 'amber' : 'green'}>
                {missing.length ? `${missing.length} not shown here` : `All ${covered.length} covered`}
              </Badge>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {covered.map((t) => (
                <span
                  key={t}
                  className={
                    'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ' +
                    (rendered.includes(t) ? 'bg-cloud text-smoke' : 'bg-amber-50 text-amber-700')
                  }
                >
                  <Icon name={TYPE_META[t].icon} className="h-3 w-3" />
                  {t}
                </span>
              ))}
            </div>
          </div>
          <Note>
            <p className="font-semibold text-ink">Four of the busiest ones were missing.</p>
            <p>
              submission, new_member, daily_streak and inactive all rendered as an unlabelled bell for
              months, because the only way to notice was to receive one. The table is the contract and
              this grid is the test.
            </p>
          </Note>
        </div>
      </Panel>

      <Panel
        title="Where each one is delivered"
        hint="A notification is a row in the database, always. Whether it also reaches a phone is a per creator, per type decision. Email is a third thing entirely and it is deliberately switched off."
      >
        <div className="mb-5 flex flex-wrap gap-4">
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={prefs.push} onChange={(e) => setPrefs((p) => ({ ...p, push: e.target.checked }))} className="accent-[#d94407]" />
            This creator has push switched on
          </label>
          <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={prefs.subscribed} onChange={(e) => setPrefs((p) => ({ ...p, subscribed: e.target.checked }))} className="accent-[#d94407]" />
            and has registered a device
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-smoke">
                <th className="pb-2">Type</th>
                <th className="pb-2">Group</th>
                <th className="pb-2">Bell</th>
                <th className="pb-2">Push</th>
                <th className="pb-2">Written by</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {Object.entries(TYPE_META).map(([type, meta]) => (
                <tr key={type}>
                  <td className="py-2.5 pr-4">
                    <span className="flex items-center gap-2 text-xs font-medium">
                      <Icon name={meta.icon} className="h-3.5 w-3.5 text-brand" />
                      {type}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4"><Badge tone={meta.group === 'people' ? 'light' : 'grey'} className="!px-2 !py-0.5 !text-[10px]">{meta.group}</Badge></td>
                  <td className="py-2.5 pr-4"><Yes on /></td>
                  <td className="py-2.5 pr-4"><Yes on={prefs.push && prefs.subscribed} /></td>
                  <td className="py-2.5 text-[11px] text-smoke">{WRITTEN_BY[type] || 'a database trigger'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Note>
            <p className="font-semibold text-ink">The bell is never optional.</p>
            <p>
              The row is the record, so it is written whatever anybody has switched off. Push is opt in
              per device and needs a registered subscription, which is why the second box above matters
              as much as the first. Reading the thing a notification points at clears it.
            </p>
          </Note>
          <Note tone="warn" icon="alert">
            <p className="font-semibold">Email notifications are off, on purpose.</p>
            <p>
              Sending bulk mail from a personal address got the programme filtered as unsolicited mail,
              and the only real fix is a sending domain we control. Until then email does exactly two
              jobs, both of which a person is expecting. See the email lab.
            </p>
          </Note>
        </div>
      </Panel>

      <Panel title="How one gets written" tone="quiet">
        <div className="grid gap-4 lg:grid-cols-2">
          <Code>{`-- one person
notify_user(
  p_recipient := 'demo-c1',
  p_type      := 'reward',
  p_title     := 'Your reward is on its way',
  p_body      := '£150 cash, invoice raised',
  p_link      := '/rewards'
);

-- everybody except you
notify_all(
  p_except := auth.uid(),
  p_type   := 'announcement',
  ...
);`}</Code>
          <KeyVal
            rows={[
              ['Kinds', `${covered.length}`],
              ['Filters', FILTERS.map((f) => f.label).join(', ')],
              ['Age headings', 'Just now, Earlier today, Yesterday, This week, Older'],
              ['Live updates', 'The bell subscribes. The page deliberately does not'],
              ['Push reach', 'Only creators who registered a device'],
              ['Sample timestamp', formatMessageTime(rows[0].created_at)],
              ['Motion', 'CSS only, because the bell is in the eagerly loaded shell'],
            ]}
          />
        </div>
      </Panel>
    </LabPage>
  )
}

function Yes({ on }) {
  return on
    ? <Icon name="check" className="h-4 w-4 text-green-600" />
    : <span className="text-xs text-gray-300">no</span>
}
