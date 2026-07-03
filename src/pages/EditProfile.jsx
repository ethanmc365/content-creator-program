import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { format } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { AvatarUpload, LanguageSelect, SocialInputs, DobField, PhoneInput, QuoteField } from '../components/ProfileFields'
import WorldMap from '../components/WorldMap'
import TravelGallery from '../components/TravelGallery'
import { flagForCountry } from '../lib/flags'
import { PageHeader, Spinner } from '../components/ui'

// Edit every part of your own profile on one calm page.
export default function EditProfile() {
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const [form, setForm] = useState({
    name: profile?.name || '',
    dob: profile?.dob || null,
    city: profile?.city || '',
    country: profile?.country || '',
    bio: profile?.bio || '',
    about: profile?.about || '',
    favourite_quote: profile?.favourite_quote || '',
    photo_url: profile?.photo_url || '',
    instagram_url: profile?.instagram_url || '',
    tiktok_url: profile?.tiktok_url || '',
    youtube_url: profile?.youtube_url || '',
    other_links: Array.isArray(profile?.other_links) ? profile.other_links : [],
    languages: profile?.languages || [],
    countries_visited: profile?.countries_visited || [],
  })

  // Phone is stored separately (private, admin-only). Load the creator's own row.
  const [contact, setContact] = useState({ phone: '', phone_country: '' })
  useEffect(() => {
    supabase
      .from('creator_private')
      .select('phone, phone_country')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => { if (data) setContact({ phone: data.phone || '', phone_country: data.phone_country || '' }) })
  }, [user.id])

  // Upcoming trips, shown read-only here (managed on the collab board).
  const [trips, setTrips] = useState([])
  useEffect(() => {
    supabase
      .from('collab_posts')
      .select('id, city, country, start_date, end_date')
      .eq('creator_id', user.id)
      .gte('end_date', format(new Date(), 'yyyy-MM-dd'))
      .order('start_date', { ascending: true })
      .then(({ data }) => setTrips(data ?? []))
  }, [user.id])

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    const [{ error }] = await Promise.all([
      supabase.from('profiles').update(form).eq('id', user.id),
      // Upsert the private contact row (phone never goes in public profiles).
      supabase.from('creator_private').upsert({
        id: user.id,
        phone: contact.phone,
        phone_country: contact.phone_country,
        updated_at: new Date().toISOString(),
      }),
    ])
    setBusy(false)
    if (!error) {
      await refreshProfile()
      setSaved(true)
      setTimeout(() => navigate(`/profile/${user.id}`), 600)
    }
  }

  // GDPR data export: bundle everything tied to this account into a JSON file.
  async function exportData() {
    setExporting(true)
    const uid = user.id
    const own = (t, col) => supabase.from(t).select('*').eq(col, uid)
    const [prof, priv, photos, subs, conns, reacts, votes, refs, rewards, notifs, msgs, dmA, dmB] = await Promise.all([
      own('profiles', 'id'), own('creator_private', 'id'), own('creator_photos', 'creator_id'),
      own('submissions', 'creator_id'), own('connections', 'creator_id'), own('reactions', 'creator_id'),
      own('poll_votes', 'voter_id'), own('referrals', 'referrer_id'), own('rewards', 'creator_id'),
      own('notifications', 'recipient_id'), own('messages', 'sender_id'),
      supabase.from('direct_messages').select('*').eq('sender_id', uid),
      supabase.from('direct_messages').select('*').eq('recipient_id', uid),
    ])
    const data = {
      exported_at: new Date().toISOString(),
      account: { id: uid, email: user.email },
      profile: prof.data?.[0] ?? null,
      private_contact: priv.data?.[0] ?? null,
      travel_photos: photos.data ?? [],
      submissions: subs.data ?? [],
      connections: conns.data ?? [],
      reactions: reacts.data ?? [],
      poll_votes: votes.data ?? [],
      referrals: refs.data ?? [],
      rewards: rewards.data ?? [],
      notifications: notifs.data ?? [],
      chat_messages: msgs.data ?? [],
      direct_messages: [...(dmA.data ?? []), ...(dmB.data ?? [])],
    }
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }))
    const a = document.createElement('a')
    a.href = url
    a.download = `tryp-my-data-${uid}.json`
    a.click()
    URL.revokeObjectURL(url)
    setExporting(false)
  }

  // GDPR erasure: schedule deletion (30-day grace). ProtectedRoute then shows
  // the restore screen; a daily job purges anything past 30 days.
  async function deleteAccount() {
    if (!confirm('Delete your account?\n\nYour profile and content will be hidden immediately and permanently deleted after 30 days. You can restore it by logging back in within 30 days.')) return
    setDeleting(true)
    const { error } = await supabase.from('profiles').update({ deletion_requested_at: new Date().toISOString() }).eq('id', user.id)
    setDeleting(false)
    if (error) return alert("Couldn't schedule deletion: " + error.message)
    await refreshProfile()
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
          <QuoteField value={form.favourite_quote} onChange={(favourite_quote) => set({ favourite_quote })} />
          <PhoneInput value={contact} onChange={setContact} />
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
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">Where I'm headed next</h2>
            <Link to="/collab" className="text-sm font-medium text-brand hover:underline">Manage on the collab board</Link>
          </div>
          {trips.length === 0 ? (
            <p className="text-sm text-smoke">No upcoming trips. Post where you’re headed on the collab board so nearby creators can meet up.</p>
          ) : (
            <div className="flex flex-wrap gap-3">
              {trips.map((t) => (
                <Link key={t.id} to="/collab" className="flex items-center gap-3 rounded-card border border-gray-100 bg-white px-4 py-3 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift">
                  <span className="text-2xl leading-none" aria-hidden>{flagForCountry(t.country) || '📍'}</span>
                  <span>
                    <span className="block text-sm font-semibold">{t.city}{t.country ? `, ${t.country}` : ''}</span>
                    <span className="block text-xs text-smoke">{format(new Date(t.start_date), 'd MMM')} – {format(new Date(t.end_date), 'd MMM yyyy')}</span>
                  </span>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="card space-y-5">
          <h2 className="text-lg font-semibold">Languages spoken</h2>
          <LanguageSelect selected={form.languages} onChange={(languages) => set({ languages })} />
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
          <p className="text-sm font-semibold text-brand">{form.countries_visited.length} {form.countries_visited.length === 1 ? 'country' : 'countries'} selected</p>
        </section>

        {/* Travel photos last, matching the public profile's section order. */}
        <section className="card space-y-5">
          <div>
            <h2 className="text-lg font-semibold">Travel photos</h2>
            <p className="mt-1 text-sm text-smoke">Share up to 10 shots from your trips. They appear on your public profile.</p>
          </div>
          <TravelGallery creatorId={user.id} editable />
        </section>

        <div className="flex items-center justify-end gap-3">
          {saved && <span className="text-sm font-medium text-green-600">Saved ✓</span>}
          <button type="button" onClick={() => navigate(-1)} className="btn-ghost">Cancel</button>
          <button type="submit" disabled={busy} className="btn-primary">
            {busy ? <Spinner /> : 'Save profile'}
          </button>
        </div>
      </form>

      {/* ---- Your data & account (GDPR) ---- */}
      <section className="card mt-10 space-y-5">
        <div>
          <h2 className="text-lg font-semibold">Your data &amp; account</h2>
          <p className="mt-1 text-sm text-smoke">Download everything we hold about you, or delete your account.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button type="button" onClick={exportData} disabled={exporting} className="btn-secondary">
            {exporting ? <Spinner /> : 'Download my data'}
          </button>
        </div>
        <div className="rounded-xl border border-red-100 bg-red-50/50 p-4">
          <p className="text-sm font-semibold text-red-600">Delete account</p>
          <p className="mb-3 mt-1 text-xs leading-relaxed text-smoke">
            Your profile and content are hidden right away and permanently deleted after 30 days.
            You can restore your account by logging back in within those 30 days.
          </p>
          <button type="button" onClick={deleteAccount} disabled={deleting} className="btn-danger !py-2 text-xs">
            {deleting ? <Spinner /> : 'Delete my account'}
          </button>
        </div>
      </section>
    </div>
  )
}
