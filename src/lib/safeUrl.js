// Links built from stored data (a creator's video link, a portfolio link, a meeting URL) pass through here before
// they become an href. Only web addresses survive: a `javascript:` or `data:` link saved through the API would
// otherwise run in the app's origin when somebody clicks it. Returns undefined, so React drops the attribute.
export function safeUrl(value) {
  const raw = String(value ?? '').trim()
  if (!raw) return undefined
  if (raw.startsWith('/') && !raw.startsWith('//')) return raw
  try {
    const u = new URL(raw)
    return u.protocol === 'https:' || u.protocol === 'http:' ? raw : undefined
  } catch {
    return undefined
  }
}
