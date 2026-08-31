import { describe, it, expect } from 'vitest'
import { activeTab } from './AppLayout'

// Which of the five tabs lights up for a given URL. NavLink's own isActive is a
// path-prefix test, which got this wrong the moment a tab forwarded somewhere
// outside its own prefix.
describe('activeTab', () => {
  it('lights the hub on the worldwide pages', () => {
    expect(activeTab('/global')).toBe('/global')
    expect(activeTab('/global/')).toBe('/global')
    expect(activeTab('/c/uk')).toBe('/global')
    expect(activeTab('/manage/uk')).toBe('/global')
  })

  // The reported bug: Rooms forwards into the worldwide General on a desktop,
  // so the address becomes /global/chat/general - which /global used to claim.
  it('lights Rooms for a room, wherever that room is mounted', () => {
    expect(activeTab('/rooms')).toBe('/rooms')
    expect(activeTab('/rooms/general')).toBe('/rooms')
    expect(activeTab('/chat/announcements')).toBe('/rooms')
    expect(activeTab('/global/chat/general')).toBe('/rooms')
    expect(activeTab('/global/chat/announcements')).toBe('/rooms')
    expect(activeTab('/c/uk/chat/content-tips')).toBe('/rooms')
  })

  it('keeps the other three tabs to themselves', () => {
    expect(activeTab('/messages')).toBe('/messages')
    expect(activeTab('/messages/abc-123')).toBe('/messages')
    expect(activeTab('/events')).toBe('/events')
    expect(activeTab('/challenges')).toBe('/challenges')
    expect(activeTab('/challenges/42')).toBe('/challenges')
  })

  // A page behind the avatar menu is not one of the five tabs, and lighting one
  // of them there would point at the wrong place.
  it('lights nothing on a page no tab owns', () => {
    expect(activeTab('/profile/abc')).toBeNull()
    expect(activeTab('/rewards')).toBeNull()
    expect(activeTab('/settings')).toBeNull()
    expect(activeTab('/')).toBeNull()
  })

  // Prefix matching without a boundary would make /globalish or /roomsy match.
  it('does not match a longer word that merely starts the same', () => {
    expect(activeTab('/globalish')).toBeNull()
    expect(activeTab('/roomsy')).toBeNull()
    expect(activeTab('/eventsomething')).toBeNull()
  })
})
