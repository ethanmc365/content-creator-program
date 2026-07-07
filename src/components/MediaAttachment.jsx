import { useState } from 'react'
import { mediaType, fileNameFromUrl, saveFile } from '../lib/media'
import { Spinner } from './ui'
import Icon from './Icon'
import { cx } from '../lib/utils'

// Renders a resource/chat attachment inline: images show the picture, videos
// show an inline player you tap to play, anything else falls back to a labelled
// download. The Save button routes through saveFile() so on mobile it lands in
// the camera roll via the native share sheet.
export default function MediaAttachment({ url, className, compact = false }) {
  const [saving, setSaving] = useState(false)
  if (!url) return null
  const type = mediaType(url)
  const name = fileNameFromUrl(url)

  async function onSave() {
    setSaving(true)
    try {
      await saveFile(url, name)
    } finally {
      setSaving(false)
    }
  }

  const saveBtn = (
    <button
      type="button"
      onClick={onSave}
      disabled={saving}
      className={cx('btn-secondary inline-flex items-center gap-1.5', compact ? '!px-3 !py-1.5 text-xs' : '!py-2 text-xs')}
    >
      {saving ? <Spinner className="h-4 w-4" /> : (
        <>
          <Icon name="arrow-down" className="h-4 w-4" />
          {type === 'video' ? 'Save video' : type === 'image' ? 'Save photo' : 'Download'}
        </>
      )}
    </button>
  )

  if (type === 'image') {
    return (
      <div className={cx('space-y-2', className)}>
        <a href={url} target="_blank" rel="noopener noreferrer" aria-label="Open image full size">
          <img
            src={url}
            alt={name}
            loading="lazy"
            className="max-h-80 w-full rounded-xl border border-gray-100 object-cover"
          />
        </a>
        <div className="flex justify-end">{saveBtn}</div>
      </div>
    )
  }

  if (type === 'video') {
    return (
      <div className={cx('space-y-2', className)}>
        <video
          src={url}
          controls
          playsInline
          preload="metadata"
          className="max-h-80 w-full rounded-xl border border-gray-100 bg-black"
        />
        <div className="flex justify-end">{saveBtn}</div>
      </div>
    )
  }

  // Non-previewable file: keep it a simple download.
  return <div className={cx('flex justify-end', className)}>{saveBtn}</div>
}
