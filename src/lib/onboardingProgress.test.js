import { describe, it, expect } from 'vitest'
import { onboardingProgress, applicantBucket, ONBOARDING_STEP_COUNT } from './onboardingProgress'

const full = {
  name: 'Alex Test',
  photo_url: 'https://example.test/a.jpg',
  country_code: 'GB',
  city: 'Bristol',
  age: 29,
  instagram_url: 'https://instagram.com/alextest',
  bio: 'Bristol based creator',
  about: 'A few lines about me that go on for a while.',
  languages: ['English'],
  countries_visited: ['France'],
}
const phone = { phone: '7700 900123', phone_country: '+44' }

describe('onboardingProgress', () => {
  it('reports a complete draft as complete', () => {
    const p = onboardingProgress(full, phone)
    expect(p.done).toBe(ONBOARDING_STEP_COUNT)
    expect(p.stoppedAt).toBeNull()
    expect(p.percent).toBe(100)
    expect(p.summary).toMatch(/never pressed submit/)
  })

  it('names the FIRST unfinished step, not the last finished one', () => {
    const p = onboardingProgress({ ...full, bio: '', about: '' }, phone)
    expect(p.stoppedAt.key).toBe('story')
    expect(p.summary).toBe('Stopped at "Their story"')
    // The steps after it are still reported honestly rather than blanked.
    expect(p.steps.find((s) => s.key === 'languages').done).toBe(true)
  })

  it('says so when somebody signed up and did nothing', () => {
    const p = onboardingProgress({ name: '', status: 'pending' }, null)
    expect(p.done).toBe(0)
    expect(p.summary).toBe('Signed up and never started')
    expect(p.stoppedAt.key).toBe('identity')
  })

  it('READS `age`, NOT `dob` - profiles.dob is null on every row by design', () => {
    // A BEFORE trigger moves the date of birth into creator_private and derives
    // the age. Testing against `dob` would report every real applicant as
    // having stopped on "Where they are based".
    const p = onboardingProgress({ ...full, dob: null }, phone)
    expect(p.steps.find((s) => s.key === 'based').done).toBe(true)
  })

  it('needs the phone, which lives in creator_private and not on the profile', () => {
    const p = onboardingProgress(full, null)
    expect(p.stoppedAt.key).toBe('based')
  })

  it('accepts any one social account, not Instagram specifically', () => {
    const only = { ...full, instagram_url: '', tiktok_url: 'https://tiktok.com/@x' }
    expect(onboardingProgress(only, phone).steps.find((s) => s.key === 'socials').done).toBe(true)
  })

  it('never throws on a null or half-built row', () => {
    expect(() => onboardingProgress(null, null)).not.toThrow()
    expect(() => onboardingProgress({}, {})).not.toThrow()
    expect(onboardingProgress(null, null).done).toBe(0)
  })
})

describe('applicantBucket', () => {
  it('splits the roster from the queue', () => {
    expect(applicantBucket({ status: 'pending', onboarded: false })).toBe('incomplete')
    expect(applicantBucket({ status: 'pending', onboarded: true })).toBe('applied')
    expect(applicantBucket({ status: 'active', onboarded: true })).toBe('member')
    expect(applicantBucket({ status: 'muted', onboarded: true })).toBe('member')
    expect(applicantBucket({ status: 'declined', onboarded: true })).toBe('declined')
  })

  it('treats an onboarded=false ACTIVE account as a member, because it is one', () => {
    // Admins and grandfathered accounts predate the flow. They are in the
    // community, so they belong on the roster whatever the column says.
    expect(applicantBucket({ status: 'active', onboarded: false })).toBe('member')
  })
})
