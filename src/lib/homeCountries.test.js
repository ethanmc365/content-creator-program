import { describe, expect, it, vi } from 'vitest'
import { bboxOf, homeCountryNames } from './homeCountries'

// A square country, as a GeoJSON feature. Two of them, far apart, so a point in
// one is comfortably outside the other's box.
const square = (name, x, y, w = 10) => ({
  properties: { name },
  geometry: { type: 'Polygon', coordinates: [[[x, y], [x + w, y], [x + w, y + w], [x, y + w], [x, y]]] },
})

// The real test is d3-geo's; here it only has to agree with the boxes.
const inSquare = (f, [lng, lat]) => {
  const [minX, minY, maxX, maxY] = bboxOf(f)
  return lng >= minX && lng <= maxX && lat >= minY && lat <= maxY
}
const never = () => false

describe('bboxOf', () => {
  it('walks a Polygon', () => {
    expect(bboxOf(square('A', 0, 0))).toEqual([0, 0, 10, 10])
  })

  it('walks a MultiPolygon, however deeply the numbers are nested', () => {
    const f = {
      properties: { name: 'M' },
      geometry: {
        type: 'MultiPolygon',
        coordinates: [
          [[[0, 0], [1, 0], [1, 1], [0, 0]]],
          [[[20, 30], [22, 30], [22, 33], [20, 30]]],
        ],
      },
    }
    expect(bboxOf(f)).toEqual([0, 0, 22, 33])
  })

  it('says nothing rather than throwing for a feature with no geometry', () => {
    expect(bboxOf({ properties: { name: 'X' } })).toEqual([Infinity, Infinity, -Infinity, -Infinity])
  })
})

describe('homeCountryNames', () => {
  const features = [square('Alpha', 0, 0), square('Beta', 50, 50), square('Gamma', 100, 0)]

  it('names the country a creator stands in', () => {
    const out = homeCountryNames(features, [{ _lng: 5, _lat: 5, country: '' }], never, inSquare)
    expect([...out]).toEqual(['Alpha'])
  })

  it('names a country by the creator\'s typed country with no geometry at all', () => {
    const contains = vi.fn(() => false)
    const out = homeCountryNames(
      features,
      [{ _lng: 999, _lat: 999, country: 'Beta' }],
      (typed, name) => typed === name,
      contains,
    )
    expect([...out]).toEqual(['Beta'])
  })

  it('counts every country that has somebody, and no others', () => {
    const located = [
      { _lng: 5, _lat: 5, country: '' },
      { _lng: 55, _lat: 55, country: '' },
      { _lng: 6, _lat: 6, country: '' },
    ]
    expect([...homeCountryNames(features, located, never, inSquare)].sort()).toEqual(['Alpha', 'Beta'])
  })

  // The whole point of the rewrite. The old sweep ran a full polygon test for
  // every country against every creator; this one must reject on the box.
  it('never runs the expensive test on a country whose box excludes the point', () => {
    const contains = vi.fn(inSquare)
    homeCountryNames(features, [{ _lng: 5, _lat: 5, country: '' }], never, contains)
    expect(contains).toHaveBeenCalledTimes(1)
    expect(contains.mock.calls[0][0].properties.name).toBe('Alpha')
  })

  it('stops at the country that contains the point', () => {
    const overlapping = [square('Alpha', 0, 0), square('Overlaps', 0, 0)]
    const contains = vi.fn(inSquare)
    const out = homeCountryNames(overlapping, [{ _lng: 5, _lat: 5, country: '' }], never, contains)
    expect([...out]).toEqual(['Alpha'])
    expect(contains).toHaveBeenCalledTimes(1)
  })

  it('never tests a country something has already settled', () => {
    const contains = vi.fn(inSquare)
    const located = [{ _lng: 5, _lat: 5, country: '' }, { _lng: 6, _lat: 6, country: '' }]
    homeCountryNames(features, located, never, contains)
    // The second creator is inside Alpha too, and Alpha is already named.
    expect(contains).toHaveBeenCalledTimes(1)
  })

  it('is empty for no creators and for no atlas', () => {
    expect(homeCountryNames(features, [], never, inSquare).size).toBe(0)
    expect(homeCountryNames([], [{ _lng: 1, _lat: 1 }], never, inSquare).size).toBe(0)
  })

  it('skips a creator with no coordinates instead of testing NaN', () => {
    const contains = vi.fn(inSquare)
    homeCountryNames(features, [{ _lng: null, _lat: null, country: '' }], never, contains)
    expect(contains).not.toHaveBeenCalled()
  })
})
