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
import TravelGallery from '../components/TravelGallery'
import Icon from '../components/Icon'
import TrypPlaneScene from '../components/TrypPlaneScene'
import { geocodeCity } from '../lib/geocode'
import { Avatar, Spinner } from '../components/ui'
import { cx, ageFromDob } from '../lib/utils'
import { useDemoMode, postDemoState, useDemoMessages } from '../lib/demoMode'

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

// The four parts, named. They are not drawn as a row of words any more (the
// stepper carries the shape), but the names are still what the nav bar and the
// stepper caption say out loud, and STEPS reads them.
export const PARTS = ['You', 'Your work', 'Your travel', 'Finish']

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

// WHAT EACH SCREEN IS ABOUT, IN ONE GLYPH.
//
// Nine screens is enough that "step 6 of 9" stops meaning anything on its own -
// a number tells you how much is left and nothing at all about what is coming.
// The stepper draws these instead, so somebody halfway through can see that the
// map and the photos are still ahead and that neither of them is a form.
const STEP_ICON = {
  welcome: 'sparkles',
  identity: 'smile',
  based: 'pin',
  socials: 'video',
  story: 'pencil',
  languages: 'chat',
  map: 'globe',
  extras: 'image',
  review: 'check',
}

// A HALF-FINISHED APPLICATION SURVIVES A REFRESH.
//
// Nine screens is a lot to lose to a stray back-swipe, a phone call, or a
// browser deciding to reload a backgrounded tab - and every one of those
// happens, because this form is filled in on a phone by somebody who has just
// been told about the programme. The draft lives in this browser until it is
// submitted.
//
// THE PHONE NUMBER IS NOT IN IT, DELIBERATELY. It is the one field the product
// already treats as sensitive - it is written to `creator_private` rather than
// to `profiles`, and it is the number the team rings about money. Something the
// schema keeps out of the public table does not belong in localStorage on a
// machine that might be shared. One field retyped after a refresh is a fair
// price for that.
const DRAFT_KEY = (id) => `tryp_onboarding_draft_${id || 'anon'}`

export function loadDraft(id) {
  try {
    const raw = localStorage.getItem(DRAFT_KEY(id))
    if (!raw) return null
    const saved = JSON.parse(raw)
    // A draft from a previous version of this form, or a corrupted one, must
    // never take the flow down. Anything that is not an object is discarded.
    return saved && typeof saved === 'object' ? saved : null
  } catch { return null }
}

export function saveDraft(id, draft, step) {
  try {
    localStorage.setItem(DRAFT_KEY(id), JSON.stringify({ draft, step, at: Date.now() }))
  } catch { /* private mode, or a full quota: the form still works */ }
}

export function clearDraft(id) {
  try { localStorage.removeItem(DRAFT_KEY(id)) } catch { /* nothing to clean up */ }
}

const EMPTY = {
  name: '', photo_url: '', dob: null, city: '', country: '', country_code: '',
  bio: '', about: '', favourite_quote: '',
  instagram_url: '', tiktok_url: '', youtube_url: '', other_links: [],
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
  if (!draft.instagram_url?.trim() && !draft.tiktok_url?.trim() && !draft.youtube_url?.trim()) {
    p.push({ step: 'socials', text: 'Link at least one account you post on' })
  }
  if (!draft.bio?.trim()) p.push({ step: 'story', text: 'Write your one-line bio' })
  if (!draft.about?.trim()) p.push({ step: 'story', text: 'Write a few lines about you' })
  if (!draft.languages?.length) p.push({ step: 'languages', text: 'Pick at least one language' })
  if (!draft.countries_visited?.length) p.push({ step: 'map', text: 'Tap at least one country on your map' })
  return p
}

export default function Onboarding() {
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
      other_links: Array.isArray(auth.profile?.other_links) ? auth.profile.other_links : [],
      languages: auth.profile?.languages || [],
      countries_visited: auth.profile?.countries_visited || [],
      bucket_list: Array.isArray(auth.profile?.bucket_list) ? auth.profile.bucket_list : [],
    }
  })

  const [contact, setContact] = useState(() => (
    demo && prefilled ? { phone: '7700 900123', phone_country: '+44' } : { phone: '', phone_country: '' }
  ))

  // RESTORE ONCE, ON THE WAY IN, AND ONLY OVER EMPTY FIELDS.
  //
  // The saved draft is merged UNDER whatever the profile already has, never
  // over it: somebody who filled half of this in on their laptop and came back
  // on their phone should get their profile's real name, not the one they were
  // half way through typing on another device a week ago.
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    if (demo || restored) return
    const saved = loadDraft(user?.id)
    setRestored(true)
    if (!saved?.draft) return
    setDraft((d) => {
      const merged = { ...d }
      let changed = false
      for (const [k, v] of Object.entries(saved.draft)) {
        const empty = merged[k] === '' || merged[k] == null
          || (Array.isArray(merged[k]) && merged[k].length === 0)
        const has = Array.isArray(v) ? v.length > 0 : v !== '' && v != null
        if (empty && has) { merged[k] = v; changed = true }
      }
      return changed ? merged : d
    })
    if (typeof saved.step === 'number' && saved.step > 0 && saved.step < STEPS.length - 1) {
      setStep(saved.step)
    }
  }, [demo, user?.id, restored])

  // And save on every change, once the restore has happened - saving before it
  // would write the empty form over the thing we are about to read.
  useEffect(() => {
    if (demo || !restored || done) return
    saveDraft(user?.id, draft, step)
  }, [demo, restored, done, draft, step, user?.id])

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
  // What is missing on the screen the creator is looking at right now.
  const mine = problemsFor(current.key)

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

  const onCommand = useCallback((msg) => {
    if (msg.dir !== 'down') return
    if (msg.type === 'goto' && typeof msg.step === 'number') {
      setError('')
      setStep((cur) => {
        const to = Math.max(0, Math.min(STEPS.length - 1, msg.step))
        setDir(to < cur ? 'back' : 'fwd')
        return to
      })
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
    const to = typeof key === 'number' ? key : stepIndex(key)
    if (to < 0) return
    setError(''); setDir(to < step ? 'back' : 'fwd'); setStep(to)
  }

  // HOW FAR ANYBODY IS ALLOWED TO JUMP.
  //
  // Backwards, always - somebody who wants to change the photo they picked four
  // screens ago should not have to press Back four times. Forwards only as far
  // as they have already been, plus the review, which is reachable from
  // anywhere the moment the form is actually complete. Letting the stepper jump
  // past an unfilled screen would quietly defeat the per-screen validation that
  // is the whole reason this flow has nine screens instead of one.
  const furthest = useRef(0)
  useEffect(() => { furthest.current = Math.max(furthest.current, step) }, [step])
  const canJumpTo = (n) => n <= Math.max(step, furthest.current)
    || (n === STEPS.length - 1 && complete)

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

    await Promise.all([
      supabase.from('profiles').update(update).eq('id', user.id),
      (contact.phone || contact.phone_country)
        ? supabase.from('creator_private').upsert({
            id: user.id,
            phone: contact.phone,
            phone_country: contact.phone_country,
            updated_at: new Date().toISOString(),
          })
        : Promise.resolve(),
    ])

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
        body: `Hey everyone! ${draft.name || 'A new creator'} here, just joined the program 👋`,
      })
    }

    clearDraft(user.id)
    await refreshProfile()
    navigate(sayHello && !pending ? '/chat/general' : '/home')
  }

  // ---------------------------------------------------------------- views ---
  if (busy) {
    return (
      <TrypPlaneScene
        title={pending ? 'Your application is on its way' : 'Setting up your profile'}
        subtitle={pending
          ? 'It is with the Tryp.com team now. Somebody reads every application properly, so give it a day or two - you will hear back by email either way.'
          : 'Putting your profile together. This takes a few seconds.'}
      >
        {pending && !demo && (
          <button onClick={async () => { await signOut(); window.location.href = '/' }} className="btn-ghost mt-6 text-sm">
            Log out
          </button>
        )}
      </TrypPlaneScene>
    )
  }

  if (done) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-cloud/50 px-5 py-12">
        <div className="card w-full max-w-md text-center !p-10">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-green-50 text-green-600">
            <Icon name="check" className="h-7 w-7" />
          </span>
          <h1 className="mt-4 text-2xl font-bold">
            {pending ? 'Application submitted' : 'Profile complete'}
          </h1>
          <p className="mt-2 text-sm text-smoke">
            {pending
              ? 'Every admin has been notified. Nothing was written, because this is the Testing Centre.'
              : 'Nothing was written, because this is the Testing Centre.'}
          </p>
          {market.market && (
            <p className="mt-4 rounded-card bg-brand-tint/40 px-4 py-3 text-sm font-semibold text-brand">
              Assigned to {market.market.name}
            </p>
          )}
          <button onClick={() => { setDone(false); setStep(0) }} className="btn-secondary mt-6 text-sm">
            Walk it again
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="onb-page">
      {/* THE SAME AURA THE FRONT DOOR USES, TURNED WAY DOWN.
          Signup is a brand-coloured half-screen; this is the screen straight
          after it, and going from that to a flat grey form is a change of
          product rather than a change of page. Two blooms at the top corners is
          enough to carry the colour through without competing with a form. */}
      <span className="onb-glow" aria-hidden />

      <div className="onb-inner">
        <Progress
          step={step}
          barPct={barPct}
          current={current}
          problems={problems}
          canJumpTo={canJumpTo}
          onJump={goTo}
        />

        <div className="onb-card" key={current.key}>
          <div className="onb-screen" data-dir={dir}>
            <StepHead step={current} pending={pending} />

            {current.key === 'welcome' && (
              <Welcome name={draft.name} pending={pending} />
            )}

            {current.key === 'identity' && (
              <div className="space-y-7">
                <div>
                  <p className="label">Profile photo <Req /></p>
                  {demo
                    ? <DemoAvatar name={draft.name} />
                    : <AvatarUpload photoUrl={draft.photo_url} name={draft.name} onUploaded={(url) => set({ photo_url: url })} />}
                </div>
                <div>
                  <label htmlFor="name" className="label">Your name <Req /></label>
                  <input
                    id="name" type="text" className="input" value={draft.name}
                    onChange={(e) => set({ name: e.target.value })}
                    placeholder="How you want to be known"
                  />
                  <p className="mt-1 text-xs text-smoke">
                    This is what appears on your profile, your entries and the leaderboards.
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
                  hint="Pick from the list so we can put you in the right market."
                />

                <MarketCard market={market} country={draft.country} ready={marketsReady} />

                <div>
                  <label htmlFor="city" className="label">Town or city <Req /></label>
                  <input
                    id="city" type="text" className="input" value={draft.city}
                    onChange={(e) => set({ city: e.target.value })}
                    placeholder="Bristol"
                  />
                  <p className="mt-1 text-xs text-smoke">
                    Puts you on the creator map and gives other creators your real local time.
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
                  <label htmlFor="bio" className="label">One-line bio <Req /></label>
                  <input
                    id="bio" type="text" maxLength={120} className="input" value={draft.bio}
                    onChange={(e) => set({ bio: e.target.value })}
                    placeholder="London based travel creator"
                  />
                  <p className="mt-1 text-xs text-smoke">{120 - draft.bio.length} characters left. This sits under your name everywhere.</p>
                </div>
                <div>
                  <label htmlFor="about" className="label">A few lines about you <Req /></label>
                  <textarea
                    id="about" rows={5} className="input" value={draft.about}
                    onChange={(e) => set({ about: e.target.value })}
                    placeholder="What you film, where you have been, how you got into it. This is the part the Tryp.com Team reads when they review your application."
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
                  <p className="label">Travel photos</p>
                  {demo ? <DemoGallery /> : <TravelGallery creatorId={user.id} editable />}
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

            {/* WHAT THIS SCREEN IS STILL WAITING FOR, WHILE YOU ARE ON IT.
                The error line under the button only appeared AFTER somebody
                pressed Continue and was turned back, which is the last possible
                moment to mention a rule. This is the same information a beat
                earlier: live, quiet, and gone the instant the screen is
                satisfied. The red line stays for the case where they pressed
                Continue anyway. */}
            {current.need && mine.length > 0 && !error && (
              <div className="onb-waiting">
                <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>
                  Still needed on this screen: {mine.map((m) => m.text.replace(/^(Add|Write|Pick|Choose|Link|Tap) /, '').toLowerCase()).join(', ')}.
                </span>
              </div>
            )}

            {error && (
              <p role="alert" className="onb-error">
                <Icon name="alert" className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{error}</span>
              </p>
            )}
          </div>
        </div>

        {/* THE CONTROLS ARE A BAR, AND ON A PHONE THAT BAR IS PINNED.
            Continue used to sit at the bottom of the card, which on the map
            screen is below a world map and on the languages screen below a list
            of forty chips - so the one control every screen has in common was
            in a different place on every screen, and on a phone it was
            frequently off the bottom of it. It is furniture now: same place,
            always reachable, above the home indicator. */}
        <div className="onb-nav">
          <div className="onb-nav-inner">
            {step > 0
              ? (
                <button onClick={back} className="onb-back">
                  <Icon name="chevronLeft" className="h-4 w-4" />
                  <span className="hidden sm:inline">Back</span>
                </button>
              )
              : <span className="hidden sm:block" />}

            {/* The middle of the bar answers "how much more of this is there",
                which is the question somebody on screen five is actually
                asking. */}
            <p className="onb-nav-mid">
              {step === STEPS.length - 1
                ? complete
                  ? 'Everything is filled in.'
                  : `${problems.length} thing${problems.length === 1 ? '' : 's'} left`
                : `Step ${step + 1} of ${STEPS.length} · ${current.part}`}
            </p>

            {step < STEPS.length - 1 && (
              <button onClick={next} className="btn-primary !px-6">
                {step === 0 ? 'Start' : current.skippable && mine.length === 0 ? 'Continue' : 'Continue'}
                <Icon name="chevronRight" className="h-4 w-4" />
              </button>
            )}
            {step === STEPS.length - 1 && (
              pending ? (
                <button onClick={() => finish(false)} disabled={!complete} className="btn-primary !px-6 disabled:opacity-40">
                  {busy ? <Spinner /> : 'Send my application'}
                </button>
              ) : (
                <div className="flex gap-2">
                  <button onClick={() => finish(false)} disabled={!complete} className="btn-secondary !px-4 disabled:opacity-40">Finish</button>
                  <button onClick={() => finish(true)} disabled={!complete} className="btn-primary !px-4 disabled:opacity-40">Finish &amp; say hello</button>
                </div>
              )
            )}
          </div>
        </div>

        {step > 0 && step < STEPS.length - 1 && (
          <p className="onb-jump">
            {complete
              ? 'Everything required is filled in - you can go straight to the end.'
              : `${problems.length} thing${problems.length === 1 ? '' : 's'} still to fill in across the whole form.`}
            {' '}
            <button onClick={() => goTo('review')} className="font-semibold text-brand hover:underline">
              Jump to the review
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
  return <span className="text-brand" title="Required">*</span>
}

/**
 * THE STEPPER.
 *
 * WHAT WAS HERE: four words in a row (You / Your work / Your travel / Finish),
 * a thin bar, and "Step 4 of 9". Three separate readings of one fact, none of
 * which told anybody what was coming next or let them go back to a screen they
 * had already done.
 *
 * WHAT IT IS NOW: nine dots, grouped visually into the four parts, each one an
 * icon of what that screen is about. Done screens are solid, the current one is
 * a ring, screens that still owe something carry a small mark, and any screen
 * you have already been to is a button that takes you straight back to it. The
 * bar underneath is still there because a bar is the only thing that reads at a
 * glance, and it still starts at fifteen per cent - endowed progress: a goal
 * that already looks underway is one people finish far more often than one that
 * starts at nothing.
 */
function Progress({ step, barPct, current, problems, canJumpTo, onJump }) {
  // ONLY FOR SCREENS SOMEBODY HAS ACTUALLY BEEN TO.
  //
  // Every required screen "owes something" before it has been filled in, so
  // marking them all put an amber dot on six of the nine steps on the welcome
  // screen - which reads as six errors on a form nobody has touched. A mark
  // means "you left this one unfinished", and that is only true of a screen you
  // have already seen.
  const owed = new Set(problems.map((p) => p.step))
  return (
    <div className="onb-progress">
      <img src="/brand/tryp-logo.png" alt="Tryp.com" className="onb-logo" />

      <div className="onb-steps" role="list">
        {STEPS.map((s, i) => {
          const done = i < step
          const on = i === step
          const jump = canJumpTo(i)
          const owes = owed.has(s.key) && i !== step && canJumpTo(i)
          const Tag = jump && !on ? 'button' : 'span'
          return (
            <Tag
              key={s.key}
              role="listitem"
              type={Tag === 'button' ? 'button' : undefined}
              onClick={Tag === 'button' ? () => onJump(i) : undefined}
              title={`${s.title}${owes ? ' · still needs something' : ''}`}
              aria-current={on ? 'step' : undefined}
              className={cx('onb-step', on && 'is-on', done && 'is-done', jump && !on && 'is-open')}
            >
              <Icon name={STEP_ICON[s.key] || 'check'} className="h-3.5 w-3.5" />
              {owes && <span className="onb-step-owed" aria-hidden />}
            </Tag>
          )
        })}
      </div>

      <div className="onb-track">
        <div className="onb-bar" style={{ width: `${barPct}%` }} />
      </div>

      <p className="onb-partline">
        <span className="font-semibold text-ink">{current.part}</span>
        <span aria-hidden> · </span>
        <span>{current.title}</span>
      </p>
    </div>
  )
}

// A SHORT LINE PER SCREEN, WRITTEN AS A PERSON WOULD SAY IT.
//
// Every one of these used to be a description of a form field ("Link your
// accounts so creators and the Tryp.com Team can find your work"). They now say
// why it is being asked, because that is the thing that makes somebody answer
// properly rather than minimally - "this is the part a human reads" gets a real
// paragraph out of people, and "tell us about you" gets a sentence.
const HEAD_COPY = {
  identity: ['Who are you?', 'Your face and your name. Both of these follow you round the whole platform, so use the ones people would recognise.'],
  based: ['Where do you live?', 'This decides which market you land in, puts you on the creator map, and is how the team reaches you about a shoot or a payment.'],
  socials: ['Where do you post?', 'Your accounts are the work. This is what the team looks at, and what other creators click when they find you.'],
  story: ['Tell us about you', 'This is the part an actual person reads before deciding. Worth five minutes.'],
  languages: ['What can you speak?', 'Used to pair you up for collaborations, and to know which markets you could film in.'],
  map: ['Where have you been?', 'Tap every country. It builds your map, and it is how somebody planning a trip finds the person who has already done it.'],
  extras: ['A couple of extras', 'None of this is required. Skip it and add it later from your profile if you would rather get on.'],
  review: [null, 'Read it back. Everything here can be changed later from your profile.'],
}

function StepHead({ step, pending }) {
  if (step.key === 'welcome') return null
  const chip = step.need ? 'Required' : step.skippable ? 'Optional' : null
  const [copyTitle, sub] = HEAD_COPY[step.key] || [step.title, '']
  const title = copyTitle || (pending ? 'Ready to send' : 'Almost there')
  return (
    <div className="onb-head">
      <span className="onb-head-icon" aria-hidden>
        <Icon name={STEP_ICON[step.key] || 'check'} className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-[22px] font-bold leading-tight tracking-tight sm:text-2xl">{title}</h2>
          {chip && (
            <span className={cx('onb-chip', step.need ? 'onb-chip--need' : 'onb-chip--opt')}>{chip}</span>
          )}
        </div>
        {sub && <p className="mt-1.5 text-sm leading-relaxed text-smoke">{sub}</p>}
      </div>
    </div>
  )
}

// THE FIRST SCREEN, WHICH HAS NO FIELDS ON IT AND HAS TO EARN ITS PLACE.
//
// A welcome screen in a sign-up flow is usually a tax: one more tap between
// somebody and the thing they came for. This one is doing a job, and the job is
// SETTING EXPECTATIONS - how long, how many screens, what happens at the end,
// and whether a human is involved. People abandon forms they cannot see the end
// of far more often than forms that are long.
function Welcome({ name, pending }) {
  const first = name?.trim()?.split(' ')[0]
  return (
    <div className="onb-welcome">
      <span className="onb-welcome-mark" aria-hidden>
        <Icon name="sparkles" className="h-7 w-7" />
      </span>
      <h1 className="mt-5 text-[26px] font-bold leading-tight tracking-tight sm:text-3xl">
        {first ? `Right then, ${first}.` : 'Right then.'}
        <br />
        <span className="text-brand">Time to build your profile.</span>
      </h1>
      <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-smoke">
        {pending
          ? 'What you fill in here is your application. Somebody on the team reads it properly, so it is worth doing once rather than twice.'
          : 'A few short screens and you are in. Everything here can be changed later from your profile.'}
      </p>

      <div className="onb-welcome-list">
        {[
          ['clock', 'Five minutes, give or take', 'Nine screens, one kind of thing on each.'],
          ['image', 'Two of them you can skip', 'They are marked, and skipping costs you nothing.'],
          ['globe', 'Your market is worked out for you', 'You will see which one before you finish, and why.'],
          [pending ? 'shield' : 'check',
            pending ? 'Then a person reads it' : 'Then you are in',
            pending ? 'Not a filter, not a score. You hear back by email.' : 'Your profile goes live straight away.'],
        ].map(([icon, t, d], i) => (
          <div key={t} className="onb-welcome-row" style={{ '--i': i }}>
            <span className="onb-welcome-icon"><Icon name={icon} className="h-4 w-4" /></span>
            <span className="min-w-0">
              <span className="block text-sm font-semibold">{t}</span>
              <span className="block text-xs leading-relaxed text-smoke">{d}</span>
            </span>
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
  if (market.outcome !== 'unknown' && !ready) {
    return (
      <div className="flex items-center gap-3 rounded-card border border-gray-200 bg-white px-4 py-3.5 text-xs text-smoke">
        <span className="h-4 w-4 shrink-0 animate-pulse rounded-full bg-brand/30" aria-hidden />
        Working out which market you land in…
      </div>
    )
  }
  if (market.outcome === 'unknown') {
    return (
      <div className="flex items-center gap-3 rounded-card border border-dashed border-gray-200 px-4 py-3.5 text-xs text-smoke">
        <Icon name="globe" className="h-4 w-4 shrink-0" />
        Pick your country and we will tell you which market you land in.
      </div>
    )
  }

  if (market.outcome === 'worldwide') {
    return (
      <div className="rounded-card border border-gray-200 bg-white px-4 py-3.5">
        <div className="flex items-start gap-3">
          <Icon name="globe" className="mt-0.5 h-5 w-5 shrink-0 text-brand" />
          <div className="min-w-0">
            <p className="text-sm font-semibold">Worldwide community</p>
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
          <p className="text-[10px] font-bold uppercase tracking-wide text-brand">Your market</p>
          <p className="mt-0.5 text-sm font-semibold">{m.name}</p>
          <p className="mt-1 text-xs leading-relaxed text-smoke">
            {m.tagline || `Briefs, rooms and challenges for ${m.name}.`}
          </p>
          <p className="mt-2 text-xs text-smoke">
            You are in the worldwide community as well. A market is where your briefs come from, not a
            smaller room you go into instead.
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

function OtherLinks({ links = [], onChange }) {
  return (
    <div>
      <p className="label">Anywhere else your work lives</p>
      <p className="mb-3 text-xs text-smoke">Optional. A website, a portfolio, a newsletter, another account.</p>
      <div className="space-y-2">
        {links.map((l, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="input w-32 shrink-0" placeholder="Label" value={l.label || ''}
              aria-label={`Link ${i + 1} label`}
              onChange={(e) => { const n = [...links]; n[i] = { ...n[i], label: e.target.value }; onChange(n) }}
            />
            <input
              className="input flex-1" placeholder="https://" value={l.url || ''}
              aria-label={`Link ${i + 1} address`}
              onChange={(e) => { const n = [...links]; n[i] = { ...n[i], url: e.target.value }; onChange(n) }}
            />
            <button type="button" aria-label="Remove link" className="btn-ghost !px-3" onClick={() => onChange(links.filter((_, j) => j !== i))}>
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      {links.length < 5 && (
        <button type="button" className="btn-secondary mt-3 !py-2 text-xs" onClick={() => onChange([...links, { label: '', url: '' }])}>
          Add a link
        </button>
      )}
    </div>
  )
}

function BucketList({ rows = [], onChange }) {
  return (
    <div>
      <p className="label">Where you are headed next</p>
      <p className="mb-3 text-xs text-smoke">
        Optional. It appears on your profile and it is how other creators find somebody to travel with.
      </p>
      <div className="space-y-2">
        {rows.map((b, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="input flex-1" placeholder="Country" value={b.country || ''}
              aria-label={`Destination ${i + 1} country`}
              onChange={(e) => { const n = [...rows]; n[i] = { ...n[i], country: e.target.value }; onChange(n) }}
            />
            <input
              className="input flex-1" placeholder="Town (optional)" value={b.city || ''}
              aria-label={`Destination ${i + 1} town`}
              onChange={(e) => { const n = [...rows]; n[i] = { ...n[i], city: e.target.value }; onChange(n) }}
            />
            <button type="button" aria-label="Remove destination" className="btn-ghost !px-3" onClick={() => onChange(rows.filter((_, j) => j !== i))}>
              <Icon name="close" className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      {rows.length < 6 && (
        <button type="button" className="btn-secondary mt-3 !py-2 text-xs" onClick={() => onChange([...rows, { country: '', city: '' }])}>
          Add a destination
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
  const age = ageFromDob(draft.dob)
  const socials = [
    ['Instagram', draft.instagram_url],
    ['TikTok', draft.tiktok_url],
    ['YouTube', draft.youtube_url],
  ].filter(([, v]) => v?.trim())

  return (
    <div className="space-y-5">
      {problems.length > 0 ? (
        <div className="onb-todo">
          <p className="onb-todo-head">
            <Icon name="alert" className="h-4 w-4 shrink-0" />
            {problems.length} thing{problems.length === 1 ? '' : 's'} to finish before this can go
          </p>
          <ul className="mt-2.5 space-y-1">
            {problems.map((p) => (
              <li key={p.text}>
                <button type="button" onClick={() => onJump(p.step)} className="onb-todo-row">
                  <span className="min-w-0 flex-1">{p.text}</span>
                  <span className="onb-todo-fix">Fix<Icon name="chevronRight" className="h-3 w-3" /></span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="onb-ready">
          <Icon name="check" className="h-4 w-4 shrink-0" />
          <span>{pending ? 'All done. Send it whenever you are ready.' : 'All done. Finish and you are in.'}</span>
        </p>
      )}

      {/* THE PROFILE CARD, AS IT WILL LOOK TO EVERYBODY ELSE.
          A list of field values answers "did I fill it in". This answers the
          question people actually have at the end of a sign-up, which is "what
          have I just made" - and it is the reason somebody goes back and
          rewrites a one-line bio that reads badly. */}
      <div className="onb-preview">
        <span className="onb-preview-band" aria-hidden />
        <div className="onb-preview-body">
          {demo || !draft.photo_url
            ? <span className="onb-preview-avatar">
                {draft.name.split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('') || '?'}
              </span>
            : <Avatar src={draft.photo_url} name={draft.name} size="lg" className="!ring-4" />}
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-bold leading-tight">{draft.name || 'Your name'}</p>
            <p className="mt-0.5 line-clamp-2 text-sm text-smoke">{draft.bio || 'Your one-line bio'}</p>
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {[draft.city, draft.country].filter(Boolean).length > 0 && (
                <span className="onb-tag"><Icon name="pin" className="h-3 w-3" />{[draft.city, draft.country].filter(Boolean).join(', ')}</span>
              )}
              {age != null && <span className="onb-tag">{age}</span>}
              {socials.map(([k]) => <span key={k} className="onb-tag">{k}</span>)}
              {draft.countries_visited.length > 0 && (
                <span className="onb-tag"><Icon name="globe" className="h-3 w-3" />{draft.countries_visited.length} visited</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {market.market ? (
        <div className="flex items-center gap-3 rounded-card border border-brand/30 bg-brand-tint/30 px-4 py-3.5">
          <span className="text-xl leading-none" aria-hidden>
            {(market.market.country_codes || []).map(flagFromIso).join('') || '🌍'}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-smoke">You will land in</p>
            <p className="text-sm font-bold text-brand">{market.market.name}</p>
          </div>
          <Icon name="check" className="h-5 w-5 shrink-0 text-brand" />
        </div>
      ) : (
        <div className="rounded-card border border-dashed border-gray-200 px-4 py-3.5 text-xs leading-relaxed text-smoke">
          Worldwide community for now - no market covers {draft.country || 'your country'} yet. You still
          get everything that is open to everyone, and we will tell you the day one opens near you.
        </div>
      )}

      <dl className="divide-y divide-gray-100 rounded-card border border-gray-100 px-4">
        <ReviewRow label="About you" onJump={() => onJump('story')} value={draft.about} multiline />
        <ReviewRow label="Posts on" onJump={() => onJump('socials')} value={socials.map(([k]) => k).join(', ')} />
        <ReviewRow label="Languages" onJump={() => onJump('languages')} value={draft.languages.join(', ')} />
        <ReviewRow label="Countries visited" onJump={() => onJump('map')} value={draft.countries_visited.length ? `${draft.countries_visited.length}` : ''} />
        <ReviewRow label="Phone" onJump={() => onJump('based')} value={contact.phone ? `${contact.phone_country} ${contact.phone}` : ''} hint="Private. Only the team sees this." />
        <ReviewRow label="Favourite quote" onJump={() => onJump('story')} value={draft.favourite_quote} optional />
        <ReviewRow label="Headed next" onJump={() => onJump('extras')} value={(draft.bucket_list || []).filter((b) => b.country).map((b) => [b.city, b.country].filter(Boolean).join(', ')).join(' · ')} optional />
        <ReviewRow label="Other links" onJump={() => onJump('extras')} value={(draft.other_links || []).filter((l) => l.url).length ? `${(draft.other_links || []).filter((l) => l.url).length}` : ''} optional />
      </dl>

      <p className="text-center text-xs leading-relaxed text-smoke">
        {pending
          ? 'Sending this notifies the team. Somebody reads it, and you hear back by email either way.'
          : 'Your profile goes live as soon as you finish. Change any of it later from your profile.'}
      </p>
    </div>
  )
}

function ReviewRow({ label, value, onJump, optional, multiline, hint }) {
  const empty = !value?.trim?.()
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <dt className="w-28 shrink-0 text-xs text-smoke sm:w-32">
        {label}
        {hint && <span className="mt-0.5 block text-[10px] opacity-80">{hint}</span>}
      </dt>
      <dd className="min-w-0 flex-1 text-sm">
        {empty
          ? <span className={cx('text-xs', optional ? 'text-gray-400' : 'font-medium text-brand')}>{optional ? 'Not added' : 'Missing'}</span>
          : <span className={cx('block', multiline ? 'line-clamp-3 leading-relaxed' : 'truncate')}>{value}</span>}
      </dd>
      <button type="button" onClick={onJump} className="onb-edit">Edit</button>
    </div>
  )
}

// The two controls that would write into the signed-in admin's own account,
// drawn as samples. Not interactive on purpose: an upload button that does
// nothing when pressed is worse in a demonstration than an obvious placeholder,
// because the audience spends the next minute wondering if it is broken.
function DemoAvatar({ name }) {
  const initials = String(name || 'A T').split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('')
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="flex h-28 w-28 items-center justify-center rounded-full bg-brand-tint text-3xl font-semibold text-brand ring-2 ring-white">
        {initials}
      </div>
      <p className="text-xs text-smoke">Sample photo. Uploading is switched off in the Testing Centre.</p>
    </div>
  )
}

function DemoGallery() {
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
      <p className="mt-3 text-center text-xs text-smoke">Sample gallery. Uploading is switched off in the Testing Centre.</p>
    </div>
  )
}
