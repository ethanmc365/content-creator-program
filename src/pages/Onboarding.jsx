import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { AvatarUpload, LanguageSelect, SocialInputs, DobField, PhoneInput, QuoteField } from '../components/ProfileFields'
import WorldMap from '../components/WorldMap'
import TravelGallery from '../components/TravelGallery'
import Icon from '../components/Icon'
import { Spinner } from '../components/ui'
import { cx } from '../lib/utils'

// First-login onboarding: a warm, step-by-step profile builder.
// Steps: welcome → photo & basics → socials → country map → languages → how it works.
const STEPS = ['Welcome', 'About you', 'Your socials', 'Travel photos', 'Your map', 'Languages', 'How it works']

export default function Onboarding() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)

  // Local draft of the profile - saved to Supabase when finishing.
  const [draft, setDraft] = useState({
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
  const [contact, setContact] = useState({ phone: '', phone_country: '' })

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))

  // Profile completion meter shown at the top - pure encouragement.
  const completion = [
    draft.photo_url, draft.bio, draft.about,
    draft.instagram_url || draft.tiktok_url || draft.youtube_url,
    draft.countries_visited.length > 0, draft.languages.length > 0,
  ].filter(Boolean).length

  // New creators are 'pending' until an admin approves them, so they cannot
  // post yet and land on the review screen instead of the chat.
  const pending = profile?.status === 'pending'

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
  const STEP_HINTS = {
    1: 'Add a photo and fill in every field (quote is optional) to continue.',
    2: 'Add at least one social link to continue.',
    4: 'Tap at least one country on the map to continue.',
    5: 'Select at least one language to continue.',
  }

  async function finish(sayHello) {
    setBusy(true)
    await Promise.all([
      supabase
        .from('profiles')
        .update({ ...draft, onboarded: true })
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

  return (
    <div className="min-h-screen bg-cloud/50 px-5 py-10 sm:py-16">
      <div className="mx-auto max-w-2xl">
        {/* Logo + progress */}
        <div className="mb-10 flex flex-col items-center gap-6">
          <img src="/brand/tryp-logo.png" alt="Tryp.com" className="h-12 rounded-xl shadow-card" />
          <div className="w-full max-w-sm">
            <div className="mb-2 flex justify-between text-xs font-medium text-smoke">
              <span>Step {step + 1} of {STEPS.length}</span>
              <span>Profile {Math.round((completion / 6) * 100)}% complete</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white shadow-inner">
              <div
                className="h-full rounded-full bg-brand transition-all duration-500"
                style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
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
                <p className="mt-2 text-sm text-smoke">All fields are required (your favourite quote is optional). A photo makes your profile 10x more inviting.</p>
              </div>
              <AvatarUpload photoUrl={draft.photo_url} name={profile?.name} onUploaded={(url) => set({ photo_url: url })} />
              <DobField value={draft.dob} onChange={(dob) => set({ dob })} />
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label htmlFor="city" className="label">City</label>
                  <input id="city" type="text" className="input" value={draft.city} onChange={(e) => set({ city: e.target.value })} placeholder="London" />
                </div>
                <div>
                  <label htmlFor="country" className="label">Country</label>
                  <input id="country" type="text" className="input" value={draft.country} onChange={(e) => set({ country: e.target.value })} placeholder="UK" />
                </div>
              </div>
              <div>
                <label htmlFor="bio" className="label">One-line bio</label>
                <input id="bio" type="text" maxLength={120} className="input" value={draft.bio} onChange={(e) => set({ bio: e.target.value })} placeholder="London based travel creator" />
              </div>
              <div>
                <label htmlFor="about" className="label">About you</label>
                <textarea id="about" rows={4} className="input" value={draft.about} onChange={(e) => set({ about: e.target.value })} placeholder="Introduce yourself, tell other creators about your life, your hobbies, your interests and the type of content you like to create." />
              </div>
              <QuoteField value={draft.favourite_quote} onChange={(favourite_quote) => set({ favourite_quote })} />
              <PhoneInput value={contact} onChange={setContact} />
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
                <p className="mt-2 text-sm text-smoke">Share up to 10 shots from your trips. They bring your profile to life and show off your style.</p>
              </div>
              <TravelGallery creatorId={user.id} editable />
            </div>
          )}

          {/* ---- Step 4: country map ---- */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold">Paint your travel map</h2>
                <p className="mt-2 text-sm text-smoke">Tap every country you've visited and watch it glow Tryp orange on your profile.</p>
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

          {/* ---- Step 6: how it works + hello ---- */}
          {step === 6 && (
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

          {/* Tells the creator what's still needed before they can continue. */}
          {!stepValid(step) && STEP_HINTS[step] && (
            <p className="mt-6 text-center text-sm font-medium text-brand">{STEP_HINTS[step]}</p>
          )}

          {/* ---- Navigation ---- */}
          <div className={cx('mt-6 flex gap-3', step === 0 ? 'justify-center' : 'justify-between')}>
            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)} className="btn-ghost" disabled={busy}>← Back</button>
            )}
            {step < STEPS.length - 1 && (
              <button onClick={() => setStep((s) => s + 1)} disabled={!stepValid(step)} className="btn-primary">
                {step === 0 ? "Let's go" : 'Continue'} →
              </button>
            )}
            {step === STEPS.length - 1 && (
              pending ? (
                <button onClick={() => finish(false)} disabled={busy || !allComplete} className="btn-primary sm:ml-auto">
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
