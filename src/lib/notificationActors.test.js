import { describe, expect, it } from 'vitest'
import { actorKeys, namePrefixes } from './notificationActors'

describe('actorKeys', () => {
  it('tries the longest name first', () => {
    expect(namePrefixes('Fatelin Jimenez reacted 👍 to your message')).toEqual(['Fatelin Jimenez reacted', 'Fatelin Jimenez', 'Fatelin'])
  })
  it('uses the profile id in a link before any name', () => {
    const id = 'f12c503f-b14b-4c1d-9e0a-0123456789ab'
    expect(actorKeys({ type: 'new_member', title: 'New creator joined', link: `/profile/${id}` })).toEqual({ id, names: [] })
  })
  it('reads a direct message sender from the body', () => {
    const k = actorKeys({ type: 'dm', title: 'New message', body: 'Ethan sent you a message.', link: '/messages/abc' })
    expect(k.names).toContain('Ethan')
  })
})
