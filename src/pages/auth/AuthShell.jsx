import { Link } from 'react-router-dom'
import { useT } from '../../lib/i18n'

// Shared frame for all auth pages: centered card, logo on top,
// lots of breathing room.
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-cloud/50 px-5 py-12">
      <Link to="/" className="mb-8">
        <img src="/brand/tryp-logo.png" alt="Tryp.com" className="h-14 rounded-2xl shadow-card" />
      </Link>

      <div className="w-full max-w-md rounded-card bg-white p-8 shadow-card sm:p-10">
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-2 text-sm text-smoke">{subtitle}</p>}
        <div className="mt-8">{children}</div>
      </div>

      {footer && <div className="mt-6 text-sm text-smoke">{footer}</div>}
    </div>
  )
}

// THE CAPTCHA, WHEN NOBODY IS SIGNING UP.
//
// The auth pages are rendered live inside the admin Testing Centre so the
// public front door can be shown without leaving the app. A real Turnstile
// widget there would call Cloudflare on every render of a demonstration, and a
// solved token nobody submits is a token wasted. The demo swaps in this: same
// space, same position in the form, obviously inert.
export function DemoCaptcha() {
  const tr = useT()
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed border-gray-200 bg-cloud/60 px-4 py-3.5">
      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white text-[10px] font-bold text-smoke ring-1 ring-gray-200">CF</span>
      <span className="text-xs text-smoke">{tr("Cloudflare Turnstile sits here on the live pages.")}</span>
    </div>
  )
}

