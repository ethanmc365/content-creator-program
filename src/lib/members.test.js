import { describe, it, expect } from 'vitest'
import { isRealMember, memberCount, splitMembers } from './members'

// The real UK & Ireland membership, in miniature: 44 creators, one admin who
// runs it, and the nine rows that made the two pages disagree.
const ROWS = [
  { profiles: { id: '1', name: 'Creator A', status: 'active' } },
  { profiles: { id: '2', name: 'Creator B', status: 'active' } },
  { profiles: { id: '3', name: 'Ethan', status: 'active', is_admin: true } },
  { profiles: { id: '4', name: 'QA Admin', status: 'active', is_admin: true, is_test: true } },
  { profiles: { id: '5', name: 'Sam Rivera', status: 'active', is_test: true, is_sandbox: true } },
  { profiles: { id: '6', name: 'Katie', status: 'pending' } },
  { profiles: { id: '7', name: 'Paige Skinner', status: 'pending' } },
  { profiles: { id: '8', name: 'Leaver', status: 'active', deletion_requested_at: '2026-08-01' } },
]

describe('isRealMember', () => {
  it('keeps an active creator', () => {
    expect(isRealMember({ status: 'active' })).toBe(true)
  })

  // THE BUG THIS PINS. Six people had applied to UK & Ireland and not been
  // approved, and the manage page counted every one of them. A pending
  // applicant cannot post and may yet be declined; they are not in the market.
  it('leaves out somebody who has only applied', () => {
    expect(isRealMember({ status: 'pending' })).toBe(false)
  })

  it('leaves out the QA account and the view-as sandbox', () => {
    expect(isRealMember({ status: 'active', is_test: true })).toBe(false)
    expect(isRealMember({ status: 'active', is_sandbox: true })).toBe(false)
  })

  it('leaves out somebody on the way out', () => {
    expect(isRealMember({ status: 'active', deletion_requested_at: '2026-08-01' })).toBe(false)
  })

  it('survives a missing profile rather than throwing', () => {
    expect(isRealMember(null)).toBe(false)
    expect(isRealMember(undefined)).toBe(false)
  })
})

describe('splitMembers', () => {
  const s = splitMembers(ROWS)

  it('counts the people who are really there', () => {
    expect(s.total).toBe(3)
    expect(memberCount(ROWS)).toBe(3)
  })

  // Ethan runs UK & Ireland and expected to be in its number. He is counted,
  // as TEAM rather than as a creator, so both numbers stay true.
  it('counts an admin who runs the market, as team', () => {
    expect(s.team.map((r) => r.profiles.name)).toEqual(['Ethan'])
    expect(s.creators.map((r) => r.profiles.name)).toEqual(['Creator A', 'Creator B'])
  })

  it('works on bare profiles as well as joined rows', () => {
    expect(splitMembers([{ status: 'active' }, { status: 'pending' }]).total).toBe(1)
  })

  it('handles an empty market', () => {
    expect(splitMembers([]).total).toBe(0)
    expect(memberCount()).toBe(0)
  })
})
