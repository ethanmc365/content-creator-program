// WHAT A CREATOR TYPED INTO "INSTAGRAM" IS NOT ALWAYS A LINK.
//
// Ethan (24 Sep 2026): "I click on the social media icon to see their account,
// like Instagram or TikTok. For a few creators this opens the correct link, but
// other times it just shows a screen saying 'creator not found'."
//
// Counted against prod the same day: of the active creators, a third had saved
// something other than a full URL in at least one platform field - a bare
// handle (`elviajedemartaa`), an at-handle (`@saddnoe`), or a link with no
// scheme (`instagram.com/travelwithkatb`). Every one of those went straight
// into `href`, and a browser reads a scheme-less href as a path RELATIVE TO THE
// PAGE. On `/profile/<id>` that is `/profile/elviajedemartaa`, which the
// profile route resolves as a creator id, finds nobody, and says so. The link
// was never leaving the app.
//
// So every platform link is built here, from what was typed and the platform
// it was typed into:
//
//   https://...                    kept (TikTok gains its missing `@`)
//   instagram.com/sam, www.x/y     https:// added
//   @sam, sam                      the platform's own profile URL for "sam"
//
// Returns null for anything that cannot be turned into a link, so a caller can
// drop it rather than draw a button that goes nowhere.

const PROFILE_URL = {
  instagram: (h) => `https://www.instagram.com/${h}/`,
  tiktok: (h) => `https://www.tiktok.com/@${h}`,
  youtube: (h) => `https://www.youtube.com/@${h}`,
  facebook: (h) => `https://www.facebook.com/${h}`,
  linkedin: (h) => `https://www.linkedin.com/in/${h}`,
}

// A platform's own domain, written without a scheme - `instagram.com/sam`.
// Checked by name rather than by "has a dot", because an Instagram handle may
// legally contain dots (`andreasins.dermoestetica`) and is still a handle.
const PLATFORM_HOST = /^(www\.|m\.)?(instagram|tiktok|youtube|youtu|facebook|fb|linkedin|twitter|threads|pinterest)\.[a-z.]+(\/|\?|$)/i

// TikTok's profile paths are `/@handle`. `tiktok.com/sam` is a 404 on TikTok,
// which is as broken as our own "not found" from the creator's point of view.
const TIKTOK_PATHS = /^(video|t|v|tag|music|discover|embed|share|live|search|foryou|explore|legal|about)(\/|$)/i

function fixTikTok(href) {
  try {
    const u = new URL(href)
    if (!/(^|\.)tiktok\.com$/i.test(u.hostname) || /^(vm|vt)\./i.test(u.hostname)) return href
    const path = u.pathname.replace(/^\/+/, '')
    if (!path || path.startsWith('@') || TIKTOK_PATHS.test(path)) return href
    u.pathname = `/@${path}`
    return u.toString()
  } catch {
    return href
  }
}

/**
 * The link to open for something typed into a platform field.
 * @param {string} value     what the creator saved
 * @param {string} [platform] instagram | tiktok | youtube | facebook | linkedin
 * @returns {string|null}
 */
export function socialHref(value, platform) {
  const raw = String(value ?? '').trim()
  if (!raw) return null
  if (/^https?:\/\//i.test(raw)) return fixTikTok(raw)
  if (/^mailto:/i.test(raw)) return raw
  if (/^\/\//.test(raw)) return fixTikTok(`https:${raw}`)

  const key = String(platform || '').toLowerCase()
  // Anything with a path, or naming a platform's domain, is a link missing its
  // scheme. A bare word typed into a named platform field is a handle.
  if (raw.includes('/') || PLATFORM_HOST.test(raw) || !PROFILE_URL[key]) {
    // A free-form link with no dot anywhere is not a web address at all.
    if (!/\.[a-z]{2,}/i.test(raw)) return null
    return fixTikTok(`https://${raw.replace(/^\/+/, '')}`)
  }

  const handle = raw.replace(/^@+/, '').replace(/\s+/g, '')
  if (!handle) return null
  return PROFILE_URL[key](encodeURIComponent(handle).replace(/%2E/gi, '.'))
}

/** A free-form link (other_links, a website) made safe to put in an href. */
export function linkHref(value) {
  return socialHref(value, null)
}
