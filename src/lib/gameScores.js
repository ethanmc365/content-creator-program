// "A score was just saved on this device." Fired after every game_scores insert so the leaderboards on the page reload
// at once instead of waiting for a realtime event (7 Oct 2026).
const EVENT = 'tryp:game-score'

export function announceScore() {
  if (typeof window === 'undefined') return
  // A beat later, so a read-after-write never races the insert's commit.
  setTimeout(() => window.dispatchEvent(new Event(EVENT)), 250)
}

export function onScore(cb) {
  if (typeof window === 'undefined') return () => {}
  window.addEventListener(EVENT, cb)
  return () => window.removeEventListener(EVENT, cb)
}
