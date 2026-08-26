// The games make a noise.
//
// WHY THEY ARE SYNTHESISED AND NOT FILES.
//
// Every sound file is a network request, a thing to host, an entry in the CSP
// and a licence question. These are sine and triangle tones and filtered noise
// scheduled on a WebAudio graph - a few hundred bytes of code, nothing to load,
// nothing to attribute, and they can be tuned by reading the numbers rather
// than by opening an audio editor. The plumbing lives in `soundCore.js`, which
// the chat sounds share.
//
// WHAT THEY SOUND LIKE, AND WHY
//
//   right       a two-note rise (E5 -> A5). Short, bright, over in 180ms, and
//               it CLIMBS with a streak - see playCorrect.
//   wrong       a two-note fall (F#4 -> C4) on a triangle wave, softer than the
//               right answer. A harsh buzzer punishes; this just says no.
//   celebrate   a four-note major arpeggio. Plays with the confetti.
//   commiserate a slow minor third down. Sympathetic, not a game-over sting.
//   coin        two notes a fifth apart, almost on top of each other.
//   fire        a flare of noise under a rising tone: the streak is alight.
//   gear        a low broadband thump: Flight Path has landed.
//
// Nothing here is louder than 0.18 gain, and every tone has a real attack and
// release envelope - a raw oscillator start/stop clicks audibly.

import { audio, tone, noiseBuffer, whoosh, thud, player } from './soundCore'

const PREF_KEY = 'tryp-game-sound'

/** Is game sound on? Defaults to ON; a game with no sound is the thing fixed. */
export function soundOn() {
  try { return localStorage.getItem(PREF_KEY) !== 'off' } catch { return true }
}

export function setSoundOn(on) {
  try { localStorage.setItem(PREF_KEY, on ? 'on' : 'off') } catch { /* private mode */ }
  // The speaker button inside a game and the switch in Settings are the same
  // preference and can be on screen at the same time. `storage` only fires in
  // OTHER tabs, so this event is what keeps the two honest in THIS one.
  try { window.dispatchEvent(new CustomEvent('tryp-sound-pref')) } catch { /* SSR */ }
}

const play = player(soundOn)

/**
 * Got it. A short rise - and the rise gets HIGHER the longer you keep getting
 * them right.
 *
 * WHY THE STREAK IS AUDIBLE. A run of correct answers was six identical beeps,
 * so the only place the run existed was the counter in the header, which you
 * are not looking at while you answer. Transposing the same two notes up a
 * semitone per consecutive hit turns the run into something you can hear
 * building, and dropping straight back to the root on a miss is a more honest
 * "you lost it" than any separate sound would be.
 *
 * Capped at eight semitones. Past that it stops reading as the same sound going
 * up and starts reading as a different, shriller sound - and a quiz that gets
 * more piercing the better you do has the incentive backwards.
 *
 * @param {number} [streak] how many in a row INCLUDING this one. 1 is the root.
 */
export const playCorrect = (streak = 1) => play((a) => {
  const steps = Math.min(Math.max(streak - 1, 0), 8)
  const k = Math.pow(2, steps / 12)
  tone(a, 659.25 * k, 0, 0.10, 0.13)      // E5, transposed
  tone(a, 880.00 * k, 0.075, 0.16, 0.12)  // A5, transposed
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

/**
 * THE STREAK CATCHING. A flare of low noise sweeping upward with a rising tone
 * riding on it - the acoustic shape of something igniting rather than a chime
 * that happens to play near a flame icon.
 *
 * It fires when you first open the travel games with a live streak, and when a
 * puzzle you have just finished extends one. Once per page, never per render:
 * a fire noise on every re-render is the fastest way to get sound switched off
 * permanently. The guard for that lives with the flame, not here.
 */
export const playFireWhoosh = () => play((a) => {
  whoosh(a, { at: 0, dur: 0.5, from: 240, to: 1500, peak: 0.075, q: 0.8, attack: 0.28, seed: 9137 })
  // The body of the flare. Low, and it rises with the noise so the two read as
  // one event rather than as a hiss with a beep on top.
  tone(a, 174.61, 0.02, 0.42, 0.07, 'triangle', 392.00) // F3 -> G4
  tone(a, 349.23, 0.08, 0.34, 0.045, 'sine', 659.25)    // F4 -> E5, the shimmer
})

/**
 * FLIGHT PATH HAS LANDED. A landing-gear thud: a broadband impact with a low
 * body under it that drops in pitch, then a short tyre scuff.
 *
 * It plays on COMPLETION, before the celebrate arpeggio, so the sequence reads
 * as "landed, well done" rather than as two celebrations at once.
 */
export const playGearThud = () => play((a) => {
  thud(a, { at: 0, peak: 0.17, freq: 84, dur: 0.34, seed: 3390 })
  // The scuff. Quieter, higher, and slightly late: rubber after metal.
  whoosh(a, { at: 0.06, dur: 0.28, from: 1600, to: 380, peak: 0.045, q: 0.6, attack: 0.2, seed: 6021 })
})

/**
 * THE PLANE CLIMBING A MILESTONE PATH. A short ascending pass: engine noise
 * sweeping up under a rising two-note figure.
 *
 * Deliberately not the Flight Path propeller. That one is a loop that runs for
 * as long as you are flying; this is a single gesture that plays once as the
 * plane sets off along the milestone track, and it has to be over before the
 * first milestone coin lands or the two sounds fight.
 */
export const playPlaneRise = () => play((a) => {
  whoosh(a, { at: 0, dur: 0.66, from: 300, to: 1250, peak: 0.05, q: 1.4, attack: 0.5, seed: 4813 })
  tone(a, 392.00, 0.04, 0.30, 0.065, 'triangle', 523.25) // G4 -> C5
  tone(a, 523.25, 0.30, 0.36, 0.055, 'triangle', 659.25) // C5 -> E5
})

// ---------------------------------------------------------------- the engine
//
// A PROPELLER, NOT A JET, AND NOT A LOOPED FILE.
//
// A sampled engine loop would be another file, another licence and another CSP
// entry, and a looped sample is also the version that becomes unbearable after
// ninety seconds because the loop point is audible.
//
// So it is synthesised from parts, which is roughly what an aircraft actually
// is from the cabin:
//
//   noise      filtered white noise, looping. This is the airflow.
//   blades     a narrow resonant band on the same noise, modulated. This is the
//              part your ear identifies as an engine rather than as wind.
//   drone      two detuned sawtooths under it. This is the engine block, and
//              the detune is what stops it sounding like a test tone.
//   throb      an LFO on the blade gain. The blade passing frequency.
//
// IT ONLY MAKES A NOISE WHILE THE PLANE IS MOVING. A drone that runs from the
// moment the puzzle opens is a drone somebody turns the sound off to escape,
// and they do not turn it back on. `engineThrust()` is called on every step and
// opens the gain; it closes itself half a second after the last one, so
// thinking in silence is possible and flying is not.
//
// Everything hangs off ONE gain node that is faded rather than stopped, because
// starting and stopping oscillators for this would click on every move.

let engine = null

function buildEngine(a) {
  // Two seconds of noise is long enough that the loop is not audible as a loop.
  const buffer = noiseBuffer(a, 2, 22222)

  const out = a.createGain()
  out.gain.setValueAtTime(0.0001, a.currentTime)
  out.connect(a.destination)

  const noise = a.createBufferSource()
  noise.buffer = buffer
  noise.loop = true

  // THE AIRFLOW. Wide and low: this is the bed the rest sits on.
  //
  // It used to be the ONLY noise path, a single bandpass at 420Hz with Q 0.7,
  // and Ethan's note was that it did not sound like a plane. That is exactly
  // what one wide band of noise sounds like: a hiss. A real engine has a
  // strong resonant peak - the blade passing tone - which is what the ear
  // actually latches onto, and a broad rush of air around it.
  const air = a.createBiquadFilter()
  air.type = 'bandpass'
  air.frequency.value = 320
  air.Q.value = 0.5
  const airGain = a.createGain()
  airGain.gain.value = 0.34
  noise.connect(air).connect(airGain).connect(out)

  // THE BLADES. A narrow, high-Q peak on the same noise source. Q 9 is tight
  // enough to ring, which is the whistle you hear from a turbofan; wider than
  // that and it goes back to being a hiss, narrower and it becomes a whistle
  // with no engine attached to it.
  const blades = a.createBiquadFilter()
  blades.type = 'bandpass'
  blades.frequency.value = 1180
  blades.Q.value = 9
  const bladeGain = a.createGain()
  bladeGain.gain.value = 0.22
  noise.connect(blades).connect(bladeGain).connect(out)

  // A second, higher partial of the same whistle. Two of them an octave and a
  // bit apart is the difference between "a tone" and "machinery".
  const blades2 = a.createBiquadFilter()
  blades2.type = 'bandpass'
  blades2.frequency.value = 2600
  blades2.Q.value = 12
  const blade2Gain = a.createGain()
  blade2Gain.gain.value = 0.1
  noise.connect(blades2).connect(blade2Gain).connect(out)

  // The blade passing frequency, modulating the whistle rather than the air.
  // On the air it read as a wobble; on the whistle it reads as rotation.
  const throb = a.createOscillator()
  throb.type = 'sine'
  throb.frequency.value = 15
  const throbDepth = a.createGain()
  throbDepth.gain.value = 0.12
  throb.connect(throbDepth).connect(bladeGain.gain)

  // THE ENGINE BLOCK. Two sawtooths a few cents apart through a lowpass. The
  // beating between them is slow and irregular, which is why it sounds like
  // something running rather than like a held note.
  const droneGain = a.createGain()
  droneGain.gain.value = 0.13
  const droneLp = a.createBiquadFilter()
  droneLp.type = 'lowpass'
  droneLp.frequency.value = 260
  droneLp.connect(droneGain).connect(out)

  const droneA = a.createOscillator()
  droneA.type = 'sawtooth'
  droneA.frequency.value = 58
  droneA.connect(droneLp)
  const droneB = a.createOscillator()
  droneB.type = 'sawtooth'
  droneB.frequency.value = 58.9
  droneB.connect(droneLp)

  noise.start()
  throb.start()
  droneA.start()
  droneB.start()
  return { out, nodes: [noise, throb, droneA, droneB], timer: null }
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

/**
 * A MILESTONE RING, PASSED. Two soft sine notes a fifth apart, with a slow
 * attack and a long tail.
 *
 * WHY NOT THE COIN. The route borrowed `playCoin` for this, and a coin is a
 * square wave with a 55ms attack - a bright, hard, arcade sound designed to cut
 * through a game. Eleven of them down a page, under a slow aeroplane, read as
 * an alarm rather than as arriving somewhere. This is the same event told in
 * the register the drawing is already in: quieter than the coin by a third, no
 * upper harmonics to speak of, and long enough that consecutive rings overlap
 * into a chord instead of a rattle.
 */
export const playRingReached = () => play((a) => {
  tone(a, 587.33, 0, 0.42, 0.048, 'sine')      // D5
  tone(a, 880.00, 0.07, 0.52, 0.038, 'sine')   // A5, the fifth above
})
