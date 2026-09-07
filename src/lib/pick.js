// WHAT A THING YOU CAN PICK LOOKS LIKE. ONE DEFINITION.
//
// `border-brand bg-brand text-white` was written out by hand in fifteen
// components, and that is exactly how the dark-mode halo happened: a remap of
// `border-brand` reached all fifteen at once and there was no single place to
// reason about what the recipe was FOR. (The border is there so a picked chip
// and an unpicked chip have the same box model; in light mode it is invisible
// because it is the same colour as the fill.)
//
// So it is here, once, and a new picker imports it rather than remembering it.
//
// THE THREE PARTS ARE SEPARATE ON PURPOSE:
//
//   PICK_BASE   the movement, which every option gets whether or not it is
//               chosen. Ethan: "ensure there are clean animations like the
//               cards zooming a bit when hovering over to select them."
//   PICKED      chosen. Solid brand, white on it, and a glow in dark mode -
//               never a tint, which Ethan has now asked for three times.
//   UNPICKED    not chosen. Neutral, with the brand only arriving on hover, so
//               the eye can find the chosen one instantly across a row.
//
// `hoverable:` is `(hover: hover) and (pointer: fine)`, so none of the hover
// styling exists on a phone. That is not a nicety: iOS spends the first tap on
// hover for any element whose appearance changes on hover, so a picker with a
// plain `hover:` needs to be pressed twice - the bug that cost the DM row and
// the conversation pin. A picker is pressed more than almost anything else in
// the product, so it is the last place that can afford it.
//
// The scale is 1.03 and not 1.06. A chip lifting a third of a millimetre reads
// as responsive; one that jumps reads as a different control appearing, and
// these sit in tight rows where a big scale makes neighbours collide.

export const PICK_BASE =
  'transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:scale-[1.03] active:scale-[0.99]'

/** Chosen. `glow-brand` is defined in index.css and is theme-aware. */
export const PICKED = 'border-brand bg-brand text-white glow-brand'

/** Not chosen. */
export const UNPICKED =
  'border-gray-200 bg-white text-smoke hoverable:hover:border-brand/40 hoverable:hover:text-ink'

/** The whole class string for one option. */
export const pickClass = (on, extra = '') =>
  `${PICK_BASE} ${on ? PICKED : UNPICKED} ${extra}`.trim()
