import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar } from '../components/ui'
import { formatMoney } from '../lib/utils'

// Public landing page - bright, spacious, one clear focal point per section.
// Live stats come from the public landing_stats() / featured_creators() RPCs;
// graceful placeholders are used until the database is connected.
const TRYP_URL = 'https://www.tryp.com' // TODO: confirm the main site URL

export default function Landing() {
  const { user, loading } = useAuth()
  const [stats, setStats] = useState({ creators: 40, challenges: 6, prizes: 4500 })
  const [featured, setFeatured] = useState([])

  useEffect(() => {
    supabase.rpc('landing_stats').then(({ data }) => {
      if (data) setStats(data)
    })
    supabase.rpc('featured_creators').then(({ data }) => {
      if (data) setFeatured(data)
    })
  }, [])

  // Already signed in? Straight to the app.
  if (!loading && user) return <Navigate to="/home" replace />

  return (
    <div className="bg-white">
      {/* ---------- Nav ---------- */}
      <header className="sticky top-0 z-30 border-b border-gray-100 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <img src="/brand/tryp-logo.png" alt="Tryp.com" className="h-9 rounded-lg" />
          <nav className="flex items-center gap-2 sm:gap-3">
            <a href={TRYP_URL} target="_blank" rel="noopener noreferrer" className="hidden text-sm font-medium text-smoke hover:text-ink sm:block">
              Tryp.com ↗
            </a>
            <Link to="/login" className="btn-ghost !py-2">Log in</Link>
            <Link to="/signup" className="btn-primary !py-2">Sign up</Link>
          </nav>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="mx-auto max-w-6xl px-5 pb-24 pt-20 text-center sm:px-8 sm:pt-32">
        <p className="mx-auto mb-6 inline-block rounded-full bg-brand-tint px-4 py-1.5 text-xs font-semibold text-brand">
          Tryp.com Content Creator Program
        </p>
        <h1 className="mx-auto max-w-3xl text-5xl font-bold leading-[1.1] tracking-tight sm:text-7xl">
          Create. Travel. <span className="text-brand">Earn.</span>
        </h1>
        <p className="mx-auto mt-8 max-w-xl text-lg leading-relaxed text-smoke">
          Join the official community of travel creators making content with Tryp.com.
          Compete in challenges, win cash and travel vouchers, get offered full time roles
          and grow alongside other travel creators.
        </p>
        <div className="mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link to="/signup" className="btn-primary !px-10 !py-4 !text-base">Become a creator</Link>
          <Link to="/login" className="btn-secondary !px-10 !py-4 !text-base">Log in</Link>
        </div>
      </section>

      {/* ---------- Stats ---------- */}
      <section className="border-y border-gray-100 bg-cloud/50">
        <div className="mx-auto grid max-w-4xl grid-cols-3 gap-6 px-5 py-14 text-center sm:px-8">
          {[
            { value: `${stats.creators}+`, label: 'Creators' },
            { value: stats.challenges, label: 'Challenges run' },
            { value: formatMoney(stats.prizes).replace('.00', ''), label: 'Prizes awarded' },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-bold text-brand sm:text-5xl">{s.value}</p>
              <p className="mt-2 text-xs font-medium text-smoke sm:text-sm">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">How it works</h2>
        <p className="mx-auto mt-4 max-w-md text-center text-smoke">Three steps between you and your first payout.</p>
        <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {[
            { step: '01', emoji: '✍️', title: 'Apply', text: 'Sign up for free, build your creator profile, and fill in your travel map. Share your socials and connect with other creators.' },
            { step: '02', emoji: '🎬', title: 'Create', text: 'Participate in content challenges with a clear brief. Film your video, post it on Instagram or TikTok, and share the link for it to be counted.' },
            { step: '03', emoji: '💷', title: 'Earn', text: 'Top videos win cash prizes. Multiple videos also earns you a Tryp.com voucher that you can spend on flights and hotels. Your dream trip is not far away!' },
          ].map((c) => (
            <div key={c.step} className="card !p-10 text-center">
              <p className="text-xs font-bold tracking-[0.3em] text-brand-light">{c.step}</p>
              <p className="mt-4 text-4xl" aria-hidden>{c.emoji}</p>
              <h3 className="mt-4 text-xl font-semibold">{c.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-smoke">{c.text}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Benefits ---------- */}
      <section className="bg-cloud/50 py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">Why creators join</h2>
          <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { emoji: '💷', title: 'Real cash prizes', text: 'Cash for the top spots in every challenge, spend it your way.' },
              { emoji: '✈️', title: 'Travel vouchers', text: 'Participating in challenges earns you Tryp.com vouchers you can use to book your next trip.' },
              { emoji: '📈', title: 'Brand exposure', text: "The top videos get featured with creator credit on Tryp.com's global accounts with +100k followers." },
              { emoji: '🧡', title: 'A real community', text: 'Collab, connect, swap tips and plan trips with creators around the world.' },
            ].map((b) => (
              <div key={b.title} className="rounded-card bg-white p-8 shadow-card">
                <p className="text-3xl" aria-hidden>{b.emoji}</p>
                <h3 className="mt-4 font-semibold">{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-smoke">{b.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Featured creators ---------- */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">Meet the community</h2>
          <p className="mx-auto mt-4 max-w-md text-center text-smoke">A few of the creators already on board.</p>
          <div className="mt-16 grid grid-cols-2 gap-6 lg:grid-cols-4">
            {featured.map((c) => (
              <div key={c.name} className="card flex flex-col items-center gap-3 !p-8 text-center">
                <Avatar src={c.photo_url} name={c.name} size="lg" />
                <p className="font-semibold">{c.name}</p>
                <p className="text-xs leading-relaxed text-smoke line-clamp-2">{c.bio}</p>
                <p className="text-xs font-semibold text-brand">🌍 {c.countries} countries</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* ---------- Final CTA ---------- */}
      <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <div className="rounded-card bg-gradient-to-br from-brand to-brand-light px-8 py-16 text-center text-white shadow-lift sm:py-20">
          <h2 className="mx-auto max-w-xl text-3xl font-bold leading-tight sm:text-4xl">
            Your next trip could pay for itself.
          </h2>
          <p className="mx-auto mt-4 max-w-md text-white/85">
            Free to join. One challenge live right now.
          </p>
          <Link to="/signup" className="btn mt-10 bg-white !px-10 !py-4 !text-base text-brand hover:bg-white/90">
            Join the program →
          </Link>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-gray-100 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 text-center sm:px-8">
          <img src="/brand/tryp-logo.png" alt="Tryp.com" className="h-8 rounded-lg" />
          <p className="text-xs text-smoke">
            © {new Date().getFullYear()} Tryp.com Content Creator Program ·{' '}
            <a href={TRYP_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline">tryp.com ↗</a>
          </p>
        </div>
      </footer>
    </div>
  )
}
