import { useCallback, useEffect, useState } from 'react'
import { mediaType } from '../lib/media'
import VideoPlayer from './VideoPlayer'
import { useT } from '../lib/i18n'

/**
 * Scale a picture's own dimensions into a maxW x maxH box, keeping the ratio.
 * Same arithmetic VideoPlayer does; there is one right answer and both should
 * give it. Lifted out of the component so the FIRST render can use it on the
 * stored dimensions, before there is any image to measure.
 */
function fit(iw, ih, maxW, maxH) {
  let w = Math.min(maxW, iw)
  let h = Math.round(w / (iw / ih))
  if (h > maxH) { h = maxH; w = Math.round(h * (iw / ih)) }
  return { w, h }
}

// A chat / DM attachment (image or video). Videos use the browser's native
// <video controls> (reliable play button + inline playback everywhere, incl.
// iOS) with a real captured poster frame. A LONG-PRESS (or right-click on
// desktop) on either opens a small menu to Open full screen or Save it. Saving
// routes through saveFile: mobile share sheet ("Save Image/Video" to the camera
// roll), desktop download.
//
// `kind` ('image' | 'video') is passed explicitly by the caller (an optimistic
// blob: URL has no extension to sniff); falls back to the extension otherwise.
//
// A PHOTO IS THE SHAPE IT WAS TAKEN IN.
//
// THE BUG THIS FIXES. The image was `w-full … object-cover` inside the bubble,
// which is two separate mistakes compounding. `w-full` says "be as wide as the
// bubble whatever you are", and `object-cover` then CROPS whatever does not fit
// that box - so a portrait photo sent from a phone arrived on a desktop as a
// letterbox strip cut out of its middle, with the top and bottom of the picture
// simply gone. Ethan: "on PC when a vertical photo is sent it's all cropped and
// just shows a landscape piece of it."
//
// So the image is fitted the same way VideoPlayer already fits video: measure
// the natural size, scale it to fit inside a maxW x maxH box, and give the
// wrapper that exact box. Landscape comes out landscape, portrait comes out
// portrait, and nothing is ever cut off. The box is applied to the WRAPPER, and
// as an `aspect-ratio` before the pixels arrive, so the message does not jump
// when the photo decodes - which matters because every chat here re-pins its
// scroller on image load.
// A TAP ON A PHOTO OPENS THE MESSAGE BAR, LIKE A TAP ON ANY OTHER MESSAGE
// (1 Sep 2026).
//
// Ethan: "a tap on a photo, for desktop and mobile should show up below the
// icons to react, reply, delete, report, but since its a photo it should also
// show up the icon to download the photo and another icon to view it full
// screen."
//
// This replaces two competing answers to one press. A tap used to open the
// picture full screen and a LONG press opened a bespoke three-item sheet, which
// meant a photograph was the one message on the platform you could not simply
// press to get its actions - and the way to reach them was a gesture nothing
// told you about and which does not exist on a desktop at all.
//
// So the picture no longer decides anything. It reports the tap and the PAGE
// opens the same bar every other message uses, with two extra actions on it for
// media. One control, one place, and "view it full screen" is now a labelled
// button rather than a side effect of touching the thing.
//
// The long-press sheet and this component's own lightbox and Save are GONE with
// it: every one of them is an entry in that bar now, and keeping a second route
// to the same three actions is how the two drift.
export default function ChatMedia({ url, alt, kind, w = null, h = null, maxW = 260, maxH = 380, onTap }) {
  const tr = useT()
  const isVideo = (kind || mediaType(url)) === 'video'

  // THE BOX IS KNOWN BEFORE THE PICTURE IS (migration 163).
  //
  // Every attachment sent from now on carries its own width and height, so the
  // fitted box is computed on the FIRST render, with no load and no reflow -
  // which is the whole reason a thread stops jumping while it opens. See the
  // migration for the mechanism; in short, an <img> with no dimensions is a
  // zero-height box until its bytes decode, so a thread full of photographs is
  // the wrong height at exactly the moment it is being scrolled to the bottom.
  //
  // Messages sent BEFORE that migration have no numbers, and they still get the
  // measure-on-load path below - so nothing already in a thread changes.
  const [box, setBox] = useState(() => (w && h ? fit(w, h, maxW, maxH) : null))

  const measure = useCallback((img) => {
    const iw = img?.naturalWidth
    const ih = img?.naturalHeight
    if (!iw || !ih) return
    setBox(fit(iw, ih, maxW, maxH))
  }, [maxW, maxH])

  // A stored shape can arrive after mount (a queued message being replaced by
  // the real row), so follow it rather than only seeding from it.
  useEffect(() => { if (w && h) setBox(fit(w, h, maxW, maxH)) }, [w, h, maxW, maxH])

  // A CACHED IMAGE CAN BE DECODED BEFORE `onLoad` EXISTS.
  //
  // Scrolling back up a conversation re-mounts rows whose pictures are already
  // in the browser cache, and for those the load event has come and gone by the
  // time React attaches a handler - so the measurement would never happen and
  // the photo would sit in its unmeasured fallback for ever. `complete` is the
  // question "has this already finished", and asking it on mount is the only
  // way to catch that case. The node goes in state so the effect re-runs when
  // the row is genuinely remounted.
  const [imgEl, setImgEl] = useState(null)
  useEffect(() => {
    if (imgEl?.complete) measure(imgEl)
  }, [imgEl, measure, url])

  return (
    <div
      className="relative select-none"
      // The WRAPPER carries the fitted width, not just the image, for two
      // reasons: the bubble is shrink-to-fit, so a portrait photo should make a
      // narrow bubble rather than a narrow photo in a wide one, and anything
      // laid over the picture (a spinner, a badge) then has the picture's own
      // box to sit in rather than the bubble's empty space beside it.
      style={{ WebkitTouchCallout: 'none', ...(box && !isVideo ? { width: box.w, maxWidth: '100%' } : null) }}
    >
      {isVideo ? (
        <VideoPlayer url={url} maxW={maxW} maxH={maxH} />
      ) : (
        <button
          type="button"
          aria-label={tr("Show what you can do with this photo")}
          onClick={onTap}
          className="block w-full"
        >
          <img
            ref={setImgEl}
            src={url}
            alt={alt || 'Shared image'}
            loading="lazy"
            draggable={false}
            onLoad={(e) => measure(e.currentTarget)}
            // `object-contain`, never `cover`: this box IS the picture's own
            // ratio, so there is nothing to crop, and if a measurement ever
            // failed the honest failure is a letterboxed photo rather than a
            // silently cropped one.
            className="h-auto w-full rounded-xl bg-cloud object-contain"
            // BEFORE THE PIXELS ARRIVE, the width is capped at the same maxW
            // the measured box will use. Without that cap `w-full` means the
            // whole bubble, so a photo would paint at 600px wide and then jump
            // to 260 the instant it decoded - a jump every chat here would then
            // try to correct for with its scroll re-pinning.
            style={box
              ? { aspectRatio: `${box.w} / ${box.h}` }
              : { maxWidth: maxW, maxHeight: maxH }}
          />
        </button>
      )}
    </div>
  )
}
