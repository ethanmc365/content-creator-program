import { describe, expect, it } from 'vitest'
import { officialWords } from './vip'

// The official creators reuse every VIP screen; these are the swaps those screens rely on (migration 376 / 11 Oct 2026).
describe('officialWords', () => {
  it('swaps the English VIP words, keeping sentence case', () => {
    expect(officialWords('Active VIPs', 'en')).toBe('Active official creators')
    expect(officialWords('Add a VIP', 'en')).toBe('Add an official creator')
    expect(officialWords('VIPs are paid monthly', 'en')).toBe('Official creators are paid monthly')
    expect(officialWords('Every VIP market added together', 'en')).toBe('Every official programme added together')
    expect(officialWords('Tell your VIPs something', 'en')).toBe('Tell your official creators something')
    expect(officialWords('VIP page', 'en')).toBe('Your page')
    expect(officialWords('{n} VIPs in {p}', 'en')).toBe('{n} official creators in {p}')
  })
  it('swaps Spanish and Portuguese with their articles', () => {
    expect(officialWords('Añadir un VIP', 'es')).toBe('Añadir un creador oficial')
    expect(officialWords('VIP activos', 'es')).toBe('Creadores oficiales activos')
    expect(officialWords('Página VIP', 'es')).toBe('Tu página')
    expect(officialWords('Adicionar um VIP', 'pt')).toBe('Adicionar um criador oficial')
  })
  it('leaves text without the word alone', () => {
    expect(officialWords('Members', 'en')).toBe('Members')
  })
})
