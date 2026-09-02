import { useBootLoaderSlot } from '../lib/bootLoader'
import { Skeleton } from './ui'

/**
 * THE SHAPE OF THE PAGE THAT IS ARRIVING, NOT A LOADING SCREEN OVER THE APP.
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
 * header never moves - and only the content area changes. Once only the content
 * area is changing, a full-page loader is the wrong drawing for it, and the
 * right one is the shape of the page that is about to land.
 *
 * WHILE THE BOOT LAYER IS UP THIS DRAWS NOTHING, and holds that layer up until
 * it unmounts, exactly like AppLoader. A cold boot is the one case where the
 * screen genuinely is empty and `index.html`'s own loader is already on it; two
 * loaders at two vertical centres is the photograph that lib/bootLoader.js
 * exists to prevent, and a skeleton underneath it would be the same bug.
 */
export default function RouteSkeleton() {
  const visible = useBootLoaderSlot()
  if (!visible) return null
  return (
    <div className="page" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      {/* The page header: a title and its line of explanation. */}
      <div className="space-y-3">
        <Skeleton className="h-8 w-52 rounded-lg" />
        <Skeleton className="h-4 w-72 max-w-full rounded" />
      </div>
      {/* Cards. Three is enough to say "a list is coming" without promising a
          particular number, and the last one is shorter so the block does not
          read as a solid grey slab. */}
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
    </div>
  )
}
