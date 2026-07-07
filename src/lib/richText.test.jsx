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
})

describe('stripMarkup', () => {
  it('removes markdown markers for previews', () => {
    expect(stripMarkup('# Heading **bold** *italic*')).toBe('Heading bold italic')
  })
})
