import { describe, expect, it } from 'vitest'
import {
  FB_REGIONS, facebookCountFor, facebookCoverFrom, facebookIdCandidates, facebookIdFrom,
  facebookTitleCount, isFacebookWall, pluginVideoId, regionOrder,
} from './facebook.ts'

const ID = '1445672320874711'

describe('facebookCountFor', () => {
  it('reads play_count from the block bound to the id', () => {
    const html = `x"associated_video":{"is_live_streaming":false,"id":"${ID}"},"video_view_count":165,"play_count":567,"id":"Zm"y`
    expect(facebookCountFor(html, ID)).toBe(567)
  })

  // The bug that made a readable reel look countless: the first block naming
  // the id is the comment list, and the count sits in a LATER one.
  it('scans every block, not just the first', () => {
    const html =
      `"associated_video":{"broadcast_is_ama_enabled":false,"id":"${ID}"},"comment_list_renderer":{}` +
      `...lots...` +
      `"associated_video":{"is_live_streaming":false,"id":"${ID}"},"video_view_count":226,"play_count":449`
    expect(facebookCountFor(html, ID)).toBe(449)
  })

  it('never takes a recommended video\'s count', () => {
    const html = `"associated_video":{"id":"999999999999"},"play_count":88000`
    expect(facebookCountFor(html, ID)).toBeNull()
  })

  it('falls back to video_view_count when there is no play_count', () => {
    const html = `"associated_video":{"id":"${ID}"},"video_view_count":1200`
    expect(facebookCountFor(html, ID)).toBe(1200)
  })
})

describe('facebookTitleCount', () => {
  it('reads a rounded count as approximate', () => {
    expect(facebookTitleCount('<meta property="og:title" content="5.7K views · 20 reactions | x" />'))
      .toEqual({ views: 5700, approx: true })
  })
  it('reads an exact count under a thousand', () => {
    expect(facebookTitleCount('<meta property="og:title" content="847 views · 3 reactions" />'))
      .toEqual({ views: 847, approx: false })
  })
  it('returns null when the title has no count', () => {
    expect(facebookTitleCount('<meta property="og:title" content="15 reactions | Azores" />')).toBeNull()
  })
})

describe('isFacebookWall', () => {
  it('spots the login redirect and the consent interstitial', () => {
    expect(isFacebookWall('https://www.facebook.com/login/?next=x', '')).toBe(true)
    expect(isFacebookWall('https://m.facebook.com/cookie/consent_prompt/?next_uri=x', '')).toBe(true)
  })
  it('spots a login page by its title', () => {
    expect(isFacebookWall('https://www.facebook.com/reel/1/', '<meta property="og:title" content="Log in or sign up to view" />')).toBe(true)
  })
  it('lets a real reel page through', () => {
    expect(isFacebookWall(`https://www.facebook.com/reel/${ID}/`, '<meta property="og:title" content="15 reactions | Azores" />')).toBe(false)
  })
})

describe('ids', () => {
  it('reads ids off every URL shape that carries one', () => {
    expect(facebookIdFrom(`https://www.facebook.com/reel/${ID}/`)).toBe(ID)
    expect(facebookIdFrom(`https://www.facebook.com/someone/videos/${ID}/`)).toBe(ID)
    expect(facebookIdFrom(`https://www.facebook.com/watch/?v=${ID}`)).toBe(ID)
    expect(facebookIdFrom('https://www.facebook.com/share/r/1BKpq4JCDZ/')).toBeNull()
    expect(facebookIdFrom('https://m.facebook.com/story.php?story_fbid=pfbid02eZ&id=100002021784159')).toBeNull()
  })
  it('takes the video from the embed plugin', () => {
    expect(pluginVideoId(`<a href="/reel/${ID}/?ref=embed_video" target="_blank">`)).toBe(ID)
    expect(pluginVideoId(`<a href="/ciulei.alexandra/videos/${ID}/?ref=embed_video">`)).toBe(ID)
  })
  it('prefers og:url and canonical over stray ids', () => {
    const html = `<a href="/reel/111111111/">rec</a><link rel="canonical" href="https://www.facebook.com/reel/${ID}/" />`
    expect(facebookIdCandidates(html)[0]).toBe(ID)
  })
})

describe('regionOrder', () => {
  it('leads with regions that answered and keeps every region once', () => {
    const order = regionOrder(['us-east-1', 'eu-west-2'])
    expect(order.slice(0, 2)).toEqual(['us-east-1', 'eu-west-2'])
    expect(new Set(order).size).toBe(FB_REGIONS.length)
  })
})

// The cover that was always in the page nobody read it from. The entry card
// drew Facebook's own player instead, and a player has a play button on it.
describe('facebookCoverFrom', () => {
  const COVER = 'https://scontent-lhr11-1.xx.fbcdn.net/v/t51.82787-10/819927362_18116985323284709_n.jpg?stp=dst-jpg_tt6&cstp=mx720x1280'

  it("prefers the video's own cover over the share card's picture", () => {
    const html =
      `<meta property="og:image" content="https://scontent.xx.fbcdn.net/share-card.jpg" />` +
      `"preferred_thumbnail":{"image":{"uri":"${COVER.replace(/\//g, '\\/')}"},"width":720}`
    expect(facebookCoverFrom(html)).toBe(COVER)
  })

  it('falls back to og:image, entity-decoded', () => {
    const html = '<meta property="og:image" content="https://scontent.xx.fbcdn.net/v/a.jpg?a=1&amp;b=2" />'
    expect(facebookCoverFrom(html)).toBe('https://scontent.xx.fbcdn.net/v/a.jpg?a=1&b=2')
  })

  // This function reads a page off the internet and hands back a URL something
  // else will fetch. A cover that is not on Facebook's CDN is not the cover.
  it('refuses a cover that is not on fbcdn', () => {
    expect(facebookCoverFrom('<meta property="og:image" content="https://evil.example/x.jpg" />')).toBeNull()
    expect(facebookCoverFrom('<meta property="og:image" content="http://scontent.xx.fbcdn.net/x.jpg" />')).toBeNull()
    expect(facebookCoverFrom('<meta property="og:image" content="https://fbcdn.net.evil.example/x.jpg" />')).toBeNull()
  })

  it('says nothing when the page carries no picture', () => {
    expect(facebookCoverFrom('<html><title>Log in to Facebook</title></html>')).toBeNull()
  })
})
