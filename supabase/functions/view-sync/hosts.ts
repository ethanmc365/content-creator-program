// Which hosts the scraper may talk to. Pure, so it is unit tested (hosts.test.ts) without starting the server.
export type Platform = 'TikTok' | 'Instagram' | 'YouTube' | 'Facebook'

export function platformOf(host: string): Platform | null {
  if (/(^|\.)tiktok\.com$/i.test(host)) return 'TikTok'
  if (/(^|\.)instagram\.com$/i.test(host)) return 'Instagram'
  if (/(^|\.)(youtube\.com|youtu\.be|youtube-nocookie\.com)$/i.test(host)) return 'YouTube'
  if (/(^|\.)(facebook\.com|fb\.com|fb\.watch|fb\.me)$/i.test(host)) return 'Facebook'
  return null
}

// EVERY REQUEST AND EVERY REDIRECT HOP STAYS ON A PLATFORM HOST. The URLs here come from creators, and
// `redirect: 'follow'` would let a platform redirect (Facebook's link shim, an app-store bounce) send this
// server anywhere. Redirects are walked by hand and each hop is checked before it is requested.
const API_HOSTS = /(^|\.)googleapis\.com$/i
export function fetchHostAllowed(raw: string): boolean {
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false
    return platformOf(u.hostname) !== null || API_HOSTS.test(u.hostname)
  } catch {
    return false
  }
}

