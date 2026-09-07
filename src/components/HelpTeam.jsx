import { Link } from 'react-router-dom'
import { Avatar, CopyButton, Skeleton } from './ui'
import Icon from './Icon'
import { useAuth } from '../context/AuthContext'
import { SUPPORT_EMAIL, TEAM_LEAD, useTeam } from '../lib/team'
import { useT } from '../lib/i18n'

// GET HELP: THE PEOPLE, NOT A FORM.
//
// Ethan, 7 Sep 2026: "we have the Help us improve section - maybe an actual
// help section where we just have the whole Tryp.com team listed there, and
// they can specifically click to DM them, get help, and also have my email at
// the top as the Tryp.com Content Creator Community Lead so they can reach me
// directly if they need anything. In case anyone's struggling with anything or
// has any questions and doesn't want to ask in the chat."
//
// THAT LAST CLAUSE IS THE WHOLE BRIEF, and it is why this is not a contact
// form. Everything the platform already offers for "I am stuck" is PUBLIC - ask
// the room, post on the community board, write feedback into a box - and the
// person this page is for is specifically the one who does not want to do that
// in front of forty other creators. So what it offers is the two private
// channels: a DM to a named person, and one email address.
//
// THE TEAM IS READ LIVE (see lib/team). A hard-coded list is wrong within a
// week - Casandra was promoted the day before this was written and Jesus was
// removed before that - and a help page naming somebody who has left is worse
// than no help page at all.
//
// ORDER: the lead first with an address, then everybody else with a Message
// button. Ethan asked for his email "at the top", and it is also the honest
// ranking - the email is the channel that works when the app is the problem.
export default function HelpTeam() {
  const tr = useT()
  const { user } = useAuth()
  const { team, loading } = useTeam(user?.id)

  return (
    <div className="space-y-5">
      {/* ---- The lead, with the address ---- */}
      <div className="animate-fade-up card !p-0 overflow-hidden">
        {/* A SOLID BRAND HEADER, because this is the one card on the page that
            is a person rather than a list of them - and because the palette's
            loudest thing belongs on the screen's most important thing. Same
            reasoning as the install prompt's blurb card. */}
        <div className="flex items-center gap-4 bg-brand px-5 py-5 text-white">
          <Avatar src={TEAM_LEAD.photo} name={TEAM_LEAD.name} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-lg font-bold">{TEAM_LEAD.name}</p>
            <p className="text-sm text-white/85">{tr(TEAM_LEAD.role)}</p>
          </div>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm leading-relaxed text-smoke">
            {tr('Stuck on something, unsure about a brief, or waiting on a payment? Write to me directly. You do not have to ask in the rooms if you would rather not.')}
          </p>
          {/* SELECTABLE TEXT, NOT A `mailto:` LINK. The error screen learned
              this the hard way: a mailto is a coin toss - nothing at all on a
              desktop with no mail client, and an app the reader never uses on
              one that has a client configured. The copy button is the action.
              `break-all` because the address has to survive a 320px screen. */}
          <div className="flex items-center gap-3 rounded-xl border border-gray-100 bg-cloud/40 p-4">
            <Icon name="envelope" className="h-5 w-5 shrink-0 text-brand" />
            <span className="min-w-0 flex-1 select-all break-all text-sm font-medium text-ink">{SUPPORT_EMAIL}</span>
            <CopyButton value={SUPPORT_EMAIL} label={tr('Copy email address')} />
          </div>
        </div>
      </div>

      {/* ---- Everybody else ---- */}
      <div className="animate-fade-up" style={{ animationDelay: '0.08s' }}>
        <p className="text-sm font-semibold">{tr('The Tryp.com team')}</p>
        <p className="mt-0.5 text-xs text-smoke">
          {tr('We are all in the community. Press a name to open a private chat.')}
        </p>

        <div className="mt-3 space-y-2">
          {loading && [0, 1].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-card border border-gray-100 p-3.5">
              <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-32 rounded" />
                <Skeleton className="h-3 w-44 rounded" />
              </div>
            </div>
          ))}

          {!loading && team.length === 0 && (
            <p className="rounded-card border border-dashed border-gray-200 px-4 py-6 text-center text-sm text-smoke">
              {tr('Use the email above and it will reach us.')}
            </p>
          )}

          {!loading && team.map((p, i) => (
            <div
              key={p.id}
              className="animate-fade-up flex items-center gap-3 rounded-card border border-gray-100 bg-white p-3.5 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lift"
              style={{ animationDelay: `${0.12 + i * 0.05}s` }}
            >
              {/* THE FACE AND THE NAME GO TO THE PROFILE, THE BUTTON OPENS THE
                  CHAT. Two actions on one row need two targets, or pressing a
                  person to read about them starts a conversation with them -
                  the same rule the chat bubble learned about avatars. */}
              <Link to={`/profile/${p.id}`} className="shrink-0">
                <Avatar src={p.photo_url} name={p.name} size="md" />
              </Link>
              <div className="min-w-0 flex-1">
                <Link to={`/profile/${p.id}`} className="block truncate text-sm font-semibold hover:text-brand">
                  {p.name}
                </Link>
                {/* The job title lives in the bio, which is where these two have
                    actually written it ("UK Country Manager at Tryp.com", "Head
                    of Nordics"). Where it is empty the city answers the same
                    question a bit less precisely, and neither is invented. */}
                <p className="truncate text-xs text-smoke">
                  {p.bio?.trim() || [p.city, p.country].filter(Boolean).join(', ') || tr('Tryp.com team')}
                </p>
              </div>
              {/* `/messages?to=` opens the thread with them, creating it if this
                  is the first time. See the deep-link effect in pages/Messages. */}
              <Link
                to={`/messages?to=${p.id}`}
                className="btn-secondary shrink-0 !py-2 !px-3.5 text-xs"
                aria-label={`${tr('Message')} ${p.name}`}
              >
                <Icon name="envelope" className="h-4 w-4" />
                <span className="hidden sm:inline">{tr('Message')}</span>
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* ---- The two things this page is NOT ----
          Both already exist and both are public, which is exactly the
          distinction worth drawing rather than hiding: somebody who is happy to
          ask in the open gets a faster answer there, from forty people instead
          of two. */}
      <div className="animate-fade-up grid gap-2 sm:grid-cols-2" style={{ animationDelay: '0.24s' }}>
        <Link to="/board" className="flex items-center gap-3 rounded-card border border-gray-100 bg-white p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lift">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
            <Icon name="chat" className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{tr('Ask the community')}</span>
            <span className="block text-xs text-smoke">{tr('Somebody here has hit it before')}</span>
          </span>
        </Link>
        <Link to="/feedback" className="flex items-center gap-3 rounded-card border border-gray-100 bg-white p-4 shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/30 hover:shadow-lift">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand">
            <Icon name="bulb" className="h-5 w-5" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">{tr('Help us improve')}</span>
            <span className="block text-xs text-smoke">{tr('An idea, or something that is not working')}</span>
          </span>
        </Link>
      </div>
    </div>
  )
}
