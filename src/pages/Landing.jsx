import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useDemoMode } from '../lib/demoMode'
import { Avatar } from '../components/ui'
import Icon from '../components/Icon'
import CreatorMap from '../components/CreatorMap'
import Reveal from '../components/network/Reveal'
import { formatMoney, challengeDeadline, cx } from '../lib/utils'
import { useT } from '../lib/i18n'

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

// `?demo=1`, admins only, keeps this page on screen for somebody who is already
// signed in, so the public front page can be shown inside the Testing Centre.
// Without it the guard below does exactly what it should and sends them home.
export default function Landing() {
  const tr = useT()
  const { asked: demoAsked } = useDemoMode()
  const { user, loading } = useAuth()
  const [stats, setStats] = useState({ creators: 40, challenges: 6, prizes: 500 })
  const [featured, setFeatured] = useState([])
  const [mapData, setMapData] = useState({ creators: [], trips: {} })
  const [miniProfile, setMiniProfile] = useState(null) // creator shown in the join-prompt modal
  const [live, setLive] = useState(null) // current live challenge snapshot for the slim card
  // Whether the page has moved at all, which is the only thing the header uses
  // it for: it draws no border over the hero and grows one once you scroll.
  const [scrolled, setScrolled] = useState(false)
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

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
  // `asked`, not `on`: `on` waits for `isAdmin`, which arrives with the PROFILE
  // while `user` arrives with the SESSION - so an admin previewing this page in
  // the Testing Centre was bounced to /home a beat before it knew it was a
  // preview, and the "landing page" showed them the platform instead of what a
  // stranger sees. Same bug as /signup had. The parameter alone stops the
  // redirect; it unlocks nothing.
  if (!demoAsked && !loading && user) return <Navigate to="/home" replace />

  return (
    <div className="bg-white">
      {/* ---------- Nav ---------- */}
      {/* THE TOP BAR (3 Sep 2026). Ethan: "I think the top bar can be improved,
          the login sign up buttons."

          It was a logo and three controls of three different weights - a bare
          text link to Tryp.com, a ghost button and a solid one - sitting on a
          hairline border. Two problems: "Tryp.com ↗" read as navigation away
          from the page somebody had just arrived on, and Log in / Sign up were
          the same size, so the bar asked a first-time visitor to choose between
          two equal options when only one of them is for them.

          Now: the logo names the thing it belongs to, Log in is quiet because
          it is for people who already have an account, and "Join us" is the
          only filled control on the bar. The border only appears once the page
          has been scrolled, so the hero opens on white with nothing drawn
          across it. */}
      <header
        className={cx(
          'sticky top-0 z-30 transition-all duration-300',
          scrolled
            ? 'border-b border-gray-100 bg-white/90 shadow-[0_1px_20px_rgba(26,26,26,0.04)] backdrop-blur'
            : 'border-b border-transparent bg-white/70 backdrop-blur-sm',
        )}
      >
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 sm:px-8">
          <span className="flex items-center gap-2.5">
            <img src="/brand/tryp-logo.png" alt="Tryp.com" className="h-9 rounded-lg" />
            <span className="hidden text-sm font-semibold text-ink sm:block">{tr("Creator Community")}</span>
          </span>
          <nav className="flex items-center gap-1 sm:gap-2">
            <a
              href={TRYP_URL} target="_blank" rel="noopener noreferrer"
              className="hidden rounded-full px-3 py-2 text-sm font-medium text-smoke transition-colors hover:text-ink sm:block"
            >
              {tr("Tryp.com ↗")}
            </a>
            <Link
              to="/login"
              className="rounded-full px-3 py-2 text-sm font-medium text-smoke transition-colors hover:text-ink sm:px-4"
            >
              {tr("Log in")}
            </Link>
            <Link
              to="/signup"
              className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card sm:px-5"
            >
              {tr("Join us")}
            </Link>
          </nav>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      {/* THE HERO ARRIVES, IT DOES NOT JUST APPEAR (3 Sep 2026).

          Ethan: "I do like the current style that shows create, earn, travel -
          the copy there... overall I want animations for this entire page when
          it first loads, and as you're scrolling down we can have cool
          animations. I think it could definitely be work still to keep the nice
          clean light with the white space."

          So the copy is untouched and the WHITE SPACE IS UNTOUCHED - the two
          things he said were already right. What is added is time: each line
          takes its turn, about 90ms apart, so the eye is led down to the button
          rather than handed the whole screen at once. `animate-fade-up` is the
          same CSS keyframe the podium and the tour card use, so the landing
          page moves the way the app does, and it is behind
          prefers-reduced-motion like everything else.

          A BLOOM BEHIND THE HEADLINE, not a background image. It is one very
          soft brand-tinted ellipse at 40% opacity - enough to stop the top of
          the page being a white rectangle, faint enough that the "clean light"
          survives. */}
      <section className="relative mx-auto max-w-6xl px-5 pb-24 pt-20 text-center sm:px-8 sm:pt-32">
        <span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-0 -z-10 h-[28rem] w-[52rem] max-w-[130%] -translate-x-1/2 rounded-full bg-brand-tint/60 blur-3xl"
        />
        <p className="animate-fade-up mx-auto mb-6 inline-block rounded-full bg-brand-tint px-4 py-1.5 text-xs font-semibold text-brand">
          {tr("Tryp.com Content Creator Community")}
        </p>
        <h1
          className="animate-fade-up mx-auto max-w-3xl text-5xl font-bold leading-[1.1] tracking-tight sm:text-7xl"
          style={{ animationDelay: '0.09s' }}
        >
          {tr("Create. Earn.")} <span className="text-brand">{tr("Travel.")}</span>
        </h1>
        <p
          className="animate-fade-up mx-auto mt-8 max-w-xl text-lg leading-relaxed text-smoke"
          style={{ animationDelay: '0.18s' }}
        >
          {tr("Join the official community of travel creators making content with Tryp.com. Compete in challenges, win cash and travel vouchers, get offered full time roles and grow alongside other travel creators.")}
        </p>
        <div
          className="animate-fade-up mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row"
          style={{ animationDelay: '0.27s' }}
        >
          <Link
            to="/signup"
            className="btn-primary !px-10 !py-4 !text-base transition-transform duration-200 hover:-translate-y-0.5"
          >
            {tr("Become a creator")}
          </Link>
          <Link to="/login" className="btn-secondary !px-10 !py-4 !text-base">{tr("Log in")}</Link>
        </div>
      </section>

      {/* ---------- Stats ---------- */}
      {/* The grey band sits behind the three headline stats only, running right
          across the page. The live-challenge card is separate, below, on white. */}
      <section className="border-y border-gray-100 bg-cloud/50">
        <div className="mx-auto grid max-w-4xl grid-cols-3 gap-6 px-5 py-14 text-center sm:px-8">
          {[
            { value: `${stats.creators}`, label: 'Creators' },
            { value: stats.challenges, label: 'Challenges run' },
            { value: formatMoney(stats.prizes), label: 'Prizes awarded' },
          ].map((s) => (
            <div key={s.label}>
              <p className="text-3xl font-bold text-brand sm:text-5xl">{s.value}</p>
              <p className="mt-2 text-xs font-medium text-smoke sm:text-sm">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Live challenge card ----------

          Ethan: "the live challenge card on this doesn't really look well. I
          think you can improve this quite well."

          IT WAS A NOTIFICATION BAR, NOT A CARD. A pale strip with a pill at
          each end and a sentence between them, at the same weight as everything
          else on a white page - so the single most persuasive fact the landing
          page has ("there is money on the table right now") was the quietest
          thing on it, and it named neither the challenge nor the prize in a way
          you could read at a glance.

          It is the app's own live-challenge card now: brand gradient, the
          title, the pot as a number somebody can want, and the days as a real
          countdown. That also makes the landing page honest about what it is
          selling - this is the card you meet on the inside, so a stranger sees
          the actual product rather than an advert for it. */}
      {live && (
        <section className="mx-auto max-w-4xl px-5 py-14 sm:px-8">
          <Reveal from="down">
            <Link
              to="/signup"
              className="challenge-card group relative block overflow-hidden rounded-card bg-gradient-to-br from-[#8f2a04] via-brand to-brand-light p-6 text-white shadow-lift transition-transform duration-300 hover:-translate-y-1 sm:p-9"
            >
              <span aria-hidden className="challenge-sheen pointer-events-none absolute inset-y-0" />
              <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full bg-white/10 blur-2xl" />

              <span className="relative flex flex-wrap items-center gap-3">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-wider">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
                  </span>
                  {tr("Live now")}
                </span>
                {live.daysLeft > 0 && (
                  <span className="text-xs font-medium text-white/80">
                    {live.daysLeft} {live.daysLeft === 1 ? tr('day left') : tr('days left')}
                  </span>
                )}
              </span>

              <h2 className="relative mt-4 max-w-2xl text-2xl font-bold leading-tight tracking-tight sm:text-4xl">
                {live.title}
              </h2>
              <p className="relative mt-2.5 text-sm text-white/85 sm:text-base">
                {live.daysLeft > 0
                  ? tr("A challenge is running right now. Join and your first video could be in it.")
                  : tr("A challenge is running and closes today.")}
              </p>

              <span className="relative mt-6 flex flex-wrap items-center gap-4">
                {live.prizePot && (
                  <span className="rounded-2xl bg-white px-5 py-3 text-center shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
                    <span className="block text-2xl font-bold leading-none text-ink sm:text-3xl">{live.prizePot}</span>
                    <span className="mt-1 block text-[10px] font-semibold uppercase tracking-widest text-smoke">{tr("to earn")}</span>
                  </span>
                )}
                <span className="btn inline-flex bg-white !text-brand transition-transform duration-200 group-hover:translate-x-0.5">
                  {tr("Join and enter →")}
                </span>
              </span>
            </Link>
          </Reveal>
        </section>
      )}

      {/* ---------- Meet the community ----------

          MOVED UP, ABOVE "HOW IT WORKS" (3 Sep 2026). Ethan: "meet the
          community - this is the top I like, but again we need the animations
          here. But this is a really important part, and I would maybe put it up
          a bit higher on the page."

          He is right about the order and the reason is worth stating: everything
          above it is the programme talking about itself, and this is the only
          section where the reader meets actual people. Coming after two screens
          of explanation, the most persuasive thing on the page was the thing
          most readers never reached. It now sits directly under the live
          challenge - the two concrete things - with the explanation after. */}
      {(mapData.creators.length > 0 || featured.length > 0) && (
        <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">{tr("Meet the community")}</h2>
          <p className="mx-auto mt-4 max-w-md text-center text-smoke">
            {tr("Creators based all over the world, and always on the move. Tap a pin to meet them.")}
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
              <h3 className="mt-16 text-center text-lg font-semibold text-ink sm:text-xl">{tr("Recently active creators")}</h3>
              <p className="mx-auto mt-2 text-center text-sm text-smoke">{tr("Some of the creators who've been busy in the community lately.")}</p>
              <Reveal from="down" className="mt-8 grid grid-cols-2 gap-6 lg:grid-cols-4">
                {featured.map((c) => (
                  <div
                    key={c.name}
                    className="card flex h-full flex-col items-center gap-3 !p-8 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
                  >
                    <Avatar src={c.photo_url} name={c.name} size="lg" />
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs leading-relaxed text-smoke line-clamp-2">{c.bio}</p>
                    <p className="flex items-center justify-center gap-1 text-xs font-semibold text-brand"><Icon name="globe" className="h-3.5 w-3.5" /> {c.countries} countries</p>
                  </div>
                ))}
              </Reveal>
            </>
          )}
        </section>
      )}

      {/* ---------- How it works ---------- */}
      <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
        <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">{tr("How it works")}</h2>
        <p className="mx-auto mt-4 max-w-md text-center text-smoke">{tr("Three steps between you and your first payout.")}</p>
        {/* THE THREE STEPS ARRIVE IN ORDER, which is the one place on this page
            where a stagger carries meaning rather than decoration: they are
            numbered 01, 02, 03 and they are a sequence, so they should land as
            one. The copy is untouched - Ethan: "the how it works, that's good.
            I think you can just improve the UI, but I like the copy." */}
        <Reveal
          from="down"
          className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3"
          stagger={0.09}
        >
          {[
            { step: '01', icon: 'pencil', title: 'Apply', text: 'Sign up for free, build your creator profile, and fill in your travel map. Share your socials and connect with other creators.' },
            { step: '02', icon: 'video', title: 'Create', text: 'Participate in content challenges with a clear brief. Film your video, post it on Instagram or TikTok, and share the link for it to be counted.' },
            { step: '03', icon: 'money', title: 'Earn', text: 'Top videos win cash prizes. Take part and you can also earn Tryp.com participation vouchers to spend on flights and hotels. Your dream trip is not far away!' },
          // The step number sits ON the card's top edge rather than inside it,
          // so the eye can run 01-02-03 across the row without reading three
          // whole cards to find the order.
          ].map((c) => (
            <div key={c.step} className="card relative !p-10 pt-12 text-center transition-all duration-300 hover:-translate-y-1 hover:shadow-lift">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-[11px] font-bold tracking-[0.2em] text-white">
                {c.step}
              </span>
              <span className="mx-auto mt-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint text-brand transition-transform duration-300 group-hover:scale-105" aria-hidden>
                <Icon name={c.icon} className="h-7 w-7" />
              </span>
              <h3 className="mt-4 text-xl font-semibold">{c.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-smoke">{c.text}</p>
            </div>
          ))}
        </Reveal>
      </section>

      {/* ---------- Benefits ---------- */}
      <section className="bg-cloud/50 py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">{tr("Why creators join")}</h2>
          <Reveal
            from="down"
            className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
          >
            {[
              { icon: 'money', title: 'Real cash prizes', text: 'Cash for the top spots in every challenge, spend it your way.' },
              { icon: 'ticket', title: 'Travel vouchers', text: 'Take part in challenges and earn Tryp.com participation vouchers you can use to book your next trip.' },
              { icon: 'chart', title: 'Brand exposure', text: "The top videos get featured with creator credit on Tryp.com's global accounts with +100k followers." },
              { icon: 'heart', title: 'A real community', text: 'Collab, connect, swap tips and plan trips with creators around the world.' },
            ].map((b) => (
              <div
                key={b.title}
                className="h-full rounded-card bg-white p-8 shadow-card transition-all duration-300 hover:-translate-y-1 hover:shadow-lift"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-tint text-brand" aria-hidden>
                  <Icon name={b.icon} className="h-6 w-6" />
                </span>
                <h3 className="mt-4 font-semibold">{b.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-smoke">{b.text}</p>
              </div>
            ))}
          </Reveal>
        </div>
      </section>

      {/* ---------- Mini profile + join prompt (from a map pin) ---------- */}
      {miniProfile && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`${miniProfile.name}'s profile`}>
          <button aria-label={tr("Close")} className="absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={() => setMiniProfile(null)} />
          <div className="relative w-full max-w-sm rounded-t-card bg-white p-7 text-center shadow-lift animate-fade-up sm:rounded-card">
            <button onClick={() => setMiniProfile(null)} aria-label={tr("Close")}
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
                <Link to="/signup" className="btn-primary flex-1 !py-2.5 text-sm">{tr("Sign up")}</Link>
                <Link to="/login" className="btn-secondary flex-1 !py-2.5 text-sm">{tr("Log in")}</Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Final CTA ---------- */}
      <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <div className="rounded-card bg-gradient-to-br from-brand to-brand-light px-8 py-16 text-center text-white shadow-lift sm:py-20">
          <h2 className="mx-auto max-w-xl text-3xl font-bold leading-tight sm:text-4xl">
            {tr("Your next trip could pay for itself.")}
          </h2>
          <p className="mx-auto mt-4 max-w-md text-white/85">
            {tr("Free to join. One challenge live right now.")}
          </p>
          <Link to="/signup" className="btn mt-10 bg-white !px-10 !py-4 !text-base text-brand hover:bg-white/90">
            {tr("Join the community →")}
          </Link>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="border-t border-gray-100 py-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-5 text-center sm:px-8">
          <img src="/brand/tryp-logo.png" alt="Tryp.com" className="h-8 rounded-lg" />
          <p className="text-xs text-smoke">
            © {new Date().getFullYear()} Tryp.com Content Creator Community ·{' '}
            <a href={TRYP_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline">{tr("tryp.com ↗")}</a>
          </p>
          <p className="text-xs text-smoke">
            <Link to="/privacy" className="hover:text-brand">{tr("Privacy Policy")}</Link>
            <span className="px-2">·</span>
            <Link to="/terms" className="hover:text-brand">{tr("Terms of Service")}</Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
