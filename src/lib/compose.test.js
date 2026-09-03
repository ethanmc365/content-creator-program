import { describe, it, expect } from 'vitest'
import { gmailComposeUrl, mailtoUrl } from './compose'

describe('gmailComposeUrl', () => {
  it('fills every field Gmail reads', () => {
    const url = gmailComposeUrl({
      to: 'creator@example.com',
      subject: 'Your Tryp.com prize',
      body: 'Hi Lucia,\n\nYour invoice is attached.',
    })
    const q = new URL(url).searchParams
    expect(url.startsWith('https://mail.google.com/mail/?view=cm&fs=1&')).toBe(true)
    expect(q.get('to')).toBe('creator@example.com')
    expect(q.get('su')).toBe('Your Tryp.com prize')
    // Newlines have to survive: the body is a letter, not a line.
    expect(q.get('body')).toBe('Hi Lucia,\n\nYour invoice is attached.')
  })

  it('leaves out what it was not given rather than sending empty fields', () => {
    const q = new URL(gmailComposeUrl({ subject: 'Hello' })).searchParams
    expect(q.get('to')).toBe(null)
    expect(q.get('bcc')).toBe(null)
    expect(q.get('su')).toBe('Hello')
  })

  it('escapes an address and a subject that would otherwise break the query', () => {
    const q = new URL(gmailComposeUrl({
      to: 'a+b@example.com',
      subject: 'Prize & payment: 1st place',
    })).searchParams
    // A raw "+" in a query string decodes to a space, which would mail the
    // wrong person; URLSearchParams encodes it.
    expect(q.get('to')).toBe('a+b@example.com')
    expect(q.get('su')).toBe('Prize & payment: 1st place')
  })
})

describe('mailtoUrl', () => {
  it('puts the address in the path and the rest in the query', () => {
    const url = mailtoUrl({ to: 'a+b@example.com', subject: 'Hi', body: 'There' })
    expect(url.startsWith('mailto:a%2Bb%40example.com?')).toBe(true)
    const q = new URLSearchParams(url.split('?')[1])
    expect(q.get('subject')).toBe('Hi')
    expect(q.get('body')).toBe('There')
  })
})
