import { createPortal } from 'react-dom'
import { useEffect } from 'react'
import Icon from './Icon'

// ONE PHOTOGRAPH, OVER EVERYTHING, AND "EVERYTHING" HAS TO INCLUDE THE MODAL
// IT WAS OPENED FROM.
//
// THE BUG: "when I click on a logged trip at the bottom and it shows up the
// card and the photo, when I click full size on the photo it appears but
// appears BEHIND the card and can't be seen."
//
// The lightbox was a `fixed inset-0 z-[90]` div written inline in the page. The
// trip sheet it opens from is a `Modal`, and `Modal` renders through
// `createPortal` into `document.body` at z-50. Those two numbers are not
// comparable: z-index only orders siblings within the same stacking context,
// and the page's own layer (any ancestor with a transform - and this app puts
// `Reveal` transforms up and down every page - starts one) is itself painted
// under the body-level portal. So a 90 inside the page loses to a 50 on the
// body every time, and no amount of raising the number would have fixed it.
//
// The fix is the same one Modal already made: go to the body. Once both layers
// are children of `document.body` the z-indexes finally mean what they say, and
// 120 sits above the modal's 50 on desktop and on a phone alike.
//
// Escape closes it, and it takes the body scroll lock for as long as it is up.
export default function PhotoLightbox({ src, alt = '', onClose }) {
  useEffect(() => {
    if (!src) return undefined
    const onKey = (e) => { if (e.key === 'Escape') onClose?.() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [src, onClose])

  if (!src) return null

  return createPortal(
    <div
      className="animate-fade-up fixed inset-0 z-[120] flex items-center justify-center bg-ink/90 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="Photo"
    >
      {/* The backdrop is the close target and the image is not, so a press on
          the photograph itself does not dismiss the thing you are looking at. */}
      <button type="button" aria-label="Close photo" onClick={onClose} className="absolute inset-0" />
      <img src={src} alt={alt} className="pointer-events-none relative max-h-full max-w-full rounded-card object-contain" />
      <button
        type="button"
        onClick={onClose}
        aria-label="Close photo"
        className="absolute right-4 top-4 rounded-full bg-white/15 p-2.5 text-white backdrop-blur transition-transform duration-200 hover:scale-110 active:scale-95"
        style={{ top: 'calc(env(safe-area-inset-top) + 1rem)' }}
      >
        <Icon name="close" className="h-5 w-5" />
      </button>
    </div>,
    document.body,
  )
}
