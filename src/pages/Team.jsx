import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import BackLink from '../components/BackLink'
import Reveal from '../components/network/Reveal'
import Icon from '../components/Icon'
import { Avatar, EmptyState, PageHeader, Skeleton } from '../components/ui'
import { permissionLabel } from '../lib/roles'
import { isOnline, presenceLabel } from '../lib/presence'
import { cx } from '../lib/utils'

// The Tryp.com team, as a creator sees it.
//
// WHY THIS EXISTS SEPARATELY FROM /admin/team
//
// The admin page is a control panel: promote, demote, retitle, hand over. This
// is a directory: who runs this thing, what each of them actually does, and how
// to reach them. Same `team_roster()` underneath, none of the buttons.
//
// It closes a gap that mattered more than it looked. A creator with a question
// about a Spanish brief had no way to find out that there IS a Spain lead, let
// alone who. "Ask in the room and hope" is not a support model, and a programme
// whose staff are anonymous reads as a company rather than as people.

function Person({ p, big = false }) {
  return (
    <Link
      to={`/profile/${p.id}`}
      className={cx(
        'flex items-center gap-3 rounded-card border bg-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift',
        big ? 'border-brand/25 bg-brand-tint/20 p-5' : 'border-gray-100 p-4',
      )}
    >
      <span className="relative shrink-0">
        <Avatar src={p.photo_url} name={p.name} size={big ? 'lg' : 'md'} />
        {isOnline(p.last_seen_at) && (
          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full bg-green-500 ring-2 ring-white" title="Online now" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block truncate font-semibold', big && 'text-lg')}>{p.name}</span>
        {/* The TITLE is the headline, not the permission. "Spain Country
            Manager" is what a creator needs; "global_admin" is what the database
            needs, and nobody outside this codebase should ever see it. */}
        <span className="block truncate text-sm font-medium text-brand">
          {p.role_title || permissionLabel(p.platform_role)}
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-smoke">
          {p.markets?.length > 0 && <span className="truncate">Looks after {p.markets.join(', ')}</span>}
          {presenceLabel(p.last_seen_at) && (
            <>
              {p.markets?.length > 0 && <span aria-hidden>•</span>}
              <span>{presenceLabel(p.last_seen_at)}</span>
            </>
          )}
        </span>
      </span>
      <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300" />
    </Link>
  )
}

export default function Team() {
  const { user } = useAuth()
  const [team, setTeam] = useState(null)

  useEffect(() => {
    let alive = true
    supabase.rpc('team_roster').then(({ data }) => { if (alive) setTeam(data || []) })
    return () => { alive = false }
  }, [])

  if (!team) {
    return (
      <div className="page max-w-3xl space-y-4">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    )
  }

  const lead = team.find((t) => t.platform_role === 'owner')
  const rest = team.filter((t) => t.id !== lead?.id)

  return (
    <div className="page max-w-3xl">
      <BackLink />
      <PageHeader
        title="The Tryp.com team"
        subtitle="Who runs the programme, and who to talk to about what."
      />

      {team.length === 0 ? (
        <EmptyState icon={<Icon name="shield" className="h-7 w-7" />} title="Nobody listed yet" />
      ) : (
        <div className="space-y-8">
          {lead && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-smoke">
                Programme lead
              </h2>
              <Person p={lead} big />
            </section>
          )}

          {rest.length > 0 && (
            <section>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-widest text-smoke">
                The team
              </h2>
              <Reveal className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {rest.map((p) => <Person key={p.id} p={p} />)}
              </Reveal>
            </section>
          )}

          <section className="rounded-card border border-gray-100 bg-cloud/50 p-5">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Icon name="chat" className="h-4 w-4 text-brand" /> Getting hold of us
            </h2>
            <p className="mt-1.5 text-sm text-smoke">
              Anything about a brief, a prize or your market: message whoever looks after it, or post in
              that market&rsquo;s General room. Anything about your account or a payment: message the
              programme lead directly. We would rather answer twice than have you sit on a question.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              {lead && lead.id !== user?.id && (
                <Link to={`/messages?to=${lead.id}`} className="btn-primary !py-2 !text-sm">
                  Message {lead.name.split(' ')[0]}
                </Link>
              )}
              <Link to="/feedback" className="btn-secondary !py-2 !text-sm">
                Report a bug or suggest something
              </Link>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

// Re-exported so the market pages can show the same people with the same
// wording without importing the whole page.
export { Person as TeamPerson }
