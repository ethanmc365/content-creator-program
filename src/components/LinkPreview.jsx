import { useEffect, useState } from 'react'
import { getLinkPreview } from '../lib/linkPreview'
import { cx } from '../lib/utils'

// Rich link card under a chat message that contains a URL. Renders nothing until
// (and unless) the edge function returns a usable Open Graph card. `onDark`
// recolours it for the sender's orange bubble.
export default function LinkPreview({ url, onDark }) {
  const [data, setData] = useState(null)
  // Track whether the OG image actually loaded. Some sites advertise an
  // og:image that 404s / is hotlink-blocked / is an unrenderable format, which
  // left a broken-image placeholder in the card. We only ever paint the image
  // once it has loaded, and hide it outright if it errors.
  const [imgOk, setImgOk] = useState(false)
  const [imgError, setImgError] = useState(false)

  useEffect(() => {
    let alive = true
    setData(null)
    setImgOk(false)
    setImgError(false)
    getLinkPreview(url).then((d) => { if (alive) setData(d) })
    return () => { alive = false }
  }, [url])

  if (!data) return null

  const hasText = data.title || data.description
  // Nothing worth showing? (no text and no image at all) -> render nothing.
  if (!hasText && !data.image) return null
  // An image-only card whose image can't load has nothing left to show.
  if (!hasText && imgError) return null

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(
        'mt-1.5 block max-w-xs overflow-hidden rounded-xl border transition-colors',
        onDark ? 'border-white/25 bg-white/10 hover:bg-white/20' : 'border-gray-200 bg-white hover:border-brand'
      )}
    >
      {/* The image is loaded off-screen; it only takes layout space once it has
          decoded successfully, so a broken/missing og:image never shows. */}
      {data.image && (
        <img
          src={data.image}
          alt=""
          loading="lazy"
          onLoad={() => setImgOk(true)}
          onError={() => { setImgOk(false); setImgError(true) }}
          className={cx('h-32 w-full object-cover', imgOk ? 'block' : 'hidden')}
        />
      )}
      {hasText && (
        <div className="px-3 py-2">
          <p className={cx('truncate text-[10px] font-semibold uppercase tracking-wide', onDark ? 'text-white/70' : 'text-gray-400')}>{data.siteName}</p>
          {data.title && <p className={cx('line-clamp-2 text-sm font-semibold', onDark ? 'text-white' : 'text-ink')}>{data.title}</p>}
          {data.description && <p className={cx('mt-0.5 line-clamp-2 text-xs', onDark ? 'text-white/80' : 'text-smoke')}>{data.description}</p>}
        </div>
      )}
    </a>
  )
}
