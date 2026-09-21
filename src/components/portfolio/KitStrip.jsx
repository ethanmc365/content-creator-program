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
const KIND_LABEL = {
  story: 'Instagram story', post: 'Instagram post', linkedin: 'LinkedIn post', banner: 'Banner', other: 'Graphic',
}

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

  // A FULL-WIDTH SECTION ACROSS THE TOP, AND A GRID, NOT A SCROLLER
  // (21 Sep 2026). Ethan, on the portfolio page:
  //
  //   "the icon there that shows the three dots and the lines isn't necessary"
  //     -> the share glyph is gone; the heading says what this is.
  //   "rather than a little call-out box on the left side, make this a full
  //    box going across the top"
  //     -> it sits above the page's two columns now (Portfolio.jsx), so the
  //        editor starts below it, level with the portfolio it edits.
  //   "I don't want the dotted line around the card"
  //     -> a plain white card. It no longer sits directly on the deck, so it
  //        no longer needs a dashed edge to say it is not a page of it.
  //   "the buttons should be in the same place... the Instagram post ones the
  //    save button is at the top and for the story ones it's at the bottom"
  //     -> every tile has the SAME FRAME (3:4), with the graphic contained
  //        inside it, so a square post and a 9:16 story end at the same line
  //        and every Save button sits on one row.
  //   "the way they magnify when you're hovering is cool, but there's weird
  //    shadow lines coming out"
  //     -> that was the horizontal scroller: `overflow-x: auto` makes
  //        `overflow-y` clip as well, so the lift's shadow was cut off in a
  //        hard line under every tile. A grid does not clip, and only the
  //        picture scales, inside its own frame.
  return (
    <section className={cx('rounded-card border border-gray-100 bg-white p-5 shadow-card sm:p-6', className)}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-lg font-bold text-ink">{tr('Share that you are a Tryp.com creator')}</h2>
          <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-smoke">
            {tr('Graphics for your story, your feed or your LinkedIn. Tap one to see it, save it straight to your phone. If somebody joins through you, your referral reward applies.')}
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-cloud px-3 py-1 text-[12px] font-semibold text-smoke">
          {rows.length === 1 ? tr('1 graphic') : `${rows.length} ${tr('graphics')}`}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4">
        {rows.map((row) => (
          <div
            key={row.id}
            className="group flex flex-col rounded-2xl bg-white p-2 ring-1 ring-gray-100 transition-all duration-300 hoverable:hover:-translate-y-1 hoverable:hover:shadow-lift hoverable:hover:ring-brand/25"
          >
            <button
              type="button"
              onClick={() => setOpen(row)}
              aria-label={tr('See {title} full size', { title: row.title })}
              className="relative block aspect-[3/4] w-full overflow-hidden rounded-xl"
              style={{ background: 'linear-gradient(160deg,#fff4ea 0%,#ffe6d2 100%)' }}
            >
              <img
                src={supabase.storage.from('creator-kit').getPublicUrl(row.path).data.publicUrl}
                alt={row.title}
                loading="lazy"
                className="absolute inset-0 m-auto max-h-[88%] max-w-[86%] rounded-lg object-contain shadow-[0_6px_18px_rgba(59,28,7,0.16)] transition-transform duration-500 ease-out hoverable:group-hover:scale-[1.05]"
              />
              <span className="pointer-events-none absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-ink opacity-0 shadow-sm transition-opacity duration-200 hoverable:group-hover:opacity-100">
                <Icon name="expand" className="h-3.5 w-3.5" />
              </span>
            </button>
            <div className="flex flex-1 flex-col px-1 pb-0.5 pt-2.5">
              <p className="truncate text-[13px] font-bold text-ink">{row.title}</p>
              <p className="truncate text-[11px] text-smoke">
                {row.blurb || (row.width && row.height ? `${KIND_LABEL[row.kind] || tr('Graphic')} · ${row.width}×${row.height}` : KIND_LABEL[row.kind] || tr('Graphic'))}
              </p>
              <button
                type="button"
                onClick={() => save(row)}
                disabled={busy === row.id}
                className="btn-primary mt-2.5 w-full justify-center !py-2 text-[12px]"
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
