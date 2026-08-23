// LINKS THAT SOMEBODY ELSE TYPED.
//
// THE HOLE THIS CLOSES, because it was a real one.
//
// Half a dozen fields on this platform are a URL that one person types and
// another person - often an admin - later clicks: the three social links and
// the free `other_links` on a profile, the video link on a challenge entry, a
// job's apply link, an event's meeting link, a feedback screenshot. Every one of
// them was going straight into `href={...}`.
//
// `javascript:` is a URL scheme. A creator who set
//
//     other_links: [{ label: 'My site', url: 'javascript:fetch("https://x/"+t)' }]
//
// had a link on their own public profile that ran their code in OUR origin,
// with our session in localStorage, the moment an admin opened the profile to
// review them. React 19 refuses those URLs; React 18 - which is what this app
// runs - only warns in development and renders them in production. So the
// framework was not saving us and nothing else was checking.
//
// THE RULE IS AN ALLOW-LIST, NOT A BLOCKLIST. `javascript:` is the famous one,
// but `data:` (a whole HTML document inline) and `vbscript:` do the same job,
// and any blocklist is one obscure scheme away from being wrong. Only http and
// https get through, plus mailto and tel where a caller explicitly asks for
// them (the team contact card does).

// Whitespace and C0/C1 control characters, which is how "java\tscript:" sneaks
// past a naive parser: a browser strips them before it resolves the scheme, so
// they have to be stripped BEFORE we decide what the scheme is. The lint rule
// against control characters in a regex exists to catch them arriving by
// accident; here they are the entire point.
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0020\u007f-\u009f]/g

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i

/**
 * The URL, if it is safe to put in an href. `undefined` otherwise, because
 * `<a href={undefined}>` renders an anchor with no href - text rather than a
 * broken link.
 *
 * @param {unknown} value
 * @param {{ allow?: string[] }} [opts]
 * @returns {string|undefined}
 */
export function safeUrl(value, { allow = ['http:', 'https:'] } = {}) {
  if (typeof value !== 'string') return undefined
  const cleaned = value.replace(CONTROL, '')
  if (!cleaned) return undefined
  try {
    // A bare "example.com" has no scheme and would throw. Treat it as https,
    // which is what somebody typing their own website means.
    const url = new URL(HAS_SCHEME.test(cleaned) ? cleaned : `https://${cleaned}`)
    return allow.includes(url.protocol) ? url.toString() : undefined
  } catch {
    return undefined
  }
}

/** True when a value is a link this app is willing to render. */
export const isSafeUrl = (value, opts) => safeUrl(value, opts) !== undefined

/**
 * The same check, for the places that ask a person for a link and should say no
 * at the time of typing rather than silently dropping it later. Returns an
 * error string, or '' when the value is fine (an empty value is fine - use
 * `required` for that).
 */
export function urlProblem(value) {
  if (!value || !String(value).trim()) return ''
  return safeUrl(value) ? '' : 'That needs to be a normal web address starting http:// or https://'
}
