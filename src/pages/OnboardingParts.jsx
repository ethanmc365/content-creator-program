import { isoForCountryName } from '../lib/markets'
import { flagFromIso } from '../lib/flags'
import Icon from '../components/Icon'
import { ageFromDob, MIN_AGE } from '../lib/utils'
import { notice } from '../lib/confirm'
import { useT } from '../lib/i18n'
import { usePlaceNames } from '../lib/placeNames'

// `need`      does this screen block Continue until it is filled in
// `skippable` does this screen HAVE fields, none of which are required
//
// They are not the same claim and conflating them puts the word "optional" on
// the welcome screen and on the review, neither of which has a field on it.
export const STEPS = [
  { key: 'welcome', title: 'Welcome', part: 'You', need: false },
  { key: 'identity', title: 'Name and photo', part: 'You', need: true },
  { key: 'based', title: "Where you're based", part: 'You', need: true },
  { key: 'socials', title: 'Where you post', part: 'Your work', need: true },
  { key: 'story', title: 'Your story', part: 'Your work', need: true },
  { key: 'languages', title: 'Languages', part: 'Your travel', need: true },
  { key: 'map', title: 'Your travel map', part: 'Your travel', need: true },
  { key: 'extras', title: 'Photos and plans', part: 'Your travel', need: false, skippable: true },
  { key: 'review', title: 'Review', part: 'Finish', need: false },
]

// THE SHORT VERSION, FOR SOMEBODY APPLYING TO WORK ON THE PROGRAMME RATHER
// THAN TO CREATE FOR IT (29 Sep 2026).
//
// Ethan: "a shortened signup (name, photo, bio, tutorial; no bank details or
// socials)". Four of the nine steps only make sense for a creator: where you
// post, the languages you film in, your travel map and your travel photos. A
// market manager has no channels to link and is not entering challenges, and
// asking them to tap countries on a map before they can run one is the kind of
// thing that makes a tool feel like it was built for somebody else.
//
// The steps are a LIST now rather than the module constant, so the progress
// bar, "step 3 of 5", the Back button and the resume-where-you-left-off logic
// all keep working off the same array without any of them knowing why it is
// shorter.
// TRAVEL PHOTOS STAY, AS AN OPTIONAL STEP (29 Sep 2026). Ethan: "give them the option
// to add travel photos too, but obviously they can easily skip." The photos are what
// make a profile feel like a person's on the team page; the channels, languages and
// map are still a creator's business only.
export const TEAM_SKIP = new Set(['socials', 'languages', 'map'])

export const stepsFor = (team) => (team ? STEPS.filter((s) => !TEAM_SKIP.has(s.key)) : STEPS)

export const EMPTY = {
  name: '', photo_url: '', dob: null, city: '', country: '', country_code: '',
  bio: '', about: '', favourite_quote: '',
  instagram_url: '', tiktok_url: '', youtube_url: '', facebook_url: '', other_links: [],
  languages: [], countries_visited: [], bucket_list: [],
}

// An invented applicant, for the Testing Centre's prefilled walkthrough. It is
// here rather than in the lab so the flow can be opened directly at
// /onboarding?demo=1&prefill=full and still be complete.
export const DEMO_DRAFT = {
  name: 'Alex Test',
  photo_url: 'demo',
  dob: '1997-04-18',
  city: 'Bristol',
  country: 'United Kingdom',
  country_code: 'GB',
  bio: 'Bristol based creator, mostly food and city walks.',
  about: 'I have been making short travel videos for three years, mostly around the south west of England and cheap European city breaks. I film everything on a phone and edit on the train home.',
  favourite_quote: 'The best trips start with a cancelled plan.',
  instagram_url: 'https://instagram.com/alextest',
  tiktok_url: 'https://tiktok.com/@alextest',
  youtube_url: '',
  facebook_url: '',
  other_links: [],
  languages: ['English', 'Spanish'],
  countries_visited: ['France', 'Spain', 'Portugal', 'Italy', 'Netherlands', 'Morocco', 'Iceland'],
  bucket_list: [{ country: 'Japan', city: 'Kyoto' }],
}

// THE DRAFT AS PROFILE COLUMNS.
//
// One shape, written by two callers: the autosave that runs on every step
// change, and the single submit at the end. They were one inline object inside
// `finish` until 8 Sep 2026, which is the reason the autosave did not exist -
// there was nothing to reuse, and a second hand-written copy of twenty columns
// is a guarantee that the two will disagree eventually.
//
// WHAT IS DELIBERATELY NOT HERE: `onboarded`, `timezone` and the geocoded
// coordinates. Those are facts about FINISHING, not about the answers, and the
// autosave must never be able to let somebody into the platform half-filled.
// `finish` adds them itself.
export function draftColumns(draft) {
  return {
    name: draft.name.trim(),
    photo_url: draft.photo_url,
    dob: draft.dob,
    city: draft.city.trim(),
    country: draft.country.trim(),
    // Derived, never asked for: the picker hands us both halves at once, and
    // this is the column the market system routes on.
    country_code: draft.country_code || isoForCountryName(draft.country),
    bio: draft.bio.trim(),
    about: draft.about.trim(),
    favourite_quote: draft.favourite_quote.trim(),
    instagram_url: draft.instagram_url.trim(),
    tiktok_url: draft.tiktok_url.trim(),
    youtube_url: draft.youtube_url.trim(),
    facebook_url: draft.facebook_url.trim(),
    other_links: (draft.other_links || []).filter((l) => l.url?.trim()),
    languages: draft.languages,
    countries_visited: draft.countries_visited,
    bucket_list: (draft.bucket_list || [])
      .map((b) => ({ country: (b.country || '').trim(), city: (b.city || '').trim() }))
      .filter((b) => b.country),
  }
}

/** Every problem with the draft, as a list a person can act on. */
export function draftProblems(draft, contact, { team = false } = {}) {
  const p = []
  if (!draft.name?.trim()) p.push({ step: 'identity', text: 'Add your name' })
  if (!draft.photo_url) p.push({ step: 'identity', text: 'Add a profile photo' })
  if (!draft.country_code) p.push({ step: 'based', text: 'Choose the country you live in' })
  if (!draft.city?.trim()) p.push({ step: 'based', text: 'Add your town or city' })
  if (!draft.dob) p.push({ step: 'based', text: 'Add your date of birth' })
  // TOO YOUNG IS A RULE, NOT A DATABASE ERROR (4 Sep 2026).
  //
  // Ethan, submitting a test application: "on the submit profile page I got
  // this error - your application could not be saved: new row for relation
  // profiles violates check constraint profiles_age_check. This shows up
  // because the date of birth I entered was less than 18 years old. Change it
  // so that if they're too young it shows a popup saying they're too young and
  // to reapply later, rather than a weird error message."
  //
  // He is right twice over. The rule was only ever enforced by
  // `profiles_age_check`, which is the LAST line of defence and speaks
  // Postgres - so somebody was allowed to fill in nine screens and was then
  // handed a constraint name. And the check never ran until Submit, at the far
  // end of the flow, when the answer was known on the screen where the date was
  // typed. It is a validation problem now: named at the field, blocking on the
  // step, and refused with a sentence rather than an error at the end.
  else if (ageFromDob(draft.dob) != null && ageFromDob(draft.dob) < MIN_AGE) {
    p.push({ step: 'based', text: 'You need to be at least {n} to join', vars: { n: MIN_AGE } })
  }
  if (!contact.phone?.trim() || !contact.phone_country) p.push({ step: 'based', text: 'Add a phone number with its country code' })
  // A team application is not asked for channels, languages or a travel map -
  // those are a creator's work, and this person is applying to run the
  // programme. See `stepsFor`.
  if (!team && !draft.instagram_url?.trim() && !draft.tiktok_url?.trim() && !draft.youtube_url?.trim() && !draft.facebook_url?.trim()) {
    p.push({ step: 'socials', text: 'Link at least one account you post on' })
  }
  if (!draft.bio?.trim()) p.push({ step: 'story', text: 'Write your one-line bio' })
  if (!draft.about?.trim()) p.push({ step: 'story', text: 'Write a few lines about you' })
  if (!team && !draft.languages?.length) p.push({ step: 'languages', text: 'Pick at least one language' })
  if (!team && !draft.countries_visited?.length) p.push({ step: 'map', text: 'Tap at least one country on your map' })
  return p
}

export function browserTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { return null }
}

export function Req() {
  const tr = useT()
  return <span className="text-brand" title={tr("Required")}>*</span>
}

/**
 * THE MARKET, AS A STATEMENT.
 *
 * This is the whole reason the old "pick your market" step is gone. Every open
 * market matches on a list of country codes and those lists do not overlap, so
 * choosing a country IS choosing a market. Saying so on the same screen, the
 * instant it is decided, is both shorter and more honest than asking again
 * later - and it means a creator sees the answer while the country picker is
 * still in front of them, which is the only moment they can correct it.
 */
export function VipMarketCard({ home, country }) {
  const tr = useT()
  const place = usePlaceNames()
  if (!home) {
    return (
      <div className="flex items-center gap-3 rounded-card border border-dashed border-gray-200 px-4 py-3.5 text-xs text-smoke">
        <Icon name="star" className="h-4 w-4 text-brand" />
        {tr('Pick your country and we will tell you which VIP market you join.')}
      </div>
    )
  }
  return (
    <div key={home.programme_id} className="onb-market relative overflow-hidden rounded-card bg-gradient-to-r from-brand to-brand-light px-4 py-3.5 text-white shadow-card">
      <span aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-white/15 blur-xl" />
      <div className="relative flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/20 text-xl leading-none">{home.worldwide ? '🌍' : ((home.country_codes || []).map(flagFromIso).join('') || '⭐')}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-white/85">{tr('Your VIP market')}</p>
          <p className="truncate text-[15px] font-bold">{home.name}</p>
        </div>
        <Icon name="star" className="h-5 w-5 shrink-0 text-white/90" />
      </div>
      {!home.matched && country && (
        <p className="relative mt-2 text-xs leading-relaxed text-white/90">{tr('There is no VIP market for {country} yet, so you start in {m}. The team will move you if one opens.', { country: place.country(country), m: home.name })}</p>
      )}
    </div>
  )
}

// The two controls that would write into the signed-in admin's own account,
// drawn as samples. Not interactive on purpose: an upload button that does
// nothing when pressed is worse in a demonstration than an obvious placeholder,
// because the audience spends the next minute wondering if it is broken.
export function DemoAvatar({ name }) {
  const tr = useT()
  const initials = String(name || 'A T').split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('')
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex h-28 w-28 items-center justify-center rounded-full bg-brand-tint text-3xl font-semibold text-brand ring-2 ring-white">
        {initials}
      </div>
      <p className="text-xs text-smoke">{tr("Sample photo. Uploading is switched off in the Testing Centre.")}</p>
    </div>
  )
}

export function DemoGallery() {
  const tr = useT()
  const shots = ['Lisbon, rooftop', 'Tromso, blue hour', 'Seville, morning', 'Dolomites, day two', 'Marrakech, souk', 'Skye, the long road']
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {shots.map((s, i) => (
          <div key={s} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl bg-cloud px-3 text-center">
            <Icon name="image" className="h-6 w-6 text-brand/50" />
            <span className="text-[11px] leading-tight text-smoke">{s}</span>
            <span className="text-[10px] text-gray-400">{tr('Photo {n}', { n: i + 1 })}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-smoke">{tr("Sample gallery. Uploading is switched off in the Testing Centre.")}</p>
    </div>
  )
}

// THE ONE ANSWER TO AN UNDER-18 DATE OF BIRTH (12 Oct 2026), in Ethan's words: "just show a popup saying this community
// is only for creators aged 18 or over". Shown when the date is typed and again if they reach Submit with it.
export function tooYoungNotice(tr) {
  return notice(
    tr('Nothing has been sent. You are very welcome to apply once you turn 18.'),
    { title: tr('This community is only for creators aged 18 or over') },
  )
}
