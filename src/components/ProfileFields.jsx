// Form pieces shared by Onboarding and Edit Profile:
//  * AvatarUpload   - photo picker that uploads to Supabase storage
//  * LanguageSelect - multi-select tag picker
//  * SocialInputs   - Instagram / TikTok / YouTube / Facebook URL fields
//  * CountrySelect  - a country AND its ISO-2 code, picked rather than typed
import { useEffect, useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { compressImage } from '../lib/image'
import { uploadFile } from '../lib/upload'
import { parseDob, formatDobInput, ageFromDob, cx } from '../lib/utils'
import { DIAL_CODES, flagEmoji } from '../lib/dialCodes'
import { COUNTRIES, normalize as normalizeCountry } from '../lib/countries'
import { Avatar, Spinner, Select } from './ui'
import Icon from './Icon'
import AutoTextarea from './AutoTextarea'
import SocialMark from './SocialMark'
import { useT } from '../lib/i18n'

export const LANGUAGE_OPTIONS = [
  'English', 'Irish', 'French', 'Spanish', 'Portuguese', 'Italian', 'German',
  'Dutch', 'Polish', 'Welsh', 'Scottish Gaelic', 'Hindi', 'Punjabi', 'Urdu',
  'Arabic', 'Mandarin', 'Cantonese', 'Japanese', 'Korean', 'Turkish', 'Greek',
  'Romanian', 'Ukrainian', 'Russian', 'Swedish', 'Norwegian', 'Danish',
]

/** Profile photo uploader. Files land in avatars/<user id>/ (RLS-protected). */
export function AvatarUpload({ photoUrl, name, onUploaded }) {
  const tr = useT()
  const { user } = useAuth()
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    const looksImage = file.type.startsWith('image/') || /\.(heic|heif|jpe?g|png|webp|gif)$/i.test(file.name)
    if (!looksImage) return setError('Please choose an image.')
    if (file.size > 15 * 1024 * 1024) return setError('Please choose an image under 15MB.')
    setError('')
    setBusy(true)
    // Avatars only ever render small, so 512px keeps them tiny in storage.
    let compressed
    try {
      compressed = await compressImage(file, { maxDim: 512, quality: 0.85 })
    } catch (err) { setError(err.message); setBusy(false); return }
    const ext = (compressed.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg')
    const path = `${user.id}/avatar-${Date.now()}.${ext}` // unique name busts caches
    try {
      const url = await uploadFile('avatars', path, compressed, compressed.type || 'image/jpeg')
      onUploaded(url)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="group relative rounded-full"
        aria-label={tr("Change profile photo")}
      >
        <Avatar src={photoUrl} name={name} size="xl" />
        <span className="absolute inset-0 flex items-center justify-center rounded-full bg-ink/40 text-xs font-medium text-white opacity-0 transition-opacity group-hover:opacity-100">
          {busy ? <Spinner /> : 'Change'}
        </span>
      </button>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      <button type="button" onClick={() => inputRef.current?.click()} className="text-sm font-medium text-brand hover:underline">
        {photoUrl ? 'Change photo' : 'Upload a photo'}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  )
}

/**
 * Date of birth field. Typed free-hand as DD/MM/YYYY (no calendar picker).
 *  value   - stored ISO date ("2005-01-25") or null
 *  onChange(iso|null) - fires with a valid ISO date, or null while incomplete
 * Shows the derived age once a valid date is entered. We only ever surface age
 * publicly, never the full date of birth.
 */
export function DobField({ value, onChange, required, fallbackAge = null }) {
  const tr = useT()
  const [text, setText] = useState(() => formatDobInput(value))

  // THE BOX NEVER FILLED ITSELF IN, AND THIS IS WHY (1 Sep 2026).
  //
  // Ethan: "I noticed an issue where everytime i click edit profile the date of
  // birth section isnt filled in."
  //
  // Every other field on the edit form is controlled straight off `form`, so it
  // catches up the moment the profile lands. This one keeps its own copy of the
  // text - it has to, because "22/12/20" is a state the ISO value cannot hold -
  // and that copy was seeded ONCE, with `useState(...)`. On any render where the
  // profile had not arrived yet the seed was `''`, and no later value could
  // dislodge it: an initialiser is not a subscription.
  //
  // It follows the value now, but ONLY WHEN THE VALUE IS ONE THIS FIELD DID NOT
  // JUST PRODUCE. `lastSent` holds what we last handed upwards, so a parent
  // echoing our own change back cannot re-format the half-typed date under the
  // caret ("22/12/2" -> a re-render -> "" because it does not parse yet).
  const lastSent = useRef(value)
  useEffect(() => {
    if (value === lastSent.current) return
    lastSent.current = value
    setText(formatDobInput(value))
  }, [value])

  const iso = parseDob(text)
  const showError = text.trim().length >= 10 && !iso
  const age = ageFromDob(iso)

  function handle(e) {
    // Auto-insert the slashes as they type so "22122005" becomes "22/12/2005"
    // and they can't get stuck with an unparseable date.
    const digits = e.target.value.replace(/\D/g, '').slice(0, 8)
    let next = digits.slice(0, 2)
    if (digits.length > 2) next += '/' + digits.slice(2, 4)
    if (digits.length > 4) next += '/' + digits.slice(4, 8)
    setText(next)
    const parsed = parseDob(next) // null until it's a complete, valid date
    lastSent.current = parsed
    onChange(parsed)
  }

  return (
    <div>
      <label htmlFor="dob" className="label">Date of birth{required && <span className="text-brand"> *</span>}</label>
      <input
        id="dob"
        type="text"
        inputMode="numeric"
        autoComplete="bday"
        className="input max-w-[12rem]"
        placeholder={tr("DD/MM/YYYY")}
        value={text}
        onChange={handle}
      />
      {/* THE THIRD LINE IS GONE. It read "Type it as DD/MM/YYYY, e.g.
          25/01/2005. We show your age, not the date." - which is the
          placeholder in the box, then the error message, then a promise the
          line underneath already makes as soon as you type anything. Three
          sentences to explain one field. What is left says something the field
          cannot: either it is wrong, or here is the age it will show. */}
      {showError ? (
        <p className="mt-1 text-xs text-red-600">{tr("Enter a real date as DD/MM/YYYY, e.g. 25/01/2005.")}</p>
      ) : age != null ? (
        <p className="mt-1 text-xs text-smoke">
          {tr("You'll show as {n} years old. Only your age is shown publicly, never your date of birth.", { n: age })}
        </p>
      ) : fallbackAge != null ? (
        // A PROFILE CAN CARRY AN AGE WITH NO DATE. `profiles.age` is the number
        // the older sign-up asked for outright, and every account made before
        // the dob field existed still has one and no date - so this box was
        // legitimately empty for somebody the page had just called 20 years old,
        // which reads as the form having lost it. Say what we hold instead.
        <p className="mt-1 text-xs text-smoke">
          {tr("We have your age as {n}. Add your date of birth and it will stay right on your birthday.", { n: fallbackAge })}
        </p>
      ) : null}
    </div>
  )
}

/**
 * Phone number with a country dial-code picker.
 *  value = { phone_country: '+44', phone: '7700 900123' }
 *  onChange(next) fires with the merged value.
 * Private detail: only the creator and admins ever see this, never the public.
 */
export function PhoneInput({ value, onChange, required }) {
  const tr = useT()
  const country = value.phone_country || ''
  const number = value.phone || ''
  return (
    <div>
      <label htmlFor="phone" className="label">Phone number{required && <span className="text-brand"> *</span>}</label>
      {/* Stack on mobile so the dial-code picker isn't crammed; side-by-side on larger screens. */}
      <div className="flex flex-col gap-2 sm:flex-row">
        {/* NO EMPTY OPTION. "Country code" used to be in the list as a
            selectable row, so the menu opened with its own placeholder sitting
            at the top wearing a tick - a thing you could choose that meant
            choosing nothing. Select already renders `placeholder` on the closed
            control, which is the only place it belongs.
            The flag, the name and the dial code are three FIELDS now, not one
            concatenated string: an emoji's side bearings ate the space, so it
            came out as "🇬🇧United Kingdom (+44)". */}
        <Select
          ariaLabel="Country dialling code"
          variant="field"
          className="w-full sm:w-52 sm:shrink-0"
          value={country}
          placeholder={tr("Country code")}
          onChange={(v) => onChange({ ...value, phone_country: v })}
          options={DIAL_CODES.map((c) => ({
            value: c.code,
            label: c.name,
            icon: flagEmoji(c.iso2),
            hint: c.code,
          }))}
        />
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          className="input w-full sm:flex-1"
          placeholder="7700 900123"
          value={number}
          onChange={(e) => onChange({ ...value, phone: e.target.value })}
        />
      </div>
      <p className="mt-1 text-xs text-smoke">{tr("Private. Only the Tryp.com Team can see this, never other creators.")}</p>
    </div>
  )
}

// A favourite quote, shown publicly on the profile.
//
// IT WAS A SINGLE-LINE <input>, WHICH IS WHY YOU HAD TO SCROLL SIDEWAYS. 160
// characters in a one-line box means the start of what you wrote scrolls out of
// sight as you type, so you cannot read your own quote back without dragging
// the caret to the beginning. Ethan: "this should be made bigger as currently
// I'm having to scroll to the right to see what I wrote."
// A quote is a sentence, so it gets a box shaped like a sentence: two rows to
// start, growing to fit, wrapping instead of scrolling.
//
// The hint underneath ("Shown on your public profile. Optional.") is gone.
// Nothing on this form is required unless it says so, and every field on it is
// shown on the public profile - that is what the page is.
export function QuoteField({ value, onChange }) {
  const tr = useT()
  return (
    <div>
      <label htmlFor="favourite_quote" className="label">{tr("Favourite quote")}</label>
      <AutoTextarea
        id="favourite_quote"
        maxLength={160}
        minRows={2}
        className="input resize-none leading-relaxed"
        placeholder={tr("A travel quote you live by…")}
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  )
}

/**
 * Tag-style multi-select for languages spoken. Presets plus an "Other" option
 * so creators can type in an uncommon language we don't list.
 */
// WHAT YOU SPEAK, PICKED FROM A LIST THAT DOES NOT MAKE YOU READ ALL OF IT.
//
// This was one wall of every preset language as a pill, with the selected ones
// filled orange somewhere inside it. Two problems, and they compound: to see
// what you had chosen you had to scan the whole wall looking for orange, and to
// choose something you had to read the whole wall looking for a word. Neither
// of those is a job a person should be doing.
//
// So: what you have chosen sits ON ITS OWN at the top, as removable chips, and
// the list underneath is a list of things you have NOT chosen, filtered by a
// search box. Typing something that is not on the list offers to add it, which
// is what the "+ Other" toggle used to be - one control fewer, and no mode.
export function LanguageSelect({ selected = [], onChange }) {
  const tr = useT()
  const [query, setQuery] = useState('')

  function toggle(lang) {
    onChange(selected.includes(lang) ? selected.filter((l) => l !== lang) : [...selected, lang])
    setQuery('')
  }

  const q = query.trim().toLowerCase()
  const already = (v) => selected.some((l) => l.toLowerCase() === v.toLowerCase())
  const suggestions = LANGUAGE_OPTIONS
    .filter((l) => !already(l) && (!q || l.toLowerCase().includes(q)))
    .slice(0, q ? 12 : 40)
  // Offer the typed value only when it is genuinely not on the list and not
  // already picked, so "Eng" does not offer to add a language called "Eng"
  // while English is sitting right underneath it.
  const canAddCustom = !!q && !already(query.trim()) && !LANGUAGE_OPTIONS.some((l) => l.toLowerCase() === q)

  return (
    <div className="space-y-3">
      {selected.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selected.map((lang) => (
            <button
              key={lang}
              type="button"
              onClick={() => toggle(lang)}
              title={`Remove ${lang}`}
              aria-label={`Remove ${lang}`}
              className="inline-flex items-center gap-1.5 rounded-full bg-brand py-1.5 pl-3.5 pr-2.5 text-xs font-medium text-white transition-transform duration-200 hover:scale-105"
            >
              {lang}
              <Icon name="close" className="h-3 w-3 shrink-0 text-white/80" />
            </button>
          ))}
        </div>
      )}

      <input
        type="text"
        className="input"
        placeholder={tr("Search languages, or type your own…")}
        value={query}
        maxLength={40}
        aria-label={tr("Search languages")}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return
          e.preventDefault()
          if (suggestions.length === 1) toggle(suggestions[0])
          else if (canAddCustom) toggle(query.trim())
        }}
      />

      <div className="flex flex-wrap gap-2">
        {canAddCustom && (
          <button
            type="button"
            onClick={() => toggle(query.trim())}
            className="rounded-full border border-dashed border-brand px-4 py-1.5 text-xs font-medium text-brand transition-transform duration-200 hover:scale-105"
          >
            + Add &ldquo;{query.trim()}&rdquo;
          </button>
        )}
        {suggestions.map((lang) => (
          <button
            key={lang}
            type="button"
            onClick={() => toggle(lang)}
            className="rounded-full border border-gray-200 px-4 py-1.5 text-xs font-medium text-smoke transition-colors hover:border-brand hover:text-brand"
          >
            {lang}
          </button>
        ))}
        {suggestions.length === 0 && !canAddCustom && (
          <p className="text-xs text-smoke">{tr("Nothing left to add.")}</p>
        )}
      </div>
    </div>
  )
}


export function SocialInputs({ values, onChange }) {
  const fields = [
    { key: 'instagram_url', brand: 'instagram', label: 'Instagram', placeholder: 'https://instagram.com/yourhandle' },
    { key: 'tiktok_url', brand: 'tiktok', label: 'TikTok', placeholder: 'https://tiktok.com/@yourhandle' },
    { key: 'youtube_url', brand: 'youtube', label: 'YouTube', placeholder: 'https://youtube.com/@yourchannel' },
    { key: 'facebook_url', brand: 'facebook', label: 'Facebook', placeholder: 'https://facebook.com/yourpage' },
    { key: 'linkedin_url', brand: 'linkedin', label: 'LinkedIn', placeholder: 'https://linkedin.com/in/yourname' },
  ]
  return (
    <div className="space-y-3">
      {fields.map((f) => (
        <div key={f.key} className="flex items-center gap-3">
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-cloud text-smoke"
            title={f.label}
            aria-hidden
          >
            <SocialMark brand={f.brand} className="h-5 w-5" />
          </span>
          <input
            id={f.key}
            type="url"
            className="input min-w-0 flex-1"
            aria-label={f.label}
            placeholder={f.placeholder}
            value={values[f.key] || ''}
            onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}
          />
        </div>
      ))}
    </div>
  )
}


/**
 * WHERE YOU LIVE, AS A CHOICE RATHER THAN A TYPED STRING.
 *
 * `profiles.country` has always been free text, and `profiles.country_code` is
 * what the market system routes on. Joining those two up meant guessing what
 * somebody meant by "UK", "England" or "united kingdom" AFTER they had already
 * finished onboarding, and any guess that missed left a creator with a null
 * code who could never be offered a market at all.
 *
 * Picking from a list removes the guess. The typed box is still here because it
 * is how you search 83 countries without a scroll, but what comes out the other
 * side is always a name AND its ISO-2 code together.
 *
 * onChange({ country, country_code }).
 */
export function CountrySelect({ value = '', code = '', onChange, required, label = 'Country', hint }) {
  const tr = useT()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef(null)

  useEffect(() => {
    if (!open) return undefined
    const onDoc = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const q = normalizeCountry(query)
  const list = q
    ? COUNTRIES.filter((c) => normalizeCountry(c.name).includes(q)
        || (c.aliases || []).some((a) => normalizeCountry(a).includes(q)))
    : COUNTRIES
  const picked = code ? COUNTRIES.find((c) => c.iso2 === code) : null

  return (
    <div ref={rootRef} className="relative">
      <span className="label">{label}{required && <span className="text-brand"> *</span>}</span>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setQuery('') }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cx('input flex w-full items-center justify-between gap-2 text-left', !value && 'text-smoke')}
      >
        <span className="flex min-w-0 items-center gap-2">
          {picked && <span aria-hidden>{flagEmoji(picked.iso2)}</span>}
          <span className="truncate">{value || 'Choose your country'}</span>
        </span>
        <Icon name="chevronRight" className="h-4 w-4 shrink-0 rotate-90 text-gray-400" />
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-card border border-gray-200 bg-white shadow-lift">
          <div className="border-b border-gray-100 p-2">
            <input
              autoFocus
              className="input !py-2 text-sm"
              placeholder={tr("Start typing…")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <ul role="listbox" className="max-h-64 overflow-y-auto py-1">
            {list.length === 0 && (
              <li className="px-4 py-3 text-xs text-smoke">{tr("Nothing matches that. Try the country's English name.")}</li>
            )}
            {list.map((c) => (
              <li key={c.iso2}>
                <button
                  type="button"
                  role="option"
                  aria-selected={c.iso2 === code}
                  onClick={() => { onChange({ country: c.name, country_code: c.iso2 }); setOpen(false) }}
                  className={cx(
                    'flex w-full items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors hover:bg-cloud',
                    c.iso2 === code && 'bg-brand-tint font-semibold text-brand',
                  )}
                >
                  <span aria-hidden>{flagEmoji(c.iso2)}</span>
                  <span className="truncate">{c.name}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
      {hint && <p className="mt-1 text-xs text-smoke">{hint}</p>}
    </div>
  )
}
