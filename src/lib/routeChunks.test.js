import { describe, it, expect } from 'vitest'
import { chunk, chunkForPath, shapeForPath } from './routeChunks'

// THE REGISTRY IS THE THING THAT MAKES A NAVIGATION NOT SUSPEND, and it is
// matched by regular expression, which is the one part of it that can be wrong
// while looking right. Every case below is a path that either got the wrong
// chunk or drew the wrong skeleton at some point while this was being written.

describe('chunkForPath', () => {
  it('leaves the pages that are already in the bundle alone', () => {
    // Eagerly imported in App.jsx. A prefetch here would be a miss on every
    // pointer that crossed the tab bar.
    for (const p of ['/challenges', '/messages', '/events', '/creators', '/settings', '/notifications']) {
      expect(chunkForPath(p), p).toBeNull()
    }
  })

  it('matches the five bottom tabs that are split', () => {
    expect(chunkForPath('/global')).toBe(chunk.GlobalHome)
    expect(chunkForPath('/rooms')).toBe(chunk.Rooms)
    expect(chunkForPath('/game')).toBe(chunk.Game)
    expect(chunkForPath('/leaderboard')).toBe(chunk.Leaderboard)
  })

  it('prefers the MORE SPECIFIC route, which is what the order encodes', () => {
    // /global/chat must not resolve to GlobalHome, and /flights/aircraft must
    // not resolve to Flights. Both are a one-line ordering mistake away.
    expect(chunkForPath('/global/chat/general')).toBe(chunk.NetworkChat)
    expect(chunkForPath('/global/markets')).toBe(chunk.ExploreMarkets)
    expect(chunkForPath('/global/settings')).toBe(chunk.GlobalSettings)
    expect(chunkForPath('/flights/aircraft')).toBe(chunk.AircraftCollection)
    expect(chunkForPath('/flights/community')).toBe(chunk.FlightCommunity)
    expect(chunkForPath('/flights')).toBe(chunk.Flights)
  })

  it('handles the market routes, which all share a :slug', () => {
    expect(chunkForPath('/c/spain')).toBe(chunk.ChapterHome)
    expect(chunkForPath('/c/spain/challenges')).toBe(chunk.MarketChallenges)
    expect(chunkForPath('/c/spain/members')).toBe(chunk.MarketMembers)
    expect(chunkForPath('/c/spain/chat')).toBe(chunk.NetworkChat)
    expect(chunkForPath('/c/spain/chat/general')).toBe(chunk.NetworkChat)
    expect(chunkForPath('/manage/spain')).toBe(chunk.ManageChapter)
  })

  it('sends every admin page to its own chunk, and /admin to the panel', () => {
    expect(chunkForPath('/admin')).toBe(chunk.AdminPanel)
    expect(chunkForPath('/admin/applications')).toBe(chunk.AdminApplications)
    expect(chunkForPath('/admin/rewards')).toBe(chunk.AdminRewards)
    expect(chunkForPath('/admin/analytics')).toBe(chunk.AdminAnalytics)
    // A challenge's analytics is a different page from the overview.
    expect(chunkForPath('/admin/analytics/abc-123')).toBe(chunk.AdminChallengeAnalytics)
    // Results is a different page from the edit form, and it is nested under it.
    expect(chunkForPath('/admin/challenges/abc-123/results')).toBe(chunk.AdminResults)
    expect(chunkForPath('/admin/challenges/abc-123/edit')).toBe(chunk.AdminChallengeForm)
    expect(chunkForPath('/admin/testing/onboarding')).toBe(chunk.TestingCentre)
  })
})

describe('shapeForPath', () => {
  it('draws a conversation for anything that is one', () => {
    for (const p of ['/rooms', '/messages', '/messages/abc', '/global/chat/general', '/c/spain/chat']) {
      expect(shapeForPath(p), p).toBe('thread')
    }
  })

  it('draws rows for the pages that are lists of people', () => {
    for (const p of ['/creators', '/connections', '/leaderboard', '/admin/applications', '/admin/creators']) {
      expect(shapeForPath(p), p).toBe('list')
    }
  })

  it('draws the hub only for the hub itself, not for everything under it', () => {
    expect(shapeForPath('/global')).toBe('hub')
    expect(shapeForPath('/c/spain')).toBe('hub')
    // A page BELOW the hub is not the hub - this is what the `$` is for.
    expect(shapeForPath('/global/markets')).not.toBe('hub')
  })

  it('has a shape for the rest, and never returns nothing', () => {
    expect(shapeForPath('/profile/abc')).toBe('profile')
    expect(shapeForPath('/collab')).toBe('map')
    expect(shapeForPath('/events')).toBe('calendar')
    expect(shapeForPath('/challenges')).toBe('feature')
    expect(shapeForPath('/settings')).toBe('settings')
    expect(shapeForPath('/admin/notes')).toBe('form')
    // Anything unrecognised still gets a real layout rather than undefined.
    expect(shapeForPath('/something-nobody-has-written-yet')).toBe('cards')
    expect(shapeForPath('')).toBe('cards')
  })
})
