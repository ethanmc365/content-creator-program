// GOING BACK IS NOT ARRIVING.
//
// The page you return to has already been seen: iOS even draws a snapshot of it under your finger during the swipe.
// Replaying its entrance (the panel fade, the rows rising one by one) on release reads as a reload.
//
// So for a short window after a back/forward navigation (popstate), entrance motion is skipped:
//  - `Reveal` mounts already arrived (`isReturnVisit()`), so its rows never sit at opacity 0;
//  - `html[data-nav-return]` zeroes the duration and delay of the CSS entrance animations (index.css). Duration, not
//    `animation: none`: removing the attribute later must not restart anything, and a changed name would, while a
//    longer duration on an animation that has already finished leaves it finished.
// The window ends on the next tap or key, or after 2.5s, so a tab switch or a new message still animates.
let until = 0
let timer = 0

function root() {
  return typeof document !== 'undefined' ? document.documentElement : null
}

function end() {
  until = 0
  clearTimeout(timer)
  root()?.removeAttribute('data-nav-return')
}

export function markReturn() {
  until = Date.now() + 2500
  root()?.setAttribute('data-nav-return', '')
  clearTimeout(timer)
  timer = setTimeout(end, 2500)
}

export function isReturnVisit() {
  return Date.now() < until
}

let installed = false
export function installNavReturn() {
  if (installed || typeof window === 'undefined') return
  installed = true
  // Before React Router's own popstate listener schedules the render, so the returning page mounts with the flag set.
  window.addEventListener('popstate', markReturn, true)
  window.addEventListener('pointerdown', () => { if (until) end() }, true)
  window.addEventListener('keydown', () => { if (until) end() }, true)
}
