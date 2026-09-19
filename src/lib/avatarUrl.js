// A PHOTO THE SIZE IT IS ACTUALLY DRAWN.
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
const RENDER = '/storage/v1/render/image/public/'

/**
 * @param url  a `profiles.photo_url` (or any image URL, or nothing)
 * @param px   how wide it is drawn, in CSS pixels
 * @returns    a resized URL when we can make one, else `url` untouched
 */
export function thumbUrl(url, px) {
  if (!url || typeof url !== 'string') return url
  // Already transformed - a caller that passes one of our own outputs back in
  // must not end up with two query strings.
  if (url.includes(RENDER)) return url
  const at = url.indexOf(OBJECT)
  if (at === -1) return url
  // A URL that already carries a query is not one of ours to rewrite; appending
  // to it would be guesswork about what the existing parameters mean.
  if (url.includes('?')) return url
  const size = Math.max(16, Math.round(px * 2))
  // `cover` rather than `contain`: every avatar in this app is drawn in a
  // circle, so the crop is what the reader sees anyway and letterboxing would
  // put bars inside the ring.
  return `${url.slice(0, at)}${RENDER}${url.slice(at + OBJECT.length)}?width=${size}&height=${size}&resize=cover&quality=75`
}
