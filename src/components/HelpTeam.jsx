import { Link } from 'react-router-dom'
import { Avatar, CopyButton, Skeleton } from './ui'
import Icon from './Icon'
import { useAuth } from '../context/AuthContext'
import { SUPPORT_EMAIL, TEAM_LEAD, useTeam } from '../lib/team'
import { useT } from '../lib/i18n'

// GET HELP: THE PEOPLE, NOT A FORM - the right-hand column of /help.
//
// Ethan (7 Sep 2026): "an actual help section where we just have the whole Tryp.com team listed there, and they can
// specifically click to DM them ... and also have my email at the top as the Tryp.com Content Creator Community Lead."
// The person this is for does NOT want to ask in front of forty other creators, so what it offers is the two private
// channels: a DM to a named person, and one email address. The team is READ LIVE (lib/team), because a hard-coded list is
// wrong within a week and a help page naming somebody who has left is worse than none.
//
// THE COLUMN (9 Oct 2026). Ethan: "have the small right column and the bigger left column ... in the right column, the
// message, the team function, there in a nice, clean UI ... 'Ask the community' and 'Help us improve' as buttons that
// are easily accessible too." The answers took the wide left column, so this is built to be NARROW: the lead is one card
// with the two ways to reach them, the rest of the team is a tight list of face + name + a message button, and the two
// public doors are real buttons under it. `HelpOpenDoors` is exported on its own because the page places it itself.
export default function HelpTeam() {
  const tr = useT()
  const { user } = useAuth()
  const { team, lead, loading } = useTeam(user?.id)
  const leadId = lead?.id
  const isMe = leadId && leadId === user?.id

  return (
    <div className="space-y-4">
      {/* ---- The lead ---- */}
      <div className="help-lead overflow-hidden rounded-[22px] border border-gray-100 bg-white shadow-card transition-all duration-300 hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift">
        <div className="flex items-center gap-3.5 bg-gradient-to-br from-brand to-brand-light px-5 py-4 text-white">
          {leadId ? (
            <Link to={`/profile/${leadId}`} aria-label={`${TEAM_LEAD.name} - open profile`} className="shrink-0 rounded-full ring-2 ring-white/60 transition-transform duration-200 hoverable:hover:scale-105">
              <Avatar src={TEAM_LEAD.photo} name={TEAM_LEAD.name} size="lg" />
            </Link>
          ) : (
            <Avatar src={TEAM_LEAD.photo} name={TEAM_LEAD.name} size="lg" />
          )}
          <div className="min-w-0">
            {leadId ? <Link to={`/profile/${leadId}`} className="block truncate text-[17px] font-bold hover:underline">{TEAM_LEAD.name}</Link> : <p className="truncate text-[17px] font-bold">{TEAM_LEAD.name}</p>}
            <p className="text-[13px] leading-snug text-white/85">{tr(TEAM_LEAD.role)}</p>
          </div>
        </div>
        <div className="space-y-3 p-4">
          <p className="text-[13px] leading-relaxed text-smoke">
            {tr('Stuck on something, unsure about a brief, or waiting on a payment? Message me here or write to me directly. You do not have to ask in the rooms if you would rather not.')}
          </p>
          {/* Selectable text, not a mailto: a mailto is a coin toss on a machine with no mail client. */}
          <div className="flex items-center gap-2.5 rounded-xl border border-gray-100 bg-cloud/50 px-3 py-2.5">
            <Icon name="envelope" className="h-4 w-4 shrink-0 text-brand" />
            <span className="min-w-0 flex-1 select-all break-all text-[13px] font-medium text-ink">{SUPPORT_EMAIL}</span>
            <CopyButton value={SUPPORT_EMAIL} label={tr('Copy email address')} />
          </div>
          {leadId && !isMe && (
            <Link to={`/messages?to=${leadId}`} className="btn-primary w-full justify-center !py-2.5 text-sm">
              <Icon name="chat" className="h-4 w-4" />{tr('Message me on here')}
            </Link>
          )}
        </div>
      </div>

      {/* ---- Everybody else ---- */}
      <div className="rounded-[22px] border border-gray-100 bg-white p-4 shadow-card transition-all duration-300 hoverable:hover:shadow-lift">
        <p className="text-sm font-bold text-ink">{tr('The Tryp.com team')}</p>
        <p className="mt-0.5 text-xs text-smoke">{tr('We are all in the community. Press a name to open a private chat.')}</p>
        <div className="mt-3 divide-y divide-gray-50">
          {loading && [0, 1, 2].map((i) => (
            <div key={i} className="flex items-center gap-3 py-2.5">
              <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-1.5"><Skeleton className="h-3.5 w-28 rounded" /><Skeleton className="h-3 w-36 rounded" /></div>
            </div>
          ))}
          {!loading && team.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-200 px-4 py-5 text-center text-sm text-smoke">{tr('Use the email above and it will reach us.')}</p>
          )}
          {!loading && team.map((p, i) => (
            <div key={p.id} className="animate-fade-up group/row -mx-2 flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors duration-200 hoverable:hover:bg-cloud/70" style={{ animationDelay: `${0.05 + i * 0.04}s` }}>
              <Link to={`/profile/${p.id}`} className="shrink-0 rounded-full transition-transform duration-200 hoverable:hover:scale-105"><Avatar src={p.photo_url} name={p.name} size="sm" /></Link>
              <div className="min-w-0 flex-1">
                <Link to={`/profile/${p.id}`} className="block truncate text-[13.5px] font-semibold text-ink hover:text-brand">{p.name}</Link>
                <p className="truncate text-xs text-smoke">{p.bio?.trim() || [p.city, p.country].filter(Boolean).join(', ') || tr('Tryp.com team')}</p>
              </div>
              <Link to={`/messages?to=${p.id}`} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cloud text-smoke transition-all duration-200 hoverable:hover:scale-110 hoverable:hover:bg-brand hoverable:hover:text-white" aria-label={`${tr('Message')} ${p.name}`} title={`${tr('Message')} ${p.name}`}>
                <Icon name="chat" className="h-4 w-4" />
              </Link>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** The two PUBLIC doors, as real buttons: faster than a private message, and the answer helps whoever asks next. */
export function HelpOpenDoors() {
  const tr = useT()
  return (
    <div className="grid gap-2.5">
      {[
        { to: '/board', icon: 'users', label: 'Ask the community', hint: 'Somebody here might know' },
        { to: '/feedback', icon: 'bulb', label: 'Help us improve', hint: 'An idea, or something that is not working' },
      ].map((o, i) => (
        <Link key={o.to} to={o.to} className="animate-fade-up group flex items-center gap-3 rounded-[18px] border border-gray-100 bg-white px-4 py-3.5 shadow-card transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/40 hoverable:hover:shadow-lift" style={{ animationDelay: `${0.1 + i * 0.06}s` }}>
          <Icon name={o.icon} className="h-6 w-6 shrink-0 text-brand transition-transform duration-300 group-hover:scale-110" />
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-ink">{tr(o.label)}</span>
            <span className="block text-xs text-smoke">{tr(o.hint)}</span>
          </span>
          <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand" />
        </Link>
      ))}
    </div>
  )
}
