// THE PODIUM IS ORANGE, EVERYWHERE, TO ANY DEPTH.
//
// Ethan: "for the archived uk challenge it shows the podium colours gold,
// silver and bronze but I want this changed to match the design of the podium
// colours on the all time leaderboard, those orange colours, it matches the
// platform better."
//
// The all-time leaderboard has been on the brand ladder for months
// (brand -> brand-light -> brand-tint, see RankBadge and Leaderboard.jsx) while
// the challenge podium drew real metal. Two podiums in one product, one of them
// borrowed from somebody else's. This module is the ONE ladder, so a third
// surface cannot invent a fourth.
//
// WHY A FUNCTION AND NOT A TABLE OF THREE. A challenge can publish any number
// of winners (`winners_count`), and the old table stopped at bronze and handed
// everybody past it a single flat "PLAIN" tone - so 4th, 5th and 6th were the
// same colour as each other and lighter than nothing above them. The ladder
// keeps descending instead: each step is a paler tint of the one before, down
// to a floor, so a six-place podium still reads top-to-bottom.

const BRAND = '#d94407'
const BRAND_LIGHT = '#f5853f'

// Steps 1..3 are the exact three the all-time leaderboard uses. Past third the
// tint keeps lightening towards the floor rather than repeating.
const LADDER = [
  { disc: BRAND, edge: '#b03705', ink: '#ffffff', bar: 'linear-gradient(180deg,#f5853f 0%,#d94407 55%,#b03705 100%)' },
  { disc: BRAND_LIGHT, edge: '#d94407', ink: '#ffffff', bar: 'linear-gradient(180deg,#f9a771 0%,#f5853f 55%,#d94407 100%)' },
  { disc: '#fbc9a8', edge: '#f5853f', ink: '#8a2c04', bar: 'linear-gradient(180deg,#fde3d1 0%,#fbc9a8 55%,#f5a874 100%)' },
  { disc: '#fdeadd', edge: '#f9c4a1', ink: '#a13a06', bar: 'linear-gradient(180deg,#fff5ef 0%,#fdeadd 55%,#fbd3ba 100%)' },
]

// The block heights, so a podium still LOOKS like a podium: first is tallest,
// and everything past third shares the shortest step rather than shrinking to
// nothing (a 2px block is a line, not a place).
const HEIGHTS = ['h-14', 'h-10', 'h-7', 'h-5']

/** "1st", "2nd", "3rd", "4th"… for any place, including the teens. */
export function ordinalFor(place) {
  const n = Number(place)
  if (!Number.isFinite(n)) return String(place ?? '')
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}th`
  return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th'}`
}

/**
 * The look of one place on a podium.
 * @param {number} place 1-based rank
 * @returns {{label:string, disc:string, edge:string, ink:string, bar:string, height:string}}
 */
export function podiumTier(place) {
  const i = Math.min(Math.max(Number(place) || 1, 1), LADDER.length) - 1
  return { ...LADDER[i], height: HEIGHTS[i], label: ordinalFor(place) }
}

/** The tint a rank NUMBER is written in, for lists that show a number not a block. */
export function rankInk(place) {
  const n = Number(place)
  if (n === 1) return 'text-brand'
  if (n === 2) return 'text-brand-light'
  if (n === 3) return 'text-brand/70'
  return 'text-smoke'
}
