import { useState } from 'react'
import { Badge } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { renderMessageBody, stripMarkup } from '../../../lib/richText'
import { localTimeLine, timezoneFor, clockIn } from '../../../lib/localTime'
import { challengeDeadline, formatDate, formatDateTime, formatMessageTime, formatViews, timeAgo, ageFromDob, detectPlatform } from '../../../lib/utils'
import { LabPage, Panel, Note, KeyVal, Code, Choice, Field, useNow, CardGrid } from './kit'
import { CREATORS, APPLICANT, dateOnly, asProfile } from './fixtures'

// THE SMALL MACHINERY.
//
// Three things that are invisible when they work and obvious the moment they do
// not: what a message looks like after it has been through the formatter, what
// time it is where somebody is, and what happens to a photo between pressing
// upload and it appearing in a room.
//
// All three are pure functions, so all three can be played with directly.

const SAMPLE = `# One perfect day in your city

Here is the brief, **in full**.

- Film the day you would give a friend
- Show where you *eat*, and what you skip
- Post before the deadline

And the one thing nobody tells them about.

Tag @James Test if you want a second pair of eyes, and put the link here:
https://tiktok.com/@example/video/123`

export default function ToolkitLab() {
  const now = useNow()
  const [text, setText] = useState(SAMPLE)
  const [rich, setRich] = useState(true)
  const [who, setWho] = useState('demo-c1')

  const members = CREATORS.map(asProfile)
  const creator = CREATORS.find((c) => c.id === who) || CREATORS[0]
  const zone = timezoneFor({ country_code: creator.country_code, city: creator.city })
  // localTimeLine returns { time, note, zone }, not a string. Rendering the
  // object straight into JSX is what a React "objects are not valid as a child"
  // error looks like from the outside.
  const line = localTimeLine({ country_code: creator.country_code, city: creator.city }, new Date(now))

  const deadlineSamples = [-1, 0, 3, 7].map((d) => {
    const end = dateOnly(d, now)
    return { end, deadline: challengeDeadline(end) }
  })

  return (
    <LabPage
      title="Text, time and media"
      icon="pencil"
      subtitle="The three pieces of machinery nobody notices until they break: the message formatter, local time for a creator anywhere in the world, and what happens to a photo or a video on the way up."
    >
      <Panel
        title="The message formatter"
        hint="Type anything. This is renderMessageBody, the one every chat surface on the platform calls."
        action={
          <Choice
            size="sm"
            value={rich ? 'rich' : 'plain'}
            onChange={(v) => setRich(v === 'rich')}
            options={[{ value: 'rich', label: 'Rich' }, { value: 'plain', label: 'Plain' }]}
          />
        }
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <Field label="What somebody typed">
              <textarea
                rows={14}
                className="input font-mono !text-xs"
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
            </Field>
          </div>
          <div>
            <p className="label">What arrives</p>
            <div className="min-h-[14rem] rounded-card border border-gray-100 bg-white p-5">
              <div className="flex items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-tint text-xs font-semibold text-brand">JT</span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-2">
                    <span className="text-sm font-semibold">James Test</span>
                    <span className="text-[11px] text-smoke">{formatMessageTime(new Date(now - 8 * 60000))}</span>
                  </p>
                  <div className="mt-1 break-words text-sm leading-relaxed">
                    {renderMessageBody(text, { rich, members })}
                  </div>
                </div>
              </div>
            </div>
            <Note className="mt-4">
              <p className="font-semibold text-ink">Rich is unconditional, and that is deliberate.</p>
              <p>
                It was once switched on for admins only, which meant a creator&apos;s own bold text looked
                broken to them and correct to everybody else. Switch the control above to Plain to see
                exactly what that was.
              </p>
            </Note>
          </div>
        </div>

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <KeyVal
            rows={[
              ['Characters typed', String(text.length)],
              ['As a search index sees it', `${stripMarkup(text).length} characters`],
              ['Mentions resolved against', `${members.length} names`],
              ['Links', 'Unfurled server side, with a guard against internal addresses'],
            ]}
          />
          <Note icon="alert" tone="warn">
            <p className="font-semibold">An inline marker must never cross a line break.</p>
            <p>
              Keep typing with bold on, press return, and a browser carries the tag across, so the
              message arrives with its asterisks showing. Every line closes and reopens its own markers,
              and older messages are re-cut when they are read.
            </p>
          </Note>
        </div>
      </Panel>

      <Panel
        title="What time is it where they are"
        hint="No creator is asked for their timezone. It is resolved from their country, and for the wide countries from the longitude of their town."
        action={
          <Choice
            size="sm"
            value={who}
            onChange={setWho}
            options={CREATORS.slice(0, 6).map((c) => ({ value: c.id, label: c.name.split(' ')[0] }))}
          />
        }
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="rounded-card border border-gray-100 bg-cloud/50 p-6 text-center">
            <p className="text-sm font-semibold">{creator.name}</p>
            <p className="mt-0.5 text-xs text-smoke">{creator.city}, {creator.country}</p>
            <p className="mt-4 text-4xl font-bold tabular-nums tracking-tight">
              {zone ? clockIn(zone, new Date(now)) : '--:--'}
            </p>
            <p className="mt-2 text-xs text-smoke">{zone || 'Cannot say with confidence'}</p>
            <p className="mt-3 text-xs font-medium text-brand">
              {line ? (line.note || `Local time in ${creator.city}`) : 'No clock is shown for this creator'}
            </p>
          </div>
          <div className="space-y-4">
            <div className="space-y-1.5">
              {CREATORS.slice(0, 8).map((c) => {
                const z = timezoneFor({ country_code: c.country_code, city: c.city })
                return (
                  <div key={c.id} className="flex items-center gap-3 rounded-xl bg-cloud/60 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-xs">
                      <span className="font-semibold">{c.name}</span>
                      <span className="text-smoke"> · {c.city}</span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums">{z ? clockIn(z, new Date(now)) : '-'}</span>
                  </div>
                )
              })}
            </div>
            <Note>
              <p className="font-semibold text-ink">Some countries return nothing at all, on purpose.</p>
              <p>
                A creator in the United States, Canada, Russia or Australia with no town on file gets no
                clock rather than a guessed one. A wrong clock reads as a fact, and somebody will schedule
                a call around it.
              </p>
            </Note>
          </div>
        </div>
      </Panel>

      <Panel title="Deadlines" hint="A challenge ending on a date means you can post all of that day. The deadline is the start of the day after it, in local time.">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[30rem] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-smoke">
                <th className="pb-2">end_date</th>
                <th className="pb-2">Reads as</th>
                <th className="pb-2">Entries actually close</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {deadlineSamples.map((d) => (
                <tr key={d.end}>
                  <td className="py-2.5 pr-4 font-mono text-xs">{d.end}</td>
                  <td className="py-2.5 pr-4 text-xs text-smoke">{formatDate(new Date(`${d.end}T12:00:00`))}</td>
                  <td className="py-2.5 text-xs font-semibold">{formatDateTime(d.deadline)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="What happens to a photo on the way up" hint="Nothing goes straight from a phone into a bucket. Every image is re-encoded in the browser first.">
        <CardGrid>
          {[
            { icon: 'image', t: 'A chat photo', d: 'Re-encoded to 1280px at quality 0.82 before it leaves the device. A 6MB photo from a modern phone arrives as a few hundred kilobytes.' },
            { icon: 'image', t: 'A travel photo', d: 'WebP at 0.78, longest edge 1200. With a probe first, because Safari will quietly hand back a PNG that is bigger than what went in.' },
            { icon: 'video', t: 'A video', d: 'Capped at 25MB and never transcoded. Browsers cannot re-encode video at a sensible cost, so the honest answer is a limit and a clear message.' },
            { icon: 'shield', t: 'The upload itself', d: 'Through our own function with a service key rather than direct from the browser, because the direct path is unreliable when the key cache flaps.' },
            { icon: 'trash', t: 'Deleting content', d: 'A trigger posts the file paths to a cleanup function, which removes the objects. Deleted content cannot leave files behind in a bucket.' },
            { icon: 'key', t: 'Direct message media', d: 'A private bucket with signed links, not a public one. A public URL that is merely hard to guess is a public URL.' },
          ].map((c) => (
            <div key={c.t} className="card !p-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-tint text-brand">
                <Icon name={c.icon} className="h-4 w-4" />
              </span>
              <p className="mt-3 text-sm font-semibold">{c.t}</p>
              <p className="mt-1.5 text-xs leading-relaxed text-smoke">{c.d}</p>
            </div>
          ))}
        </CardGrid>
      </Panel>

      <Panel title="A few more shared formatters" hint="Small, and every one of them is called from a dozen places, which is the point of having them at all.">
        <div className="grid gap-6 lg:grid-cols-2">
          <KeyVal
            rows={[
              ['formatViews(412000)', formatViews(412000)],
              ['formatViews(3100)', formatViews(3100)],
              ['timeAgo(8 minutes ago)', timeAgo(new Date(now - 8 * 60000))],
              ['timeAgo(3 days ago)', timeAgo(new Date(now - 3 * 86400000))],
              ['ageFromDob', `${ageFromDob(APPLICANT.dob)}`],
              ['detectPlatform(a TikTok link)', detectPlatform('https://tiktok.com/@x/video/1') || '-'],
              ['detectPlatform(a Reel)', detectPlatform('https://instagram.com/reel/2') || '-'],
            ]}
          />
          <div className="space-y-4">
            <Code>{`formatMessageTime  a time, in a chat
timeAgo            "3 days ago", for lists
formatDate         a date a person reads
formatDateTimeTz   a date with the zone named

A chat NEVER uses timeAgo. A message that says
"3 days ago" instead of the time it was sent
cannot be referred to in a conversation.`}</Code>
            <div className="flex flex-wrap gap-2">
              {['TikTok', 'Instagram', 'YouTube'].map((p) => (
                <Badge key={p} tone="grey">{p}</Badge>
              ))}
              <span className="text-xs text-smoke">detected from the link, never from a profile field</span>
            </div>
          </div>
        </div>
      </Panel>
    </LabPage>
  )
}
