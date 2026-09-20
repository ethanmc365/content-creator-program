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

  if (rows === null) return <Skeleton className={cx('h-56 w-full rounded-card', className)} />
  if (rows.length === 0) return null

  // A PANEL, AT THE TOP, NOT A ROW AT THE BOTTOM.
  //
  // Ethan: "the kit graphics, I think, should be somewhere else... I think that
  // should be at the top of the portfolio section, if that's where we're
  // keeping it, rather than at the bottom."
  //
  // It was a bare heading and a scroll row under five A4 pages, which on a
  // laptop is three screens down - below the fold of a page whose main object
  // is deliberately enormous. Nobody scrolls past their own media kit to find
  // something they did not know was there, which is exactly what happened:
  // "I don't see where these are actually showing up for the creators."
  //
  // Now it is a bordered panel with a brand header directly under the page
  // title, so it is the first thing after "Portfolio" rather than the last
  // thing on the page.
  return (
    <section className={cx('overflow-hidden rounded-card border border-gray-100 bg-white shadow-card', className)}>
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-100 bg-gradient-to-r from-brand/10 via-brand/5 to-transparent px-4 py-3.5 sm:px-5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
          <Icon name="share" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold text-ink">{tr('Share that you are a Tryp.com creator')}</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-smoke">
            {tr('Save one of these for your story or your LinkedIn. If somebody joins through you, your referral reward applies.')}
          </p>
        </div>
        <span className="hidden shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-smoke shadow-sm sm:inline">
          {rows.length === 1 ? tr('1 graphic') : `${rows.length} ${tr('graphics')}`}
        </span>
      </div>

      <div className="-mx-px flex snap-x gap-3 overflow-x-auto px-4 pb-4 pt-4 [scrollbar-width:none] sm:px-5 [&::-webkit-scrollbar]:hidden">
        {rows.map((row) => (
          <div
            key={row.id}
            className="group w-[176px] shrink-0 snap-start overflow-hidden rounded-xl border border-gray-100 bg-white transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/30 hoverable:hover:shadow-lift"
          >
            <div
              className="relative overflow-hidden bg-cloud"
              style={{ aspectRatio: row.width && row.height ? `${row.width} / ${row.height}` : '9 / 16' }}
            >
              <img
                src={supabase.storage.from('creator-kit').getPublicUrl(row.path).data.publicUrl}
                alt={row.title}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 hoverable:group-hover:scale-[1.03]"
              />
            </div>
            <div className="p-2.5">
              <p className="truncate text-[12px] font-bold text-ink">{row.title}</p>
              {row.blurb && <p className="mt-0.5 truncate text-[11px] text-smoke">{row.blurb}</p>}
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
