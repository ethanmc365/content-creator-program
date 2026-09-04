// ADDING THE APP TO A HOME SCREEN.
//
// THE QUESTION THIS ANSWERS: can we require it on mobile before somebody uses
// the platform? Mostly yes, with two real caveats, and they decide the design.
//
//   ANDROID   Chrome fires `beforeinstallprompt`. Capture it and you can show
//             your own button that opens the real install prompt. One tap.
//   IPHONE    There is no such event and there never has been. Installing is
//             Share -> Add to Home Screen, by hand, and NOTHING can trigger it
//             from a page. All we can do is show the steps clearly.
//   BOTH      Whether they are already installed is reliably detectable:
//             `display-mode: standalone`, plus `navigator.standalone` for older
//             iOS. So a gate is enforceable even where the install is not
//             triggerable.
//
// THE TWO CAVEATS, WHICH ARE WHY THIS GATE IS NOT A WALL:
//
//   1. IN-APP BROWSERS CANNOT INSTALL AT ALL. A creator opening a link from
//      Instagram, TikTok or a DM lands in that app's own webview, where there
//      is no Add to Home Screen. Hard-blocking there locks out exactly the
//      people most likely to arrive that way, which on this platform is most of
//      them. They are shown how to open it in a real browser instead.
//   2. Somebody who deletes the icon would be locked out of an account they are
//      already approved for.
//
// So: a full-screen, unmissable, per-platform ask with an escape hatch, rather
// than a block. The one place it is genuinely close to required is iOS push,
// which Apple only permits for an installed app - so the copy leads with that
// rather than with "we would prefer it".

// IS THIS AN INSTALLED APP RATHER THAN A BROWSER TAB?
//
// THE ONE DEFINITION. `lib/canonicalHost` asks the same question to decide
// whether it may move somebody between origins, and getting a different answer
// there would put an installed app back into Safari - see the note in that file
// for the day that happened.
//
// Three display modes, because a home-screen app is not always `standalone`:
// Android sometimes reports `minimal-ui`, and a desktop install can be
// `fullscreen`. `navigator.standalone` is the only one iOS Safari answers, and
// it answers nothing else.
//
// Wrapped, because `matchMedia` throws in some embedded webviews and "I cannot
// tell" must not become an exception on the first line of the app.
export const isStandalone = () => {
  if (typeof window === 'undefined') return false
  try {
    if (window.matchMedia?.('(display-mode: standalone)')?.matches) return true
    if (window.matchMedia?.('(display-mode: fullscreen)')?.matches) return true
    if (window.matchMedia?.('(display-mode: minimal-ui)')?.matches) return true
  } catch { /* exotic webview */ }
  return window.navigator?.standalone === true
}

const ua = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent || '')

export const isIOS = () =>
  /iPad|iPhone|iPod/.test(ua())
  // iPadOS 13+ reports itself as a Mac; a touch-capable "Mac" is an iPad.
  || (/Macintosh/.test(ua()) && typeof document !== 'undefined' && 'ontouchend' in document)

export const isAndroid = () => /Android/.test(ua())

/** Small enough that the installed app is the better experience. */
export const isMobileDevice = () =>
  (isIOS() || isAndroid()) && typeof window !== 'undefined' && window.innerWidth < 820

/**
 * An embedded webview, where Add to Home Screen does not exist.
 *
 * Detected from the user agent, which is a guess and is treated as one: getting
 * this wrong in the cautious direction shows somebody an extra sentence about
 * opening in Safari, and getting it wrong the other way locks them out. So the
 * escape hatch is always present regardless of what this returns.
 */
export const isInAppBrowser = () => {
  const s = ua()
  return /FBAN|FBAV|Instagram|Line\/|Twitter|TikTok|musical_ly|Snapchat|LinkedInApp|Pinterest|WhatsApp/i.test(s)
}

export const browserName = () => (isIOS() ? 'Safari' : 'Chrome')

// The install prompt on Android, captured once at startup because the event
// fires early and only once. `App` calls `watchInstallPrompt()`.
let deferred = null
const listeners = new Set()

export function watchInstallPrompt() {
  if (typeof window === 'undefined') return () => {}
  const onPrompt = (e) => {
    e.preventDefault()
    deferred = e
    listeners.forEach((fn) => fn(true))
  }
  const onInstalled = () => {
    deferred = null
    listeners.forEach((fn) => fn(false))
  }
  window.addEventListener('beforeinstallprompt', onPrompt)
  window.addEventListener('appinstalled', onInstalled)
  return () => {
    window.removeEventListener('beforeinstallprompt', onPrompt)
    window.removeEventListener('appinstalled', onInstalled)
  }
}

export const canPromptInstall = () => !!deferred

export function onInstallPromptChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Open the real Android install prompt. Resolves to 'accepted' | 'dismissed' | 'unavailable'. */
export async function promptInstall() {
  if (!deferred) return 'unavailable'
  try {
    deferred.prompt()
    const { outcome } = await deferred.userChoice
    if (outcome === 'accepted') deferred = null
    return outcome
  } catch {
    return 'unavailable'
  }
}

// THE "THEY SKIPPED IT" FLAG IS GONE (3 Sep 2026).
//
// `skippedInstall` / `skipInstall` / `clearInstallSkip` stored a per-device
// note that somebody had pressed "Continue in the browser for now", and
// `shouldShowInstallGate` lifted the gate for good once it was set. That is
// what made the gate an ask.
//
// Ethan asked for a wall: "they shouldn't be able to enter the app unless they
// follow the steps to add it to their home screen." A wall that remembers being
// walked around is a door, so there is nothing left to remember. The gate now
// asks one question - is this phone running the installed app - and that
// question answers itself correctly every time without any stored state.

// THE ACTUAL TAPS, ON THE ACTUAL PHONE (4 Sep 2026).
//
// Ethan, walking it on his own iPhone: "you've drawn the wrong symbols. First
// off, you have to click the three dots in the bottom right corner. You click
// that, and then you click on the share icon, which is like a square with a
// little arrow coming out of it. Then you press View More, which is a little
// arrow pointing down. And then you click Add to Home Screen, which is like a
// rounded square with a plus in it. From there you click Add in the top right,
// and that is it."
//
// The old iOS list was three steps and every one of them was wrong for a
// current iPhone: Safari's toolbar collapsed into a "..." menu, so there is no
// Share button sitting at the bottom of the screen to press, and Add to Home
// Screen is now behind "View More" rather than a scroll down a sheet. Somebody
// following instructions that do not match what they can see concludes the app
// is broken, not that the instructions are old.
//
// The five iOS steps below are exactly what he described, in his order, with
// the glyph each one actually wears (see components/Icon - `iosShare` and
// `addToHome` were drawn for this). Android's four are Chrome's real path: the
// overflow is a VERTICAL ellipsis in the TOP right (the old copy said "menu in
// the top right" but drew the horizontal iOS dots), and the item reads "Install
// app" on modern Chrome with "Add to Home screen" as the older wording.
//
// BOTH LISTS ARE THE SAME LENGTH ON PURPOSE. Ethan: "when clicking from Android
// to iPhone, the card jumps in size a bit - I would have it always the same
// size." Five and four differ by one row; the card reserves the taller of the
// two (see AddToHomePrompt), so the toggle changes the words and nothing else.
export const IOS_STEPS = [
  { icon: 'dots', text: 'Tap the three dots in the bottom right of Safari' },
  { icon: 'iosShare', text: 'Tap the Share icon, a square with an arrow out of the top' },
  { icon: 'chevronDown', text: 'Tap "View More", the little arrow pointing down' },
  { icon: 'addToHome', text: 'Tap "Add to Home Screen", the square with a plus in it' },
  { icon: 'check', text: 'Tap "Add" in the top right, then open it from your home screen' },
]

export const ANDROID_STEPS = [
  { icon: 'dotsVertical', text: 'Tap the three dots in the top right of Chrome' },
  { icon: 'installApp', text: 'Tap "Add to Home screen"' },
  { icon: 'addToHome', text: 'Choose "Install" in the panel that slides up' },
  { icon: 'check', text: 'Tap "Install" once more to confirm' },
  { icon: 'home', text: 'Open Tryp.com from your home screen' },
]

/** The per-platform steps, written to be followed while looking at a phone. */
export function installSteps() {
  return isIOS() ? IOS_STEPS : ANDROID_STEPS
}
