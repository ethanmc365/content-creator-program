// The WebAudio plumbing, shared by the games and by the rest of the app.
//
// WHY THIS FILE EXISTS. `gameSounds.js` had all of this inline, which was fine
// while the only thing that made a noise was a quiz. Chat, DMs, reactions and
// the rewards queue make noises now too, and they are governed by a DIFFERENT
// preference: somebody who wants a quiet inbox does not necessarily want a
// silent Flight Path, and somebody playing with the sound on does not
// necessarily want their DMs chiming during a meeting. Two preferences, one
// audio graph - so the graph moves here and the preferences stay with the
// people who own them.
//
// Nothing in this file reads a preference. That is deliberate: a helper that
// silently decides not to play is a helper you cannot debug.

let ctx = null

// ONE CONTEXT FOR THE WHOLE APP, BUILT LAZILY.
//
// A browser will not let audio start before the person has interacted with the
// page, and constructing an AudioContext on module load leaves a suspended
// context that never resumes on some engines. So it is built on the first
// sound - which by definition follows a tap - and resumed if the browser
// suspended it since (Safari suspends on tab hide and does not tell you).
export function audio() {
  if (typeof window === 'undefined') return null
  const AC = window.AudioContext || window.webkitAudioContext
  if (!AC) return null
  if (!ctx) {
    try { ctx = new AC() } catch { return null }
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

/**
 * One tone with a real envelope.
 *
 * The envelope is not decoration. A raw `osc.start()` / `osc.stop()` steps the
 * signal from silence to full amplitude in one sample, and that discontinuity
 * is an audible click - it sounds like a bug rather than like a sound.
 *
 * @param {AudioContext} a
 * @param {number} freq   Hz
 * @param {number} at     seconds from now
 * @param {number} dur    seconds
 * @param {number} peak   gain at the top of the envelope
 * @param {OscillatorType} type
 * @param {number} [glideTo] if given, the frequency ramps to this over `dur`
 */
export function tone(a, freq, at, dur, peak, type = 'sine', glideTo) {
  const t0 = a.currentTime + at
  const osc = a.createOscillator()
  const gain = a.createGain()
  osc.type = type
  osc.frequency.setValueAtTime(freq, t0)
  // A glide has to be exponential to sound like one pitch moving rather than
  // like a linear sweep through frequency space, which the ear hears as
  // slowing down. Frequencies are always positive here so this is safe.
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, t0 + dur)
  // `setValueAtTime` first so the ramp has somewhere to start from: without it
  // the value is whatever the last note left behind and the envelope does not
  // apply at all.
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.012)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  osc.connect(gain).connect(a.destination)
  osc.start(t0)
  osc.stop(t0 + dur + 0.02)
}

// Deterministic white noise. A hand-rolled LCG rather than Math.random: this
// repo's eslint bans Math.random outside of effects, the sound does not benefit
// from being different every time, and a fixed seed means a noise burst is the
// same noise burst on every device.
export function noiseBuffer(a, seconds = 1, seed = 22222) {
  const frames = Math.max(1, Math.floor(a.sampleRate * seconds))
  const buffer = a.createBuffer(1, frames, a.sampleRate)
  const data = buffer.getChannelData(0)
  let s = seed >>> 0
  for (let i = 0; i < frames; i++) {
    s = (s * 1664525 + 1013904223) >>> 0
    data[i] = (s / 2147483648) - 1
  }
  return buffer
}

/**
 * A band of noise that sweeps in pitch - the shape behind every whoosh in the
 * app. Send is a short bright one, the fire flare is a longer, lower one.
 *
 * @param {AudioContext} a
 * @param {object} o
 * @param {number} o.at    seconds from now
 * @param {number} o.dur   seconds
 * @param {number} o.from  bandpass centre at the start, Hz
 * @param {number} o.to    bandpass centre at the end, Hz
 * @param {number} o.peak  gain at the top of the envelope
 * @param {number} [o.q]   filter Q. Higher is narrower and more "tonal".
 * @param {number} [o.attack] fraction of the duration spent rising
 */
export function whoosh(a, { at = 0, dur = 0.22, from = 400, to = 1800, peak = 0.06, q = 1.1, attack = 0.35, seed = 7411 }) {
  const t0 = a.currentTime + at
  const src = a.createBufferSource()
  src.buffer = noiseBuffer(a, Math.max(dur + 0.1, 0.3), seed)
  const band = a.createBiquadFilter()
  band.type = 'bandpass'
  band.Q.value = q
  band.frequency.setValueAtTime(from, t0)
  band.frequency.exponentialRampToValueAtTime(to, t0 + dur)
  const gain = a.createGain()
  gain.gain.setValueAtTime(0.0001, t0)
  gain.gain.exponentialRampToValueAtTime(peak, t0 + dur * attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur)
  src.connect(band).connect(gain).connect(a.destination)
  src.start(t0)
  src.stop(t0 + dur + 0.05)
}

/**
 * A low, short thump: a filtered noise burst plus a pitch-dropping sine. This
 * is what a landing gear touching down is, acoustically - a broadband impact
 * and a low body resonance under it.
 */
export function thud(a, { at = 0, peak = 0.16, freq = 90, dur = 0.3, seed = 5150 } = {}) {
  const t0 = a.currentTime + at
  const src = a.createBufferSource()
  src.buffer = noiseBuffer(a, 0.3, seed)
  const lp = a.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(1400, t0)
  lp.frequency.exponentialRampToValueAtTime(180, t0 + 0.12)
  const g = a.createGain()
  g.gain.setValueAtTime(peak, t0)
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16)
  src.connect(lp).connect(g).connect(a.destination)
  src.start(t0)
  src.stop(t0 + 0.25)
  // The body under the impact. It drops in pitch, which is what makes it read
  // as weight arriving rather than as a click.
  tone(a, freq, at, dur, peak * 0.8, 'sine', freq * 0.55)
}

/**
 * Run a set of notes, guarded. `gate` is the caller's preference check, so the
 * decision to stay quiet is always visible at the call site.
 */
export function player(gate) {
  return (notes) => {
    if (!gate()) return
    const a = audio()
    if (!a) return
    // A context torn down mid-navigation throws on every node it owns. There is
    // nothing useful to do about it and it must never reach an error boundary.
    try { notes(a) } catch { /* gone */ }
  }
}
