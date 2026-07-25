// Community dark mode.
//
// We flip a `data-theme="dark"` attribute on <html> and let a scoped CSS layer
// in index.css restyle the app. It is applied ONLY while a community (logged-in)
// page is mounted - see AppLayout - so the public landing / auth pages always
// keep the bright, white-dominant brand palette.
//
// The creator's saved preference (profiles.dark_mode) is the source of truth;
// localStorage is a fast cache so the theme applies instantly on load without
// waiting for the profile fetch (no bright flash before flipping to dark).

import { useEffect, useState } from 'react'

const KEY = 'tryp_dark_mode'

// Is the community shell currently in dark mode? Reads the live attribute rather
// than a cached preference so it's always accurate.
export function isDarkNow() {
  return document.documentElement.getAttribute('data-theme') === 'dark'
}

// Reactive version for components (e.g. the SVG maps) that need to swap
// hard-coded fill colours when the creator toggles the theme. Subscribes to the
// data-theme attribute on <html> so it updates instantly, no reload needed.
export function useIsDark() {
  const [dark, setDark] = useState(() => isDarkNow())
  useEffect(() => {
    const el = document.documentElement
    const sync = () => setDark(el.getAttribute('data-theme') === 'dark')
    const obs = new MutationObserver(sync)
    obs.observe(el, { attributes: true, attributeFilter: ['data-theme'] })
    sync()
    return () => obs.disconnect()
  }, [])
  return dark
}

export function getStoredDark() {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function storeDark(on) {
  try {
    localStorage.setItem(KEY, on ? '1' : '0')
  } catch {
    /* private mode: ignore, preference still lives on the profile */
  }
}

export function applyTheme(on) {
  const el = document.documentElement
  if (on) el.setAttribute('data-theme', 'dark')
  else el.removeAttribute('data-theme')
}

// ---- Theme mode: light / dark -------------------------------------------
// A "match system" option existed briefly but was removed: following the OS
// colour scheme proved unreliable in practice across the browsers/devices
// creators actually use, so the choice is now an explicit light or dark.
// The MODE is a per-device preference (localStorage); the resolved dark
// boolean is mirrored to profiles.dark_mode so a new device has a sensible
// default and the existing dark_mode readers keep working.
const MODE_KEY = 'tryp_theme_mode'

export function getStoredMode() {
  try {
    const m = localStorage.getItem(MODE_KEY)
    // 'system' may still be in localStorage from the old build; treat it as
    // "not set" so those devices fall back to their saved profile preference.
    return m === 'light' || m === 'dark' ? m : null
  } catch {
    return null
  }
}

export function storeMode(mode) {
  try {
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    /* private mode: ignore */
  }
}

// Resolve a mode to the actual dark boolean to apply right now.
export function resolveDark(mode) {
  return mode === 'dark'
}

// The effective mode given the stored preference and, as a fallback for a
// brand-new device, the profile's saved dark_mode boolean.
export function effectiveMode(profileDark) {
  const stored = getStoredMode()
  if (stored) return stored
  return profileDark ? 'dark' : 'light'
}

// ---- The single source of truth for "what theme is showing right now" ----
//
// Theme resolution used to live inside an AppLayout effect. That was fragile:
// it only re-ran when the profile object changed, so a live OS light/dark flip
// never reached the page. It now lives here at module scope, with ONE permanent
// set of OS listeners, and AppLayout just switches it on/off.
//
// `shellActive` keeps dark mode scoped to the community shell - the public
// landing and auth pages must always stay on the bright brand palette.
let shellActive = false
let lastProfileDark = false

/** Re-resolve and apply the theme. Pass the profile's dark_mode when it's known. */
export function syncTheme(profileDark) {
  if (profileDark !== undefined) lastProfileDark = !!profileDark
  if (!shellActive) return
  const dark = resolveDark(effectiveMode(lastProfileDark))
  applyTheme(dark)
  storeDark(dark)
}

/** AppLayout mounts/unmounts the community shell. */
export function setShellActive(on) {
  shellActive = on
  if (on) syncTheme()
  else applyTheme(false)
}


// ---- Reduce motion (device-level, like dark mode) -----------------------
// Lets a creator dim the app's animations/transitions without relying on an OS
// setting. Stored in localStorage (a per-device preference) and applied by
// flipping data-reduce-motion on <html>; a CSS layer in index.css neutralises
// animations/transitions while it's set.
const MOTION_KEY = 'tryp_reduce_motion'

export function getStoredMotion() {
  try {
    return localStorage.getItem(MOTION_KEY) === '1'
  } catch {
    return false
  }
}

export function storeMotion(on) {
  try {
    localStorage.setItem(MOTION_KEY, on ? '1' : '0')
  } catch {
    /* private mode: ignore */
  }
}

export function applyMotion(on) {
  const el = document.documentElement
  if (on) el.setAttribute('data-reduce-motion', '')
  else el.removeAttribute('data-reduce-motion')
}
