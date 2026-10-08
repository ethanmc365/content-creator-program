import { beforeEach, describe, expect, it, vi } from 'vitest'

const invoke = vi.fn()
vi.mock('./supabase', () => ({ supabase: { functions: { invoke: (...a) => invoke(...a) } } }))

const { suggestCity } = await import('./geocode')

describe('suggestCity (8 Oct 2026: "Melbournr" and "Canguu" were missing from the map)', () => {
  beforeEach(() => { invoke.mockReset(); localStorage.clear() })

  it('offers the corrected town when the geocoder only found it by fixing the spelling', async () => {
    invoke.mockResolvedValue({ data: { found: true, lat: -37.8, lng: 144.9, suggestion: { city: 'Melbourne', country: 'Australia' } } })
    expect(await suggestCity('Melbournr', 'Australia')).toEqual({ city: 'Melbourne', country: 'Australia' })
  })

  it('says nothing when what was typed is already right (accents and case do not count)', async () => {
    invoke.mockResolvedValue({ data: { found: true, lat: 37.9, lng: -4.8, suggestion: { city: 'Córdoba', country: 'Spain' } } })
    expect(await suggestCity('cordoba', 'Spain')).toBeNull()
  })

  it('says nothing for an exact match or a town that cannot be placed at all', async () => {
    invoke.mockResolvedValueOnce({ data: { found: true, lat: 51.5, lng: -0.1 } })
    expect(await suggestCity('London', 'UK')).toBeNull()
    invoke.mockResolvedValueOnce({ data: { found: false } })
    expect(await suggestCity('Xqzzv', 'Nowhere')).toBeNull()
  })

  it('keeps the country the creator typed and only fills it in when they left it blank', async () => {
    invoke.mockResolvedValue({ data: { found: true, lat: -8.6, lng: 115.1, suggestion: { city: 'Canggu', country: 'Indonesia' } } })
    expect(await suggestCity('Canguu', 'Bali')).toEqual({ city: 'Canggu', country: 'Bali' })
    expect(await suggestCity('Canguu', '')).toEqual({ city: 'Canggu', country: 'Indonesia' })
  })
})
