import { describe, it, expect } from 'vitest'
import { roleTitle, roleBadgeTitle, LEAD_TITLE, LEAD_TITLE_SHORT } from './roles'

// A title is what somebody is CALLED and never what they can DO. These pin the
// order the fallbacks run in, because getting it wrong is not a visual bug -
// showing "Tryp.com team" to a country manager who has been given a title makes
// the title field look broken, and showing a title to a creator who has none
// would invent a rank nobody granted.
describe('what somebody is called', () => {
  it('uses the title they were actually given, above everything else', () => {
    expect(roleTitle({ role_title: 'Spanish Country Manager', platform_role: 'global_admin', is_admin: true }))
      .toBe('Spanish Country Manager')
    // even over being the lead
    expect(roleTitle({ role_title: 'Founder', platform_role: 'owner' })).toBe('Founder')
  })

  it('falls back to the lead, then the market manager, then the team', () => {
    expect(roleTitle({ platform_role: 'owner' })).toBe(LEAD_TITLE_SHORT)
    expect(roleTitle({ memberRole: 'manager' }, 'Spain')).toBe('Spain manager')
    expect(roleTitle({ memberRole: 'manager' })).toBe('Market manager')
    expect(roleTitle({ is_admin: true })).toBe('Tryp.com team')
    expect(roleTitle({ platform_role: 'global_admin' })).toBe('Tryp.com team')
  })

  it('calls somebody with no title and no rank a creator', () => {
    expect(roleTitle({})).toBe('Creator')
    expect(roleTitle({ is_admin: false })).toBe('Creator')
  })

  it('says nothing at all rather than guessing, for nobody', () => {
    expect(roleTitle(null)).toBe('')
    expect(roleTitle(undefined)).toBe('')
  })
})

// A badge is read in the same glance as the name it sits beside, so the one
// title we know is too long for that has an agreed short form.
describe('the same title, at badge length', () => {
  it('shortens the full lead title and nothing else', () => {
    expect(roleBadgeTitle({ role_title: LEAD_TITLE })).toBe(LEAD_TITLE_SHORT)
    expect(roleBadgeTitle({ platform_role: 'owner' })).toBe(LEAD_TITLE_SHORT)
  })

  it('leaves a title somebody chose exactly as they wrote it', () => {
    expect(roleBadgeTitle({ role_title: 'Spanish Country Manager' })).toBe('Spanish Country Manager')
    expect(roleBadgeTitle({ role_title: 'Nordics Lead' })).toBe('Nordics Lead')
    expect(roleBadgeTitle({ is_admin: true })).toBe('Tryp.com team')
  })
})
