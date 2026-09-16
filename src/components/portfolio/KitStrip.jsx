import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import { Skeleton, Spinner } from '../ui'
import { cx } from '../../lib/utils'
import { notice } from '../../lib/confirm'
import { useT } from '../../lib/i18n'
import { downloadBlob } from '../../lib/domSnapshot'

// THE GRAPHICS, WHERE THE CREATOR ALREADY IS.
//
// Ethan: "by the way I think these graphics should be somewhere on the
// portfolio page for the creators to use."
//
// He is right, and it is worth saying why rather than just doing it: the
// portfolio is the one page in this product a creator opens when they are
// thinking about how they LOOK to people outside the community. That is the
// same thought that makes somebody post "I'm officially a Tryp.com Content
// Creator" on their story. A library page elsewhere would be a place these
// files are stored; here it is a thing to do next.
//
// DOWNLOAD, NOT OPEN IN A TAB. `<a download>` on a cross-origin URL is ignored
// by the browser - it navigates instead - and on iOS a navigation to an image
// replaces the app with a picture the person then has to long-press. Fetching
// the bytes and handing over a blob is the only version that reliably lands in
// a camera roll, and it is the same `downloadBlob` the certificates use.
export default function KitStrip({ className }) {
  const tr = useT()
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(null)

  useEffect(() => {
    supabase.from('creator_kit_assets')
      .select('id, title, blurb, kind, path, width, height')
      .eq('is_active', true)
      .order('sort_order').order('created_at')
      .then(({ data }) => setRows(data || []))
  }, [])

  async function save(row) {
    setBusy(row.id)
    try {
      const url = supabase.storage.from('creator-kit').getPublicUrl(row.path).data.publicUrl
      const res = await fetch(url)
      if (!res.ok) throw new Error(String(res.status))
      const blob = await res.blob()
      const ext = (row.path.match(/\.([a-z0-9]+)$/i)?.[1] || 'png').toLowerCase()
      await downloadBlob(blob, `tryp-${row.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.${ext}`)
    } catch {
      notice(tr('That did not save. Check your connection and try again.'), { title: tr('Could not save it') })
    }
    setBusy(null)
  }

  if (rows === null) return <Skeleton className={cx('h-44 w-full rounded-card', className)} />
  if (rows.length === 0) return null

  return (
    <section className={className}>
      <div className="mb-3">
        <h2 className="text-lg font-semibold text-ink">{tr('Share that you are a Tryp.com creator')}</h2>
        <p className="mt-1 text-sm text-smoke">
          {tr('Save one of these and put it on your story or your LinkedIn. If somebody joins through you, your referral reward applies.')}
        </p>
      </div>

      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
        {rows.map((row) => (
          <div key={row.id} className="w-[168px] shrink-0 snap-start overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
            <div
              className="bg-cloud"
              style={{ aspectRatio: row.width && row.height ? `${row.width} / ${row.height}` : '9 / 16' }}
            >
              <img
                src={supabase.storage.from('creator-kit').getPublicUrl(row.path).data.publicUrl}
                alt={row.title}
                loading="lazy"
                className="h-full w-full object-cover"
              />
            </div>
            <div className="p-3">
              <p className="truncate text-[12px] font-bold text-ink">{row.title}</p>
              <button
                type="button"
                onClick={() => save(row)}
                disabled={busy === row.id}
                className="btn-secondary mt-2 w-full justify-center !py-1.5 text-[11px]"
              >
                {busy === row.id
                  ? <Spinner className="h-3.5 w-3.5" />
                  : <><Icon name="download" className="h-3.5 w-3.5" /> {tr('Save')}</>}
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
