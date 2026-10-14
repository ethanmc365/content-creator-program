import { Link } from 'react-router-dom'
import { Avatar, Badge, Spinner } from '../../components/ui'
import Icon from '../../components/Icon'
import SocialMark, { brandForUrl } from '../../components/SocialMark'
import { ageFromDob, cx, timeAgo, formatDate } from '../../lib/utils'
import { flagFromIso } from '../../lib/flags'
import { appliedAt, PickTick, EmailRow, Fact } from './AdminApplicationsParts'

// How many whole days somebody sat on a half-finished form. Only used to decide
// whether the signup date is worth printing as well.
function gapDays(app) {
  if (!app?.submitted_at || !app?.created_at) return 0
  return Math.floor((new Date(app.submitted_at) - new Date(app.created_at)) / 86400000)
}

// THE "WHAT IS MISSING" CHIPS ARE GONE.
//
// They are right, and `gapsIn` was solving a problem the card no longer has: the bio, the links, the photo and the
// languages are all ON the card, so a second row of chips saying "no links" under a row that visibly has no links is the
// page explaining itself to somebody who can already see.

export function ApplicationCard({
  app, email, phone, photos, links, suggested, languageHints, markets,
  marketsSpeaking, vipOptions = null, vipPicked = null, onVipPick,
  placeIn, onPlaceIn, open, onToggle, busy, onApprove, onApproveTeam, onDecline, onZoom, onZoomPhoto,
  selected, onSelect, inviteLabel,
}) {
  // `profiles.dob` IS NULL ON EVERY ROW AND ALWAYS WILL BE - a BEFORE trigger
  // (mirror_dob_to_private) moves it into creator_private and derives
  // `profiles.age` from it. Reading dob here printed no age for anybody.
  const age = app.age ?? ageFromDob(app.dob)
  // Suggested first, the rest in their given order. `suggested` is `{ market, why, langs }` - see the note on
  // `suggestion`. Unwrapped once here so the rest of the card reads the same as it did when it was a bare market.
  const suggestedMarket = suggested?.market ?? null
  const orderedMarkets = suggestedMarket
    ? [...markets].sort((a, b) => (a.slug === suggestedMarket.slug ? -1 : b.slug === suggestedMarket.slug ? 1 : 0))
    : markets
  const bucketList = (Array.isArray(app.bucket_list) ? app.bucket_list : [])
    .map((b) => (typeof b === 'string' ? b : [b?.city, b?.country].filter(Boolean).join(', ')))
    .filter(Boolean)

  return (
    <div className={cx(
      'card !p-0 overflow-hidden transition-all duration-200 hover:shadow-lift',
      (app.team_application || app.is_vip) && '!border-brand/50 shadow-lift',
      selected && 'ring-2 ring-brand/40',
    )}>
      {/* A VIP APPLICATION LOOKS LIKE ONE. They came through the one VIP link; approving them places them with their own
          market's VIP programme, where they are paid by views, not by challenges. */}
      {app.is_vip && !app.team_application && (
        // PURE BLACK, NO GRADIENT.
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-black px-4 py-2.5 text-white sm:px-6">
          <Icon name="star" className="h-4 w-4 shrink-0 text-brand-light" />
          <span className="text-sm font-bold">VIP creator application</span>
          <span className="text-xs text-white/80">Signed up with the VIP link. Pick the VIP market to approve them into.</span>
        </div>
      )}
      {/* A TEAM APPLICATION LOOKS LIKE ONE. The team: on the applications page they "just appear as a normal creator",
          but approving them gives them admin access. So the card says it in solid brand colour before anything else
          does. */}
      {app.team_application && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 bg-gradient-to-r from-brand to-brand-light px-4 py-2.5 text-white sm:px-6">
          <Icon name="shield" className="h-4 w-4 shrink-0" />
          <span className="text-sm font-bold">Applied to join the Tryp.com team</span>
          <span className="text-xs text-white/85">
            {app.requested_role_title ? `Invite note: ${app.requested_role_title}` : 'Approving gives admin access'}
            {inviteLabel ? ` · via “${inviteLabel}”` : ''}
          </span>
        </div>
      )}

      {/* ------------------------------------------------------- the summary */}
      {/* A GRID, SO THE WORDS GET THE WIDTH. The summary was ONE flex row - tick, 80px face, the text, and the dates
          column - and the text was `flex-1` with a zero basis, so on a 375px screen it got what was left: about 100px.
          Every sentence of a bio became a column of single words. Now the face, the name and when they applied are a
          header row, and everything you READ (email, bio, links, languages) runs the full width of the card underneath
          it. From `sm` up the same grid puts them back under the name, with the dates on the right. */}
      <div className="grid grid-cols-[auto_auto_minmax(0,1fr)] items-start gap-x-3 gap-y-3 p-4 sm:grid-cols-[auto_auto_minmax(0,1fr)_auto] sm:gap-x-4 sm:gap-y-0 sm:p-6">
        <PickTick selected={selected} onSelect={onSelect} name={app.name} />
        {/* The face is a button when there is a photo to open, and a plain
            avatar when there is not - a control that does nothing when pressed
            is worse than no control. */}
        <div className="sm:row-span-2">
          {app.photo_url ? (
            <button
              type="button"
              onClick={onZoom}
              aria-label={`See ${app.name}'s photo full size`}
              className="shrink-0 rounded-full transition-transform duration-200 hoverable:hover:scale-105"
            >
              <Avatar src={app.photo_url} name={app.name} size="lg" className="!h-14 !w-14 sm:!h-20 sm:!w-20" />
            </button>
          ) : (
            <Avatar src={app.photo_url} name={app.name} size="lg" className="!h-14 !w-14 sm:!h-20 sm:!w-20" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <h2 className="min-w-0 break-words text-base font-bold leading-snug sm:text-lg">{app.name}</h2>
            {age != null && <span className="text-sm text-smoke">{age}</span>}
            {app.referred_by && <Badge tone="brand">Referred</Badge>}
          </div>
          <p className="truncate text-sm text-smoke">
            {[app.city, app.country].filter(Boolean).join(', ') || 'No location given'}
          </p>
          <p className="mt-0.5 text-[11px] text-gray-400 sm:hidden">Applied {timeAgo(appliedAt(app))}</p>
        </div>

        <div className="hidden shrink-0 text-right sm:row-span-2 sm:block">
          {/* WHEN THEY SUBMITTED, NOT WHEN THEY SIGNED UP. See `appliedAt` -
              those are two different days for anybody who started the form and
              came back to it, and this queue is about the day they finished. */}
          <p className="text-xs text-gray-400">Applied {timeAgo(appliedAt(app))}</p>
          <p className="text-[11px] text-gray-300">{formatDate(appliedAt(app))}</p>
          {gapDays(app) >= 1 && (
            <p className="mt-0.5 text-[11px] text-gray-300">
              Signed up {timeAgo(app.created_at)}
            </p>
          )}
        </div>

        <div className="col-span-3 min-w-0 sm:col-span-1 sm:col-start-3">
          <EmailRow email={email} />
          {app.bio && (
            <p className="mt-2 whitespace-normal break-words text-sm leading-relaxed text-ink line-clamp-4 sm:line-clamp-none">
              {String(app.bio).replace(/\s+/g, ' ').trim()}
            </p>
          )}

          {/* The platforms, as links in their own colours. What an approval
              turns on is the work, and the work is behind these. */}
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {links.length > 0 ? links.map((l) => {
              const brand = brandForUrl(l.url)
              return (
                <a
                  key={l.label + l.url}
                  href={l.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex max-w-full items-center gap-2 rounded-full border border-gray-200 bg-white py-1 pl-1.5 pr-3 text-xs font-semibold text-ink transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand hoverable:hover:shadow-card"
                >
                  <SocialMark brand={brand} tile className="h-[18px] w-[18px] shrink-0" />
                  <span className="truncate">{l.label || brand}</span>
                </a>
              )
            }) : (
              <span className="rounded-full bg-amber-50 px-2.5 py-1 text-[11px] font-medium text-amber-700">
                No links to their work
              </span>
            )}
          </div>

          {/* THE ONBOARDING CALL (migration 413), for a market that requires one: ticked = they say they booked it,
              opened = they looked at the booking page and did not tick. */}
          {(app.onboarding_call_booked_at || app.onboarding_call_opened_at) && (
            <div className="mt-2.5">
              <span className={cx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold',
                app.onboarding_call_booked_at ? 'bg-brand text-white' : 'bg-cloud text-smoke')}>
                <Icon name="calendar" className="h-3.5 w-3.5" />
                {app.onboarding_call_booked_at
                  ? `Booked their onboarding call · ${new Date(app.onboarding_call_booked_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`
                  : 'Opened the booking page, has not booked'}
              </span>
            </div>
          )}

          {/* LANGUAGES: THE FIRST ONE IS THEIR MAIN LANGUAGE. The orange meant "spoken in one of our markets", which
              nobody could guess. Now the one colour means the one thing a reader expects: the language they picked FIRST
              is their main language, solid and labelled; the rest are grey. Which market a language points at is still
              in the tooltip, and still drives the "Approve into" suggestion. */}
          {app.languages?.length > 0 && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Speaks</span>
              {app.languages.map((l, i) => {
                const where = marketsSpeaking?.(l) ?? []
                const main = i === 0
                return (
                  <span
                    key={l}
                    title={where.length ? `Spoken in ${where.join(' and ')}` : undefined}
                    className={cx(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
                      main ? 'bg-brand text-white' : 'bg-cloud text-smoke',
                    )}
                  >
                    {l}
                    {main && app.languages.length > 1 && <span className="rounded-full bg-white/25 px-1 text-[9px] uppercase tracking-wide">Main</span>}
                  </span>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Their photographs. The single best evidence of whether somebody can
          shoot, and the one thing this page never showed. */}
      {photos.length > 0 && (
        <div className="-mt-1 flex gap-2 overflow-x-auto px-4 pb-4 sm:px-6">
          {photos.slice(0, 8).map((url, i) => (
            <button
              key={url}
              type="button"
              onClick={(e) => onZoomPhoto?.(e, i)}
              aria-label={`See travel photo ${i + 1} full size`}
              className="shrink-0 overflow-hidden rounded-xl transition-transform duration-200 hoverable:hover:scale-105"
            >
              <img src={url} alt="" loading="lazy" className="h-16 w-16 object-cover sm:h-20 sm:w-20" />
            </button>
          ))}
          {photos.length > 8 && (
            <button
              type="button"
              onClick={(e) => onZoomPhoto?.(e, 8)}
              className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-cloud text-xs font-semibold text-smoke transition-transform duration-200 hoverable:hover:scale-105 sm:h-20 sm:w-20"
            >
              +{photos.length - 8}
            </button>
          )}
        </div>
      )}

      {/* --------------------------------------------------- the whole thing */}
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-2 border-t border-gray-50 px-4 py-2.5 text-xs font-semibold text-smoke transition-colors hover:bg-cloud/50 hover:text-ink sm:px-6"
        aria-expanded={open}
      >
        {open ? 'Hide the details' : 'Read the whole application'}
        <Icon name={open ? 'chevronUp' : 'chevronDown'} className="h-4 w-4" />
      </button>

      {open && (
        <div className="space-y-4 border-t border-gray-50 bg-cloud/30 px-4 py-4 text-sm sm:px-6 sm:py-5">
          {app.about && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">In their words</p>
              <p className="whitespace-pre-line leading-relaxed text-ink">{app.about}</p>
            </div>
          )}
          {app.favourite_quote && (
            <p className="border-l-2 border-brand/30 pl-3 text-sm italic text-smoke">“{app.favourite_quote}”</p>
          )}
          {/* NO COPY ICONS ON THESE ROWS, AND NO TIMEZONE. A bare icon at the end of a row is a control with no label,
              and there were four of them doing four different things. The one copy that is actually wanted is on the
              decision bar, where it says the word Email on it.

              And: "I don't get why it's showing their timezone - it doesn't even ask for the timezone, you just take it
              automatically." Right on both counts. It is taken from the browser at submit, so it is never a fact about
              the applicant that an admin is judging, and printing "Not given" for it on an older row invents a gap that
              does not exist. Gone. */}
          <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
            <Fact label="Email" value={email} copy />
            <Fact label="Phone" value={phone} copy />
            <Fact label="Countries visited" value={app.countries_visited?.length ? `${app.countries_visited.length}` : null} />
            <Fact label="Bucket list" value={bucketList.slice(0, 3).join(' · ')} />
            <Fact label="Travel photos" value={photos.length ? `${photos.length}` : null} />
          </dl>
        </div>
      )}

      {/* ------------------------------------------------------- the decision */}
      <div className="border-t border-gray-100 bg-white px-4 py-4 sm:px-6">
        {/* THE MARKET IS CHOSEN WITH CHIPS, AND YOU CAN PICK SEVERAL.

            And: "I seem to be unable to choose multiple ones, which I want to be able to do - like UK & Ireland and
            Spain."

            Both are answered by the same control. A native `<select>` renders
            the operating system's own picker - a grey iOS wheel on a phone,
            nothing like anything else in this product - and it cannot express
            more than one answer at all. Toggle chips are what this platform
            already uses everywhere a set is chosen, they are SOLID BRAND when
            picked (never a tint - that rule is written down twice), and picking
            two is just pressing two.

            The first one picked is the creator's HOME market; the rest are
            ordinary memberships. That is said on screen rather than implied,
            because it decides which hub they land on. */}
        {app.team_application ? (
          <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 text-sm text-ink">
            <p className="flex items-center gap-2 font-semibold text-brand"><Icon name="shield" className="h-4 w-4" /> Adding them to the team gives them admin access</p>
            <p className="mt-1 text-xs leading-relaxed text-smoke">
              They will be able to open the admin panel. They are not placed in a market as a creator. Check who they are before you approve, and change their title any time on the Team page.
            </p>
          </div>
        ) : app.is_vip ? (
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Approve into</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(vipOptions || []).map((o) => {
                const on = vipPicked === o.id
                const flags = o.worldwide ? '🌍' : (o.country_codes || []).slice(0, 2).map(flagFromIso).join('')
                return (
                  <button key={o.id} type="button" aria-pressed={on} onClick={() => onVipPick?.(o.id)}
                    className={cx('inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200', on ? 'border-brand bg-brand text-white shadow-card' : 'border-gray-200 bg-white text-smoke hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand hoverable:hover:text-brand')}>
                    <span aria-hidden>{flags}</span>{o.name}
                  </button>
                )
              })}
              {vipOptions === null && <span className="text-xs text-smoke">Loading the VIP markets…</span>}
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-smoke">
              {app.country ? `Picked from their country, ${app.country}. ` : ''}A country with no VIP market of its own goes to VIP Worldwide until one opens.
            </p>
          </div>
        ) : (
          <>
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Approve into</p>
        {/* THE SUGGESTED ONE IS ALWAYS FIRST. It was alphabetical, so the market the page is recommending could be the
            sixth chip along - which makes the recommendation something you have to hunt for, and makes the row's first
            item look like the default when it is not. */}
        <div className="mt-2 flex flex-wrap gap-1.5">
          {orderedMarkets.map((m) => {
            const on = placeIn.includes(m.slug)
            const isSuggested = suggestedMarket?.slug === m.slug
            return (
              <button
                key={m.slug}
                type="button"
                aria-pressed={on}
                onClick={() => onPlaceIn(on ? placeIn.filter((x) => x !== m.slug) : [...placeIn, m.slug])}
                className={cx(
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-all duration-200',
                  on
                    ? 'border-brand bg-brand text-white shadow-card'
                    : 'border-gray-200 bg-white text-smoke hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand hoverable:hover:text-brand',
                )}
              >
                {on && <Icon name="check" className="h-3 w-3" />}
                {m.name}
                {isSuggested && (
                  <span className={cx('text-[10px] font-medium', on ? 'text-white/75' : 'text-gray-400')}>
                    suggested
                  </span>
                )}
              </button>
            )
          })}
        </div>
        {/* WHY IT IS SUGGESTING WHAT IT IS SUGGESTING, ON ITS OWN LINE.

            It used to be the third sentence of one grey paragraph that also
            carried the home-market rule and the "would work too" list, so the
            single fact that justifies the highlighted chip was the hardest
            thing in the block to find. The reason is now its own line, in
            brand, directly under the chips it is about. */}
        {suggested && (
          <p className="mt-2.5 flex items-start gap-1.5 text-[11px] font-medium leading-relaxed text-brand">
            <Icon name={suggested.why === 'language' ? 'chat' : 'pin'} className="mt-px h-3.5 w-3.5 shrink-0" />
            <span>
              {suggested.why === 'language'
                ? <>{suggestedMarket.name} suggested because they speak {suggested.langs.join(' and ')}{app.country ? `, and no market covers ${app.country}` : ''}.</>
                : <>{suggestedMarket.name} suggested because they are in {app.country}.</>}
            </span>
          </p>
        )}

        <p className="mt-2 text-[11px] leading-relaxed text-smoke">
          {placeIn.length === 0
            ? 'Nothing picked, so they join the worldwide community only.'
            : placeIn.length === 1
              ? `Their home market will be ${markets.find((m) => m.slug === placeIn[0])?.name ?? placeIn[0]}.`
              : `Home market: ${markets.find((m) => m.slug === placeIn[0])?.name ?? placeIn[0]}. They will also be in ${placeIn.length - 1} other${placeIn.length > 2 ? 's' : ''}.`}
          {!suggested && ` No market covers ${app.country || 'their country'}, and no language points at one either.`}
          {languageHints.length > 0 && (
            <> They also speak {languageHints.flatMap((h) => h.langs).join(' and ')}, so {languageHints.map((h) => h.market.name).join(' or ')} would work too.</>
          )}
        </p>

          </>
        )}

        {/* EVERY CONTROL LOOKS LIKE A CONTROL, AND THE ONE THAT IS NOT USEFUL IS GONE. - it was `btn-ghost`, which is
            text with padding - and "I don't get the Message button, because obviously we can't message them before
            they're accepted in." they are right: a DM needs a conversation between two members, and this person is not
            one yet. */}
        {/* NO COPY ICON HERE. An unlabelled icon in a row of labelled buttons is the one control nobody can predict. It
            lives on the two rows it is about now - see `Fact`. */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center sm:justify-end">
          <Link to={`/profile/${app.id}`} className="btn-secondary justify-center !py-2 text-xs">Full profile</Link>
          <button onClick={onDecline} disabled={busy} className="btn-danger justify-center !py-2 text-xs">Decline</button>
          {/* A TEAM APPLICATION IS APPROVED ONTO THE TEAM, NOT INTO A MARKET. They came through an invite link, which
              grants nothing; the ordinary Approve puts somebody into a market as a creator, and this person is not one.
              Different button, different function. */}
          <button
            onClick={app.team_application ? onApproveTeam : onApprove}
            disabled={busy}
            className="btn-primary col-span-2 inline-flex items-center justify-center gap-1.5 !py-2 text-xs"
          >
            {busy ? <Spinner className="h-3.5 w-3.5" /> : <Icon name={app.team_application ? 'shield' : 'check'} className="h-3.5 w-3.5" />}
            {app.team_application ? 'Add to the team' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  )
}
