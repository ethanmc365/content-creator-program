// Form pieces shared by Onboarding and Edit Profile:
//  * AvatarUpload   - photo picker that uploads to Supabase storage
//  * LanguageSelect - multi-select tag picker
//  * SocialInputs   - Instagram / TikTok / YouTube URL fields
import { useRef, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { compressImage } from '../lib/image'
import { uploadFile } from '../lib/upload'
import { parseDob, formatDobInput, ageFromDob } from '../lib/utils'
import { DIAL_CODES, flagEmoji } from '../lib/dialCodes'
import { Avatar, Spinner } from './ui'

export const LANGUAGE_OPTIONS = [
  'English', 'Irish', 'French', 'Spanish', 'Portuguese', 'Italian', 'German',
  'Dutch', 'Polish', 'Welsh', 'Scottish Gaelic', 'Hindi', 'Punjabi', 'Urdu',
  'Arabic', 'Mandarin', 'Cantonese', 'Japanese', 'Korean', 'Turkish', 'Greek',
  'Romanian', 'Ukrainian', 'Russian', 'Swedish', 'Norwegian', 'Danish',
]

/** Profile photo uploader. Files land in avatars/<user id>/ (RLS-protected). */
export function AvatarUpload({ photoUrl, name, onUploaded }) {
  const { user } = useAuth()
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleFile(e) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) return setError('Please choose an image.')
    if (file.size > 15 * 1024 * 1024) return setError('Please choose an image under 15MB.')
    setError('')
    setBusy(true)
    // Avatars only ever render small, so 512px keeps them tiny in storage.
    const compressed = await compressImage(file, { maxDim: 512, quality: 0.85 })
    const path = `${user.id}/avatar-${Date.now()}.jpg` // unique name busts caches
    try {
      const url = await uploadFile('avatars', path, compressed, 'image/jpeg')
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
        aria-label="Change profile photo"
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
export function DobField({ value, onChange }) {
  const [text, setText] = useState(formatDobInput(value))
  const iso = parseDob(text)
  const showError = text.trim().length >= 10 && !iso
  const age = ageFromDob(iso)

  function handle(e) {
    const next = e.target.value
    setText(next)
    onChange(parseDob(next)) // null until it's a complete, valid date
  }

  return (
    <div>
      <label htmlFor="dob" className="label">Date of birth</label>
      <input
        id="dob"
        type="text"
        inputMode="numeric"
        autoComplete="bday"
        className="input max-w-[12rem]"
        placeholder="DD/MM/YYYY"
        value={text}
        onChange={handle}
      />
      {showError ? (
        <p className="mt-1 text-xs text-red-600">Enter a real date as DD/MM/YYYY, e.g. 25/01/2005.</p>
      ) : age != null ? (
        <p className="mt-1 text-xs text-smoke">You'll show as {age} years old. Only your age is shown publicly, never your date of birth.</p>
      ) : (
        <p className="mt-1 text-xs text-smoke">Type it as DD/MM/YYYY, e.g. 25/01/2005. We show your age, not the date.</p>
      )}
    </div>
  )
}

/**
 * Phone number with a country dial-code picker.
 *  value = { phone_country: '+44', phone: '7700 900123' }
 *  onChange(next) fires with the merged value.
 * Private detail: only the creator and admins ever see this, never the public.
 */
export function PhoneInput({ value, onChange }) {
  const country = value.phone_country || ''
  const number = value.phone || ''
  return (
    <div>
      <label htmlFor="phone" className="label">Phone number</label>
      <div className="flex gap-2">
        <select
          aria-label="Country dialling code"
          className="input !w-auto shrink-0"
          value={country}
          onChange={(e) => onChange({ ...value, phone_country: e.target.value })}
        >
          <option value="">Code</option>
          {DIAL_CODES.map((c) => (
            <option key={c.iso2} value={c.code}>
              {flagEmoji(c.iso2)} {c.name} ({c.code})
            </option>
          ))}
        </select>
        <input
          id="phone"
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          className="input flex-1"
          placeholder="7700 900123"
          value={number}
          onChange={(e) => onChange({ ...value, phone: e.target.value })}
        />
      </div>
      <p className="mt-1 text-xs text-smoke">Private. Only the Tryp.com Team can see this, never other creators.</p>
    </div>
  )
}

/** A single-line favourite quote, shown publicly on the profile. */
export function QuoteField({ value, onChange }) {
  return (
    <div>
      <label htmlFor="favourite_quote" className="label">Favourite quote</label>
      <input
        id="favourite_quote"
        type="text"
        maxLength={160}
        className="input"
        placeholder="A travel quote you live by…"
        value={value || ''}
        onChange={(e) => onChange(e.target.value)}
      />
      <p className="mt-1 text-xs text-smoke">Shown on your public profile. Optional.</p>
    </div>
  )
}

/** Tag-style multi-select for languages spoken. */
export function LanguageSelect({ selected = [], onChange }) {
  function toggle(lang) {
    onChange(selected.includes(lang) ? selected.filter((l) => l !== lang) : [...selected, lang])
  }
  return (
    <div className="flex flex-wrap gap-2">
      {LANGUAGE_OPTIONS.map((lang) => {
        const active = selected.includes(lang)
        return (
          <button
            key={lang}
            type="button"
            onClick={() => toggle(lang)}
            aria-pressed={active}
            className={
              active
                ? 'rounded-full bg-brand px-4 py-1.5 text-xs font-medium text-white transition-colors'
                : 'rounded-full border border-gray-200 px-4 py-1.5 text-xs font-medium text-smoke transition-colors hover:border-brand hover:text-brand'
            }
          >
            {lang}
          </button>
        )
      })}
    </div>
  )
}

/** The three main social URL fields. */
export function SocialInputs({ values, onChange }) {
  const fields = [
    { key: 'instagram_url', label: 'Instagram', placeholder: 'https://instagram.com/yourhandle' },
    { key: 'tiktok_url', label: 'TikTok', placeholder: 'https://tiktok.com/@yourhandle' },
    { key: 'youtube_url', label: 'YouTube', placeholder: 'https://youtube.com/@yourchannel' },
  ]
  return (
    <div className="space-y-4">
      {fields.map((f) => (
        <div key={f.key}>
          <label htmlFor={f.key} className="label">{f.label}</label>
          <input
            id={f.key}
            type="url"
            className="input"
            placeholder={f.placeholder}
            value={values[f.key] || ''}
            onChange={(e) => onChange({ ...values, [f.key]: e.target.value })}
          />
        </div>
      ))}
    </div>
  )
}
