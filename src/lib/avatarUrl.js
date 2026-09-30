// A PHOTO THE SIZE IT IS ACTUALLY DRAWN - WITHOUT THE BILLED TRANSFORM ENDPOINT.
//
// 30 SEP 2026, WHAT CHANGED AND WHY. Supabase told Ethan the project was over its
// plan: "Storage Image Transformations", 100 included, 200 used. That meter counts
// UNIQUE ORIGIN IMAGES put through `/render/image` in a billing month - not
// requests, not sizes. ~170 live profile photos plus every replaced one is past
// 100 the moment each has been drawn once, and it grows with every sign-up. So
// this file no longer calls the transform endpoint at all. The thumbnail is now a
// second small file written at upload time next to the avatar
// (`t-<stamp>.jpg`, 192px), and `thumbUrl` just points at it: a plain object URL,
// which costs nothing and is cached by the CDN like any other file. Existing
// avatars were backfilled once by scripts/backfill-avatar-thumbs.mjs.
//
// Everything below this note that talks about "the transform endpoint" describes
// the earlier version and the measurements that motivated it; the numbers hold.
//
// (original note)
//
// THE BUG. Ethan: "the creator map, it takes a lot of time for the profile
// pictures to load in on the pins."
//
// A map pin draws its avatar in a circle 24 units across. It was fetching the
// original upload to fill it. Measured on production, three avatars picked at
// random from `profiles.photo_url`: 82,743, 44,133 and 85,449 bytes. The
// worldwide map carries about forty pins, so drawing forty 24-pixel circles was
// costing something like two and a half megabytes - on a phone, over whatever
// connection a creator happens to be on, competing with the atlas and the rest
// of the hub. The same three photos through the transform endpoint at pin size
// come to 1,797 bytes and change. Forty-six times smaller, for a circle nobody
// can tell apart at that size.
//
// Supabase Storage will do the resize at the edge and cache it, so this is a
// URL change and nothing else: no upload pipeline, no backfill, and it applies
// to every photo already in the bucket.
//
// IT ONLY EVER REWRITES OUR OWN BUCKET. A profile photo can also be a Google
// account picture from OAuth, and an external URL handed to the transform
// endpoint is a 400, not a smaller picture. Anything that is not a public
// object URL on this project's storage comes back exactly as it went in, so the
// helper is safe to put in front of any `photo_url` in the codebase.
//
// THE CALLER SAYS HOW BIG IT IS DRAWN, IN CSS PIXELS, AND THIS DOUBLES IT.
// Every phone worth worrying about is at least 2x, and a 2x thumbnail of a
// 32px avatar is still under two kilobytes - so the sharp version is cheap
// enough that there is no reason to ship the soft one.

const OBJECT = '/storage/v1/object/public/'
// `<base>/storage/v1/object/public/avatars/<uid>/avatar-<stamp>.<ext>`
const AVATAR = /^(.*\/storage\/v1\/object\/public\/avatars\/[^/?#]+\/)avatar-(\d+)\.[a-z0-9]+$/i

/** Longest side, in CSS px, a thumbnail can serve. The file is 192 wide (3x of 64). */
export const THUMB_MAX_PX = 64
export const THUMB_PX = 192

/**
 * @param url  a `profiles.photo_url` (or any image URL, or nothing)
 * @param px   how wide it is drawn, in CSS pixels
 * @returns    the small sibling file when one can exist, else `url` untouched
 */
export function thumbUrl(url, px) {
  if (!url || typeof url !== 'string') return url
  // Anything drawn larger than the thumbnail can carry keeps the original (it is
  // stored at 512px, so nothing is lost by not shrinking it).
  if (px > THUMB_MAX_PX) return url
  if (!url.includes(OBJECT) || url.includes('?')) return url
  const m = url.match(AVATAR)
  if (!m) return url
  return `${m[1]}t-${m[2]}.jpg`
}

/**
 * The 192px square JPEG that goes beside a freshly uploaded avatar as `t-<stamp>.jpg`.
 * Returns null when the browser cannot make one - the caller then simply has no thumbnail
 * and `Avatar` falls back to the original.
 */
export async function makeThumbBlob(blob) {
  try {
    const bmp = await createImageBitmap(blob)
    const side = Math.min(bmp.width, bmp.height)
    const canvas = document.createElement('canvas')
    canvas.width = THUMB_PX
    canvas.height = THUMB_PX
    const ctx = canvas.getContext('2d')
    ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, THUMB_PX, THUMB_PX)
    bmp.close?.()
    return await new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.85))
  } catch {
    return null
  }
}
