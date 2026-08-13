import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { renderMessageBody, stripMarkup } from './richText'

const wrap = (nodes) => render(<MemoryRouter>{nodes}</MemoryRouter>)

describe('renderMessageBody', () => {
  it('does not execute or linkify javascript: URLs (only http/https become links)', () => {
    const { container } = wrap(renderMessageBody('click javascript:alert(1) now'))
    // No anchor should be created for a javascript: pseudo-URL.
    expect(container.querySelector('a')).toBeNull()
    // The text is rendered verbatim (React escapes it), not as HTML.
    expect(container.textContent).toContain('javascript:alert(1)')
  })

  it('linkifies real URLs with safe rel attributes', () => {
    const { container } = wrap(renderMessageBody('see https://tryp.com'))
    const a = container.querySelector('a')
    expect(a).not.toBeNull()
    expect(a.getAttribute('href')).toBe('https://tryp.com')
    expect(a.getAttribute('rel')).toContain('noopener')
  })

  it('only applies markdown for rich (admin) messages', () => {
    const plain = wrap(renderMessageBody('**hi**', { rich: false }))
    expect(plain.container.querySelector('strong')).toBeNull()
    const rich = wrap(renderMessageBody('**hi**', { rich: true }))
    expect(rich.container.querySelector('strong')).not.toBeNull()
  })

  // The two real messages sitting in #general were written by holding bold
  // across a line break, so the run closed on a line of its own. They must read
  // as bold text, not as a row of asterisks.
  it('heals a bold run that spans a line break', () => {
    const { container } = wrap(
      renderMessageBody('**Hey guys, just 7 days left!\n**\nThe leaderboard is open', { rich: true }),
    )
    expect(container.textContent).not.toContain('*')
    const strong = container.querySelector('strong')
    expect(strong.textContent).toBe('Hey guys, just 7 days left!')
  })

  it('heals the doubled marker left in the middle of a message', () => {
    const { container } = wrap(
      renderMessageBody('Hey, just **7 days left!\n****\n**The leaderboard is open', { rich: true }),
    )
    expect(container.textContent).not.toContain('*')
    expect(container.querySelector('strong').textContent).toBe('7 days left!')
    expect(container.textContent).toContain('The leaderboard is open')
  })

  it('leaves an asterisk that is only ever an asterisk alone', () => {
    const { container } = wrap(renderMessageBody('2 * 3 = 6\nand 4 * 5 = 20', { rich: true }))
    expect(container.textContent).toContain('2 * 3 = 6')
    expect(container.textContent).toContain('4 * 5 = 20')
  })

  it('renders all three heading levels as headings, not hashes', () => {
    for (const [md, expected] of [['# One', 'One'], ['## Two', 'Two'], ['### Three', 'Three']]) {
      const { container } = wrap(renderMessageBody(md, { rich: true }))
      expect(container.textContent).toBe(expected)
      expect(container.querySelector('.font-bold, .font-semibold')).not.toBeNull()
    }
  })
})

describe('stripMarkup', () => {
  it('removes markdown markers for previews', () => {
    expect(stripMarkup('# Heading **bold** *italic*')).toBe('Heading bold italic')
  })

  it('leaves no asterisks behind when a run spanned a line break', () => {
    expect(stripMarkup('**Seven days left!\n**\nGet posting')).not.toContain('*')
  })
})
