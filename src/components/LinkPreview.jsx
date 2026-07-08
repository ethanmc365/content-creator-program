import { useEffect, useState } from 'react'
import { getLinkPreview } from '../lib/linkPreview'
import { cx } from '../lib/utils'

// Rich link card under a chat message that contains a URL. Renders nothing until
// (and unless) the edge function returns a usable Open Graph card. `onDark`
// recolours it for the sender's orange bubble.
export default function LinkPreview({ url, onDark }) {
  const [data, setData] = useState(null)

  useEffect(() => {
    let alive = true
    setData(null)
    getLinkPreview(url).then((d) => { if (alive) setData(d) })
    return () => { alive = false }
  }, [url])

  if (!data) return null
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
      {data.image && <img src={data.image} alt="" loading="lazy" className="h-32 w-full object-cover" />}
      <div className="px-3 py-2">
        <p className={cx('truncate text-[10px] font-semibold uppercase tracking-wide', onDark ? 'text-white/70' : 'text-gray-400')}>{data.siteName}</p>
        {data.title && <p className={cx('line-clamp-2 text-sm font-semibold', onDark ? 'text-white' : 'text-ink')}>{data.title}</p>}
        {data.description && <p className={cx('mt-0.5 line-clamp-2 text-xs', onDark ? 'text-white/80' : 'text-smoke')}>{data.description}</p>}
      </div>
    </a>
  )
}
