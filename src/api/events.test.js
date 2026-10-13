import { describe, it, expect } from 'vitest'
import { makeEventsApi } from './events'
import { recordingClient } from './recorder.test-helper'

describe('events api', () => {
  it('every accessor names its own table or function', async () => {
    const { client, calls } = recordingClient()
    const api = makeEventsApi(client)
    await api.eventPollSlots()
    await api.eventPollVotes()
    await api.eventPolls()
    await api.eventRatings()
    await api.eventReminders()
    await api.eventRsvps()
    await api.eventSuggestions()
    await api.events()
    await api.myCalendarToken({ x: 1 })
    await api.rotateCalendarToken({ x: 1 })
    expect(calls).toEqual([
      ['from', 'event_poll_slots'],
      ['from', 'event_poll_votes'],
      ['from', 'event_polls'],
      ['from', 'event_ratings'],
      ['from', 'event_reminders'],
      ['from', 'event_rsvps'],
      ['from', 'event_suggestions'],
      ['from', 'events'],
      ['rpc', 'my_calendar_token', { x: 1 }],
      ['rpc', 'rotate_calendar_token', { x: 1 }],
    ])
  })
})
