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
