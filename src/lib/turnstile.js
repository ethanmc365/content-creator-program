// Cloudflare Turnstile site key. This is PUBLIC by design - it ships to the
// browser and only identifies the widget; the matching SECRET key lives in
// Supabase Auth's config (backend) and is what actually verifies tokens.
//
// Read from the environment first so the key can be rotated from the Vercel
// dashboard without a code change. On 28 Aug 2026 the previous widget stopped
// serving challenges on Cloudflare's side and login was dead for three days:
// the widget rendered no iframe, fired no callback, and every submit button sat
// disabled at "Verifying..." forever. Rotating without a deploy is the point.
export const TURNSTILE_SITE_KEY =
  import.meta.env.VITE_TURNSTILE_SITE_KEY || '0x4AAAAAADpKtGiPpGJ0wDh-'
