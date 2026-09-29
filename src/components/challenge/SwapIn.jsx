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

// ONE SHAPE FOR WHATEVER IS IN THE SLOT (29 Sep 2026).
//
// Ethan: "the bonus on the challenge page shows up as running until a certain
// date, and then I click on Leaderboard and it shows the card saying 'Current
// leaderboard' ... they need to all be the same size. Currently the bonus
// points one is slightly bigger, and it just makes the page move slightly."
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
