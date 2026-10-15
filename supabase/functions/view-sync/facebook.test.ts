import { describe, expect, it } from 'vitest'
import {
  FB_REGIONS, facebookCountFor, facebookCoverFrom, facebookIdCandidates, facebookIdFrom,
  facebookTitleCount, isFacebookWall, pluginVideoId, regionOrder, facebookPostedAt, facebookAssociatedVideoId, facebookPostFrom,
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
    // Facebook's redirect from a Page post names the video after a title slug (Roxana, 15 Oct 2026).
    expect(facebookIdFrom('https://www.facebook.com/61566174517085/videos/a-zis-cineva-laponia-de-c%C3%A2nd-%C3%AEmi-doresctravel-travelling/2118608678754384/'))
      .toBe('2118608678754384')
    expect(facebookIdFrom('https://www.facebook.com/61566174517085/videos/2118608678754384/')).toBe('2118608678754384')
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

describe('facebookPostedAt', () => {
  const id = '2399382730868487'
  it('reads publish_time next to our videoId, never another video\'s', () => {
    const html = `"videoId":"111111111111","publish_time":1700000000,` +
      `"videoId":"${id}","isPremiere":false,"liveViewerCount":0,"publish_time":1791644807,"x":1`
    expect(facebookPostedAt(html, id)).toBe('2026-10-10T15:06:47.000Z')
  })
  it('falls back to the story creation_time that links to our video', () => {
    const html = `"story":{"creation_time":1791644884,"unpublished_content_type":"PUBLISHED","url":"https:\\/\\/www.facebook.com\\/1\\/videos\\/${id}\\/"`
    expect(facebookPostedAt(html, id)).toBe('2026-10-10T15:08:04.000Z')
  })
  it('says nothing rather than guessing', () => {
    expect(facebookPostedAt('"videoId":"999","publish_time":1791644807', id)).toBeNull()
  })
})

// 13 Oct 2026: a video shared from a personal profile lands on story.php, whose canonical is a /posts/ URL. The post id
// is not a video id; the video is the one in the post's own associated_video block (beside feedback:<post id>).
describe('facebookAssociatedVideoId', () => {
  const POST = '1095490453382179'
  const VID = '1336792105057199'
  const fb = btoa(`feedback:${POST}`)
  const page = `<link rel="canonical" href="https://www.facebook.com/100087637022931/posts/as%C3%AD-de-simple/${POST}/" />` +
    `"associated_video":{"id":"777777777777777"},"play_count":5000,"id":"other"` +
    `"associated_video":{"broadcast_is_ama_enabled":false,"id":"${VID}"},"comment_list_renderer":{}` +
    `"associated_video":{"is_live_streaming":false,"id":"${VID}"},"video_view_count":19,"play_count":70,"id":"${fb}"}`

  it('takes the video of the post the page is about', () => {
    expect(facebookAssociatedVideoId(page)).toBe(VID)
    expect(facebookIdCandidates(page)[0]).toBe(VID)
    expect(facebookCountFor(page, VID)).toBe(70)
  })

  it('falls back to the id named most often', () => {
    const html = `"associated_video":{"id":"${VID}"},x "associated_video":{"id":"${VID}"},y "associated_video":{"id":"777777777777777"}`
    expect(facebookAssociatedVideoId(html)).toBe(VID)
  })

  it('is null on a page with no video', () => {
    expect(facebookAssociatedVideoId('<html></html>')).toBeNull()
  })
})

describe('facebookPostFrom', () => {
  it('reads the post and owner off a story.php redirect', () => {
    expect(facebookPostFrom('https://www.facebook.com/story.php?story_fbid=1095490453382179&id=100087637022931&rdid=x&share_url=y'))
      .toEqual({ post: '1095490453382179', owner: '100087637022931' })
  })
  it('reads them out of an encoded login next=', () => {
    expect(facebookPostFrom('https://www.facebook.com/login/?next=https%3A%2F%2Fwww.facebook.com%2Fstory.php%3Fstory_fbid%3D1095490453382179%26id%3D100087637022931'))
      .toEqual({ post: '1095490453382179', owner: '100087637022931' })
  })
  it('reads a /posts/ URL with a slug', () => {
    expect(facebookPostFrom('https://www.facebook.com/100087637022931/posts/as%C3%AD-de-simple/1095490453382179/'))
      .toEqual({ post: '1095490453382179', owner: '100087637022931' })
  })
  it('is null for a reel or a pfbid story', () => {
    expect(facebookPostFrom('https://www.facebook.com/reel/1336792105057199/')).toBeNull()
    expect(facebookPostFrom('https://m.facebook.com/story.php?story_fbid=pfbid02eZ&id=100002021784159')).toBeNull()
  })
  it('the post player names its video', () => {
    expect(pluginVideoId('{"video_id":"1336792105057199","x":1}')).toBe('1336792105057199')
  })
})
