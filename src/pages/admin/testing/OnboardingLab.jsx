import { useState } from 'react'
import Onboarding, { STEPS } from '../../Onboarding'
import Icon from '../../../components/Icon'
import { LabPage, Panel, Note, Stage, useStage, Choice, Runner, KeyVal, Code } from './kit'
import { APPLICANT } from './fixtures'

// THE ONBOARDING FLOW, LIVE.
//
// Not a screenshot and not a rebuild: this renders the real Onboarding
// component in dry-run mode (see the `demo` prop on that file). The progress
// bar, the required-field gating, the world map, the language picker and the
// market suggestion are all the ones a creator gets, because they ARE the ones
// a creator gets.
//
// The only things switched off are the two controls that would upload a file
// into the signed-in admin's own account, and the write at the end.

const EMPTY_DRAFT = {
  photo_url: '', dob: null, city: '', country: '', bio: '', about: '', favourite_quote: '',
  instagram_url: '', tiktok_url: '', youtube_url: '', countries_visited: [], languages: [],
}

const FULL_DRAFT = {
  photo_url: 'demo', dob: APPLICANT.dob, city: APPLICANT.city, country: APPLICANT.country,
  bio: APPLICANT.bio, about: APPLICANT.about, favourite_quote: APPLICANT.favourite_quote,
  instagram_url: APPLICANT.instagram_url, tiktok_url: APPLICANT.tiktok_url, youtube_url: APPLICANT.youtube_url,
  countries_visited: APPLICANT.countries_visited, languages: APPLICANT.languages,
}

const STEP_NOTES = [
  'A welcome, and nothing to fill in. The first screen of a form should never be a form.',
  'Photo, date of birth, town, one-line bio, the longer about, and a phone number. Every one of these is required, and Continue says so rather than failing silently.',
  'At least one social link. Which one does not matter, having none does.',
  'Optional, and the copy says so. A creator with no photos to hand should not be stuck on step four of eight.',
  'Tap the countries you have been to. This is the map that appears on the profile and feeds the worldwide map.',
  'Languages, which is what the collaboration matching runs on later.',
  'Two memberships explained as two things: everybody is in the worldwide community already, and a market is where the briefs come from. Written this way because a creator who thinks picking Spain means leaving everyone else picks nothing.',
  'How the programme works, then submit. New applicants submit for review; an invited creator can say hello in the chat instead.',
]

export default function OnboardingLab() {
  const stage = useStage('phone')
  const [step, setStep] = useState(0)
  const [filled, setFilled] = useState('full')
  const [mode, setMode] = useState('pending')
  const [finished, setFinished] = useState(null)

  const demo = {
    profile: { id: APPLICANT.id, name: APPLICANT.name, photo_url: null, status: mode === 'pending' ? 'pending' : 'active' },
    draft: filled === 'full' ? { ...FULL_DRAFT } : { ...EMPTY_DRAFT },
    contact: filled === 'full' ? { phone: APPLICANT.phone, phone_country: APPLICANT.phone_country } : { phone: '', phone_country: '' },
    pending: mode === 'pending',
    step,
    onStep: setStep,
    onFinish: (sayHello) => setFinished(sayHello ? 'hello' : 'done'),
  }

  // Remount the flow when the scenario changes, so the prefill is re-read.
  const flowKey = `${filled}-${mode}`

  const writes = [
    {
      key: 'profile', actor: 'db', title: 'The profile row is updated',
      detail: 'Everything from the eight steps in one write, plus onboarded = true, which is what lets them past the onboarding guard next time they log in.',
      tech: `update profiles set\n  photo_url, dob, city, country, bio, about,\n  favourite_quote, instagram_url, tiktok_url, youtube_url,\n  countries_visited, languages,\n  onboarded = true,\n  country_code = '${APPLICANT.country_code}'\nwhere id = auth.uid();`,
    },
    {
      key: 'iso', actor: 'system', title: 'The country code is derived, never asked for',
      detail: 'Country is free text and always has been. The ISO-2 code is what the market system routes on, so it is worked out here. Without it a new creator can never be offered a market at all.',
      tech: `isoForCountryName("${APPLICANT.country}")  ->  "${APPLICANT.country_code}"`,
    },
    {
      key: 'private', actor: 'db', title: 'The phone number goes somewhere else',
      detail: 'Contact details live in creator_private, which no other creator can read. The profile table holds nothing an admin would not be happy showing the community.',
      tech: "insert into creator_private (id, phone, phone_country) ... on conflict do update",
    },
    {
      key: 'geocode', actor: 'system', title: 'The town is turned into coordinates',
      detail: 'So the new creator appears on the worldwide map. Through our own geocode function, which proxies Nominatim, rather than from the browser.',
      tech: "geocodeCity('Bristol', 'United Kingdom')  ->  { lat: 51.4545, lng: -2.5879 }",
    },
    {
      key: 'market', actor: 'db', title: 'The market is joined, after the profile write and not before',
      detail: 'join_market checks the profile country code against the market. Joining first would be refused for the exact creator it is meant to let in, because that column is still null until the write above lands.',
      tech: "rpc('join_market', { p_slug: 'uk-ireland' })",
    },
    mode === 'pending' ? {
      key: 'review', actor: 'push', title: 'Every admin is notified that somebody applied',
      detail: 'And the applicant lands on the review screen rather than the community. They cannot post until a person approves them.',
      tech: "notify_all(type: 'application', title: 'Alex Rivers applied')",
    } : {
      key: 'hello', actor: 'system', title: 'The optional hello is posted in the room',
      detail: 'Only for an already-approved creator, and only if they press the button. Nobody is made to introduce themselves.',
      tech: "insert into messages (channel: 'general', body: 'Hey everyone! ...')",
    },
  ]

  return (
    <LabPage
      title="Onboarding flow"
      icon="users"
      subtitle="All eight steps of the real onboarding, running here, prefilled with an applicant who does not exist. Jump to any step, switch the prefill off to watch the required-field gating work, and finish it without writing anything."
    >
      <Panel
        title="The scenario"
        hint="Two switches. The first decides whether the form arrives prefilled; the second decides whether this person is applying to join or has already been invited, which changes the last screen."
      >
        <div className="flex flex-wrap items-center gap-6">
          <div>
            <p className="label">Prefill</p>
            <Choice
              value={filled}
              onChange={(v) => { setFilled(v); setStep(0); setFinished(null) }}
              options={[{ value: 'full', label: 'Filled in' }, { value: 'empty', label: 'Empty' }]}
            />
          </div>
          <div>
            <p className="label">This creator is</p>
            <Choice
              value={mode}
              onChange={(v) => { setMode(v); setStep(0); setFinished(null) }}
              options={[{ value: 'pending', label: 'Applying' }, { value: 'active', label: 'Already approved' }]}
            />
          </div>
        </div>
        {filled === 'empty' && (
          <Note className="mt-5" icon="alert">
            <p className="font-semibold">Now press Continue on step two with the fields blank.</p>
            <p>
              The orange line under the card is the whole gating rule: photo, date of birth, town, country,
              bio, about and phone are all required, and the step will not advance without them. Travel
              photos and the favourite quote stay optional.
            </p>
          </Note>
        )}
      </Panel>

      <Panel
        title="Jump to a step"
        hint="The same eight steps the creator walks. Each one is a screen, not a section of a long form."
      >
        <div className="flex flex-wrap gap-2">
          {STEPS.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => { setStep(i); setFinished(null) }}
              className={
                'rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 hover:-translate-y-0.5 ' +
                (i === step ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hover:text-ink')
              }
            >
              <span className="tabular-nums opacity-60">{i + 1}</span>
              <span className="ml-1.5">{s}</span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs leading-relaxed text-smoke">{STEP_NOTES[step]}</p>
      </Panel>

      {finished ? (
        <Panel title="Finished" hint="Nothing was written. This is where a real creator would land.">
          <div className="rounded-card border border-green-200 bg-green-50 p-6 text-center">
            <Icon name="check" className="mx-auto h-8 w-8 text-green-600" />
            <p className="mt-3 font-semibold text-green-900">
              {mode === 'pending'
                ? 'Application submitted. The applicant now sees the review screen and every admin has been notified.'
                : finished === 'hello'
                  ? 'Profile complete, and a hello was posted in the room.'
                  : 'Profile complete. Straight to the home page.'}
            </p>
            <button type="button" onClick={() => { setFinished(null); setStep(0) }} className="btn-secondary mt-5 text-sm">
              Walk it again
            </button>
          </div>
        </Panel>
      ) : (
        <Stage {...stage} height={860} label={`Onboarding, step ${step + 1} of ${STEPS.length}`}>
          <Onboarding key={flowKey} demo={demo} />
        </Stage>
      )}

      <Panel
        title="What the last button actually does"
        hint="Six writes, in this order, and the order matters."
      >
        <Runner steps={writes} autoMs={800} />
      </Panel>

      <Panel title="Two details worth pointing at" tone="quiet">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="card !p-5">
            <p className="text-sm font-semibold">The progress bar starts at 20 per cent</p>
            <p className="mt-1.5 text-xs leading-relaxed text-smoke">
              Not at zero. People push on considerably further when a goal already looks underway, and an
              empty bar in front of eight steps reads as a chore. It fills to 100 across the flow.
            </p>
            <Code className="mt-3">{'barPct = 20 + (step / (STEPS.length - 1)) * 80'}</Code>
          </div>
          <div className="card !p-5">
            <p className="text-sm font-semibold">Nobody reaches the community with a blank profile</p>
            <p className="mt-1.5 text-xs leading-relaxed text-smoke">
              Onboarding is enforced by the route guard, not by a suggestion. Until onboarded is true, the
              only page a signed-in creator can reach is this one, so an admin always reviews a complete
              application.
            </p>
            <KeyVal
              className="mt-2"
              rows={[
                ['Required steps', '2, 3, 5 and 6'],
                ['Optional steps', 'Travel photos, quote'],
                ['Gate', 'ProtectedRoute'],
              ]}
            />
          </div>
        </div>
      </Panel>
    </LabPage>
  )
}
