import { Link } from 'react-router-dom'

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
