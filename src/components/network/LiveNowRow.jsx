import { Link } from 'react-router-dom'
import Icon from '../Icon'
import FlagStack from './FlagStack'
import { challengeDeadline, cx } from '../../lib/utils'

// THE LIVE CHALLENGE, AS ONE ROW, ON EVERY SCREEN.
//
// Ethan: "on mobile I really like how you made the live challenge card - could
// you please use that same design for desktop, and the live challenge card be
// like that in the top right."
//
// It existed twice. The phone got a gradient row with the market's flags, a
// pulsing dot, the title, how long is left and "Submit your video"; the desktop
// rail got a flat `bg-brand` slab with the same facts arranged slightly
// differently and no flags. Two implementations of one card is how they drifted
// in the first place, and the phone's is the one that won, so this IS the
// phone's - lifted out unchanged and imported by both.
//
// A GRADIENT AND A HORIZON, NOT A SLAB OF ORANGE. Solid brand was right about
// the weight and wrong about the finish: 340x86 of one flat colour is a lot of
// paint on a white page. Ethan: "I like the Tryp.com orange, it really stands
// out but it's almost too much." So it is the same gradient the hero card uses,
// with a soft bloom in the corner and the market's own flags on it - which also
// answers "which of my markets is this" without spending a line on it.
//
// THE WHOLE ROW IS THE LINK and always was; there is no button, only a chevron.
// The space that buys goes to the fact the old card was missing entirely: when
// it closes.
// `now` is a REQUIRED prop, not a `Date.now()` default. Reading the clock
// during render is impure (and the lint here catches it): the caller already
// holds a ticking `nowMs`, so the countdown updates with everything else on the
// page instead of only when this row happens to re-render.
//
// `expanded` IS THE MOBILE "LIVE NOW" CARD, GETTING TWO DOORS (23 Sep 2026).
// Ethan: "make that card a bit vertically longer on mobile and add two
// buttons side by side, one for read brief and one to submit." Everywhere
// else (the desktop rail) this stays the single-link row it always was - the
// whole row IS the link there, and adding two more targets inside it would
// be three links doing two people's worth of thinking in a 20rem column.
export default function LiveNowRow({ challenge, market, global: isGlobal, now, expanded = false }) {
  if (!challenge) return null
  const closes = challengeDeadline(challenge.end_date)
  const days = Math.max(0, Math.ceil((closes - now) / 86400000))
  const gradient = isGlobal
    // THE GLOBAL ONE WEARS THE GLOBAL CARD'S GROUND (21 Sep 2026): the darker
    // ember-to-orange gradient /challenges paints it in, so the worldwide brief
    // is told apart from a market's at a glance, here as there.
    ? 'bg-gradient-to-br from-[#8f2a04] via-brand to-brand-light'
    : 'bg-gradient-to-br from-brand to-brand-light'

  const info = (
    <>
      {!isGlobal && market?.country_codes?.length > 0 && (
        <span aria-hidden className="relative shrink-0 text-lg leading-none">
          <FlagStack codes={market.country_codes} className="text-lg" />
        </span>
      )}
      <span className="relative min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/80">
          {/* JUST THE DOT, NO RING (23 Sep 2026) - see `LiveDot` in
              network/Motion.jsx. */}
          <span className="inline-flex h-1.5 w-1.5 animate-pulse rounded-full bg-white" />
          {isGlobal ? 'Live · everyone' : `Live in ${market?.name || 'your market'}`}
        </span>
        {/* `line-clamp-2` rather than `truncate`: the rail is 20rem wide and a
            brief title cut at one line there says less than nothing. On a phone
            a title long enough to wrap is rare and two lines is fine. */}
        <span className="mt-1 block line-clamp-2 text-[15px] font-semibold leading-snug">{challenge.title}</span>
        <span className="mt-0.5 block text-xs text-white/75">
          {days === 0 ? 'Closes today' : days === 1 ? 'Closes tomorrow' : `${days} days left`}
          {!expanded && ' · Submit your video'}
        </span>
      </span>
      {!expanded && <Icon name="chevronRight" className="relative h-5 w-5 shrink-0 text-white/70" />}
    </>
  )

  const sheen = (
    <>
      <span aria-hidden className="pointer-events-none absolute -right-10 -top-12 h-40 w-40 rounded-full bg-white/15 blur-2xl" />
      {/* THE SAME ONE PASS OF LIGHT THE BIG CARD GETS.
          Ethan: "the animation you have in this card where it's like a line
          that goes through it at the start - I really like this animation. I
          want you to incorporate it for the live challenge card on the
          worldwide page, for both mobile and desktop."
          This IS both: one component, drawn in the phone's feed and in the
          desktop rail, so there is nothing to do twice. `challenge-sheen` is
          the class the hero card uses - a single 1.5s pass, `both` so it holds
          its end state, and off entirely under prefers-reduced-motion. It is
          inside the row's own `overflow-hidden`, so it sweeps the card and
          nothing else. */}
      <span aria-hidden className="challenge-sheen pointer-events-none absolute inset-0" />
    </>
  )

  if (expanded) {
    return (
      <div className={cx('relative overflow-hidden rounded-card px-4 py-4 text-white shadow-card', gradient)}>
        {sheen}
        <div className="relative flex items-center gap-3">{info}</div>
        {/* TWO DOORS, THE SAME SIZE. Reading is free; submitting is the whole
            point of the challenge being here at all, so it gets the solid,
            louder button and reading gets the quieter outline one - the same
            pairing GlobalChallengeStrip already uses on desktop. */}
        <div className="relative mt-3.5 grid grid-cols-2 gap-2.5">
          <Link
            to={`/challenges/${challenge.id}`}
            className="btn justify-center whitespace-nowrap border border-white/50 !text-white hover:bg-white/10"
          >
            Read brief
          </Link>
          <Link
            to={`/challenges/${challenge.id}?submit=1`}
            className="btn justify-center whitespace-nowrap border border-white bg-white !text-brand hover:bg-white/90"
          >
            Submit your video
          </Link>
        </div>
      </div>
    )
  }

  return (
    <Link
      to={`/challenges/${challenge.id}`}
      className={cx(
        'relative flex items-center gap-3 overflow-hidden rounded-card px-4 py-3.5 text-white shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.99]',
        gradient,
      )}
    >
      {sheen}
      {info}
    </Link>
  )
}
