import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { format } from 'date-fns'
import { useAuth } from '../context/AuthContext'
import { supabase } from '../lib/supabase'
import { AvatarUpload, LanguageSelect, SocialInputs, DobField, PhoneInput, QuoteField } from '../components/ProfileFields'
import WorldMap from '../components/WorldMap'
import Icon from '../components/Icon'
import { cx } from '../lib/utils'
import TravelGallery from '../components/TravelGallery'
import PhotoBoard from '../components/PhotoBoard'
import SocialMark, { brandForUrl } from '../components/SocialMark'
import AutoTextarea from '../components/AutoTextarea'
import { flagForCountry } from '../lib/flags'
import { geocodeCity } from '../lib/geocode'
import { PageHeader, Spinner } from '../components/ui'

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
    facebook_url: profile?.facebook_url || '',
    linkedin_url: profile?.linkedin_url || '',
    other_links: Array.isArray(profile?.other_links) ? profile.other_links : [],
    languages: profile?.languages || [],
    countries_visited: profile?.countries_visited || [],
    bucket_list: Array.isArray(profile?.bucket_list) ? profile.bucket_list : [],
  })

  // Phone is stored separately (private: only the creator and admins can read
  // it). Payment details live on the Settings page now. Load the private row.
  const [contact, setContact] = useState({ phone: '', phone_country: '' })
  useEffect(() => {
    supabase
      .from('creator_private')
      .select('phone, phone_country')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return
        setContact({ phone: data.phone || '', phone_country: data.phone_country || '' })
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

  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
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
    if (!error) {
      await refreshProfile()
      setSaved(true)
      setTimeout(() => navigate(`/profile/${user.id}`), 600)
    }
  }

  return (
    <div className="page max-w-5xl">
      <PageHeader title="Edit profile" />

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
        <nav className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0" aria-label="Profile sections">
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
            <h2 className="text-lg font-semibold">Social links</h2>
            <SocialInputs values={form} onChange={(v) => set(v)} />

            {/* ANYTHING ELSE: a blog, a Linktree, a press kit. Stored as JSON.
                Each row shows the mark its URL resolves to, so pasting an X or
                a Pinterest link visibly becomes that platform as you type and
                you can see it will not come out as a generic chain link. */}
            <div>
              <p className="label">Other links</p>
              {form.other_links.map((l, i) => (
                <div key={i} className="mb-3 flex items-center gap-2">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cloud text-smoke" aria-hidden>
                    <SocialMark brand={brandForUrl(l.url || '')} className="h-5 w-5" />
                  </span>
                  <input
                    type="text" placeholder="Label (e.g. Blog)" className="input !w-32 shrink-0"
                    aria-label={`Label for link ${i + 1}`}
                    value={l.label}
                    onChange={(e) => {
                      const links = [...form.other_links]
                      links[i] = { ...links[i], label: e.target.value }
                      set({ other_links: links })
                    }}
                  />
                  <input
                    type="url" placeholder="https://…" className="input min-w-0 flex-1"
                    aria-label={`URL for link ${i + 1}`}
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
          </div>
          <div className={tab === 'travel' ? 'space-y-6' : 'hidden'}>
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

          <section className="card space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Travel bucket list</h2>
              <p className="mt-1 text-sm text-smoke">Countries (and towns) you're dreaming of visiting. They show on your profile with the flag.</p>
            </div>
            {form.bucket_list.map((b, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="w-8 shrink-0 text-center text-2xl leading-none" aria-hidden>{flagForCountry(b.country) || '📍'}</span>
                <input
                  type="text" placeholder="Country (e.g. Japan)" className="input flex-1"
                  value={b.country || ''}
                  onChange={(e) => { const list = [...form.bucket_list]; list[i] = { ...list[i], country: e.target.value }; set({ bucket_list: list }) }}
                  aria-label={`Bucket-list country ${i + 1}`}
                />
                <input
                  type="text" placeholder="Town (optional)" className="input flex-1"
                  value={b.city || ''}
                  onChange={(e) => { const list = [...form.bucket_list]; list[i] = { ...list[i], city: e.target.value }; set({ bucket_list: list }) }}
                  aria-label={`Bucket-list town ${i + 1}`}
                />
                <button type="button" aria-label="Remove destination" className="btn-ghost !px-3" onClick={() => set({ bucket_list: form.bucket_list.filter((_, j) => j !== i) })}>✕</button>
              </div>
            ))}
            <button type="button" className="btn-secondary !py-2 text-xs" onClick={() => set({ bucket_list: [...form.bucket_list, { country: '', city: '' }] })}>
              + Add a destination
            </button>
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
              THIS IS THE BOARD, NOT A SECOND GRID. There used to be two ways to
              manage the same photographs: a plain uploader grid here, and an
              "Arrange the board" mode on the public profile. Two editors for
              one thing, and the one you got depended on which page you happened
              to be on. Ethan: "we have arrange the board and we have manage
              photos which is weird, it should just be manage photos with that
              clean design and functionality and it should then appear correctly
              on the profile as it shows in the preview."
              So the uploader and the board are stacked in one panel, and the
              board is the SAME component the profile renders. What you arrange
              here is what lands there, because it is not a preview of the
              profile, it is the profile's own board. */}
          <div className={tab === 'photos' ? 'space-y-6' : 'hidden'}>
          <section className="card space-y-5">
            <h2 className="text-lg font-semibold">Travel photos</h2>
            <TravelGallery creatorId={user.id} editable uploadOnly />
          </section>
          <section className="card space-y-4">
            <div>
              <h2 className="text-lg font-semibold">Arrange your board</h2>
              <p className="mt-1 text-sm text-smoke">
                Drag to move, pull a corner to resize, tap a photo to set where it crops from. It saves itself, and this is exactly how it appears on your profile.
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
          <div className="sticky bottom-20 z-20 mt-6 flex items-center justify-end gap-2.5 rounded-card border border-gray-100 bg-white/95 px-3 py-2.5 shadow-lift backdrop-blur sm:bottom-4">
            <button type="button" onClick={() => navigate(-1)} className="btn-ghost !py-2 text-sm">Cancel</button>
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
        <Link to="/settings" className="font-medium text-brand hover:underline">settings page</Link>.
      </p>
    </div>
  )
}
