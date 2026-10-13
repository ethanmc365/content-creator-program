import { flagFromIso } from '../lib/flags'
import Icon from '../components/Icon'
import { Avatar } from '../components/ui'
import { ageFromDob } from '../lib/utils'
import { useT } from '../lib/i18n'
import { usePlaceNames } from '../lib/placeNames'
import { ReviewRow } from './OnboardingReviewRow'

/**
 * THE REVIEW SCREEN, WHICH THE OLD FLOW DID NOT HAVE.
 *
 * Submitting an application is the one irreversible thing in this whole flow -
 * it goes to a person who reads it once. Not being able to see the thing you
 * are about to send, in one piece, is the sort of gap you only notice from the
 * other side of it. Anything missing is listed with a button that goes straight
 * to the screen it lives on, rather than an orange line saying "fill in all
 * required boxes" and leaving the hunt to you.
 */
export function Review({ draft, contact, market, problems, pending, onJump, demo, vipHome = null }) {
  const tr = useT()
  const place = usePlaceNames()
  const age = ageFromDob(draft.dob)
  const socials = [
    ['Instagram', draft.instagram_url],
    ['TikTok', draft.tiktok_url],
    ['YouTube', draft.youtube_url],
    ['Facebook', draft.facebook_url],
  ].filter(([, v]) => v?.trim())

  return (
    <div className="space-y-6">
      {problems.length > 0 && (
        <div className="rounded-card border border-gray-100 bg-white p-4">
          <p className="text-sm font-semibold text-brand">
            {problems.length} thing{problems.length === 1 ? '' : 's'} still to fill in
          </p>
          <ul className="mt-3 space-y-1.5">
            {problems.map((p) => (
              <li key={p.text}>
                <button
                  type="button"
                  onClick={() => onJump(p.step)}
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-white"
                >
                  <Icon name="alert" className="h-3.5 w-3.5 shrink-0 text-brand" />
                  <span className="min-w-0 flex-1">{tr(p.text, p.vars)}</span>
                  <span className="shrink-0 font-semibold text-brand">{tr("Fix")}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex items-center gap-4 rounded-card border border-gray-100 bg-cloud/50 p-4">
        {demo || !draft.photo_url
          ? <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-tint text-lg font-semibold text-brand">
              {draft.name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('') || '?'}
            </span>
          : <Avatar src={draft.photo_url} name={draft.name} size="lg" />}
        <div className="min-w-0">
          <p className="truncate text-lg font-bold">{draft.name || 'Your name'}</p>
          <p className="truncate text-sm text-smoke">{draft.bio || 'Your one-line bio'}</p>
          <p className="mt-0.5 text-xs text-smoke">
            {[draft.city, draft.country].filter(Boolean).join(', ') || 'Where you live'}
            {age != null && ` · ${age}`}
          </p>
        </div>
      </div>

      {vipHome ? (
        <div className="flex items-center gap-3 rounded-card border border-gray-100 bg-white px-4 py-3">
          <span className="text-xl leading-none" aria-hidden>{vipHome.worldwide ? '🌍' : ((vipHome.country_codes || []).map(flagFromIso).join('') || '⭐')}</span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-smoke">{tr('Your VIP market')}</p>
            <p className="text-sm font-bold text-brand">{vipHome.name}</p>
          </div>
          <Icon name="star" className="h-5 w-5 shrink-0 text-brand" />
        </div>
      ) : market.market ? (
        <div className="flex items-center gap-3 rounded-card border border-gray-100 bg-white px-4 py-3">
          <span className="text-xl leading-none" aria-hidden>
            {(market.market.country_codes || []).map(flagFromIso).join('') || '🌍'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs text-smoke">{tr("You will be assigned to")}</p>
            <p className="text-sm font-bold text-brand">{market.market.name}</p>
          </div>
          <Icon name="check" className="h-5 w-5 shrink-0 text-brand" />
        </div>
      ) : (
        <div className="rounded-card border border-gray-200 px-4 py-3 text-xs text-smoke">
          {tr('Worldwide community only for now. No market covers {country} yet.', { country: draft.country ? place.country(draft.country) : tr('your country') })}
        </div>
      )}

      <dl className="divide-y divide-gray-100">
        <ReviewRow label={tr("About you")} onJump={() => onJump('story')} value={draft.about} multiline />
        <ReviewRow label={tr("Posts on")} onJump={() => onJump('socials')} value={socials.map(([k]) => k).join(', ')} />
        <ReviewRow label={tr("Languages")} onJump={() => onJump('languages')} value={draft.languages.map(place.language).join(', ')} />
        <ReviewRow label={tr("Countries visited")} onJump={() => onJump('map')} value={draft.countries_visited.length ? `${draft.countries_visited.length}` : ''} />
        <ReviewRow label={tr("Phone")} onJump={() => onJump('based')} value={contact.phone ? `${contact.phone_country} ${contact.phone}` : ''} hint={tr("Private. Only the team can see this.")} />
        <ReviewRow label={tr("Favourite quote")} onJump={() => onJump('story')} value={draft.favourite_quote} optional />
        <ReviewRow label={tr("Bucket list")} onJump={() => onJump('extras')} value={(draft.bucket_list || []).filter((b) => b.country).map((b) => [b.city, b.country].filter(Boolean).join(', ')).join(' · ')} optional />
        <ReviewRow label={tr("Other links")} onJump={() => onJump('extras')} value={(draft.other_links || []).filter((l) => l.url).length ? `${(draft.other_links || []).filter((l) => l.url).length}` : ''} optional />
      </dl>

      <p className="text-center text-xs leading-relaxed text-smoke">
        {pending
          ? tr('When you submit, the Tryp.com Team is notified and a person reads your application. You will hear back by email.')
          : tr('Your profile goes live as soon as you finish. You can change any of it later.')}
      </p>
    </div>
  )
}
