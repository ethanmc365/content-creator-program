import { useEffect, useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { useDemoMode } from '../lib/demoMode'
import { Avatar } from '../components/ui'
import Icon from '../components/Icon'
import CreatorMap from '../components/CreatorMap'
import Reveal from '../components/network/Reveal'
import { formatMoney, cx } from '../lib/utils'
import { useT } from '../lib/i18n'

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
  // NULL, NOT A PLAUSIBLE-LOOKING GUESS (4 Sep 2026).
  //
  // Ethan: "I noticed an issue with the 44 creators, 2 challenges run and the
  // prizes awarded figures whenever the page first loads. They show incorrect -
  // it shows 40 creators and 6 challenges run, and then it fixes itself."
  //
  // Those were the INITIAL STATE: `{ creators: 40, challenges: 6, prizes: 500 }`,
  // hard-coded here as a placeholder some months ago and never revisited. They
  // are not roughly right and they are not obviously wrong, which is the worst
  // of both - a stranger reads three specific figures about the programme,
  // every one of them false, and then watches them change. A number that
  // corrects itself in front of you is worse than no number at all, because it
  // tells the reader the page does not know.
  //
  // So the tiles hold their own shape and say nothing until the real answer
  // arrives, and then count up to it from zero. `null` is "we have not been
  // told yet", which is the truth for about 200ms.
  const [stats, setStats] = useState(null)
  const [featured, setFeatured] = useState([])
  const [mapData, setMapData] = useState({ creators: [], trips: {}, visited: [] })
  const [miniProfile, setMiniProfile] = useState(null) // creator shown in the join-prompt modal
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
      if (data) setMapData({ creators: data.creators || [], trips: data.trips || {}, visited: data.visited || [] })
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
      {/* THE TOP BAR, THIRD VERSION (4 Sep 2026). Ethan: "the top bar design
          doesn't look good, that can be improved."

          The last one was a full-width strip with a hairline under it - which
          is the header of an application, and this is not an application, it is
          the front of one. It also drew that hairline edge to edge across a
          page whose whole design is white space, so the first thing on the page
          was a rule.

          It is a FLOATING PILL now: inset from the edges, its own soft shadow,
          nothing spanning the full width. On the hero it is transparent and
          weightless; the moment the page moves it gains a white ground and a
          ring, so it separates from the content sliding under it without ever
          drawing a line across the page. The three controls are three clearly
          different weights - a quiet outbound link, a quiet Log in, and one
          filled Join us - because a first-time visitor should not be asked to
          choose between two equal-looking doors when only one of them is
          theirs. */}
      <header className="sticky top-0 z-30 px-3 pt-3 sm:px-5 sm:pt-4">
        <div
          className={cx(
            'mx-auto flex h-14 max-w-5xl items-center justify-between rounded-full pl-4 pr-2 transition-all duration-500 sm:h-16 sm:pl-6 sm:pr-3',
            scrolled
              ? 'bg-white/85 shadow-card ring-1 ring-black/5 backdrop-blur-md'
              : 'bg-transparent ring-1 ring-transparent',
          )}
        >
          <Link to="/" className="landing-lift flex items-center gap-2.5">
            <img src="/brand/tryp-logo.png" alt="Tryp.com" className="h-8 rounded-lg sm:h-9" />
            <span className="hidden text-sm font-semibold tracking-tight text-ink sm:block">
              {tr("Creator Community")}
            </span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <a
              href={TRYP_URL} target="_blank" rel="noopener noreferrer"
              className="hidden rounded-full px-3 py-2 text-sm font-medium text-smoke transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:text-ink sm:block"
            >
              {tr("Tryp.com ↗")}
            </a>
            <Link
              to="/login"
              className="rounded-full px-3 py-2 text-sm font-medium text-smoke transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:text-ink sm:px-4"
            >
              {tr("Log in")}
            </Link>
            <Link
              to="/signup"
              className="rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white shadow-card transition-all duration-300 hoverable:hover:-translate-y-0.5 hoverable:hover:scale-[1.04] hoverable:hover:shadow-lift sm:px-5"
            >
              {tr("Join us")}
            </Link>
          </nav>
        </div>
      </header>

      {/* ---------- Hero ---------- */}
      {/* THE HERO ARRIVES A WORD AT A TIME (4 Sep 2026).

          Ethan: "I want super clean animations for these, not just fading, but
          something more complex and cool that really stands out... maybe just
          show the dots popping in nicely, or the words popping in, really work
          and do a nice animation there. Also, hovering over everything I want
          to magnify a bit, even 'Create. Earn. Travel.'"

          THE COPY AND THE WHITE SPACE ARE UNTOUCHED - the two things he has
          said twice are already right. What changed is the motion.

          A fade-up is a transition; a word that rises, overshoots its resting
          place by four pixels, pulls into focus out of a six-pixel blur and
          settles is an OBJECT LANDING, and three of them landing in turn is the
          headline assembling itself in front of you. Each word is its own span
          with its own place in the queue, and each one magnifies under a
          pointer. The full stops are part of the words, so the punctuation
          lands with the word it belongs to rather than sitting still while the
          letters move around it. See `.hero-word` in index.css - CSS, not the
          Motion runtime, because this is the first page a stranger downloads.

          THE BADGE ABOVE IT is no longer a flat brand-tint chip: it is a white
          pill on a hairline ring carrying a live dot, and it lands BEFORE the
          headline, so the page reads top to bottom rather than all at once. */}
      <section className="relative mx-auto max-w-6xl px-5 pb-24 pt-16 text-center sm:px-8 sm:pt-28">
        <span
          aria-hidden
          className="hero-bloom pointer-events-none absolute left-1/2 top-0 -z-10 h-[28rem] w-[52rem] max-w-[130%] -translate-x-1/2 rounded-full bg-brand-tint/60 blur-3xl"
        />
        <span className="hero-pill mx-auto mb-7 inline-flex items-center gap-2.5 rounded-full bg-white py-2 pl-3 pr-5 text-xs font-semibold text-ink shadow-card ring-1 ring-brand/15">
          <span className="relative flex h-2 w-2 items-center justify-center" aria-hidden>
            <span className="hero-dot-ring absolute h-2 w-2 rounded-full bg-brand/50" />
            <span className="hero-dot h-2 w-2 rounded-full bg-brand" />
          </span>
          {tr("Tryp.com Content Creator Community")}
        </span>
        <h1 className="mx-auto max-w-3xl text-5xl font-bold leading-[1.1] tracking-tight sm:text-7xl">
          {/* Three spans, three delays. `aria-hidden` is NOT used and must not
              be: this is the page's only h1 and a screen reader has to read it
              as the sentence it is, which it does - the spans are inline and
              carry no roles. */}
          <span className="hero-word" style={{ '--word-i': 0 }}>{tr("Create.")}</span>{' '}
          <span className="hero-word" style={{ '--word-i': 1 }}>{tr("Earn.")}</span>{' '}
          <span className="hero-word text-brand" style={{ '--word-i': 2 }}>{tr("Travel.")}</span>
        </h1>
        <p
          className="animate-fade-up mx-auto mt-8 max-w-xl text-lg leading-relaxed text-smoke"
          style={{ animationDelay: '0.46s' }}
        >
          {tr("Join the official community of travel creators making content with Tryp.com. Compete in challenges, win cash and travel vouchers, get offered full time roles and grow alongside other travel creators.")}
        </p>
        <div
          className="animate-fade-up mt-12 flex flex-col items-center justify-center gap-4 sm:flex-row"
          style={{ animationDelay: '0.58s' }}
        >
          <Link
            to="/signup"
            className="btn-primary !px-10 !py-4 !text-base shadow-card transition-all duration-300 hoverable:hover:-translate-y-1 hoverable:hover:scale-[1.03] hoverable:hover:shadow-lift"
          >
            {tr("Become a creator")}
          </Link>
          <Link
            to="/login"
            className="btn-secondary !px-10 !py-4 !text-base transition-all duration-300 hoverable:hover:-translate-y-1 hoverable:hover:scale-[1.03]"
          >
            {tr("Log in")}
          </Link>
        </div>
      </section>

      {/* ---------- Stats ---------- */}
      {/* THE THREE FIGURES COUNT UP TO THE TRUTH, AND SAY NOTHING BEFORE THEY
          KNOW IT. See the note on `stats` above for the bug this fixes: the
          placeholders were three specific wrong numbers that corrected
          themselves in front of the reader.

          The count is LINEAR and fixed at 1.6s, which is not an arbitrary
          choice - see components/network/Motion.jsx, where three attempts at
          easing a counter are written up. The readout is an integer, so what
          the eye sees is frames per whole number, and any curve with zero slope
          at its ends makes the numbers visibly pause at the start and finish.
          A tally has one honest curve and it is a straight line. This is a
          motion-free copy of that rule, because the landing page must not pull
          in the Motion runtime. */}
      <section className="border-y border-gray-100 bg-cloud/50">
        <div className="mx-auto grid max-w-4xl grid-cols-3 gap-6 px-5 py-14 text-center sm:px-8">
          {[
            { key: 'creators', value: stats?.creators, label: 'Creators', format: (n) => String(n) },
            { key: 'challenges', value: stats?.challenges, label: 'Challenges run', format: (n) => String(n) },
            { key: 'prizes', value: stats?.prizes, label: 'Prizes awarded', format: (n) => formatMoney(n) },
          ].map((s, i) => (
            <div key={s.key} className={stats ? 'stat-in' : undefined} style={stats ? { animationDelay: `${i * 60}ms` } : undefined}>
              <p className="text-3xl font-bold text-brand sm:text-5xl">
                {stats
                  ? <Tally value={s.value} format={s.format} />
                  /* The tile keeps its height while it waits, so nothing on the
                     page moves when the answer lands. */
                  : <span className="inline-block h-[1em] w-16 rounded-lg bg-brand/10 align-middle sm:w-24" aria-hidden />}
              </p>
              <p className="mt-2 text-xs font-medium text-smoke sm:text-sm">{tr(s.label)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* THE LIVE CHALLENGE CARD IS GONE (3 Sep 2026).

          Ethan: "on the landing page I think I wouldn't include the challenge
          card at all, it's not necessary."

          He is right, and the reason is worth keeping so nobody adds it back.
          It named whichever challenge happened to be running - "Descubre Espana
          con Tryp.com" - to a stranger who has no market, cannot enter it, and
          in most cases does not speak the language it is written in. It read as
          the page advertising something that is not for you. The stats band
          above already carries the fact that matters to a visitor (challenges
          run, prizes awarded) without pinning it to one market's brief.

          `public_live_challenge` and `prizePotLabel` went with it. */}

      {/* ---------- Meet the community ----------

          MOVED UP, ABOVE "HOW IT WORKS" (3 Sep 2026). Ethan: "meet the
          community - this is the top I like, but again we need the animations
          here. But this is a really important part, and I would maybe put it up
          a bit higher on the page."

          He is right about the order and the reason is worth stating: everything
          above it is the programme talking about itself, and this is the only
          section where the reader meets actual people. Coming after two screens
          of explanation, the most persuasive thing on the page was the thing
          most readers never reached. It now sits directly under the headline
          stats, with the explanation after it. */}
      {(mapData.creators.length > 0 || featured.length > 0) && (
        <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">{tr("Meet the community")}</h2>
          <p className="mx-auto mt-4 max-w-md text-center text-smoke">
            {tr("Creators based all over the world, and always on the move. Tap a pin to meet them.")}
          </p>

          {/* TWO TINTS AND A KEY (4 Sep 2026).

              Ethan: "perhaps in Tryp.com orange we could have the countries
              that everyone lives in, and then in the lighter orange it could be
              for all the countries we've travelled to. And maybe a little key
              on the bottom left to show that. Also, you can make this map stand
              out more, adding more animations to it, like the nice UI of the
              pins falling in."

              The map could already draw both - the creator directory has a
              "Been together" toggle - but the PUBLIC rpc only ever sent where
              people live. It sends `visited` now (see migration 189: distinct,
              flat, nobody attached, because "somebody here has filmed in
              Morocco" is a fact about the programme and "this named person has"
              is not a public page's to give away).

              `exploredActive` with no `onToggleExplored` means the second tint
              is always on and no filter pill is drawn - a stranger has nothing
              to filter. The two tints were four percent of lightness apart and
              have been widened so the key describes a difference you can
              actually see, and the pins now land in a capped shower rather than
              all on one frame. Both of those are in CreatorMap, so the
              directory gets them too. */}
          {mapData.creators.length > 0 && (
            <div className="mt-12">
              <CreatorMap
                creators={mapData.creators}
                trips={mapData.trips}
                exploredCountries={mapData.visited}
                exploredActive
                legend
                onCreatorClick={setMiniProfile}
              />
            </div>
          )}

          {featured.length > 0 && (
            <>
              <h3 className="mt-16 text-center text-lg font-semibold text-ink sm:text-xl">{tr("Recently active creators")}</h3>
              <p className="mx-auto mt-2 text-center text-sm text-smoke">{tr("Some of the creators who've been busy in the community lately.")}</p>
              {/* THE CARDS ARRIVE IN TURN AND MAGNIFY UNDER A POINTER.
                  Ethan: "the recent active creator section is good, but again
                  just improving the animations there." `Reveal` already brought
                  them in as a group; a stagger makes four faces read as four
                  people rather than as one block, and the avatar getting its
                  own, bigger move on hover is what stops the magnify looking
                  like the whole card was photographed and zoomed. */}
              <Reveal from="down" className="mt-8 grid grid-cols-2 gap-6 lg:grid-cols-4" stagger={0.08}>
                {featured.map((c) => (
                  <div
                    key={c.name}
                    className="landing-lift card flex h-full flex-col items-center gap-3 !p-8 text-center hoverable:hover:shadow-lift"
                  >
                    <span className="landing-lift-icon block">
                      <Avatar src={c.photo_url} name={c.name} size="lg" />
                    </span>
                    <p className="font-semibold">{c.name}</p>
                    <p className="text-xs leading-relaxed text-smoke line-clamp-2">{c.bio}</p>
                    <p className="mt-auto flex items-center justify-center gap-1 text-xs font-semibold text-brand">
                      <Icon name="globe" className="h-3.5 w-3.5" /> {c.countries} countries
                    </p>
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
            one. The copy is untouched except for one word - Ethan: "the how it
            works, that's good. I think you can just improve the UI, but I like
            the copy."

            THE THREE CARDS ARE THE SAME HEIGHT NOW (4 Sep 2026). Ethan: "one
            thing I noticed here is that the Earn card is bigger than the other
            two cards, which doesn't make sense and looks bad."

            He is right and the cause is exactly one missing class. A grid
            stretches its ITEMS, and `Reveal` wraps every child in a div of its
            own - so the three wrappers were all the same height and the cards
            INSIDE them were not, each sizing to its own paragraph. Earn's copy
            is the longest, so Earn was the tall one. `h-full` on the card makes
            it fill the wrapper the grid already sized.

            AND "PARTICIPATION" IS GONE FROM THAT PARAGRAPH. Ethan: "I would
            remove the word participation - maybe that way you can fit it in."
            It is internal vocabulary: a creator does not need to know which
            SORT of voucher it is in order to want one, and dropping it is what
            gets the sentence onto three lines instead of four, which is most of
            why that card was the tall one to begin with. */}
        <Reveal
          from="down"
          className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3"
          stagger={0.09}
        >
          {[
            { step: '01', icon: 'pencil', title: 'Apply', text: 'Sign up for free, build your creator profile, and fill in your travel map. Share your socials and connect with other creators.' },
            { step: '02', icon: 'video', title: 'Create', text: 'Participate in content challenges with a clear brief. Film your video, post it on Instagram or TikTok, and share the link for it to be counted.' },
            { step: '03', icon: 'money', title: 'Earn', text: 'Top videos win cash prizes. Take part and you can also earn Tryp.com vouchers to spend on flights and hotels. Your dream trip is not far away!' },
          // The step number sits ON the card's top edge rather than inside it,
          // so the eye can run 01-02-03 across the row without reading three
          // whole cards to find the order.
          ].map((c) => (
            <div key={c.step} className="landing-lift card relative flex h-full flex-col !p-10 pt-12 text-center hoverable:hover:shadow-lift">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-[11px] font-bold tracking-[0.2em] text-white">
                {c.step}
              </span>
              <span className="landing-lift-icon mx-auto mt-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint text-brand" aria-hidden>
                <Icon name={c.icon} className="h-7 w-7" />
              </span>
              <h3 className="mt-4 text-xl font-semibold">{tr(c.title)}</h3>
              <p className="mt-3 text-sm leading-relaxed text-smoke">{tr(c.text)}</p>
            </div>
          ))}
        </Reveal>
      </section>

      {/* ---------- Benefits ---------- */}
      {/* WHY CREATORS JOIN, REDRAWN (4 Sep 2026). Ethan: "the 'why creators
          join' is good, but I would improve the UI of it, and again add the
          animations."

          It was four white boxes with an icon, a bold line and a paragraph -
          correct, and completely flat: four identical rectangles on a grey
          band, all the same weight, nothing leading the eye across them.

          Three changes, and none of them adds a colour (the palette is white,
          ink and one orange, and this section was never the place to break
          that):
            * each card carries a numbered rule at the top, so the four read as
              a list rather than as a wall;
            * the icon tile is bigger and takes the brand tint properly, and it
              gets its own movement on hover rather than riding the card's;
            * they arrive in turn, and they magnify under a pointer like
              everything else on the page now does. */}
      <section className="bg-cloud/50 py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl">{tr("Why creators join")}</h2>
          <p className="mx-auto mt-4 max-w-md text-center text-smoke">
            {tr("Four reasons, and the first one is paid in cash.")}
          </p>
          <Reveal
            from="down"
            className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4"
            stagger={0.08}
          >
            {[
              { icon: 'money', title: 'Real cash prizes', text: 'Cash for the top spots in every challenge, spend it your way.' },
              { icon: 'ticket', title: 'Travel vouchers', text: 'Take part in challenges and earn Tryp.com vouchers you can use to book your next trip.' },
              { icon: 'chart', title: 'Brand exposure', text: "The top videos get featured with creator credit on Tryp.com's global accounts with +100k followers." },
              { icon: 'heart', title: 'A real community', text: 'Collab, connect, swap tips and plan trips with creators around the world.' },
            ].map((b, i) => (
              <div
                key={b.title}
                className="landing-lift group relative flex h-full flex-col overflow-hidden rounded-card bg-white p-8 shadow-card hoverable:hover:shadow-lift"
              >
                {/* The rule number, quiet enough to be furniture and present
                    enough to make the four read in order. */}
                <span className="absolute right-6 top-6 text-2xl font-bold tabular-nums text-cloud" aria-hidden>
                  0{i + 1}
                </span>
                <span className="landing-lift-icon flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-tint text-brand" aria-hidden>
                  <Icon name={b.icon} className="h-7 w-7" />
                </span>
                <h3 className="mt-5 text-base font-semibold">{tr(b.title)}</h3>
                <p className="mt-2 text-sm leading-relaxed text-smoke">{tr(b.text)}</p>
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
        {/* ONE PASS OF LIGHT, ONCE. The sheen is the same idea the live
            challenge card uses, and it is deliberately not a loop: a repeating
            shine on the last thing on the page is an advert for itself. */}
        <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light px-8 py-16 text-center text-white shadow-lift sm:py-20">
          <span aria-hidden className="landing-sheen pointer-events-none absolute inset-y-0 left-0" />
          <h2 className="relative mx-auto max-w-xl text-3xl font-bold leading-tight sm:text-4xl">
            {tr("Your next trip could pay for itself.")}
          </h2>
          <p className="relative mx-auto mt-4 max-w-md text-white/85">
            {tr("Free to join. New briefs go up every month.")}
          </p>
          <Link
            to="/signup"
            className="btn relative mt-10 bg-white !px-10 !py-4 !text-base text-brand shadow-card transition-all duration-300 hover:bg-white hoverable:hover:-translate-y-1 hoverable:hover:scale-[1.04] hoverable:hover:shadow-lift"
          >
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

// A COUNTER, WITHOUT THE MOTION RUNTIME.
//
// `components/network/Motion.jsx` already owns this behaviour and its header
// is worth reading before touching this: three attempts at easing a counter are
// written up there, and the conclusion is that a tally has exactly one honest
// curve. The readout is an INTEGER, so what the eye actually sees is FRAMES PER
// WHOLE NUMBER - and any curve whose slope is zero at its ends (a cubic
// ease-out, a smoothstep) gives the numbers at each end several frames each and
// the ones in the middle one or two, which reads as the number pausing. Linear
// is the only rate under which every integer on the way is on screen for the
// same length of time.
//
// It is duplicated here rather than imported for one reason: that module pulls
// in `motion/react`, and this is the public landing page - the first bytes a
// stranger downloads, eagerly routed, with no other need for an animation
// library. Twenty lines of rAF is a better trade than a runtime.
//
// It writes `textContent` straight onto its own span rather than calling
// setState sixty times a second, for the same reason the original does: three
// counters re-rendering React every frame is work nobody can see the result of,
// on exactly the frames that have to be smooth.
const COUNT_MS = 1600

function Tally({ value, format = (n) => n }) {
  const ref = useRef(null)
  const target = Number(value) || 0
  const formatRef = useRef(format)
  useEffect(() => { formatRef.current = format })

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    const reduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (reduced) { node.textContent = String(formatRef.current(target)); return undefined }

    let raf = 0
    const start = performance.now()
    const tick = (now) => {
      const t = Math.min(1, (now - start) / COUNT_MS)
      node.textContent = String(formatRef.current(Math.round(target * t)))
      if (t < 1) raf = requestAnimationFrame(tick)
    }
    // A TIMER BEHIND THE FRAME LOOP, and this file's neighbours have paid for
    // that rule twice: requestAnimationFrame does not run in a background tab,
    // so a counter armed only with rAF sits on zero for a reader who opened the
    // page in a tab and came back to it. The timer lands the final value
    // whatever happened to the frames.
    const settle = setTimeout(() => { node.textContent = String(formatRef.current(target)) }, COUNT_MS + 80)
    raf = requestAnimationFrame(tick)
    return () => { cancelAnimationFrame(raf); clearTimeout(settle) }
  }, [target])

  return <span ref={ref}>{format(0)}</span>
}
