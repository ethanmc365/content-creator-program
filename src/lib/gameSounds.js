// The games make a noise now.
//
// WHY THEY ARE SYNTHESISED AND NOT FILES.
//
// Four sound files is four network requests, four things to host, four entries
// in the CSP, and a licence question for each one. These are a handful of sine
// and triangle tones scheduled on a WebAudio graph - a few hundred bytes of
// code, nothing to load, nothing to attribute, and they can be tuned by reading
// the numbers rather than by opening an audio editor.
//
// WHAT THEY SOUND LIKE, AND WHY
//
//   right      a two-note rise (E5 -> A5). Short, bright, over in 180ms.
//   wrong      a two-note fall (F#4 -> C4) on a triangle wave, softer than the
//              right answer. A harsh buzzer punishes; this just says no.
//   celebrate  a four-note major arpeggio. Plays with the confetti.
//   commiserate a slow minor third down. Sympathetic, not a game-over sting.
//
// Nothing here is louder than 0.16 gain, and every tone has a real attack and
// release envelope - a raw oscillator start/stop clicks audibly, which sounds
// like a bug rather than a sound.
//
// THE AUTOPLAY RULE. A browser will not let audio start before the person has
// interacted with the page, and creating an AudioContext on module load leaves a
// suspended context that never resumes on some engines. So the context is built
// lazily, on the first sound - which by definition happens after a tap on an
// answer - and resumed if the browser suspended it in the meantime.

const PREF_KEY = 'tryp-game-sound'

let ctx = null

function audio() {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!ctx) {
    try { ctx = new AC() } catch { return null }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

/** Is sound on? Defaults to ON; a game with no sound is the thing being fixed. */
export function soundOn() {
  try { return localStorage.getItem(PREF_KEY) !== 'off' } catch { return true }
}

export function setSoundOn(on) {
  try { localStorage.setItem(PREF_KEY, on ? 'on' : 'off') } catch { /* private mode */ }
}

/**
 * One tone.
 * @param {number} freq   Hz
 * @param {number} at     seconds from now
 * @param {number} dur    seconds
 * @param {number} peak   gain at the top of the envelope
 * @param {OscillatorType} type
 */
function tone(a, freq, at, dur, peak, type = 'sine') {
  const t0 = a.currentTime + at
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  // Attack, hold, release. `setValueAtTime(0)` first so the ramp has somewhere
  // to start from - without it the value is whatever the last note left behind
  // and the envelope does not apply.
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain).connect(a.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

const play = (notes) => {
  if (!soundOn()) return
  const a = audio()
  if (!a) return
  try { notes(a) } catch { /* a context torn down mid-navigation */ }
}

/** Got it. A short rise. */
export const playCorrect = () => play((a) => {
  tone(a, 659.25, 0, 0.10, 0.13)   // E5
  tone(a, 880.00, 0.075, 0.16, 0.12) // A5
})

/** Missed it. A soft fall, quieter than the right answer on purpose. */
export const playWrong = () => play((a) => {
  tone(a, 369.99, 0, 0.12, 0.09, 'triangle') // F#4
  tone(a, 261.63, 0.09, 0.22, 0.08, 'triangle') // C4
})

/** Finished well. A major arpeggio, with the confetti. */
export const playCelebrate = () => play((a) => {
  const notes = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
  notes.forEach((f, i) => tone(a, f, i * 0.09, 0.28, 0.11))
  tone(a, 1318.5, 0.42, 0.5, 0.07) // E6, a soft tail
})

/** Finished badly. Sympathetic, not a buzzer. */
export const playCommiserate = () => play((a) => {
  tone(a, 392.00, 0, 0.30, 0.09, 'triangle') // G4
  tone(a, 311.13, 0.22, 0.45, 0.08, 'triangle') // Eb4
})

/** A tick for a correct move inside a puzzle (Flight Path), quieter still. */
export const playTick = () => play((a) => {
  tone(a, 880, 0, 0.06, 0.05)
})
