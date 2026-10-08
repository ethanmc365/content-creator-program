import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import AutoTextarea from './AutoTextarea'

// 8 Oct 2026: typing in About you made the whole phone screen shake. The live box was reset to `height: auto` on
// every keystroke, which shrank the page under a focused caret and made iOS re-scroll. It must measure a twin instead.
describe('AutoTextarea', () => {
  it('never writes height: auto onto the visible box while it measures', () => {
    const writes = []
    const proto = CSSStyleDeclaration.prototype
    const desc = Object.getOwnPropertyDescriptor(proto, 'height')
    const { container, rerender } = render(<AutoTextarea value="one" onChange={() => {}} minRows={3} />)
    const box = container.querySelector('textarea')
    const style = box.style
    Object.defineProperty(style, 'height', {
      configurable: true,
      get() { return desc?.get ? desc.get.call(this) : this.getPropertyValue('height') },
      set(v) { writes.push(v); this.setProperty('height', v) },
    })
    rerender(<AutoTextarea value={'one\ntwo\nthree\nfour'} onChange={() => {}} minRows={3} />)
    expect(writes).not.toContain('auto')
  })

  it('measures with a hidden twin that is not focusable or announced', () => {
    render(<AutoTextarea value="hello" onChange={() => {}} />)
    const twin = [...document.querySelectorAll('textarea')].find((t) => t.getAttribute('aria-hidden') === 'true')
    expect(twin).toBeTruthy()
    expect(twin.tabIndex).toBe(-1)
    expect(twin.style.visibility).toBe('hidden')
  })
})
