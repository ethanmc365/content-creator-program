// Form pieces shared by Onboarding and Edit Profile:
//  * AvatarUpload   — photo picker that uploads to Supabase storage
//  * LanguageSelect — multi-select tag picker
//  * SocialInputs   — Instagram / TikTok / YouTube URL fields
import { useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { compressImage } from '../lib/image'
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
    const { error: uploadError } = await supabase.storage.from('avatars').upload(path, compressed, { upsert: true })
    if (uploadError) {
      setError(uploadError.message)
      setBusy(false)
      return
    }
    const { data } = supabase.storage.from('avatars').getPublicUrl(path)
    onUploaded(data.publicUrl)
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
