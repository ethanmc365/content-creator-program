import { describe, it, expect } from 'vitest'
import { reasonFor, pickWhoToMeet, weekIndex } from './whoToMeet'

const me = {
  id: 'me',
  name: 'Ethan Mc',
  city: 'Manchester',
  languages: ['English', 'Spanish'],
  countries_visited: ['Vietnam', 'Thailand', 'Peru', 'Japan'],
  tiktok_url: 'https://tiktok.com/@me',
}

describe('reasonFor', () => {
  it('leads with being in the same place at the same time', () => {
    const them = { id: 'a', name: 'Olive Grace' }
    const r = reasonFor(
      me, them,
      [{ country: 'Portugal', city: 'Lisbon', start_date: '2026-09-01', end_date: '2026-09-10' }],
      [{ country: 'Portugal', city: 'Lisbon', start_date: '2026-09-05', end_date: '2026-09-15' }],
    )
    expect(r.kind).toBe('trip')
    expect(r.text).toBe('You are both in Lisbon at the same time next month.')
  })

  it('falls back to the same destination on different dates', () => {
    const r = reasonFor(
      me, { id: 'a', name: 'Olive Grace' },
      [{ country: 'Portugal', city: 'Lisbon', start_date: '2026-09-01', end_date: '2026-09-10' }],
      [{ country: 'Portugal', city: 'Porto', start_date: '2026-11-01', end_date: '2026-11-10' }],
    )
    expect(r.text).toBe('Olive is heading to Portugal too.')
  })

  it('points out when you have been where they are going', () => {
    const r = reasonFor(
      me, { id: 'a', name: 'Jacob Pulley' },
      [],
      [{ country: 'Vietnam', city: 'Hanoi', start_date: '2026-10-01', end_date: '2026-10-20' }],
    )
    expect(r.text).toBe('Jacob is off to Vietnam, and you have been.')
  })

  it('uses a shared language, but never English', () => {
    const r = reasonFor(me, { id: 'a', name: 'Ana', languages: ['English', 'Spanish'] })
    expect(r.text).toBe('You both speak Spanish.')

    const onlyEnglish = reasonFor(me, { id: 'b', name: 'Sam', languages: ['English'] })
    expect(onlyEnglish.text).not.toMatch(/English/)
  })

  it('needs three shared countries before it calls it a taste in common', () => {
    const two = reasonFor(me, { id: 'a', name: 'Kim', countries_visited: ['Vietnam', 'Peru'] })
    expect(two.kind).not.toBe('countries')
    const three = reasonFor(me, { id: 'b', name: 'Kim', countries_visited: ['Vietnam', 'Peru', 'Japan'] })
    expect(three.text).toBe('You have both been to Vietnam, Peru and Japan.')
  })

  it('says so plainly when there is nothing to point at', () => {
    const r = reasonFor(me, { id: 'a', name: 'Nobody Incommon' })
    expect(r.kind).toBe('chance')
    expect(r.text).toBe('No particular reason. We just reckon you two would get on.')
  })

  it('never writes a reason that sounds like a machine', () => {
    const samples = [
      reasonFor(me, { id: 'a', name: 'Ana', languages: ['Spanish'] }),
      reasonFor(me, { id: 'b', name: 'Nobody' }),
      reasonFor(me, { id: 'c', name: 'Kim', tiktok_url: 'x' }),
    ]
    for (const s of samples) {
      expect(s.text).not.toMatch(/based on|recommend|match|profile suggests|you may also/i)
      // House style: no em dashes anywhere in user-facing copy.
      expect(s.text).not.toMatch(/—/)
    }
  })
})

describe('pickWhoToMeet', () => {
  const pool = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, name: `Creator ${i}` }))

  it('returns three and never includes the viewer', () => {
    const out = pickWhoToMeet(me, [...pool, me])
    expect(out).toHaveLength(3)
    expect(out.some((o) => o.creator.id === 'me')).toBe(false)
  })

  it('puts a real reason ahead of a fallback', () => {
    const travelling = { id: 'trip', name: 'Trip Person' }
    const out = pickWhoToMeet(
      me,
      [...pool, travelling],
      {
        me: [{ country: 'Japan', city: 'Tokyo', start_date: '2026-09-01', end_date: '2026-09-09' }],
        trip: [{ country: 'Japan', city: 'Tokyo', start_date: '2026-09-03', end_date: '2026-09-12' }],
      },
    )
    expect(out[0].creator.id).toBe('trip')
    expect(out[0].reason.kind).toBe('trip')
  })

  it('is stable within a week and changes between weeks', () => {
    const monday = Date.UTC(2026, 7, 10, 9, 0)
    const thursday = Date.UTC(2026, 7, 13, 22, 0)
    const nextWeek = Date.UTC(2026, 7, 18, 9, 0)
    expect(weekIndex(monday)).toBe(weekIndex(thursday))
    expect(weekIndex(nextWeek)).not.toBe(weekIndex(monday))

    const a = pickWhoToMeet(me, pool, {}, monday).map((o) => o.creator.id)
    const b = pickWhoToMeet(me, pool, {}, thursday).map((o) => o.creator.id)
    expect(a).toEqual(b)
  })
})
