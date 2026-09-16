import { formatViews, formatMoney, cx } from '../../lib/utils'
import { flagEmoji } from '../../lib/countries'
import Icon from '../Icon'

// THE SHAPES A STORY CARD CAN TAKE.
//
// Six of them, and the point of having only six is that a recap of fourteen
// screens has to feel like ONE thing rather than fourteen designs. The variety
// comes from the palette and the numbers, not from re-inventing the layout
// every card - which is also how Spotify does it, and why theirs reads as a
// single story rather than a slide deck.
//
// Every card is drawn at a 9:16-ish aspect on purpose. It is the shape of a
// phone screen and the shape of an Instagram story, and the last card in the
// run is exported as a picture at exactly these proportions - so designing to
// anything else would mean designing the share twice.

export const PALETTES = {
  ember: { bg: 'linear-gradient(160deg,#d94407 0%,#f5853f 55%,#ffb37a 100%)', ink: '#ffffff', soft: 'rgba(255,255,255,0.82)', chip: 'rgba(255,255,255,0.18)' },
  dusk: { bg: 'linear-gradient(160deg,#1d1633 0%,#42265c 50%,#d94407 120%)', ink: '#ffffff', soft: 'rgba(255,255,255,0.78)', chip: 'rgba(255,255,255,0.14)' },
  sky: { bg: 'linear-gradient(165deg,#0b3d63 0%,#2f7fb5 55%,#a9d9f5 100%)', ink: '#ffffff', soft: 'rgba(255,255,255,0.82)', chip: 'rgba(255,255,255,0.16)' },
  sand: { bg: 'linear-gradient(160deg,#fff4ea 0%,#ffdfc4 55%,#ffc79a 100%)', ink: '#3b1c07', soft: 'rgba(59,28,7,0.72)', chip: 'rgba(217,68,7,0.12)' },
  night: { bg: 'linear-gradient(165deg,#101014 0%,#23232c 60%,#3a2a22 100%)', ink: '#ffffff', soft: 'rgba(255,255,255,0.7)', chip: 'rgba(255,255,255,0.1)' },
  mint: { bg: 'linear-gradient(160deg,#04322b 0%,#0d6b57 55%,#7fd4b8 100%)', ink: '#ffffff', soft: 'rgba(255,255,255,0.8)', chip: 'rgba(255,255,255,0.16)' },
}

/** The Tryp mark, drawn rather than fetched so a share picture never waits. */
export function TrypMark({ tone = '#ffffff', className = '' }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5', className)} style={{ color: tone }}>
      <Icon name="plane-tryp" className="h-4 w-4" />
      <span className="text-[11px] font-extrabold uppercase tracking-[0.18em]">Tryp.com</span>
    </span>
  )
}

/**
 * The frame every card sits in.
 *
 * THE ONE HARD RULE FOR ANYTHING THAT GETS PHOTOGRAPHED: no fixed heights on a
 * box that holds text. `lib/domSnapshot` embeds Poppins from a TTF that is not
 * metrically identical to the woff2 the browser is using, so text re-wraps by a
 * pixel or two in the picture - and a frozen height turns that into two lines
 * overlapping. See the notes in domSnapshot; this is the third time it has been
 * written down because it is the third thing anybody breaks.
 */
export function Card({ palette = 'ember', children, className = '', bodyClassName = '', style, footer = true, name }) {
  const p = PALETTES[palette] || PALETTES.ember
  return (
    <div
      className={cx('relative flex flex-col overflow-hidden rounded-[28px] px-7 py-8 sm:px-9 sm:py-10', className)}
      style={{ background: p.bg, color: p.ink, ...style }}
    >
      {/* A soft bloom, so a flat gradient has somewhere for the eye to land. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-16 -top-20 h-64 w-64 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.22) 0%, rgba(255,255,255,0) 70%)' }}
      />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.14) 0%, rgba(255,255,255,0) 70%)' }}
      />
      {/* THE BODY, AND WHY IT TAKES ITS OWN CLASS. `className` lands on the
          card's outer box, which holds the body and the footer - so a
          `justify-between` passed in from a caller spaced THOSE two apart
          rather than the caller's own blocks, and the share card came out with
          everything crammed into its top half and a third of a page of empty
          orange underneath. */}
      <div className={cx('relative flex min-h-0 flex-1 flex-col', bodyClassName)}>{children}</div>
      {footer && (
        <div className="relative mt-6 flex items-center justify-between" style={{ color: p.soft }}>
          <TrypMark tone={p.soft} />
          {name && <span className="text-[11px] font-semibold">{name}</span>}
        </div>
      )}
    </div>
  )
}

export function Eyebrow({ children, palette = 'ember' }) {
  const p = PALETTES[palette] || PALETTES.ember
  return (
    <p className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: p.soft }}>
      {children}
    </p>
  )
}

/**
 * THE BIG NUMBER, which is the whole card.
 *
 * It scales with how many characters it has rather than sitting at one size:
 * "4" and "17,248,109" at the same font size means either the small one is lost
 * or the big one wraps, and a recap's hero number must never wrap.
 */
export function Hero({ value, unit, palette = 'ember' }) {
  const p = PALETTES[palette] || PALETTES.ember
  const len = String(value).length
  const size = len > 10 ? 'text-[46px] sm:text-[58px]' : len > 7 ? 'text-[58px] sm:text-[72px]' : 'text-[72px] sm:text-[92px]'
  return (
    <p className="flex flex-wrap items-baseline gap-x-2.5">
      <span className={cx('font-extrabold leading-[0.92] tracking-tight', size)}>{value}</span>
      {unit && <span className="text-lg font-bold" style={{ color: p.soft }}>{unit}</span>}
    </p>
  )
}

export function Line({ children, palette = 'ember', className = '' }) {
  const p = PALETTES[palette] || PALETTES.ember
  return (
    <p className={cx('text-[15px] font-medium leading-relaxed sm:text-base', className)} style={{ color: p.soft }}>
      {children}
    </p>
  )
}

export function Chips({ items, palette = 'ember' }) {
  const p = PALETTES[palette] || PALETTES.ember
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((t, i) => (
        <span
          key={`${t}-${i}`}
          className="rounded-full px-2.5 py-1 text-xs font-semibold"
          style={{ background: p.chip, color: p.ink }}
        >
          {t}
        </span>
      ))}
    </div>
  )
}

/** A row of small figures under a hero, for the facts that are not the point. */
export function Facts({ items, palette = 'ember' }) {
  const p = PALETTES[palette] || PALETTES.ember
  return (
    <div className="flex flex-wrap gap-x-7 gap-y-3">
      {items.filter(Boolean).map((f) => (
        <span key={f.label} className="min-w-0">
          <span className="block text-2xl font-extrabold tabular-nums leading-none">{f.value}</span>
          <span className="mt-1 block text-[11px] font-semibold uppercase tracking-wider" style={{ color: p.soft }}>
            {f.label}
          </span>
        </span>
      ))}
    </div>
  )
}

/** "Top 4% of the community" - the line people screenshot. */
export function Standing({ standing: s, what, palette = 'ember' }) {
  if (!s || !s.top) return null
  const p = PALETTES[palette] || PALETTES.ember
  return (
    <span
      className="inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-xs font-bold"
      style={{ background: p.chip, color: p.ink }}
    >
      <Icon name="trophy" className="h-3.5 w-3.5" />
      Top {s.percentile}% {what}
    </span>
  )
}

export { formatViews, formatMoney, flagEmoji }
