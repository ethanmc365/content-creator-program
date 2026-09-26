import { useEffect, useRef, useState } from 'react'

// ONE SLOT, AND WHAT LEAVES IT LEAVES VISIBLY (26 Sep 2026).
//
// The badge beside a challenge's tabs is the live bonus on Brief and Entries
// and the board status on Leaderboard. Ethan wanted it "expanding in and out"
// like the leaderboard card. Entrances are CSS (`board-status`); an exit needs
// the old node kept on screen for the length of its animation, which is all
// this does: when `swapKey` changes it holds the previous children, marks them
// `board-status-out`, and swaps once they have gone.
const OUT_MS = 200

export default function SwapIn({ swapKey, children }) {
  const [shown, setShown] = useState({ key: swapKey, node: children, leaving: false })
  const latest = useRef(children)
  useEffect(() => { latest.current = children })

  useEffect(() => {
    if (swapKey === shown.key) {
      // Same slot, new props: follow them without an animation.
      if (!shown.leaving && shown.node !== children) setShown((s) => ({ ...s, node: children }))
      return undefined
    }
    if (!shown.node) { setShown({ key: swapKey, node: children, leaving: false }); return undefined }
    setShown((s) => ({ ...s, leaving: true }))
    const t = setTimeout(() => setShown({ key: swapKey, node: latest.current, leaving: false }), OUT_MS)
    return () => clearTimeout(t)
  }, [swapKey, children, shown.key, shown.node, shown.leaving])

  if (!shown.node) return null
  return (
    <div key={shown.key} className={shown.leaving ? 'board-status-out contents' : 'contents'}>
      {shown.node}
    </div>
  )
}
