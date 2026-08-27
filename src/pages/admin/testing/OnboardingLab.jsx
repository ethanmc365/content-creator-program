import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Badge, Select } from '../../../components/ui'
import Icon from '../../../components/Icon'
import { STEPS } from '../../Onboarding'
import { COUNTRIES } from '../../../lib/countries'
import { loadMarkets, resolveMarket, isoForCountryName } from '../../../lib/markets'
import { flagFromIso } from '../../../lib/flags'
import { sendDemoCommand, useDemoMessages } from '../../../lib/demoMode'
import { LabPage, Panel, Note, Stage, useStage, Choice, Runner, Code, InfoList, CardGrid } from './kit'

// THE ONBOARDING FLOW, LIVE, AT A REAL WIDTH.
//
// The flow runs inside a same-origin iframe at `/onboarding?demo=1`, which is
// the only way a phone preview can be honest: a CSS media query reads the
// browser viewport, so a 390px-wide box on a laptop still gets every desktop
// rule. See lib/demoMode.
//
// The frame talks back. Every time the applicant moves, the flow posts its step
// and - the useful part - THE MARKET IT WOULD ASSIGN THEM TO. So the panel
// below the frame answers the question this lab exists for: put in a set of
// details and tell me where that creator ends up.

const REQUIRED = [
  ['Profile photo', 'An admin approves a person. A directory of grey circles is not a community.'],
  ['Name', 'It is on the profile, the entries and every leaderboard.'],
  ['Country', 'It decides the market. Without it a creator lands nowhere.'],
  ['Town or city', 'Puts them on the creator map and gives an honest local clock.'],
  ['Date of birth', 'Age-gates the programme, and it is what the birthday cards run on.'],
  ['Phone number', 'How the team reaches somebody about a payment or a shoot. Private.'],
  ['One social account', 'The application is judged on the work.'],
  ['Bio and about', 'This is the text a person actually reads to make the decision.'],
  ['Languages', 'Collaboration matching runs on it.'],
  ['One country on the map', 'Or the worldwide map has a hole where they are.'],
]

const OPTIONAL = [
  ['Favourite quote', 'Flavour. Nobody is turned away for not having one.'],
  ['Other links', 'A website, a portfolio, a newsletter.'],
  ['Travel photos', 'Not everybody has them to hand while signing up.'],
  ['Where you are headed next', 'Useful later, pointless to demand on day one.'],
]

// Somewhere in every one of the six markets, plus two that land nowhere. The
// second group is the interesting one: it is the case people forget exists.
const PROBES = [
  { city: 'London', country: 'United Kingdom' },
  { city: 'Dublin', country: 'Ireland' },
  { city: 'Barcelona', country: 'Spain' },
  { city: 'Lisbon', country: 'Portugal' },
  { city: 'Berlin', country: 'Germany' },
  { city: 'Bucharest', country: 'Romania' },
  { city: 'Copenhagen', country: 'Denmark' },
  { city: 'Stockholm', country: 'Sweden' },
  { city: 'Oslo', country: 'Norway' },
  { city: 'Helsinki', country: 'Finland' },
  { city: 'Paris', country: 'France' },
  { city: 'New York', country: 'United States' },
]

export default function OnboardingLab() {
  const stage = useStage('phone')
  const frameRef = useRef(null)
  const [prefill, setPrefill] = useState('full')
  const [pending, setPending] = useState('1')
  const [live, setLive] = useState(null)     // whatever the frame last told us
  const [markets, setMarkets] = useState([])
  const [probeCountry, setProbeCountry] = useState('United Kingdom')

  useEffect(() => {
    let alive = true
    loadMarkets().then((m) => { if (alive) setMarkets(m) })
    return () => { alive = false }
  }, [])

  const onMessage = useCallback((msg) => {
    if (msg.dir !== 'up' || msg.type !== 'onboarding-state') return
    setLive(msg)
  }, [])
  useDemoMessages(onMessage)

  const src = `/onboarding?demo=1&prefill=${prefill}&pending=${pending}`
  // Changing a scenario reloads the frame, which is what we want: the flow
  // reads its prefill once, at mount, exactly as a real creator's does.
  const frameKey = `${prefill}-${pending}`

  const goto = (i) => sendDemoCommand(frameRef.current, { type: 'goto', step: i })

  const probe = useMemo(
    () => resolveMarket(isoForCountryName(probeCountry), markets),
    [probeCountry, markets],
  )

  const table = useMemo(
    () => PROBES.map((p) => ({ ...p, result: resolveMarket(isoForCountryName(p.country), markets) })),
    [markets],
  )

  const writes = [
    {
      key: 'profile', actor: 'db', title: 'The profile row is written',
      detail: 'Everything from the nine screens in one write, plus onboarded = true, which is what lets them past the onboarding guard next time they log in.',
      tech: 'update profiles set\n  name, photo_url, dob, city, country, country_code,\n  bio, about, favourite_quote,\n  instagram_url, tiktok_url, youtube_url, other_links,\n  languages, countries_visited, bucket_list,\n  timezone, onboarded = true\nwhere id = auth.uid();',
    },
    {
      key: 'tz', actor: 'system', title: 'The timezone is taken, not asked for',
      detail: 'Read from the browser. It is what makes the local clock on a profile honest for the countries that span several zones, where guessing from the country alone would print a wrong fact.',
      tech: "Intl.DateTimeFormat().resolvedOptions().timeZone  ->  'Europe/London'",
    },
    {
      key: 'private', actor: 'db', title: 'The phone number goes somewhere else',
      detail: 'Contact details live in creator_private, which no other creator can read. profiles holds nothing an admin would mind showing the community.',
      tech: 'insert into creator_private (id, phone, phone_country) ... on conflict do update',
    },
    {
      key: 'geocode', actor: 'system', title: 'The town becomes a point on the map',
      detail: 'Through our own geocode function, which proxies Nominatim, rather than from the browser.',
      tech: "geocodeCity('Bristol', 'United Kingdom')  ->  { lat: 51.4545, lng: -2.5879 }",
    },
    {
      key: 'market', actor: 'db', title: 'The market is joined, after the profile write and never before',
      detail: 'join_market re-checks profiles.country_code against the market itself. Until the write above lands that column is still null, so joining first is refused for the exact creator it is meant to let in.',
      tech: "rpc('join_market', { p_slug: 'uk' })",
    },
    pending === '1' ? {
      key: 'review', actor: 'push', title: 'Every admin is notified that somebody applied',
      detail: 'And the applicant lands on the review screen rather than the community. They cannot post until a person approves them.',
      tech: "notify_all(type: 'application', title: 'Alex Test applied')",
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
      aside={live && (
        <div className="rounded-card border border-gray-200 bg-white px-4 py-2.5 text-center">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-smoke">{live.part}</p>
          <p className="text-sm font-bold">{live.stepTitle}</p>
        </div>
      )}
    >
      <Panel
        i={0}
        title="The scenario"
        hint="Two switches. The first decides whether the form arrives prefilled; the second decides whether this person is applying to join or has already been invited, which changes the last screen."
      >
        <div className="flex flex-wrap items-end gap-6">
          <div>
            <p className="label">Prefill</p>
            <Choice
              value={prefill} onChange={setPrefill}
              options={[{ value: 'full', label: 'Filled in' }, { value: 'empty', label: 'Empty' }]}
            />
          </div>
          <div>
            <p className="label">This creator is</p>
            <Choice
              value={pending} onChange={setPending}
              options={[{ value: '1', label: 'Applying' }, { value: '0', label: 'Already approved' }]}
            />
          </div>
        </div>
        {prefill === 'empty' && (
          <Note className="mt-5" icon="alert">
            <p className="font-semibold">Now press Continue on screen three with the fields blank.</p>
            <p>
              The message names every missing field rather than saying "fill in all required boxes", and
              the review screen at the end lists them with a button that jumps straight to the one that
              needs fixing. That is the whole difference between a form that blocks you and a form that
              helps you.
            </p>
          </Note>
        )}
      </Panel>

      <Panel i={1} title="Jump to a screen" hint="Nine screens, four named parts. The one with nothing required on it says so before you start typing.">
        <div className="flex flex-wrap gap-2">
          {STEPS.map((s, i) => {
            const on = live?.step === i
            return (
              <button
                key={s.key}
                type="button"
                onClick={() => goto(i)}
                className={
                  'group rounded-full px-3.5 py-1.5 text-xs font-medium transition-all duration-200 hover:-translate-y-0.5 ' +
                  (on ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hover:text-ink')
                }
              >
                <span className="tabular-nums opacity-60">{i + 1}</span>
                <span className="ml-1.5">{s.title}</span>
                {s.skippable && (
                  <span className={'ml-1.5 text-[10px] ' + (on ? 'text-white/70' : 'text-gray-400')}>optional</span>
                )}
              </button>
            )
          })}
        </div>
      </Panel>

      <Stage
        {...stage}
        key={frameKey}
        src={src}
        frameRef={frameRef}
        label={live ? `Onboarding, step ${live.step + 1} of ${live.total}` : 'Onboarding'}
        toolbar={live && (
          <Badge tone={live.complete ? 'green' : 'amber'}>
            {live.complete ? 'Ready to submit' : `${live.problems} to fill in`}
          </Badge>
        )}
      />

      {/* ---------------------------------------------------------------- */}

      <Panel
        i={2}
        title="Which market would this creator land in?"
        hint="The question this lab exists for. Pick a country and this is the answer the flow gives, from the same resolveMarket function the flow itself calls. Nothing is guessed twice."
      >
        <div className="grid gap-6 lg:grid-cols-2">
          <div>
            <label className="label" htmlFor="probe">A creator who lives in</label>
            <Select
              id="probe"
              variant="field"
              ariaLabel="Country"
              value={probeCountry}
              onChange={setProbeCountry}
              options={COUNTRIES.map((c) => ({ value: c.name, label: c.name }))}
            />

            <div className="mt-5">
              <MarketAnswer result={probe} country={probeCountry} />
            </div>
          </div>

          <div className="space-y-4">
            <Code>{`isoForCountryName("${probeCountry}")  ->  ${probe.code ? `"${probe.code}"` : 'null'}

resolveMarket("${probe.code || ''}")
  outcome: ${probe.outcome}
  market:  ${probe.market ? probe.market.name : 'none'}

Then, in the database, join_market re-checks
exactly the same rule before it lets anybody in:

  join_policy = 'country'
  and profiles.country_code = any (country_codes)`}</Code>
            <Note>
              <p className="font-semibold text-ink">Nobody is asked to pick a market any more.</p>
              <p>
                Every open market matches on a list of country codes and those lists do not overlap, so
                choosing a country IS choosing a market. The old flow asked the question three screens
                after it already knew the answer, and for a creator in France the list it offered was
                empty.
              </p>
            </Note>
          </div>
        </div>

        <div className="mt-8 overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-[11px] font-semibold uppercase tracking-wide text-smoke">
                <th className="pb-2">A creator in</th>
                <th className="pb-2">Code</th>
                <th className="pb-2">Assigned to</th>
                <th className="pb-2 text-right">Outcome</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {table.map((r) => (
                <tr key={`${r.city}-${r.country}`}>
                  <td className="py-2.5 pr-4 text-xs">
                    <span className="font-medium">{r.city}</span>
                    <span className="text-smoke">, {r.country}</span>
                  </td>
                  <td className="py-2.5 pr-4 font-mono text-[11px] text-smoke">{r.result.code || '-'}</td>
                  <td className="py-2.5 pr-4 text-xs font-semibold">
                    {r.result.market
                      ? <span className="flex items-center gap-1.5">
                          <span aria-hidden>{(r.result.market.country_codes || []).map(flagFromIso).join('')}</span>
                          {r.result.market.name}
                        </span>
                      : <span className="text-smoke">Worldwide only</span>}
                  </td>
                  <td className="py-2.5 text-right">
                    <Badge tone={r.result.outcome === 'assigned' ? 'green' : r.result.outcome === 'worldwide' ? 'grey' : 'amber'}>
                      {r.result.outcome}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel
        i={3}
        title="What is required, and why each one earns it"
        hint="The rule: required is anything the team needs to make a decision, plus anything a community feature would silently break without. Flavour is never required."
      >
        <CardGrid cols={2} className="!gap-6">
          <InfoList
            columns={1}
            title={`Required · ${REQUIRED.length}`}
            items={REQUIRED.map(([t, d]) => ({ t, d, icon: 'check' }))}
          />
          <InfoList
            columns={1}
            title={`Optional · ${OPTIONAL.length}`}
            items={OPTIONAL.map(([t, d]) => ({ t, d, icon: 'sparkles' }))}
          />
        </CardGrid>
      </Panel>

      <Panel i={3} title="What the last button actually does" hint="Six writes, in this order, and the order matters.">
        <Runner steps={writes} autoMs={800} />
      </Panel>

      <Panel i={3} title="What changed, and why" tone="quiet">
        <InfoList
          items={[
            { icon: 'users', t: 'Nine screens instead of eight, and much shorter', d: 'The old step two was a photo, a birthday, a town, a country, a bio, a paragraph, a quote and a phone number on ONE screen. Nine controls, no grouping. Each screen now asks for one kind of thing.' },
            { icon: 'globe', t: 'The market is told, not asked', d: 'It is resolved the instant the country is picked and shown on the same screen, which is the only moment a creator can correct it.' },
            { icon: 'pin', t: 'The country is picked from a list', d: 'It was free text, so "England" produced a profile the market system could not route at all. The picker hands over the name and the ISO code together.' },
            { icon: 'alert', t: 'Errors name the field', d: 'It used to say "fill in all required boxes", which does not say which.' },
            { icon: 'eye', t: 'There is a review screen', d: 'Submitting an application is the one irreversible thing in the flow. Not being able to see what you are about to send is the sort of gap you only notice from the other side of it.' },
            { icon: 'clock', t: 'The timezone is captured', d: 'From the browser, silently. Local clocks are now right for the countries that span several zones instead of blank.' },
            { icon: 'link', t: 'Every profile field is captured', d: 'Name, other links and the bucket list were all missing before, so a new creator arrived with a profile they had to go and finish somewhere else.' },
            { icon: 'check', t: 'Optional is labelled optional', d: 'On the screen, before you start typing, not after you press Continue.' },
          ]}
        />
      </Panel>
    </LabPage>
  )
}

function MarketAnswer({ result, country }) {
  if (result.outcome === 'unknown') {
    return (
      <div className="rounded-card border border-dashed border-gray-200 px-4 py-6 text-center text-xs text-smoke">
        We cannot turn that into a country code.
      </div>
    )
  }
  if (result.outcome === 'worldwide') {
    return (
      <div className="rounded-card border border-gray-200 bg-white px-4 py-4">
        <div className="flex items-start gap-3">
          <Icon name="globe" className="mt-0.5 h-5 w-5 shrink-0 text-smoke" />
          <div>
            <p className="text-sm font-semibold">Worldwide community only</p>
            <p className="mt-1 text-xs leading-relaxed text-smoke">
              No market covers {country} yet. They join the worldwide community with everybody else and can
              enter anything open to everyone. This is a supported state, not a failure.
            </p>
          </div>
        </div>
      </div>
    )
  }
  const m = result.market
  return (
    <div className="rounded-card border border-brand/30 bg-brand-tint/30 px-4 py-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-xl leading-none" aria-hidden>
          {(m.country_codes || []).map(flagFromIso).join('')}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-brand">Assigned to</p>
          <p className="mt-0.5 text-base font-bold">{m.name}</p>
          <p className="mt-1 text-xs leading-relaxed text-smoke">{m.tagline}</p>
          <p className="mt-2 font-mono text-[11px] text-smoke">
            slug {m.slug} · {(m.country_codes || []).join(', ')} · {m.currency} · {m.timezone}
          </p>
        </div>
        <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
      </div>
    </div>
  )
}
