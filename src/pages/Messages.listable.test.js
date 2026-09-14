import { describe, expect, it } from 'vitest'
import { isListableConversation } from './Messages'

// THE PANEL THAT FLASHED UP WHILE A MESSAGE WAS SENDING.
//
// Ethan: "when sending a DM, after I type and press send, it temporarily shows
// the panel with the suggested creator to message while the message is sending,
// then shows the chat again. It should always be showing the chat."
//
// The whole fault is one predicate. `ensureConversation` creates the row BEFORE
// the message is queued, because the outbox needs an id to write into, so for
// the width of a round trip the conversation exists and has no `last_message_at`
// - and this function said such a row is not listable, which it has to for the
// case it was written for (see the empty-thread note in Messages).
//
// The two cases below are the same row a moment apart, and telling them apart is
// the entire fix: a thread with no last message that ARRIVED FROM THE SERVER is
// a thread somebody opened and abandoned, and a thread with no last message that
// THIS PAGE JUST CREATED is a thread somebody is typing into right now.
describe('isListableConversation', () => {
  const draftish = { id: 'c1', kind: 'direct', last_message_at: null }

  it('hides a 1:1 that nobody has ever spoken in', () => {
    expect(isListableConversation(draftish, new Set())).toBe(false)
    expect(isListableConversation(draftish)).toBe(false)
  })

  it('SHOWS one this page just created, before its first message exists', () => {
    expect(isListableConversation(draftish, new Set(['c1']))).toBe(true)
  })

  it('does not confuse one new thread with another', () => {
    expect(isListableConversation(draftish, new Set(['c2']))).toBe(false)
  })

  it('still shows any 1:1 that has been spoken in', () => {
    expect(isListableConversation({ id: 'c1', kind: 'direct', last_message_at: '2026-09-14T00:00:00Z' }, new Set())).toBe(true)
  })

  it('always shows a group, which exists whether or not anyone has posted', () => {
    expect(isListableConversation({ id: 'g1', kind: 'group', last_message_at: null }, new Set())).toBe(true)
  })

  // The cached inbox is strained through this at mount with no set at all. A
  // cache is a record of the past and nothing in it was created a moment ago, so
  // the second argument being absent must keep the old, stricter meaning rather
  // than throwing or letting everything through.
  it('is safe with no set, which is how the page cache is strained', () => {
    expect(() => isListableConversation(draftish)).not.toThrow()
    expect(isListableConversation(null)).toBe(false)
    expect(isListableConversation(undefined, new Set(['c1']))).toBe(false)
  })
})
