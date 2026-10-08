import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { mdToHtml, htmlToMd } from './richEditor'
import { renderNote, noteExcerpt } from './noteMarkdown'
import { headingsOf } from '../components/agreements/AgreementSheet'
import { shelvesFor } from '../components/VideoIdeas'

const IMG = 'https://heuhqqoxyggawuckxocp.supabase.co/storage/v1/object/public/chat-media/u/1.jpg'

describe('images in answers (FAQ, 7 Oct 2026)', () => {
  it('survive the editor round trip as a markdown image line', () => {
    const md = `## Where is it\n\n![](${IMG})\n\nTap **Settings**.`
    const root = document.createElement('div')
    root.innerHTML = mdToHtml(md)
    expect(root.querySelector('figure img').getAttribute('src')).toBe(IMG)
    expect(htmlToMd(root)).toBe(md)
  })
  it('render as a picture and stay out of excerpts', () => {
    const out = renderNote(`![shot](${IMG})`)
    expect(out[0].props.children.props.src).toBe(IMG)
    expect(noteExcerpt(`![shot](${IMG})\nHello`)).toBe('Hello')
  })
  it('only https images are pictures', () => {
    const root = document.createElement('div')
    root.innerHTML = mdToHtml('![x](javascript:alert(1))')
    expect(root.querySelector('img')).toBeNull()
  })
})

describe('agreements', () => {
  it('lists what is inside from the ## headings, without their numbers', () => {
    expect(headingsOf('# T\n\n## 1. Joining\ntext\n## 2. Your content\n')).toEqual(['Joining', 'Your content'])
  })
})

describe('video ideas shelves', () => {
  it('leads with the biggest hits and gives a platform a shelf only with two videos', () => {
    const rows = [
      { id: 'a', views: 60000, platform: 'TikTok' },
      { id: 'b', views: 900000, platform: 'TikTok' },
      { id: 'c', views: 70000, platform: 'Instagram' },
    ]
    const s = shelvesFor(rows)
    expect(s[0].key).toBe('top')
    expect(s[0].rows.map((r) => r.id)).toEqual(['b', 'c', 'a'])
    expect(s.map((x) => x.key)).toContain('TikTok')
    expect(s.map((x) => x.key)).not.toContain('Instagram')
  })
})

describe('quick links in answers (Get Help, 9 Oct 2026)', () => {
  it('a /path link opens inside the app as a button, an https link still opens a new tab', () => {
    const { container } = render(<MemoryRouter>{renderNote('Go to [Payment details](/settings?section=payment) or [the site](https://tryp.com).')}</MemoryRouter>)
    const inApp = container.querySelector('a.quick-link')
    expect(inApp.getAttribute('href')).toBe('/settings?section=payment')
    expect(inApp.getAttribute('target')).toBeNull()
    const out = [...container.querySelectorAll('a')].find((a) => a.textContent === 'the site')
    expect(out.getAttribute('target')).toBe('_blank')
  })
  it('a protocol-relative //host link is not treated as in-app', () => {
    const { container } = render(<MemoryRouter>{renderNote('[x](//evil.example/a)')}</MemoryRouter>)
    expect(container.querySelector('a')).toBeNull()
  })
  it('survives the editor round trip', () => {
    const md = 'Open [Notifications](/settings?section=notifications) now.'
    const root = document.createElement('div')
    root.innerHTML = mdToHtml(md)
    expect(root.querySelector('a').getAttribute('href')).toBe('/settings?section=notifications')
    expect(htmlToMd(root)).toBe(md)
  })
})
