// Time-zone helpers for the calendar. Every event is stored as an instant
// (timestamptz) and shown in the reader's own zone; `events.timezone` is the
// host's IANA zone, written when the event is created (older events have none).

/** The reader's own IANA zone, as the browser understands it. */
export function viewerZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null } catch { return null }
}

/** "Europe/Lisbon" -> "Lisbon". The last path segment, underscores removed. */
export function shortZoneName(zone) {
  if (!zone) return ''
  return zone.split('/').pop().replace(/_/g, ' ')
}
