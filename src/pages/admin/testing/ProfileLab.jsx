import { Badge } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { LabPage, Panel, Stage, useStage, InfoList, KeyVal, Note } from './kit'
import { APPLICANT } from './fixtures'

// WHAT ONBOARDING IS ACTUALLY FOR.
//
// Nine screens of form only earn their place if the thing that comes out the
// other end is worth having, so this lab is the other half of the onboarding
// one: every field a creator fills in, and the specific feature on the platform
// that stops working if they leave it blank.
//
// That mapping is the argument for the required list. "Bio" is not required
// because forms like being filled in; it is required because it is the line
// under a creator's name in the directory, on the collaboration board, in the
// connection suggestions and on the leaderboard, and an empty one leaves four
// surfaces looking broken.

const FIELDS = [
  {
    field: 'Profile photo', req: true, where: 'creator_private is not involved: profiles.photo_url',
    powers: ['The directory grid', 'Every message and DM', 'The creator map pins', 'The winners podium', 'Connection suggestions', 'The share card'],
    without: 'A grey circle with initials in nine places, and an admin approving somebody they have never seen.',
  },
  {
    field: 'Name', req: true, where: 'profiles.name',
    powers: ['Everything'],
    without: 'Nothing works. It is on the profile, the entries, the leaderboards and every notification.',
  },
  {
    field: 'Country', req: true, where: 'profiles.country + country_code',
    powers: ['Market assignment', 'The worldwide map', 'Local time', 'Market rooms and briefs'],
    without: 'The creator is assigned to no market and can never be offered one, because join_market matches on the ISO code.',
  },
  {
    field: 'Town or city', req: true, where: 'profiles.city, geocoded to city_lat / city_lng',
    powers: ['The creator map pin', 'Near me filtering', 'An honest local clock', 'Meet-up overlap alerts'],
    without: 'They are missing from the map entirely, and their clock falls back to a guess from the country, which for a wide country is a wrong fact.',
  },
  {
    field: 'Date of birth', req: true, where: 'profiles.dob, shown publicly as an age only',
    powers: ['Birthday cards at 07:00', 'The age on the profile', 'Age-gating the programme'],
    without: 'No birthday card, and no way to show they are old enough to be paid.',
  },
  {
    field: 'Phone number', req: true, where: 'creator_private.phone',
    powers: ['The team reaching them about a payment or a shoot'],
    without: 'The only route to a creator is an inbox they may not read for a week.',
  },
  {
    field: 'At least one social', req: true, where: 'profiles.instagram_url / tiktok_url / youtube_url',
    powers: ['The application review', 'Platform badges on the profile', 'Finding their work'],
    without: 'There is nothing to review. The application is judged on the work.',
  },
  {
    field: 'One-line bio', req: true, where: 'profiles.bio',
    powers: ['The directory card', 'The collaboration board', 'Connection suggestions', 'The leaderboard row'],
    without: 'Four surfaces with a blank line under a name.',
  },
  {
    field: 'About you', req: true, where: 'profiles.about',
    powers: ['The application review', 'The profile page'],
    without: 'An admin deciding from a photo and a link.',
  },
  {
    field: 'Languages', req: true, where: 'profiles.languages',
    powers: ['Collaboration matching', 'Who to meet', 'Directory filters'],
    without: 'The matching quietly stops suggesting them to anybody.',
  },
  {
    field: 'Countries visited', req: true, where: 'profiles.countries_visited',
    powers: ['The travel map on the profile', 'The worldwide map', 'Shared-country matching'],
    without: 'A hole in the map where they are, and no shared ground to introduce them on.',
  },
  {
    field: 'Timezone', req: 'auto', where: 'profiles.timezone, read from the browser',
    powers: ['Local time on the profile', 'Event times in their own clock', 'Deadline countdowns'],
    without: 'A guess from the country, which is honest for Portugal and wrong for the United States.',
  },
  {
    field: 'Favourite quote', req: false, where: 'profiles.favourite_quote',
    powers: ['A line on the profile'],
    without: 'Nothing. It is flavour and it is optional.',
  },
  {
    field: 'Other links', req: false, where: 'profiles.other_links',
    powers: ['The links row on the profile'],
    without: 'Nothing. Most creators have three accounts and no website.',
  },
  {
    field: 'Travel photos', req: false, where: 'creator_photos, in the gallery bucket',
    powers: ['The travel gallery', 'The share card'],
    without: 'A quieter profile. Not a reason to block somebody joining.',
  },
  {
    field: 'Where you are headed next', req: false, where: 'profiles.bucket_list',
    powers: ['The profile', 'Meet-up suggestions', 'The collaboration board'],
    without: 'Fewer suggestions. It is genuinely useful later and pointless to demand on day one.',
  },
]

export default function ProfileLab() {
  const stage = useStage('phone')

  const required = FIELDS.filter((f) => f.req === true)
  const auto = FIELDS.filter((f) => f.req === 'auto')
  const optional = FIELDS.filter((f) => f.req === false)

  return (
    <LabPage
      title="What a profile is for"
      icon="users"
      subtitle="Every field onboarding asks for, and the exact feature that stops working without it. This is the argument for the required list, and it is the reason four of them are optional."
      aside={
        <div className="flex gap-2">
          <Badge tone="brand">{required.length} required</Badge>
          <Badge tone="light">{auto.length} automatic</Badge>
          <Badge tone="grey">{optional.length} optional</Badge>
        </div>
      }
    >
      <Panel i={0} title="Field by field" tone="quiet">
        <div className="space-y-3">
          {FIELDS.map((f) => (
            <div key={f.field} className="card !p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-bold">{f.field}</p>
                    <Badge tone={f.req === true ? 'brand' : f.req === 'auto' ? 'light' : 'grey'} className="!px-2 !py-0.5 !text-[10px]">
                      {f.req === true ? 'Required' : f.req === 'auto' ? 'Taken automatically' : 'Optional'}
                    </Badge>
                  </div>
                  <code className="mt-1 block text-[11px] text-gray-400">{f.where}</code>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {f.powers.map((p) => (
                  <span key={p} className="rounded-full bg-cloud px-2.5 py-1 text-[11px] font-medium text-smoke">{p}</span>
                ))}
              </div>
              <p className="mt-3 flex items-start gap-2 text-xs leading-relaxed text-smoke">
                <Icon name={f.req === false ? 'bulb' : 'alert'} className={'mt-0.5 h-3.5 w-3.5 shrink-0 ' + (f.req === false ? 'text-gray-300' : 'text-brand/70')} />
                <span><span className="font-semibold text-ink">Without it: </span>{f.without}</span>
              </p>
            </div>
          ))}
        </div>
      </Panel>

      <Panel
        i={1}
        title="The same fields, afterwards"
        hint="Everything onboarding collects is editable forever from one page. Nothing a creator enters on day one is a decision they are stuck with."
      >
        <Note className="mb-5" icon="alert">
          <p className="font-semibold">This frame shows YOUR edit page, not a test creator&apos;s.</p>
          <p>
            A profile page reads a real row and there is no invented creator in the database to read.
            Rather than build a second profile renderer that would drift from the real one within a
            week, the frame opens the genuine page for the account you are signed in as. Everything
            above it is the map of what fills that page in.
          </p>
        </Note>
        <Stage {...stage} src="/profile/edit" label="Edit profile, the real page" height={900} />
      </Panel>

      <Panel i={2} title="The line that decides required" hint="One rule, applied to every field above.">
        <InfoList
          items={[
            { icon: 'shield', t: 'The team needs it to make a decision', d: 'A photo, the work, and a few lines in their own words. An application without those is not an application.' },
            { icon: 'globe', t: 'A community feature breaks silently without it', d: 'No country means no market. No town means no map pin. No languages means the matching stops suggesting them and nobody ever finds out why.' },
            { icon: 'sparkles', t: 'Everything else is flavour, and flavour is never required', d: 'A quote, a website, a photo gallery, a bucket list. All genuinely nice, none of them worth losing a creator at screen eight of nine.' },
            { icon: 'clock', t: 'And if it can be taken rather than asked for, take it', d: 'The timezone comes from the browser and the country code comes from the picker. Two fewer questions, two more correct answers.' },
          ]}
        />
        <KeyVal
          className="mt-6"
          rows={[
            ['Screens', '9'],
            ['Screens that are entirely optional', '2, and they say so before you start'],
            ['Fields asked for', `${FIELDS.filter((f) => f.req !== 'auto').length}`],
            ['Fields taken automatically', `${auto.length + 2}, counting the country code and the coordinates`],
            ['Roughly how long', 'Three minutes'],
            ['Sample applicant', `${APPLICANT.name}, ${APPLICANT.city}`],
          ]}
        />
      </Panel>
    </LabPage>
  )
}
