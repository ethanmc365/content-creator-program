import { describe, it, expect } from 'vitest'
import { socialHref, linkHref, socialHandle } from './socialLinks'

describe('socialHref', () => {
  it('keeps a full link', () => {
    expect(socialHref('https://www.instagram.com/sam?igsh=x', 'instagram')).toBe('https://www.instagram.com/sam?igsh=x')
  })

  it('turns bare and at-handles into the platform profile (the "creator not found" bug)', () => {
    expect(socialHref('elviajedemartaa', 'instagram')).toBe('https://www.instagram.com/elviajedemartaa/')
    expect(socialHref('@saddnoe', 'instagram')).toBe('https://www.instagram.com/saddnoe/')
    expect(socialHref('@saddnoe_', 'tiktok')).toBe('https://www.tiktok.com/@saddnoe_')
    expect(socialHref('filipapvicente', 'tiktok')).toBe('https://www.tiktok.com/@filipapvicente')
    expect(socialHref('@carmen', 'youtube')).toBe('https://www.youtube.com/@carmen')
  })

  it('keeps dots in an Instagram handle rather than reading it as a domain', () => {
    expect(socialHref('andreasins.dermoestetica', 'instagram')).toBe('https://www.instagram.com/andreasins.dermoestetica/')
  })

  it('adds the scheme to a link typed without one', () => {
    expect(socialHref('instagram.com/travelwithkatb', 'instagram')).toBe('https://instagram.com/travelwithkatb')
    expect(socialHref('www.youtube.com/@x', 'youtube')).toBe('https://www.youtube.com/@x')
  })

  it('gives a TikTok profile its missing @', () => {
    expect(socialHref('tiktok.com/travelwithkatb', 'tiktok')).toBe('https://tiktok.com/@travelwithkatb')
    expect(socialHref('https://www.tiktok.com/@ok', 'tiktok')).toBe('https://www.tiktok.com/@ok')
    expect(socialHref('https://www.tiktok.com/@a/video/1', 'tiktok')).toBe('https://www.tiktok.com/@a/video/1')
    expect(socialHref('https://vm.tiktok.com/ZMabc/', 'tiktok')).toBe('https://vm.tiktok.com/ZMabc/')
  })

  it('never returns a relative path', () => {
    for (const v of ['sam', '@sam', 'instagram.com/sam', 'a b']) {
      for (const p of ['instagram', 'tiktok', 'youtube', 'facebook', 'linkedin', null]) {
        const href = socialHref(v, p)
        if (href) expect(href).toMatch(/^https:\/\//)
      }
    }
  })

  it('returns null for nothing', () => {
    expect(socialHref('', 'instagram')).toBeNull()
    expect(socialHref(null, 'tiktok')).toBeNull()
    expect(socialHref('@', 'tiktok')).toBeNull()
  })
})

describe('linkHref', () => {
  it('fixes a scheme-less website and refuses a word', () => {
    expect(linkHref('myblog.com/trips')).toBe('https://myblog.com/trips')
    expect(linkHref('https://a.io')).toBe('https://a.io')
    expect(linkHref('justaword')).toBeNull()
  })
})

describe('socialHandle', () => {
  it('reads the handle out of every shape a creator saves', () => {
    expect(socialHandle('https://www.tiktok.com/@roxanna.travels?_r=1&_t=ZN', 'tiktok')).toBe('roxanna.travels')
    expect(socialHandle('https://www.instagram.com/yleniatraveling?stkn=MX', 'instagram')).toBe('yleniatraveling')
    expect(socialHandle('traveltipswithme_', 'tiktok')).toBe('traveltipswithme_')
    expect(socialHandle('@ariaknaval', 'tiktok')).toBe('ariaknaval')
    expect(socialHandle('tiktok.com/@juliaafloreesc', 'tiktok')).toBe('juliaafloreesc')
    expect(socialHandle('instagram.com/@juliaflores.viajes', 'instagram')).toBe('juliaflores.viajes')
  })

  it('gives null when there is no account in it', () => {
    expect(socialHandle('https://www.facebook.com/share/19RBQusLR4/?mibextid=wwXIfr', 'facebook')).toBeNull()
    expect(socialHandle('https://vm.tiktok.com/ZN8BovQ3J/', 'tiktok')).toBeNull()
    expect(socialHandle('', 'tiktok')).toBeNull()
    expect(socialHandle(null, 'instagram')).toBeNull()
  })
})
