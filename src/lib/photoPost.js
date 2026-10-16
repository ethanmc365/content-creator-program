// Is this link a photo post? Asked by both submit forms before an entry is saved (see `postKindOf`).
import { supabase } from './supabase'
import { notice } from './confirm'
import { platformOf, postKindOf } from './videoLinks'

/** 'photo' | 'video' | 'unknown'. Never throws, never waits more than `ms`: a slow answer lets the entry through. */
export async function photoPostKind(url, ms = 9000) {
  const kind = postKindOf(url)
  if (kind === 'photo') return 'photo'
  if (kind !== 'check') return 'video'
  try {
    const ask = supabase.functions.invoke('view-sync', { body: { check: url } }).then(({ data, error }) => (error ? 'unknown' : data?.kind || 'unknown'))
    const late = new Promise((resolve) => { setTimeout(() => resolve('unknown'), ms) })
    return await Promise.race([ask, late])
  } catch {
    return 'unknown'
  }
}

/** The pop-up a refused photo post gets, in the creator's language (`tr` from the calling component). */
export function refusePhotoPost(url, tr) {
  const instagram = platformOf(url) === 'Instagram'
  return notice(
    instagram
      ? tr('Only Instagram Reels count. Photo posts and carousels have no view count, so they cannot be entered. Post it as a Reel, then paste the Reel link.')
      : tr('Only Facebook Reels and videos count. Photo and text posts have no view count, so they cannot be entered. Open your Reel, tap Share, then Copy link.'),
    { title: tr('Photo posts do not count'), confirmLabel: tr('Got it') },
  )
}
