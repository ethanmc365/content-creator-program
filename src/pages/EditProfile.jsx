import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { AvatarUpload, LanguageSelect, SocialInputs, DobField, PhoneInput, QuoteField } from '../components/ProfileFields'
import WorldMap from '../components/WorldMap'
import Icon from '../components/Icon'
import { cx } from '../lib/utils'
import PhotoBoard from '../components/PhotoBoard'
import SocialMark, { brandForUrl } from '../components/SocialMark'
import AutoTextarea from '../components/AutoTextarea'
import { flagForCountry } from '../lib/flags'
import { geocodeCity } from '../lib/geocode'
import { PageHeader, Spinner } from '../components/ui'
import { useT } from '../lib/i18n'

// Edit every part of your own profile on one calm page.
//
// FOUR NAMES, NO EXPLANATIONS. Each tab carried a line of hint text underneath
// it ("Photo, name and the lines people read first"), which is four sentences
// of furniture explaining four words that do not need explaining. Ethan: "each
// of these has a little description under that is not needed, just have the
// title."
const TABS = [
  { key: 'you', label: 'You', icon: 'user' },
  { key: 'links', label: 'Links', icon: 'link' },
  { key: 'travel', label: 'Travel', icon: 'globe' },
  { key: 'photos', label: 'Photos', icon: 'image' },
]

const TAB_KEYS = new Set(TABS.map((t) => t.key))

export default function EditProfile() {
  const tr = useT()
  // WHICH PANEL YOU LAND ON IS IN THE URL.
  //
  // "Manage photos" on the profile used to link at /profile/edit, which opens
  // on "You" - so pressing a control labelled Manage photos put you in front of
  // a form about your name and date of birth with the photos three tabs away.
  // Read ONCE into state rather than driven from the URL on every render: the
  // tabs are a local view preference after you arrive, and rewriting the query
  // string on every click would fill the back stack with four entries that all
  // look like the same page.
  const [params] = useSearchParams()
  const [tab, setTab] = useState(() => {
    const asked = params.get('tab')
    return asked && TAB_KEYS.has(asked) ? asked : 'you'
  })
  const { user, profile, refreshProfile } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  const [form, setForm] = useState({
    name: profile?.name || '',
    // ALWAYS NULL FROM `profiles` - the real value comes from creator_private,
    // in the effect below. See the note there.
    dob: null,
    city: profile?.city || '',
    country: profile?.country || '',
    bio: profile?.bio || '',
    about: profile?.about || '',
    favourite_quote: profile?.favourite_quote || '',
    photo_url: profile?.photo_url || '',
    instagram_url: profile?.instagram_url || '',
    tiktok_url: profile?.tiktok_url || '',
    youtube_url: profile?.youtube_url || '',
    facebook_url: profile?.facebook_url || '',
    linkedin_url: profile?.linkedin_url || '',
    other_links: Array.isArray(profile?.other_links) ? profile.other_links : [],
    languages: profile?.languages || [],
    countries_visited: profile?.countries_visited || [],
    bucket_list: Array.isArray(profile?.bucket_list) ? profile.bucket_list : [],
  })

  // THE FORM RE-SEEDS ITSELF IF THE PROFILE ARRIVES AFTER IT MOUNTS.
  //
  // `useState({...profile})` is an INITIALISER, not a subscription: on a hard
  // reload of /profile/edit the AuthContext profile is still null on the first
  // render, so every field was seeded blank and no later fetch could put
  // anything in them. It usually looked fine because you normally arrive here
  // from a page that had already loaded the profile.
  //
  // It re-seeds ONCE, and only while the form is still untouched (`dirtyRef`),
  // so a fetch landing mid-edit can never overwrite what somebody has typed.
  const seededRef = useRef(!!profile)
  const dirtyRef = useRef(false)
  useEffect(() => {
    if (seededRef.current || dirtyRef.current || !profile) return
    seededRef.current = true
    setForm((f) => ({
      ...f,
      name: profile.name || '',
      city: profile.city || '',
      country: profile.country || '',
      bio: profile.bio || '',
      about: profile.about || '',
      favourite_quote: profile.favourite_quote || '',
      photo_url: profile.photo_url || '',
      instagram_url: profile.instagram_url || '',
      tiktok_url: profile.tiktok_url || '',
      youtube_url: profile.youtube_url || '',
      facebook_url: profile.facebook_url || '',
      linkedin_url: profile.linkedin_url || '',
      other_links: Array.isArray(profile.other_links) ? profile.other_links : [],
      languages: profile.languages || [],
      countries_visited: profile.countries_visited || [],
      bucket_list: Array.isArray(profile.bucket_list) ? profile.bucket_list : [],
    }))
  }, [profile])

  // Phone is stored separately (private: only the creator and admins can read
  // it). Payment details live on the Settings page now. Load the private row.
  //
  // AND THE DATE OF BIRTH IS IN THERE TOO, WHICH IS THE WHOLE BUG (2 Sep 2026).
  //
  // Ethan: "we still have the issue with the date of birth. I clicked edit
  // profile, entered my date of birth, clicked save, and then a few minutes
  // later clicked edit profile and it was showing up as blank again."
  //
  // The save was never the problem and neither was the field. `profiles` has a
  // BEFORE trigger, `mirror_dob_to_private`, which copies any dob it is handed
  // into `creator_private.dob`, derives `profiles.age` from it and then sets
  // `new.dob := null` - by design, so the public row never carries a full date
  // of birth. So the write worked perfectly, and the form then re-seeded itself
  // from `profiles.dob`, which is null on every row in the database and always
  // will be. It read back the one column guaranteed to be empty.
  //
  // The private row is the only place the date exists, so it is where the form
  // reads it from. RLS on `creator_private` is already owner-and-admin, which
  // is exactly the audience for a date of birth.
  const [contact, setContact] = useState({ phone: '', phone_country: '' })
  useEffect(() => {
    supabase
      .from('creator_private')
      .select('phone, phone_country, dob')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        setContact({ phone: data.phone || '', phone_country: data.phone_country || '' })
        // Never over an edit in progress - same rule the profile re-seed
        // follows, for the same reason.
        if (data.dob && !dirtyRef.current) setForm((f) => (f.dob ? f : { ...f, dob: data.dob }))
      })
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

  const set = (patch) => {
    dirtyRef.current = true
    setForm((f) => ({ ...f, ...patch }))
  }
  // Data export & account deletion moved to the Settings page (Account section).

  async function save(e) {
    e.preventDefault()
    setBusy(true)
    // Geocode the town so this creator lands on the creator map. Best-effort:
    // if it changed (or was never geocoded) look it up, else keep old coords.
    const payload = { ...form }
    // Drop half-empty bucket-list rows (a destination needs at least a country).
    payload.bucket_list = form.bucket_list
      .map((b) => ({ country: (b.country || '').trim(), city: (b.city || '').trim() }))
      .filter((b) => b.country)
    if (form.city?.trim() || form.country?.trim()) {
      const townChanged = form.city !== profile?.city || form.country !== profile?.country
      if (townChanged || profile?.city_lat == null) {
        const coords = await geocodeCity(form.city, form.country)
        if (coords) { payload.city_lat = coords.lat; payload.city_lng = coords.lng }
      }
    }
    const [{ error }] = await Promise.all([
      supabase.from('profiles').update(payload).eq('id', user.id),
      // Upsert the private contact row (phone never goes in public profiles).
      // Only the phone columns are touched here; payment details are managed on
      // the Settings page and left untouched by this partial upsert.
      supabase.from('creator_private').upsert({
        id: user.id,
        phone: contact.phone,
        phone_country: contact.phone_country,
        updated_at: new Date().toISOString(),
      }),
    ])
    setBusy(false)
    // A REJECTED SAVE HAS TO SAY SO. This threw the error away, so a profile
    // that would not write looked exactly like one that had: the button
    // un-busied, nothing moved, and the only symptom was the edit being gone
    // the next time you opened the page. That silence is what made the date of
    // birth take three attempts to diagnose.
    if (error) {
      setSaveError(error.message)
      return
    }
    setSaveError('')
    await refreshProfile()
    setSaved(true)
    setTimeout(() => navigate(`/profile/${user.id}`), 600)
  }

  return (
    <div className="page max-w-5xl">
      <PageHeader title={tr("Edit profile")} />

      {/* ================= FOUR PANELS, NOT ONE LONG FORM =================
          Ethan: "the edit profile page currently opens up, seems like a lot of
          scrolling and it's hard to completely understand, so I would improve
          it a lot."
          It was seven full-width cards in a single column with the save button
          at the bottom of all of them, so the shortest edit on the page - swap
          your photo - meant scrolling past a world map and a bucket list to
          commit it. Four panels, one at a time, and everything saves together
          whichever one you are looking at.
          THE FORM IS ONE FORM STILL. The panels are shown and hidden, not
          mounted and unmounted: `save` posts the whole `form` object, and a
          field that had been unmounted would post whatever it was when the
          panel closed. Hiding costs nothing and removes a whole class of bug.
          THE RAIL IS A ROW ON A PHONE. Four labels fit across 375px; a vertical
          list of four would be the scrolling this is meant to remove. */}
      <form onSubmit={save} className="grid grid-cols-1 gap-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-8">
        <nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0" aria-label={tr("Profile sections")}>
          {TABS.map((t) => {
            const on = tab === t.key
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setTab(t.key)}
                aria-current={on ? 'page' : undefined}
                className={cx(
                  'flex shrink-0 items-center gap-2.5 rounded-card px-3.5 py-2.5 text-left transition-all duration-200 lg:w-full',
                  on ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hover:text-ink',
                )}
              >
                <Icon name={t.icon} className="h-4 w-4 shrink-0" />
                <span className="min-w-0 text-sm font-semibold">{t.label}</span>
              </button>
            )
          })}
        </nav>

        <div className="min-w-0">
          <div className={tab === 'you' ? 'space-y-6' : 'hidden'}>
          <section className="card space-y-6">
            <h2 className="text-lg font-semibold">{tr("Photo & basics")}</h2>
            <AvatarUpload photoUrl={form.photo_url} name={form.name} onUploaded={(url) => set({ photo_url: url })} />
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="name" className="label">{tr("Display name")}</label>
                <input id="name" type="text" required className="input" value={form.name} onChange={(e) => set({ name: e.target.value })} />
              </div>
              <DobField value={form.dob} onChange={(dob) => set({ dob })} fallbackAge={profile?.age ?? null} />
            </div>
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div>
                <label htmlFor="city" className="label">{tr("City")}</label>
                <input id="city" type="text" className="input" value={form.city} onChange={(e) => set({ city: e.target.value })} placeholder={tr("e.g. London")} />
              </div>
              <div>
                <label htmlFor="country" className="label">{tr("Country")}</label>
                <input id="country" type="text" className="input" value={form.country} onChange={(e) => set({ country: e.target.value })} placeholder={tr("e.g. United Kingdom")} />
              </div>
            </div>
            <div>
              <label htmlFor="bio" className="label">{tr("One-line bio")}</label>
              <input id="bio" type="text" maxLength={120} className="input" value={form.bio} onChange={(e) => set({ bio: e.target.value })} />
            </div>
            <div>
              <label htmlFor="about" className="label">{tr("About you")}</label>
              {/* IT GROWS. A fixed five rows meant anybody writing a real
                  paragraph was editing it through a letterbox, scrolling a box
                  inside a page that also scrolls. See AutoTextarea. */}
              <AutoTextarea id="about" minRows={5} className="input" value={form.about} onChange={(e) => set({ about: e.target.value })} />
            </div>
            <QuoteField value={form.favourite_quote} onChange={(favourite_quote) => set({ favourite_quote })} />
            <PhoneInput value={contact} onChange={setContact} />
          </section>
          </div>
          <div className={tab === 'links' ? 'space-y-6' : 'hidden'}>
          <section className="card space-y-6">
            <h2 className="text-lg font-semibold">{tr("Social links")}</h2>
            <SocialInputs values={form} onChange={(v) => set(v)} />

            {/* ANYTHING ELSE: a blog, a Linktree, a press kit. Stored as JSON.
                Each row shows the mark its URL resolves to, so pasting an X or
                a Pinterest link visibly becomes that platform as you type and
                you can see it will not come out as a generic chain link. */}
            <div>
              <p className="label">{tr("Other links")}</p>
              {form.other_links.map((l, i) => (
                <div key={i} className="mb-3 flex items-center gap-2">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cloud text-smoke" aria-hidden>
                    <SocialMark brand={brandForUrl(l.url || '')} className="h-5 w-5" />
                  </span>
                  <input
                    type="text" placeholder={tr("Label (e.g. Blog)")} className="input !w-32 shrink-0"
                    aria-label={`Label for link ${i + 1}`}
                    value={l.label}
                    onChange={(e) => {
                      const links = [...form.other_links]
                      links[i] = { ...links[i], label: e.target.value }
                      set({ other_links: links })
                    }}
                  />
                  <input
                    type="url" placeholder={tr("https://…")} className="input min-w-0 flex-1"
                    aria-label={`URL for link ${i + 1}`}
                    value={l.url}
                    onChange={(e) => {
                      const links = [...form.other_links]
                      links[i] = { ...links[i], url: e.target.value }
                      set({ other_links: links })
                    }}
                  />
                  <button type="button" aria-label={tr("Remove link")} className="btn-ghost !px-3" onClick={() => set({ other_links: form.other_links.filter((_, j) => j !== i) })}>✕</button>
                </div>
              ))}
              <button type="button" className="btn-secondary !py-2 text-xs" onClick={() => set({ other_links: [...form.other_links, { label: '', url: '' }] })}>
                + Add another link
              </button>
            </div>
          </section>
          </div>
          <div className={tab === 'travel' ? 'space-y-6' : 'hidden'}>
          <section className="card space-y-5">
            <div className="flex items-baseline justify-between">
              <h2 className="text-lg font-semibold">{tr("Where I'm headed next")}</h2>
              <Link to="/collab" className="text-sm font-medium text-brand hover:underline">{tr("Manage on the collab board")}</Link>
            </div>
            {trips.length === 0 ? (
              <p className="text-sm text-smoke">{tr("No upcoming trips. Post where you’re headed on the collab board so nearby creators can meet up.")}</p>
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
            <h2 className="text-lg font-semibold">{tr("Languages spoken")}</h2>
            <LanguageSelect selected={form.languages} onChange={(languages) => set({ languages })} />
          </section>

          <section className="card space-y-4">
            <div>
              <h2 className="text-lg font-semibold">{tr("Travel bucket list")}</h2>
              <p className="mt-1 text-sm text-smoke">{tr("Countries (and towns) you're dreaming of visiting. They show on your profile with the flag.")}</p>
            </div>
            {form.bucket_list.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-8 shrink-0 text-center text-2xl leading-none" aria-hidden>{flagForCountry(b.country) || '📍'}</span>
                <input
                  type="text" placeholder={tr("Country (e.g. Japan)")} className="input flex-1"
                  value={b.country || ''}
                  onChange={(e) => { const list = [...form.bucket_list]; list[i] = { ...list[i], country: e.target.value }; set({ bucket_list: list }) }}
                  aria-label={`Bucket-list country ${i + 1}`}
                />
                <input
                  type="text" placeholder={tr("Town (optional)")} className="input flex-1"
                  value={b.city || ''}
                  onChange={(e) => { const list = [...form.bucket_list]; list[i] = { ...list[i], city: e.target.value }; set({ bucket_list: list }) }}
                  aria-label={`Bucket-list town ${i + 1}`}
                />
                <button type="button" aria-label={tr("Remove destination")} className="btn-ghost !px-3" onClick={() => set({ bucket_list: form.bucket_list.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button type="button" className="btn-secondary !py-2 text-xs" onClick={() => set({ bucket_list: [...form.bucket_list, { country: '', city: '' }] })}>
              + Add a destination
            </button>
          </section>

          <section className="card space-y-5">
            <h2 className="text-lg font-semibold">{tr("Countries visited")}</h2>
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
            {/* THE LIST IS BACK UNDER THE MAP, AND IT IS THE WAY OUT.
                This was a bare count: "47 countries selected". Fine as a
                total, useless as a control - the only way to un-pick a country
                was to find it again on the map, which for anything smaller than
                France is a real hunt. Ethan: "improve the UI here but it should
                still be showing up the names of the country here so you can
                easily see and x any."
                (The public profile has the opposite answer and for the opposite
                reason: there the map IS the list and nothing is removable, so
                forty grey chips were six rows of nothing.) */}
            <div className="space-y-2.5">
              <p className="text-sm font-semibold text-brand">
                {form.countries_visited.length} {form.countries_visited.length === 1 ? 'country' : 'countries'} selected
              </p>
              {form.countries_visited.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {[...form.countries_visited].sort().map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => set({ countries_visited: form.countries_visited.filter((x) => x !== c) })}
                      title={`Remove ${c}`}
                      aria-label={`Remove ${c}`}
                      className="inline-flex items-center gap-1.5 rounded-full bg-cloud py-1.5 pl-2.5 pr-2 text-xs font-medium text-ink transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <span aria-hidden className="text-sm leading-none">{flagForCountry(c) || '📍'}</span>
                      {c}
                      <Icon name="close" className="h-3 w-3 shrink-0 opacity-50" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* Travel photos last, matching the public profile's section order. */}
          </div>
          {/* ---------- Photos ----------
              ONE SURFACE (1 Sep 2026).

              Ethan: "i think rather than seperating the upload section and the
              board section they should be integrated so you upload them and
              rather than having to press x there, there should be a button to
              x it on the actual board... and also should have the option to
              type the caption directly onto the photo."

              This was two cards: a "Travel photos" film strip of 104px squares
              carrying add / caption / remove, and "Arrange your board"
              underneath it carrying position, size and crop. Two grids of the
              same ten photographs, and the tile you captioned was never the
              tile the caption would appear on. TravelGallery is deleted; the
              board owns all of it, and it is the SAME component the profile
              renders, so what you arrange here is not a preview of the profile,
              it is the profile's own board. */}
          <div className={tab === 'photos' ? 'space-y-6' : 'hidden'}>
          <section className="card space-y-4">
            <div>
              <h2 className="text-lg font-semibold">{tr("Travel photos")}</h2>
              <p className="mt-1 text-sm text-smoke">
                {tr("Drag to rearrange, press the button in a photo's corner to change its size, and type the caption straight onto it. It saves itself, and this is exactly how it appears on your profile.")}
              </p>
            </div>
            <PhotoBoard creatorId={user.id} editable alwaysArranging />
          </section>
          </div>

          {/* THE SAVE BAR STICKS TO THE BOTTOM OF THE VIEWPORT.
              The old one sat after every section, so on the Travel panel it was
              below a world map and you had to go looking for it. Sticky means
              the answer to "have I saved this" is always on screen.
              `bottom-20` on a phone clears the tab bar, which wins the paint
              order against anything that is not fixed. */}
          {/* THE "SAVED ✓" ON THE LEFT IS GONE. Saving already navigates
              straight to the profile, so the tick appeared for a fraction of a
              second on a bar that was about to disappear - and while it was
              there it shoved the two buttons sideways, which is the one thing a
              fixed control must never do. The button says what happened
              instead, in the place you were already looking. */}
          <div className="sticky bottom-20 z-20 mt-6 flex flex-wrap items-center justify-end gap-2.5 rounded-card border border-gray-100 bg-white/95 px-3 py-2.5 shadow-lift backdrop-blur sm:bottom-4">
            {saveError && (
              <p className="mr-auto min-w-0 flex-1 text-xs text-red-600">{saveError}</p>
            )}
            <button type="button" onClick={() => navigate(-1)} className="btn-ghost !py-2 text-sm">{tr("Cancel")}</button>
            <button
              type="submit"
              disabled={busy || saved}
              className={cx('btn-primary !py-2 text-sm', saved && '!bg-green-600')}
            >
              {busy ? <Spinner /> : saved ? 'Saved' : 'Save profile'}
            </button>
          </div>
        </div>
      </form>

      <p className="mt-8 text-center text-xs text-smoke">
        Looking for payment details, data download or account deletion? They are on the{' '}
        <Link to="/settings" className="font-medium text-brand hover:underline">{tr("settings page")}</Link>.
      </p>
    </div>
  )
}
