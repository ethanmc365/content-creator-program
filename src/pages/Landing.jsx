import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Avatar } from '../components/ui'
import Icon from '../components/Icon'
import CreatorMap from '../components/CreatorMap'
import { formatMoney, challengeDeadline } from '../lib/utils'

// Sum the cash amounts in a challenge's prize breakdown into one "pot" label,
// e.g. [{prize:'£105 cash'},{prize:'£55 cash'}] -> "£160". Returns null if there
// are no parseable amounts.
function prizePotLabel(structure) {
  if (!Array.isArray(structure)) return null
  let sum = 0
  let symbol = '£'
  for (const row of structure) {
    const m = String(row?.prize || '').match(/([£€$])\s?([\d,]+(?:\.\d+)?)/)
    if (m) { symbol = m[1]; sum += parseFloat(m[2].replace(/,/g, '')) }
  }
  if (sum <= 0) return null
  return `${symbol}${Number.isInteger(sum) ? sum : sum.toFixed(2)}`
}

// Public landing page - bright, spacious, one clear focal point per section.
// Live stats come from the public landing_stats() / featured_creators() RPCs;
// graceful placeholders are used until the database is connected.
const TRYP_URL = 'https://www.tryp.com'

export default function Landing() {
  const { user, loading } = useAuth()
  const [stats, setStats] = useState({ creators: 40, challenges: 6, prizes: 500 })
  const [featured, setFeatured] = useState([])
  const [mapData, setMapData] = useState({ creators: [], trips: {} })
  const [miniProfile, setMiniProfile] = useState(null) // creator shown in the join-prompt modal
  const [live, setLive] = useState(null) // current live challenge snapshot for the slim card

  useEffect(() => {
    supabase.rpc('landing_stats').then(({ data }) => {
      if (data) setStats(data)
    })
    supabase.rpc('featured_creators').then(({ data }) => {
      if (data) setFeatured(data)
    })
    // Public community map: where creators are based and where they're headed.
    supabase.rpc('public_creator_map').then(({ data }) => {
      if (data) setMapData({ creators: data.creators || [], trips: data.trips || {} })
    })
    // Current live challenge for the "challenge is live" strip. We derive the
    // days-left + prize pot here (not in render) so the count is stable.
    supabase.rpc('public_live_challenge').then(({ data }) => {
      if (!data) return
      const daysLeft = Math.max(0, Math.ceil((challengeDeadline(data.end_date) - new Date()) / 86400000))
      setLive({ title: data.title, daysLeft, prizePot: prizePotLabel(data.prize_structure) })
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
          Create. Earn. <span className="text-brand">Travel.</span>
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
            { value: formatMoney(stats.prizes), label: 'Prizes awarded' },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-bold text-brand sm:text-5xl">{s.value}</p>
              <p className="mt-2 text-xs font-medium text-smoke sm:text-sm">{s.label}</p>
            </div>
          ))}
        </div>

        {/* Slim "a challenge is live" strip - pulsing dot, days left + prize pot. */}
        {live && (
          <div className="mx-auto max-w-4xl px-5 pb-14 sm:px-8">
            <Link
              to="/signup"
              className="group flex flex-col items-center gap-3 rounded-card border border-brand/20 bg-white px-5 py-4 shadow-card transition-all hover:-translate-y-0.5 hover:shadow-lift sm:flex-row sm:gap-5"
            >
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-tint px-3 py-1 text-xs font-semibold uppercase tracking-wider text-brand">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/70" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-brand" />
                </span>
                Live now
              </span>
              <p className="min-w-0 flex-1 text-center text-sm text-ink sm:text-left">
                <span className="font-semibold">A challenge is live</span>
                {live.daysLeft > 0
                  ? <> and ends in {live.daysLeft} {live.daysLeft === 1 ? 'day' : 'days'}.</>
                  : <> and closes today.</>}
                {' '}Join in and start earning.
              </p>
              {live.prizePot && (
                <span className="shrink-0 rounded-full bg-brand px-4 py-1.5 text-sm font-bold text-white">
                  {live.prizePot} prize pot
                </span>
              )}
            </Link>
          </div>
        )}
      </section>

      {/* ---------- How it works ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">How it works</h2>
        <p className="mx-auto mt-4 max-w-md text-center text-smoke">Three steps between you and your first payout.</p>
        <div className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3">
          {[
            { step: '01', icon: 'pencil', title: 'Apply', text: 'Sign up for free, build your creator profile, and fill in your travel map. Share your socials and connect with other creators.' },
            { step: '02', icon: 'video', title: 'Create', text: 'Participate in content challenges with a clear brief. Film your video, post it on Instagram or TikTok, and share the link for it to be counted.' },
            { step: '03', icon: 'money', title: 'Earn', text: 'Top videos win cash prizes. Take part and you can also earn Tryp.com participation vouchers to spend on flights and hotels. Your dream trip is not far away!' },
          ].map((c) => (
            <div key={c.step} className="card !p-10 text-center">
              <p className="text-xs font-bold tracking-[0.3em] text-brand-light">{c.step}</p>
              <span className="mx-auto mt-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint text-brand" aria-hidden>
                <Icon name={c.icon} className="h-7 w-7" />
              </span>
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
              { icon: 'money', title: 'Real cash prizes', text: 'Cash for the top spots in every challenge, spend it your way.' },
              { icon: 'ticket', title: 'Travel vouchers', text: 'Take part in challenges and earn Tryp.com participation vouchers you can use to book your next trip.' },
              { icon: 'chart', title: 'Brand exposure', text: "The top videos get featured with creator credit on Tryp.com's global accounts with +100k followers." },
              { icon: 'heart', title: 'A real community', text: 'Collab, connect, swap tips and plan trips with creators around the world.' },
            ].map((b) => (
              <div key={b.title} className="rounded-card bg-white p-8 shadow-card">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-tint text-brand" aria-hidden>
                  <Icon name={b.icon} className="h-6 w-6" />
                </span>
                <h3 className="mt-4 font-semibold">{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-smoke">{b.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Meet the community ---------- */}
      {(mapData.creators.length > 0 || featured.length > 0) && (
        <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">Meet the community</h2>
          <p className="mx-auto mt-4 max-w-md text-center text-smoke">
            Creators based all over the world, and always on the move. Tap a pin to meet them.
          </p>

          {/* Live world map: where creators are based + where they're travelling.
              Tapping a creator opens a mini profile with a join prompt. */}
          {mapData.creators.length > 0 && (
            <div className="mt-12">
              <CreatorMap creators={mapData.creators} trips={mapData.trips} onCreatorClick={setMiniProfile} />
            </div>
          )}

          {featured.length > 0 && (
            <>
              <h3 className="mt-16 text-center text-lg font-semibold text-ink sm:text-xl">Recently active creators</h3>
              <p className="mx-auto mt-2 text-center text-sm text-smoke">Some of the creators who've been busy in the community lately.</p>
              <div className="mt-8 grid grid-cols-2 gap-6 lg:grid-cols-4">
                {featured.map((c) => (
                  <div key={c.name} className="card flex flex-col items-center gap-3 !p-8 text-center">
                    <Avatar src={c.photo_url} name={c.name} size="lg" />
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs leading-relaxed text-smoke line-clamp-2">{c.bio}</p>
                    <p className="flex items-center justify-center gap-1 text-xs font-semibold text-brand"><Icon name="globe" className="h-3.5 w-3.5" /> {c.countries} countries</p>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      )}

      {/* ---------- Mini profile + join prompt (from a map pin) ---------- */}
      {miniProfile && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`${miniProfile.name}'s profile`}>
          <button aria-label="Close" className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={() => setMiniProfile(null)} />
          <div className="relative w-full max-w-sm rounded-t-card bg-white p-7 text-center shadow-lift animate-fade-up sm:rounded-card">
            <button onClick={() => setMiniProfile(null)} aria-label="Close"
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-smoke transition-colors hover:bg-cloud">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
            <div className="mx-auto">
              <Avatar src={miniProfile.photo_url} name={miniProfile.name} size="xl" />
            </div>
            <h3 className="mt-4 text-xl font-bold">{miniProfile.name}</h3>
            {(miniProfile.city || miniProfile.country) && (
              <p className="mt-1 flex items-center justify-center gap-1 text-sm text-smoke">
                <Icon name="pin" className="h-3.5 w-3.5 text-brand" />
                {[miniProfile.city, miniProfile.country].filter(Boolean).join(', ')}
              </p>
            )}
            {miniProfile.bio && <p className="mt-3 text-sm leading-relaxed text-smoke line-clamp-4">{miniProfile.bio}</p>}
            {miniProfile.countries > 0 && (
              <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-brand-tint px-3 py-1 text-xs font-semibold text-brand">
                <Icon name="globe" className="h-3.5 w-3.5" /> {miniProfile.countries} countries explored
              </p>
            )}
            <div className="mt-6 rounded-card bg-cloud/70 p-4">
              <p className="text-sm font-medium text-ink">Join the community to connect with {miniProfile.name.split(' ')[0]}.</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Link to="/signup" className="btn-primary flex-1 !py-2.5 text-sm">Sign up</Link>
                <Link to="/login" className="btn-secondary flex-1 !py-2.5 text-sm">Log in</Link>
              </div>
            </div>
          </div>
        </div>
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
          <p className="text-xs text-smoke">
            <Link to="/privacy" className="hover:text-brand">Privacy Policy</Link>
            <span className="px-2">·</span>
            <Link to="/terms" className="hover:text-brand">Terms of Service</Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
