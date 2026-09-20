import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import PhotoLightbox from '../PhotoLightbox'
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
  // Which graphic is open full-screen. Ethan: "whenever you click in the photo,
  // it should show a pop-up of it so you can see what the photo actually is
  // without having to download it." Downloading a file to find out whether you
  // want it is the wrong order.
  const [open, setOpen] = useState(null)

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

  // AT THE TOP, AND NOT LOOKING LIKE A PAGE OF THE PORTFOLIO.
  //
  // It was a bare heading and a scroll row UNDER five full-size pages, which on
  // a laptop is three screens down - "I don't see where these are actually
  // showing up for the creators". So it moved to the top.
  //
  // And then, at the top, it created the opposite problem. Ethan: "I think it's
  // weird the way 'share your Tryp.com creator' seems to be almost like a slide
  // in the portfolio. So that needs to be more clear that it's a separate
  // thing." Fair, and it was our own doing: it sits directly above a stack of
  // white sheets with soft shadows, so a white card with a soft shadow full of
  // pictures reads as the first one of them, and nothing in it said otherwise.
  //
  // So it stops being a white sheet. A tinted ground, a dashed brand edge, and
  // a line that says out loud what it is NOT - community graphics, not pages of
  // the document underneath.
  //
  // Ethan: "I think it's weird the way 'share your Tryp.com creator' seems to
  // be almost like a slide in the portfolio. So that needs to be more clear
  // that it's a separate thing."
  //
  // Fair, and it was our own doing. It moved to the top of the page so it could
  // be found at all, and at the top it sits directly above a stack of white
  // sheets with soft shadows - so a white card with a soft shadow full of
  // pictures reads as the first one of them. Nothing in it said otherwise.
  //
  // So it stops being a white sheet. A tinted ground, a dashed brand edge, and
  // a line that says out loud what it is NOT: these are community graphics, not
  // pages of the document underneath. A separator under it makes the boundary a
  // thing you can see rather than a thing you have to work out.
  return (
    <section className={cx('rounded-card border-2 border-dashed border-brand/30 bg-brand-tint/40 p-4 sm:p-5', className)}>
      <div className="flex flex-wrap items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand text-white">
          <Icon name="share" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-bold text-ink">{tr('Share that you are a Tryp.com creator')}</h2>
          <p className="mt-0.5 text-[12px] leading-relaxed text-smoke">
            {tr('Community graphics for your story or your LinkedIn - not pages of your portfolio. If somebody joins through you, your referral reward applies.')}
          </p>
        </div>
        <span className="hidden shrink-0 rounded-full bg-white px-2.5 py-1 text-[11px] font-semibold text-smoke shadow-sm sm:inline">
          {rows.length === 1 ? tr('1 graphic') : `${rows.length} ${tr('graphics')}`}
        </span>
      </div>

      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 pt-4 [scrollbar-width:none] sm:-mx-5 sm:px-5 [&::-webkit-scrollbar]:hidden">
        {rows.map((row) => (
          <div
            key={row.id}
            className="group w-[176px] shrink-0 snap-start overflow-hidden rounded-xl border border-gray-100 bg-white transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/30 hoverable:hover:shadow-lift"
          >
            {/* THE PICTURE IS A BUTTON. Looking at a graphic full size is the
                question somebody has BEFORE the one the Save button answers,
                and it was only answerable by downloading the file. */}
            <button
              type="button"
              onClick={() => setOpen(row)}
              aria-label={tr('See {title} full size', { title: row.title })}
              className="relative block w-full overflow-hidden bg-cloud"
              style={{ aspectRatio: row.width && row.height ? `${row.width} / ${row.height}` : '9 / 16' }}
            >
              <img
                src={supabase.storage.from('creator-kit').getPublicUrl(row.path).data.publicUrl}
                alt={row.title}
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-300 hoverable:group-hover:scale-[1.03]"
              />
              <span className="pointer-events-none absolute inset-0 flex items-end justify-end p-2 opacity-0 transition-opacity duration-200 hoverable:group-hover:opacity-100">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/90 text-ink shadow-sm">
                  <Icon name="expand" className="h-3.5 w-3.5" />
                </span>
              </span>
            </button>
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

      {open && (
        <PhotoLightbox
          src={supabase.storage.from('creator-kit').getPublicUrl(open.path).data.publicUrl}
          alt={open.title}
          canSave
          fileName={`tryp-${open.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.png`}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  )
}
