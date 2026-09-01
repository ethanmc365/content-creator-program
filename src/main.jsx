import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { CommunityProvider } from './context/CommunityContext'
import { registerServiceWorker } from './lib/push'
import { initMonitoring } from './lib/monitoring'
import { applyAppIcon, iconFromUrl, setAppIcon } from './lib/appIcon'
import { releaseBootLayer, whenAppLoadersIdle } from './lib/bootLoader'
import { getLocale, loadLocale } from './lib/i18n'
import './index.css'

// Start error monitoring as early as possible (no-op without VITE_SENTRY_DSN).
initMonitoring()

// Point the Add to Home Screen hints at whichever icon this device picked, before
// anything can be added. index.html ships the default, so this is a no-op until
// somebody has actually chosen something else. See lib/appIcon.
//
// `?icon=` WINS, AND IT IS WHY THE INSTALL LINK WORKS. Swapping a home-screen
// icon means deleting the shortcut and adding the site again, and the link the
// Settings card hands over for that names the icon. Honouring it here - and
// STORING it, so the choice survives the visit - is what makes that link work
// when it is pasted into a different browser or opened from a message.
const fromUrl = iconFromUrl()
if (fromUrl) setAppIcon(fromUrl)
else applyAppIcon()

// THE APP STYLESHEET, TURNED BACK ON.
//
// `vite-boot-css.js` rewrites the built <link rel="stylesheet"> into a
// non-blocking preload, because a render-blocking stylesheet in the head means
// the browser paints NOTHING at all - inline boot layer included - until that
// file lands, so the loader could not appear until the app was ready to. Read
// the long note in that plugin; it is the whole reason this function exists.
//
// Promoting it is one property. Waiting for the load before React commits is
// the part that matters: rendering into a document whose CSS has not applied is
// trading a white flash for an unstyled one.
//
// THE TIMEOUT IS NOT OPTIONAL. If the file 404s or the network stalls, `load`
// never fires and a promise with nothing behind it would leave the splash up
// for ever. 1200ms then render anyway - an unstyled app is bad; no app is
// worse. In dev there is no such link at all (Vite injects CSS through the
// module graph), so this resolves immediately and changes nothing.
function promoteAppCss() {
  const links = [...document.querySelectorAll('link[data-app-css]')]
  if (links.length === 0) return Promise.resolve()
  return new Promise((resolve) => {
    let left = links.length
    const tick = () => { left -= 1; if (left <= 0) resolve() }
    setTimeout(resolve, 1200)
    for (const link of links) {
      link.addEventListener('load', tick, { once: true })
      link.addEventListener('error', tick, { once: true })
      link.rel = 'stylesheet'
    }
  })
}

function mount() {
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <BrowserRouter>
        <AuthProvider>
          {/* Inert while the network preview flag is off: it issues no queries, so
              a live UK creator pays nothing for it being mounted here. */}
          <CommunityProvider>
            <App />
          </CommunityProvider>
        </AuthProvider>
      </BrowserRouter>
    </React.StrictMode>
  )
  dismissBoot()
}

// THE LOADER LEAVES ONCE THERE IS SOMETHING BEHIND IT.
//
// index.html paints `#boot` on the first frame - a white screen with the same
// plane-on-a-runway loader the app draws for itself - so the gap before React
// mounts shows the loader rather than a blank. See the long note there; an
// orange splash was tried here and reverted, because a layer that is not the
// same colour as the canvas under it always has a frame where they disagree.
//
// IT WAITS FOR CONTENT, NOT FOR A TIMER. This used to fade after two animation
// frames or 400ms, whichever came first, which is a guess at when React has
// something to show - and it is the wrong guess, because React commits a
// SUSPENSE FALLBACK that fast. The boot layer therefore left mid-boot with the
// app's own PlaneLoader already underneath it, and the two are centred on
// different boxes, so both were on screen a few dozen pixels apart for the
// length of the fade. Ethan sent the photograph.
//
// `whenAppLoadersIdle` fires when no full-page loader is mounted, so the
// handover is to a real screen. Every such loader draws nothing while `#boot`
// is up (lib/bootLoader.js), so there is never a second one to see even for a
// frame. Two animation frames get us past React's commit; the layout effect
// that claims the slot has run by then, which a passive effect would not have.
//
// TWO TIMERS BEHIND IT, and neither is belt and braces:
//  - 400ms, because requestAnimationFrame DOES NOT RUN IN A BACKGROUND TAB.
//    Somebody who opens the app in a tab they are not looking at would have the
//    frames never fire. This codebase has been bitten by exactly this before,
//    in `Reveal`: never gate anything on rAF alone.
//  - BOOT_MAX_MS, because "wait for a real screen" has to have an end. A
//    profile fetch that never resolves must not leave a white layer over the
//    app for ever; past that point the app's own loader is the right thing to
//    be looking at.
const BOOT_MAX_MS = 6000

function dismissBoot() {
  const boot = document.getElementById('boot')
  if (!boot) return
  let done = false
  const dismiss = () => {
    if (done) return
    done = true
    cancel()
    releaseBootLayer()
    boot.classList.add('gone')
    setTimeout(() => boot.remove(), 360)
  }
  // Whichever of the frame pair and the timer gets here first hands over; the
  // second must not subscribe again, or the first subscription is orphaned and
  // `cancel` no longer refers to it.
  let cancel = () => {}
  let handedOver = false
  const handOver = () => {
    if (handedOver || done) return
    handedOver = true
    cancel = whenAppLoadersIdle(dismiss)
  }
  requestAnimationFrame(() => requestAnimationFrame(handOver))
  setTimeout(handOver, 400)
  setTimeout(dismiss, BOOT_MAX_MS)
}

// THE LANGUAGE IS READY BEFORE ANYTHING RENDERS.
//
// The dictionary is a dynamic import (see lib/i18n - it is 49kB that an English
// reader should never download), so it has to be awaited somewhere. Here,
// beside the stylesheet, is the one place where waiting costs nothing: the boot
// layer is already up, the two fetches go out together, and React mounts once
// with the right words rather than mounting in English and re-rendering.
//
// For English this resolves immediately - English is the source, not a
// dictionary - so nobody reading the app in English waits for anything.
Promise.all([promoteAppCss(), loadLocale(getLocale())]).then(mount)

// Register the service worker, then cache the app's actual loaded assets so the
// app can boot with no connection. The SW only precaches the HTML shell (it
// can't know the content-hashed JS/CSS filenames); the page CAN see them in the
// DOM, and writes to the same Cache Storage the SW reads from.
async function precacheAppShell() {
  if (!('caches' in window)) return
  try {
    const urls = new Set([new URL('/', location.origin).href, new URL('/index.html', location.origin).href])
    document
      .querySelectorAll('script[src], link[rel="stylesheet"][href], link[rel="modulepreload"][href]')
      .forEach((el) => {
        const raw = el.src || el.getAttribute('href')
        if (!raw) return
        const u = new URL(raw, location.origin)
        if (u.origin === location.origin) urls.add(u.href.split('#')[0])
      })
    const cache = await caches.open('tryp-cache-v2')
    await Promise.all([...urls].map(async (u) => {
      try {
        if (await cache.match(u)) return
        const res = await fetch(u)
        if (res.ok) await cache.put(u, res.clone())
      } catch { /* skip anything that fails */ }
    }))
  } catch { /* caching is best-effort */ }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    registerServiceWorker()
    // Give the browser a moment to settle, then cache the shell + assets.
    setTimeout(precacheAppShell, 1500)
  })
}
