import { Link } from 'react-router-dom'
import { Avatar, CopyButton, Skeleton } from './ui'
import Icon from './Icon'
import { useAuth } from '../context/AuthContext'
import { SUPPORT_EMAIL, TEAM_LEAD, useTeam } from '../lib/team'
import { useT } from '../lib/i18n'

// GET HELP: THE PEOPLE, NOT A FORM.
//
// Ethan: "we have the Help us improve section - maybe an actual help section
// where we just have the whole Tryp.com team listed there, and they can
// specifically click to DM them, get help, and also have my email at the top as
// the Tryp.com Content Creator Community Lead so they can reach me directly if
// they need anything. In case anyone's struggling with anything or has any
// questions and doesn't want to ask in the chat."
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
// THE SECOND PASS (7 Sep 2026), and every change is Ethan's:
//
//   "I would still make my profile picture clickable there - just picking up on
//   my profile - and have a button to directly message me in the chat as well."
//   The lead's card had an address and nothing else, so the one person the page
//   is named after was the only one on it you could not open or message. He now
//   has the same two doors as everybody else, plus the address.
//
//   "Ask our community and Help us improve - I think that should be at the
//   bottom." They were already last in the source and read as part of the team
//   block; they are now separated by a rule and a label that says what they are,
//   which is the public alternative to this whole page.
//
//   "I don't think you need to show those icons, it can just be the buttons."
//   Gone. A 40px tinted square in front of a two-line label was decoration on
//   the least important thing on the screen.
//
//   "Rather than saying somebody here has hit it before, say somebody here
//   might know." Shorter, and it does not claim to know that they have.
export default function HelpTeam() {
  const tr = useT()
  const { user } = useAuth()
  const { team, lead, loading } = useTeam(user?.id)
  // The lead's own profile id, once it is known. Everything that needs it is
  // hidden until then rather than linking to `/profile/undefined`.
  const leadId = lead?.id
  const isMe = leadId && leadId === user?.id

  return (
    <div className="space-y-5">
      {/* ---- The lead ---- */}
      <div className="animate-fade-up card overflow-hidden !p-0">
        {/* A SOLID BRAND HEADER, because this is the one card on the page that
            is a person rather than a list of them - and because the palette's
            loudest thing belongs on the screen's most important thing. */}
        <div className="flex items-center gap-4 bg-brand px-5 py-5 text-white">
          {/* THE FACE IS A LINK. It is a person, and every other face in this
              product opens the person - a face that does nothing is the odd one
              out, and it is odd on exactly the card where somebody is deciding
              whether to write to a stranger. */}
          {leadId ? (
            <Link
              to={`/profile/${leadId}`}
              aria-label={`${TEAM_LEAD.name} - open profile`}
              className="shrink-0 rounded-full transition-transform duration-200 hoverable:hover:scale-105"
            >
              <Avatar src={TEAM_LEAD.photo} name={TEAM_LEAD.name} size="lg" />
            </Link>
          ) : (
            <Avatar src={TEAM_LEAD.photo} name={TEAM_LEAD.name} size="lg" />
          )}
          <div className="min-w-0">
            {leadId ? (
              <Link to={`/profile/${leadId}`} className="block truncate text-lg font-bold hover:underline">
                {TEAM_LEAD.name}
              </Link>
            ) : (
              <p className="truncate text-lg font-bold">{TEAM_LEAD.name}</p>
            )}
            <p className="text-sm text-white/85">{tr(TEAM_LEAD.role)}</p>
          </div>
        </div>

        <div className="space-y-4 p-5">
          <p className="text-sm leading-relaxed text-smoke">
            {tr('Stuck on something, unsure about a brief, or waiting on a payment? Message me here or write to me directly. You do not have to ask in the rooms if you would rather not.')}
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

          {/* Hidden for the lead themselves - "message yourself" is not help -
              and until the id has landed, so neither button can be a dead
              link. */}
          {leadId && !isMe && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link to={`/messages?to=${leadId}`} className="btn-primary flex-1 justify-center !py-2.5 text-sm">
                <Icon name="envelope" className="h-4 w-4" />
                {tr('Message me on here')}
              </Link>
              <Link to={`/profile/${leadId}`} className="btn-secondary flex-1 justify-center !py-2.5 text-sm">
                {tr('View my profile')}
              </Link>
            </div>
          )}
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
              className="animate-fade-up flex items-center gap-3 rounded-card border border-gray-100 bg-white p-3.5 shadow-card transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/30 hoverable:hover:shadow-lift"
              style={{ animationDelay: `${0.12 + i * 0.05}s` }}
            >
              {/* THE FACE AND THE NAME GO TO THE PROFILE, THE BUTTON OPENS THE
                  CHAT. Two actions on one row need two targets, or pressing a
                  person to read about them starts a conversation with them -
                  the same rule the chat bubble learned about avatars. */}
              <Link to={`/profile/${p.id}`} className="shrink-0 rounded-full transition-transform duration-200 hoverable:hover:scale-105">
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
                className="btn-secondary shrink-0 !px-3.5 !py-2 text-xs"
                aria-label={`${tr('Message')} ${p.name}`}
              >
                <Icon name="envelope" className="h-4 w-4" />
                <span className="hidden sm:inline">{tr('Message')}</span>
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* ---- The public alternatives, last and labelled ----
          Both of these already exist and both are PUBLIC, which is exactly the
          distinction worth drawing rather than hiding: somebody happy to ask in
          the open gets a faster answer there, from forty people instead of two.
          A rule and a label separate them from the team block, because until
          now they read as two more members of it. */}
      <div className="animate-fade-up border-t border-gray-100 pt-5" style={{ animationDelay: '0.24s' }}>
        <p className="text-sm font-semibold">{tr('Or ask in the open')}</p>
        <p className="mt-0.5 text-xs text-smoke">{tr('Faster, and the answer helps whoever asks next.')}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {[
            { to: '/board', label: 'Ask the community', hint: 'Somebody here might know' },
            { to: '/feedback', label: 'Help us improve', hint: 'An idea, or something that is not working' },
          ].map((o) => (
            <Link
              key={o.to}
              to={o.to}
              className="flex items-center justify-between gap-3 rounded-card border border-gray-100 bg-white p-4 shadow-card transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/30 hoverable:hover:shadow-lift"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold">{tr(o.label)}</span>
                <span className="block text-xs text-smoke">{tr(o.hint)}</span>
              </span>
              <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
