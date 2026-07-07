import { useEffect, useState } from 'react'
import { getVideoPreview, detectPlatformFromUrl } from '../lib/videoPreview'
import PlatformBadges from './PlatformBadges'
import Icon from './Icon'
import { cx } from '../lib/utils'

// A submitted video's thumbnail (from free oEmbed), with a play overlay and a
// platform badge. Pure visual block - the caller wraps it in its own link so we
// never nest anchors. Falls back to a branded placeholder when no thumbnail is
// available (e.g. Instagram, which needs a token we don't have).
export default function VideoThumb({ url, platform, className }) {
  const [preview, setPreview] = useState(null)
  const [loading, setLoading] = useState(true)
  const plat = platform || detectPlatformFromUrl(url)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getVideoPreview(url).then((p) => {
      if (cancelled) return
      setPreview(p)
      setLoading(false)
    })
    return () => { cancelled = true }
  }, [url])

  return (
    <div className={cx('group/thumb relative aspect-video w-full overflow-hidden rounded-xl bg-cloud', className)}>
      {loading ? (
        <div className="h-full w-full animate-pulse bg-cloud" />
      ) : preview?.thumbnail ? (
        <img
          src={preview.thumbnail}
          alt={preview.title || 'Video thumbnail'}
          loading="lazy"
          className="h-full w-full object-cover transition-transform duration-300 group-hover/thumb:scale-105"
          onError={(e) => { e.currentTarget.style.display = 'none' }}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-brand-tint to-cloud">
          <Icon name="video" className="h-8 w-8 text-brand/50" />
        </div>
      )}

      {/* Play button - always visible (works on touch), brightens on hover. */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-gradient-to-t from-ink/25 to-transparent">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/85 text-brand shadow-lift transition-all group-hover/thumb:scale-110 group-hover/thumb:bg-white">
          <svg viewBox="0 0 24 24" fill="currentColor" className="ml-0.5 h-5 w-5" aria-hidden><path d="M8 5v14l11-7z" /></svg>
        </span>
      </div>

      {/* Platform badge, top-left. */}
      <div className="absolute left-2 top-2 drop-shadow-sm">
        <PlatformBadges platforms={[plat]} />
      </div>
    </div>
  )
}
