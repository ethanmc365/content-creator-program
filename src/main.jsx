import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import App from './App'
import { AuthProvider } from './context/AuthContext'
import { registerServiceWorker } from './lib/push'
import { initMonitoring } from './lib/monitoring'
import './index.css'

// Start error monitoring as early as possible (no-op without VITE_SENTRY_DSN).
initMonitoring()

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
)

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
