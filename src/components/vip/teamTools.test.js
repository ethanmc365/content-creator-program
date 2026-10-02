import { describe, expect, it } from 'vitest'
import { parseHistory } from './teamTools'

describe('parseHistory (past months pasted into the CPM sheet)', () => {
  it('reads comma-space, tab and semicolon lines, ISO and short month names', () => {
    const { rows, bad } = parseHistory('Nadia, 2026-08, 481437, 120.36\nMary, Aug 26, 45,200, 11.30, 0.25\nEva\t2026-07\t21806\nNoeta;sep 26;42.106;10,52')
    expect(bad).toEqual([])
    expect(rows).toEqual([
      { name: 'Nadia', year: 2026, month: 8, views: 481437, earned: 120.36, cpm: null },
      { name: 'Mary', year: 2026, month: 8, views: 45200, earned: 11.3, cpm: 0.25 },
      { name: 'Eva', year: 2026, month: 7, views: 21806, earned: null, cpm: null },
      { name: 'Noeta', year: 2026, month: 9, views: 42106, earned: 10.52, cpm: null },
    ])
  })
  it('reports lines it cannot read and skips blanks', () => {
    const { rows, bad } = parseHistory('\nJust a name\nAna, someday, 10')
    expect(rows).toEqual([])
    expect(bad).toEqual(['Just a name', 'Ana, someday, 10'])
  })
  it('reads Spanish month names', () => {
    expect(parseHistory('Leyre, dic 25, 1000').rows[0]).toMatchObject({ year: 2025, month: 12 })
  })
})
