// WHERE A SIGN-UP CAME FROM (14 Oct 2026, migration 415), for Recruitment analytics.
//
// FIRST TOUCH: the first page somebody lands on (before they have an account) is remembered on this device, and
// onboarding writes it onto the profile once. `?utm_source=` wins, then `?ref=`/`?via=`, then the referring site, then
// "direct". Only names and paths, never anything personal.
const KEY = 'tryp_signup_src'

const SITES = [
  [/instagram\.com|l\.instagram/, 'instagram'], [/tiktok\.com/, 'tiktok'], [/facebook\.com|fb\.com|l\.facebook/, 'facebook'],
  [/youtube\.com|youtu\.be/, 'youtube'], [/linkedin\.com|lnkd\.in/, 'linkedin'], [/google\./, 'google'],
  [/whatsapp|wa\.me/, 'whatsapp'], [/t\.co$|twitter\.com|x\.com/, 'x'], [/tryp\.com/, 'tryp.com'],
]

export function sourceFrom(href, referrer) {
  let url
  try { url = new URL(href) } catch { return null }
  const q = url.searchParams
  const ref = (() => { try { return referrer ? new URL(referrer).hostname.replace(/^www\./, '') : '' } catch { return '' } })()
  const fromSite = ref && ref !== url.hostname ? (SITES.find(([re]) => re.test(ref))?.[1] || ref) : null
  const source = (q.get('utm_source') || q.get('ref') || q.get('via') || fromSite || 'direct').toLowerCase().slice(0, 60)
  return {
    source,
    medium: (q.get('utm_medium') || (fromSite ? 'referral' : null))?.slice(0, 60) || null,
    campaign: q.get('utm_campaign')?.slice(0, 80) || null,
    landing: url.pathname.slice(0, 80),
    at: new Date().toISOString(),
  }
}

/** A recruiter link (/r/<code>, migration 449): the code, or null. */
export function recruiterCode(pathname) {
  const m = String(pathname || '').match(/^\/r\/([a-z0-9][a-z0-9-]{1,38}[a-z0-9])\/?$/i)
  return m ? m[1].toLowerCase() : null
}

/** Called once per page load before sign-in; keeps the FIRST touch only - except a recruiter's own link, which wins:
 *  somebody who saw an Instagram post and then signed up through Paula's link was recruited by Paula. */
export function rememberSignupSource() {
  try {
    const code = recruiterCode(window.location.pathname)
    if (code) {
      localStorage.setItem(KEY, JSON.stringify({ source: 'recruiter', medium: 'link', campaign: code, landing: window.location.pathname.slice(0, 80), at: new Date().toISOString() }))
      return
    }
    if (localStorage.getItem(KEY)) return
    const s = sourceFrom(window.location.href, document.referrer)
    if (s) localStorage.setItem(KEY, JSON.stringify(s))
  } catch { /* private mode: no source, nothing breaks */ }
}

export function storedSignupSource() {
  try { return JSON.parse(localStorage.getItem(KEY) || 'null') } catch { return null }
}
