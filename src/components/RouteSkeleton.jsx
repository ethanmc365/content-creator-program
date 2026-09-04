import { useLocation } from 'react-router-dom'
import { useBootLoaderSlot } from '../lib/bootLoader'
import { shapeForPath } from '../lib/routeChunks'

/**
 * THE SHAPE OF THE PAGE THAT IS ARRIVING, NOT A LOADING SCREEN OVER THE APP.
 *
 * Ethan, three times now, and the third time is what produced this version:
 * "clicking between pages briefly flashes up the loading screen every time. I
 * don't want this to happen, instead I want a skeleton loader / skeleton
 * screen: the main term for a blank UI preview that COPIES THE SHAPE of the
 * content before it loads."
 *
 * Those last five words are the brief, and they are what the first two attempts
 * missed. Both of them were about WHEN the placeholder appears - move the
 * boundary, then delay the fallback - when the complaint was about WHAT it is.
 * A centred plane and the word "Loading" is a screen; three grey cards on a
 * page that is about to draw a conversation is a different screen. Either way
 * you are looking at a third thing between two pages, and that is what reads as
 * a flash.
 *
 * So there are two halves to the answer and only one of them is in this file:
 *
 *   1  DO NOT SUSPEND. Route chunks are prefetched on idle and, for everything
 *      else, the instant a pointer or a finger touches a link to them. See
 *      lib/routeChunks and lib/prefetchLinks. This is the half that removes the
 *      flash, and after it this component is a rare sight rather than a screen
 *      in the way of every tap.
 *   2  WHEN IT DOES APPEAR, BE THE PAGE. Not a generic card grid: the hub's
 *      wide banner, the thread's alternating bubbles, the directory's rows,
 *      the calendar's month grid, the admin panel's tiles. `shapeForPath`
 *      decides from the path, which is the only thing known about a route whose
 *      code has not arrived.
 *
 * NO GRACE PERIOD, and that was tried too: holding this back for 160ms only
 * swaps a flash of grey for a flash of NOTHING, and an empty content area
 * between a header and a tab bar reads worse than the shape of what is coming.
 * Once the boundary is genuinely rare, drawing immediately is right.
 *
 * `min-h-[70vh]` so the content area keeps its size while it waits. Without it
 * a short skeleton lets the page collapse, the tab bar jumps up the screen and
 * back down, and THAT movement is most of what reads as a flash.
 *
 * WHILE THE BOOT LAYER IS UP THIS DRAWS NOTHING, and holds that layer up until
 * it unmounts, exactly like AppLoader. A cold boot is the one case where the
 * screen genuinely is empty and `index.html`'s own loader is already on it; two
 * loaders at two vertical centres is the photograph lib/bootLoader.js exists to
 * prevent, and a skeleton underneath one would be the same bug.
 */

import PageSkeleton from './PageSkeleton'

export default function RouteSkeleton({ shape: forced }) {
  const visible = useBootLoaderSlot()
  const { pathname } = useLocation()
  if (!visible) return null
  // `min-h-[70vh]` so the content area keeps its size while it waits. Without
  // it a short skeleton lets the page collapse, the tab bar jumps up the screen
  // and back down, and THAT movement is most of what reads as a flash.
  return <PageSkeleton shape={forced || shapeForPath(pathname)} className="page min-h-[70vh]" />
}
