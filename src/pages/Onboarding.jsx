import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { isoForCountryName, loadMarkets, resolveMarket } from '../lib/markets'
import { flagFromIso } from '../lib/flags'
import {
  AvatarUpload, CountrySelect, LanguageSelect, SocialInputs, DobField, PhoneInput, QuoteField,
} from '../components/ProfileFields'
import WorldMap from '../components/WorldMap'
import PhotoBoard from '../components/PhotoBoard'
import Icon from '../components/Icon'
import AutoTextarea from '../components/AutoTextarea'
import SubmittedCard from '../components/SubmittedCard'
import SocialMark, { brandForUrl, BRAND_COLOR } from '../components/SocialMark'
import { geocodeCity } from '../lib/geocode'
import { Avatar, Spinner } from '../components/ui'
import { cx, ageFromDob } from '../lib/utils'
import { useDemoMode, postDemoState, useDemoMessages } from '../lib/demoMode'
import { useT } from '../lib/i18n'

// FIRST LOGIN: BUILDING A PROFILE THE TEAM CAN ACTUALLY REVIEW.
//
// WHAT WAS WRONG WITH THE OLD ONE
//
// Eight steps, but the weight was in completely the wrong places. Step two was
// a photo, a date of birth, a town, a country, a one-line bio, a paragraph, a
// quote and a phone number ON ONE SCREEN - nine controls, no grouping, and the
// only feedback was a single orange line at the bottom saying "fill in all
// required boxes", which does not say WHICH. Meanwhile the country was FREE
// TEXT, so somebody typing "England" produced a profile the market system could
// not route at all, and three screens later they were asked to pick a market
// from a list that, for them, was empty.
//
// And that market question was the strangest part of it: every market matches
// on a list of country codes, and those lists do not overlap, so the answer was
// already known the moment they said where they lived. Asking a question that
// has exactly one possible answer is not a choice, it is a form field.
//
// WHAT IT IS NOW
//
//   1  Welcome            nothing to fill in
//   2  Name and photo     who you are
//   3  Where you're based country, town, date of birth, phone
//                         -> THE MARKET IS RESOLVED AND SHOWN, HERE, LIVE
//   4  Where you post     your socials
//   5  Your story         bio, about, quote
//   6  Languages
//   7  Your travel map
//   8  Photos and plans   entirely optional and it says so
//   9  Review             everything, with the market confirmed, then submit
//
// Nine screens rather than eight, and it is considerably shorter to fill in,
// because each one asks for one kind of thing and every screen says whether it
// is required before you start typing rather than after you press Continue.
//
// WHAT IS REQUIRED, AND WHY EACH ONE EARNS IT
//
//   photo       an admin approves a person, and a directory of grey circles
//               is not a community
//   name        it is on everything
//   country     it decides the market; without it a creator lands nowhere
//   town        it is what puts them on the map and gives an honest local clock
//   birthday    age-gates the programme and it is what the birthday cards run on
//   phone       how the team reaches somebody about a payment or a shoot.
//               Private: it goes in creator_private, not in profiles
//   one social  the application is judged on the work
//   bio+about   this is the text an admin actually reads to decide
//   languages   collaboration matching runs on it
//   one country on the map, or the worldwide map has a hole where they are
//
// Everything else - the quote, other links, travel photos, the bucket list - is
// OPTIONAL and is marked optional on the screen it appears on. The rule is:
// required is anything the team needs to make a decision, plus anything a
// community feature would silently break without. Flavour is never required.

const PARTS = ['You', 'Your work', 'Your travel', 'Finish']

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

const stepIndex = (key) => STEPS.findIndex((s) => s.key === key)

const EMPTY = {
  name: '', photo_url: '', dob: null, city: '', country: '', country_code: '',
  bio: '', about: '', favourite_quote: '',
  instagram_url: '', tiktok_url: '', youtube_url: '', facebook_url: '', other_links: [],
  languages: [], countries_visited: [], bucket_list: [],
}

// An invented applicant, for the Testing Centre's prefilled walkthrough. It is
// here rather than in the lab so the flow can be opened directly at
// /onboarding?demo=1&prefill=full and still be complete.
const DEMO_DRAFT = {
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

/** Every problem with the draft, as a list a person can act on. */
export function draftProblems(draft, contact) {
  const p = []
  if (!draft.name?.trim()) p.push({ step: 'identity', text: 'Add your name' })
  if (!draft.photo_url) p.push({ step: 'identity', text: 'Add a profile photo' })
  if (!draft.country_code) p.push({ step: 'based', text: 'Choose the country you live in' })
  if (!draft.city?.trim()) p.push({ step: 'based', text: 'Add your town or city' })
  if (!draft.dob) p.push({ step: 'based', text: 'Add your date of birth' })
  if (!contact.phone?.trim() || !contact.phone_country) p.push({ step: 'based', text: 'Add a phone number with its country code' })
  if (!draft.instagram_url?.trim() && !draft.tiktok_url?.trim() && !draft.youtube_url?.trim() && !draft.facebook_url?.trim()) {
    p.push({ step: 'socials', text: 'Link at least one account you post on' })
  }
  if (!draft.bio?.trim()) p.push({ step: 'story', text: 'Write your one-line bio' })
  if (!draft.about?.trim()) p.push({ step: 'story', text: 'Write a few lines about you' })
  if (!draft.languages?.length) p.push({ step: 'languages', text: 'Pick at least one language' })
  if (!draft.countries_visited?.length) p.push({ step: 'map', text: 'Tap at least one country on your map' })
  return p
}

export default function Onboarding() {
  const tr = useT()
  const auth = useAuth()
  const { user, refreshProfile, signOut } = auth
  const navigate = useNavigate()
  const { on: demo, params } = useDemoMode()

  const demoPending = demo ? params.get('pending') !== '0' : false
  const prefilled = demo && params.get('prefill') !== 'empty'

  const profile = demo
    ? { id: 'demo-applicant', name: DEMO_DRAFT.name, photo_url: null, status: demoPending ? 'pending' : 'active' }
    : auth.profile

  const [step, setStep] = useState(0)
  // Read by the demo-command handler, which needs to know where it is starting
  // from without reaching inside a state updater to find out. See `onCommand`.
  const stepRef = useRef(0)
  const [dir, setDir] = useState('fwd')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const [draft, setDraft] = useState(() => {
    if (demo) return prefilled ? { ...DEMO_DRAFT } : { ...EMPTY, name: 'Alex Test' }
    return {
      ...EMPTY,
      name: auth.profile?.name || '',
      photo_url: auth.profile?.photo_url || '',
      dob: auth.profile?.dob || null,
      city: auth.profile?.city || '',
      country: auth.profile?.country || '',
      country_code: auth.profile?.country_code || isoForCountryName(auth.profile?.country) || '',
      bio: auth.profile?.bio || '',
      about: auth.profile?.about || '',
      favourite_quote: auth.profile?.favourite_quote || '',
      instagram_url: auth.profile?.instagram_url || '',
      tiktok_url: auth.profile?.tiktok_url || '',
      youtube_url: auth.profile?.youtube_url || '',
      facebook_url: auth.profile?.facebook_url || '',
      other_links: Array.isArray(auth.profile?.other_links) ? auth.profile.other_links : [],
      languages: auth.profile?.languages || [],
      countries_visited: auth.profile?.countries_visited || [],
      bucket_list: Array.isArray(auth.profile?.bucket_list) ? auth.profile.bucket_list : [],
    }
  })

  const [contact, setContact] = useState(() => (
    demo && prefilled ? { phone: '7700 900123', phone_country: '+44' } : { phone: '', phone_country: '' }
  ))

  // THE MARKETS, LOADED ONCE AND EARLY. The resolution has to be instant when
  // somebody picks their country on step three - a spinner where the answer
  // goes turns a confident statement into a question.
  const [markets, setMarkets] = useState(null)
  useEffect(() => {
    let alive = true
    loadMarkets().then((m) => { if (alive) setMarkets(m || []) })
    return () => { alive = false }
  }, [])
  // AN EMPTY STATE IS A CLAIM AND IT NEEDS THE DATA FIRST. `markets` starts as
  // null rather than [], because [] and "not loaded yet" resolve to the same
  // answer - worldwide only - and for a creator in London that answer is wrong
  // for as long as the query takes. Saying "no market covers the United
  // Kingdom" and then changing its mind is worse than saying nothing.
  const marketsReady = markets !== null

  const market = useMemo(() => resolveMarket(draft.country_code, markets || []), [draft.country_code, markets])

  // THE EXAMPLE TOWN IS A TOWN IN THEIR COUNTRY (4 Sep 2026).
  //
  // Ethan: "even if I select Portugal as my country, it shows the town example
  // being Bristol. Shouldn't the example match whatever country they select?"
  //
  // Yes - a placeholder is an example of the answer, and an English city under
  // a field on a form that has just been told you live in Portugal is an
  // example of somebody else's answer. It reads as the form not listening.
  //
  // The capital comes from `countryFacts`, which the app already ships as its
  // own chunk for the maps and the geography game, so it is imported DYNAMICALLY
  // and only once a country has been picked: onboarding is in the eagerly-loaded
  // bundle and must not gain a hundred kilobytes of country data to improve a
  // placeholder.
  const [townHint, setTownHint] = useState('')
  useEffect(() => {
    if (!draft.country) { setTownHint(''); return undefined }
    let alive = true
    import('../lib/countryFacts')
      .then(({ countryFacts }) => { if (alive) setTownHint(countryFacts(draft.country)?.capital || '') })
      .catch(() => { /* a missing example is a placeholder, not an error */ })
    return () => { alive = false }
  }, [draft.country])

  const set = useCallback((patch) => { setError(''); setDraft((d) => ({ ...d, ...patch })) }, [])

  const pending = demo ? demoPending : profile?.status === 'pending'
  const problems = draftProblems(draft, contact)
  const problemsFor = (key) => problems.filter((p) => p.step === key)
  const complete = problems.length === 0

  // Endowed progress: the bar starts at 15 rather than empty, because a goal
  // that already looks underway is one people finish far more often than one
  // that starts at nothing. It reaches 100 on the review screen.
  const barPct = Math.round(15 + (step / (STEPS.length - 1)) * 85)
  const current = STEPS[step]

  // --------------------------------------------------------------- demo ----
  // Inside the Testing Centre this runs in a same-origin iframe, so the lab
  // outside it can show a step jumper and, more usefully, the market this
  // applicant would actually be assigned to as it changes. See lib/demoMode.
  useEffect(() => {
    if (!demo) return
    postDemoState({
      type: 'onboarding-state',
      step,
      total: STEPS.length,
      stepKey: current.key,
      stepTitle: current.title,
      part: current.part,
      problems: problems.length,
      complete,
      done,
      market: market.market
        ? { slug: market.market.slug, name: market.market.name, outcome: market.outcome }
        : { slug: null, name: null, outcome: market.outcome },
      draft: { name: draft.name, city: draft.city, country: draft.country, country_code: draft.country_code },
    })
  }, [demo, step, current, problems.length, complete, done, market, draft.name, draft.city, draft.country, draft.country_code])

  useEffect(() => { stepRef.current = step }, [step])

  const onCommand = useCallback((msg) => {
    if (msg.dir !== 'down') return
    if (msg.type === 'goto' && typeof msg.step === 'number') {
      setError('')
      // THE DIRECTION IS WORKED OUT BEFORE THE MOVE, not inside it.
      // `setDir` used to be called from inside the `setStep` updater. An
      // updater has to be a pure function of the previous state - React is
      // allowed to run it twice and to run it while another component is
      // rendering - so scheduling a second update from inside one is
      // undefined behaviour, not a shortcut. Same fault as the DM reaction
      // subscription. A ref holds the current step so the comparison can
      // happen out here where it is allowed to.
      const to = Math.max(0, Math.min(STEPS.length - 1, msg.step))
      setDir(to < stepRef.current ? 'back' : 'fwd')
      setStep(to)
      setDone(false)
    }
    if (msg.type === 'reset') { setStep(0); setDone(false); setError('') }
  }, [])
  useDemoMessages(onCommand, { enabled: demo })

  // ------------------------------------------------------------ movement ----
  function next() {
    const mine = problemsFor(current.key)
    if (mine.length) { setError(mine.map((m) => m.text).join(' · ')); return }
    setError(''); setDir('fwd')
    setStep((s) => Math.min(STEPS.length - 1, s + 1))
  }
  function back() { setError(''); setDir('back'); setStep((s) => Math.max(0, s - 1)) }
  function goTo(key) {
    const to = stepIndex(key)
    setError(''); setDir(to < step ? 'back' : 'fwd'); setStep(to)
  }

  async function finish(sayHello) {
    if (!complete) { setError('There are still a few things to fill in.'); setStep(stepIndex('review')); return }
    setBusy(true)

    // DRY RUN. Nothing below this line may run in the Testing Centre: it would
    // write to the signed-in ADMIN'S own profile, not to a sandbox row.
    if (demo) {
      setTimeout(() => { setBusy(false); setDone(true) }, 1500)
      return
    }

    const update = {
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
      onboarded: true,
      // Taken from the browser rather than asked for. It is what makes the
      // local clock on a profile honest for the countries that span several
      // zones, where a guess from the country alone would be a wrong fact.
      timezone: browserTimezone(),
    }

    const coords = (draft.city.trim() || draft.country.trim())
      ? await geocodeCity(draft.city, draft.country)
      : null
    if (coords) { update.city_lat = coords.lat; update.city_lng = coords.lng }

    // THE SAVE IS CHECKED. IT WAS NOT, AND THAT IS HOW EVERY APPLICATION WAS
    // LOST FOR A FORTNIGHT (4 Sep 2026).
    //
    // This was a bare `await Promise.all([...])` with no reference to the
    // result. supabase-js RESOLVES on a rejected write - the error is a field
    // on the response, not a thrown exception - so a profile update that the
    // database refused looked exactly like one that had landed: the card
    // switched to "Application submitted", `refreshProfile` re-read the same
    // un-onboarded row, the router moved to /home, and ProtectedRoute sent the
    // applicant straight back to the first screen of onboarding with an empty
    // name box. Nothing reached the admin queue, and nothing said so.
    //
    // What it was hiding: two triggers both maintaining `profiles.age` from a
    // date of birth, looping through the row being written and raising 27000 on
    // every submit. See migration 187. That bug is fixed; this silence is what
    // made it invisible, and the silence is the more dangerous of the two.
    const [{ error: profileErr }, { error: privateErr } = {}] = await Promise.all([
      supabase.from('profiles').update(update).eq('id', user.id),
      (contact.phone || contact.phone_country)
        ? supabase.from('creator_private').upsert({
            id: user.id,
            phone: contact.phone,
            phone_country: contact.phone_country,
            updated_at: new Date().toISOString(),
          })
        : Promise.resolve({}),
    ])

    // A REFUSED WRITE STOPS THE FLOW WHERE IT IS. Going on to the submitted
    // card would be telling somebody their application is with a person when it
    // does not exist, and that is the one lie this screen must never tell. The
    // draft is still in state, so pressing Submit again retries everything.
    if (profileErr || privateErr) {
      setBusy(false)
      setStep(stepIndex('review'))
      setError(
        `Your application could not be saved: ${(profileErr || privateErr).message}. `
        + 'Nothing was sent. Please try again, and tell us if it keeps happening.',
      )
      return
    }

    // The market, AFTER the profile write and never before: join_market checks
    // profiles.country_code, and until the update above lands that column is
    // still null, so joining first is refused for the exact creator it is meant
    // to let in. A failure here is not allowed to block onboarding - landing in
    // the network with no market is a state the whole shell handles, and being
    // stuck on a spinner is not.
    if (market.market?.slug) {
      const { error: joinErr } = await supabase.rpc('join_market', { p_slug: market.market.slug })
      if (joinErr) console.warn('Could not join market at onboarding:', joinErr.message)
    }

    if (sayHello && !pending) {
      await supabase.from('messages').insert({
        channel: 'general',
        sender_id: user.id,
        body: `Hey everyone! ${draft.name || 'A new creator'} here, just joined the community 👋`,
      })
    }

    await refreshProfile()
    navigate(sayHello && !pending ? '/chat/general' : '/home')
  }

  // ---------------------------------------------------------------- views ---
  // ONE SCREEN AFTER SUBMIT, NOT TWO (3 Sep 2026).
  //
  // Ethan: "for some reason it temporarily shows up that Tryp.com automated
  // plane, and then it shows up a different screen that says application
  // submitted. I would just skip that automated plane page and jump to the page
  // that says application submitted, saying that the admins have been notified
  // and they will review it."
  //
  // He was watching a handover nobody had looked at end to end. This page drew
  // a flying-plane scene while the save was in flight; the save finished,
  // `refreshProfile` ran, the router sent him to /home, and ProtectedRoute drew
  // ITS pending screen - which was a second flying-plane scene with almost the
  // same sentence on it. Two full-screen animations for one action, with a
  // navigation between them.
  //
  // The in-flight state is now the SAME CARD as the finished one, with a
  // spinner where the tick goes. Nothing swaps, nothing flies, and the only
  // thing that changes when the save lands is the icon and the heading - so it
  // reads as one screen completing rather than two screens arguing.
  if (busy) {
    return (
      <SubmittedCard
        pending={pending}
        state="sending"
        onSignOut={pending && !demo ? async () => { await signOut(); window.location.href = '/' } : null}
      />
    )
  }

  if (done) {
    return (
      <div>
        <SubmittedCard pending={pending} demoNote />
        <div className="pb-12 text-center">
          <button onClick={() => { setDone(false); setStep(0) }} className="btn-secondary text-sm">
            {tr("Walk it again")}
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-cloud/50 px-5 py-8 sm:py-14">
      <div className="mx-auto max-w-2xl">
        <Progress step={step} barPct={barPct} current={current} />

        <div className="card !p-6 sm:!p-10" key={current.key}>
          <div className="onb-screen" data-dir={dir}>
            <StepHead step={current} pending={pending} />

            {current.key === 'welcome' && (
              <Welcome name={draft.name} pending={pending} />
            )}

            {current.key === 'identity' && (
              <div className="space-y-7">
                <div>
                  <p className="label">{tr("Profile photo")} <Req /></p>
                  {demo
                    ? <DemoAvatar name={draft.name} />
                    : <AvatarUpload photoUrl={draft.photo_url} name={draft.name} onUploaded={(url) => set({ photo_url: url })} />}
                </div>
                <div>
                  <label htmlFor="name" className="label">{tr("Your name")} <Req /></label>
                  <input
                    id="name" type="text" className="input" value={draft.name}
                    onChange={(e) => set({ name: e.target.value })}
                    placeholder={tr("How you want to be known")}
                  />
                  <p className="mt-1 text-xs text-smoke">
                    {tr("This is what appears on your profile, your entries and the leaderboards.")}
                  </p>
                </div>
              </div>
            )}

            {current.key === 'based' && (
              <div className="space-y-7">
                <CountrySelect
                  required
                  value={draft.country}
                  code={draft.country_code}
                  onChange={({ country, country_code }) => set({ country, country_code })}
                  hint={tr("Pick from the list so we can put you in the right market.")}
                />

                <MarketCard market={market} country={draft.country} ready={marketsReady} />

                <div>
                  <label htmlFor="city" className="label">{tr("Town or city")} <Req /></label>
                  <input
                    id="city" type="text" className="input" value={draft.city}
                    onChange={(e) => set({ city: e.target.value })}
                    placeholder={townHint || tr('Your town or city')}
                  />
                  <p className="mt-1 text-xs text-smoke">
                    {tr("Puts you on the creator map and gives other creators your real local time.")}
                  </p>
                </div>

                <DobField value={draft.dob} onChange={(dob) => set({ dob })} required />
                <PhoneInput value={contact} onChange={(c) => { setError(''); setContact(c) }} required />
              </div>
            )}

            {current.key === 'socials' && (
              <div className="space-y-7">
                <SocialInputs values={draft} onChange={(v) => set(v)} />
                <OtherLinks links={draft.other_links} onChange={(other_links) => set({ other_links })} />
              </div>
            )}

            {current.key === 'story' && (
              <div className="space-y-7">
                <div>
                  <label htmlFor="bio" className="label">{tr("One-line bio")} <Req /></label>
                  {/* AN <input> HID THE END OF THE SENTENCE (3 Sep 2026).
                      Ethan: "the one line bio and the favourite quote - the
                      text is cut off, I don't know how many scroll to the right
                      there." A single-line input scrolls HORIZONTALLY, so on a
                      375px screen a 120-character bio is legible about forty
                      characters at a time and there is no way to see the whole
                      of what you wrote before submitting it.
                      It wraps now. It is still ONE line of bio - newlines are
                      stripped on the way in, because the field's whole promise
                      is that it fits under a name everywhere - it is simply
                      allowed to occupy two rows on screen while you write it. */}
                  <AutoTextarea
                    id="bio" maxLength={120} minRows={2} className="input leading-relaxed" value={draft.bio}
                    onChange={(e) => set({ bio: e.target.value.replace(/[\r\n]+/g, ' ') })}
                    placeholder={tr("London based travel creator")}
                  />
                  <p className="mt-1 text-xs text-smoke">{120 - draft.bio.length} characters left. This sits under your name everywhere.</p>
                </div>
                <div>
                  <label htmlFor="about" className="label">{tr("A few lines about you")} <Req /></label>
                  {/* GROWS WITH THE ANSWER. See components/AutoTextarea: a
                      phone has no resize handle, so `rows={5}` was five lines
                      permanently, with an inner scrollbar inside a scrolling
                      page - which is why this answer came back short. */}
                  <AutoTextarea
                    id="about" minRows={5} className="input" value={draft.about}
                    onChange={(e) => set({ about: e.target.value })}
                    placeholder={tr("What you film, where you have been, how you got into it. This is the part the Tryp.com Team reads when they review your application.")}
                  />
                </div>
                <QuoteField value={draft.favourite_quote} onChange={(favourite_quote) => set({ favourite_quote })} />
              </div>
            )}

            {current.key === 'languages' && (
              <LanguageSelect selected={draft.languages} onChange={(languages) => set({ languages })} />
            )}

            {current.key === 'map' && (
              <div className="space-y-5">
                <WorldMap
                  selectable
                  chips
                  selected={draft.countries_visited}
                  onToggle={(name) =>
                    set({
                      countries_visited: draft.countries_visited.includes(name)
                        ? draft.countries_visited.filter((c) => c !== name)
                        : [...draft.countries_visited, name],
                    })}
                />
                <p className="text-center text-sm font-semibold text-brand">
                  {draft.countries_visited.length} {draft.countries_visited.length === 1 ? 'country' : 'countries'} and counting
                </p>
              </div>
            )}

            {current.key === 'extras' && (
              <div className="space-y-9">
                <div>
                  <p className="label">{tr("Travel photos")}</p>
                  {/* The board, not a second uploader. TravelGallery was the
                      one other place a creator could add a photo and it drew a
                      different grid with a different set of controls; the board
                      owns adding, captioning, sizing and ordering now, and it
                      is the same component the profile renders. */}
                  {demo ? <DemoGallery /> : <PhotoBoard creatorId={user.id} editable alwaysArranging />}
                </div>
                <BucketList rows={draft.bucket_list} onChange={(bucket_list) => set({ bucket_list })} />
              </div>
            )}

            {current.key === 'review' && (
              <Review
                draft={draft} contact={contact} market={market} problems={problems}
                pending={pending} onJump={goTo} demo={demo}
              />
            )}

            {error && (
              <p role="alert" className="mt-6 rounded-xl bg-brand-tint/60 px-4 py-3 text-center text-sm font-medium text-brand">
                {error}
              </p>
            )}

            <div className={cx('mt-8 flex flex-wrap gap-3', step === 0 ? 'justify-center' : 'justify-between')}>
              {step > 0 && <button onClick={back} className="btn-ghost">← Back</button>}
              {step < STEPS.length - 1 && (
                <button onClick={next} className="btn-primary">
                  {step === 0 ? "Let's go" : current.need ? 'Continue' : 'Continue'} →
                </button>
              )}
              {step === STEPS.length - 1 && (
                pending ? (
                  <button onClick={() => finish(false)} disabled={!complete} className="btn-primary disabled:opacity-40 sm:ml-auto">
                    {busy ? <Spinner /> : 'Submit application →'}
                  </button>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button onClick={() => finish(false)} disabled={!complete} className="btn-secondary disabled:opacity-40">{tr("Skip for now")}</button>
                    <button onClick={() => finish(true)} disabled={!complete} className="btn-primary disabled:opacity-40">{tr("Say hello in chat")}</button>
                  </div>
                )
              )}
            </div>
          </div>
        </div>

        {step > 0 && step < STEPS.length - 1 && (
          <p className="mt-5 text-center text-xs text-smoke">
            {problems.length === 0
              ? 'Everything required is filled in. You can jump to the end from here.'
              : `${problems.length} thing${problems.length === 1 ? '' : 's'} still to fill in.`}
            {' '}
            <button onClick={() => goTo('review')} className="font-semibold text-brand hover:underline">
              {tr("Go to review")}
            </button>
          </p>
        )}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ parts ---

function browserTimezone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { return null }
}

function Req() {
  const tr = useT()
  return <span className="text-brand" title={tr("Required")}>*</span>
}

function Progress({ step, barPct, current }) {
  return (
    <div className="mb-8 flex flex-col items-center gap-5">
      <img src="/brand/tryp-logo.png" alt="Tryp.com" className="h-11 rounded-xl shadow-card" />
      <div className="w-full max-w-md">
        {/* THE FOUR PARTS, SO NINE SCREENS READ AS A SHORT JOURNEY RATHER THAN A
            LONG FORM. A step counter alone answers "how far in am I"; the part
            answers "what am I doing", which is the question people actually ask
            themselves halfway through a sign-up. */}
        <div className="mb-2 flex items-center justify-between gap-2">
          {PARTS.map((p) => {
            const on = p === current.part
            const passed = PARTS.indexOf(p) < PARTS.indexOf(current.part)
            return (
              <span
                key={p}
                className={cx(
                  'text-[11px] font-semibold uppercase tracking-wide transition-colors duration-300',
                  on ? 'text-brand' : passed ? 'text-smoke' : 'text-gray-300',
                )}
              >
                {p}
              </span>
            )
          })}
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white shadow-inner">
          <div
            className="onb-bar h-full rounded-full bg-brand transition-[width] duration-500 ease-out"
            style={{ width: `${barPct}%` }}
          />
        </div>
        <p className="mt-2 text-center text-xs text-smoke">Step {step + 1} of {STEPS.length}</p>
      </div>
    </div>
  )
}

function StepHead({ step, pending }) {
  if (step.key === 'welcome') return null
  const chip = step.need ? 'Required' : step.skippable ? 'Optional' : null
  const COPY = {
    identity: ['Who are you?', 'Your face and your name. Both appear everywhere on the platform.'],
    based: ['Where are you based?', 'This decides your market, puts you on the map, and is how the team reaches you.'],
    socials: ['Where do you post?', 'Link your accounts so creators and the Tryp.com Team can find your work.'],
    story: ['Tell us about you', 'This is the part a person actually reads.'],
    // IT SAYS WHAT THE ANSWER IS ACTUALLY FOR (4 Sep 2026). Ethan: "the
    // languages you speak - this is an important section, and I want this to
    // also matter whenever admins are viewing the applications, because the
    // language could depend what market they end up going into."
    //
    // It now does: an admin reviewing this application sees the languages
    // beside the market picker, with any market this person's languages point
    // at flagged. A question that decides where somebody lands should say so
    // while they are answering it - "used to match you with collaboration
    // partners" undersold it into a nice-to-have, and a nice-to-have is a
    // question people answer with one word.
    languages: ['Languages you speak', 'This can decide which market you join, and it is how creators find somebody to collaborate with. Add every one you could film or talk in.'],
    map: ['Paint your travel map', 'Tap every country you have been to and watch it glow.'],
    // Ethan: "a few extras - I don't really like that name, I would just name
    // it as it is." It holds travel photographs and the places you want to go,
    // so it is called that.
    extras: ['Your travels', ''],
    review: [pending ? 'Ready to submit' : 'Almost done', 'Check it over. You can change any of it later from your profile.'],
  }
  const [title, sub] = COPY[step.key] || [step.title, '']
  return (
    <div className="mb-7 text-center">
      {chip && (
        <span
          className={cx(
            'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide',
            step.need ? 'bg-brand-tint text-brand' : 'bg-cloud text-smoke',
          )}
        >
          {chip}
        </span>
      )}
      <h2 className={cx('text-2xl font-bold tracking-tight', chip && 'mt-3')}>{title}</h2>
      {sub && <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-smoke">{sub}</p>}
    </div>
  )
}

function Welcome({ name, pending }) {
  const tr = useT()
  return (
    <div className="space-y-5 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-tint text-brand" aria-hidden>
        <Icon name="heart" className="h-8 w-8" />
      </div>
      {/* "TEAM", NOT "CREW", AND THE SENTENCE STOPS EARLY (3 Sep 2026).
          Ethan: "I like the welcome to the crew - I would say welcome to the
          team rather than crew", and on the paragraph, cut it to "You are
          joining the Tryp.com Content Creator Community." The clause that
          followed - a global community of travel creators who make great
          content, compete in challenges and earn real rewards - is the pitch
          from the public page, and this person has already read it and already
          applied. Repeating the sell to somebody who has said yes makes the
          screen longer without telling them anything. */}
      <h1 className="text-3xl font-bold">Welcome to the team{name ? `, ${name.split(' ')[0]}` : ''}!</h1>
      <p className="mx-auto max-w-md text-smoke">
        {tr("You are joining the Tryp.com Content Creator Community.")}
      </p>
      {/* TWO ROWS, AND BOTH OF THEM ARE ABOUT THEM.
          There were four. Ethan on the other two: "about three minutes, nine
          short screens, one thing each - don't like that, doesn't really make
          sense. Just say the time is short", and "two screens are optional -
          this doesn't make sense", and "your market is worked out for you -
          again, this doesn't make sense."
          He is right about all three, and they fail the same way: they are
          NOTES ABOUT THE FORM rather than facts about joining. Counting the
          screens invites you to dread them; announcing that two are optional
          before you have seen one is an instruction with no referent; and "your
          market is worked out for you" answers a question nobody has yet
          thought to ask.
          What survives is the length, said plainly, and the one row Ethan
          singled out to keep: "then the team reviews it, a person reads every
          application. This is good, I would keep this in." */}
      <div className="mx-auto max-w-sm space-y-2.5 pt-2 text-left">
        {/* THE TITLES ONLY (4 Sep 2026). Ethan: "remove 'Short screens, and you
            can come back to it' and remove 'A person reads every application'.
            I just want the titles."
            Both sub-lines were reassurance about a form nobody has seen yet,
            and the rows read faster without them - which is the point of a
            screen whose job is to get out of the way. */}
        {[
          ['clock', tr('It only takes a few minutes')],
          ['shield', pending ? tr('Then the team reviews it') : tr('Then you are in')],
        ].map(([icon, t]) => (
          <div key={t} className="flex items-center gap-3 rounded-xl bg-cloud/70 px-4 py-3">
            <Icon name={icon} className="h-4 w-4 shrink-0 text-brand" />
            <span className="min-w-0 text-sm font-semibold">{t}</span>
          </div>
        ))}
      </div>
    </div>
  )
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
function MarketCard({ market, country, ready }) {
  const tr = useT()
  if (market.outcome !== 'unknown' && !ready) {
    return (
      <div className="flex items-center gap-3 rounded-card border border-gray-200 bg-white px-4 py-3.5 text-xs text-smoke">
        <span className="h-4 w-4 shrink-0 animate-pulse rounded-full bg-brand/30" aria-hidden />
        {tr("Working out which market you land in…")}
      </div>
    )
  }
  if (market.outcome === 'unknown') {
    return (
      <div className="flex items-center gap-3 rounded-card border border-dashed border-gray-200 px-4 py-3.5 text-xs text-smoke">
        <Icon name="globe" className="h-4 w-4 shrink-0" />
        {tr("Pick your country and we will tell you which market you land in.")}
      </div>
    )
  }

  if (market.outcome === 'worldwide') {
    return (
      <div className="rounded-card border border-gray-200 bg-white px-4 py-3.5">
        <div className="flex items-start gap-3">
          <Icon name="globe" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">{tr("Worldwide community")}</p>
            <p className="mt-1 text-xs leading-relaxed text-smoke">
              No market covers {country || 'your country'} yet, and that is completely fine. You are in the
              worldwide community with every other creator, you can enter anything open to everyone, and we
              will tell you the moment a market opens near you.
            </p>
          </div>
        </div>
      </div>
    )
  }

  const m = market.market
  return (
    <div key={m.slug} className="onb-market rounded-card border border-brand/30 bg-brand-tint/30 px-4 py-3.5">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 shrink-0 text-xl leading-none" aria-hidden>
          {(m.country_codes || []).map(flagFromIso).join('') || '🌍'}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-wide text-brand">{tr("Your market")}</p>
          <p className="mt-0.5 text-sm font-semibold">{m.name}</p>
          <p className="mt-1 text-xs leading-relaxed text-smoke">
            {m.tagline || `Briefs, rooms and challenges for ${m.name}.`}
          </p>
        </div>
        <Icon name="check" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
      </div>
      {market.others.length > 0 && (
        <p className="mt-3 border-t border-brand/15 pt-3 text-xs text-smoke">
          {market.others.length === 1 ? 'One other market also covers' : `${market.others.length} other markets also cover`}{' '}
          {country}. The team will sort that out with you after you join.
        </p>
      )}
    </div>
  )
}

/**
 * ANYWHERE ELSE YOUR WORK LIVES.
 *
 * Ethan: "improve the UI of the other links. Maybe have an actual place they
 * can add a link for our website, rather than just add another button."
 *
 * It opened as a heading, a sentence and a button reading "Add a link" - so the
 * screen offered no place to put a link, only a control that would eventually
 * produce one. That is one press of pure ceremony in front of the actual field,
 * and it is why this section read as optional in the sense of "not for you"
 * rather than "you can skip it".
 *
 * There is always ONE EMPTY ROW waiting. Typing in it is the whole interaction;
 * the button below only appears once that row is used, and only to add a
 * SECOND. Nothing is saved from an empty row (finish() filters on `url`), so an
 * untouched section costs nothing.
 *
 * AND THE ROW RECOGNISES WHAT YOU PASTE. `brandForUrl` reads the HOST, so a
 * portfolio comes out as a chain link and a Pinterest page comes out as
 * Pinterest, in its own colour, the moment the address is complete. It is a
 * small thing and it is the difference between a form that is taking your
 * answer and one that is storing it.
 */
function OtherLinks({ links = [], onChange }) {
  const tr = useT()
  // The blank row lives in the DATA, so typing into it is an ordinary edit
  // rather than a special case, and `finish()` drops it if it stays empty.
  const rows = links.length ? links : [{ label: '', url: '' }]
  const set = (i, patch) => {
    const next = rows.map((l, j) => (j === i ? { ...l, ...patch } : l))
    onChange(next)
  }
  const lastUsed = rows.some((l) => l.url?.trim())

  return (
    <div>
      {/* "Other Links", plainly. Ethan: "rather than saying 'Anywhere else your
          work lives' just say 'Other Links'." A label is a name for a box, not
          a sentence about it. */}
      <p className="label">{tr("Other links")}</p>
      <p className="mb-3 text-xs text-smoke">
        {tr("Optional. A website, a portfolio, a newsletter, another account.")}
      </p>
      <div className="space-y-2">
        {rows.map((l, i) => {
          const url = l.url?.trim()
          const brand = url ? brandForUrl(url) : 'link'
          const tint = BRAND_COLOR[brand]
          return (
            <div
              key={i}
              className={cx(
                'field-shell flex items-center gap-2.5 rounded-card border px-3 py-2.5 transition-colors duration-200',
                url ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200 bg-cloud/30',
              )}
            >
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-smoke"
                style={{ background: url && tint !== 'currentColor' ? `${tint}14` : undefined }}
                aria-hidden
              >
                <SocialMark brand={brand} colored={!!url} className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <input
                  className="no-ios-zoom w-full border-0 bg-transparent p-0 text-sm font-medium text-ink outline-none placeholder:text-gray-300"
                  placeholder={tr("Your website")}
                  value={l.label || ''}
                  aria-label={`Link ${i + 1} label`}
                  onChange={(e) => set(i, { label: e.target.value })}
                />
                <input
                  className="no-ios-zoom w-full border-0 bg-transparent p-0 text-xs text-smoke outline-none placeholder:text-gray-300"
                  placeholder="https://"
                  inputMode="url"
                  value={l.url || ''}
                  aria-label={`Link ${i + 1} address`}
                  onChange={(e) => set(i, { url: e.target.value })}
                />
              </span>
              {rows.length > 1 && (
                <button
                  type="button"
                  aria-label={tr("Remove link")}
                  className="shrink-0 rounded-full p-1.5 text-gray-300 transition-colors hover:bg-cloud hover:text-ink"
                  onClick={() => onChange(rows.filter((_, j) => j !== i))}
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              )}
            </div>
          )
        })}
      </div>
      {lastUsed && rows.length < 5 && (
        <button
          type="button"
          className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-brand transition-transform duration-200 hover:translate-x-0.5"
          onClick={() => onChange([...rows, { label: '', url: '' }])}
        >
          <Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} />
          {tr("Add another link")}
        </button>
      )}
    </div>
  )
}

/**
 * THE BUCKET LIST, CALLED THE BUCKET LIST.
 *
 * Ethan: "I don't get the 'where you are headed next' thing below this. Is this
 * for the calendar? I don't think it is. Is this just, like, the bucket list?
 * You need to rename it or make it more clear because I don't even understand
 * what it is."
 *
 * He wrote the brief and he could not tell what the field was for, which is
 * about as clear a verdict as a label can get. "Where you are headed next"
 * describes a TRIP - something with dates, something the calendar and the
 * collab board deal in - and this is neither: it writes `profiles.bucket_list`,
 * it has no dates, and the profile has always drawn it under the heading
 * "Bucket list". Three surfaces, one column, two names.
 *
 * So it is the bucket list here too, and the sentence under it says what
 * happens to the answer AND, just as importantly, what does not: nobody is
 * being asked to commit to a trip.
 *
 * The rows are cards rather than two bare inputs and a cross, and the second
 * field is a CITY, which is what it always wrote - it was labelled "Town
 * (optional)" beside a Country box with no indication the pair made one place.
 */
function BucketList({ rows = [], onChange }) {
  const tr = useT()
  const list = rows.length ? rows : [{ country: '', city: '' }]
  const set = (i, patch) => onChange(list.map((b, j) => (j === i ? { ...b, ...patch } : b)))
  const lastUsed = list.some((b) => b.country?.trim())

  return (
    <div>
      <p className="label">{tr("Your bucket list")}</p>
      <p className="mb-3 text-xs text-smoke">{tr("Optional.")}</p>
      <div className="space-y-2">
        {list.map((b, i) => (
          <div
            key={i}
            className={cx(
              'field-shell flex items-center gap-2.5 rounded-card border px-3 py-2.5 transition-colors duration-200',
              b.country?.trim() ? 'border-gray-200 bg-white' : 'border-dashed border-gray-200 bg-cloud/30',
            )}
          >
            {/* THE FLAG, ONCE THERE IS A COUNTRY (4 Sep 2026). Ethan: "when
                they type in the country, like on the profile, it should show
                the country flag as the icon rather than the pin."
                The profile already draws bucket-list entries with a flag, so a
                pin here was the same data in two different clothes. It falls
                back to the pin while the box is empty or the name does not
                resolve - a blank square would read as a broken image. */}
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint/60 text-brand" aria-hidden>
              {flagFromIso(isoForCountryName(b.country)) || <Icon name="pin" className="h-4 w-4" />}
            </span>
            <span className="grid min-w-0 flex-1 gap-1 sm:grid-cols-2 sm:gap-3">
              <input
                className="no-ios-zoom w-full border-0 bg-transparent p-0 text-sm font-medium text-ink outline-none placeholder:text-gray-300"
                placeholder={tr("Country")}
                value={b.country || ''}
                aria-label={`Destination ${i + 1} country`}
                onChange={(e) => set(i, { country: e.target.value })}
              />
              <input
                className="no-ios-zoom w-full border-0 bg-transparent p-0 text-sm text-smoke outline-none placeholder:text-gray-300"
                placeholder={tr("City (optional)")}
                value={b.city || ''}
                aria-label={`Destination ${i + 1} city`}
                onChange={(e) => set(i, { city: e.target.value })}
              />
            </span>
            {list.length > 1 && (
              <button
                type="button"
                aria-label={tr("Remove destination")}
                className="shrink-0 rounded-full p-1.5 text-gray-300 transition-colors hover:bg-cloud hover:text-ink"
                onClick={() => onChange(list.filter((_, j) => j !== i))}
              >
                <Icon name="close" className="h-4 w-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      {lastUsed && list.length < 6 && (
        <button
          type="button"
          className="mt-2.5 inline-flex items-center gap-1.5 text-xs font-semibold text-brand transition-transform duration-200 hover:translate-x-0.5"
          onClick={() => onChange([...list, { country: '', city: '' }])}
        >
          <Icon name="plus" className="h-3.5 w-3.5" strokeWidth={2.4} />
          {tr("Add another place")}
        </button>
      )}
    </div>
  )
}

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
function Review({ draft, contact, market, problems, pending, onJump, demo }) {
  const tr = useT()
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
        <div className="rounded-card border border-brand/30 bg-brand-tint/30 p-4">
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
                  <span className="min-w-0 flex-1">{p.text}</span>
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

      {market.market ? (
        <div className="flex items-center gap-3 rounded-card border border-brand/30 bg-brand-tint/30 px-4 py-3">
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
          Worldwide community only for now. No market covers {draft.country || 'your country'} yet.
        </div>
      )}

      <dl className="divide-y divide-gray-100">
        <ReviewRow label={tr("About you")} onJump={() => onJump('story')} value={draft.about} multiline />
        <ReviewRow label={tr("Posts on")} onJump={() => onJump('socials')} value={socials.map(([k]) => k).join(', ')} />
        <ReviewRow label={tr("Languages")} onJump={() => onJump('languages')} value={draft.languages.join(', ')} />
        <ReviewRow label={tr("Countries visited")} onJump={() => onJump('map')} value={draft.countries_visited.length ? `${draft.countries_visited.length}` : ''} />
        <ReviewRow label={tr("Phone")} onJump={() => onJump('based')} value={contact.phone ? `${contact.phone_country} ${contact.phone}` : ''} hint={tr("Private. Only the team can see this.")} />
        <ReviewRow label={tr("Favourite quote")} onJump={() => onJump('story')} value={draft.favourite_quote} optional />
        <ReviewRow label={tr("Bucket list")} onJump={() => onJump('extras')} value={(draft.bucket_list || []).filter((b) => b.country).map((b) => [b.city, b.country].filter(Boolean).join(', ')).join(' · ')} optional />
        <ReviewRow label={tr("Other links")} onJump={() => onJump('extras')} value={(draft.other_links || []).filter((l) => l.url).length ? `${(draft.other_links || []).filter((l) => l.url).length}` : ''} optional />
      </dl>

      <p className="text-center text-xs leading-relaxed text-smoke">
        {pending
          ? 'When you submit, the Tryp.com Team is notified and a person reads your application. You will hear back by email.'
          : 'Your profile goes live as soon as you finish. You can change any of it later.'}
      </p>
    </div>
  )
}

// A REVIEW ROW THAT FITS ON A PHONE.
//
// Ethan: "it shows the ready to submit - I would just tidy up the UI here."
//
// It was a horizontal row with a FIXED 8rem label column, on a screen 375px
// wide inside a card with 24px of padding either side. That leaves about 140px
// for the answer - so "About you", which is the longest thing anybody writes in
// this whole flow and the paragraph an admin actually reads, was set two or
// three words to a line down a narrow gutter, ten lines tall, with a "Fix"
// button floating beside the top of it.
//
// Under `sm` the label goes ABOVE its value and the value gets the full width.
// The horizontal layout is right on a desktop, where there is room for it, and
// is kept. Same content, same component, one breakpoint.
function ReviewRow({ label, value, onJump, optional, multiline, hint }) {
  const tr = useT()
  const empty = !value?.trim?.()
  return (
    <div className="flex flex-col gap-1 py-3 sm:flex-row sm:items-start sm:gap-4 sm:py-2.5">
      <dt className="flex items-baseline justify-between gap-2 text-xs text-smoke sm:w-32 sm:shrink-0 sm:justify-start">
        <span>
          {label}
          {hint && <span className="mt-0.5 block text-[10px] opacity-80">{hint}</span>}
        </span>
        {/* On a phone the Edit control belongs beside its LABEL, not beside the
            top of a ten-line paragraph, so it is drawn here and hidden at `sm`
            where the row layout puts it back on the right. */}
        <button
          type="button"
          onClick={onJump}
          className="shrink-0 text-xs font-semibold text-brand transition-transform duration-200 hover:scale-105 sm:hidden"
        >
          {tr("Edit")}
        </button>
      </dt>
      <dd className="min-w-0 flex-1 text-sm">
        {empty
          ? <span className={cx('text-xs', optional ? 'text-gray-400' : 'font-medium text-brand')}>{optional ? 'Not added' : 'Missing'}</span>
          : <span className={cx('block', multiline ? 'line-clamp-3 leading-relaxed' : 'truncate')}>{value}</span>}
      </dd>
      <button
        type="button"
        onClick={onJump}
        className="hidden shrink-0 text-xs font-semibold text-brand transition-transform duration-200 hover:scale-105 sm:block"
      >
        {tr("Edit")}
      </button>
    </div>
  )
}

// The two controls that would write into the signed-in admin's own account,
// drawn as samples. Not interactive on purpose: an upload button that does
// nothing when pressed is worse in a demonstration than an obvious placeholder,
// because the audience spends the next minute wondering if it is broken.
function DemoAvatar({ name }) {
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

function DemoGallery() {
  const tr = useT()
  const shots = ['Lisbon, rooftop', 'Tromso, blue hour', 'Seville, morning', 'Dolomites, day two', 'Marrakech, souk', 'Skye, the long road']
  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {shots.map((s, i) => (
          <div key={s} className="flex aspect-square flex-col items-center justify-center gap-2 rounded-xl bg-cloud px-3 text-center">
            <Icon name="image" className="h-6 w-6 text-brand/50" />
            <span className="text-[11px] leading-tight text-smoke">{s}</span>
            <span className="text-[10px] text-gray-400">Photo {i + 1}</span>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-smoke">{tr("Sample gallery. Uploading is switched off in the Testing Centre.")}</p>
    </div>
  )
}
