import { describe, expect, it } from 'vitest'
import { sourceFrom } from './signupSource'

describe('sourceFrom', () => {
  it('prefers utm tags', () => {
    expect(sourceFrom('https://trypcreators.vercel.app/signup?utm_source=Instagram&utm_medium=bio&utm_campaign=es-oct', '')).toMatchObject({ source: 'instagram', medium: 'bio', campaign: 'es-oct', landing: '/signup' })
  })
  it('reads a ref param', () => {
    expect(sourceFrom('https://x.app/?ref=lorenzo', '').source).toBe('lorenzo')
  })
  it('names the referring site', () => {
    expect(sourceFrom('https://x.app/', 'https://l.instagram.com/?u=abc')).toMatchObject({ source: 'instagram', medium: 'referral' })
  })
  it('is direct with nothing to go on', () => {
    expect(sourceFrom('https://x.app/', '').source).toBe('direct')
  })
})

describe('recruiter links', () => {
  it('reads the code from /r/<code> only', async () => {
    const { recruiterCode } = await import('./signupSource')
    expect(recruiterCode('/r/paula')).toBe('paula')
    expect(recruiterCode('/r/Paula-VIP/')).toBe('paula-vip')
    expect(recruiterCode('/signup')).toBeNull()
    expect(recruiterCode('/r/a')).toBeNull()
  })
})
