import { describe, it, expect } from 'vitest'
import { buildIntro, introToText, isoInText, parseLegacyIntro, translateIntro } from './intro'

describe('intro', () => {
  it('finds the country in a next-trip sentence', () => {
    expect(isoInText('Thailand in October')).toBe('TH')
    expect(isoInText('Istanbul then Southern Africa, visiting South Africa, Namibia')).toBe('ZA')
    expect(isoInText('Lisbon in March')).toBeNull()
    expect(isoInText('join us somewhere')).toBeNull()
  })

  it('reads an intro posted before the card existed', () => {
    const r = parseLegacyIntro('👋 Telayah here, based in Birmingham , Uk.\nI make: Solo travel.\nNext trip: Thailand in October.\nAsk me about: Creating the best trip itineraries!.\nFun fact: Fun fact I am planning a 12 month backpacking trip!.\nHoping to find: Collabs.')
    expect(r.first).toBe('Telayah')
    expect(r.city).toBe('Birmingham')
    expect(r.iso).toBe('GB')
    expect(r.makes).toEqual(['Solo travel'])
    expect(r.next).toEqual({ text: 'Thailand in October', iso: 'TH' })
    expect(r.wants).toEqual(['Collabs'])
    expect(parseLegacyIntro('just a normal message')).toBeNull()
  })

  it('builds from the profile and writes the same text the room always had', () => {
    const intro = buildIntro(
      { name: 'Ana Lopez', city: 'Madrid', country: 'Spain', countries_visited: ['Italy', 'Japan'], bucket_list: [{ city: 'Paris', country: 'France' }] },
      { where: 'Madrid, Spain', makes: ['Food'], next: 'Japan in May', wants: ['Collabs'] },
      { flights: 12, videos: 3 },
    )
    expect(intro.iso).toBe('ES')
    expect(intro.visited.map((v) => v.iso)).toEqual(['IT', 'JP'])
    expect(intro.dreams[0].iso).toBe('FR')
    expect(intro.stats).toEqual({ countries: 2, flights: 12, videos: 3 })
    expect(introToText(intro)).toBe('👋 Ana here, based in Madrid, Spain.\nI make: Food.\nNext trip: Japan in May.\nHoping to find: Collabs.')
    // and the text reads back as the same card
    expect(parseLegacyIntro(introToText(intro)).makes).toEqual(['Food'])
  })
})

describe('mixed-language introductions', () => {
  it('translates answers independently so English labels cannot hide Spanish answers', async () => {
    const original = { first: 'Noemi', city: 'Tarragona', iso: 'ES', about: 'Me encanta viajar', ask: 'Encontrar vuelos baratos', next: { text: 'Marrakech en Octubre', iso: 'MA' }, socials: { tiktok: 'https://tiktok.com/@noemi' }, stats: { videos: 12 }, makes: ['Food'], wants: ['Collabs'] }
    const calls = []
    const dictionary = { 'Me encanta viajar': 'I love travelling', 'Encontrar vuelos baratos': 'Finding cheap flights', 'Marrakech en Octubre': 'Marrakech in October' }
    const result = await translateIntro(original, async (text) => { calls.push(text); return { value: dictionary[text] || text, src: dictionary[text] ? 'es' : 'en' } })
    expect(result.intro.about).toBe('I love travelling')
    expect(result.intro.ask).toBe('Finding cheap flights')
    expect(result.intro.next).toEqual({ text: 'Marrakech in October', iso: 'MA' })
    expect(result.intro.socials).toEqual(original.socials)
    expect(result.intro.stats).toEqual(original.stats)
    expect(original.about).toBe('Me encanta viajar')
    expect(calls).not.toContain('Noemi')
    expect(calls).not.toContain('Tarragona')
    expect(result.same).toBe(false)
  })
  it('keeps the original answer and reports a failed translation', async () => {
    const result = await translateIntro({ first: 'Ann', about: 'Hola' }, async (text) => ({ value: text, failed: true }))
    expect(result.intro.about).toBe('Hola')
    expect(result.failed).toBe(true)
    expect(result.same).toBe(true)
  })
})
