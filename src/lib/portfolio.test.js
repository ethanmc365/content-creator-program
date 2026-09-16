import { describe, it, expect } from 'vitest'
import { slugify, orderedVideos, statsFrom, compactViews, platformsFrom, copyFor, DEFAULT_COPY } from './portfolio'

describe('slugify', () => {
  it('makes a link somebody would type', () => {
    expect(slugify('Roxanna Travels')).toBe('roxanna-travels')
  })
  it('strips accents rather than dropping the letter', () => {
    expect(slugify('Malmö Jönsson')).toBe('malmo-jonsson')
  })
  it('never starts or ends with a dash, which the column check forbids', () => {
    expect(slugify('  !!Sam!!  ')).toBe('sam')
  })
  it('pads a name too short for the column check', () => {
    expect(slugify('Jo').length).toBeGreaterThanOrEqual(3)
  })
  it('falls back rather than producing an empty slug', () => {
    expect(slugify('!!!')).toBe('creator')
    expect(slugify('')).toBe('creator')
  })
  it('adds the suffix a collision needs', () => {
    expect(slugify('Sam Smith', 2)).toBe('sam-smith-2')
  })
  it('stays inside the 40 character limit', () => {
    expect(slugify('a'.repeat(80)).length).toBeLessThanOrEqual(40)
  })
})

describe('orderedVideos', () => {
  const all = [
    { id: 'a', views: 100 }, { id: 'b', views: 9000 }, { id: 'c', views: 500 },
  ]

  it('shows the best work first when nobody has chosen', () => {
    expect(orderedVideos(all, []).map((v) => v.id)).toEqual(['b', 'c', 'a'])
  })

  it('shows exactly what was chosen, in that order, and nothing else', () => {
    // A portfolio that appends "your other good ones" under a hand-picked set
    // is overruling the person whose portfolio it is.
    expect(orderedVideos(all, ['a', 'c']).map((v) => v.id)).toEqual(['a', 'c'])
  })

  it('skips a picked video that no longer exists rather than leaving a hole', () => {
    expect(orderedVideos(all, ['a', 'deleted', 'c']).map((v) => v.id)).toEqual(['a', 'c'])
  })

  it('respects the limit', () => {
    expect(orderedVideos(all, [], 2)).toHaveLength(2)
  })

  it('survives nothing at all', () => {
    expect(orderedVideos()).toEqual([])
  })
})

describe('statsFrom', () => {
  it('counts videos, views and the distinct challenges and markets', () => {
    expect(statsFrom([
      { views: 100, challenge_id: 'x', community_id: 'uk' },
      { views: 200, challenge_id: 'x', community_id: 'es' },
      { views: 300, challenge_id: 'y', community_id: 'uk' },
    ])).toEqual({ videos: 3, views: 600, challenges: 2, markets: 2 })
  })
  it('reads logged_views too, which is what a submission row calls it', () => {
    expect(statsFrom([{ logged_views: 42 }]).views).toBe(42)
  })
  it('treats a missing view count as zero rather than NaN', () => {
    expect(statsFrom([{}, { views: 5 }]).views).toBe(5)
  })
})

describe('compactViews', () => {
  it('counts a media kit in thousands and millions', () => {
    expect([999, 1500, 15000, 2_400_000, 12_000_000].map(compactViews))
      .toEqual(['999', '1.5K', '15K', '2.4M', '12M'])
  })
  it('does not print a pointless .0', () => {
    expect(compactViews(2000)).toBe('2K')
  })
})

describe('platformsFrom', () => {
  const videos = [{ platform: 'TikTok' }, { platform: 'TikTok' }, { platform: 'Instagram' }]

  it('ranks what their entries prove, most-used first', () => {
    expect(platformsFrom(videos, []).map((p) => p.platform)).toEqual(['TikTok', 'Instagram'])
    expect(platformsFrom(videos, [])[0].entries).toBe(2)
  })

  it('adds a platform they typed but never entered from', () => {
    const out = platformsFrom(videos, [{ platform: 'YouTube', handle: '@sam' }])
    expect(out.find((p) => p.platform === 'YouTube')).toMatchObject({ entries: 0, handle: '@sam' })
  })

  it('merges a typed platform onto the proven one instead of listing it twice', () => {
    const out = platformsFrom(videos, [{ platform: 'tiktok', handle: '@sam' }])
    expect(out.filter((p) => p.platform.toLowerCase() === 'tiktok')).toHaveLength(1)
    expect(out[0]).toMatchObject({ platform: 'TikTok', entries: 2, handle: '@sam' })
  })

  it('ignores a blank row from the editor', () => {
    expect(platformsFrom([], [{ platform: '  ' }, {}])).toEqual([])
  })
})

describe('copyFor', () => {
  it('uses what the creator wrote', () => {
    expect(copyFor({ about_title: 'Who I am' }, 'about_title')).toBe('Who I am')
  })

  // A default that reads as a placeholder guarantees a portfolio that says
  // "Add your bio here" on the open web, because most people publish unedited.
  it('falls back to a default that is publishable as it stands', () => {
    expect(copyFor({}, 'about_body')).toBe(DEFAULT_COPY.about_body)
    expect(DEFAULT_COPY.about_body).not.toMatch(/add your|lorem|placeholder|TODO/i)
  })

  it('treats whitespace as unwritten', () => {
    expect(copyFor({ about_title: '   ' }, 'about_title')).toBe(DEFAULT_COPY.about_title)
  })

  it('is blank rather than undefined for a slot with no default', () => {
    expect(copyFor({}, 'nonexistent')).toBe('')
  })
})
