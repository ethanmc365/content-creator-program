import { useEffect, useRef, useState } from 'react'
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

// What a graphic is for, in words: every use it was given (migration 238).
function labelOf(row, tr) {
  const kinds = Array.isArray(row.kinds) && row.kinds.length ? row.kinds : [row.kind || 'other']
  return kinds.map((k) => tr(KIND_LABEL[k] || 'Graphic')).join(' · ')
}

export default function KitStrip({ className }) {
  const tr = useT()
  const railRef = useRef(null)
  const [edges, setEdges] = useState({ start: true, end: true })
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(null)
  // Which graphic is open full-screen. Ethan: "whenever you click in the photo,
  // it should show a pop-up of it so you can see what the photo actually is
  // without having to download it." Downloading a file to find out whether you
  // want it is the wrong order.
  const [open, setOpen] = useState(null)

  useEffect(() => {
    supabase.from('creator_kit_assets')
      .select('id, title, blurb, kind, kinds, path, width, height')
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

  // Which ends of the row are reached, for the two arrow buttons.
  useEffect(() => {
    const el = railRef.current
    if (!el) return undefined
    const measure = () => setEdges({
      start: el.scrollLeft <= 2,
      end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 2,
    })
    measure()
    el.addEventListener('scroll', measure, { passive: true })
    window.addEventListener('resize', measure)
    return () => { el.removeEventListener('scroll', measure); window.removeEventListener('resize', measure) }
  }, [rows])

  const page = (dir) => {
    const el = railRef.current
    if (el) el.scrollBy({ left: dir * el.clientWidth * 0.9, behavior: 'smooth' })
  }

  if (rows === null) return <Skeleton className={cx('h-56 w-full rounded-card', className)} />
  if (rows.length === 0) return null

  // ONE ROW, THREE AT A TIME (21 Sep 2026). The Year in Review card that sat
  // beside it is its own card now - see `YearTeaser` below.
  //
  // Ethan: "rather than having that on multiple lines, it should only be one
  // line. Those four cards there, and rather than having the other four cards
  // below, it should just be a horizontal scroll to view the other cards.
  // Ensure everything's the same size... this doesn't take up as much space."
  // And: "just show 3 there... on that right side have a separate smaller card
  // that shows that it's going to be unlocked... your Year in Review on
  // 3 December, so they know that this is an actual thing."
  //
  // Every tile is the same width and the same 4:5 frame with the graphic
  // contained inside, so a story and a post line up and every Save sits on one
  // line. The row is `.pick-row`, whose padding gives the hover lift and its
  // shadow room: a horizontal scroller clips BOTH axes (see index.css).
  return (
    <section className={cx('rounded-card border border-gray-100 bg-white p-4 shadow-card sm:p-5', className)}>
      <div className="flex items-center gap-3">
        <h2 className="min-w-0 flex-1 truncate text-base font-bold text-ink sm:text-lg">{tr("Share you're a Tryp.com creator")}</h2>
        <span className="hidden shrink-0 rounded-full bg-cloud px-3 py-1 text-[12px] font-semibold text-smoke sm:inline">
          {rows.length === 1 ? tr('1 graphic') : `${rows.length} ${tr('graphics')}`}
        </span>
        {rows.length > 3 && (
          <div className="hidden shrink-0 gap-1.5 sm:flex">
            {[-1, 1].map((d) => (
              <button
                key={d} type="button" onClick={() => page(d)}
                disabled={d < 0 ? edges.start : edges.end}
                aria-label={d < 0 ? tr('Previous graphics') : tr('More graphics')}
                className="flex h-8 w-8 items-center justify-center rounded-full border border-gray-200 bg-white text-ink transition-all hover:border-brand hover:text-brand disabled:opacity-30"
              >
                <Icon name={d < 0 ? 'chevronLeft' : 'chevronRight'} className="h-4 w-4" />
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="mt-1">
        <div ref={railRef} className="pick-row -mx-4 flex min-w-0 snap-x snap-mandatory gap-3 scroll-px-4 px-4 !pb-3 sm:-mx-5 sm:scroll-px-5 sm:px-5 sm:!pb-9">
          {rows.map((row) => (
            <div
              key={row.id}
              className="group flex w-[46%] shrink-0 snap-start flex-col rounded-2xl bg-white p-2 ring-1 ring-gray-100 transition-all duration-300 hoverable:hover:-translate-y-1 hoverable:hover:shadow-lift hoverable:hover:ring-brand/25 sm:w-[calc((100%-1.5rem)/3)]"
            >
              <button
                type="button"
                onClick={() => setOpen(row)}
                aria-label={tr('See {title} full size', { title: row.title })}
                className="relative block aspect-[4/5] w-full overflow-hidden rounded-xl"
                style={{ background: 'linear-gradient(160deg,#fff4ea 0%,#ffe6d2 100%)' }}
              >
                <img
                  src={supabase.storage.from('creator-kit').getPublicUrl(row.path).data.publicUrl}
                  alt={row.title}
                  loading="lazy"
                  draggable={false}
                  className="absolute inset-0 m-auto max-h-[88%] max-w-[86%] rounded-lg object-contain shadow-[0_6px_18px_rgba(59,28,7,0.16)] transition-transform duration-500 ease-out hoverable:group-hover:scale-[1.05]"
                />
                <span className="pointer-events-none absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-ink opacity-0 shadow-sm transition-opacity duration-200 hoverable:group-hover:opacity-100">
                  <Icon name="expand" className="h-3.5 w-3.5" />
                </span>
              </button>
              <div className="flex flex-1 flex-col px-1 pb-0.5 pt-2">
                <p className="truncate text-[13px] font-bold text-ink">{row.title}</p>
                <p className="truncate text-[11px] text-smoke">{row.blurb || labelOf(row, tr)}</p>
                <button
                  type="button"
                  onClick={() => save(row)}
                  disabled={busy === row.id}
                  className="btn-primary mt-2 w-full justify-center !py-1.5 text-[12px]"
                >
                  {busy === row.id
                    ? <Spinner className="h-3.5 w-3.5" />
                    : <><Icon name="download" className="h-3.5 w-3.5" /> {tr('Save')}</>}
                </button>
              </div>
            </div>
          ))}
        </div>
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

// THE YEAR IN REVIEW, ANNOUNCED BEFORE IT EXISTS. Ethan: "a separate smaller
// card that shows that it's going to be unlocked, like the [locked] preview...
// so they know that this is an actual thing." It is `YearInReviewLocked` in
// miniature - the same orange, the same lock, the same sentence - so on
// 3 December the real thing is recognisably the card they have been looking
// at. Not a link: there is nothing to open yet.
//
// ITS OWN CARD, IN THE EDITOR'S COLUMN (21 Sep 2026). It used to sit inside the
// graphics card, at the end of the row. Ethan: "rather than having this in the
// same card, I would like it in a separate card... the editing screen size to
// match the size of the 'Your Year Is Still Happening' card, and the share card
// to match the size of the portfolio." So the page lays the two out in the same
// `1fr / 360px` grid as the deck and the editor below, and this fills its cell.
// `compact` is the phone's version: one row, at the foot of the page, so the
// graphics and then the portfolio are what a phone opens on.
export function YearTeaser({ className, compact = false, tiny = false }) {
  const tr = useT()
  const now = new Date()
  const year = now.getFullYear()
  const unlock = new Date(year, 11, 3)
  const days = Math.max(0, Math.ceil((unlock - now) / 86400000))
  // THE PHONE'S VERSION: ONE ROW AT THE TOP OF THE PAGE. Same gradient and the
  // same three facts (what, when, how long), about a third of the height.
  if (tiny) {
    return (
      <section
        className={cx('relative flex items-center gap-3 overflow-hidden rounded-card px-3.5 py-3 text-white shadow-card', className)}
        style={{ background: 'linear-gradient(150deg,#d94407 0%,#f5853f 100%)' }}
      >
        <span className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-white/15 blur-2xl" aria-hidden />
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/30">
          <Icon name="lock" className="h-4 w-4" />
        </span>
        <div className="relative min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-white/85">{tr('Year in Review')} · {year}</p>
          <p className="truncate text-[14px] font-extrabold leading-tight">{tr('Unlocks 3 December')}</p>
        </div>
        <div className="relative shrink-0 text-right">
          <p className="text-xl font-extrabold tabular-nums leading-none">{days}</p>
          <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/80">{days === 1 ? tr('day to go') : tr('days to go')}</p>
        </div>
      </section>
    )
  }
  return (
    <section
      className={cx('relative flex flex-col overflow-hidden rounded-card p-5 text-white shadow-card', className)}
      style={{ background: 'linear-gradient(150deg,#d94407 0%,#f5853f 100%)' }}
    >
      <span className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-white/15 blur-2xl" aria-hidden />
      <span className="pointer-events-none absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-white/10 blur-2xl" aria-hidden />
      <div className="relative flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-white/85">{tr('Year in Review')} · {year}</span>
        <span className="rounded-full bg-white/20 px-2.5 py-1 text-[11px] font-semibold">{tr('Unlocks 3 December')}</span>
      </div>
      <div className={cx('relative flex gap-3', compact ? 'mt-3 items-center' : 'flex-1 flex-col justify-center py-4')}>
        <span className={cx('flex shrink-0 items-center justify-center rounded-full bg-white/20 ring-1 ring-white/30', compact ? 'h-11 w-11' : 'h-14 w-14')}>
          <Icon name="lock" className={compact ? 'h-5 w-5' : 'h-6 w-6'} />
        </span>
        <div className="min-w-0">
          <p className={cx('font-extrabold leading-[1.1] tracking-tight', compact ? 'text-[17px]' : 'text-2xl')}>{tr('Your year is still happening.')}</p>
          <p className="mt-1.5 text-[13px] leading-snug text-white/85">{tr('Your Year in Review unlocks on 3 December.')}</p>
        </div>
      </div>
      {!compact && (
        <div className="relative flex items-end justify-between gap-3">
          <div>
            <p className="text-3xl font-extrabold tabular-nums leading-none">{days}</p>
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/80">{days === 1 ? tr('day to go') : tr('days to go')}</p>
          </div>
          <img src="/brand/tryp-wordmark-white.svg" alt="Tryp.com" className="h-5 w-auto opacity-90" />
        </div>
      )}
    </section>
  )
}
