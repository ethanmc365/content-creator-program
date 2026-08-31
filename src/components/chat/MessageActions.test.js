import { describe, it, expect } from 'vitest'
import { reactorTitle } from './MessageActions'

// The hover tooltip on a reaction chip. It went missing when the rooms and the
// DMs were merged onto one component: the merged chip carried the emoji, the
// count and whether it was mine, and dropped the names.
describe('reactorTitle', () => {
  it('names one person', () => {
    expect(reactorTitle(['Ana'], 1)).toBe('Ana reacted')
  })

  it('joins two with "and"', () => {
    expect(reactorTitle(['Ana', 'Ben'], 2)).toBe('Ana and Ben reacted')
  })

  it('joins three without repeating the last one', () => {
    expect(reactorTitle(['Ana', 'Ben', 'Chi'], 3)).toBe('Ana, Ben and Chi reacted')
  })

  it('summarises beyond three', () => {
    expect(reactorTitle(['Ana', 'Ben', 'Chi', 'Dee'], 4)).toBe('Ana, Ben, Chi and 1 more reacted')
    expect(reactorTitle(['Ana', 'Ben', 'Chi', 'Dee', 'Eli'], 5)).toBe('Ana, Ben, Chi and 2 more reacted')
  })

  // Names can be missing - a reaction from somebody whose profile did not come
  // back with the thread. A count still beats an empty tooltip.
  it('falls back to a count when no names came through', () => {
    expect(reactorTitle([], 3)).toBe('3 reactions')
    expect(reactorTitle(undefined, 1)).toBe('1 reaction')
    expect(reactorTitle([null, undefined], 2)).toBe('2 reactions')
  })
})
