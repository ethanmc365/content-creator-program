import { describe, expect, it } from 'vitest'
import { toCsv } from './utils'
import {
  challengeKey, challengeOptions, creatorLink, monthKey, monthLabel,
  monthsOf, parseTags, reasonLabel, summarise, toCsvRows, visibleVideos,
  countryOf, countryOptions, marketOf, CSV_COLUMNS, handleOf,
} from './videoTracker'

// THE VIDEO TRACKER'S FILTER, ORDER AND TOTALS.
//
// All of it is a pure function of the rows, which is the whole reason it is in
// lib rather than inside the page: the alternative is opening /admin/videos and
// squinting at a grid, which is exactly how `lib/tourPlacement` came to be wrong
// for months.

const v = (over = {}) => ({
  id: over.id ?? Math.random().toString(36).slice(2),
  qualifies: true,
  pinned: false,
  reason: 'podium',
  rank: 1,
  views: 1000,
  platform: 'TikTok',
  hook: 'A hook',
  caption: null,
  creator_name: 'Someone',
  creator_handle: 'someone',
  challenge_id: 'ch-1',
  challenge_title: 'The UK one',
  history_id: null,
  history_title: null,
  community_id: 'uk',
  market_name: 'UK & Ireland',
  tags: [],
  notes: null,
  posted_at: '2026-08-01T00:00:00Z',
  created_at: '2026-09-01T00:00:00Z',
  video_url: 'https://www.tiktok.com/@someone/video/123',
  ...over,
})

describe('visibleVideos', () => {
  it('hides a retired video, with no filter that brings it back', () => {
    const rows = [v({ id: 'a' }), v({ id: 'b', qualifies: false })]
    expect(visibleVideos(rows).map((r) => r.id)).toEqual(['a'])
    expect(visibleVideos(rows, { showRetired: true }).map((r) => r.id)).toEqual(['a'])
  })

  // A PIN IS A DECISION, AND A DECISION MUST NOT BE FILTERED OUT BY A COUNTER.
  // Retiring is a machine's opinion about a view count; pinning is a person's
  // about the video.
  it('keeps a pinned video even once it has retired', () => {
    const rows = [v({ id: 'a' }), v({ id: 'b', qualifies: false, pinned: true, views: 1 })]
    expect(visibleVideos(rows).map((r) => r.id)).toEqual(['b', 'a'])
  })

  it('floats pinned videos above everything, whatever the sort', () => {
    const rows = [v({ id: 'big', views: 90000 }), v({ id: 'small', views: 5, pinned: true })]
    expect(visibleVideos(rows, { sort: 'views' }).map((r) => r.id)).toEqual(['small', 'big'])
  })

  it('filters by market and platform', () => {
    const rows = [
      v({ id: 'uk-tt' }),
      v({ id: 'es-ig', community_id: 'es', platform: 'Instagram', reason: 'manual' }),
    ]
    expect(visibleVideos(rows, { market: 'es' }).map((r) => r.id)).toEqual(['es-ig'])
    expect(visibleVideos(rows, { platform: 'Instagram' }).map((r) => r.id)).toEqual(['es-ig'])
    // `reason` is deliberately NOT a filter any more (see visibleVideos): an
    // unknown key must be ignored rather than silently emptying the list.
    expect(visibleVideos(rows, { reason: 'manual' }).map((r) => r.id).sort()).toEqual(rows.map((r) => r.id).sort())
  })

  // The search is the thing this page is actually used with - "did anybody do a
  // POV one" - so it has to reach the hook, the tags and the creator, not just
  // the title.
  it('searches hooks, tags, creators and captions', () => {
    const rows = [
      v({ id: 'pov', hook: 'POV: you find a £53 flight' }),
      v({ id: 'tagged', hook: 'Nothing', tags: ['transition'] }),
      v({ id: 'named', hook: 'Nothing', creator_name: 'Denisa Hadarau' }),
    ]
    expect(visibleVideos(rows, { q: 'pov' }).map((r) => r.id)).toEqual(['pov'])
    expect(visibleVideos(rows, { q: 'TRANSITION' }).map((r) => r.id)).toEqual(['tagged'])
    expect(visibleVideos(rows, { q: 'denisa' }).map((r) => r.id)).toEqual(['named'])
  })

  it('filters by month, which is what the monthly report is', () => {
    const rows = [
      v({ id: 'jul', posted_at: '2026-07-25T00:00:00Z' }),
      v({ id: 'sep', posted_at: '2026-09-02T00:00:00Z' }),
    ]
    expect(visibleVideos(rows, { month: '2026-07' }).map((r) => r.id)).toEqual(['jul'])
  })

  it('is safe with nothing at all', () => {
    expect(visibleVideos(null)).toEqual([])
    expect(visibleVideos([])).toEqual([])
  })
})

describe('challengeKey', () => {
  // A live challenge id and a challenge-log id are both uuids, and the filter is
  // one dropdown. Without the prefix the two namespaces would collide.
  it('namespaces a live challenge apart from a logged one', () => {
    expect(challengeKey(v({ challenge_id: 'x', history_id: null }))).toBe('c:x')
    expect(challengeKey(v({ challenge_id: null, history_id: 'x' }))).toBe('h:x')
    expect(challengeKey(v({ challenge_id: null, history_id: null }))).toBe('')
  })

  it('builds one option per challenge, alphabetically', () => {
    const rows = [
      v({ challenge_id: 'b', challenge_title: 'Beta' }),
      v({ challenge_id: 'a', challenge_title: 'Alpha' }),
      v({ challenge_id: 'a', challenge_title: 'Alpha' }),
      v({ challenge_id: null, history_id: null, challenge_title: null }),
    ]
    expect(challengeOptions(rows).map((c) => c.label)).toEqual(['Alpha', 'Beta'])
  })
})

describe('summarise', () => {
  // "NOT MEASURED" IS NOT "MEASURED AS ZERO". The analytics page paid for this
  // rule with a quarter of its headline CPM; the same trap is here.
  it('averages over what is known, not over what is listed', () => {
    const s = summarise([v({ views: 1000 }), v({ views: 3000 }), v({ views: null })])
    expect(s.count).toBe(3)
    expect(s.measured).toBe(2)
    expect(s.views).toBe(4000)
    expect(s.average).toBe(2000)
    expect(s.best).toBe(3000)
  })

  it('counts a creator once however many videos they have', () => {
    expect(summarise([v({ creator_handle: 'a' }), v({ creator_handle: 'a' })]).creators).toBe(1)
  })

  it('has no average when nothing is measured', () => {
    expect(summarise([v({ views: null })]).average).toBe(null)
  })
})

describe('reasonLabel', () => {
  it('turns a podium place into an ordinal', () => {
    expect(reasonLabel(v({ reason: 'podium', rank: 1 })).label).toMatch(/^1st/)
    expect(reasonLabel(v({ reason: 'podium', rank: 3 })).label).toMatch(/^3rd/)
    expect(reasonLabel(v({ reason: 'podium', rank: 7 })).label).toMatch(/^7th/)
  })

  it('names the other two reasons without a rank', () => {
    expect(reasonLabel(v({ reason: 'threshold', rank: null })).tone).toBe('green')
    expect(reasonLabel(v({ reason: 'manual', rank: null })).tone).toBe('grey')
  })
})

describe('creatorLink', () => {
  it('builds the account URL per platform, with or without the @', () => {
    expect(creatorLink(v({ platform: 'Instagram', creator_handle: 'lisa' }))).toBe('https://www.instagram.com/lisa/')
    expect(creatorLink(v({ platform: 'TikTok', creator_handle: '@lisa' }))).toBe('https://www.tiktok.com/@lisa')
  })

  // A BROKEN LINK IS WORSE THAN NO LINK, which is why an unknown platform gets
  // null rather than a guessed URL shape.
  it('returns null rather than guessing', () => {
    expect(creatorLink(v({ platform: 'Vimeo', creator_handle: 'lisa' }))).toBe(null)
    expect(creatorLink(v({ creator_handle: null, video_url: null }))).toBe(null)
  })
})

describe('parseTags', () => {
  it('splits on commas and newlines, trims, and drops the hash', () => {
    expect(parseTags('POV, #transition\n price reveal ')).toEqual(['POV', 'transition', 'price reveal'])
  })

  // A filing system that accepts "POV", "pov" and "pov " as three tags is not a
  // filing system.
  it('de-duplicates case-insensitively, keeping the first spelling', () => {
    expect(parseTags('POV, pov, Pov')).toEqual(['POV'])
  })

  it('caps the list and survives nothing', () => {
    expect(parseTags(Array.from({ length: 30 }, (_, i) => `t${i}`).join(',')).length).toBe(12)
    expect(parseTags('')).toEqual([])
    expect(parseTags(null)).toEqual([])
  })
})

describe('toCsvRows', () => {
  it('flattens a row into the columns marketing keeps, numbered in the order shown', () => {
    const rows = toCsvRows([
      v({ views: 15200, market_kind: 'chapter', market_name: 'UK & Ireland', creator_country: 'United Kingdom', creator_country_code: 'GB' }),
      v({ views: 900, source: 'vip' }),
    ])
    expect(rows[0]).toMatchObject({
      n: 1, platform: 'TikTok', handle: '@someone', market: 'UK & Ireland', country: 'United Kingdom',
      views: 15200, posted_at: '2026-08-01', type: 'Community', challenge: 'The UK one',
    })
    expect(rows[1].n).toBe(2)
    expect(rows[1].type).toBe('VIP')
    expect(CSV_COLUMNS.slice(0, 4).map((c) => c.label)).toEqual(['#', 'Platform', 'Video', 'Account'])
    // Through the real writer: a header line and filled cells, not commas.
    const text = toCsv(rows, CSV_COLUMNS)
    expect(text.split('\r\n')[0]).toBe('#,Platform,Video,Account,Creator,Market,Country,Published,Views,Type,Challenge,Hook')
    expect(text.split('\r\n')[1]).toMatch(/^1,TikTok,.*,\t?@someone,Someone,UK & Ireland,United Kingdom,2026-08-01,15200,Community,/)
  })

  it('writes an empty string rather than undefined for a missing field', () => {
    const [row] = toCsvRows([v({ hook: null, posted_at: null, views: null, market_name: null })])
    expect(row.hook).toBe('')
    expect(row.posted_at).toBe('')
    expect(row.views).toBe('')
    expect(row.country).toBe('')
  })
})

describe('handleOf', () => {
  it('uses the row, then the link, then the profile', () => {
    expect(handleOf(v({ creator_handle: '@sam' }))).toBe('sam')
    expect(handleOf(v({ creator_handle: null, video_url: 'https://www.tiktok.com/@marty.reiser/video/769' }))).toBe('marty.reiser')
    expect(handleOf(v({ creator_handle: null, video_url: 'https://vm.tiktok.com/ZN8/', platform: 'TikTok', creator_social: 'https://www.tiktok.com/@noa?_r=1' }))).toBe('noa')
    expect(handleOf(v({ creator_handle: null, video_url: 'https://vm.tiktok.com/ZN8/', creator_social: null }))).toBe('')
  })
})

describe('the market and the country', () => {
  it('names the real market, never Worldwide when the country is known', () => {
    const ww = { market_name: 'Worldwide', market_kind: 'network' }
    expect(marketOf(v({ ...ww, creator_country: 'Bulgaria', creator_country_code: 'BG' }))).toBe('Bulgaria')
    expect(marketOf(v({ ...ww, home_name: 'Romania', creator_country: 'Romania' }))).toBe('Romania')
    expect(marketOf(v({ market_name: 'Spain', market_kind: 'chapter', home_name: 'UK & Ireland', creator_country: 'Chile' }))).toBe('Spain')
    // A VIP's "home" is its programme's market, so a Worldwide VIP falls to the country too.
    expect(marketOf(v({ ...ww, source: 'vip', home_name: 'Worldwide', creator_country: 'Bulgaria' }))).toBe('Bulgaria')
    expect(marketOf(v({ ...ww }))).toBe('Worldwide')
  })

  it('fills a country name from the code alone', () => {
    expect(countryOf(v({ creator_country_code: 'bg' }))).toMatchObject({ key: 'BG', name: 'Bulgaria' })
    expect(countryOf(v({}))).toBeNull()
  })

  it('filters by country and lists only the countries that have a video', () => {
    const rows = [
      v({ id: 'a', creator_country: 'Bulgaria', creator_country_code: 'BG' }),
      v({ id: 'b', creator_country: 'Spain', creator_country_code: 'ES' }),
      v({ id: 'c', creator_country: 'Spain', creator_country_code: 'ES' }),
      v({ id: 'd' }),
    ]
    expect(visibleVideos(rows, { country: 'BG' }).map((r) => r.id)).toEqual(['a'])
    expect(countryOptions(rows).map((c) => [c.key, c.count])).toEqual([['ES', 2], ['BG', 1]])
    // The one already picked stays listed at zero.
    expect(countryOptions(rows, 'SE').find((c) => c.key === 'SE')).toMatchObject({ name: 'Sweden', count: 0 })
  })
})

describe('the month rail', () => {
  it('keys a video by when it was posted, and falls back to when it was added', () => {
    expect(monthKey(v({ posted_at: '2026-07-25T10:00:00Z' }))).toBe('2026-07')
    expect(monthKey(v({ posted_at: null, created_at: '2026-09-01T00:00:00Z' }))).toBe('2026-09')
    expect(monthKey(v({ posted_at: null, created_at: null }))).toBe('')
    // A row whose date is unparseable must not become the string "NaN-NaN".
    expect(monthKey(v({ posted_at: 'not a date' }))).toBe('')
  })

  it('reads a month key back as words', () => {
    expect(monthLabel('2026-07')).toBe('July 2026')
    expect(monthLabel('2026-12')).toBe('December 2026')
  })

  // THE FLOOR COMES FROM THE ROWS AND THE CEILING FROM THE CALENDAR. A hard
  // start date is still refused - the UK challenge ran in JULY, so "obviously
  // from August" would have drawn an empty rail over the only full month.
  it('counts the months that have videos, newest first', () => {
    const rows = [
      v({ posted_at: '2026-07-25T00:00:00Z' }),
      v({ posted_at: '2026-07-29T00:00:00Z' }),
      v({ posted_at: '2026-09-02T00:00:00Z' }),
    ]
    expect(monthsOf(rows, new Date('2026-09-10T00:00:00Z'))).toEqual([
      { key: '2026-09', count: 1, label: 'September 2026' },
      { key: '2026-08', count: 0, label: 'August 2026' },
      { key: '2026-07', count: 2, label: 'July 2026' },
    ])
  })

  // "There's only a July 2026 and no August 2026. All the ones up to the
  // current date should be there even if there's no videos in it yet."
  it('fills in the months with nothing in them, up to today', () => {
    const rows = [v({ posted_at: '2026-07-25T00:00:00Z' })]
    expect(monthsOf(rows, new Date('2026-10-04T00:00:00Z')).map((m) => [m.key, m.count])).toEqual([
      ['2026-10', 0],
      ['2026-09', 0],
      ['2026-08', 0],
      ['2026-07', 1],
    ])
  })

  // "Every time there's a new month it should automatically show up." Same
  // rows, one day later in the calendar, one more entry in the rail.
  it('grows on its own when the month turns over', () => {
    const rows = [v({ posted_at: '2026-12-02T00:00:00Z' })]
    expect(monthsOf(rows, new Date('2026-12-31T00:00:00Z')).map((m) => m.key)).toEqual(['2026-12'])
    expect(monthsOf(rows, new Date('2027-01-01T00:00:00Z')).map((m) => m.key)).toEqual(['2027-01', '2026-12'])
  })

  // A platform clock that is ahead of ours must not file a video under a month
  // the rail does not draw.
  it('reaches past today when a row says so', () => {
    const rows = [v({ posted_at: '2026-11-02T00:00:00Z' })]
    expect(monthsOf(rows, new Date('2026-09-10T00:00:00Z')).map((m) => m.key))
      .toEqual(['2026-11', '2026-10', '2026-09'])
  })

  it('is safe with nothing, and still names this month', () => {
    expect(monthsOf(null, new Date('2026-09-10T00:00:00Z')))
      .toEqual([{ key: '2026-09', count: 0, label: 'September 2026' }])
  })
})

