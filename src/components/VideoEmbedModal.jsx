import { useEffect } from 'react'
import { videoEmbed } from '../lib/videoPreview'
import { cx } from '../lib/utils'

// A media-focused lightbox that plays a submitted entry INSIDE the platform:
// YouTube / TikTok / Instagram all embed via their tokenless iframe players, so
// creators watch without being bounced out to another app. Vertical formats
// (Reels / TikTok) get a portrait frame; regular YouTube gets 16:9. When a link
// can't be embedded we still show a clean "Open on <platform>" fallback.
export default function VideoEmbedModal({ url, platform, title, onClose }) {
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const embed = videoEmbed(url)
  const label = platform || embed?.type || 'the original post'

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={title || 'Video'}>
      <button aria-label="Close" className="absolute inset-0 bg-ink/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 flex w-full max-w-md flex-col">
        <div className="mb-3 flex items-center justify-between gap-3 text-white">
          <span className="min-w-0 truncate text-sm font-medium">{title}</span>
          <button onClick={onClose} aria-label="Close" className="shrink-0 rounded-full bg-white/15 p-2 text-white transition-colors hover:bg-white/25">
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
        </div>

        {embed ? (
          <div className={cx(
            'mx-auto w-full overflow-hidden rounded-2xl bg-black shadow-lift',
            embed.vertical ? 'aspect-[9/16] max-w-[380px]' : 'aspect-video'
          )}>
            <iframe
              src={embed.embedUrl}
              title={title || 'Video'}
              className="h-full w-full"
              allow="autoplay; encrypted-media; picture-in-picture; fullscreen; clipboard-write"
              allowFullScreen
              loading="lazy"
              referrerPolicy="strict-origin-when-cross-origin"
            />
          </div>
        ) : (
          <div className="mx-auto w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-lift">
            <p className="text-sm text-smoke">This video can't be played inline here.</p>
          </div>
        )}

        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="mx-auto mt-4 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-white/25"
        >
          Open on {label}
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 17L17 7M7 7h10v10" /></svg>
        </a>
      </div>
    </div>
  )
}
