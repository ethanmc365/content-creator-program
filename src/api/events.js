// The calendar: events, RSVPs, reminders, polls, ratings and suggestions: the Supabase tables and functions this area owns. Pages call these instead of naming
// tables, so a schema rename or a backend move is a change in this folder. Each accessor returns the same query
// builder / `{ data, error }` as before.
import { supabase } from '../lib/supabase'

export const makeEventsApi = (db = supabase) => ({
  eventPollSlots: () => db.from('event_poll_slots'),
  eventPollVotes: () => db.from('event_poll_votes'),
  eventPolls: () => db.from('event_polls'),
  eventRatings: () => db.from('event_ratings'),
  eventReminders: () => db.from('event_reminders'),
  eventRsvps: () => db.from('event_rsvps'),
  eventSuggestions: () => db.from('event_suggestions'),
  events: () => db.from('events'),
  myCalendarToken: (args, opts) => db.rpc('my_calendar_token', args, opts),
  rotateCalendarToken: (args, opts) => db.rpc('rotate_calendar_token', args, opts),
  /** A function in this area chosen at run time. */
  call: (fn, args, opts) => db.rpc(fn, args, opts),
})

export const eventsApi = makeEventsApi()
