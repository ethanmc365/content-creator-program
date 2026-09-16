import { describe, it, expect } from 'vitest'
import { buildYearInReview, standing } from './yearInReview'

const ME = 'me', OTHER = 'other', QUIET = 'quiet', TEST = 'tester'

const base = {
  year: 2026,
  today: '2026-09-30',
  meId: ME,
  profiles: [
    { id: ME, name: 'Ada Lovelace', photo_url: 'p.jpg', city: 'Lisbon', country: 'Portugal', status: 'active', created_at: '2026-02-01', accepted_at: '2026-02-03' },
    { id: OTHER, name: 'Other', status: 'active', created_at: '2026-01-01' },
    { id: QUIET, name: 'Quiet', status: 'active', created_at: '2026-08-01' },
    { id: TEST, name: 'QA', status: 'active', is_test: true, created_at: '2026-01-01' },
  ],
  communities: [
    { id: 'c-pt', slug: 'portugal', name: 'Portugal', kind: 'chapter' },
    { id: 'c-ww', slug: 'worldwide', name: 'Worldwide', kind: 'network' },
  ],
  memberRows: [
    { profile_id: ME, community_id: 'c-pt', is_home: true },
    { profile_id: ME, community_id: 'c-ww', is_home: false },
  ],
  flights: [
    { creator_id: ME, from_iata: 'LIS', to_iata: 'LHR', flown_on: '2026-03-04', airline: 'TAP', aircraft: 'Airbus A320' },
    { creator_id: ME, from_iata: 'LHR', to_iata: 'LIS', flown_on: '2026-03-11', airline: 'TAP', aircraft: 'Airbus A320', return_of: 'x' },
    // NEXT YEAR, and a flight still to come. Neither is in this year's recap.
    { creator_id: ME, from_iata: 'LIS', to_iata: 'JFK', flown_on: '2027-01-02', airline: 'TAP', aircraft: 'Airbus A330' },
    { creator_id: ME, from_iata: 'LIS', to_iata: 'CDG', flown_on: '2026-12-20', airline: 'TAP', aircraft: 'Airbus A319' },
    { creator_id: OTHER, from_iata: 'LIS', to_iata: 'SYD', flown_on: '2026-04-04', airline: 'QF', aircraft: 'Boeing 787' },
  ],
  submissions: [
    { id: 's1', creator_id: ME, challenge_id: 'ch1', platform: 'tiktok', logged_views: 12_000, submitted_at: '2026-04-10', thumbnail_url: 't.jpg' },
    { id: 's2', creator_id: ME, challenge_id: 'ch1', platform: 'instagram', logged_views: 3_000, submitted_at: '2026-04-12' },
    { id: 's3', creator_id: ME, challenge_id: 'ch2', platform: 'tiktok', logged_views: 500, submitted_at: '2025-11-01' }, // last year
    { id: 's4', creator_id: OTHER, challenge_id: 'ch1', platform: 'tiktok', logged_views: 99_000, submitted_at: '2026-04-11' },
  ],
  results: [],
  rewards: [
    { creator_id: ME, amount: 100, currency: 'EUR', reward_type: 'cash', created_at: '2026-05-01' },
    { creator_id: ME, amount: 50, currency: 'EUR', reward_type: 'voucher', created_at: '2026-05-01' },
  ],
  challenges: [{ id: 'ch1', title: 'Spring in the city' }, { id: 'ch2', title: 'Old one' }],
  messages: [
    { sender_id: ME, channel: 'general', created_at: '2026-03-01', deleted: false },
    { sender_id: ME, channel: 'general', created_at: '2026-03-02', deleted: false },
    { sender_id: ME, channel: 'wins', created_at: '2026-06-02', deleted: false },
    { sender_id: OTHER, channel: 'general', created_at: '2026-03-01', deleted: false },
  ],
  connections: [
    { creator_id: ME, connected_creator_id: OTHER, status: 'accepted', created_at: '2026-03-05' },
    { creator_id: OTHER, connected_creator_id: QUIET, status: 'pending', created_at: '2026-03-05' },
  ],
  collabPosts: [{ creator_id: ME, city: 'Porto', start_date: '2026-07-01', created_at: '2026-06-01' }],
  gameScores: [
    { player_id: ME, mode: 'pinpoint', day_key: 20000, created_at: '2026-02-10' },
    { player_id: ME, mode: 'pinpoint', day_key: 20001, created_at: '2026-02-11' },
    { player_id: ME, mode: 'pinpoint', day_key: 20002, created_at: '2026-02-12' },
    { player_id: ME, mode: 'zip', day_key: 20005, created_at: '2026-02-15' },
    { player_id: OTHER, mode: 'zip', day_key: 20005, created_at: '2026-02-15' },
  ],
  reactions: [{ creator_id: ME, created_at: '2026-03-01' }],
  milestones: [{ id: 'm1', title: 'First video', icon: 'star' }, { id: 'm2', title: 'Ten videos', icon: 'trophy' }],
  creatorMilestones: [
    { profile_id: ME, milestone_id: 'm1', reached_at: '2026-04-11' },
    { profile_id: ME, milestone_id: 'm2', reached_at: '2025-12-11' },  // last year
  ],
}

describe('standing', () => {
  it('reads as a percentile, best first', () => {
    expect(standing([10, 20, 30], 30)).toMatchObject({ rank: 1, of: 3, percentile: 33, top: true })
    expect(standing([10, 20, 30], 10)).toMatchObject({ rank: 3, of: 3 })
  })

  it('does not rank somebody with nothing', () => {
    // A recap must never tell a new creator they are in the bottom half.
    expect(standing([10, 20], 0)).toBeNull()
    expect(standing([], 5)).toBeNull()
    expect(standing([10, 20], null)).toBeNull()
  })

  it('ignores everyone who did nothing when working out the field', () => {
    // Twenty people with zero should not make one video "top 5%".
    const field = [50, 10, ...Array(20).fill(0)]
    expect(standing(field, 10)).toMatchObject({ rank: 2, of: 2 })
  })
})

describe('the year in review', () => {
  const r = buildYearInReview(base)

  it('knows who it is for', () => {
    expect(r.me.name).toBe('Ada Lovelace')
    expect(r.me.market).toBe('Portugal')
    expect(r.me.joinedThisYear).toBe(true)
  })

  it('counts only this year, and only what has happened', () => {
    // Two flights in March. The December one has not been flown yet on the
    // 30th of September, and the 2027 one is not this year at all.
    expect(r.travel.flights).toBe(2)
    expect(r.travel.distance).toBeGreaterThan(2000)
    expect(r.travel.countries).toBe(2)
    // last year's video is not in this year's count
    expect(r.content.videos).toBe(2)
    expect(r.content.views).toBe(15_000)
    // nor last year's milestone
    expect(r.community.milestones.map((m) => m.title)).toEqual(['First video'])
  })

  it('counts a return leg as its own flight but the same route', () => {
    expect(r.travel.airports).toBe(2)
    expect(r.travel.aircraftTypes).toBe(1)
    expect(r.travel.topAirline.flights).toBe(2)
  })

  it('reads the community numbers off the right people', () => {
    expect(r.community.messages).toBe(3)
    expect(r.community.connections).toBe(1)   // the pending one is not a connection
    expect(r.community.topRoom.key).toBe('general')
    expect(r.travel.collabTrips).toBe(1)
    expect(r.travel.collabCities).toEqual(['Porto'])
  })

  it('finds the longest run of consecutive puzzle days', () => {
    expect(r.games.played).toBe(4)
    expect(r.games.days).toBe(4)
    expect(r.games.bestStreak).toBe(3)
    expect(r.games.favourite.mode).toBe('pinpoint')
  })

  it('splits cash from travel credit', () => {
    expect(r.content.cash).toBe(100)
    expect(r.content.vouchers).toBe(50)
  })

  it('ranks against real creators only', () => {
    // OTHER has 99k views to my 15k, so I am second of two - and the test
    // account and the quiet one are not in the field at all.
    expect(r.ranks.views).toMatchObject({ rank: 2, of: 2 })
    expect(r.ranks.messages).toMatchObject({ rank: 1, of: 2 })
  })

  it('gives everybody the community totals', () => {
    expect(r.everyone.creators).toBe(3)         // not the test account
    expect(r.everyone.views).toBe(114_000)      // my 15k plus OTHER's 99k, this year
    expect(r.everyone.videos).toBe(3)
    expect(r.everyone.flights).toBe(3)          // mine x2 + OTHER's, flown by 30 Sep
  })

  it('picks a busiest month', () => {
    expect(r.busiest).not.toBeNull()
    expect(typeof r.busiest.name).toBe('string')
  })

  // THE HONEST-ZERO PATH, which is the one that decides whether this is a
  // celebration or a report card. Somebody who joined in August and has done
  // nothing must get a SHORT recap, not a long one full of noughts.
  describe('a creator with an empty year', () => {
    const q = buildYearInReview({ ...base, meId: QUIET })

    it('marks every empty section so the cards can be dropped', () => {
      expect(q.travel.has).toBe(false)
      expect(q.content.has).toBe(false)
      expect(q.community.has).toBe(false)
      expect(q.games.has).toBe(false)
    })

    it('never ranks them, rather than ranking them last', () => {
      expect(q.ranks.views).toBeNull()
      expect(q.ranks.games).toBeNull()
      expect(q.ranks.distance).toBeNull()
    })

    it('still knows who they are and what the community did', () => {
      expect(q.me.name).toBe('Quiet')
      expect(q.everyone.creators).toBe(3)
      expect(q.everyone.views).toBe(114_000)
    })
  })

  it('does not fall over with nothing at all', () => {
    const empty = buildYearInReview({ year: 2026, meId: 'nobody' })
    expect(empty.me).toBeNull()
    expect(empty.travel.flights).toBe(0)
    expect(empty.everyone.creators).toBe(0)
    expect(empty.busiest).toBeNull()
  })
})
