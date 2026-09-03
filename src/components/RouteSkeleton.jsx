import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useBootLoaderSlot } from '../lib/bootLoader'
import { Skeleton } from './ui'

/**
 * THE SHAPE OF THE PAGE THAT IS ARRIVING, NOT A LOADING SCREEN OVER THE APP -
 * AND ONLY WHEN THERE IS ACTUALLY SOMETHING TO WAIT FOR.
 *
 * Ethan, on a phone: "when clicking between tabs and pages it temporarily
 * flashes up the loading screen which looks bad; when it's loading, rather than
 * show this it should just show the loading shell of the cards etc."
 *
 * He is describing two separate things going wrong at once, and both of them
 * are settled by WHERE the Suspense boundary sits rather than by what it draws.
 *
 * Every route below the first screen is code-split, so tapping a tab suspends
 * while its chunk arrives. The only boundary in the app was in App.jsx, ABOVE
 * `<AppLayout>` - so suspending unmounted the header, the tab bar and the page
 * together and replaced the entire screen with a centred plane and the word
 * "Loading". On a phone, where the tab bar is the thing you just pressed,
 * watching the whole app disappear for 200ms reads as a crash, not as progress.
 *
 * So the boundary moved INSIDE the layout, around `<Outlet/>` (see AppLayout).
 * The chrome now stays exactly where it is - the tab you pressed stays lit, the
 * header never moves - and only the content area changes.
 *
 * THE GRACE PERIOD, AND WHY THE FLASH SURVIVED ALL THAT (3 Sep 2026)
 *
 * Ethan, after the above shipped: "clicking from worldwide to challenges to
 * rooms, I get a loading screen which briefly flashes up and then the page
 * loads. Because this page is loading in split seconds there is no need for
 * that loading screen to flash up at all - only if something is actually
 * loading for a long time."
 *
 * He is right, and it is the last thing nobody had questioned: a Suspense
 * fallback renders on the FIRST frame of the suspension, however short the
 * suspension turns out to be. A warm chunk resolves in 30-80ms, so the
 * skeleton appeared and vanished inside three frames - and a block of grey
 * that exists for three frames is not progress, it is a flicker. Replacing a
 * plane with a skeleton made the flicker better-looking; it did not stop it
 * being a flicker.
 *
 * So nothing is drawn for GRACE_MS. Under it - which is nearly every
 * navigation on a warm cache - the page simply appears and no loading state is
 * ever seen. Over it, the skeleton comes up and stays up, which is the case it
 * was designed for: a cold chunk on a phone on mobile data.
 *
 * WHY NOT LONGER. Past about 200ms an unexplained frozen screen reads as a
 * dropped tap, and people press again. 160ms is comfortably above a warm chunk
 * and comfortably below "did that work?".
 *
 * WHILE THE BOOT LAYER IS UP THIS DRAWS NOTHING, and holds that layer up until
 * it unmounts, exactly like AppLoader. A cold boot is the one case where the
 * screen genuinely is empty and `index.html`'s own loader is already on it; two
 * loaders at two vertical centres is the photograph that lib/bootLoader.js
 * exists to prevent, and a skeleton underneath it would be the same bug.
 */
const GRACE_MS = 160

// THE SKELETON IS SHAPED LIKE THE PAGE THAT IS COMING.
//
// A grid of three cards is right for a directory and wrong for a conversation,
// and the point of a skeleton is that the thing which lands is the shape you
// were already looking at. Matching on the path is crude but it is the only
// thing known about a route whose code has not arrived yet - and being roughly
// right beats being confidently generic.
function shapeFor(pathname) {
  if (/^\/(rooms|messages|global\/chat|c\/[^/]+\/chat)/.test(pathname)) return 'thread'
  if (/^\/(creators|connections|leaderboard|flights\/community)/.test(pathname)) return 'list'
  return 'cards'
}

export default function RouteSkeleton() {
  const visible = useBootLoaderSlot()
  const { pathname } = useLocation()
  // The grace period. `ready` starts false on every fresh suspension because
  // React mounts a new fallback each time.
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setReady(true), GRACE_MS)
    return () => clearTimeout(t)
  }, [])

  if (!visible || !ready) return null

  const shape = shapeFor(pathname)
  return (
    <div className="page" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {/* The page header: a title and its line of explanation. */}
      <div className="space-y-3">
        <Skeleton className="h-8 w-52 rounded-lg" />
        <Skeleton className="h-4 w-72 max-w-full rounded" />
      </div>

      {shape === 'thread' ? (
        // A conversation fills upwards from a composer, so its placeholder is
        // bubbles of uneven width alternating sides, not a grid.
        <div className="mt-8 space-y-4">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className={i % 2 ? 'flex justify-end' : 'flex items-end gap-2'}>
              {i % 2 === 0 && <Skeleton className="h-8 w-8 shrink-0 rounded-full" />}
              <Skeleton
                className="h-12 rounded-2xl"
                style={{ width: `${[62, 44, 70, 38, 55][i]}%` }}
              />
            </div>
          ))}
        </div>
      ) : shape === 'list' ? (
        <div className="mt-8 space-y-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-3 rounded-xl border border-gray-100 p-3">
              <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-1/3 rounded" />
                <Skeleton className="h-3 w-1/2 rounded" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        // Cards. Three is enough to say "a list is coming" without promising a
        // particular number, and the last one is shorter so the block does not
        // read as a solid grey slab.
        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-6 lg:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card space-y-4">
              <div className="flex items-center gap-3">
                <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-2">
                  <Skeleton className="h-4 w-2/3 rounded" />
                  <Skeleton className="h-3 w-1/3 rounded" />
                </div>
              </div>
              <Skeleton className="h-3 w-full rounded" />
              <Skeleton className={i === 2 ? 'h-3 w-1/3 rounded' : 'h-3 w-4/5 rounded'} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
