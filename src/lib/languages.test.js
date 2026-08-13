import { describe, it, expect } from 'vitest'
import { LANGUAGES, buildQuestion, languagesForRegion } from './languages'

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

describe('buildQuestion', () => {
  // A seeded generator, so a failure is reproducible rather than a coin toss.
  const seeded = (seed) => () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296
    return seed / 4294967296
  }

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
