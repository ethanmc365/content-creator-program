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

/**
 * The real Tryp.com wordmark, cut out of its white square
 * (`/brand/tryp-wordmark*.svg`), so it sits straight on the card rather than
 * on a plate. White on the dark and orange grounds, brand orange on the one
 * pale palette. `crossOrigin` because domSnapshot reads its pixels back.
 */
export function TrypMark({ tone = '#ffffff', className = '' }) {
  const dark = /^#(3b1c07|000|111)/i.test(tone) || tone.startsWith('rgba(59')
  return (
    <img
      src={dark ? '/brand/tryp-wordmark.svg' : '/brand/tryp-wordmark-white.svg'}
      alt="Tryp.com"
      crossOrigin="anonymous"
      className={cx('h-[18px] w-auto opacity-90', className)}
    />
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
/**
 * @param {boolean} flush  square the corners. ONLY for the copy that gets
 *   photographed. Ethan: "the corners are rounded, but it shows gaps on the
 *   actual screenshot because the screenshot obviously isn't rounded." Exactly
 *   right - a PNG is a rectangle, so a 28px radius leaves four corners of
 *   whatever `snapshotNode` was told to paint behind the card, and that colour
 *   cannot match six different palettes. Squaring the exported copy removes the
 *   corners rather than trying to colour them, and a story image is full-bleed
 *   anyway. The on-screen card keeps its radius.
 */
export function Card({ palette = 'ember', children, className = '', bodyClassName = '', style, footer = true, name, flush = false }) {
  const p = PALETTES[palette] || PALETTES.ember
  return (
    <div
      className={cx('relative flex flex-col overflow-hidden px-7 py-8 sm:px-9 sm:py-10', flush ? 'rounded-none' : 'rounded-[28px]', className)}
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
    <p data-anim="rise" className="text-[11px] font-bold uppercase tracking-[0.22em]" style={{ color: p.soft }}>
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
/**
 * How big the big number can be, given how many characters it is.
 *
 * Ethan: "I noticed an issue where some of the months that have more letters
 * don't fit onto the cards... ensuring that in every possible scenario for
 * every card, you've accounted for every possibility and then it all fits."
 *
 * The ladder had three rungs and the middle one covered 8 to 10 characters at
 * 72px, which is where the month card lives: "September" is nine characters and
 * ran off the side. The rungs are finer now and start stepping down at seven,
 * so the longest month names (September, February, November, December) land two
 * sizes below "May".
 *
 * Exported because it is the kind of thing that only ever breaks for one value
 * nobody thought of, and a test is cheaper than finding out on somebody's
 * recap.
 */
export function heroSize(value) {
  const len = String(value ?? '').length
  if (len > 14) return 'text-[32px] sm:text-[40px]'
  if (len > 11) return 'text-[38px] sm:text-[48px]'
  if (len > 7) return 'text-[44px] sm:text-[54px]'
  // Seven characters is "184,320" - it broke as "184,32 / 0" on a 300px card
  // at 72px. Six still gets the big size.
  if (len > 6) return 'text-[50px] sm:text-[60px]'
  if (len > 5) return 'text-[58px] sm:text-[72px]'
  return 'text-[72px] sm:text-[92px]'
}

export function Hero({ value, unit, palette = 'ember' }) {
  const p = PALETTES[palette] || PALETTES.ember
  return (
    // `min-w-0` + `break-words` is the backstop: the ladder handles every value
    // we can predict, and this stops anything we cannot from leaving the card.
    <p data-anim="pop" className="flex w-full max-w-full flex-wrap items-baseline gap-x-2.5">
      <span
        data-count={/^[\d,]+$/.test(String(value ?? '')) ? String(value) : undefined}
        className={cx('min-w-0 max-w-full break-words font-extrabold leading-[0.92] tracking-tight', heroSize(value))}
      >
        {value}
      </span>
      {unit && <span className="text-lg font-bold" style={{ color: p.soft }}>{unit}</span>}
    </p>
  )
}

export function Line({ children, palette = 'ember', className = '' }) {
  const p = PALETTES[palette] || PALETTES.ember
  return (
    <p data-anim="rise" className={cx('text-[15px] font-medium leading-relaxed sm:text-base', className)} style={{ color: p.soft }}>
      {children}
    </p>
  )
}

export function Chips({ items, palette = 'ember' }) {
  const p = PALETTES[palette] || PALETTES.ember
  return (
    <div data-anim="rise" className="flex flex-wrap gap-1.5">
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
    <div data-anim="rise" className="flex flex-wrap gap-x-7 gap-y-3">
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
      data-anim="pop"
      className="inline-flex items-center gap-1.5 self-start rounded-full px-3 py-1.5 text-xs font-bold"
      style={{ background: p.chip, color: p.ink }}
    >
      <Icon name="trophy" className="h-3.5 w-3.5" />
      Top {s.percentile}% {what}
    </span>
  )
}

/**
 * A pot of money said the way a person would say it: "€8,000+", not
 * "€8,845.50". Ethan: "don't give it to the cents. Just give it roughly to the
 * 1,000." Under a thousand there is nothing to round to, so it is exact, and
 * never with cents.
 */
export function roughMoney(amount, currency = 'EUR') {
  const n = Number(amount) || 0
  const fmt = (v) => new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v)
  if (n >= 1000) return `${fmt(Math.floor(n / 1000) * 1000)}+`
  return fmt(Math.round(n))
}

/** Money without cents. A recap is not an invoice. */
export function wholeMoney(amount, currency = 'EUR') {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Math.round(Number(amount) || 0))
}

export { formatViews, formatMoney, flagEmoji }
