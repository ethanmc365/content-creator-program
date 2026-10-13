import { describe, it, expect } from 'vitest'
import { authMessage } from './authMessages'

describe('authMessage', () => {
  it('keeps English as it is', () => {
    expect(authMessage('Email is required.')).toBe('Email is required.')
    expect(authMessage('Too many attempts. Please wait 15 minutes and try again.')).toBe('Too many attempts. Please wait 15 minutes and try again.')
    expect(authMessage('Did you mean ana@gmail.com? Check the address and try again.')).toBe('Did you mean ana@gmail.com? Check the address and try again.')
    expect(authMessage('A brand new server message')).toBe('A brand new server message')
    expect(authMessage('')).toBe('')
  })
})
