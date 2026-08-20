import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'

// WHICH CLOCK THE CALENDAR IS ON, AND NOTICING WHEN YOU HAVE MOVED.
//
// Every date on this platform is stored as an instant and rendered by the
// browser in the device's zone. That is correct, and it is completely silent
// about itself - which is fine until somebody gets on a plane. Fly Dublin to
// Oslo and every time on the calendar shifts an hour, with nothing anywhere
// saying it has. A creator who set an alarm for a Q&A at 18:00 now has one for
// something that happens at 19:00.
//
// The old answer was to print the HOST's time under every event as a second
// line. The owner killed it: "I think there's no need to show the host time, it
// could just be confusing, always keep everything synced with the local time."
// He is right - a second clock on every card is a permanent tax paid to solve a
// problem that occurs twice a year, and it makes the reader do the arithmetic
// the app was supposed to do.
//
// The right shape is to say something ONCE, at the moment it changes:
//
//   "You are in Norway now. Show times in Oslo time?"   [Change]  [Keep Dublin]
//
// So there are two stored facts, both on `profiles` so they follow somebody
// between their phone and their laptop:
//
//   `timezone`       the zone to render in, or null for "follow this device"
//   `timezone_seen`  the device zone last acknowledged, so the prompt fires
//                    once per move rather than on every visit
//
// AND IT STILL FIRES WHEN THE PREFERENCE IS PINNED. Somebody who chose "always
// Lisbon" in Settings and then lands in Bucharest should still be asked - the
// pin is a preference, not an instruction to stop noticing. That is the owner's
// "even if they choose, if they enter a new timezone the popup should still
// come up when they first click on calendar".

/** The zone this device is actually in, per the browser. */
export function deviceZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { return null }
}

/** "Europe/Lisbon" -> "Lisbon". The last path segment, underscores removed. */
export function zoneCity(zone) {
  if (!zone) return ''
  return String(zone).split('/').pop().replace(/_/g, ' ')
}

/** A short offset label for a zone at an instant, e.g. "GMT+1". */
export function zoneOffsetLabel(zone, at = new Date()) {
  if (!zone) return ''
  try {
    return new Intl.DateTimeFormat('en-GB', { timeZone: zone, timeZoneName: 'short' })
      .formatToParts(new Date(at))
      .find((p) => p.type === 'timeZoneName')?.value || ''
  } catch {
    return ''
  }
}

/** Whole hours `zone` is ahead of `from`, at this instant. Null if unknown. */
export function hoursBetween(zone, from, at = new Date()) {
  if (!zone || !from) return null
  try {
    const there = new Date(new Date(at).toLocaleString('en-US', { timeZone: zone }))
    const here = new Date(new Date(at).toLocaleString('en-US', { timeZone: from }))
    return Math.round((there - here) / 3600000)
  } catch {
    return null
  }
}

/**
 * Every IANA zone the engine knows, for the Settings picker. Falls back to a
 * hand list on the engines that do not implement `supportedValuesOf` - which is
 * most of them until recently, and an empty picker is worse than a short one.
 */
export function allZones() {
  try {
    const list = Intl.supportedValuesOf?.('timeZone')
    if (list?.length) return list
  } catch { /* older engine */ }
  return [
    'Europe/Dublin', 'Europe/London', 'Europe/Lisbon', 'Europe/Madrid', 'Europe/Paris',
    'Europe/Berlin', 'Europe/Rome', 'Europe/Amsterdam', 'Europe/Copenhagen', 'Europe/Oslo',
    'Europe/Stockholm', 'Europe/Helsinki', 'Europe/Bucharest', 'Europe/Athens', 'Europe/Warsaw',
    'Atlantic/Canary', 'Atlantic/Reykjavik', 'America/New_York', 'America/Chicago',
    'America/Denver', 'America/Los_Angeles', 'America/Sao_Paulo', 'Africa/Cairo',
    'Africa/Lagos', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Karachi', 'Asia/Kolkata',
    'Asia/Bangkok', 'Asia/Singapore', 'Asia/Hong_Kong', 'Asia/Tokyo', 'Asia/Seoul',
    'Australia/Perth', 'Australia/Sydney', 'Pacific/Auckland', 'UTC',
  ]
}

/**
 * THE ONE HOOK BOTH THE CALENDAR AND SETTINGS USE.
 *
 * Returns the effective zone, whether it is pinned, and whether the device has
 * moved somewhere the creator has not acknowledged yet.
 */
export function useTimezone(profile) {
  const [pinned, setPinned] = useState(profile?.timezone ?? null)
  const [seen, setSeen] = useState(profile?.timezone_seen ?? null)
  // The device zone, read ONCE per mount into state. Reading it during render
  // is a clock call, which this repo's `react-hooks/purity` rule bans, and it
  // cannot change between two renders of the same page anyway.
  const [device] = useState(() => deviceZone())

  useEffect(() => {
    setPinned(profile?.timezone ?? null)
    setSeen(profile?.timezone_seen ?? null)
  }, [profile?.timezone, profile?.timezone_seen])

  // A MOVE IS "the device says somewhere new AND you have not been asked about
  // it". Not "the device disagrees with the pin" - somebody who deliberately
  // pinned Lisbon while living in Madrid would be asked on every single visit.
  const moved = !!device && !!seen && device !== seen
  // Somebody who has never been asked at all is not "moved", they are new. The
  // first visit records where they are and says nothing.
  const firstTime = !!device && !seen

  const zone = pinned || device

  const save = useCallback(async (nextPinned, opts = {}) => {
    const patch = { timezone: nextPinned ?? null }
    if (opts.ackDevice !== false) patch.timezone_seen = device
    setPinned(nextPinned ?? null)
    if (opts.ackDevice !== false) setSeen(device)
    const { data: { user } = {} } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('profiles').update(patch).eq('id', user.id)
  }, [device])

  // "Keep what I had" still has to record the device zone, or the prompt comes
  // back on the next page load and the answer meant nothing.
  const keep = useCallback(() => save(pinned ?? (seen || device), { ackDevice: true }), [save, pinned, seen, device])
  const change = useCallback(() => save(null, { ackDevice: true }), [save])
  const acknowledge = useCallback(() => save(pinned, { ackDevice: true }), [save, pinned])

  return { zone, device, pinned, seen, moved, firstTime, save, keep, change, acknowledge }
}
