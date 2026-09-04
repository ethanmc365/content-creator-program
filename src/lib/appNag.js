// ONE ASK PER APP OPEN, WHOEVER GETS THERE FIRST.
//
// There are three things the app may want from a creator the moment they open
// it: put us on your home screen, turn notifications on, and give us your bank
// details. Every one of them is reasonable on its own and all three at once is
// an app that will not let you in.
//
// This is the same shape as `lib/bootLoader`: a claim, held for the lifetime of
// this app open, that stops the second and third dialogs from appearing. It is
// `sessionStorage` rather than a module variable so it survives the page being
// reloaded within the same session (a deploy reload, a pull-to-refresh) - which
// is what "one per open" has to mean, or a creator who refreshes gets asked
// again.
//
// PRIORITY IS DELIBERATE AND IT IS NOT THE ORDER THEY WERE BUILT IN:
//
//   1 install        - on iOS, notifications DO NOT WORK AT ALL until the app
//                      is on the home screen, so asking for notifications first
//                      is asking for something that cannot be granted.
//   2 notifications  - the thing that brings them back when a brief goes live.
//   3 bank details   - the thing that costs them money later, but only after
//                      they have won something, so it can wait a day.
//
// A prompt that decides not to show must NOT claim, or it blocks the next one
// for the rest of the session.

const KEY = 'tryp_nag_open'

/** Try to claim this app open for `who`. True if nothing else has asked yet. */
export function claimNag(who) {
  try {
    const held = sessionStorage.getItem(KEY)
    if (held && held !== who) return false
    sessionStorage.setItem(KEY, who)
    return true
  } catch {
    // Private mode: no storage, so no coordination is possible. Letting the
    // first caller through is better than blocking all of them.
    return true
  }
}

/** Has anything already asked this app open? */
export function nagClaimed() {
  try { return !!sessionStorage.getItem(KEY) } catch { return false }
}

/** Release the claim - used when a prompt is dismissed and wants to let the
 *  NEXT open ask again rather than holding the slot for ever. The slot itself
 *  stays claimed for this open; this is only for tests and for a prompt that
 *  decides, after claiming, that it has nothing to say. */
export function releaseNag(who) {
  try {
    if (sessionStorage.getItem(KEY) === who) sessionStorage.removeItem(KEY)
  } catch { /* private mode */ }
}


// ------------------------------------------------------- the walkthrough ---
//
// THE WALK IS AN INTERRUPTION TOO, AND IT OUTRANKS ALL THREE.
//
// It asks for notifications itself, on its own step, with its own explanation
// and its own gate - so the notifications MODAL appearing over the top of it is
// the same question asked twice in different words, with a scrim between the
// creator and the walk they were following.
//
// `profile.tour_completed_at` cannot answer this. It says "have they ever
// finished it", which is false for somebody re-running it from Settings and,
// more importantly, RACES on a new account: the prompt's effect and the tour's
// auto-start both fire on the profile landing, and which one wins is a matter
// of milliseconds. This is the live fact instead - the same module-channel
// shape as lib/chatChrome - so whoever arrives second sees the truth.
let tourOn = false
const tourSubs = new Set()

export function setTourRunning(on) {
  if (tourOn === on) return
  tourOn = on
  for (const fn of [...tourSubs]) fn()
}

export function tourRunning() { return tourOn }

export function onTourRunning(fn) {
  tourSubs.add(fn)
  return () => tourSubs.delete(fn)
}
