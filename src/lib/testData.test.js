import { describe, it, expect, beforeEach } from 'vitest'
import { adoptTestDataVisibility, testFlags, isHiddenTestRow } from './testData'
import { isRealMember, memberCount } from './members'

const REAL_CREATOR = { is_admin: false, is_test: false, is_sandbox: false }
const DEMO_ADMIN = { is_admin: true, is_test: true, is_sandbox: true }

describe('testFlags', () => {
  beforeEach(() => adoptTestDataVisibility(null))

  // `.in('is_test', [false])` has to select exactly what `.eq('is_test', false)`
  // used to, or this refactor silently changed eighty-odd queries. `is_test` is
  // NOT NULL with a default of false, so the two are equivalent.
  it('asks for real rows only when the viewer may not see test data', () => {
    adoptTestDataVisibility(REAL_CREATOR)
    expect(testFlags()).toEqual([false])
  })

  it('asks for both when the viewer may', () => {
    adoptTestDataVisibility(DEMO_ADMIN)
    expect(testFlags()).toEqual([false, true])
  })
})

describe('isHiddenTestRow', () => {
  beforeEach(() => adoptTestDataVisibility(null))

  it('drops a test row for a real creator and keeps it for the demo admin', () => {
    const row = { is_test: true }
    adoptTestDataVisibility(REAL_CREATOR)
    expect(isHiddenTestRow(row)).toBe(true)
    adoptTestDataVisibility(DEMO_ADMIN)
    expect(isHiddenTestRow(row)).toBe(false)
  })

  it('never drops a real row', () => {
    adoptTestDataVisibility(REAL_CREATOR)
    expect(isHiddenTestRow({ is_test: false })).toBe(false)
  })

  // The embed comes back NULL when the database has hidden the profile, and a
  // null is not a test row - the row above it is dropped by RLS, not by this.
  it('treats a missing profile as nothing to drop', () => {
    adoptTestDataVisibility(REAL_CREATOR)
    expect(isHiddenTestRow(null)).toBe(false)
    expect(isHiddenTestRow(undefined)).toBe(false)
  })
})

// The membership predicate is the one every roster and headline count goes
// through, so the viewer rule has to reach it too.
describe('isRealMember follows the viewer', () => {
  const ROWS = [
    { profiles: { id: '1', name: 'Creator A', status: 'active' } },
    { profiles: { id: '2', name: 'Lucia Fernandez', status: 'active', is_test: true } },
    { profiles: { id: '3', name: 'QA Admin', status: 'active', is_admin: true, is_test: true, is_sandbox: true } },
  ]

  beforeEach(() => adoptTestDataVisibility(null))

  it('leaves the demo creators out of a real creator’s roster', () => {
    adoptTestDataVisibility(REAL_CREATOR)
    expect(isRealMember({ status: 'active', is_test: true })).toBe(false)
    expect(memberCount(ROWS)).toBe(1)
  })

  it('counts them for the demo admin', () => {
    adoptTestDataVisibility(DEMO_ADMIN)
    expect(isRealMember({ status: 'active', is_test: true })).toBe(true)
    // Two, not three: the QA account itself is `is_sandbox`, which is NOT
    // viewer-aware. A demo of a community should no more list the demo login
    // than a real one should.
    expect(memberCount(ROWS)).toBe(2)
  })
})
