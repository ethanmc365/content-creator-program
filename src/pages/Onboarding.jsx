import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { AvatarUpload, LanguageSelect, SocialInputs } from '../components/ProfileFields'
import WorldMap from '../components/WorldMap'
import { Spinner } from '../components/ui'
import { cx } from '../lib/utils'

// First-login onboarding: a warm, step-by-step profile builder.
// Steps: welcome → photo & basics → socials → country map → languages → how it works.
const STEPS = ['Welcome', 'About you', 'Your socials', 'Your map', 'Languages', 'How it works']

export default function Onboarding() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)

  // Local draft of the profile — saved to Supabase when finishing.
  const [draft, setDraft] = useState({
    photo_url: profile?.photo_url || '',
    age: profile?.age || '',
    city: profile?.city || '',
    country: profile?.country || '',
    bio: profile?.bio || '',
    about: profile?.about || '',
    instagram_url: profile?.instagram_url || '',
    tiktok_url: profile?.tiktok_url || '',
    youtube_url: profile?.youtube_url || '',
    countries_visited: profile?.countries_visited || [],
    languages: profile?.languages || [],
  })

  const set = (patch) => setDraft((d) => ({ ...d, ...patch }))

  // Profile completion meter shown at the top — pure encouragement.
  const completion = [
    draft.photo_url, draft.bio, draft.about,
    draft.instagram_url || draft.tiktok_url || draft.youtube_url,
    draft.countries_visited.length > 0, draft.languages.length > 0,
  ].filter(Boolean).length

  async function finish(sayHello) {
    setBusy(true)
    await supabase
      .from('profiles')
      .update({
        ...draft,
        age: draft.age ? Number(draft.age) : null,
        onboarded: true,
      })
      .eq('id', user.id)

    // Optional friendly hello in #general to break the ice.
    if (sayHello) {
      await supabase.from('messages').insert({
        channel: 'general',
        sender_id: user.id,
        body: `Hey everyone! ${profile?.name || 'A new creator'} here, just joined the program 👋`,
      })
    }

    await refreshProfile()
    navigate(sayHello ? '/chat/general' : '/home')
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
              <p className="text-5xl" aria-hidden>🧡</p>
              <h1 className="text-3xl font-bold">Welcome to the crew, {profile?.name?.split(' ')[0] || 'creator'}!</h1>
              <p className="mx-auto max-w-md text-smoke">
                You're now part of the Tryp.com Content Creator Program, a global community of
                travel creators who make great content, compete in challenges, and earn real rewards.
              </p>
              <p className="mx-auto max-w-md text-smoke">
                Let's build your creator profile. It takes about two minutes, and a complete profile
                gets you noticed by other creators (and by us 👀).
              </p>
            </div>
          )}

          {/* ---- Step 1: photo + basics ---- */}
          {step === 1 && (
            <div className="space-y-7">
              <div className="text-center">
                <h2 className="text-2xl font-bold">First, the basics</h2>
                <p className="mt-2 text-sm text-smoke">A photo makes your profile 10x more inviting.</p>
              </div>
              <AvatarUpload photoUrl={draft.photo_url} name={profile?.name} onUploaded={(url) => set({ photo_url: url })} />
              <div className="grid gap-4 sm:grid-cols-3">
                <div>
                  <label htmlFor="age" className="label">Age</label>
                  <input id="age" type="number" min="16" max="100" className="input" value={draft.age} onChange={(e) => set({ age: e.target.value })} placeholder="24" />
                </div>
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
                <input id="bio" type="text" maxLength={120} className="input" value={draft.bio} onChange={(e) => set({ bio: e.target.value })} placeholder="e.g. London-based travel storyteller ✈️" />
              </div>
              <div>
                <label htmlFor="about" className="label">About you</label>
                <textarea id="about" rows={4} className="input" value={draft.about} onChange={(e) => set({ about: e.target.value })} placeholder="Tell other creators about your style, your niche, and what collabs you're up for…" />
              </div>
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

          {/* ---- Step 3: country map ---- */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold">Paint your travel map 🌍</h2>
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

          {/* ---- Step 4: languages ---- */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="text-center">
                <h2 className="text-2xl font-bold">Languages you speak</h2>
                <p className="mt-2 text-sm text-smoke">Helps match you with collab partners and audiences.</p>
              </div>
              <LanguageSelect selected={draft.languages} onChange={(languages) => set({ languages })} />
            </div>
          )}

          {/* ---- Step 5: how it works + hello ---- */}
          {step === 5 && (
            <div className="space-y-6 text-center">
              <h2 className="text-2xl font-bold">How the program works</h2>
              <div className="grid gap-4 text-left sm:grid-cols-3">
                {[
                  { emoji: '🏁', title: 'Challenges', text: 'Usually one live challenge at a time. Read the brief, film your video, paste your link before the deadline.' },
                  { emoji: '👀', title: 'Review', text: 'When a challenge closes, the Tryp.com Team reviews every entry and logs the final view counts.' },
                  { emoji: '🏆', title: 'Earn', text: 'Top creators win cash, every valid entry earns vouchers, and winners hit the Wall of Fame.' },
                ].map((c) => (
                  <div key={c.title} className="rounded-xl bg-cloud p-5">
                    <p className="text-2xl" aria-hidden>{c.emoji}</p>
                    <p className="mt-2 font-semibold">{c.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-smoke">{c.text}</p>
                  </div>
                ))}
              </div>
              <p className="text-smoke">One last thing. Want to say hi to everyone in the chat?</p>
            </div>
          )}

          {/* ---- Navigation ---- */}
          <div className={cx('mt-10 flex gap-3', step === 0 ? 'justify-center' : 'justify-between')}>
            {step > 0 && (
              <button onClick={() => setStep((s) => s - 1)} className="btn-ghost" disabled={busy}>← Back</button>
            )}
            {step < STEPS.length - 1 && (
              <button onClick={() => setStep((s) => s + 1)} className="btn-primary">
                {step === 0 ? "Let's go" : 'Continue'} →
              </button>
            )}
            {step === STEPS.length - 1 && (
              <div className="flex flex-col gap-3 sm:flex-row">
                <button onClick={() => finish(false)} disabled={busy} className="btn-secondary">Skip for now</button>
                <button onClick={() => finish(true)} disabled={busy} className="btn-primary">
                  {busy ? <Spinner /> : 'Say hello in chat 👋'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
