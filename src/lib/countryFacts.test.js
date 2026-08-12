import { describe, it, expect } from 'vitest'
import { countryFacts, sameCountry } from './countryFacts'

describe('countryFacts', () => {
  it('answers with a flag, a continent and a currency for a country we have data for', () => {
    const f = countryFacts('Portugal')
    expect(f.iso2).toBe('PT')
    expect(f.flag).toBe('🇵🇹')
    expect(f.continent).toBe('Europe')
    expect(f.currency).toBe('Euro')
    expect(f.knownFor.length).toBeGreaterThan(0)
  })

  it('still finds a flag for a country the geography game never asks about', () => {
    // The whole reason ATLAS_ISO2 exists: countries.js covers about a third of
    // what the map draws, so tapping Sudan used to give a grey globe on a
    // feature whose brief was "the country name and the flag".
    const f = countryFacts('Sudan')
    expect(f.flag).toBe('🇸🇩')
  })

  it('handles the map\'s own abbreviated names', () => {
    expect(countryFacts('S. Sudan').flag).toBe('🇸🇸')
    expect(countryFacts('Bosnia and Herz.').flag).toBe('🇧🇦')
    expect(countryFacts("Côte d'Ivoire").flag).toBe('🇨🇮')
  })

  it('never throws on a country it has never heard of', () => {
    const f = countryFacts('Atlantis')
    expect(f.name).toBe('Atlantis')
    expect(f.flag).toBe('')
    expect(f.knownFor).toEqual([])
  })
})

describe('sameCountry', () => {
  it('matches what a creator typed against what the map calls it', () => {
    expect(sameCountry('England', 'United Kingdom')).toBe(true)
    expect(sameCountry('USA', 'United States of America')).toBe(true)
    expect(sameCountry('Czech Republic', 'Czechia')).toBe(true)
  })

  it('does not match two different places', () => {
    expect(sameCountry('Ireland', 'Iceland')).toBe(false)
    expect(sameCountry('Austria', 'Australia')).toBe(false)
  })

  it('is safe with nothing', () => {
    expect(sameCountry('', 'Spain')).toBe(false)
    expect(sameCountry('Spain', null)).toBe(false)
  })
})
