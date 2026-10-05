import { describe, it, expect } from 'vitest'
import { Suspense, act, Component } from 'react'
import { createRoot } from 'react-dom/client'
import { lazyRoute } from './lazyRoute'

globalThis.IS_REACT_ACT_ENVIRONMENT = true

class Catch extends Component {
  state = { err: null }
  static getDerivedStateFromError(err) { return { err } }
  render() { return this.state.err ? <p>crashed: {this.state.err.message}</p> : this.props.children }
}

// A deploy during a session makes Vite's preload helper SWALLOW the failure when main.jsx has preventDefault()ed `vite:preloadError`: the dynamic
// import then resolves with undefined and React reads `undefined.default` - "Cannot read properties of undefined (reading 'default')" on
// /milestones and /admin/videos (5 Oct 2026). A resolved-undefined module must wait for the reload, never reach React.
describe('lazyRoute', () => {
  it('never hands React an undefined module: it stays on the fallback instead of crashing', async () => {
    const Page = lazyRoute(() => Promise.resolve(undefined))
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => {
      root.render(<Catch><Suspense fallback={<p>loading</p>}><Page /></Suspense></Catch>)
    })
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    expect(host.textContent).toBe('loading')
    root.unmount()
  })

  it('still renders a normal module', async () => {
    const Page = lazyRoute(() => Promise.resolve({ default: () => <p>hello</p> }))
    const host = document.createElement('div')
    const root = createRoot(host)
    await act(async () => { root.render(<Suspense fallback={<p>loading</p>}><Page /></Suspense>) })
    await act(async () => { await new Promise((r) => setTimeout(r, 20)) })
    expect(host.textContent).toBe('hello')
    root.unmount()
  })
})
