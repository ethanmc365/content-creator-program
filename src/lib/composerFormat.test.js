import { describe, it, expect } from 'vitest'
import { applyFormat } from './composerFormat'

// The rule these tests exist to hold: a heading is a BLOCK and touches the
// current LINE; bold and italic are a RUN and touch the SELECTION. Getting that
// backwards is what made the contentEditable composer turn a whole message into
// a heading, and this is the textarea half of the same feature.
describe('applyFormat', () => {
  it('makes a heading of the caret line only, not the whole message', () => {
    const body = 'first line\nsecond line\nthird line'
    const caret = body.indexOf('second') + 2
    const { value } = applyFormat(body, caret, caret, 'heading')
    expect(value).toBe('first line\n# second line\nthird line')
  })

  it('toggles a heading back off', () => {
    const body = '# already a heading'
    const { value } = applyFormat(body, 5, 5, 'heading')
    expect(value).toBe('already a heading')
  })

  it('wraps only the selection in bold', () => {
    const body = 'make this word bold'
    const start = body.indexOf('word')
    const { value, selStart, selEnd } = applyFormat(body, start, start + 4, 'bold')
    expect(value).toBe('make this **word** bold')
    expect(value.slice(selStart, selEnd)).toBe('word')
  })

  it('unwraps a selection that is already bold', () => {
    const body = 'make this **word** bold'
    const start = body.indexOf('**word**')
    const { value } = applyFormat(body, start, start + 8, 'bold')
    expect(value).toBe('make this word bold')
  })

  it('drops a placeholder when nothing is selected', () => {
    const { value, selStart, selEnd } = applyFormat('', 0, 0, 'italic')
    expect(value).toBe('*italic text*')
    expect(value.slice(selStart, selEnd)).toBe('italic text')
  })

  it('never reaches past the line it started on', () => {
    // A selection spanning two lines still only re-tags the line it starts on:
    // "make this a heading" is a statement about one line.
    const body = 'alpha\nbeta'
    const { value } = applyFormat(body, 0, body.length, 'heading')
    expect(value).toBe('# alpha\nbeta')
  })
})
