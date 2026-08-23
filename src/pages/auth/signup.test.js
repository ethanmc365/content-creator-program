import { describe, it, expect, vi } from 'vitest'

// Signup pulls in the whole auth world at import time; `passwordScore` is a
// pure function and the only thing under test here.
vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../context/AuthContext', () => ({ useAuth: () => ({}) }))
vi.mock('../../lib/demoMode', () => ({ useDemoMode: () => ({ on: false, params: new URLSearchParams() }) }))

import { passwordScore } from './Signup'

// THE METER EXISTS TO STOP "password1", NOT TO RESIST AN OFFLINE ATTACK ON A
// HASH NOBODY HAS. Length is most of it, because length is most of it.
describe('how strong a password looks', () => {
  it('says nothing about an empty field', () => {
    expect(passwordScore('')).toEqual({ score: 0, label: '' })
    expect(passwordScore()).toEqual({ score: 0, label: '' })
  })

  // Zero blocks and no words under a field somebody is typing into reads as a
  // broken meter rather than as a weak password.
  it('always has something to say once there is something in the field', () => {
    for (const pw of ['a', 'abc', 'Ab1!']) {
      const { score, label } = passwordScore(pw)
      expect(score, pw).toBeGreaterThan(0)
      expect(label, pw).toBeTruthy()
    }
  })

  it('never flatters a password that is under the eight-character floor', () => {
    expect(passwordScore('Ab1!xyz').score).toBe(1)
  })

  it('climbs with length first, then with variety', () => {
    expect(passwordScore('abcdefgh').score).toBe(1)
    expect(passwordScore('abcdefgh1').score).toBe(2)
    expect(passwordScore('abcdefghijkl').score).toBe(2)
    expect(passwordScore('Abcdefghijkl').score).toBe(3)
    expect(passwordScore('Abcdefghijkl1').score).toBe(4)
  })

  it('tops out at four, which is the number of blocks the meter draws', () => {
    expect(passwordScore('A very Long passphrase 42!').score).toBe(4)
    expect(passwordScore('A very Long passphrase 42!').label).toBe('Strong')
  })
})
