// A photo was added or removed. Who needs to know, and why this is an event.
//
// The uploader (TravelGallery) and the board (PhotoBoard) are SIBLINGS on the
// Edit profile page: both read `creator_photos`, neither owns the other, and
// nothing above them holds the list. So uploading a photo left the board a
// photo short until the next full page load, and deleting one left a tile
// pointing at a row that no longer existed. Ethan noticed both.
//
// Threading a callback down from Edit profile would work and would put this
// plumbing in a page that has no interest in whose photos these are. A tiny
// module-level event keeps it between the two components that actually care,
// and it costs nothing when nobody is listening.
//
// Scoped by creator id, because a board can be looking at somebody else's
// photos while you edit your own.
const listeners = new Set()

/** Tell every mounted board that this creator's photos have changed. */
export function photosChanged(creatorId) {
  for (const fn of listeners) {
    try { fn(creatorId) } catch { /* one bad listener must not stop the rest */ }
  }
}

/** Subscribe. Returns the unsubscribe, so it can be returned from an effect. */
export function onPhotosChanged(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
