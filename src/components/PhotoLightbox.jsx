import { createPortal } from 'react-dom'
import { useCallback, useEffect, useState } from 'react'
import Icon from './Icon'
import { cx } from '../lib/utils'
import { saveFile, fileNameFromUrl } from '../lib/media'

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
// IT TAKES VIDEO TOO, because a chat attachment is one or the other and
// "open this full screen, in the app" is the same request either way. A video
// keeps its controls and starts playing; nothing else about the layer changes.
//
// `shape="circle"` KEEPS A PROFILE PHOTO ROUND (1 Sep 2026). Ethan: "when
// clicking on a profile photo on the profile page, it should open up the photo
// in a big view but still the same circle shape." An avatar is cropped to a
// circle everywhere else in the product; opening it as a rectangle shows a
// composition nobody framed, usually with the top of a head cut off by a corner
// the round mask was hiding.
//
// `onSave` PUTS IT IN THE CAMERA ROLL. Ethan: "when viewing a photo in full
// screen there should be the icon with save so you can save it to your camera
// roll easily from there too." See lib/media - it goes through the share sheet
// on a phone, which is the only route that reaches Photos on iOS.
export default function PhotoLightbox({
  src, alt = '', kind = 'image', shape = 'rect', canSave = false, fileName = '', onClose,
}) {
  const [saving, setSaving] = useState(false)
  const [saveNote, setSaveNote] = useState('')

  // `saveFile` fetches the bytes and hands a real File to the SHARE SHEET,
  // whose "Save Image" is the only route to the iOS camera roll - a bare URL
  // share offers "Copy link" and nothing else. Desktop falls through to an
  // ordinary download. Same helper the resource library and the chat use, so
  // there is one answer to "save this" in the product.
  const save = useCallback(async () => {
    if (saving) return
    setSaving(true)
    let ok
    try {
      ok = await saveFile(src, fileName || fileNameFromUrl(src))
    } catch {
      ok = false
    }
    setSaving(false)
    setSaveNote(ok ? 'Saved' : 'Opened in a new tab')
    setTimeout(() => setSaveNote(''), 2200)
  }, [src, fileName, saving])

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
      aria-label={kind === 'video' ? 'Video' : 'Photo'}
    >
      {/* The backdrop is the close target and the image is not, so a press on
          the photograph itself does not dismiss the thing you are looking at. */}
      <button type="button" aria-label="Close" onClick={onClose} className="absolute inset-0" />
      {kind === 'video' ? (
        // NOT `pointer-events-none` on this one: the controls have to be
        // reachable, which is the whole reason for showing a video here at all.
        <video
          src={src}
          controls
          autoPlay
          playsInline
          className="relative max-h-full max-w-full rounded-card object-contain"
        />
      ) : (
        <img
          src={src}
          alt={alt}
          className={cx(
            'pointer-events-none relative',
            shape === 'circle'
              // A SQUARE BOX, `object-cover`, ROUNDED FULLY. `object-contain`
              // inside a circle would letterbox the photograph and then clip
              // the letterbox, which crops MORE than the avatar does rather
              // than the same amount. Cover reproduces exactly the crop the
              // small avatar was already showing, bigger.
              ? 'aspect-square h-auto w-full max-w-[min(78vw,78vh)] rounded-full object-cover shadow-lift ring-4 ring-white/15'
              : 'max-h-full max-w-full rounded-card object-contain',
          )}
        />
      )}
      <div
        className="absolute right-4 flex items-center gap-2"
        style={{ top: 'calc(env(safe-area-inset-top) + 1rem)' }}
      >
        {canSave && (
          <button
            type="button"
            onClick={save}
            disabled={saving}
            aria-label="Save this photo"
            title="Save"
            className="flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-2.5 text-sm font-semibold text-white backdrop-blur transition-transform duration-200 hover:scale-105 active:scale-95 disabled:opacity-60"
          >
            <Icon name="arrow-down" className="h-5 w-5" />
            {saveNote || (saving ? 'Saving…' : 'Save')}
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close photo"
          className="rounded-full bg-white/15 p-2.5 text-white backdrop-blur transition-transform duration-200 hover:scale-110 active:scale-95"
        >
          <Icon name="close" className="h-5 w-5" />
        </button>
      </div>
    </div>,
    document.body,
  )
}
