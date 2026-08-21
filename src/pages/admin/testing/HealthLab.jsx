import { useEffect, useState } from 'react'
import { Badge, Skeleton } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { supabase } from '../../../lib/supabase'
import { isNetworkPreviewOn } from '../../../lib/featureFlags'
import { LabPage, Panel, Note, KeyVal, Code, CardGrid } from './kit'

// THE ONE PAGE HERE THAT READS REAL DATA.
//
// Every other lab in the Testing Centre runs on invented people, which is the
// whole point of it. This one is the exception and it is worth having: at some
// stage in a demonstration somebody asks how big the thing actually is, and the
// honest answer is a number read out of the database in front of them rather
// than one from a slide written last month.
//
// It is READ ONLY and it is counts only. Every query below is a head request
// with an exact count and no rows returned, so nothing on this page could show
// anybody's name, email or message even if it wanted to.

async function countOf(table, apply) {
  try {
    let q = supabase.from(table).select('id', { count: 'exact', head: true })
    if (apply) q = apply(q)
    const { count, error } = await q
    if (error) return { value: null, error: error.message }
    return { value: count ?? 0 }
  } catch (e) {
    return { value: null, error: e.message }
  }
}

export default function HealthLab() {
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    async function load() {
      const [
        creators, admins, tests, pending, submissions, challengesActive, challengesAll,
        notifications, messages, dms, invoices, invoicesQueue, connections, flights,
        communities, boardQuestions, feedbackNew, reportsOpen, events, jobsOpen,
      ] = await Promise.all([
        countOf('profiles', (q) => q.eq('status', 'active').eq('is_admin', false).eq('is_test', false).is('deletion_requested_at', null)),
        countOf('profiles', (q) => q.eq('is_admin', true)),
        countOf('profiles', (q) => q.eq('is_test', true)),
        countOf('profiles', (q) => q.eq('status', 'pending').eq('onboarded', true)),
        countOf('submissions'),
        countOf('challenges', (q) => q.eq('status', 'active')),
        countOf('challenges'),
        countOf('notifications'),
        countOf('messages'),
        countOf('direct_messages'),
        countOf('invoices'),
        countOf('invoices', (q) => q.eq('stage', 'awaiting_approval')),
        countOf('connections'),
        countOf('flights'),
        countOf('communities'),
        countOf('board_questions'),
        countOf('feedback', (q) => q.eq('status', 'new')),
        countOf('message_reports', (q) => q.in('status', ['new', 'reviewing'])),
        countOf('events'),
        countOf('jobs'),
      ])
      if (!alive) return
      setData({
        creators, admins, tests, pending, submissions, challengesActive, challengesAll,
        notifications, messages, dms, invoices, invoicesQueue, connections, flights,
        communities, boardQuestions, feedbackNew, reportsOpen, events, jobsOpen,
      })
    }
    load()
    return () => { alive = false }
  }, [])

  const n = (k) => {
    const r = data?.[k]
    if (!r) return '-'
    if (r.value == null) return 'n/a'
    return r.value.toLocaleString()
  }

  const failures = data ? Object.entries(data).filter(([, v]) => v?.error) : []

  return (
    <LabPage
      title="Live platform health"
      icon="chartPie"
      subtitle="The exception to the rule. This page reads the real database, counts only, no rows, nothing that could identify anybody. Useful for the moment somebody asks how big it actually is."
      aside={<Badge tone="amber">Real data, read only</Badge>}
      sandbox={false}
    >
      <Note tone="warn" icon="alert">
        <p className="font-semibold">These are the real numbers.</p>
        <p>
          Every query on this page is a head request with an exact count. No row is ever returned, so
          nothing here can show a name, an address or a message. Nothing is written.
        </p>
      </Note>

      <Panel title="People">
        {!data ? <SkeletonGrid /> : (
          <CardGrid cols={4}>
            <Tile label="Active creators" value={n('creators')} hint="Approved, not an admin, not a test account" />
            <Tile label="Waiting on review" value={n('pending')} hint="Finished onboarding, not yet approved" />
            <Tile label="Admins" value={n('admins')} />
            <Tile label="Test accounts" value={n('tests')} hint="Hidden from the community and every list" />
          </CardGrid>
        )}
      </Panel>

      <Panel title="The work">
        {!data ? <SkeletonGrid /> : (
          <CardGrid cols={4}>
            <Tile label="Challenges run" value={n('challengesAll')} />
            <Tile label="Running now" value={n('challengesActive')} accent />
            <Tile label="Videos submitted" value={n('submissions')} />
            <Tile label="Markets" value={n('communities')} hint="Worldwide plus the chapters inside it" />
          </CardGrid>
        )}
      </Panel>

      <Panel title="The community">
        {!data ? <SkeletonGrid /> : (
          <CardGrid cols={4}>
            <Tile label="Room messages" value={n('messages')} hint="In the rooms this account is a member of" />
            <Tile label="Connections" value={n('connections')} />
            <Tile label="Questions on the board" value={n('boardQuestions')} />
            <Tile label="Flights logged" value={n('flights')} />
            <Tile label="Events" value={n('events')} />
            <Tile label="Roles posted" value={n('jobsOpen')} />
          </CardGrid>
        )}
      </Panel>

      <Panel title="On somebody's desk right now">
        {!data ? <SkeletonGrid /> : (
          <CardGrid cols={4}>
            <Tile label="Invoices to approve" value={n('invoicesQueue')} accent={data?.invoicesQueue?.value > 0} />
            <Tile label="Invoices in total" value={n('invoices')} />
            <Tile label="Bug reports and ideas" value={n('feedbackNew')} />
            <Tile label="Reported messages" value={n('reportsOpen')} />
          </CardGrid>
        )}
      </Panel>

      <Panel
        title="What this page cannot see"
        hint="Two counts that look broken and are not. Row level security scopes them to the account asking, so even an admin counting them gets their own."
      >
        {!data ? <SkeletonGrid /> : (
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="grid grid-cols-2 gap-4">
              <Tile label="Direct messages" value={n('dms')} hint="Yours, not the platform's" />
              <Tile label="Notifications" value={n('notifications')} hint="Yours, not the platform's" />
            </div>
            <Note>
              <p className="font-semibold text-ink">This is the security model working, not a fault.</p>
              <p>
                A direct message is readable by the two people in it and by nobody else, including an
                administrator and including this page. The same is true of a notification. There is no
                admin override, so the honest number here is the reader&apos;s own, and pretending
                otherwise would mean building a way to read everybody&apos;s messages in order to count
                them.
              </p>
            </Note>
          </div>
        )}
      </Panel>

      {failures.length > 0 && (
        <Panel title="Queries that did not answer" hint="Almost always a table this account is not allowed to count, which is the security model working rather than a fault.">
          <Code>{failures.map(([k, v]) => `${k}: ${v.error}`).join('\n')}</Code>
        </Panel>
      )}

      <Panel title="What is running behind it" hint="Static, because it changes when somebody deploys rather than while you are reading.">
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-smoke">Edge functions</p>
            <div className="space-y-1.5">
              {[
                ['auth-gate', 'Rate limits sign in and forwards the captcha'],
                ['notify-dispatch', 'Push notifications, from a database trigger'],
                ['upload', 'The proxy every file goes through'],
                ['link-preview', 'Unfurls a link, with a guard against internal addresses'],
                ['impersonate', 'View as creator, and the ticket that gets you back'],
                ['send-invoice', 'Refuses anything that is not approved'],
                ['send-welcome', 'Resolves the recipient from the queued row, never from the browser'],
                ['geocode', 'Turns a town into a point on the map'],
                ['media-cleanup', 'Removes the files behind deleted content'],
              ].map(([name, what]) => (
                <div key={name} className="flex items-start gap-3 rounded-xl bg-cloud/60 px-3 py-2">
                  <Icon name="sparkles" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
                  <span className="min-w-0">
                    <code className="text-xs font-semibold">{name}</code>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-smoke">{what}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-5">
            <KeyVal
              rows={[
                ['Database', 'Supabase Postgres, Frankfurt'],
                ['Row level security', 'On for every public table'],
                ['Reads gated by', 'Membership, in a security definer function'],
                ['Writes gated by', 'Whether you are allowed to post'],
                ['Scheduled jobs', '9, inside the database'],
                ['Front end', 'Vite and React, deployed on Vercel from the main branch'],
                ['Network preview on this device', isNetworkPreviewOn() ? 'On' : 'Off'],
              ]}
            />
            <Note>
              <p className="font-semibold text-ink">The network preview flag is per device.</p>
              <p>
                It is stored in this browser and it gates the whole worldwide shell behind being an admin
                as well. Switching it on here changes nothing for any creator.
              </p>
            </Note>
          </div>
        </div>
      </Panel>
    </LabPage>
  )
}

function Tile({ label, value, hint, accent }) {
  return (
    <div className={'card !p-5 ' + (accent ? 'border-brand-tint bg-brand-tint/40' : '')}>
      <p className="text-xs font-medium leading-tight text-smoke">{label}</p>
      <p className={'mt-2 text-3xl font-bold tracking-tight ' + (accent ? 'text-brand' : '')}>{value}</p>
      {hint && <p className="mt-1 text-[11px] leading-relaxed text-smoke">{hint}</p>}
    </div>
  )
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      <Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" /><Skeleton className="h-28" />
    </div>
  )
}
