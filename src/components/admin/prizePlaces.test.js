import { describe, expect, it } from 'vitest'
import { nextPlaceLabel, placeGap, relabelPlace, renumberPlaces } from './PrizeBreakdownFields'

describe('prize places follow the rows (Portugal, 7 Oct 2026)', () => {
  it('renumbers the places left after removing 2nd and 3rd, keeping the style', () => {
    const left = [{ place: '1º', prize: '€50' }, { place: '4º', prize: '€30' }, { place: '5º', prize: '€20' }]
    expect(renumberPlaces(left).map((p) => p.place)).toEqual(['1º', '2º', '3º'])
  })
  it('writes English ordinals correctly', () => {
    expect(['1st', '4th', '5th', '12th'].map((p, i) => relabelPlace(p, [1, 2, 3, 11][i]))).toEqual(['1st', '2nd', '3rd', '11th'])
  })
  it('leaves a non-numbered label alone and does not count it', () => {
    const rows = [{ place: '1st' }, { place: 'Best edit' }, { place: '3rd' }]
    expect(renumberPlaces(rows).map((p) => p.place)).toEqual(['1st', 'Best edit', '2nd'])
  })
  it('suggests the next place in the same style', () => {
    expect(nextPlaceLabel([{ place: '1º' }, { place: '2º' }])).toBe('3º')
    expect(nextPlaceLabel([])).toBe('1st')
  })
  it('spots a gap', () => {
    expect(placeGap([{ place: '1º' }, { place: '4º' }])).toEqual({ at: 2, found: 4 })
    expect(placeGap([{ place: '1st' }, { place: '2nd' }])).toBeNull()
  })
})
