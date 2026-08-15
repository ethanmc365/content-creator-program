// The app makes a noise now: chat, DMs, reactions and the rewards queue.
//
// WHY A SECOND PREFERENCE. The games have had sound since they shipped and it
// is on by default, because a quiz with no sound is missing something. Chat is
// the opposite case - it runs in a tab all day, next to other people - so these
// have their own switch (`tryp-app-sound`) and each other's off. Both live in
// Settings under Sound.
//
// WHAT MAKES A NOISE, AND WHAT DELIBERATELY DOES NOT
//
//   send        a soft outbound whoosh. Leaving.
//   inbound     a quiet tick, and ONLY in the room you are currently reading.
//               A room you are not looking at is a notification, not a sound.
//   dm arrival  two notes, warmer and a little longer. A DM is a PERSON; a room
//               is a crowd, and they should not be the same event to your ear.
//   reaction    a light pop, and ONLY on your own message. Somebody reacting to
//               somebody else's message is not about you.
//   fail        a short fall. This is the important one: everything else is
//               ambience, and this is the one that makes you look at the screen
//               before you scroll away from a message that never went.
//   coin        a reward marked paid. Borrowed from the games on purpose - it
//               is already the sound of something good landing.
//
// EVERY SOUND IS RATE LIMITED. Fifteen messages arriving at once during a busy
// evening in #general must not be fifteen ticks; `throttled` collapses a burst
// into one. Without it the first busy night would end with sound switched off
// for good.

import { tone, whoosh, player } from './soundCore'

const PREF_KEY = 'tryp-app-sound'

/**
 * Is app sound on? Defaults to OFF.
 *
 * The opposite default to the games, and on purpose: a game is something you
 * chose to open, and a chat tab is something that is already open. Making a
 * noise in somebody's room without being asked is how an app gets muted at the
 * operating system level, which switches off the one sound that matters (a
 * failed send) along with the ambience.
 */
export function appSoundOn() {
  try { return localStorage.getItem(PREF_KEY) === 'on' } catch { return false }
}

export function setAppSoundOn(on) {
  try { localStorage.setItem(PREF_KEY, on ? 'on' : 'off') } catch { /* private mode */ }
  // Other tabs and the Settings toggle both care. `storage` only fires in OTHER
  // tabs, so this event is what keeps the switch in THIS one honest.
  try { window.dispatchEvent(new CustomEvent('tryp-sound-pref')) } catch { /* SSR */ }
}

const play = player(appSoundOn)

// One sound of a given name per window. The window is per sound because a burst
// of arrivals is normal and a burst of failures is not.
const lastAt = new Map()
function throttled(key, ms, fn) {
  // `performance.now` rather than Date.now: monotonic, and not the thing
  // react-hooks/purity objects to in this repo.
  const now = typeof performance !== 'undefined' ? performance.now() : 0
  const prev = lastAt.get(key) || -Infinity
  if (now - prev < ms) return
  lastAt.set(key, now)
  fn()
}

/**
 * SENT. A short outbound whoosh, sweeping UP and away.
 *
 * Direction is doing the work here. Send sweeps up and out, the inbound tick is
 * a single point, and the failure falls - so which of the three happened is
 * legible without looking, which is the whole point of putting sound on a
 * chat at all.
 */
export const playSend = () => throttled('send', 120, () => play((a) => {
  whoosh(a, { at: 0, dur: 0.2, from: 700, to: 2600, peak: 0.035, q: 1.6, attack: 0.3, seed: 1201 })
  tone(a, 880, 0, 0.11, 0.028, 'sine', 1174.66) // A5 -> D6, barely there
}))

/**
 * A MESSAGE LANDED IN THE ROOM YOU ARE READING. One tick, quiet.
 *
 * Half a second of throttle: an active room during an evening can deliver five
 * messages in a second and five ticks is a fire alarm.
 */
export const playInbound = () => throttled('inbound', 600, () => play((a) => {
  tone(a, 1244.51, 0, 0.07, 0.032)  // D#6
}))

/**
 * A DM ARRIVED. Two notes, a rising minor third, on a triangle.
 *
 * Longer, warmer and lower than the room tick, because it is the one that is
 * addressed to you personally and it should be the one you turn your head for.
 */
export const playDmArrival = () => throttled('dm', 800, () => play((a) => {
  tone(a, 587.33, 0, 0.16, 0.075, 'triangle')     // D5
  tone(a, 880.00, 0.13, 0.30, 0.065, 'triangle')  // A5
}))

/**
 * SOMEBODY REACTED TO YOUR MESSAGE. A light pop.
 *
 * A pitch that jumps upward inside a very short envelope, which is what a pop
 * is: no sustain, all transient. Only ever on your OWN message.
 */
export const playReactionPop = () => throttled('reaction', 300, () => play((a) => {
  tone(a, 660, 0, 0.055, 0.06, 'sine', 1320)
}))

/**
 * IT DID NOT SEND. A short descending tone.
 *
 * NOT throttled as tightly as the rest and deliberately the most audible thing
 * in this file. A failed send that makes no noise is a message you believe you
 * sent, and you find out days later; this is worth interrupting for.
 */
export const playSendFail = () => throttled('fail', 400, () => play((a) => {
  tone(a, 493.88, 0, 0.14, 0.10, 'triangle')      // B4
  tone(a, 329.63, 0.11, 0.28, 0.095, 'triangle')  // E4
}))

// Re-exported so a caller that wants the coin does not have to decide which of
// the two sound preferences a rewards screen belongs to. It belongs to this
// one: it is the app, not a game.
export const playPaid = () => play((a) => {
  tone(a, 987.77, 0, 0.07, 0.10, 'square')      // B5
  tone(a, 1567.98, 0.055, 0.22, 0.09, 'square') // G6
})
