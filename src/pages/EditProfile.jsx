import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { AvatarUpload, LanguageSelect, SocialInputs, DobField } from '../components/ProfileFields'
import WorldMap from '../components/WorldMap'
import TravelGallery from '../components/TravelGallery'
import { PageHeader, Spinner } from '../components/ui'

// Edit every part of your own profile on one calm page.
export default function EditProfile() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)

  const [form, setForm] = useState({
    name: profile?.name || '',
    dob: profile?.dob || null,
    city: profile?.city || '',
    country: profile?.country || '',
    bio: profile?.bio || '',
    about: profile?.about || '',
    photo_url: profile?.photo_url || '',
    instagram_url: profile?.instagram_url || '',
    tiktok_url: profile?.tiktok_url || '',
    youtube_url: profile?.youtube_url || '',
    other_links: Array.isArray(profile?.other_links) ? profile.other_links : [],
    languages: profile?.languages || [],
    countries_visited: profile?.countries_visited || [],
  })

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    const { error } = await supabase
      .from('profiles')
      .update(form)
      .eq('id', user.id)
    setBusy(false)
    if (!error) {
      await refreshProfile()
      setSaved(true)
      setTimeout(() => navigate(`/profile/${user.id}`), 600)
    }
  }

  return (
    <div className="page max-w-3xl">
      <PageHeader title="Edit profile" subtitle="Make it a profile you're proud to share." />

      <form onSubmit={save} className="space-y-10">
        <section className="card space-y-6">
          <h2 className="text-lg font-semibold">Photo & basics</h2>
          <AvatarUpload photoUrl={form.photo_url} name={form.name} onUploaded={(url) => set({ photo_url: url })} />
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="name" className="label">Display name</label>
              <input id="name" type="text" required className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} />
            </div>
            <DobField value={form.dob} onChange={(dob) => set({ dob })} />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <div>
              <label htmlFor="city" className="label">City</label>
              <input id="city" type="text" className="input" value={form.city} onChange={(e) => set({ city: e.target.value })} placeholder="e.g. London" />
            </div>
            <div>
              <label htmlFor="country" className="label">Country</label>
              <input id="country" type="text" className="input" value={form.country} onChange={(e) => set({ country: e.target.value })} placeholder="e.g. United Kingdom" />
            </div>
          </div>
          <div>
            <label htmlFor="bio" className="label">One-line bio</label>
            <input id="bio" type="text" maxLength={120} className="input" value={form.bio} onChange={(e) => set({ bio: e.target.value })} />
          </div>
          <div>
            <label htmlFor="about" className="label">About you</label>
            <textarea id="about" rows={5} className="input" value={form.about} onChange={(e) => set({ about: e.target.value })} />
          </div>
        </section>

        {/* Travel photo gallery */}
        <section className="card space-y-5">
          <div>
            <h2 className="text-lg font-semibold">Travel photos</h2>
            <p className="mt-1 text-sm text-smoke">Share up to 20 shots from your trips. They appear on your public profile.</p>
          </div>
          <TravelGallery creatorId={user.id} editable />
        </section>

        <section className="card space-y-6">
          <h2 className="text-lg font-semibold">Social links</h2>
          <SocialInputs values={form} onChange={(v) => set(v)} />

          {/* Extra links (blog, Linktree, etc.) stored as JSON */}
          <div>
            <p className="label">Other links</p>
            {form.other_links.map((l, i) => (
              <div key={i} className="mb-3 flex gap-2">
                <input
                  type="text" placeholder="Label (e.g. Blog)" className="input !w-36"
                  value={l.label}
                  onChange={(e) => {
                    const links = [...form.other_links]
                    links[i] = { ...links[i], label: e.target.value }
                    set({ other_links: links })
                  }}
                />
                <input
                  type="url" placeholder="https://…" className="input flex-1"
                  value={l.url}
                  onChange={(e) => {
                    const links = [...form.other_links]
                    links[i] = { ...links[i], url: e.target.value }
                    set({ other_links: links })
                  }}
                />
                <button type="button" aria-label="Remove link" className="btn-ghost !px-3" onClick={() => set({ other_links: form.other_links.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button type="button" className="btn-secondary !py-2 text-xs" onClick={() => set({ other_links: [...form.other_links, { label: '', url: '' }] })}>
              + Add another link
            </button>
          </div>
        </section>

        <section className="card space-y-5">
          <h2 className="text-lg font-semibold">Countries visited</h2>
          <WorldMap
            selectable
            selected={form.countries_visited}
            onToggle={(name) =>
              set({
                countries_visited: form.countries_visited.includes(name)
                  ? form.countries_visited.filter((c) => c !== name)
                  : [...form.countries_visited, name],
              })
            }
          />
          <p className="text-sm font-semibold text-brand">{form.countries_visited.length} countries selected</p>
        </section>

        <section className="card space-y-5">
          <h2 className="text-lg font-semibold">Languages spoken</h2>
          <LanguageSelect selected={form.languages} onChange={(languages) => set({ languages })} />
        </section>

        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-sm font-medium text-green-600">Saved ✓</span>}
          <button type="button" onClick={() => navigate(-1)} className="btn-ghost">Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? <Spinner /> : 'Save profile'}
          </button>
        </div>
      </form>
    </div>
  )
}
