import { describe, it, expect } from 'vitest'
import { LANGUAGES, dailyLanguageRound } from './languages'

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

// --------------------------------------------------------------------------- The bigger bank.
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
})
