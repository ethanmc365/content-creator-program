import { Link } from 'react-router-dom'

// Plain, readable layout for the public legal pages (privacy, terms).
export default function LegalShell({ title, updated, children }) {
  return (
    <div className="min-h-screen bg-cloud/40 px-5 py-10 sm:py-16">
      <div className="mx-auto max-w-3xl">
        <Link to="/" className="mb-8 inline-flex items-center gap-2">
          <img src="/brand/tryp-logo.png" alt="Tryp.com" className="h-9 rounded-lg shadow-card" />
        </Link>
        <div className="card !p-8 sm:!p-12">
          <h1 className="text-3xl font-bold">{title}</h1>
          {updated && <p className="mt-2 text-sm text-smoke">Last updated: {updated}</p>}
          <div className="legal mt-8 space-y-6 text-sm leading-relaxed text-ink/90">{children}</div>
        </div>
        <p className="mt-6 text-center text-xs text-smoke">
          <Link to="/privacy" className="hover:text-brand">Privacy Policy</Link>
          <span className="px-2">·</span>
          <Link to="/terms" className="hover:text-brand">Terms of Service</Link>
          <span className="px-2">·</span>
          <Link to="/" className="hover:text-brand">Back to site</Link>
        </p>
      </div>
    </div>
  )
}

// Small helpers to keep the content readable.
export function H2({ children }) {
  return <h2 className="!mt-8 text-lg font-semibold text-ink">{children}</h2>
}
