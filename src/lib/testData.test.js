import { describe, it, expect, beforeEach } from 'vitest'
import { adoptTestDataVisibility, seesTestData, testFlags, isHiddenTestRow, hideTest } from './testData'
import { isRealMember, memberCount } from './members'

// WHO SEES THE PRETEND PEOPLE. The report this pins: "all the test data
// accounts you created seem to be in the actual community and viewable to
// everyone, for example on the creator network page etc."
//
// The whole rule lives in one place, so it can be tested in one place. The
// database enforces the same thing independently (migration 178) - these tests
// are about the second half, which decides whether a viewer who is ALLOWED to
// see demo rows is actually shown them.

// A fake PostgREST builder that records the filters applied to it.
function fakeQuery() {
  const calls = []
  const q = {
    calls,
    eq(col, val) { calls.push(['eq', col, val]); return q },
    in(col, vals) { calls.push(['in', col, vals]); return q },
  }
  return q
}

const REAL_CREATOR = { is_admin: false, is_test: false, is_sandbox: false }
const REAL_ADMIN = { is_admin: true, is_test: false, is_sandbox: false }
const DEMO_ADMIN = { is_admin: true, is_test: true, is_sandbox: true }
const SANDBOX_CREATOR = { is_admin: false, is_test: true, is_sandbox: true }

describe('who is allowed to see test data', () => {
  beforeEach(() => adoptTestDataVisibility(null))

  it('hides it by default, before any profile has loaded', () => {
    expect(seesTestData()).toBe(false)
  })

  it('hides it from a real creator', () => {
    adoptTestDataVisibility(REAL_CREATOR)
    expect(seesTestData()).toBe(false)
  })

  // Ethan is a real admin. He manages the demo accounts in /admin (the database
  // lets him read them) and he must not meet them in his own community pages.
  it('hides it from a real admin', () => {
    adoptTestDataVisibility(REAL_ADMIN)
    expect(seesTestData()).toBe(false)
  })

  it('shows it to the demo admin account', () => {
    adoptTestDataVisibility(DEMO_ADMIN)
    expect(seesTestData()).toBe(true)
  })

  // "View as creator" steps into a sandbox account that is a test account but
  // NOT an admin. A preview of the app has to show what a real creator sees, or
  // it is a preview of nothing.
  it('hides it during a view-as-creator preview', () => {
    adoptTestDataVisibility(SANDBOX_CREATOR)
    expect(seesTestData()).toBe(false)
  })

  it('goes back to hiding it on sign-out', () => {
    adoptTestDataVisibility(DEMO_ADMIN)
    expect(seesTestData()).toBe(true)
    adoptTestDataVisibility(null)
    expect(seesTestData()).toBe(false)
  })
})

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

describe('hideTest', () => {
  beforeEach(() => adoptTestDataVisibility(null))

  it('adds the filter for a real creator', () => {
    adoptTestDataVisibility(REAL_CREATOR)
    expect(hideTest(fakeQuery()).calls).toEqual([['eq', 'is_test', false]])
  })

  it('qualifies the column for an embedded table', () => {
    adoptTestDataVisibility(REAL_CREATOR)
    expect(hideTest(fakeQuery(), 'profiles').calls).toEqual([['eq', 'profiles.is_test', false]])
  })

  it('adds nothing at all for the demo admin', () => {
    adoptTestDataVisibility(DEMO_ADMIN)
    expect(hideTest(fakeQuery()).calls).toEqual([])
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
