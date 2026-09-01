import { Link } from 'react-router-dom'
import Icon from '../Icon'
import FlagStack from './FlagStack'
import { challengeDeadline } from '../../lib/utils'

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
export default function LiveNowRow({ challenge, market, global: isGlobal, now }) {
  if (!challenge) return null
  const closes = challengeDeadline(challenge.end_date)
  const days = Math.max(0, Math.ceil((closes - now) / 86400000))
  return (
    <Link
      to={`/challenges/${challenge.id}`}
      className="relative flex items-center gap-3 overflow-hidden rounded-card bg-gradient-to-br from-brand to-brand-light px-4 py-3.5 text-white shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lift active:scale-[0.99]"
    >
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
      {!isGlobal && market?.country_codes?.length > 0 && (
        <span aria-hidden className="relative shrink-0 text-lg leading-none">
          <FlagStack codes={market.country_codes} className="text-lg" />
        </span>
      )}
      <span className="relative min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/80">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/70" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-white" />
          </span>
          {isGlobal ? 'Live · everyone' : `Live in ${market?.name || 'your market'}`}
        </span>
        {/* `line-clamp-2` rather than `truncate`: the rail is 20rem wide and a
            brief title cut at one line there says less than nothing. On a phone
            a title long enough to wrap is rare and two lines is fine. */}
        <span className="mt-1 block line-clamp-2 text-[15px] font-semibold leading-snug">{challenge.title}</span>
        <span className="mt-0.5 block text-xs text-white/75">
          {days === 0 ? 'Closes today' : days === 1 ? 'Closes tomorrow' : `${days} days left`}
          {' · Submit your video'}
        </span>
      </span>
      <Icon name="chevronRight" className="relative h-5 w-5 shrink-0 text-white/70" />
    </Link>
  )
}
