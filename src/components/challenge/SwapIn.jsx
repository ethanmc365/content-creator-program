import { useEffect, useRef, useState } from 'react'

// ONE SLOT, AND WHAT LEAVES IT LEAVES VISIBLY.
//
// The badge beside a challenge's tabs is the live bonus on Brief and Entries and the board status on Leaderboard. The
// team wanted it "expanding in and out" like the leaderboard card. Entrances are CSS (`board-status`); an exit needs the
// old node kept on screen for the length of its animation, which is all this does: when `swapKey` changes it holds the
// previous children, marks them `board-status-out`, and swaps once they have gone.
const OUT_MS = 120

// ONE SHAPE FOR WHATEVER IS IN THE SLOT.
//
// The two cards had grown their own padding and their own icon sizes - 36px in
// one, 28px in the other - so the row was four pixels taller on two of the
// three tabs and everything below it stepped when you switched. A slot that
// swaps its contents has to be the same height whatever is in it, or the swap
// is a layout shift with an animation on top.
//
// So the SLOT owns the shape and the cards own only their colour and their
// words. A third card added here later cannot reintroduce the bug.
export const SLOT = 'flex w-full min-h-[3.25rem] items-center gap-2.5 rounded-2xl py-2 pl-2.5 pr-4 sm:flex-1'

/** The disc every slot card leads with. Same size, so the row cannot move. */
export const SLOT_ICON = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full'

export default function SwapIn({ swapKey, children }) {
  const [shown, setShown] = useState({ key: swapKey, node: children, leaving: false })
  const latest = useRef(children)
  useEffect(() => { latest.current = children })

  useEffect(() => {
    setShown((previous) => ({ ...previous, leaving: previous.key !== swapKey }))
    const timer = setTimeout(() => setShown({ key: swapKey, node: latest.current, leaving: false }), OUT_MS)
    return () => clearTimeout(timer)
  }, [swapKey])

  const node = shown.key === swapKey && !shown.leaving ? children : shown.node
  if (!node) return null
  return (
    <div key={shown.key} className={shown.leaving ? 'board-status-out contents' : 'contents'}>
      {node}
    </div>
  )
}
