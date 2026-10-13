import { useEffect, useRef } from 'react'
import Icon from '../components/Icon'
import { cx } from '../lib/utils'

// Public landing page - bright, spacious, one clear focal point per section.
// Live stats come from the public landing_stats() / featured_creators() RPCs;
// graceful placeholders are used until the database is connected.
export const TRYP_URL = 'https://www.tryp.com'

// AN ICON, NOT AN ICON IN A BOX.
//
// Ethan (9 Sep 2026), about "Real cash prizes" and "Travel vouchers" and then
// again about "How it works": "rather than having the orange background square,
// it should just be a full Tryp.com orange icon. No need for the background."
//
// He is right, and the reason is worth keeping so nobody puts the tile back. A
// `bg-brand-tint` rounded square is a BUTTON shape - it is the same 44px
// affordance the app uses for something you press - so four of them down a
// marketing page read as four controls that do nothing. It also spent the
// brand's one colour on a wash: the tint is 8% orange behind a 20px glyph, so
// the loudest thing in the card was a pale rectangle rather than the mark
// inside it.
//
// Removing the tile means the glyph has to carry the weight the tile was
// carrying, so it roughly doubles in size (28px on a phone, 32px from `sm`) and
// takes the full brand orange. Same footprint, one object instead of two, and
// the colour is now on the thing with a shape.
//
// `landing-lift-icon` is kept: it is the hover rule that gives the mark its own
// movement rather than riding the card's scale, and it was always on this
// element rather than on the tile.
//
// `align` exists because the two callers differ and always have - "How it
// works" is a centred card and "Why creators join" is left-aligned - and it was
// previously the difference between `mx-auto` and nothing, written out at each
// call site.
export function StepIcon({ name, align = 'center' }) {
  return (
    <span
      className={cx('landing-lift-icon block text-brand', align === 'center' && 'mx-auto')}
      aria-hidden
    >
      <Icon name={name} className="h-7 w-7 sm:h-8 sm:w-8" />
    </span>
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
// WHAT THE PUBLIC PAGE IS ALLOWED TO SAY ABOUT MONEY.
//
// Ethan: "we don't wanna say exactly how much we've given away." The exact
// total is a real number the platform knows to the cent - it is the sum of
// every distributed reward plus every prize on the forty-nine challenges the
// programme ran before this existed - and a stranger reading "€9,295" is
// reading a company's payout ledger to the euro. So the band shows the
// THOUSAND BELOW it, with a plus: true, useful, and not a disclosure.
//
// ROUNDING DOWN IS THE WHOLE POINT AND IT IS NOT AN AESTHETIC CHOICE. Rounding
// to nearest could round UP - €9,600 would print "€10,000+", which claims more
// than was paid and puts a false number in front of people deciding whether to
// join. Floor plus "+" can only ever understate, so every reading of it is
// literally true.
//
// UNDER A THOUSAND THERE IS NOTHING TO ROUND TO: flooring €640 gives €0, and
// "€0+" is a worse sentence than any exact figure. Below the first thousand the
// band prints the real number and the caller drops the plus (it only appears
// when the floor is genuinely below the total).
export const PRIZE_STEP = 1000

export function prizeFloor(total) {
  const n = Number(total) || 0
  if (n < PRIZE_STEP) return n
  return Math.floor(n / PRIZE_STEP) * PRIZE_STEP
}

// ONE FORMATTER, BUILT ONCE, AND IT IS PART OF WHY THE BAND STUTTERED.
//
// `formatMoney` in lib/utils constructs a `new Intl.NumberFormat` on every
// call. That is exactly right for the fifty places in the app that format a
// figure once and paint it - and it is the wrong shape entirely for something
// called ninety-six times in 1.6 seconds on the first screen a stranger sees on
// a phone. Constructing an `Intl` formatter is one of the most expensive things
// in the platform's own standard library; reusing one is free.
//
// So the landing page keeps its own. It is deliberately NOT a change to
// `formatMoney`, because a module-level cache there would be a shared mutable
// keyed on arguments this does not need: this band is EUR and whole pounds of
// prize money, full stop.
export const MONEY = new Intl.NumberFormat('en-GB', {
  style: 'currency',
  currency: 'EUR',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
})

export const money = (n) => MONEY.format(n || 0)

// ONE WORD OF THE HEADLINE.
//
// The animation itself is CSS (`.hero-word` in index.css); this exists only to
// take the compositor promotion back off once the entrance has finished.
// `will-change: transform` is a standing request to the browser to keep a layer
// for that element FOR EVER, and three permanent layers for an animation that
// ran once at page load is memory held for nothing. `animationend` is the exact
// moment it stops being useful.
//
// The listener is one-shot and the class is idempotent, so a re-render cannot
// re-arm it, and nothing here can leave a word invisible: the class only
// changes `will-change`.
export function HeroWord({ i, className = '', children }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const settle = () => el.classList.add('is-settled')
    el.addEventListener('animationend', settle, { once: true })
    // A TIMER BEHIND IT, for the same reason every other animation in this
    // codebase has one: `animationend` never fires if the animation never runs,
    // which is the case under prefers-reduced-motion and in a background tab.
    // Without this the promotion would simply be held for the life of the page
    // for exactly the readers who asked for less work, not more.
    const t = setTimeout(settle, 1400)
    return () => { el.removeEventListener('animationend', settle); clearTimeout(t) }
  }, [])
  return (
    <span ref={ref} className={`hero-word ${className}`} style={{ '--word-i': i }}>
      {children}
    </span>
  )
}
