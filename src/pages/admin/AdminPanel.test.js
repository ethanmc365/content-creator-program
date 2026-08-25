import { describe, it, expect } from 'vitest'
import { applyOrder, reorder } from './AdminPanel'

// A saved layout is a list of tool ids and nothing else. That is what lets this
// file change - a tool added, a tool removed, a tool renamed - without anybody's
// saved arrangement turning into a broken or half-empty panel. These pin that.
const tools = (...ids) => ids.map((id) => ({ id }))
const ids = (list) => list.map((t) => t.id)

describe('a saved admin panel layout', () => {
  const shipped = tools('a', 'b', 'c', 'd')

  it('puts the tools in the order that admin saved', () => {
    expect(ids(applyOrder(shipped, ['d', 'b', 'a', 'c']))).toEqual(['d', 'b', 'a', 'c'])
  })

  it('keeps the shipped order when nothing has been saved', () => {
    expect(ids(applyOrder(shipped, undefined))).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(applyOrder(shipped, null))).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(applyOrder(shipped, []))).toEqual(['a', 'b', 'c', 'd'])
  })

  // Shipping a new tool must not disturb an arrangement somebody worked out.
  it('appends a tool that was added after the layout was saved', () => {
    expect(ids(applyOrder(tools('a', 'b', 'c', 'NEW'), ['c', 'a', 'b']))).toEqual(['c', 'a', 'b', 'NEW'])
  })

  // And retiring one must not leave a hole or throw.
  it('ignores an id for a tool that no longer exists', () => {
    expect(ids(applyOrder(tools('a', 'c'), ['c', 'GONE', 'a']))).toEqual(['c', 'a'])
  })

  it('is stable for several tools with no saved position', () => {
    expect(ids(applyOrder(tools('a', 'b', 'c', 'd'), ['d']))).toEqual(['d', 'a', 'b', 'c'])
  })
})

describe('dragging one card onto another', () => {
  it('moves the dragged card into the target position, forwards', () => {
    expect(reorder(['a', 'b', 'c', 'd'], 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
  })

  it('moves it backwards too', () => {
    expect(reorder(['a', 'b', 'c', 'd'], 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
  })

  it('does nothing when a card is dropped on itself', () => {
    const before = ['a', 'b', 'c']
    expect(reorder(before, 'b', 'b')).toBe(before)
  })

  it('does nothing rather than corrupting the list when an id is unknown', () => {
    const before = ['a', 'b', 'c']
    expect(reorder(before, 'zz', 'b')).toBe(before)
    expect(reorder(before, 'a', 'zz')).toBe(before)
  })

  it('never loses or duplicates a card', () => {
    const before = ['a', 'b', 'c', 'd', 'e']
    for (const from of before) {
      for (const to of before) {
        const after = reorder(before, from, to)
        expect([...after].sort()).toEqual([...before].sort())
      }
    }
  })
})
