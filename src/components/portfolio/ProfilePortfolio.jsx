import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import { Modal } from '../ui'
import { cx } from '../../lib/utils'
import { lockScroll } from '../../lib/scrollLock'
import { useIsMobile } from '../../lib/useKeyboardInset'
import { useT } from '../../lib/i18n'
import PortfolioDeck, { useFluidWidth } from './PortfolioDeck'
import { compactViews } from '../../lib/portfolio'

// SOMEBODY'S PORTFOLIO, ON THEIR PROFILE.
//
// Ethan: "giving the ability for creators to choose for their portfolio to also
// appear on their profile that all the creators can see. This would need to fit
// nicely into the profile page, and have a clean design and functionally to
// scroll between the pages etc, be interactive."
//
// A HORIZONTAL PAGER, NOT THE VERTICAL STACK. On `/portfolio` the deck is the
// whole screen and scrolling down through five A4 pages is the right gesture -
// it is a document, and that is how you read one. On a PROFILE it is one
// section among nine, and five full-width pages stacked vertically would push
// the flight log and the photo board most of a screen further down each. A
// pager keeps it to the height of ONE page and makes moving between them a
// deliberate act rather than a scroll somebody has to get past.
//
// SNAP SCROLLING RATHER THAN BUTTONS-ONLY, because on a phone the gesture is
// the obvious one and on a desktop the arrows are there for people who would
// rather click. Both drive the same scroller, so they cannot disagree.
export default function ProfilePortfolio({ profileId }) {
  const tr = useT()
  const navigate = useNavigate()
  const { user } = useAuth()
  const mine = user?.id === profileId
  const [data, setData] = useState(null)
  const [holder, width] = useFluidWidth(260)
  // THE SAME DECK, FULL SCREEN. Ethan: "whenever you click on this, it should
  // actually open up on like the big screen, like a big pop-up that you can go
  // through and see it bigger rather than just that small screen."
  //
  // The embed is deliberately small - it is one section of a profile among nine
  // and five full pages stacked would bury everything under it - but small is
  // the wrong size for actually READING somebody's media kit, which is the
  // thing a profile visitor came to this section to do. So the embed is the
  // invitation and this is the document. Opens on whatever page you were
  // already looking at, because being sent back to the cover after paging to
  // the work is the thing that makes a pop-up feel like a different object.
  const [big, setBig] = useState(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      const { data: port } = await supabase.from('creator_portfolios')
        .select('*').eq('profile_id', profileId).maybeSingle()
      if (!alive) return
      // `show_on_profile` is checked HERE as well as in the RLS policy. The
      // policy lets a signed-in creator read a row that is `is_public` too, and
      // a creator who publishes to the web has not thereby asked for it on
      // their community profile. Two switches, two decisions - see migration
      // 223. Without this check the second one would be doing nothing.
      //
      // ON BY DEFAULT (3 Oct 2026). Ethan: "the portfolios are no longer showing on the profile pages ... they can
      // still turn this off in settings, right? ... it should all be on automatically already." Somebody who never
      // opened the portfolio page has no row at all, so a missing row now means "on, with the defaults" (migration
      // 317 makes `show_on_profile` default true and turns it on for the rows that had never been switched).
      // Only a row that says false keeps it off.
      if (port && !port.show_on_profile) { setData(false); return }
      const [{ data: subs }, { data: certs }, { data: creator }] = await Promise.all([
        supabase.from('submissions')
          .select('id, platform, video_url, thumbnail_url, logged_views, challenge_id, community_id, challenge:challenges(title), market:communities(name)')
          .eq('creator_id', profileId).order('logged_views', { ascending: false, nullsFirst: false }),
        supabase.from('certificate_awards')
          .select('serial, facts, awarded_at, design:certificate_designs(title, tier, accent, emblem, body)')
          .eq('profile_id', profileId).order('awarded_at', { ascending: false }),
        supabase.from('profiles')
          // `other_links` rides along because the deck's contact page lists
          // every place they post, and a free-form link is one of them.
          .select('id, name, photo_url, bio, city, country, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, other_links')
          .eq('id', profileId).maybeSingle(),
      ])
      if (!alive) return
      // Nothing to show yet: no row of their own, no video and no certificate.
      if (!port && !(subs || []).length && !(certs || []).length) { setData(false); return }
      setData({
        portfolio: port || { profile_id: profileId, is_public: false, show_on_profile: true, tools: [], extra_platforms: [], picks: [], copy: {} },
        creator: creator ? { ...creator, links: {
          instagram: creator.instagram_url, tiktok: creator.tiktok_url,
          youtube: creator.youtube_url, facebook: creator.facebook_url, linkedin: creator.linkedin_url,
        } } : null,
        videos: (subs || []).map((s) => ({
          ...s, views: s.logged_views,
          challenge: s.challenge?.title || null, market: s.market?.name || null,
        })),
        certificates: (certs || []).map((c) => ({
          ...c, title: c.design?.title, tier: c.design?.tier,
          accent: c.design?.accent, emblem: c.design?.emblem, body: c.design?.body,
        })),
      })
    })()
    return () => { alive = false }
  }, [profileId])

  if (!data) return null

  const { portfolio, creator, videos, certificates } = data
  return (
    <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center gap-3">
        {/* THE BARE ICON, IN BRAND ORANGE - NO TINTED SQUARE BEHIND IT (5 Oct 2026). Ethan: "a book with a weird square, light-coloured orange
            around it ... I just want it to be the icon in orange. This has been a recurring issue." Every other section on the profile heads
            itself with a plain brand glyph; so does this one. */}
        <Icon name="book" className="h-5 w-5 shrink-0 text-brand" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold text-ink">{tr('Portfolio')}</h2>
          <p className="truncate text-[11px] text-smoke">
            {portfolio.is_public && portfolio.slug
              ? tr('Also published at /p/{slug}', { slug: portfolio.slug })
              : tr('Shared with the community')}
          </p>
        </div>
      </div>

      {/* ONLY THE COVER, AS A PICTURE (5 Oct 2026). Ethan: "I wanted to just show the first card there." The embed used to be a
          five-page pager squeezed into one section of a profile; it is now the cover alone, and pressing it opens the whole
          document full size. One press target over the whole card (a click on a still picture cannot be mistaken for a swipe
          any more) with the small "Full size" badge kept as the label. */}
      <div ref={holder} className="group/deck relative">
        <div className="overflow-hidden rounded-[14px]">
          <PortfolioDeck
            creator={creator}
            portfolio={portfolio}
            videos={videos}
            certificates={certificates}
            width={width}
            only={1}
          />
        </div>
        {/* YOUR OWN OPENS THE EDITOR, ANYBODY ELSE'S OPENS FULL SIZE (3 Oct 2026, Ethan). */}
        <button
          type="button"
          onClick={() => (mine ? navigate('/portfolio') : setBig(0))}
          aria-label={mine ? tr('Edit your portfolio') : tr('Open this portfolio full size')}
          className="absolute inset-0 z-10 flex items-start justify-end rounded-[14px] p-2 transition-colors hoverable:hover:bg-ink/5"
        >
          <span className="flex items-center gap-1.5 rounded-lg bg-white/92 px-2.5 py-1.5 text-[11px] font-semibold text-ink shadow-sm backdrop-blur transition-all group-hover/deck:text-brand">
            <Icon name={mine ? 'pencil' : 'expand'} className="h-3.5 w-3.5" /> {mine ? tr('Edit') : tr('Full size')}
          </span>
        </button>
      </div>

      {videos.length > 0 && (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-gray-400">{tr('Watch them')}</p>
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {videos.slice(0, 8).map((v) => (
              <a key={v.id} href={v.video_url} target="_blank" rel="noopener noreferrer"
                className="group flex w-[120px] shrink-0 flex-col gap-1.5 rounded-xl border border-gray-100 p-1.5 transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand/40">
                <span className="block h-20 w-full overflow-hidden rounded-lg bg-cloud">
                  {v.thumbnail_url && <img src={v.thumbnail_url} alt="" loading="lazy" className="h-full w-full object-cover" />}
                </span>
                <span className="px-0.5">
                  <span className="block text-[11px] font-bold text-ink">{compactViews(v.views)} {tr('views')}</span>
                  <span className="block truncate text-[10px] capitalize text-smoke">{v.platform}</span>
                </span>
              </a>
            ))}
          </div>
        </div>
      )}

      <Link to={`/p/${portfolio.slug}`} target="_blank" rel="noopener noreferrer"
        className={cx('mt-3 flex items-center justify-center gap-1.5 text-[11px] font-semibold text-brand hover:underline',
          (!portfolio.is_public || !portfolio.slug) && 'hidden')}>
        {tr('Open the full portfolio')} <Icon name="link" className="h-3 w-3" />
      </Link>

      {big !== null && (
        <BigDeck
          creator={creator}
          portfolio={portfolio}
          videos={videos}
          certificates={certificates}
          startAt={big}
          onClose={() => setBig(null)}
          tr={tr}
        />
      )}
    </section>
  )
}

/**
 * The deck at the size of the screen, as a pager.
 *
 * WHY IT IS A SECOND SCROLLER AND NOT THE SAME ONE MOVED. The embed's rail has
 * to keep its scroll position while this is open - closing the pop-up and
 * finding the profile back at page one is exactly the jump this is meant to
 * remove - so this gets its own, seeded from where the embed was.
 *
 * Arrow keys work, because a pop-up you page through with a mouse is a pop-up
 * somebody will immediately try to page through with a keyboard.
 */
function BigDeck({ creator, portfolio, videos, certificates, startAt, onClose, tr }) {
  const isMobile = useIsMobile()
  // ON A DESKTOP IT IS THE WHOLE SCREEN (5 Oct 2026). Ethan: "I like how it opens up on mobile when you click into full screen, but on desktop it
  // has the ability to fill up the screen even more." The pages are 16:9, so the biggest one that fits is bounded by the width of the window AND by
  // its height (less room for the title above and the pager below) - whichever runs out first. A phone keeps the sheet it already had.
  const [deskW, setDeskW] = useState(() => (typeof window === 'undefined' ? 960 : fitDeck()))
  useEffect(() => {
    const on = () => setDeskW(fitDeck())
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [])
  const [holder, measured] = useFluidWidth(320)
  const width = isMobile ? measured : Math.min(measured, deskW)
  const railRef = useRef(null)
  const [ready, setReady] = useState(false)
  const setRail = useCallback((el) => { railRef.current = el; setReady(!!el) }, [])
  const [page, setPage] = useState(startAt)
  const [count, setCount] = useState(0)

  // Seeded once the rail exists AND has been laid out at its real width -
  // `scrollLeft` on a box that is still 320px wide lands on the wrong page.
  useEffect(() => {
    const el = railRef.current
    if (!el || !ready) return
    el.scrollLeft = startAt * el.clientWidth
  }, [ready, startAt, width])

  useEffect(() => {
    const el = railRef.current
    if (!el) return undefined
    const onScroll = () => setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [ready])

  const go = useCallback((by) => {
    const rail = railRef.current
    if (!rail) return
    // Assigned, never `scrollTo({behavior})`: this app sets `scroll-behavior:
    // smooth` platform-wide, so a repositioning here would animate, and inside
    // a horizontal rail that reads as a lurch. See lib/scrollBehaviour.test.js.
    rail.scrollLeft = Math.max(0, page + by) * rail.clientWidth
  }, [page])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); go(1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1) }
      if (e.key === 'Escape' && !isMobile) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go, isMobile, onClose])

  useEffect(() => (isMobile ? undefined : lockScroll()), [isMobile])

  const title = creator?.name ? tr('{name}’s portfolio', { name: creator.name }) : tr('Portfolio')
  const deck = (
    <>
      <div ref={holder} className="mx-auto min-w-0" style={isMobile ? undefined : { width: deskW }}>
        <div
          ref={setRail}
          className="-mx-1 flex snap-x snap-mandatory gap-4 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <PortfolioDeck
            creator={creator}
            portfolio={portfolio}
            videos={videos}
            certificates={certificates}
            width={width}
            gap={16}
            horizontal
            onPageCount={setCount}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-center gap-4">
        <button type="button" onClick={() => go(-1)} disabled={page === 0}
          aria-label={tr('Previous page')}
          className={cx('flex h-9 w-9 items-center justify-center rounded-xl border transition-all hoverable:hover:-translate-y-px disabled:opacity-30',
            isMobile ? 'border-gray-200 text-smoke hoverable:hover:border-brand/40 hoverable:hover:text-brand' : 'border-white/25 text-white hoverable:hover:bg-white/10')}>
          <Icon name="arrow-down" className="h-4 w-4 rotate-90" />
        </button>
        {/* Dots, not "3 / 6". At six pages the dots say the same thing and also
            say which one you are on without being read. */}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: Math.max(1, count) }).map((_, i) => (
            <span
              key={i}
              className={cx('h-1.5 rounded-full transition-all duration-200',
                i === page ? 'w-5 bg-brand' : isMobile ? 'w-1.5 bg-gray-200' : 'w-1.5 bg-white/30')}
            />
          ))}
        </div>
        <button type="button" onClick={() => go(1)} disabled={count > 0 && page >= count - 1}
          aria-label={tr('Next page')}
          className={cx('flex h-9 w-9 items-center justify-center rounded-xl border transition-all hoverable:hover:-translate-y-px disabled:opacity-30',
            isMobile ? 'border-gray-200 text-smoke hoverable:hover:border-brand/40 hoverable:hover:text-brand' : 'border-white/25 text-white hoverable:hover:bg-white/10')}>
          <Icon name="arrow-down" className="h-4 w-4 -rotate-90" />
        </button>
      </div>
    </>
  )

  if (isMobile) {
    return <Modal open onClose={onClose} title={title} wide>{deck}</Modal>
  }
  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col items-center justify-center px-6" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label={tr('Close')} onClick={onClose} className="scrim-in absolute inset-0 bg-ink/90 backdrop-blur-sm" />
      <div className="relative flex w-full items-center justify-between pb-4" style={{ maxWidth: deskW }}>
        <h2 className="truncate text-lg font-semibold text-white">{title}</h2>
        <button type="button" onClick={onClose} aria-label={tr('Close dialog')}
          className="rounded-full p-2 text-white/80 transition-colors hover:bg-white/10 hover:text-white">
          <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      </div>
      <div className="sheet-in relative w-full" style={{ maxWidth: deskW }}>{deck}</div>
    </div>,
    document.body,
  )
}

// The largest 16:9 page that fits the window, less ~190px for the title above and the pager below, and 120px of margin at the sides.
function fitDeck() {
  return Math.round(Math.max(480, Math.min(window.innerWidth - 120, (window.innerHeight - 190) * (16 / 9), 2000)))
}
