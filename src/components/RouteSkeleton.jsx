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
 * THE GRACE PERIOD WAS THE WRONG FIX, AND IT MADE IT WORSE (3 Sep 2026)
 *
 * Ethan, after that shipped: "on mobile I don't want the loading screen
 * appearing after every button I click, this issue still persists."
 *
 * The first attempt held this back for 160ms so a warm chunk would show
 * nothing. But "nothing" is not nothing: a Suspense fallback REPLACES the
 * content area, so what it bought was 160ms of empty white between a header and
 * a tab bar. That reads worse than the grey cards it was hiding, and it is
 * still a third screen between two pages.
 *
 * THE REAL FIX IS UPSTREAM AND IT IS NOT IN THIS FILE. Only two of the five
 * bottom tabs are code-split, and App.jsx now fetches both of them while the
 * browser is idle - so pressing a tab resolves synchronously and this component
 * never mounts at all. See `preloadWhenIdle` in lib/lazyRoute.
 *
 * What is left here is the case it was actually written for: a route nobody
 * prefetched, on a slow connection. For that, a skeleton IMMEDIATELY is right -
 * the delay only ever helped the case that no longer happens - and it holds a
 * minimum height so the page does not collapse and shove the tab bar up its own
 * screen while it waits.
 *
 * WHILE THE BOOT LAYER IS UP THIS DRAWS NOTHING, and holds that layer up until
 * it unmounts, exactly like AppLoader. A cold boot is the one case where the
 * screen genuinely is empty and `index.html`'s own loader is already on it; two
 * loaders at two vertical centres is the photograph that lib/bootLoader.js
 * exists to prevent, and a skeleton underneath it would be the same bug.
 */
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

  if (!visible) return null

  const shape = shapeFor(pathname)
  return (
    // `min-h-[70vh]` so the content area keeps its size while it waits. Without
    // it a short skeleton lets the page collapse, the tab bar jumps up the
    // screen and back down, and THAT movement is most of what reads as a flash.
    <div className="page min-h-[70vh]" aria-busy="true" aria-live="polite">
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
