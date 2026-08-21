import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { isoForCountryName, suggestMarkets } from '../lib/markets'
import { flagFromIso } from '../lib/flags'
import { AvatarUpload, LanguageSelect, SocialInputs, DobField, PhoneInput, QuoteField } from '../components/ProfileFields'
import WorldMap from '../components/WorldMap'
import TravelGallery from '../components/TravelGallery'
import Icon from '../components/Icon'
import TrypPlaneScene from '../components/TrypPlaneScene'
import { geocodeCity } from '../lib/geocode'
import { Spinner } from '../components/ui'
import { cx } from '../lib/utils'

// First-login onboarding: a warm, step-by-step profile builder.
// Steps: welcome → photo & basics → socials → country map → languages → how it works.
export const STEPS = ['Welcome', 'About you', 'Your socials', 'Travel photos', 'Your map', 'Languages', 'Your market', 'How it works']

/**
 * `demo` puts this component in DRY RUN, for the admin Testing Centre.
 *
 * The reason it is a prop on the real component rather than a copy of it: the
 * only onboarding worth showing anybody is the one creators actually get, and a
 * second implementation built for demonstrations starts drifting from the
 * product the day after it is written. So the same JSX runs, prefilled with an
 * invented applicant, with three things swapped out:
 *
 *   - the two steps that would upload a file into the ADMIN'S own account
 *     (the profile photo and the travel gallery) draw a fixed sample instead,
 *   - `finish` writes nothing at all, and
 *   - the step can be driven from outside, so the lab can offer a step picker.
 *
 * demo = { profile, draft, contact, pending, step, onStep, onFinish }
 */
export default function Onboarding({ demo = null }) {
  const auth = useAuth()
  const { user, refreshProfile, signOut } = auth
  const profile = demo?.profile || auth.profile
  const navigate = useNavigate()
  const [innerStep, setInnerStep] = useState(0)
  const step = demo?.step ?? innerStep
  const setStep = demo?.onStep ?? setInnerStep
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('') // shown in orange when Continue is pressed with missing fields

  // Local draft of the profile - saved to Supabase when finishing.
  const [draft, setDraft] = useState(() => demo?.draft || {
    photo_url: profile?.photo_url || '',
    dob: profile?.dob || null,
    city: profile?.city || '',
    country: profile?.country || '',
    bio: profile?.bio || '',
    about: profile?.about || '',
    favourite_quote: profile?.favourite_quote || '',
    instagram_url: profile?.instagram_url || '',
    tiktok_url: profile?.tiktok_url || '',
    youtube_url: profile?.youtube_url || '',
    countries_visited: profile?.countries_visited || [],
    languages: profile?.languages || [],
  })

  // Phone is saved to the private, admin-only creator_private table, not profiles.
  const [contact, setContact] = useState(() => demo?.contact || { phone: '', phone_country: '' })

  // Your market. Everyone lands in the worldwide network automatically (a DB
  // trigger does it at signup), and then picks the market they work in. Those
  // are two different things and the step says so, because a creator who thinks
  // joining Spain means leaving everyone else will not join anything.
  const [suggested, setSuggested] = useState([])
  const [pickedMarket, setPickedMarket] = useState('')
  const isoCode = isoForCountryName(draft.country)

  useEffect(() => {
    let alive = true
    if (!isoCode) { setSuggested([]); setPickedMarket(''); return }
    suggestMarkets(isoCode).then((ms) => {
      if (!alive) return
      setSuggested(ms)
      // Pre-selected, not auto-joined. One market matching their country is the
      // overwhelmingly common case and making them pick it again is friction;
      // silently joining them to something they never saw is worse.
      setPickedMarket((p) => p || (ms.length === 1 ? ms[0].slug : ''))
    })
    return () => { alive = false }
  }, [isoCode])

  // Any edit clears the orange "missing fields" message.
  const set = (patch) => { setError(''); setDraft((d) => ({ ...d, ...patch })) }

  // Progress meter shown at the top. Endowed-progress: it starts at 20% rather
  // than empty (people push on far more when the goal already feels underway),
  // then fills to 100% across the steps.
  const barPct = Math.round(20 + (step / (STEPS.length - 1)) * 80)

  // New creators are 'pending' until an admin approves them, so they cannot
  // post yet and land on the review screen instead of the chat.
  const pending = demo ? !!demo.pending : profile?.status === 'pending'

  // Required-field gating so we never get blank profiles. Travel photos and the
  // favourite quote stay optional; everything else must be filled to continue.
  const hasSocial = !!(draft.instagram_url?.trim() || draft.tiktok_url?.trim() || draft.youtube_url?.trim())
  const stepValid = (s) => {
    if (s === 1) return !!(draft.photo_url && draft.dob && draft.city.trim() && draft.country.trim() &&
      draft.bio.trim() && draft.about.trim() && contact.phone.trim() && contact.phone_country)
    if (s === 2) return hasSocial
    if (s === 4) return draft.countries_visited.length > 0
    if (s === 5) return draft.languages.length > 0
    return true
  }
  const allComplete = stepValid(1) && stepValid(2) && stepValid(4) && stepValid(5)
  const STEP_ERRORS = {
    1: 'Fill in all required boxes and add a profile photo.',
    2: 'Add at least one social media link.',
    4: 'Tap at least one country on your travel map.',
    5: 'Select at least one language.',
  }
  // Continue validates the current step; if incomplete it shows the orange
  // message instead of advancing.
  function next() {
    if (!stepValid(step)) return setError(STEP_ERRORS[step] || 'Please complete this step to continue.')
    setError(''); setStep((s) => s + 1)
  }
  function back() { setError(''); setStep((s) => s - 1) }
  function submit() {
    if (!allComplete) return setError('Please complete every required step before submitting.')
    finish(false)
  }

  async function finish(sayHello) {
    setBusy(true)
    // DRY RUN. Nothing below this line is allowed to run in the Testing Centre:
    // it would write to the signed-in ADMIN'S profile, not to a sandbox row.
    if (demo) {
      setTimeout(() => { setBusy(false); demo.onFinish?.(sayHello) }, 1400)
      return
    }
    // Geocode the town so the new creator shows up on the creator map.
    //
    // country_code is derived here rather than asked for. `country` is free
    // text and always has been, and the ISO-2 is what the market system routes
    // on: without it a new creator can never be offered their market, which is
    // exactly what was happening to everyone who signed up after migration 070
    // backfilled the then-existing rows and nothing kept it current.
    const profileUpdate = { ...draft, onboarded: true, country_code: isoCode }
    if (draft.city?.trim() || draft.country?.trim()) {
      const coords = await geocodeCity(draft.city, draft.country)
      if (coords) { profileUpdate.city_lat = coords.lat; profileUpdate.city_lng = coords.lng }
    }
    await Promise.all([
      supabase
        .from('profiles')
        .update(profileUpdate)
        .eq('id', user.id),
      // Private contact details (admin-only) live in their own table.
      (contact.phone || contact.phone_country)
        ? supabase.from('creator_private').upsert({
            id: user.id,
            phone: contact.phone,
            phone_country: contact.phone_country,
            updated_at: new Date().toISOString(),
          })
        : Promise.resolve(),
    ])

    // The market they picked. AFTER the profile write, deliberately: join_market
    // checks profiles.country_code against the market's countries, and until the
    // update above lands that column is still null, so joining first would be
    // refused for the exact creator it is meant to let in.
    //
    // A failure here is not allowed to block onboarding. Landing in the network
    // with no market is a legal state the whole shell handles; being stuck on a
    // spinner because a market join failed is not.
    if (pickedMarket) {
      const { error: joinErr } = await supabase.rpc('join_market', { p_slug: pickedMarket })
      if (joinErr) console.warn('Could not join market at onboarding:', joinErr.message)
    }

    // Optional friendly hello in #general to break the ice (approved members only).
    if (sayHello && !pending) {
      await supabase.from('messages').insert({
        channel: 'general',
        sender_id: user.id,
        body: `Hey everyone! ${profile?.name || 'A new creator'} here, just joined the program 👋`,
      })
    }

    await refreshProfile()
    // Pending creators get gated to the review screen by ProtectedRoute.
    navigate(sayHello && !pending ? '/chat/general' : '/home')
  }

  // While the profile is saving, take over the screen with the branded plane
  // scene (the same one used offline) instead of a small button spinner.
  if (busy) {
    return (
      <TrypPlaneScene
        title={pending ? 'Your application is on its way' : 'Setting up your profile'}
        subtitle={pending
          ? "It's heading to the Tryp.com Team and will be reviewed shortly. We'll notify you by email soon, so keep an eye on your inbox and check back here shortly."
          : "Fastening your seatbelt. We're getting your creator profile ready for take-off."}
      >
        {/* Pending creators flow straight into the same review-pending screen
            (ProtectedRoute's ReviewPending), which shows this Log out button.
            Render it here too so it's present from the first frame - no button
            popping in a few seconds later once the profile reloads. */}
        {pending && (
          <button
            onClick={async () => { await signOut(); window.location.href = '/' }}
            className="btn-ghost mt-6 text-sm"
          >
            Log out
          </button>
        )}
      </TrypPlaneScene>
    )
  }

  return (
    <div className="min-h-screen bg-cloud/50 px-5 py-10 sm:py-16">
      <div className="mx-auto max-w-2xl">
        {/* Logo + progress */}
        <div className="mb-10 flex flex-col items-center gap-6">
          <img src="/brand/tryp-logo.png" alt="Tryp.com" className="h-12 rounded-xl shadow-card" />
          <div className="w-full max-w-sm">
            <div className="mb-2 flex justify-between text-xs font-medium text-smoke">
              <span>Step {step + 1} of {STEPS.length}</span>
              <span>Profile {barPct}% complete</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white shadow-inner">
              <div
                className="h-full rounded-full bg-brand transition-all duration-500"
                style={{ width: `${barPct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="card animate-fade-up !p-8 sm:!p-12" key={step}>
          {/* ---- Step 0: welcome ---- */}
          {step === 0 && (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-tint text-brand" aria-hidden>
                <Icon name="heart" className="h-8 w-8" />
              </div>
              <h1 className="text-3xl font-bold">Welcome to the crew, {profile?.name?.split(' ')[0] || 'creator'}!</h1>
              <p className="mx-auto max-w-md text-smoke">
                You're now part of the Tryp.com Content Creator Program, a global community of
                travel creators who make great content, compete in challenges, and earn real rewards.
              </p>
              <p className="mx-auto max-w-md text-smoke">
                Let's build your creator profile. It takes about two minutes, and a complete profile
                gets you noticed by other creators (and by us).
              </p>
            </div>
          )}

          {/* ---- Step 1: photo + basics ---- */}
          {step === 1 && (
            <div className="space-y-7">
              <div className="text-center">
                <h2 className="text-2xl font-bold">First, the basics</h2>
              </div>
              <div>
                <p className="label text-center">Profile photo <span className="text-brand">*</span></p>
                {demo
                  ? <DemoAvatar name={profile?.name} />
                  : <AvatarUpload photoUrl={draft.photo_url} name={profile?.name} onUploaded={(url) => set({ photo_url: url })} />}
              </div>
              <DobField value={draft.dob} onChange={(dob) => set({ dob })} required />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="city" className="label">City <span className="text-brand">*</span></label>
                  <input id="city" type="text" className="input" value={draft.city} onChange={(e) => set({ city: e.target.value })} placeholder="London" />
                </div>
                <div>
                  <label htmlFor="country" className="label">Country <span className="text-brand">*</span></label>
                  <input id="country" type="text" className="input" value={draft.country} onChange={(e) => set({ country: e.target.value })} placeholder="UK" />
                </div>
              </div>
              <div>
                <label htmlFor="bio" className="label">One-line bio <span className="text-brand">*</span></label>
                <input id="bio" type="text" maxLength={120} className="input" value={draft.bio} onChange={(e) => set({ bio: e.target.value })} placeholder="London based travel creator" />
              </div>
              <div>
                <label htmlFor="about" className="label">About you <span className="text-brand">*</span></label>
                <textarea id="about" rows={4} className="input" value={draft.about} onChange={(e) => set({ about: e.target.value })} placeholder="Introduce yourself, tell other creators about your life, your hobbies, your interests and the type of content you like to create." />
              </div>
              <QuoteField value={draft.favourite_quote} onChange={(favourite_quote) => set({ favourite_quote })} />
              <PhoneInput value={contact} onChange={(c) => { setError(''); setContact(c) }} required />
            </div>
          )}

          {/* ---- Step 2: socials ---- */}
          {step === 2 && (
            <div className="space-y-7">
              <div className="text-center">
                <h2 className="text-2xl font-bold">Where do you post?</h2>
                <p className="mt-2 text-sm text-smoke">Link your accounts so creators (and the Tryp.com Team) can find your work.</p>
              </div>
              <SocialInputs values={draft} onChange={(v) => set(v)} />
            </div>
          )}

          {/* ---- Step 3: travel photos ---- */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold">Add your travel photos</h2>
                <p className="mt-2 text-sm text-smoke">Optional. Share up to 10 shots from your trips, or just press Continue, you can always add them later from your profile.</p>
              </div>
              {demo ? <DemoGallery /> : <TravelGallery creatorId={user.id} editable />}
            </div>
          )}

          {/* ---- Step 4: country map ---- */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold">Paint your travel map</h2>
                <p className="mt-2 text-sm text-smoke">Tap every country you've visited and watch it glow Tryp.com orange on your profile.</p>
              </div>
              <WorldMap
                selectable
                selected={draft.countries_visited}
                onToggle={(name) =>
                  set({
                    countries_visited: draft.countries_visited.includes(name)
                      ? draft.countries_visited.filter((c) => c !== name)
                      : [...draft.countries_visited, name],
                  })
                }
              />
              <p className="text-center text-sm font-semibold text-brand">
                {draft.countries_visited.length} {draft.countries_visited.length === 1 ? 'country' : 'countries'} and counting
              </p>
            </div>
          )}

          {/* ---- Step 5: languages ---- */}
          {step === 5 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold">Languages you speak</h2>
                <p className="mt-2 text-sm text-smoke">Helps match you with collab partners and audiences.</p>
              </div>
              <LanguageSelect selected={draft.languages} onChange={(languages) => set({ languages })} />
            </div>
          )}

          {/* ---- Step 6: your market ---- */}
          {/* Two memberships, explained as two things. Everyone is in the
              worldwide community from the moment they sign up; a market is the
              place their briefs and challenges come from. Creators who think
              picking Spain means leaving everyone else will pick nothing. */}
          {step === 6 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold">Where do you create?</h2>
                <p className="mx-auto mt-2 max-w-md text-sm text-smoke">
                  You are already part of the worldwide community. A market is where your briefs,
                  challenges and local rooms come from.
                </p>
              </div>

              <div className="flex items-center gap-3 rounded-card border border-brand/25 bg-brand-tint/25 px-4 py-3.5">
                <Icon name="globe" className="h-5 w-5 shrink-0 text-brand" />
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Worldwide community</p>
                  <p className="text-xs text-smoke">
                    Joined. Every creator, every country. Your connections, messages, the map and the games live here.
                  </p>
                </div>
                <Icon name="check" className="ml-auto h-5 w-5 shrink-0 text-brand" />
              </div>

              {suggested.length === 0 ? (
                <div className="rounded-card border border-dashed border-gray-200 px-5 py-8 text-center">
                  <p className="text-sm font-medium">No market covers {draft.country || 'your country'} yet</p>
                  <p className="mx-auto mt-1.5 max-w-sm text-xs text-smoke">
                    That is completely fine. You are in the worldwide community and can enter anything open to
                    everyone. We will let you know the moment a market opens near you.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-center text-xs font-semibold uppercase tracking-wide text-smoke">
                    {suggested.length === 1 ? 'Suggested for you' : 'Pick one'}
                  </p>
                  {suggested.map((m) => (
                    <button
                      key={m.slug} type="button"
                      onClick={() => setPickedMarket(pickedMarket === m.slug ? '' : m.slug)}
                      aria-pressed={pickedMarket === m.slug}
                      className={cx(
                        'flex w-full items-center gap-3 rounded-card border p-4 text-left transition-all duration-200 hover:-translate-y-0.5',
                        pickedMarket === m.slug ? 'border-brand bg-brand-tint/40 shadow-card' : 'border-gray-200 hover:border-brand/40',
                      )}
                    >
                      <span className="shrink-0 text-2xl leading-none" aria-hidden>
                        {(m.country_codes || []).map(flagFromIso).join('')}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{m.name}</span>
                        <span className="block text-xs text-smoke">
                          {m.tagline || `Challenges and rooms for ${m.name}.`}
                        </span>
                      </span>
                      {pickedMarket === m.slug && <Icon name="check" className="h-5 w-5 shrink-0 text-brand" />}
                    </button>
                  ))}
                  <p className="pt-1 text-center text-xs text-smoke">
                    You can change this any time, and you can be in more than one.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* ---- Step 7: how it works + hello ---- */}
          {step === 7 && (
            <div className="space-y-6 text-center">
              <h2 className="text-2xl font-bold">How the program works</h2>
              <div className="grid grid-cols-1 gap-4 text-left sm:grid-cols-3">
                {[
                  { icon: 'flag', title: 'Challenges', text: 'Usually one live challenge at a time. Read the brief, film your video, paste your link before the deadline.' },
                  { icon: 'eye', title: 'Review', text: 'When a challenge closes, the Tryp.com Team reviews every entry and logs the final view counts.' },
                  { icon: 'trophy', title: 'Earn', text: 'Top creators win cash prizes, and there are participation vouchers up for grabs too.' },
                ].map((c) => (
                  <div key={c.title} className="rounded-xl bg-cloud p-5">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-tint text-brand" aria-hidden>
                      <Icon name={c.icon} className="h-5 w-5" />
                    </span>
                    <p className="mt-2 font-semibold">{c.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-smoke">{c.text}</p>
                  </div>
                ))}
              </div>
              <p className="text-smoke">
                {pending
                  ? 'One last thing. Submit your profile and the Tryp.com Team will review your application.'
                  : 'One last thing. Want to say hi to everyone in the chat?'}
              </p>
            </div>
          )}

          {/* Orange message shown when Continue/Submit is pressed with fields missing. */}
          {error && <p className="mt-6 text-center text-sm font-medium text-brand">{error}</p>}

          {/* ---- Navigation ---- */}
          <div className={cx('mt-6 flex gap-3', step === 0 ? 'justify-center' : 'justify-between')}>
            {step > 0 && (
              <button onClick={back} className="btn-ghost" disabled={busy}>← Back</button>
            )}
            {step < STEPS.length - 1 && (
              <button onClick={next} className="btn-primary">
                {step === 0 ? "Let's go" : 'Continue'} →
              </button>
            )}
            {step === STEPS.length - 1 && (
              pending ? (
                <button onClick={submit} disabled={busy} className="btn-primary sm:ml-auto">
                  {busy ? <Spinner /> : 'Submit application →'}
                </button>
              ) : (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <button onClick={() => finish(false)} disabled={busy} className="btn-secondary">Skip for now</button>
                  <button onClick={() => finish(true)} disabled={busy} className="btn-primary">
                    {busy ? <Spinner /> : 'Say hello in chat'}
                  </button>
                </div>
              )
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// The two controls that would write into the signed-in admin's own account,
// drawn as samples. They are not interactive on purpose: an upload button that
// does nothing when pressed is worse in a demonstration than an obvious
// placeholder, because the audience spends the next minute wondering whether it
// is broken.
function DemoAvatar({ name }) {
  const initials = String(name || 'A R').split(' ').map((w) => w[0]).filter(Boolean).slice(0, 2).join('')
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
  const shots = ['Lisbon, rooftop', 'Tromsø, blue hour', 'Seville, morning', 'Dolomites, day two', 'Marrakech, souk', 'Skye, the long road']
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
