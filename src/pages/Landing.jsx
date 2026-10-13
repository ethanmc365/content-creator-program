import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useDemoMode } from '../lib/demoMode'
import { Avatar } from '../components/ui'
import Icon from '../components/Icon'
import LanguagePicker from '../components/LanguagePicker'
import CreatorMap from '../components/CreatorMap'
import { useBootCleared } from '../lib/bootLoader'
import { cx, formatViews } from '../lib/utils'
import { useT } from '../lib/i18n'
import { marketsApi } from '../api/markets'
import { profilesApi } from '../api/profiles'
import { settingsApi } from '../api/settings'
import { TRYP_URL, StepIcon, prizeFloor, money, HeroWord } from './LandingParts'
import { Rail } from './LandingRail'
import { Tally } from './LandingTally'

// `?demo=1`, admins only, keeps this page on screen for somebody who is already
// signed in, so the public front page can be shown inside the Testing Centre.
// Without it the guard below does exactly what it should and sends them home.
export default function Landing() {
  const tr = useT()
  const { asked: demoAsked } = useDemoMode()
  const { user, loading } = useAuth()
  // NULL, NOT A PLAUSIBLE-LOOKING GUESS.
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

  // NOTHING ENTERS UNTIL THE BOOT LAYER HAS GONE.
  //
  // There was one, and it ran perfectly, underneath an opaque white sheet. The hero words animate the moment React
  // commits; `index.html`'s `#boot` layer is on screen until main.jsx has something real to hand over to, which on a
  // phone is several hundred milliseconds LATER. So on a desktop the entrance was mostly visible and on a phone it was
  // entirely finished before anyone saw the page - which is precisely the difference they reported between the two. This
  // is the same class of bug as the one in Reveal.jsx: an animation that runs perfectly and is invisible because it ran
  // in the wrong place.
  //
  // `is-ready` is what starts every CSS entrance on this page (see
  // `.landing-page` in index.css - they are all `animation-play-state: paused`
  // until it lands). The timer behind it is not optional: this gates CONTENT,
  // and this codebase's rule is that content is never gated on one mechanism.
  // ESCAPE CLOSES THE MAP'S MINI PROFILE. It covers the map it was opened from
  // and had no keyboard exit at all - the only way out was finding the scrim.
  // Declared here rather than beside the dialog because a hook cannot live
  // inside a conditional branch of the JSX.
  useEffect(() => {
    if (!miniProfile) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setMiniProfile(null) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [miniProfile])

  // THE ENTRANCE STARTS WHEN THE SHEET HAS GONE, NOT WHEN IT STARTS TO GO.
  //
  // `useBootGone` fires when `#boot` begins its 160ms fade, so the first 130ms
  // of a 520ms word - the part carrying the 26px rise and the overshoot - ran
  // underneath a sheet that was still most of the way opaque. What is left after
  // that is the tail of an ease, which is a word appearing. `useBootCleared` is
  // the far end of the same fade. See lib/bootLoader.
  const bootCleared = useBootCleared()
  const [ready, setReady] = useState(false)
  useEffect(() => {
    if (bootCleared) { setReady(true); return undefined }
    const t = setTimeout(() => setReady(true), 2500)
    return () => clearTimeout(t)
  }, [bootCleared])

  const [wall, setWall] = useState([])

  // ONLY FOR SOMEBODY WHO WILL SEE THEM. A signed-in creator who lands here is sent on to /home a moment later, and four
  // public RPCs went out for a page they never saw - on every visit to the bare address.
  const showsPage = !loading && (!user || demoAsked)
  useEffect(() => {
    if (!showsPage) return
    settingsApi.landingStats().then(({ data }) => {
      if (data) setStats(data)
    })
    profilesApi.featuredCreators().then(({ data }) => {
      if (data) setFeatured(data)
    })
    // Public community map: where creators are based and where they're headed.
    marketsApi.publicCreatorMap().then(({ data }) => {
      if (data) setMapData({ creators: data.creators || [], trips: data.trips || {}, visited: data.visited || [] })
    })
    // THE WALL OF FAME: the people who have actually won something. Everything
    // else on this page is a promise; this is a result with a name on it.
    profilesApi.publicWallOfFame({ p_limit: 30 }).then(({ data }) => {
      if (data) setWall(data)
    })
  }, [showsPage])

  // Already signed in? Straight to the app.
  // `asked`, not `on`: `on` waits for `isAdmin`, which arrives with the PROFILE
  // while `user` arrives with the SESSION - so an admin previewing this page in
  // the Testing Centre was bounced to /home a beat before it knew it was a
  // preview, and the "landing page" showed them the platform instead of what a
  // stranger sees. Same bug as /signup had. The parameter alone stops the
  // redirect; it unlocks nothing.
  if (!demoAsked && !loading && user) return <Navigate to="/home" replace />

  return (
    // `overflow-x-clip`, NOT `overflow-x-hidden`. The hero's blurred bloom is
    // 130% of the viewport wide by design, and with nothing clipping it the
    // document scrolled sideways by 52px on a 320px phone - a page that can be
    // dragged left is a page that feels broken however good the content is.
    // `hidden` would fix it and would also make this element a scroll
    // container, which silently kills the `sticky` header two lines below;
    // `clip` clips without becoming one.
    <div className={cx('landing-page overflow-x-clip bg-white', ready && 'is-ready')}>
      {/* ---------- Nav ---------- */}
      {/* THE TOP BAR, THIRD VERSION.

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
      <header className="sticky top-0 z-30 px-3 pt-[max(env(safe-area-inset-top),0.75rem)] sm:px-5 sm:pt-4">
        <div
          className={cx(
            'mx-auto flex h-14 max-w-5xl items-center justify-between rounded-full pl-4 pr-2 transition-all duration-500 sm:h-16 sm:pl-6 sm:pr-3',
            scrolled
              ? 'bg-white/85 shadow-card ring-1 ring-black/5 backdrop-blur-md'
              : 'bg-transparent ring-1 ring-transparent',
          )}
        >
          <Link to="/" className="landing-lift flex items-center gap-2.5">
            <img src="/brand/tryp-logo-360.png" alt="Tryp.com" className="h-8 rounded-lg sm:h-9" />
            {/* GREY, NOT INK.

                Right, and the reason is that the bar has exactly one thing in
                it that is meant to be loud, which is Join us. Full-strength ink
                on the label made it compete with the logo beside it and with
                the two grey nav links on the other side, so the row read as
                three different levels of importance where there are two: the
                mark, and everything else. */}
            <span className="hidden text-sm font-semibold tracking-tight text-smoke sm:block">
              {tr("Content Creator Community")}
            </span>
          </Link>
          <nav className="flex items-center gap-1 sm:gap-2">
            <a
              href={TRYP_URL} target="_blank" rel="noopener noreferrer"
              className="hidden rounded-full px-3 py-2 text-sm font-medium text-smoke transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:text-ink sm:block"
            >
              {tr("Tryp.com ↗")}
            </a>
            <LanguagePicker tone="brand" className="!h-9" />
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
      {/* THE HERO ARRIVES A WORD AT A TIME.

          THE COPY AND THE WHITE SPACE ARE UNTOUCHED - the two things they have said twice are already right. What
          changed is the motion.

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
      {/* THE PHONE GETS ITS OWN SPACING, NOT THE DESKTOP'S DIVIDED BY NOTHING.

          Measured before this pass, at 375x812: the page was 5,644px - SEVEN
          screens - and about a fifth of that was padding. Every section carried
          `py-24`, which is 96px above AND below on a 375px screen; the hero
          alone was 651px of which 232px was air. Those numbers are right on a
          1,440px display, where 96px is a comfortable seventh of the viewport
          height, and wrong on a phone, where it is a quarter of it. So the
          spacing is a step now rather than a constant, everywhere on this page.
          Nothing about the desktop layout changes. */}
      {/* AND THEN IT WAS TOO TIGHT.

          The first pass took a page that was seven screens on a phone down to
          three and a half, which was right, and then took the hero with it: at
          `pb-14 pt-8` the headline started 32px under a floating nav and the
          stats band began 56px under the buttons, so the one screen a stranger
          actually looks at read as a stack rather than as a poster. The page is
          still under half what it was; this gives the hero back about 80px of
          the 300 that came out of it, and spends it all in the three gaps he
          named. */}
      <section className="relative mx-auto max-w-6xl px-5 pb-20 pt-14 text-center sm:px-8 sm:pb-28 sm:pt-32">
        <span
          aria-hidden
          className="hero-bloom pointer-events-none absolute left-1/2 top-0 -z-10 h-[28rem] w-[52rem] max-w-[130%] -translate-x-1/2 rounded-full bg-brand-tint/60 blur-3xl"
        />
        {/* THE BADGE OVER THE HEADLINE IS GONE.

            they are right and the reason is worth keeping: it was the same sentence twice on one screen, thirty pixels
            apart, and the one in the top bar is the one that belongs there - a masthead names the thing you are looking
            at. Saying it again immediately above the headline pushed "Create. Earn. Travel." down the page to make room
            for a label the reader had just read. */}
        <h1 className="mx-auto max-w-3xl text-[clamp(2.5rem,12vw,3.25rem)] font-bold leading-[1.05] tracking-tight sm:text-7xl">
          {/* Three spans, three delays. `aria-hidden` is NOT used and must not
              be: this is the page's only h1 and a screen reader has to read it
              as the sentence it is, which it does - the spans are inline and
              carry no roles. */}
          <HeroWord i={0}>{tr("Create.")}</HeroWord>{' '}
          <HeroWord i={1}>{tr("Earn.")}</HeroWord>{' '}
          <HeroWord i={2} className="text-brand">{tr("Travel.")}</HeroWord>
        </h1>
        <p
          className="animate-fade-up mx-auto mt-7 max-w-xl text-[15px] leading-relaxed text-smoke sm:mt-9 sm:text-lg"
          style={{ animationDelay: '0.30s' }}
        >
          {tr("Join the official community of travel creators making content with Tryp.com. Compete in challenges, win cash and travel vouchers, get offered full time roles and grow alongside other travel creators.")}
        </p>
        {/* TWO BUTTONS THE SAME WIDTH, WHICH THEY WERE NOT.
            `flex-col` centres two shrink-to-fit pills, so "Become a creator"
            drew a 280px lozenge and "Log in" a 160px one underneath it, both
            centred - two different rectangles down the middle of the screen
            with 16px between them and 48px of nothing above. A grid gives them
            one width; `sm:flex` hands the row straight back on a desktop, where
            shrink-to-fit is right because they sit side by side. */}
        <div
          className="animate-fade-up mx-auto mt-11 grid max-w-xs grid-cols-1 gap-3.5 sm:mt-14 sm:flex sm:max-w-none sm:items-center sm:justify-center sm:gap-4"
          style={{ animationDelay: '0.40s' }}
        >
          <Link
            to="/signup"
            className="btn-primary justify-center !py-3.5 !text-base shadow-card transition-all duration-300 sm:!px-10 sm:!py-4 hoverable:hover:-translate-y-1 hoverable:hover:scale-[1.03] hoverable:hover:shadow-lift"
          >
            {tr("Become a creator")}
          </Link>
          <Link
            to="/login"
            className="btn-secondary justify-center !py-3.5 !text-base transition-all duration-300 sm:!px-10 sm:!py-4 hoverable:hover:-translate-y-1 hoverable:hover:scale-[1.03]"
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
        {/* THE THIRD FIGURE HAS THE MOST CHARACTERS AND THE LEAST ROOM.

            Measured on a 375px viewport: each column is 96px wide and
            "EUR 9,000+" needs 128px at 30px type. Thirty-two pixels over, so it
            spilled into its neighbour.

            Two changes, and neither of them shrinks the number on a screen that
            can hold it. The gap drops from 24px to 12px below `sm`, which is
            ample between three centred columns and buys 8px per column. And the
            type is a clamp rather than a step: it grows with the viewport
            between a floor that fits 320px and the 30px it always was, so a
            small phone gets a number that fits and a large one gets the number
            unchanged. `sm:text-5xl` still takes over completely at 640px.

            The alternative - abbreviating to "9k+" - was rejected: the whole
            point of this tile is that the figure is real money, and "EUR 9k" is
            the register of a dashboard rather than of a number somebody is
            being told with some pride. */}
        <div className="mx-auto grid max-w-4xl grid-cols-3 gap-2 px-4 py-14 text-center sm:gap-6 sm:px-8 sm:py-16">
          {[
            { key: 'creators', value: stats?.creators, label: 'Creators', format: (n) => String(n) },
            { key: 'challenges', value: stats?.challenges, label: 'Challenges run', format: (n) => String(n) },
            // PRIZES ARE ROUNDED DOWN AND CARRY A PLUS.
            //
            // `prizeFloor` does the rounding (see below); the PLUS is rendered
            // as a separate static character rather than inside `format`,
            // because `format` runs on every frame of the count-up. Folding the
            // suffix into it is the same as folding the rounding into it: the
            // tally would read "€0+" for most of a second and then jump the
            // whole way, which is the one thing the counter exists not to do.
            // The plus is a fact about the figure, not about the animation, so
            // it is on screen from the first frame and never moves.
            { key: 'prizes', value: prizeFloor(stats?.prizes), label: 'Prizes awarded', format: money, suffix: prizeFloor(stats?.prizes) < stats?.prizes ? '+' : '' },
            // SOONER. The tile's own entrance is 340ms now rather than 420 (`.stat-in` in index.css) and the ladder
            // between the three is 35ms rather than 45, so the last figure begins counting 160ms earlier than it did.
            // The count still waits for the tile to land - see `Tally` - because those two running on the same frames is
            // what made the band judder.
          ].map((s, i) => (
            <div key={s.key} className={stats ? 'stat-in' : undefined} style={stats ? { animationDelay: `${i * 35}ms` } : undefined}>
              {/* TABULAR FIGURES, AND THE WHOLE REASON THIS BAND WAS JUDDERING.

                  Poppins' default figures are PROPORTIONAL - a 1 is narrower
                  than a 4 - so a counter running to €9,000 re-measures and
                  re-centres its own text on every one of ninety-six frames,
                  while the tile it sits in is mid-transform. That is a text
                  layout per frame per column, three columns, competing with
                  three compositor animations. `tabular-nums` fixes every digit
                  to the same advance width, so the string changes and the box
                  does not move at all.

                  The second half of the same fix is in `Tally`: the count no
                  longer starts until the tile has finished arriving, so the two
                  animations are in sequence rather than on top of each other.

                  ROOM FOR FIVE FIGURES. Measured at 375px: "€10,000+" is 8 glyphs against "€9,000+"'s 7, and the old
                  clamp floor of 1.35rem left it 6px over its column. The floor drops to 1.15rem and the column gap and
                  page padding each give back 4px, which fits "€10,000+" at 320px with room to spare - and none of it
                  changes what a screen that can hold the number displays, because the clamp is still 1.875rem at its top
                  and `sm:text-5xl` still takes over completely at 640px. */}
              <p className="text-[clamp(1.15rem,6.1vw,1.875rem)] font-bold leading-tight tracking-tight text-brand [font-variant-numeric:tabular-nums] sm:text-5xl">
                {stats
                  ? <><Tally value={s.value} format={s.format} delay={340 + i * 35} />{s.suffix}</>
                  /*
                   * THE PLACEHOLDER IS INVISIBLE, NOT ORANGE.
                   *
                   * It was `bg-brand/10` - a tinted block sized to the number
                   * that was coming. The intent was right and the execution
                   * announced itself: three orange rectangles are a louder
                   * thing on an empty white band than the numbers that replace
                   * them, so the band read as loading UI rather than as a page
                   * about to speak. The job it was actually doing is RESERVING
                   * THE LINE so nothing below it jumps when the answer lands,
                   * and an empty inline-block of the same height does that
                   * without being seen. The numbers now simply fade up into a
                   * space that was always quietly theirs.
                   *
                   * `align-top` rather than `align-middle`, and that is a
                   * measurement rather than a preference: an inline-block on
                   * the middle baseline sits its own box on top of the font's
                   * descent, so the placeholder line measured 51.1px against
                   * the real number's 48 and the whole page below it stepped up
                   * 3px at the moment the figures landed. The reserve is only
                   * doing its job if it is the SAME height as what replaces
                   * it.
                   */
                  : <span className="inline-block h-[1em] w-16 align-top sm:w-24" aria-hidden />}
              </p>
              <p className="mt-2 text-[11px] font-medium leading-tight text-smoke sm:text-sm">{tr(s.label)}</p>
            </div>
          ))}
        </div>
      </section>

      {/* THE LIVE CHALLENGE CARD IS GONE.

          they are right, and the reason is worth keeping so nobody adds it back. It named whichever challenge happened
          to be running - "Descubre Espana con Tryp.com" - to a stranger who has no market, cannot enter it, and in most
          cases does not speak the language it is written in. It read as the page advertising something that is not for
          you. The stats band above already carries the fact that matters to a visitor (challenges run, prizes awarded)
          without pinning it to one market's brief.

          `public_live_challenge` and `prizePotLabel` went with it. */}

      {/* ---------- Meet the community ----------

          MOVED UP, ABOVE "HOW IT WORKS".

          they are right about the order and the reason is worth stating: everything above it is the programme talking
          about itself, and this is the only section where the reader meets actual people. Coming after two screens of
          explanation, the most persuasive thing on the page was the thing most readers never reached. It now sits
          directly under the headline stats, with the explanation after it.

          THE MAP IS NOT IN A BOX ANY MORE.

          Two changes, and the `flush` prop on CreatorMap is one of them: no
          grey hairline, no 20px radius, and the sea painted by the page rather
          than by the component, so the continents sit directly on the white.
          The other is the width - the map now leaves the 72rem article column
          the headings live in and runs to 96rem, which on a laptop is most of
          the window. Both are presentation: it is exactly as interactive as it
          was, on a phone as well, which is the half of the request that was
          already true and had to stay true. */}
      {(mapData.creators.length > 0 || featured.length > 0) && (
        // LESS AIR UNDER THE RAIL THAN OVER THE HEADING.
        //
        // MEASURED FIRST, AND IT ALREADY WAS the same: 140px from the bottom of the faces to "How it works", and 140px
        // from the bottom of the How it works cards to "Why creators join". So what they are seeing is not this boundary
        // being bigger than its neighbours, it is this boundary being bigger than everything ABOVE it inside the same
        // section - the map sits 12px under its own heading and the faces 24px under theirs, so the section is tight the
        // whole way down and then ends in the page's standard gap, which by contrast reads as a hole. Closing the
        // section's own bottom padding rather than the page's rhythm takes it to 116px, near enough to its neighbour to
        // stop reading as a gap and short enough to stop the section trailing off. (If what was actually wanted was 140
        // everywhere, this is the one line to put back.)
        <section className="pb-10 pt-16 sm:pb-16 sm:pt-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <h2 className="text-center text-[26px] font-bold tracking-tight sm:text-4xl">{tr("Meet the community")}</h2>
            <p className="mx-auto mt-3 max-w-md text-center text-sm text-smoke sm:mt-4 sm:text-base">
              {tr("Creators based all over the world, and always on the move. Tap a pin to meet them.")}
            </p>
          </div>

          {/* TWO TINTS AND A KEY.

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
          {/* EDGE TO EDGE, WITH NOTHING BESIDE IT., and on the desktop: "there's quite a big gap on either side. Ensure
              the map always fits directly to the screen so the edges are just past the screen, so it looks like the
              whole map is built there."

              It had `px-2 sm:px-6` and a 96rem cap - so on a phone the
              continents stopped 8px short of both edges, which reads as a
              picture in a frame rather than as part of the page, and on
              anything past 1536px there were real margins. No padding and no
              cap: the svg is `width: 100%` and its own aspect ratio decides
              the height, so "full width" is all it needs to be told. */}
          {/* THE TITLE BELONGS TO THE MAP, SO IT SITS ON IT., and "the community map seems to be too far away from the
              title. That title and description should be a bit closer to the map."

              28/44px of gap was the same measurement every other section on
              this page uses between its heading and its content, and it is
              right for all of them - because in every other section the
              content is a row of cards with their own white space built in.
              The map has none: it is a full-bleed picture with land right at
              its top edge, so an identical gap reads as a much bigger one and
              the heading floats between two sections instead of naming the
              one below it. */}
          {/* THE MAP IS ITS OWN REVEAL NOW, SO IT IS NOT WRAPPED IN ONE.

              There were TWO entrances here and they knew nothing about each
              other. `Reveal` faded the whole block in when it came near the
              fold; CreatorMap ran its own land-scale, thread-draw, pin-drop and
              take-off sequence when the ATLAS finished parsing - which is on
              page load, with the map a thousand pixels below the fold. So the
              good one was always over before the reader got there and the one
              that was left was a plain fade. Racing it was the only way to see
              the real thing, which is exactly what he described.

              CreatorMap now waits to be on screen before it arrives (see `seen`
              there), which makes the wrapper redundant AND made it harmful: a
              `Reveal` at opacity 0 is not painted, and Chrome suspends the SMIL
              time container of an SVG that is not being painted - so the
              aircraft were not merely late, they were stopped.

              THE GAP ABOVE IT IS SMALL FOR A REASON. The number here is only half of why: the svg's northern coast is
              11.9% of its own height below its top edge (measured - viewBox 880x480, land starts at y=57), so about
              eighty pixels of empty sky get added to whatever is set here on a desktop. */}
          {mapData.creators.length > 0 && (
            <div className="mt-1 w-full sm:mt-1">
              <CreatorMap
                creators={mapData.creators}
                trips={mapData.trips}
                exploredCountries={mapData.visited}
                exploredActive
                legend
                flush
                onCreatorClick={setMiniProfile}
              />
            </div>
          )}

          {featured.length > 0 && (
            <div className="mx-auto max-w-6xl px-5 sm:px-8">
              {/* THE SAME SIZE AS THE OTHER TWO SECTION HEADINGS. It was an `h3` at 18px because it began life as a
                  sub-heading of "Meet the community"; it is a section in its own right and reads as one. Still an `h3`
                  in the document outline, which is correct - it IS under that h2 - and simply sized like what it is. */}
              <h3 className="mt-12 text-center text-[26px] font-bold tracking-tight sm:mt-20 sm:text-4xl">{tr("Recently active creators")}</h3>
              {/* TWENTY PEOPLE, NOT FOUR.

                  The `limit 4` was migration 022's, written when there were
                  barely four creators; migration 210 raises it to twenty and
                  the ordering (last seen, then countries visited) is unchanged.
                  The count in this sentence is the real one rather than the
                  word "some", because a stranger reading "twenty of the
                  creators" learns something about the size of the programme
                  that "some" hides. */}
              <p className="mx-auto mt-2 text-center text-sm text-smoke">
                {featured.length > 4
                  ? `${tr("Swipe to meet")} ${featured.length} ${tr("of the creators who have been busy in the community lately.")}`
                  : tr("Some of the creators who've been busy in the community lately.")}
              </p>
              {/* FOUR AT A TIME ON A DESKTOP, TWO AND A BIT ON A PHONE, AND
                  ALWAYS ONE MORE PEEKING. The widths are the whole design: 44%
                  puts two full cards and half of a third on a 375px screen, and
                  `lg:w-[calc((100%-4.5rem)/4)]` is exactly four cards and the
                  three 1.5rem gaps between them - so a laptop shows the same
                  four it always did, and the fifth is behind the right edge
                  waiting to be scrolled to rather than absent. */}
              <Rail
                className="mt-6 sm:mt-8"
                itemClassName="w-[44%] sm:w-[30%] md:w-[23%] lg:w-[calc((100%-4.5rem)/4)]"
                gap="gap-3 sm:gap-6"
                stagger={0.06}
                label={tr("Recently active creators")}
              >
                {/* THE FACES DO SOMETHING NOW.

                    They were plain divs, which is the worst of both: they lift
                    and magnify under a pointer exactly like every other card on
                    this page, so they promise a press and then swallow it. The
                    map pin already opens the right thing, and it is the same
                    dialog and the same argument - meet a person, then be told
                    that connecting with them needs an account - so this opens
                    it too rather than growing a second one.

                    `featured_creators` returns no city or country (it is a
                    public RPC and deliberately narrow), so the dialog draws
                    what it has. That is why it reads `.city`/`.country`
                    defensively. */}
                {featured.map((c) => (
                  <button
                    type="button"
                    key={c.name}
                    onClick={() => setMiniProfile(c)}
                    className="landing-lift card flex h-full w-full flex-col items-center gap-2.5 !p-5 text-center sm:gap-3 sm:!p-7 hoverable:hover:shadow-lift"
                  >
                    {/* CENTRED BY THE BOX, NOT BY THE TEXT. The photo is an inline <img>, so it sat on a text baseline
                        inside its wrapper and drifted off centre; the wrapper is a centring flex box now and the image a
                        block. */}
                    <span className="landing-lift-icon flex w-full justify-center">
                      <Avatar src={c.photo_url} name={c.name} size="lg" className="block" />
                    </span>
                    <p className="text-sm font-semibold leading-snug sm:text-base">{c.name}</p>
                    <p className="text-xs leading-relaxed text-smoke line-clamp-2">{c.bio}</p>
                    <p className="mt-auto flex items-center justify-center gap-1 pt-1 text-xs font-semibold text-brand">
                      <Icon name="globe" className="h-3.5 w-3.5" /> {c.countries} {tr("countries")}
                    </p>
                  </button>
                ))}
              </Rail>
            </div>
          )}
        </section>
      )}

      {/* ---------- How it works ---------- */}
      {/* THE SAME CLOSING GAP AS THE SECTION ABOVE IT. Measured on a phone: 116px under the recently-active rail (its
          own bottom padding was closed last pass) against 140px here, so this was the one left standing at the page's
          old rhythm. Both are pb-10 now, and every heading on the page has the same amount of air over it. */}
      <section className="mx-auto max-w-6xl px-5 pb-10 pt-16 sm:px-8 sm:pb-16 sm:pt-24">
        <h2 className="text-center text-[26px] font-bold tracking-tight sm:text-4xl">{tr("How it works")}</h2>
        <p className="mx-auto mt-3 max-w-md text-center text-sm text-smoke sm:mt-4 sm:text-base">{tr("Three steps between you and your first payout.")}</p>
        {/* THE THREE STEPS ARRIVE IN ORDER, which is the one place on this page where a stagger carries meaning rather
            than decoration: they are numbered 01, 02, 03 and they are a sequence, so they should land as one. The copy
            is untouched except for one word -

            THE THREE CARDS ARE THE SAME HEIGHT. A grid stretches its ITEMS, and `Reveal` wraps every child in a div of
            its own - so the three wrappers were all the same height and the cards INSIDE them were not, each sizing to
            its own paragraph. `h-full` on the card makes it fill the wrapper the grid already sized.

            AND THE SAME WIDTH, WHICH IS THE OTHER HALF. A snap rail sizes each item to a percentage of the SCROLLER, not
            of the row, so the three were already the same width - what differed was their CONTENT height inside a rail,
            where `items-stretch` on a flex row makes the wrappers equal and `h-full` was the thing carrying that down to
            the card. That is now shared with every other rail on the page (see `Rail`), so this cannot drift out of step
            with the two below it again: one component, one set of widths, one stretch rule.

            AND "PARTICIPATION" IS GONE FROM THAT PARAGRAPH. It is internal vocabulary: a creator does not need to know
            which SORT of voucher it is in order to want one, and dropping it is what gets the sentence onto three lines
            instead of four, which is most of why that card was the tall one to begin with. */}
        {/* THREE STEPS READ AS A ROW ON A PHONE TOO.

            Stacked, these three were 1,322px - one and a half screens for three
            sentences - and worse than merely long: 01, 02 and 03 are a
            SEQUENCE, and a sequence you have to scroll through one card at a
            time stops being one. The desktop reads left to right because the
            three are beside each other, and that is the thing worth carrying
            over rather than the grid that produces it.

            THE RAIL IS NOW EVERY WIDTH, not just the phone. Three cards at 30% on a laptop is the same row the
            `sm:grid-cols-3` drew, minus nothing - they fit, so nothing scrolls and the arrows disable themselves. What
            it buys is one implementation for all three rails instead of a grid that has to be kept in step with two
            rails by hand.

            AND THE ANIMATION COMES BACK BY ITSELF. A rail is one screen tall,
            so `Reveal` stays in its container mode and the 01-02-03 stagger
            plays exactly as it does on a desktop. Stacked, the container was
            two screens tall and the whole stagger was spent before the reader
            reached card two - see the note in Reveal.jsx. */}
        <Rail
          className="mt-6 sm:mt-12"
          itemClassName="w-[78%] sm:w-[46%] lg:w-[calc((100%-4rem)/3)]"
          gap="gap-4 sm:gap-8"
          stagger={0.09}
          label={tr("How it works")}
        >
          {[
            { step: '01', icon: 'pencil', title: 'Apply', text: 'Sign up for free, build your creator profile, and fill in your travel map. Share your socials and connect with other creators.' },
            { step: '02', icon: 'video', title: 'Create', text: 'Participate in content challenges with a clear brief. Film your video, post it on Instagram or TikTok, and share the link for it to be counted.' },
            { step: '03', icon: 'money', title: 'Earn', text: 'Top videos win cash prizes. Take part and you can also earn Tryp.com vouchers to spend on flights and hotels. Your dream trip is not far away!' },
          // The step number sits ON the card's top edge rather than inside it,
          // so the eye can run 01-02-03 across the row without reading three
          // whole cards to find the order.
          ].map((c) => (
            <div key={c.step} className="landing-lift card relative flex h-full flex-col !p-6 !pt-9 text-center sm:!p-9 sm:!pt-11 hoverable:hover:shadow-lift">
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand px-3 py-1 text-[11px] font-bold tracking-[0.2em] text-white">
                {c.step}
              </span>
              <StepIcon name={c.icon} />
              <h3 className="mt-3.5 text-lg font-semibold sm:mt-4 sm:text-xl">{tr(c.title)}</h3>
              <p className="mt-2.5 text-[13px] leading-relaxed text-smoke sm:mt-3 sm:text-sm">{tr(c.text)}</p>
            </div>
          ))}
        </Rail>
      </section>

      {/* ---------- Benefits ---------- */}
      {/* WHY CREATORS JOIN, REDRAWN.

          It was four white boxes with an icon, a bold line and a paragraph -
          correct, and completely flat: four identical rectangles on a grey
          band, all the same weight, nothing leading the eye across them.

          Three changes, and none of them adds a colour (the palette is white,
          ink and one orange, and this section was never the place to break
          that):
          each card carries a numbered rule at the top, so the four read as
          a list rather than as a wall;
          the icon takes the brand orange properly, and it gets its own
          movement on hover rather than riding the card's;
          they arrive in turn, and they magnify under a pointer like
          everything else on the page now does. */}
      {/* WHITE, LIKE THE REST OF THE PAGE.

          It was `bg-cloud/50` to separate four cards from the section above
          them, which is a job the cards' own shadow already does - and the
          moment the map above it went flush white, this band was the only grey
          left below the fold and read as a different page. The cards keep a
          hairline ring so they still have an edge on white rather than relying
          on the shadow alone at low brightness. */}
      {/* ---------- The wall of fame ----------
          Outstanding from the brief. Everything else on this page is a promise
          - prizes you could win, a community you could join. This is the only
          section that is a RESULT: a name, a place and the challenge it was
          won in. It is drawn from `public_wall_of_fame`, which shows FINAL
          results only (an interim leaderboard is a work in progress, and
          putting somebody on a public wall as a winner and then moving them is
          not a mistake anybody can take back) and which honours the same
          `show_on_map` flag as the map above it. One flag, one meaning: "do
          not put me on the public page."

          It draws nothing at all until a challenge has been settled, which is
          right - an empty Wall of Fame is worse than no wall. */}
      {wall.length > 0 && (
        <section className="bg-cloud/40 py-16 sm:py-24">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <h2 className="text-center text-[26px] font-bold tracking-tight sm:text-4xl">{tr("Wall of fame")}</h2>
            <p className="mx-auto mt-3 max-w-md text-center text-sm text-smoke sm:mt-4 sm:text-base">
              {tr("The creators whose videos have earned the most views on Tryp.com. Every one of them started where you are now.")}
            </p>
            {/* ONE ROW THAT SCROLLS, MOST VIEWS ON THE LEFT. The team: same horizontal scroll as the rest of the page,
                "so it only takes up one line", each card showing the creator's ACCUMULATED VIEWS, no 1st/2nd/3rd, and
                the top thirty always there. The RPC returns them already sorted by views; a small trophy count marks the
                ones who have won a challenge. */}
            <Rail
              className="mt-8 sm:mt-12"
              itemClassName="w-[46%] sm:w-[28%] md:w-[22%] lg:w-[calc((100%-4rem)/5)]"
              gap="gap-3 sm:gap-4"
              stagger={0.05}
              label={tr("Wall of fame")}
            >
              {/* EVERY CARD OPENS THE CREATOR. The team: the first card "shows a weird orange border on top" and
                  "clicking on it seems to provide no information. It should just show the information like when you
                  click on Recently Active Creators." The stripe is gone, and each card is a button into the same mini
                  profile, with their views, wins and videos on it. */}
              {wall.map((w, i) => (
                <button
                  type="button"
                  key={`${w.name}-${i}`}
                  onClick={() => setMiniProfile({ ...w, views: Number(w.total_views) || 0 })}
                  className="landing-lift group relative flex h-full w-full flex-col items-center overflow-hidden rounded-card bg-white p-4 pt-5 text-center shadow-card ring-1 ring-black/5 sm:p-5 sm:pt-6 hoverable:hover:shadow-lift"
                >
                  <div className="landing-lift-icon relative flex justify-center">
                    <Avatar src={w.photo_url} name={w.name} size="lg" className="block" />
                    {w.wins > 0 && (
                      <span className="absolute -bottom-1 -right-2 flex h-6 min-w-6 items-center justify-center gap-0.5 rounded-full bg-gradient-to-br from-brand to-brand-light px-1.5 text-[10px] font-bold text-white shadow-card ring-2 ring-white" title={tr("Challenge wins")}>
                        <Icon name="trophy" className="h-3 w-3" />{w.wins > 1 ? w.wins : ''}
                      </span>
                    )}
                  </div>
                  <p className="mt-3 w-full truncate text-sm font-bold text-ink">{w.name}</p>
                  <p className="mt-2 text-2xl font-bold tabular-nums tracking-tight text-brand sm:text-[26px]">{formatViews(Number(w.total_views) || 0)}</p>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">{tr("views so far")}</p>
                </button>
              ))}
            </Rail>
          </div>
        </section>
      )}

      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <h2 className="text-center text-[26px] font-bold tracking-tight sm:text-4xl">{tr("Why creators join")}</h2>
          <p className="mx-auto mt-3 max-w-md text-center text-sm text-smoke sm:mt-4 sm:text-base">
            {tr("Four reasons, and the first one is paid in cash.")}
          </p>
          {/* THE SAME RAIL AS THE OTHER TWO.

              This was a two-across grid on a phone, which was itself a fix for
              a worse thing (`grid-cols-1` made four full-width slabs, 1,344px
              of them). Two-across works and the rail is better for the same
              reason it is better on "How it works": four reasons are a LIST,
              and a list whose fourth item is below the fold is three claims and
              a rumour. At 66% the reader always has one and a half of them in
              view and can feel there is more.

              At `lg` all four fit in the row, so nothing scrolls and the arrows
              disable themselves - the rail simply becomes the grid it used to
              be, without a second set of classes to keep in step. */}
          <Rail
            className="mt-6 sm:mt-12"
            itemClassName="w-[66%] sm:w-[38%] md:w-[30%] lg:w-[calc((100%-4.5rem)/4)]"
            gap="gap-3 sm:gap-6"
            stagger={0.08}
            label={tr("Why creators join")}
          >
            {[
              { icon: 'money', title: 'Real cash prizes', text: 'Cash for the top spots in every challenge, spend it your way.' },
              { icon: 'ticket', title: 'Travel vouchers', text: 'Take part in challenges and earn Tryp.com vouchers you can use to book your next trip.' },
              { icon: 'chart', title: 'Brand exposure', text: "The top videos get featured with creator credit on Tryp.com's global accounts with +100k followers." },
              { icon: 'heart', title: 'A real community', text: 'Collab, connect, swap tips and plan trips with creators around the world.' },
            ].map((b, i) => (
              <div
                key={b.title}
                className="landing-lift group relative flex h-full flex-col overflow-hidden rounded-card bg-white p-5 shadow-card ring-1 ring-black/[0.04] sm:p-7 hoverable:hover:shadow-lift"
              >
                {/* The rule number, quiet enough to be furniture and present
                    enough to make the four read in order. */}
                {/* `text-cloud` on white was invisible. It is furniture, so it must not compete with the heading; it is
                    also a reading order, so it has to be legible. `text-gray-300` is the step that is both. */}
                <span className="absolute right-4 top-4 text-lg font-bold tabular-nums text-gray-300 sm:right-6 sm:top-6 sm:text-2xl" aria-hidden>
                  0{i + 1}
                </span>
                <StepIcon name={b.icon} align="left" />
                <h3 className="mt-3.5 text-[15px] font-semibold leading-snug sm:mt-4 sm:text-base">{tr(b.title)}</h3>
                <p className="mt-1.5 text-[13px] leading-relaxed text-smoke sm:mt-2 sm:text-sm">{tr(b.text)}</p>
              </div>
            ))}
          </Rail>
        </div>
      </section>

      {/* ---------- Mini profile + join prompt (from a map pin) ----------

          IT ARRIVES LIKE EVERY OTHER SHEET IN THE PRODUCT NOW.

          Three things, and the first is most of it. The SCRIM was painted at
          full strength on the frame it mounted, so the page went dark in one
          cut and the card then slid into an already-black screen. The CARD used
          `animate-fade-up`, a 12px rise, which reads as a flicker on something
          pinned to the bottom edge of a phone. And nothing closed it but the
          scrim - no Escape - on a dialog that covers the map it came from.

          `.scrim-in` and `.sheet-in` are the same two classes `Modal` uses, so
          this hand-rolled dialog and the fifty built ones now move alike. */}
      {/* CENTRED AT EVERY WIDTH.

          A bottom sheet is the right shape for something you ACT in - a form,
          a long list, anything your thumb has to reach. This is a portrait, a
          sentence and two buttons: it is a card, and a card belongs where the
          eye already is. `items-center` and a full radius, so it is a
          floating dialog rather than a drawer, and `animate-fade-up` rather
          than `sheet-in` because a 12px rise is what a centred card does. */}
      {miniProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`${miniProfile.name}'s profile`}>
          <button aria-label={tr("Close")} className="scrim-in absolute inset-0 bg-ink/50 backdrop-blur-sm" onClick={() => setMiniProfile(null)} />
          <div className="animate-fade-up relative max-h-[85vh] w-full max-w-sm overflow-y-auto overscroll-contain rounded-card bg-white p-7 text-center shadow-lift">
            <button onClick={() => setMiniProfile(null)} aria-label={tr("Close")}
              className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full text-smoke transition-colors hover:bg-cloud">
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>
            </button>
            <div className="flex justify-center">
              <Avatar src={miniProfile.photo_url} name={miniProfile.name} size="xl" className="block" />
            </div>
            <h3 className="mt-4 text-xl font-bold">{miniProfile.name}</h3>
            {(miniProfile.city || miniProfile.country) && (
              <p className="mt-1 flex items-center justify-center gap-1 text-sm text-smoke">
                <Icon name="pin" className="h-3.5 w-3.5 text-brand" />
                {[miniProfile.city, miniProfile.country].filter(Boolean).join(', ')}
              </p>
            )}
            {miniProfile.bio && <p className="mt-3 text-sm leading-relaxed text-smoke line-clamp-4">{miniProfile.bio}</p>}
            {miniProfile.views != null && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                {[
                  [formatViews(miniProfile.views), tr('views so far')],
                  [String(miniProfile.videos ?? 0), tr('videos')],
                  [String(miniProfile.wins ?? 0), tr('Challenge wins')],
                ].map(([v, l]) => (
                  <div key={l} className="rounded-xl bg-cloud/70 px-2 py-2.5">
                    <p className="text-lg font-bold tabular-nums leading-none text-brand">{v}</p>
                    <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-smoke">{l}</p>
                  </div>
                ))}
              </div>
            )}
            {miniProfile.countries > 0 && (
              <p className="mt-3 inline-flex items-center gap-1 rounded-full bg-brand-tint px-3 py-1 text-xs font-semibold text-brand">
                <Icon name="globe" className="h-3.5 w-3.5" /> {tr('{n} countries explored', { n: miniProfile.countries })}
              </p>
            )}
            <div className="mt-6 rounded-card bg-cloud/70 p-4">
              <p className="text-sm font-medium text-ink">{tr('Join the community to connect with {name}.', { name: miniProfile.name.split(' ')[0] })}</p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Link to="/signup" className="btn-primary flex-1 !py-2.5 text-sm">{tr("Sign up")}</Link>
                <Link to="/login" className="btn-secondary flex-1 !py-2.5 text-sm">{tr("Log in")}</Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------- Final CTA ---------- */}
      {/* THE PAGE STOPS SHORTLY AFTER THE LAST THING IT SAYS.

          Measured at 375px: 64px of section padding under the panel, then a
          40px footer pad, a 32px logo, a 16px gap and two lines - 220px of
          which about 150px was air and a repeat of the masthead. A logo at the
          foot of a page is a sign-off for a document you have finished reading;
          this page ends on a button, and the last thing under a call to action
          should not be the brand introducing itself again. */}
      <section className="mx-auto max-w-6xl px-5 pb-10 sm:px-8 sm:pb-16">
        {/* ONE PASS OF LIGHT, ONCE. The sheen is the same idea the live
            challenge card uses, and it is deliberately not a loop: a repeating
            shine on the last thing on the page is an advert for itself. */}
        <div className="relative overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light px-6 py-12 text-center text-white shadow-lift sm:px-8 sm:py-20">
          <span aria-hidden className="landing-sheen pointer-events-none absolute inset-y-0 left-0" />
          <h2 className="relative mx-auto max-w-xl text-[26px] font-bold leading-tight sm:text-4xl">
            {tr("Your next trip could pay for itself.")}
          </h2>
          <p className="relative mx-auto mt-3 max-w-md text-sm text-white/85 sm:mt-4 sm:text-base">
            {tr("Free to join. New briefs go up every month.")}
          </p>
          <Link
            to="/signup"
            className="btn relative mt-8 w-full max-w-xs justify-center bg-white !py-3.5 !text-base text-brand shadow-card sm:mt-10 sm:w-auto sm:!px-10 sm:!py-4 transition-all duration-300 hover:bg-white hoverable:hover:-translate-y-1 hoverable:hover:scale-[1.04] hoverable:hover:shadow-lift"
          >
            {tr("Join the community →")}
          </Link>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      {/* NO LOGO, NO RULE, ONE LINE. See the note on the section above for the ask. The hairline went with the logo for
          the same reason: it was there to separate a footer block from the page, and two lines of small grey type at the
          very bottom are not a block that needs separating - they are the end. The two legal links join the copyright on
          one line at `sm` and wrap to their own beneath it on a phone, which is the only width where three items do not
          fit. */}
      {/* CLOSER TO THE CARD ABOVE IT. The panel above already ends in a generous 48px of its own padding, so this was
          adding a second gap to a page that had just finished speaking. */}
      <footer className="pb-8 pt-0 sm:pb-10 sm:pt-1">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-1.5 px-5 text-center text-xs text-smoke sm:flex-row sm:justify-center sm:gap-0 sm:px-8">
          <p>
            © {new Date().getFullYear()} {tr('Tryp.com Content Creator Community')}
            <span className="px-2" aria-hidden>·</span>
            <a href={TRYP_URL} target="_blank" rel="noopener noreferrer" className="font-medium text-brand hover:underline">{tr("tryp.com ↗")}</a>
          </p>
          <p>
            <span className="hidden px-2 sm:inline" aria-hidden>·</span>
            <Link to="/privacy" className="hover:text-brand">{tr("Privacy Policy")}</Link>
            <span className="px-2" aria-hidden>·</span>
            <Link to="/terms" className="hover:text-brand">{tr("Terms of Service")}</Link>
          </p>
        </div>
      </footer>
    </div>
  )
}
