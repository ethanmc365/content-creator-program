import { describe, it, expect } from 'vitest'
import { LANGUAGES, PHRASE_LEVELS, buildQuestion, languagesForRegion, dailyLanguageRound, phraseCycleDays } from './languages'

// A quiz that is confidently wrong about somebody's language is worse than a
// quiz with fewer languages in it, so the bank's shape is held by tests.
describe('the phrase bank', () => {
  it('gives every language enough phrases to be worth a round', () => {
    for (const l of LANGUAGES) {
      expect(l.phrases.length, `${l.name} has too few phrases`).toBeGreaterThanOrEqual(8)
    }
  })

  it('gives every phrase a translation', () => {
    for (const l of LANGUAGES) {
      for (const p of l.phrases) {
        expect(p.text.trim(), `${l.name} has an empty phrase`).not.toBe('')
        expect(p.meaning?.trim(), `${l.name}: "${p.text}" has no meaning`).toBeTruthy()
      }
    }
  })

  it('romanises every non-Latin script, and only those', () => {
    // Without this a Greek or Thai phrase is unreadable to most players even
    // after the answer, which is the half of the game that teaches anything.
    for (const l of LANGUAGES) {
      for (const p of l.phrases) {
        if (l.script === 'Latin') continue
        expect(p.roman?.trim(), `${l.name}: "${p.text}" needs a romanisation`).toBeTruthy()
      }
    }
  })

  it('has no duplicate language codes', () => {
    const codes = LANGUAGES.map((l) => l.code)
    expect(new Set(codes).size).toBe(codes.length)
  })

  it('says where every language is spoken', () => {
    for (const l of LANGUAGES) expect(l.where?.trim(), `${l.name}`).toBeTruthy()
  })
})

// A seeded generator, so a failure is reproducible rather than a coin toss.
//
// IT IS MULBERRY32 AND NOT THE ONE-LINE LCG IT USED TO BE. That LCG's FIRST
// output for a small seed is `(seed * 1664525 + 1013904223) / 2^32`, which for
// seeds 1..600 only ever lands between 0.236 and 0.469 - so every question it
// built chose its answer from the same quarter of the bank, and a test sampling
// six hundred of them was really sampling fourteen languages. That is how the
// sibling-distractor test came out at 48% while the real rate was 100% of the
// questions where a sibling exists at all.
const seeded = (seed) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

describe('buildQuestion', () => {

  it('always offers the right answer among the choices', () => {
    for (let n = 0; n < 200; n++) {
      const q = buildQuestion(LANGUAGES, seeded(n + 1))
      expect(q.choices.some((c) => c.code === q.answer.code)).toBe(true)
    }
  })

  it('never repeats a choice', () => {
    for (let n = 0; n < 200; n++) {
      const q = buildQuestion(LANGUAGES, seeded(n + 7))
      const codes = q.choices.map((c) => c.code)
      expect(new Set(codes).size).toBe(codes.length)
    }
  })

  it('draws the phrase from the answer, never from a distractor', () => {
    for (let n = 0; n < 200; n++) {
      const q = buildQuestion(LANGUAGES, seeded(n + 13))
      expect(q.answer.phrases).toContain(q.phrase)
    }
  })

  // THE REPORTED BUG. "Sometimes it only shows up two options." Answer a phrase
  // from a thin region and the old loop stopped after one distractor, because
  // it tested the size of the region rather than what was left in it. Four is
  // not a preference here, it is what a multiple-choice question is.
  it('always offers four options from the full bank', () => {
    for (let n = 0; n < 500; n++) {
      const q = buildQuestion(LANGUAGES, seeded(n + 1))
      expect(q.choices).toHaveLength(4)
    }
  })

  it('fills the fourth option from another region when the answer has few neighbours', () => {
    // A pool of three from one region plus one from another: the same-region
    // well runs dry after two and the loop has to cross over to finish the grid.
    // Each has its OWN phrase. They used to share one, which is now a thing the
    // builder deliberately refuses to make a question out of - see the shared-
    // phrase guard - so the fixture was testing the guard rather than the
    // top-up loop it is named after.
    const thin = [
      { code: 'a', name: 'A', region: 'Africa', family: 'F1', script: 'Latin', where: 'x', phrases: [{ text: 'pa', meaning: 'm' }] },
      { code: 'b', name: 'B', region: 'Africa', family: 'F2', script: 'Latin', where: 'x', phrases: [{ text: 'pb', meaning: 'm' }] },
      { code: 'c', name: 'C', region: 'Africa', family: 'F3', script: 'Latin', where: 'x', phrases: [{ text: 'pc', meaning: 'm' }] },
      { code: 'd', name: 'D', region: 'Europe', family: 'F4', script: 'Latin', where: 'x', phrases: [{ text: 'pd', meaning: 'm' }] },
    ]
    for (let n = 0; n < 50; n++) {
      expect(buildQuestion(thin, seeded(n + 1)).choices).toHaveLength(4)
    }
  })

  it('still builds a question from a small regional pool', () => {
    // Africa has the fewest languages; the choice-filling loop must terminate
    // rather than spin looking for a fourth option that does not exist.
    const pool = languagesForRegion('Africa')
    expect(pool.length).toBeGreaterThan(0)
    const q = buildQuestion(pool, seeded(3))
    expect(q.choices.length).toBeGreaterThanOrEqual(1)
    expect(q.choices.length).toBeLessThanOrEqual(4)
    expect(q.choices.some((c) => c.code === q.answer.code)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// The bigger bank, 16 Sep 2026.
//
// Ethan: "I've noticed a lot of repetition in words while playing over the last
// few weeks so more variety will be better. But ensure they are still quite
// commonly used."
//
// The repetition had a specific cause and it was not the size of the bank: every
// language held the SAME TEN MEANINGS - hello, good morning, thank you, please,
// how are you, goodbye, sorry, how much, good night, cheers - so however many
// languages were added, the questions themselves were ten questions wearing
// different clothes. These tests hold the shape of the fix.
describe('the bank after the expansion', () => {
  it('is big enough that a phrase does not come round often', () => {
    const total = LANGUAGES.reduce((n, l) => n + l.phrases.length, 0)
    expect(LANGUAGES.length, 'languages').toBeGreaterThanOrEqual(68)
    expect(total, 'phrases').toBeGreaterThanOrEqual(1200)
    for (const l of LANGUAGES) {
      expect(l.phrases.length, `${l.name} is thinner than the rest`).toBeGreaterThanOrEqual(11)
    }
  })

  it('grades every phrase, and has a real spread of them', () => {
    const levels = {}
    for (const l of LANGUAGES) {
      for (const p of l.phrases) {
        expect(PHRASE_LEVELS, `${l.name}: "${p.text}" level`).toContain(p.level)
        levels[p.level] = (levels[p.level] || 0) + 1
      }
    }
    for (const lv of PHRASE_LEVELS) expect(levels[lv], `${lv} phrases`).toBeGreaterThan(80)
  })

  it('never repeats a phrase inside one language', () => {
    for (const l of LANGUAGES) {
      const texts = l.phrases.map((p) => p.text)
      expect(new Set(texts).size, `${l.name} lists a phrase twice`).toBe(texts.length)
    }
  })

  it('puts every language in a family, and most families have company', () => {
    for (const l of LANGUAGES) expect(l.family?.trim(), `${l.name} has no family`).toBeTruthy()
    // A family of one can never supply the sibling a hard question wants, so
    // the point of adding languages is partly to thin the singletons out.
    const sizes = {}
    for (const l of LANGUAGES) sizes[l.family] = (sizes[l.family] || 0) + 1
    const singletons = Object.values(sizes).filter((n) => n === 1).length
    expect(singletons / Object.keys(sizes).length, 'too many families of one').toBeLessThan(0.5)
  })

  it('NEVER offers two languages that both use the phrase', () => {
    // THE BUG THIS TEST EXISTS FOR, and it predates the expansion: "Por favor"
    // is Spanish and Portuguese, "Hallo" is German and Dutch, "Skål" is Swedish,
    // Norwegian and Danish. Any of those asked with the other claimant on the
    // grid marks a right answer wrong.
    const claimants = new Map()
    for (const l of LANGUAGES) {
      for (const p of l.phrases) {
        if (!claimants.has(p.text)) claimants.set(p.text, new Set())
        claimants.get(p.text).add(l.code)
      }
    }
    // there really are shared phrases in the bank, or this test proves nothing
    expect([...claimants.values()].filter((s) => s.size > 1).length).toBeGreaterThan(5)
    for (let n = 0; n < 4000; n++) {
      const q = buildQuestion(LANGUAGES, seeded(n + 1))
      const share = claimants.get(q.phrase.text)
      const onGrid = q.choices.filter((c) => share.has(c.code))
      expect(onGrid.length, `"${q.phrase.text}" was offered against ${onGrid.map((c) => c.name).join(' and ')}`).toBe(1)
    }
  })

  it('asks a hard question against its own family where it can', () => {
    // Thirteen of the fifty-six languages are the only member of their family -
    // Japanese, Korean, Greek, Turkish, Basque and so on - so "always" is not
    // the right bar. The bar is that when a sibling EXISTS, it is on the grid.
    let possible = 0, offered = 0
    for (let n = 0; n < 800; n++) {
      const q = buildQuestion(LANGUAGES, seeded(n + 1), { level: 'hard' })
      if (!LANGUAGES.some((l) => l.code !== q.answer.code && l.family === q.answer.family)) continue
      possible++
      if (q.choices.some((c) => c.code !== q.answer.code && c.family === q.answer.family)) offered++
    }
    expect(possible, 'the sample never met a language with a sibling').toBeGreaterThan(300)
    expect(offered / possible, 'hard questions are not meeting their sibling languages').toBeGreaterThan(0.95)
  })
})

describe('the daily round', () => {
  it('is the same round for everybody all day', () => {
    const a = dailyLanguageRound(20712)
    const b = dailyLanguageRound(20712)
    expect(a.map((q) => q.phrase.text)).toEqual(b.map((q) => q.phrase.text))
  })

  it('serves ten questions, four options each, no language twice', () => {
    for (let d = 20700; d < 20760; d++) {
      const round = dailyLanguageRound(d)
      expect(round.length, `day ${d}`).toBe(10)
      const langs = round.map((q) => q.answer.code)
      expect(new Set(langs).size, `day ${d} repeats a language`).toBe(10)
      for (const q of round) {
        expect(q.choices.length, `day ${d} option count`).toBe(4)
        expect(q.choices.some((c) => c.code === q.answer.code)).toBe(true)
      }
    }
  })

  it('mixes difficulty rather than serving ten of one kind', () => {
    for (let d = 20700; d < 20730; d++) {
      const levels = dailyLanguageRound(d).map((q) => q.level)
      const counts = {}
      for (const l of levels) counts[l] = (counts[l] || 0) + 1
      expect(counts.easy, `day ${d} easy`).toBeGreaterThanOrEqual(1)
      expect(counts.hard, `day ${d} hard`).toBeGreaterThanOrEqual(2)
      expect(counts.medium, `day ${d} medium`).toBeGreaterThanOrEqual(3)
    }
  })

  it('does not serve the same phrase again for months', () => {
    // THE ACTUAL COMPLAINT, MEASURED. Two hundred days of rounds is two
    // thousand questions; the question is how long it takes for one of them to
    // be something the player has already had.
    //
    // Before this work: 34 languages of ten phrases, drawn at random, so the
    // median gap between two sightings of a phrase was THIRTY DAYS and one
    // repeat in ten came back the following day.
    //
    // Now: a thousand phrases dealt off three fixed decks, so a phrase cannot
    // come back until its whole deck has been. Median gap 71 days, and one
    // single repeat inside a fortnight across two thousand questions - that one
    // being a language clash the deck had to resolve out of turn.
    const seen = new Map()
    const gaps = []
    let insideAFortnight = 0
    for (let d = 20700; d < 20900; d++) {
      for (const q of dailyLanguageRound(d)) {
        const key = `${q.answer.code}|${q.phrase.text}`
        const prev = seen.get(key)
        if (prev != null) {
          gaps.push(d - prev)
          if (d - prev < 14) insideAFortnight++
        }
        seen.set(key, d)
      }
    }
    gaps.sort((a, b) => a - b)
    const median = gaps[Math.floor(gaps.length / 2)]
    expect(median, 'phrases are coming round too often').toBeGreaterThan(80)
    expect(gaps[0], 'a phrase came back almost immediately').toBeGreaterThanOrEqual(3)
    expect(insideAFortnight, 'too many phrases came back inside two weeks').toBeLessThan(6)
  })

  it('cannot repeat a phrase until its whole deck has been dealt', () => {
    // The guarantee the deck exists to make, stated as the numbers it produces.
    expect(phraseCycleDays('easy')).toBeGreaterThan(55)
    expect(phraseCycleDays('medium')).toBeGreaterThan(150)
    expect(phraseCycleDays('hard')).toBeGreaterThan(90)
  })
})
