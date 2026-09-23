import { Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { lazyRoute } from '../../lib/lazyRoute'
import { PageHeader, Skeleton } from '../../components/ui'
import Icon from '../../components/Icon'
import { pickClass } from '../../lib/pick'

const KitLibrary = lazyRoute(() => import('../../components/admin/kit/KitLibrary'))
const CertificateStudio = lazyRoute(() => import('../../components/admin/kit/CertificateStudio'))
const AwardedList = lazyRoute(() => import('../../components/admin/kit/AwardedList'))

// THE THINGS THE PROGRAMME HANDS A CREATOR TO POST.
//
// Ethan asked for two features and they arrived in the same paragraph for a
// reason: "I created some graphics that say 'I'm officially a Tryp.com Content
// Creator'" and "Certificates for winning challenges... could be super
// beneficial". Both are the programme giving somebody a PICTURE with their
// membership in it, and both are worth more to the programme than they cost,
// because a creator posting one is recruitment the programme did not pay for.
//
// ONE PAGE, THREE TABS, and not three pages in the admin nav. The admin panel
// already has twenty-odd entries; three more for one idea would make it harder
// to find anything. The tabs are the three questions an admin actually has:
// what can creators download, what certificates exist, and who has got one.
const TABS = [
  { key: 'graphics', label: 'Graphics', icon: 'image', hint: 'What creators can download and repost' },
  { key: 'certificates', label: 'Certificates', icon: 'trophy', hint: 'Design them, and decide when they are given' },
  { key: 'awarded', label: 'Awarded', icon: 'check', hint: 'Who has what, and hand one out' },
]

export default function AdminCreatorKit() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.key === params.get('tab')) ? params.get('tab') : 'graphics'
  const current = TABS.find((t) => t.key === tab)

  return (
    <div className="page max-w-6xl">
      <PageHeader
        back={{ to: '/admin', label: 'Admin' }}
        title="Creator kit"
        subtitle="The graphics and certificates creators can put on their stories, their LinkedIn and their portfolio."
      />

      {/* `pick-row` is what stops the hover lift, the scale and the glow being
          clipped on all four edges - see the note on it in index.css. The
          horizontal bleed matches `.page`'s own padding exactly, so the row
          runs to the screen edge on a phone (the cue that says there is more to
          the right) without giving the page a scrollbar. */}
      <div className="pick-row -mx-5 flex gap-2 px-5 sm:-mx-8 sm:px-8" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setParams({ tab: t.key }, { replace: true })}
            className={pickClass(tab === t.key, 'flex shrink-0 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold')}
          >
            <Icon name={t.icon} className="h-4 w-4" />
            {t.label}
          </button>
        ))}
      </div>
      <p className="mb-6 text-sm text-smoke">{current.hint}</p>

      <Suspense fallback={<Skeleton className="h-96 w-full rounded-card" />}>
        {tab === 'graphics' && <KitLibrary />}
        {tab === 'certificates' && <CertificateStudio />}
        {tab === 'awarded' && <AwardedList />}
      </Suspense>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared by the three tabs. Exported from the page rather than a lib because
// they are about THIS screen's data, and a `lib/` module that only one page
// imports is a file nobody can find.
// ---------------------------------------------------------------------------

/** The public URL of a kit asset. The bucket is public, so no signing. */
export function kitUrl(path) {
  if (!path) return null
  return supabase.storage.from('creator-kit').getPublicUrl(path).data.publicUrl
}

/**
 * Upload one graphic into the kit bucket and return its path and dimensions.
 *
 * THE DIMENSIONS ARE MEASURED HERE AND STORED, rather than read off the image
 * when it is displayed. The portfolio shows these in a grid where a story
 * graphic (9:16) and a LinkedIn banner (4:1) sit side by side, and a grid that
 * discovers each tile's shape on load reflows every time one arrives. Knowing
 * the shape before the bytes means the space is reserved.
 *
 * NOT re-encoded. `compressImage` is used everywhere a creator uploads a photo,
 * and it is exactly wrong here: these are finished graphics with type on them,
 * an admin made them at the size they meant, and a 1280px re-encode would make
 * the thing whose whole job is to look good on somebody's story look soft. The
 * bucket cap is 15MB and a story graphic is a fraction of that.
 */
export async function uploadKitImage(file) {
  const dims = await imageSize(file)
  const safe = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
  const path = `${Date.now()}-${safe}`
  const { error } = await supabase.storage.from('creator-kit')
    .upload(path, file, { contentType: file.type || 'image/png', upsert: false })
  if (error) throw error
  return { path, ...dims }
}

function imageSize(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }) }
    // A file we cannot measure still uploads; the grid falls back to a square.
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ width: null, height: null }) }
    img.src = url
  })
}
