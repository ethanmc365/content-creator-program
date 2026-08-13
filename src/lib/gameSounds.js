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

/**
 * PASSING A NUMBERED STOP. Ethan asked for "a little ding like a coin in Mario
 * Kart", and the reason that sound works is that it is TWO notes a fifth apart
 * played almost on top of each other - the second lands before the first has
 * finished, so it reads as one bright event rather than as a little tune. Square
 * waves, because a sine is too round to cut through and a saw is harsh.
 */
export const playCoin = () => play((a) => {
  tone(a, 987.77, 0, 0.07, 0.10, 'square')   // B5
  tone(a, 1567.98, 0.055, 0.22, 0.09, 'square') // G6
})

// ---------------------------------------------------------------- the engine
//
// A PROPELLER, NOT A JET, AND NOT A LOOPED FILE.
//
// Ethan asked for "an airplane flying sound" while you fly the route. A sampled
// engine loop would be another file, another licence and another CSP entry (see
// the note at the top), and a looped sample is also the version that becomes
// unbearable after ninety seconds because the loop point is audible.
//
// So it is synthesised from three parts, which is roughly what a propeller
// actually is:
//
//   noise      a filtered white-noise buffer, looping. This is the air.
//   drone      a low sawtooth under it. This is the engine block.
//   throb      an LFO on the noise gain at ~11Hz. This is the blade passing,
//              and it is the part that makes it read as a propeller rather
//              than as static.
//
// IT ONLY MAKES A NOISE WHILE THE PLANE IS MOVING. A drone that runs from the
// moment the puzzle opens is a drone somebody turns the sound off to escape, and
// they do not turn it back on. `engineThrust()` is called on every step and
// opens the gain; it closes itself half a second after the last one, so
// thinking in silence is possible and flying is not.
//
// Everything hangs off ONE gain node that is faded rather than stopped, because
// starting and stopping oscillators for this would click on every move.

let engine = null

function buildEngine(a) {
  // Two seconds of noise is long enough that the loop is not audible as a loop.
  const frames = a.sampleRate * 2
  const buffer = a.createBuffer(1, frames, a.sampleRate)
  const data = buffer.getChannelData(0)
  // Deterministic, cheap, and one less reason for a lint rule to care: a
  // hand-rolled LCG rather than Math.random.
  let seed = 22222
  for (let i = 0; i < frames; i++) {
    seed = (seed * 1664525 + 1013904223) >>> 0
    data[i] = (seed / 2147483648) - 1
  }

  const out = a.createGain()
  out.gain.setValueAtTime(0.0001, a.currentTime)
  out.connect(a.destination)

  const noise = a.createBufferSource()
  noise.buffer = buffer
  noise.loop = true
  const band = a.createBiquadFilter()
  band.type = 'bandpass'
  band.frequency.value = 420
  band.Q.value = 0.7
  const noiseGain = a.createGain()
  noiseGain.gain.value = 0.5
  noise.connect(band).connect(noiseGain).connect(out)

  // The blade. A slow sine on the noise gain, which is the whole difference
  // between "a propeller" and "a hiss".
  const throb = a.createOscillator()
  throb.type = 'sine'
  throb.frequency.value = 11
  const throbDepth = a.createGain()
  throbDepth.gain.value = 0.32
  throb.connect(throbDepth).connect(noiseGain.gain)

  const drone = a.createOscillator()
  drone.type = 'sawtooth'
  drone.frequency.value = 62
  const droneLp = a.createBiquadFilter()
  droneLp.type = 'lowpass'
  droneLp.frequency.value = 220
  const droneGain = a.createGain()
  droneGain.gain.value = 0.16
  drone.connect(droneLp).connect(droneGain).connect(out)

  noise.start()
  throb.start()
  drone.start()
  return { out, nodes: [noise, throb, drone], timer: null }
}

/**
 * The plane moved. Open the engine up, and arrange for it to settle again if
 * nothing else happens.
 */
export function engineThrust() {
  if (!soundOn()) return
  const a = audio()
  if (!a) return
  try {
    if (!engine) engine = buildEngine(a)
    const g = engine.out.gain
    g.cancelScheduledValues(a.currentTime)
    g.setValueAtTime(Math.max(g.value, 0.0001), a.currentTime)
    // Quiet. This runs UNDER everything else in the game and has to stay there;
    // an engine you notice is an engine you switch off.
    g.exponentialRampToValueAtTime(0.055, a.currentTime + 0.08)
    clearTimeout(engine.timer)
    engine.timer = setTimeout(() => {
      if (!engine) return
      const t = a.currentTime
      engine.out.gain.cancelScheduledValues(t)
      engine.out.gain.setValueAtTime(Math.max(engine.out.gain.value, 0.0001), t)
      engine.out.gain.exponentialRampToValueAtTime(0.0001, t + 0.45)
    }, 420)
  } catch { /* context torn down mid-navigation */ }
}

/** Cut the engine and release its nodes. Call it when the game unmounts. */
export function engineStop() {
  if (!engine) return
  const e = engine
  engine = null
  clearTimeout(e.timer)
  try {
    const a = audio()
    if (a) {
      e.out.gain.cancelScheduledValues(a.currentTime)
      e.out.gain.setValueAtTime(Math.max(e.out.gain.value, 0.0001), a.currentTime)
      e.out.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.2)
    }
    // Stopped a beat after the fade, or the release is a click.
    setTimeout(() => { for (const n of e.nodes) { try { n.stop() } catch { /* already stopped */ } } }, 300)
  } catch { /* nothing to do */ }
}
