import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { isoForCountryName, loadMarkets, resolveMarket } from '../lib/markets'
import { AvatarUpload, CountrySelect, LanguageSelect, SocialInputs, DobField, PhoneInput, QuoteField } from '../components/ProfileFields'
import WorldMap from '../components/WorldMap'
import PhotoBoard from '../components/PhotoBoard'
import AutoTextarea from '../components/AutoTextarea'
import SubmittedCard from '../components/SubmittedCard'
import { geocodeCity, tidyPlace } from '../lib/geocode'
import { Spinner } from '../components/ui'
import { cx, ageFromDob, MIN_AGE } from '../lib/utils'
import { useDemoMode, postDemoState, useDemoMessages } from '../lib/demoMode'
import { useT, usePlural, getLocale } from '../lib/i18n'
import { clearVipCache } from '../lib/vip'
import CitySuggestion from '../components/CitySuggestion'
import { vipApi } from '../api/vip'
import { moneyApi } from '../api/money'
import { profilesApi } from '../api/profiles'
import { chatApi } from '../api/chat'
import { marketsApi } from '../api/markets'
import { teamApi } from '../api/team'
import { StepFrame } from './OnboardingStepFrame'
import { stepsFor, EMPTY, DEMO_DRAFT, draftColumns, draftProblems, browserTimezone, Req, VipMarketCard, DemoAvatar, DemoGallery, tooYoungNotice } from './OnboardingParts'
import { Progress } from './OnboardingProgress'
import { StepHead } from './OnboardingStepHead'
import { Welcome } from './OnboardingWelcome'
import { MarketCard } from './OnboardingMarketCard'
import { OtherLinks } from './OnboardingOtherLinks'
import { BucketList } from './OnboardingBucketList'
import { Review } from './OnboardingReview'
import OnboardingCall from './OnboardingCall'

export default function Onboarding() {
  const tr = useT()
  const plural = usePlural()
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
    // `?country=ES` walks the demo as an applicant from that country, so the team can see a market's own steps (the
    // Spanish onboarding call) from Applications > Sign-up.
    if (demo) {
      const cc = (params.get('country') || '').toUpperCase()
      const base = prefilled ? { ...DEMO_DRAFT } : { ...EMPTY, name: 'Alex Test' }
      return cc ? { ...base, country_code: cc, country: new Intl.DisplayNames(['en'], { type: 'region' }).of(cc) || cc } : base
    }
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

  // THE DRAFT IS SEEDED ONCE AND THE PROFILE USUALLY ARRIVES AFTER IT.
  //
  // THE BUG THIS FIXES.
  //
  // Two separate faults, and they compound into exactly that screen.
  //
  //   THE RACE. `draft` is a LAZY useState initialiser, so it runs on the very
  //   first render and never again. Arriving at /onboarding by opening the tab
  //   - rather than by walking here from /signup - means `auth.profile` is
  //   still null at that moment, because the profile fetch has not resolved.
  //   Every field is seeded EMPTY, the profile lands a tick later, and nothing
  //   re-reads it. The row in the database is complete; the form has simply
  //   never looked at it.
  //
  //   THE DATE OF BIRTH, which is null on `profiles` FOR EVERYONE, BY DESIGN.
  //   A BEFORE trigger (`mirror_dob_to_private`) copies any dob into
  //   `creator_private.dob`, derives `profiles.age`, and then sets
  //   `new.dob:= null` so the public row never carries a full date of birth.
  //   So seeding `dob` from `auth.profile.dob` reads null on a finished profile
  //   and `draftProblems` reports "Add your date of birth" for ever. This is
  //   the third time this trigger has done this - it cost EditProfile three
  //   sessions - and the phone number was never read back at all.
  //
  // IT MERGES, IT DOES NOT OVERWRITE. Only fields that are still empty in the
  // draft are filled, so the effect cannot take back something typed in the
  // few hundred milliseconds before the profile landed. `hydrated` makes it
  // run once whatever else re-renders.
  //
  // `hydratedDone` IS A SECOND FLAG AND IT IS NOT REDUNDANT. `hydrated` is set BEFORE the await, because its job is to
  // stop the effect running twice. `hydratedDone` is set AFTER the row has landed, because the autosave added today
  // needs a different question answered: "has this form finished reading what was already saved". Writing the draft to
  // the profile in the gap between those two would blank a returning applicant's name and bio with the empty strings the
  // form was still holding. One flag cannot mean both things.
  const hydrated = useRef(false)
  const hydratedDone = useRef(false)
  useEffect(() => {
    if (demo || hydrated.current || !auth.profile || !user?.id) return undefined
    hydrated.current = true
    let alive = true
    const p = auth.profile
    const keepEmpty = (cur, next) => {
      if (next == null || next === '') return cur
      if (Array.isArray(cur)) return cur.length ? cur : next
      return (cur === '' || cur == null) ? next : cur
    }
    // AN UNHANDLED REJECTION ON THIS PAGE IS A CRASH REPORT NOBODY CAN READ.
    // A dropped connection mid-onboarding rejects this, and with no `.catch()`
    // it surfaced as an "unhandled rejection" with a minified message and no
    // indication of where it came from. The draft is prefilled from
    // `auth.profile` either way, so a failed read here costs a date of birth
    // being re-typed, not the signup.
    //
    // AND `.catch` IS NOT A METHOD ON A SUPABASE QUERY. THIS TOOK SIGNUP DOWN.
    //
    // A PostgrestBuilder is a THENABLE, not a Promise: it implements `then` and
    // NOTHING ELSE - no `catch`, no `finally`. So the guard added above read
    // `undefined(...)` and threw `catch is not a function` SYNCHRONOUSLY, inside
    // this effect, on the first render of /onboarding for every real signup. The
    // thing written to stop an unreadable crash report was itself the crash, and
    // it was total: nobody who created an account on d626c37 could get past the
    // first screen. Found in the error panel (6 hits, 2 people) after a German
    // creator reported "an error has occurred".
    //
    // `Promise.resolve` adopts the thenable and hands back a real promise, which
    // is the only thing that makes `.catch` exist. THE RULE, because this will
    // be reached for again: never call `.catch`, `.finally` or anything else
    // off `Promise.prototype` directly on a supabase query. `await` it inside a
    // try, pass a second argument to `.then`, or wrap it like this.
    // `src/lib/supabaseThenable.test.js` fails the build if the pattern returns.
    Promise.resolve(
      moneyApi.creatorPrivate().select('dob, phone, phone_country').eq('id', user.id).maybeSingle(),
    )
      .catch(() => ({ data: null }))
      .then(({ data: priv }) => {
        if (!alive) return
        setDraft((d) => ({
          ...d,
          name: keepEmpty(d.name, p.name),
          photo_url: keepEmpty(d.photo_url, p.photo_url),
          // `profiles.dob` is always null - see above. The private row is the
          // only place a date of birth exists.
          dob: d.dob || priv?.dob || null,
          city: keepEmpty(d.city, p.city),
          country: keepEmpty(d.country, p.country),
          country_code: keepEmpty(d.country_code, p.country_code || isoForCountryName(p.country)),
          bio: keepEmpty(d.bio, p.bio),
          about: keepEmpty(d.about, p.about),
          favourite_quote: keepEmpty(d.favourite_quote, p.favourite_quote),
          instagram_url: keepEmpty(d.instagram_url, p.instagram_url),
          tiktok_url: keepEmpty(d.tiktok_url, p.tiktok_url),
          youtube_url: keepEmpty(d.youtube_url, p.youtube_url),
          facebook_url: keepEmpty(d.facebook_url, p.facebook_url),
          other_links: keepEmpty(d.other_links, Array.isArray(p.other_links) ? p.other_links : null),
          languages: keepEmpty(d.languages, p.languages),
          countries_visited: keepEmpty(d.countries_visited, p.countries_visited),
          bucket_list: keepEmpty(d.bucket_list, Array.isArray(p.bucket_list) ? p.bucket_list : null),
        }))
        setContact((c) => ({
          phone: c.phone || priv?.phone || '',
          phone_country: c.phone_country || priv?.phone_country || '',
        }))
        hydratedDone.current = true
      })
    return () => { alive = false }
  }, [auth.profile, user?.id, demo])

  // THE MARKETS, LOADED ONCE AND EARLY. The resolution has to be instant when
  // somebody picks their country on step three - a spinner where the answer
  // goes turns a confident statement into a question.
  const [markets, setMarkets] = useState(null)
  useEffect(() => {
    let alive = true
    // Same reason as the read above: rejecting here left an unreadable report.
    // `[]` is the honest fallback - it resolves to worldwide-only, which is what
    // an unknown country should give anyway.
    loadMarkets()
      .then((m) => { if (alive) setMarkets(m || []) })
      .catch(() => { if (alive) setMarkets([]) })
    return () => { alive = false }
  }, [])
  // AN EMPTY STATE IS A CLAIM AND IT NEEDS THE DATA FIRST. `markets` starts as
  // null rather than [], because [] and "not loaded yet" resolve to the same
  // answer - worldwide only - and for a creator in London that answer is wrong
  // for as long as the query takes. Saying "no market covers the United
  // Kingdom" and then changing its mind is worse than saying nothing.
  const marketsReady = markets !== null

  const market = useMemo(() => resolveMarket(draft.country_code, markets || []), [draft.country_code, markets])

  // THE EXAMPLE TOWN IS A TOWN IN THEIR COUNTRY.
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
  // IS THIS SOMEBODY APPLYING TO THE TEAM? Two sources, because the answer has
  // to survive a refresh: the profile once the claim has landed, and the token
  // the signup page put aside before there was a session to claim it with.
  const [teamApplication, setTeamApplication] = useState(() => {
    try { return !!localStorage.getItem('tryp_team_invite') } catch { return false }
  })
  useEffect(() => {
    if (auth.profile?.team_application) setTeamApplication(true)
  }, [auth.profile?.team_application])

  // CLAIM IT ONCE THERE IS A SESSION. `claim_team_invite` runs as the caller and
  // can only touch their own row, so there is no id to get wrong. The token is
  // dropped whatever the answer: a second attempt with a dead token would only
  // ever fail again.
  useEffect(() => {
    if (!user?.id) return
    let token = null
    try { token = localStorage.getItem('tryp_team_invite') } catch { /* private mode */ }
    if (!token) return
    teamApi.claimTeamInvite({ p_token: token }).then(({ data }) => {
      if (data === true) { setTeamApplication(true); refreshProfile?.() }
      try { localStorage.removeItem('tryp_team_invite') } catch { /* nothing to do */ }
    })
  }, [user?.id, refreshProfile])

  // A VIP SIGN-UP. The same nine screens and the same profile - the team reads the same application - but the link they
  // came through makes them a VIP as they finish, and the welcome says so. Same two sources as the team invite: the
  // profile once the claim has landed, the token put aside by the sign-up page before there was a session.
  const [vipApplication, setVipApplication] = useState(() => {
    try { return !!localStorage.getItem('tryp_vip_invite') } catch { return false }
  })
  useEffect(() => { if (auth.profile?.is_vip) setVipApplication(true) }, [auth.profile?.is_vip])
  useEffect(() => {
    if (!user?.id || demo || !auth.profile) return
    let token = null
    try { token = localStorage.getItem('tryp_vip_invite') } catch { /* private mode */ }
    if (!token) return
    // An account that finished its profile long ago is not signing up: a token left on the device is not theirs to spend.
    if (auth.profile.onboarded) { try { localStorage.removeItem('tryp_vip_invite') } catch { /* nothing to do */ } return }
    vipApi.claimVipInvite({ p_token: token }).then(({ data }) => {
      if (data === true) { setVipApplication(true); clearVipCache(); refreshProfile?.() }
      try { localStorage.removeItem('tryp_vip_invite') } catch { /* nothing to do */ }
    })
  }, [user?.id, refreshProfile, demo, auth.profile])

  // THE VIP MARKET, NOT THE COMMUNITY ONE. The team signed up on the VIP link, picked their country and was told "your
  // market is UK & Ireland". A VIP's market is the VIP programme that covers their country (or the default one): that is
  // what the screen says, and what they are put in when they finish (vip_settle_home, migration 307).
  const [vipHome, setVipHome] = useState(null)
  useEffect(() => {
    if (!vipApplication || demo) return undefined
    let alive = true
    vipApi.homeFor({ p_country_code: draft.country_code || null })
      .then(({ data }) => { if (alive) setVipHome(data || null) })
    return () => { alive = false }
  }, [vipApplication, demo, draft.country_code])

  // THE MARKET'S ONBOARDING CALL (migration 413). Spain switches it on: a new Spanish creator books 15 minutes with
  // Marta before review. Never for the team, a VIP sign-up, or somebody already in.
  const [signupCalls, setSignupCalls] = useState([])
  useEffect(() => {
    let alive = true
    marketsApi.signupCalls().then(({ data }) => { if (alive) setSignupCalls(data || []) })
    return () => { alive = false }
  }, [])
  const call = (!teamApplication && !vipApplication && pending && market.market)
    ? signupCalls.find((c) => c.community_id === market.market.id) || null
    : null
  const [callOpened, setCallOpened] = useState(() => !!auth.profile?.onboarding_call_opened_at)
  const [callBooked, setCallBooked] = useState(() => !demo && !!auth.profile?.onboarding_call_booked_at)
  const markCall = (state) => { if (!demo) marketsApi.onboardingCallMark({ p_state: state }) }

  const steps = useMemo(() => {
    const list = stepsFor(teamApplication)
    if (!call) return list
    const at = list.findIndex((st) => st.key === 'review')
    return [...list.slice(0, at), { key: 'call', title: 'Onboarding call', part: 'Finish', need: true }, ...list.slice(at)]
  }, [teamApplication, call])
  const problems = [
    ...draftProblems(draft, contact, { team: teamApplication }),
    ...(call && !callBooked ? [{ step: 'call', text: 'Book your onboarding call' }] : []),
  ]
  const problemsFor = (key) => problems.filter((p) => p.step === key)
  const complete = problems.length === 0

  // Endowed progress: the bar starts at 15 rather than empty, because a goal
  // that already looks underway is one people finish far more often than one
  // that starts at nothing. It reaches 100 on the review screen.
  const barPct = Math.round(15 + (step / (steps.length - 1)) * 85)
  const current = steps[step]

  // --------------------------------------------------------------- demo ----
  // Inside the Testing Centre this runs in a same-origin iframe, so the lab
  // outside it can show a step jumper and, more usefully, the market this
  // applicant would actually be assigned to as it changes. See lib/demoMode.
  useEffect(() => {
    if (!demo) return
    postDemoState({
      type: 'onboarding-state',
      step,
      total: steps.length,
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
  }, [demo, step, steps.length, current, problems.length, complete, done, market, draft.name, draft.city, draft.country, draft.country_code])

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
      const to = Math.max(0, Math.min(steps.length - 1, msg.step))
      setDir(to < stepRef.current ? 'back' : 'fwd')
      setStep(to)
      setDone(false)
    }
    if (msg.type === 'reset') { setStep(0); setDone(false); setError('') }
  }, [steps.length])
  useDemoMessages(onCommand, { enabled: demo })

  // ------------------------------------------------------------ movement ----
  // THE ANSWERS ARE ON THE PROFILE ROW, AND UNTIL TODAY THEY WERE NOT.
  //
  // That was already what the screen CLAIMED. The old header said "your answers
  // are saved as you go" and the comment beside its exit link said "nothing is
  // lost by leaving: the answers are on the profile row from the moment each
  // step saves". Neither was true. Onboarding held everything in React state
  // and wrote ONCE, in `finish`, at the very end - so leaving on step six threw
  // away six screens of typing, and the only thing that actually survived was
  // the profile photo, because uploading it is a write in its own right. The
  // sentence had been on screen for a fortnight promising something the code
  // did not do.
  //
  // So it does it now. On every step change the draft goes to the profile row
  // (and the phone to `creator_private`, which is the only place it may live).
  // Coming back - same browser or a new one, any device, as long as it is the
  // same account - re-reads it through the hydration effect above, which was
  // already written and was only ever finding an empty row.
  //
  // WHY THIS DOES NOT LET ANYONE IN EARLY. `draftColumns` cannot write
  // `onboarded`, so ProtectedRoute keeps sending a half-finished applicant
  // straight back here. The row is fuller; the gate is untouched.
  //
  // FAILURES ARE SWALLOWED, ON PURPOSE, and this is the one place in the file
  // where that is right. A background save has no screen to fail on and nothing
  // depends on it having worked: `finish` writes the same columns again at the
  // end and CHECKS that write loudly (see the note there - an unchecked save is
  // how a fortnight of applications was lost). A red line about a save the
  // person never asked for, over data still safe in front of them, would be
  // noise about a non-event.
  const saveDraft = useCallback(async () => {
    if (demo || !user?.id) return
    // NEVER BEFORE THE FORM HAS READ WHAT IS ALREADY THERE. See `hydratedDone`
    // above: between mount and the profile landing, `draft` is a set of empty
    // strings, and saving those would overwrite a returning applicant's answers
    // with nothing - turning the feature that exists to protect their typing
    // into the one that destroys it.
    if (!hydratedDone.current) return
    await Promise.all([
      profilesApi.profiles().update(draftColumns(draft)).eq('id', user.id),
      (contact.phone || contact.phone_country)
        ? moneyApi.creatorPrivate().upsert({
            id: user.id,
            phone: contact.phone,
            phone_country: contact.phone_country,
            updated_at: new Date().toISOString(),
          })
        : Promise.resolve({}),
    ]).catch((e) => console.warn('Onboarding autosave failed:', e?.message || e))
  }, [demo, user?.id, draft, contact])

  // The step is what triggers it: a save per keystroke is a write per keystroke,
  // and a save per screen is exactly one write for exactly the moment somebody
  // might walk away. `savedStep` makes it fire on CHANGES only, so arriving on
  // the welcome screen does not write an empty row over a returning applicant's
  // answers before the hydration effect has finished reading them.
  const savedStep = useRef(step)
  useEffect(() => {
    if (savedStep.current === step) return
    savedStep.current = step
    saveDraft()
  }, [step, saveDraft])

  function next() {
    const mine = problemsFor(current.key)
    if (mine.length) { setError(mine.map((m) => tr(m.text, m.vars)).join(' · ')); return }
    setError(''); setDir('fwd')
    setStep((s) => Math.min(steps.length - 1, s + 1))
  }
  function back() { setError(''); setDir('back'); setStep((s) => Math.max(0, s - 1)) }

  // LEAVING IS A SAVE, AND THEN IT IS A SIGN-OUT.
  //
  // Order matters and it is the whole of this function: the save has to finish
  // BEFORE the session is torn down, or the write goes out with no auth and RLS
  // refuses it - which would make the one gesture that is supposed to protect
  // somebody's answers the one that loses them.
  //
  // `window.location.href` rather than `navigate`, deliberately: signing out
  // leaves a React tree holding a user that no longer exists, and a full
  // document load is the only way to be sure nothing in it re-reads the dead
  // session on the way past. The old Log out button did the same.
  const [leaving, setLeaving] = useState(false)
  async function leave() {
    if (leaving) return
    setLeaving(true)
    if (demo) { window.location.href = '/'; return }
    await saveDraft()
    await signOut()
    window.location.href = '/'
  }
  function goTo(key) {
    const to = steps.findIndex((s) => s.key === key)
    setError(''); setDir(to < step ? 'back' : 'fwd'); setStep(to)
  }

  async function finish(sayHello) {
    if (!complete) { setError(tr('There are still a few things to fill in.')); setStep(steps.findIndex((s) => s.key === 'review')); return }
    // THE LAST GATE BEFORE THE WRITE, AND IT SAYS SO IN WORDS.
    //
    // `problemsFor` already blocks the date-of-birth step, so reaching here means the date was changed afterwards or the
    // flow was re-entered - and this is the one refusal on the form that is not "you missed something", it is "you
    // cannot join yet". That deserves a dialog and a reason rather than a red line under a field, which is exactly what
    // the team asked for.
    const age = ageFromDob(draft.dob)
    if (age != null && age < MIN_AGE) {
      setStep(steps.findIndex((s) => s.key === 'based'))
      await tooYoungNotice(tr)
      return
    }
    setBusy(true)

    // DRY RUN. Nothing below this line may run in the Testing Centre: it would
    // write to the signed-in ADMIN'S own profile, not to a sandbox row.
    if (demo) {
      setTimeout(() => { setBusy(false); setDone(true) }, 1500)
      return
    }

    const update = {
      ...draftColumns(draft),
      onboarded: true,
      // The language they filled this in in, so the account opens in it on every device.
      locale: getLocale(),
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
    // LOST FOR A FORTNIGHT.
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
      profilesApi.profiles().update(update).eq('id', user.id),
      (contact.phone || contact.phone_country)
        ? moneyApi.creatorPrivate().upsert({
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
      setStep(steps.findIndex((s) => s.key === 'review'))
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
    if (vipApplication) {
      // A VIP joins their VIP market, never a community market by country.
      const { error: vipErr } = await vipApi.settleHome()
      if (vipErr) console.warn('Could not settle the VIP market at onboarding:', vipErr.message)
      clearVipCache()
    } else if (market.market?.slug) {
      const { error: joinErr } = await marketsApi.joinMarket({ p_slug: market.market.slug })
      if (joinErr) console.warn('Could not join market at onboarding:', joinErr.message)
    }

    if (sayHello && !pending) {
      await chatApi.messages().insert({
        channel: 'general',
        sender_id: user.id,
        body: `Hey everyone! ${draft.name || 'A new creator'} here, just joined the community 👋`,
      })
    }

    await refreshProfile()
    navigate(sayHello && !pending ? '/chat/general' : '/home')
  }

  // ---------------------------------------------------------------- views ---
  // ONE SCREEN AFTER SUBMIT, NOT TWO.
  //
  // They were watching a handover nobody had looked at end to end. This page drew a flying-plane scene while the save
  // was in flight; the save finished, `refreshProfile` ran, the router sent them to /home, and ProtectedRoute drew ITS
  // pending screen - which was a second flying-plane scene with almost the same sentence on it. Two full-screen
  // animations for one action, with a navigation between them.
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
        {/* THE HEADER ROW IS GONE, AND THE LOGO ABOVE THE BAR IS THE EXIT.

            Three controls, two of which said the same thing. A 32px logo beside
            "Back to Tryp.com", a sentence promising an autosave that did not
            exist, and a Log out pill - stacked over a screen that ALREADY has
            the full-size brand mark centred directly above the progress bar.
            Everything the row did is now that mark: it saves, it signs out, and
            it lands on the page you log in or sign up from, which is what "back
            to Tryp.com" and "log out" both meant here anyway.

            The way out is still guaranteed - the reason it was added on 7 Sep
            stands, and is worth keeping written down. Onboarding renders
            INSTEAD of AppLayout, so there is no header, no tab bar and no
            account menu; and the route guard sends anyone who is not onboarded
            straight back here, so the browser's own Back button lands on the
            same screen. Without this control the only exit is closing the tab.

            And now leaving really is safe rather than nominally safe: `leave`
            writes the draft before it drops the session. See `saveDraft`. */}
        <Progress step={step} total={steps.length} barPct={barPct} current={current} onLeave={leave} leaving={leaving} userId={demo ? null : user?.id} />

        {/* THE CARD DOES NOT REMOUNT AND ITS HEIGHT IS ANIMATED. Two things were juddering and only one of them was the
            slide. The `key` was on the CARD, so every step tore down and rebuilt the white box itself - border, shadow
            and all - and the card's HEIGHT then snapped from one step's to the next's in a single frame while the
            content was still sliding in. A 300px jump under a 320ms slide is the judder. `StepFrame` keeps one card,
            measures the step inside it and transitions between the two heights on the same curve, so the box grows into
            the new screen while the new screen arrives. */}
        <div className="card !p-6 sm:!p-10">
          <StepFrame stepKey={current.key} dir={dir}>
            <StepHead step={current} pending={pending} team={teamApplication} />

            {current.key === 'welcome' && (
              <Welcome name={draft.name} pending={pending} vip={vipApplication} />
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

                {vipApplication
                  ? <VipMarketCard home={vipHome} country={draft.country} />
                  : <MarketCard market={market} country={draft.country} ready={marketsReady} />}

                <div>
                  <label htmlFor="city" className="label">{tr("Town or city")} <Req /></label>
                  <input
                    id="city" type="text" className="input" value={draft.city}
                    onChange={(e) => set({ city: e.target.value })}
                    onBlur={() => draft.city !== tidyPlace(draft.city) && set({ city: tidyPlace(draft.city) })}
                    placeholder={townHint || tr('Your town or city')}
                  />
                  <CitySuggestion city={draft.city} country={draft.country} onUse={(s) => set({ city: s.city })} />
                  <p className="mt-1 text-xs text-smoke">
                    {tr("Puts you on the creator map and gives other creators your real local time.")}
                  </p>
                </div>

                <DobField
                  value={draft.dob}
                  // 12 Oct 2026: the moment a whole date makes them under 18, say so in a pop-up - not only a red line
                  // under the field and a blocked Next.
                  onChange={(dob) => { set({ dob }); const a = ageFromDob(dob); if (a != null && a < MIN_AGE) tooYoungNotice(tr) }}
                  required
                />
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
                  {/* AN <input> HID THE END OF THE SENTENCE. A single-line input scrolls HORIZONTALLY, so on a 375px
                      screen a 120-character bio is legible about forty characters at a time and there is no way to see
                      the whole of what you wrote before submitting it. It wraps now. It is still ONE line of bio -
                      newlines are stripped on the way in, because the field's whole promise is that it fits under a name
                      everywhere - it is simply allowed to occupy two rows on screen while you write it. */}
                  <AutoTextarea
                    id="bio" maxLength={120} minRows={2} className="input leading-relaxed" value={draft.bio}
                    onChange={(e) => set({ bio: e.target.value.replace(/[\r\n]+/g, ' ') })}
                    placeholder={tr("London based travel creator")}
                  />
                  <p className="mt-1 text-xs text-smoke">{tr('{n} characters left. This sits under your name everywhere.', { n: 120 - draft.bio.length })}</p>
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
                  {plural(draft.countries_visited.length, "{n} country and counting", "{n} countries and counting")}
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
                {!teamApplication && <BucketList rows={draft.bucket_list} onChange={(bucket_list) => set({ bucket_list })} />}
              </div>
            )}

            {current.key === 'call' && call && (
              <OnboardingCall
                call={call}
                opened={callOpened}
                booked={callBooked}
                onOpen={() => { setCallOpened(true); markCall('opened') }}
                onBooked={(yes) => { setError(''); setCallBooked(yes); markCall(yes ? 'booked' : 'unbooked') }}
              />
            )}

            {current.key === 'review' && (
              <Review
                draft={draft} contact={contact} market={market} problems={problems} vipHome={vipApplication ? vipHome : null}
                pending={pending} onJump={goTo} demo={demo}
              />
            )}

            {error && (
              <p role="alert" className="mt-6 rounded-xl bg-cloud/70 px-4 py-3 text-center text-sm font-medium text-brand">
                {error}
              </p>
            )}

            <div className={cx('mt-8 flex flex-wrap gap-3', step === 0 ? 'justify-center' : 'justify-between')}>
              {step > 0 && <button onClick={back} className="btn-ghost">← {tr("Back")}</button>}
              {step < steps.length - 1 && (
                <button onClick={next} className="btn-primary">
                  {step === 0 ? tr("Let's go") : tr("Continue")} →
                </button>
              )}
              {step === steps.length - 1 && (
                pending ? (
                  <button onClick={() => finish(false)} disabled={!complete} className="btn-primary disabled:opacity-40 sm:ml-auto">
                    {busy ? <Spinner /> : `${tr("Submit application")} →`}
                  </button>
                ) : (
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <button onClick={() => finish(false)} disabled={!complete} className="btn-secondary disabled:opacity-40">{tr("Skip for now")}</button>
                    <button onClick={() => finish(true)} disabled={!complete} className="btn-primary disabled:opacity-40">{tr("Say hello in chat")}</button>
                  </div>
                )
              )}
            </div>
          </StepFrame>
        </div>

        {step > 0 && step < steps.length - 1 && (
          <p className="mt-5 text-center text-xs text-smoke">
            {problems.length === 0
              ? tr("Everything required is filled in. You can jump to the end from here.")
              : plural(problems.length, "{n} thing still to fill in.", "{n} things still to fill in.")}
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

export { STEPS, stepsFor, draftProblems, tooYoungNotice } from './OnboardingParts'
