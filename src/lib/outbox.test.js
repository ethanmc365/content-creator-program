import { describe, it, expect, beforeEach } from 'vitest'
import {
  enqueueMessage, flushOutbox, queuedFor, retryQueued, dropQueued,
  onOutboxSent, _setOutboxSender, _resetOutbox,
} from './outbox'

// THE FOUR THINGS AN OUTBOX HAS TO GET RIGHT, and each of them is a real bug
// that a queue without a test would ship:
//
//   it sends            the ordinary path, with signal
//   it holds            a network failure keeps the message, it does not eat it
//   it does not double  two flushes racing is how you send the same thing twice
//   it gives up         a message RLS will never accept must stop being retried
//
// The sender is swapped for a stub. There is no network here and there must not
// be one: the interesting cases are all failures, and a test that needs a real
// connection to prove what happens without one is not a test.

const ROW = { channel: 'general', sender_id: 'u1', body: 'hello' }
const enqueue = (body = 'hello') =>
  enqueueMessage({
    scope: 'general',
    table: 'messages',
    row: { ...ROW, body },
    display: { body, sender_id: 'u1', pending: true },
  })

beforeEach(() => { _resetOutbox() })

describe('the outbox', () => {
  it('sends immediately when the send succeeds, and leaves nothing behind', async () => {
    const seen = []
    _setOutboxSender(async (item) => { seen.push(item.row.body); return { data: { id: 'srv1', ...item.row } } })
    enqueue()
    await flushOutbox()
    expect(seen).toEqual(['hello'])
    expect(queuedFor('general')).toHaveLength(0)
  })

  it('hands the surface the real row so the pending bubble can be replaced', async () => {
    _setOutboxSender(async (item) => ({ data: { id: 'srv1', ...item.row } }))
    const landed = []
    onOutboxSent((item, data) => landed.push([item.id, data.id]))
    const queued = enqueue()
    await flushOutbox()
    expect(landed).toHaveLength(1)
    expect(landed[0][0]).toBe(queued.id)
    expect(landed[0][1]).toBe('srv1')
  })

  it('KEEPS the message when nobody answers, and sends it when they do', async () => {
    // A thrown fetch, which is what supabase-js does when the connection dies
    // mid-request. No `code` on it, so this must read as "there was no server"
    // rather than "the server said no".
    _setOutboxSender(async () => { throw new TypeError('Failed to fetch') })
    enqueue('in a tunnel')
    await flushOutbox()
    expect(queuedFor('general')).toHaveLength(1)
    expect(queuedFor('general')[0].failed).toBe(false)

    _setOutboxSender(async (item) => ({ data: { id: 'srv2', ...item.row } }))
    await flushOutbox()
    expect(queuedFor('general')).toHaveLength(0)
  })

  it('does NOT send twice when two flushes race', async () => {
    // 'online' and 'visibilitychange' fire within milliseconds of each other
    // when a phone comes out of a tunnel. If both flushes walk the same queue,
    // the message goes twice.
    let sends = 0
    _setOutboxSender(async (item) => {
      sends += 1
      await new Promise((r) => setTimeout(r, 10))
      return { data: { id: `srv${sends}`, ...item.row } }
    })
    enqueue('once please')
    await Promise.all([flushOutbox(), flushOutbox(), flushOutbox()])
    expect(sends).toBe(1)
    expect(queuedFor('general')).toHaveLength(0)
  })

  it('gives up after three rejections, and only on rejections', async () => {
    // A PostgREST error carries a `code`. Three of those is an opinion that is
    // not going to change, so the message stops being retried and becomes
    // something the reader can see and act on.
    _setOutboxSender(async () => ({ error: { code: '42501', message: 'denied' } }))
    enqueue('never going to land')
    await flushOutbox()
    expect(queuedFor('general')[0].failed).toBe(false)
    await flushOutbox()
    expect(queuedFor('general')[0].failed).toBe(false)
    await flushOutbox()
    expect(queuedFor('general')[0].failed).toBe(true)

    // And a failed item is not retried by an ordinary flush.
    let sends = 0
    _setOutboxSender(async () => { sends += 1; return { error: { code: '42501' } } })
    await flushOutbox()
    expect(sends).toBe(0)
  })

  it('retries a given-up message by hand, and can throw one away', async () => {
    _setOutboxSender(async () => ({ error: { code: '42501' } }))
    const queued = enqueue('rescue me')
    await flushOutbox(); await flushOutbox(); await flushOutbox()
    expect(queuedFor('general')[0].failed).toBe(true)

    _setOutboxSender(async (item) => ({ data: { id: 'srv3', ...item.row } }))
    await retryQueued(queued.id)
    expect(queuedFor('general')).toHaveLength(0)

    _setOutboxSender(async () => { throw new TypeError('Failed to fetch') })
    const doomed = enqueue('bin me')
    await flushOutbox()
    expect(queuedFor('general')).toHaveLength(1)
    dropQueued(doomed.id)
    expect(queuedFor('general')).toHaveLength(0)
  })

  it('keeps each thread to itself', async () => {
    _setOutboxSender(async () => { throw new TypeError('Failed to fetch') })
    enqueue('to the room')
    enqueueMessage({
      scope: 'dm-42', table: 'direct_messages',
      row: { conversation_id: '42', sender_id: 'u1', body: 'to a person' },
      display: { body: 'to a person', pending: true },
    })
    await flushOutbox()
    expect(queuedFor('general')).toHaveLength(1)
    expect(queuedFor('dm-42')).toHaveLength(1)
    expect(queuedFor('general')[0].row.body).toBe('to the room')
  })

  it('stops walking the queue once the connection is plainly gone', async () => {
    // Nothing is gained by trying message four when message one just timed out,
    // and the order they were written in is worth preserving.
    let sends = 0
    _setOutboxSender(async () => { sends += 1; throw new TypeError('Failed to fetch') })
    enqueue('one'); enqueue('two'); enqueue('three')
    await flushOutbox()
    expect(sends).toBe(1)
    expect(queuedFor('general')).toHaveLength(3)
  })
})
