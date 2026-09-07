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
//
// -------------------------------------------------------------------------
// ONE AT A TIME IS NOT THE SAME THING AS ONLY ONE (7 Sep 2026).
//
// Ethan: "creators should always be getting these - if they don't have both
// their payment details AND their notifications on, every time they open it
// they should be prompted to do that."
//
// The claim above did the first half of its job and then quietly did something
// nobody intended. A creator with neither notifications on nor bank details
// saved met the notifications modal, dismissed it, and that was the app open
// over: `claimNag('bank-details')` returned false for the rest of the session,
// every session, for ever. So the bank prompt was not merely deprioritised for
// people who had not turned notifications on - it was UNREACHABLE to them, and
// they are exactly the 37 of 45 active creators with no payee on file.
//
// The fix is a queue rather than a lock. The claim still guarantees one dialog
// on screen at a time, which is the thing worth protecting; what changes is
// what happens when that dialog goes away. `finishNag` hands the slot on, and
// the waiting prompts are SUBSCRIBED, so the next one in priority order opens
// in the same app open instead of waiting for the next one.
//
// `releaseNag` (release, but do not wake anybody) is kept for the one caller
// that means it: a prompt that claimed and then found it had nothing to say.

const KEY = 'tryp_nag_open'
const subs = new Set()

function announce() { for (const fn of [...subs]) fn() }

/** Re-run your "should I show?" check when the slot frees up. */
export function onNagChange(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}

/** Try to claim this app open for `who`. True if nothing else is asking. */
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

/** Release the claim quietly. For a prompt that claimed and then found it had
 *  nothing to say, and for tests. Does NOT wake the queue. */
export function releaseNag(who) {
  try {
    if (sessionStorage.getItem(KEY) === who) sessionStorage.removeItem(KEY)
  } catch { /* private mode */ }
}

/** Done asking: free the slot AND tell whoever is waiting. This is what a
 *  dismissed or satisfied dialog calls, so the next thing the creator is
 *  missing gets asked in the same app open. */
export function finishNag(who) {
  releaseNag(who)
  announce()
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
