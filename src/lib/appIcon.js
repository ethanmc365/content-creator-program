// WHICH ICON THIS DEVICE PUTS ON THE HOME SCREEN.
//
// BE HONEST ABOUT WHAT THIS CAN AND CANNOT DO, because the difference is the
// whole feature. There is no web API for changing an icon that is already on
// somebody's home screen. iOS reads <link rel="apple-touch-icon"> once, at the
// instant the reader taps Add to Home Screen, copies the image, and never looks
// at the page again; Android does the same with the manifest. A native app can
// call setAlternateIconName. A web app has nothing of the sort, and no amount
// of DOM rewriting after the fact will reach the icon already sitting on the
// springboard.
//
// What we CAN do, and what this does, is decide which image is on offer at the
// moment of the NEXT add: rewrite the apple-touch-icon href and point
// <link rel="manifest"> at a per-variant manifest whose icons array differs.
// The Settings card says so in as many words and gives the three steps, because
// a picker that appears to do nothing is worse than no picker.
//
// PER DEVICE, SO localStorage AND NOT THE PROFILE. The home screen in question
// is this phone's. Syncing the choice to the account would mean an icon chosen
// on a work laptop quietly deciding what a personal phone installs.

const KEY = 'tryp-app-icon'

/**
 * The default is the shipped icon and its files are never regenerated: it is
 * what everybody already has, and a "choice" that redraws the icon somebody did
 * not ask to change is a regression wearing a feature's clothes.
 */
export const APP_ICONS = [
  {
    key: 'classic',
    label: 'Classic',
    apple: '/apple-touch-icon-v4.png',
    manifest: '/manifest.webmanifest',
  },
  {
    key: 'mono',
    label: 'Minimal',
    apple: '/icons/mono/apple-touch-icon.png',
    manifest: '/icons/mono/manifest.webmanifest',
  },
  {
    key: 'plane',
    label: 'Plane',
    apple: '/icons/plane/apple-touch-icon.png',
    manifest: '/icons/plane/manifest.webmanifest',
  },
  {
    key: 'midnight',
    label: 'Midnight',
    apple: '/icons/midnight/apple-touch-icon.png',
    manifest: '/icons/midnight/manifest.webmanifest',
  },
]

export const DEFAULT_APP_ICON = APP_ICONS[0].key

// THE CHOICE HAS TO SURVIVE A FRESH TAB, BECAUSE THAT IS THE WHOLE FLOW.
//
// Re-adding a home-screen shortcut means removing the old one and opening the
// site again, and "again" is often a new tab typed by hand or pasted from a
// message. localStorage does carry across tabs in the same browser, but it does
// NOT carry if the person pastes the link into a different browser, or opens it
// from a message that launches an in-app webview - and both of those are common
// enough that the instructions cannot rely on it.
//
// So the link the card hands over names the icon: `?icon=plane`. Read once on
// boot, it re-selects that icon and stores it, which makes the pasted URL
// self-contained.
// AND THE INSTALLED APP'S OWN start_url CARRIES IT TOO.
//
// THE BUG THIS FIXES. Ethan: "it should show the correct icons - for example
// I'm currently on the minimal icon, but it's showing that the classic one is
// selected for me."
//
// The choice lives in localStorage, and an installed home-screen web app gets
// its OWN storage container - it does not share Safari's. So somebody who
// picked Minimal in the browser, installed the app and then opened Settings
// inside the app was reading an empty container and being told, correctly for
// that container and wrongly for their phone, that they were on Classic.
//
// Every variant manifest now has `"start_url": "/home?icon=<key>"`, so the
// installed app announces which icon it was installed with on every launch and
// `main.jsx` stores it. The picker then agrees with the home screen, because
// the home screen is what told it.
export const APP_ICON_PARAM = 'icon'

/** The icon named in the current URL, if it names a real one. */
export function iconFromUrl(search = typeof window !== 'undefined' ? window.location.search : '') {
  try {
    const key = new URLSearchParams(search).get(APP_ICON_PARAM)
    return APP_ICONS.some((v) => v.key === key) ? key : null
  } catch {
    return null
  }
}

export function iconVariant(key) {
  return APP_ICONS.find((v) => v.key === key) || APP_ICONS[0]
}

/** The stored choice, falling back to the shipped icon. */
export function getAppIcon() {
  try {
    const saved = localStorage.getItem(KEY)
    return APP_ICONS.some((v) => v.key === saved) ? saved : DEFAULT_APP_ICON
  } catch {
    // Private browsing can throw on read. The default is always a safe answer.
    return DEFAULT_APP_ICON
  }
}

function head(rel) {
  let el = document.head.querySelector(`link[rel="${rel}"]`)
  if (!el) {
    el = document.createElement('link')
    el.rel = rel
    document.head.appendChild(el)
  }
  return el
}

/**
 * Point the install hints at the chosen variant. Safe to call on every boot;
 * with the default selected it writes back exactly what index.html already has.
 */
export function applyAppIcon(key = getAppIcon()) {
  const v = iconVariant(key)
  head('apple-touch-icon').setAttribute('href', v.apple)
  // THE MANIFEST LINK IS REPLACED, NOT EDITED. Browsers parse the manifest when
  // the link is inserted; changing the href in place is not reliably treated as
  // a new document, so the old icons array can survive the swap.
  const old = document.head.querySelector('link[rel="manifest"]')
  const next = document.createElement('link')
  next.rel = 'manifest'
  next.href = v.manifest
  if (old) old.replaceWith(next)
  else document.head.appendChild(next)
  return v
}

/** Save the choice for this device and apply it straight away. */
export function setAppIcon(key) {
  const v = iconVariant(key)
  try { localStorage.setItem(KEY, v.key) } catch { /* nothing to do if storage is blocked */ }
  applyAppIcon(v.key)
  return v
}
