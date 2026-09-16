import { describe, it, expect } from 'vitest'
import {
  PINPOINT_COUNTRIES, PINPOINT_ROUNDS, PINPOINT_DECK_LENGTH, PINPOINT_MIN_GAP,
  pinpointForDay, pinpointMatches,
} from './pinpoint'

describe('guess the country bank', () => {
  it('every entry is complete and unique', () => {
    const names = new Set(), isos = new Set()
    for (const c of PINPOINT_COUNTRIES) {
      expect(c.name, 'a country with no name').toBeTruthy()
      expect(names.has(c.name), `duplicate country ${c.name}`).toBe(false)
      names.add(c.name)
      expect(c.iso2, c.name).toMatch(/^[A-Z]{2}$/)
      expect(isos.has(c.iso2), `duplicate iso2 ${c.iso2} on ${c.name}`).toBe(false)
      isos.add(c.iso2)
      expect(['easy', 'medium', 'hard'], `${c.name} tier`).toContain(c.tier)
      expect(['Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania'], `${c.name} region`).toContain(c.region)
      expect(c.sets.length, `${c.name} needs three clue sets`).toBe(3)
      for (const set of c.sets) {
        expect(set.length, `${c.name} set length`).toBe(5)
        for (const clue of set) expect(typeof clue === 'string' && clue.length > 0, `${c.name} clue`).toBe(true)
      }
      // A clue that IS the answer would make an express round a giveaway.
      for (const set of c.sets) {
        for (const clue of set.slice(0, 3)) {
          expect(clue.toLowerCase(), `${c.name}: its own name is one of its hard clues`).not.toBe(c.name.toLowerCase())
        }
      }
    }
    expect(PINPOINT_COUNTRIES.length).toBeGreaterThanOrEqual(185)
  })

  it('every tier and every continent is represented in useful numbers', () => {
    const tiers = {}, regions = {}
    for (const c of PINPOINT_COUNTRIES) {
      tiers[c.tier] = (tiers[c.tier] || 0) + 1
      regions[c.region] = (regions[c.region] || 0) + 1
    }
    for (const t of ['easy', 'medium', 'hard']) expect(tiers[t], `${t} countries`).toBeGreaterThan(30)
    for (const r of ['Europe', 'Asia', 'Africa', 'North America', 'South America', 'Oceania']) {
      expect(regions[r], `${r}`).toBeGreaterThan(10)
    }
  })

  it('a day is a pure function of the date', () => {
    const a = pinpointForDay(20712)
    const b = pinpointForDay(20712)
    expect(a.name).toBe(b.name)
    expect(a.words).toEqual(b.words)
    expect(a.round).toBe(b.round)
  })

  it('serves the right number of clues for its round style', () => {
    for (let d = 20000; d < 20000 + PINPOINT_DECK_LENGTH; d++) {
      const p = pinpointForDay(d)
      const spec = PINPOINT_ROUNDS[p.round]
      expect(spec, `unknown round ${p.round}`).toBeTruthy()
      expect(p.words.length).toBe(spec.clues)
      expect(p.clues).toBe(spec.clues)
      expect(p.guided).toBe(spec.guided)
      // the clues in play are always the HARDEST ones from the set, in order
      const set = p.sets.find((s) => s[0] === p.words[0])
      expect(set.slice(0, p.clues)).toEqual(p.words)
    }
  })

  it('deals every country and never the same one twice in a month', () => {
    // THE BUG THIS TEST EXISTS FOR. The first deck was a plain shuffle, which
    // put France three days apart and Japan four - different clues each time,
    // and still exactly the "it repeats" feeling the bigger bank was meant to
    // cure. The deck aims each appearance at an evenly spaced slot and then
    // REPAIRS whatever the aiming could not place, and it lives on a ring so
    // the seam between one pass through the bank and the next is a real gap
    // rather than a blind spot. This window deliberately straddles that seam.
    const len = PINPOINT_DECK_LENGTH
    const first = Math.ceil(20000 / len) * len
    const seen = new Map()
    let closest = Infinity
    const countries = new Set()
    for (let d = first - 40; d < first + len + 40; d++) {
      const p = pinpointForDay(d)
      countries.add(p.name)
      const prev = seen.get(p.name)
      if (prev != null) closest = Math.min(closest, d - prev)
      seen.set(p.name, d)
    }
    expect(closest, 'two sightings of one country landed too close together').toBeGreaterThanOrEqual(PINPOINT_MIN_GAP)
    // one full cycle serves the whole bank
    expect(countries.size).toBe(PINPOINT_COUNTRIES.length)
  })

  it('gives easier countries a harder round and harder countries more help', () => {
    const byTier = { easy: {}, medium: {}, hard: {} }
    for (let d = 20000; d < 20000 + PINPOINT_DECK_LENGTH * 3; d++) {
      const p = pinpointForDay(d)
      byTier[p.tier][p.round] = (byTier[p.tier][p.round] || 0) + 1
    }
    const share = (t, r) => (byTier[t][r] || 0) / Object.values(byTier[t]).reduce((a, b) => a + b, 0)
    expect(share('easy', 'express')).toBeGreaterThan(share('hard', 'express'))
    expect(share('hard', 'guided')).toBeGreaterThan(share('easy', 'guided'))
    // and every style really does come up for every tier
    for (const t of ['easy', 'medium', 'hard']) {
      for (const r of ['express', 'classic', 'guided']) expect(byTier[t][r], `${t}/${r}`).toBeGreaterThan(0)
    }
  })

  it('accepts a country by name and by alias, accents ignored', () => {
    const ci = PINPOINT_COUNTRIES.find((c) => c.name === 'Ivory Coast')
    expect(pinpointMatches(ci, 'ivory coast')).toBe(true)
    expect(pinpointMatches(ci, "Cote d'Ivoire")).toBe(true)
    expect(pinpointMatches(ci, 'Ghana')).toBe(false)
    const uk = PINPOINT_COUNTRIES.find((c) => c.name === 'United Kingdom')
    expect(pinpointMatches(uk, 'britain')).toBe(true)
  })
})
