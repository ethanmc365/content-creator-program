import { useEffect, useState } from 'react'
import { detectPlatformFromUrl } from '../lib/videoPreview'
import { forgetThumbnail, isStored, resolveThumbnail } from '../lib/videoThumbs'
import { useAuth } from '../context/AuthContext'
import { TIKTOK_PATH, FACEBOOK_PATH } from './PlatformBadges'
import { cx } from '../lib/utils'

// THE FACE OF AN ENTRY, AND SINCE 10 SEP 2026 IT IS THE VIDEO'S OWN.
//
// Ethan: "I really like these preview cards on the tracker. I want you to build
// this function in for the challenges as well - currently the entries just show
// Instagram, TikTok, Instagram as a word. Build in the preview for all of them.
// Start with the UK past challenge and ensure it's also going to update on the
// creators' profiles."
//
// This used to be, deliberately, an orange slab with a platform logo on it, and
// the comment above it said thumbnails were impossible: "Instagram needs a token
// we don't have and the others were inconsistent." Both halves of that have
// since stopped being true - `lib/videoThumbs` knows three routes to a frame and
// `thumb-cache` copies whatever it finds into our own bucket - so the slab is
// now the FALLBACK rather than the design. What a card shows, in order:
//
//   1. `thumbnailUrl` from the row. A permanent URL in our own storage; no
//      request, no expiry, and it is what every viewer gets after the first.
//   2. A frame resolved on the spot (TikTok and YouTube publish tokenless
//      oEmbed; an ADMIN can additionally probe Instagram), which is then copied
//      into storage so nobody has to resolve it again.
//   3. The platform face. Still the right answer for a private post, a dead
//      link, or a platform none of the above can read - it says what the link
//      is rather than pretending there is nothing there.
//
// WHY AN ADMIN IS THE ONE WHO FILLS INSTAGRAM IN. The probe is `view-sync`,
// which holds the session cookies and refuses anybody else. So the first admin
// to open a challenge board caches every Instagram cover on it, permanently,
// for every creator who opens it afterwards. That is not a workaround; it is the
// only place in the system where those credentials exist.
//
// Pure visual block - the caller wraps it in its own button/link so we never nest
// anchors.

// One warm brand-orange face for every platform, with a soft highlight for depth.
const BRAND_FACE = 'bg-[linear-gradient(140deg,#e35410_0%,#d94407_55%,#c23d06_100%)]'
const WARM_GLOW = 'radial-gradient(circle at 82% 16%, rgba(255,255,255,0.22), transparent 60%)'

// EXPORTED, because the video tracker draws its own frame (it carries a rank
// badge and a view count this component knows nothing about) and drew the
// platform as a WORD until 10 Sep. One set of marks, two callers - the
// alternative was a second copy of four brand paths that could drift.
export const PLATFORMS = {
  Instagram: {
    label: 'Instagram',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full" aria-hidden>
        <path d="M12 2.2c3.2 0 3.6 0 4.8.07 3.25.15 4.77 1.69 4.92 4.92.06 1.27.07 1.65.07 4.81s0 3.54-.07 4.81c-.15 3.23-1.66 4.77-4.92 4.92-1.27.06-1.64.07-4.81.07s-3.54 0-4.81-.07c-3.26-.15-4.77-1.7-4.92-4.92C2.2 15.54 2.2 15.17 2.2 12s0-3.54.07-4.81C2.42 3.96 3.94 2.42 7.19 2.27 8.46 2.21 8.84 2.2 12 2.2zm0 3.6a6.2 6.2 0 100 12.4 6.2 6.2 0 000-12.4zm0 2.2a4 4 0 110 8 4 4 0 010-8zm6.4-3.7a1.44 1.44 0 100 2.88 1.44 1.44 0 000-2.88z" />
      </svg>
    ),
  },
  TikTok: {
    label: 'TikTok',
    icon: (
      // Padded viewBox: the TikTok mark fills its full 24x24 grid while the other
      // logos are inset, so without this it renders noticeably larger than them.
      <svg viewBox="-1.5 -1.5 27 27" fill="currentColor" className="h-full w-full" aria-hidden>
        <path d={TIKTOK_PATH} />
      </svg>
    ),
  },
  YouTube: {
    label: 'YouTube',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full" aria-hidden>
        <path d="M23 7.3a3 3 0 00-2.1-2.1C19 4.7 12 4.7 12 4.7s-7 0-8.9.5A3 3 0 001 7.3 31.2 31.2 0 00.5 12 31.2 31.2 0 001 16.7a3 3 0 002.1 2.1c1.9.5 8.9.5 8.9.5s7 0 8.9-.5a3 3 0 002.1-2.1A31.2 31.2 0 0023.5 12 31.2 31.2 0 0023 7.3zM9.8 15.1V8.9L15.9 12l-6.1 3.1z" />
      </svg>
    ),
  },
  Facebook: {
    label: 'Facebook',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full" aria-hidden>
        <path d={FACEBOOK_PATH} />
      </svg>
    ),
  },
  Other: {
    label: 'Watch',
    icon: (
      <svg viewBox="0 0 24 24" fill="currentColor" className="h-full w-full" aria-hidden>
        <path d="M8 5.2v13.6a1 1 0 0 0 1.5.87l11-6.8a1 1 0 0 0 0-1.74l-11-6.8A1 1 0 0 0 8 5.2z" />
      </svg>
    ),
  },
}

// AND THEN THE PLAY MARK WENT ALTOGETHER (10 Sep 2026).
//
// Ethan: "I would actually completely remove the play button from the middle
// and just still have the function there to click anywhere on that, brings up
// that preview video. We can remove the play button because it just covers the
// display."
//
// Two rounds to get here and the second one is the right answer. A white disc
// with an orange triangle was a control drawn over the picture; the triangle
// alone was a smaller control drawn over the same place. But the card is
// already a button - every caller wraps this whole block in one - so the mark
// was never carrying the affordance, it was announcing it. On a wall of covers
// the announcement is the only thing they have in common, and it lands on the
// face every time, because a face is what a vertical video puts in the middle.

/**
 * @param {string} url          the post's URL
 * @param {string} [platform]   as recorded on the row; detected from the URL if absent
 * @param {string} [thumbnailUrl] the row's stored frame, if it has one
 * @param {string} [className]
 */
export default function VideoThumb({ url, platform, thumbnailUrl, className }) {
  const plat = platform || detectPlatformFromUrl(url)
  const p = PLATFORMS[plat] || PLATFORMS.Other
  // An admin is the only caller who can reach the Instagram probe. Read here
  // rather than passed down, because every caller would otherwise have to know
  // about a credential that is none of their business.
  const { isAdmin } = useAuth()

  const [thumb, setThumb] = useState(thumbnailUrl || null)
  const [retried, setRetried] = useState(false)

  useEffect(() => {
    // A frame already in OUR bucket is final: it cannot expire, so there is
    // nothing to go and check. A platform URL on the row is a leftover from
    // before this bucket existed and is re-resolved like anything else.
    if (thumbnailUrl && isStored(thumbnailUrl) && !retried) { setThumb(thumbnailUrl); return undefined }
    let alive = true
    resolveThumbnail(url, { probe: !!isAdmin }).then((found) => {
      if (alive && found) setThumb(found)
    })
    return () => { alive = false }
  }, [url, thumbnailUrl, isAdmin, retried])

  // ONE RETRY, AND ONLY ONE. An expired URL resolves to a new one; a URL that
  // is simply wrong would otherwise loop against an endpoint that keeps saying
  // no. Same rule as the tracker's, which is where it was learned.
  const onError = () => {
    setThumb(null)
    if (retried) return
    forgetThumbnail(url)
    setRetried(true)
  }

  // 4:5 EVERYWHERE, and it is the tracker's measurement rather than a new one:
  // these are all 9:16 videos, and a letterbox strip shows about a third of the
  // picture and takes the third with the face in it. The platform face fills the
  // same box, so a board of entries is one grid whether every frame resolved or
  // none of them did.
  return (
    <div className={cx('group/thumb relative w-full overflow-hidden', thumb ? 'aspect-[4/5] bg-cloud' : cx('aspect-[4/5] text-white', BRAND_FACE), className)}>
      {thumb
        ? (
          <>
            <img
              src={thumb}
              alt=""
              onError={onError}
              referrerPolicy="no-referrer"
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-500 group-hover/thumb:scale-105"
            />
            {/* THE PLATFORM IS ITS OWN MARK, NOT ITS OWN NAME (10 Sep 2026).
                Ethan: "where it says Instagram in the top right corner, or
                TikTok - I would change that to the actual social media brand
                icon, the logo, and have that there instead of just general
                Instagram, TikTok in white and grey. It will look better."

                He is right and there is a reason worth keeping: the word is
                nine characters of grey type on a photograph, which is the one
                thing a corner badge must not be. A logo is read at a glance, at
                a third of the width, and it is the mark people already sort
                these platforms by. `text-ink` rather than each brand's own
                colour - four different accent colours on one grid is a wall of
                confetti, and the disc is what makes it legible on any frame. */}
            <span className="pointer-events-none absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-ink shadow-card backdrop-blur-sm">
              <span className="h-4 w-4">{p.icon}</span>
            </span>
          </>
        )
        : (
          <>
            {/* THE FALLBACK IS THE MARK ON THE ORANGE, AND NOTHING ELSE
                (10 Sep 2026). Ethan, about the handful that had no cover: "if
                there's no possible way to do it, rather than just a generic
                white logo with the TikTok, actually use the brand social media
                logo with the orange card."

                It always drew the logo; what it also drew was the WORD, at
                24px, beside it - which is how a card with no picture ended up
                shouting the one fact the corner badge already carries on every
                card that does have one. The mark alone, large and centred, is a
                placeholder that looks deliberate instead of broken.

                This is now genuinely rare: `thumb-cache` resolves TikTok short
                links, TikTok photo posts and Instagram carousels, which were
                all six of the ones Ethan could see. What is left is a private
                post, a deleted one, or a platform none of the routes know. */}
            <div className="pointer-events-none absolute inset-0" style={{ background: WARM_GLOW }} />
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-black/5" />
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="h-14 w-14 drop-shadow-[0_2px_10px_rgba(0,0,0,0.28)] transition-transform duration-200 group-hover/thumb:scale-105">
                {p.icon}
              </span>
            </div>
          </>
        )}
    </div>
  )
}
