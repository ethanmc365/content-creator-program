import { describe, it, expect, beforeAll } from 'vitest'
import { installTranslationGuard, translationDetected } from './translationGuard'

// THE TEST IS THE TRANSLATOR, NOT THE APP.
//
// Reproducing this properly means doing to the DOM the one thing a page
// translator does and React cannot survive: taking a node out from under the
// parent React still believes owns it, and then asking React to update around
// it. Every assertion below is a call React itself makes during a commit -
// `insertBefore` to place a new child, `removeChild` to drop an old one - with
// the reference node moved first.
//
// Without the guard each of these throws `NotFoundError`, which is what the
// three creators got instead of a signup form.
describe('the translation guard', () => {
  beforeAll(() => installTranslationGuard())

  it('appends instead of throwing when the reference node has been reparented', () => {
    const parent = document.createElement('div')
    const thief = document.createElement('div')
    const ref = document.createElement('span')
    parent.appendChild(ref)
    // What a translator does: the text it replaced now lives somewhere else.
    thief.appendChild(ref)

    const fresh = document.createElement('b')
    expect(() => parent.insertBefore(fresh, ref)).not.toThrow()
    expect(fresh.parentNode).toBe(parent)
  })

  it('removes the node from wherever it actually is, not from where it was', () => {
    const parent = document.createElement('div')
    const thief = document.createElement('div')
    const child = document.createElement('span')
    parent.appendChild(child)
    thief.appendChild(child)

    expect(() => parent.removeChild(child)).not.toThrow()
    // The caller meant "this should not be in the document any more", and that
    // is what happened - appending it back to `parent` would be worse than the
    // throw, because the node the translator is managing would come back.
    expect(child.parentNode).toBe(null)
  })

  it('leaves an ordinary insert exactly where it was asked for', () => {
    // The guard must be invisible when no translator is running: React places
    // children by reference constantly and the ORDER is the whole point.
    const parent = document.createElement('div')
    const a = document.createElement('i')
    const c = document.createElement('u')
    parent.append(a, c)
    const b = document.createElement('b')
    parent.insertBefore(b, c)
    expect([...parent.children].map((el) => el.tagName)).toEqual(['I', 'B', 'U'])
  })

  it('still appends on a null reference, which is what null has always meant', () => {
    const parent = document.createElement('div')
    const a = document.createElement('i')
    parent.appendChild(a)
    const b = document.createElement('b')
    parent.insertBefore(b, null)
    expect([...parent.children].map((el) => el.tagName)).toEqual(['I', 'B'])
  })

  it('reports a <font> element as a translator, because nothing here emits one', () => {
    const font = document.createElement('font')
    document.body.appendChild(font)
    expect(translationDetected()).toBe(true)
    font.remove()
  })

  it('is safe to install twice', () => {
    const before = Node.prototype.insertBefore
    installTranslationGuard()
    expect(Node.prototype.insertBefore).toBe(before)
  })
})
