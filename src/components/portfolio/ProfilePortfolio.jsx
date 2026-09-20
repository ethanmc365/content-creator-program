import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import Icon from '../Icon'
import { Modal } from '../ui'
import { cx } from '../../lib/utils'
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
  const [data, setData] = useState(null)
  const [holder, width] = useFluidWidth(260)
  // THE SCROLLER IS HELD IN A REF AND ITS ARRIVAL IN STATE. The effect below
  // has to re-run when the element appears (it is null on the first render -
  // see the note on `useFluidWidth` for the bug that costs), and `scrollLeft`
  // has to be WRITTEN, which is not something to do to a state value.
  const railRef = useRef(null)
  const [railReady, setRailReady] = useState(false)
  const setRail = useCallback((el) => { railRef.current = el; setRailReady(!!el) }, [])
  const [page, setPage] = useState(0)
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
      if (!port?.show_on_profile) { setData(false); return }
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
      setData({
        portfolio: port,
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

  // Which page is in view, read off the scroller rather than tracked in state
  // by the buttons - so a swipe and a click agree about where you are.
  useEffect(() => {
    const el = railRef.current
    if (!el) return undefined
    const onScroll = () => setPage(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)))
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [railReady])

  if (!data) return null

  const { portfolio, creator, videos, certificates } = data
  const go = (by) => {
    const rail = railRef.current
    if (!rail) return
    // Assigned, never `scrollTo({behavior})`: this app sets `scroll-behavior:
    // smooth` platform-wide, so a repositioning here would animate. Inside a
    // horizontal rail that reads as a lurch. See lib/scrollBehaviour.test.js.
    rail.scrollLeft = Math.max(0, (page + by)) * rail.clientWidth
  }

  return (
    <section className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand">
          <Icon name="book" className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold text-ink">{tr('Portfolio')}</h2>
          <p className="truncate text-[11px] text-smoke">
            {portfolio.is_public && portfolio.slug
              ? tr('Also published at /p/{slug}', { slug: portfolio.slug })
              : tr('Shared with the community')}
          </p>
        </div>
        <Pager page={page} onGo={go} />
      </div>

      <div ref={holder} className="group/deck relative">
        <div
          ref={setRail}
          className="-mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          <PagedDeck
            creator={creator}
            portfolio={portfolio}
            videos={videos}
            certificates={certificates}
            width={width}
          />
        </div>

        {/* AN OVERLAY BUTTON, NOT AN onClick ON THE RAIL. The rail is a
            horizontal scroller and a click handler on it would fire at the end
            of every swipe - which on a phone means the pop-up opens whenever
            somebody tries to turn a page. This sits over the deck, is
            pointer-events:none except for itself, and leaves the scroll
            gesture alone. */}
        <button
          type="button"
          onClick={() => setBig(page)}
          aria-label={tr('Open this portfolio full size')}
          className="absolute right-2 top-2 z-10 flex items-center gap-1.5 rounded-lg bg-white/92 px-2.5 py-1.5 text-[11px] font-semibold text-ink shadow-sm backdrop-blur transition-all hoverable:hover:-translate-y-px hoverable:hover:text-brand"
        >
          <Icon name="expand" className="h-3.5 w-3.5" /> {tr('Full size')}
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
  const [holder, width] = useFluidWidth(320)
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
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [go])

  return (
    <Modal open onClose={onClose} title={creator?.name ? tr('{name}’s portfolio', { name: creator.name }) : tr('Portfolio')} wide>
      <div ref={holder} className="min-w-0">
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
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-smoke transition-all hoverable:hover:-translate-y-px hoverable:hover:border-brand/40 hoverable:hover:text-brand disabled:opacity-30">
          <Icon name="arrow-down" className="h-4 w-4 rotate-90" />
        </button>
        {/* Dots, not "3 / 6". At six pages the dots say the same thing and also
            say which one you are on without being read. */}
        <div className="flex items-center gap-1.5">
          {Array.from({ length: Math.max(1, count) }).map((_, i) => (
            <span
              key={i}
              className={cx('h-1.5 rounded-full transition-all duration-200',
                i === page ? 'w-5 bg-brand' : 'w-1.5 bg-gray-200')}
            />
          ))}
        </div>
        <button type="button" onClick={() => go(1)} disabled={count > 0 && page >= count - 1}
          aria-label={tr('Next page')}
          className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-smoke transition-all hoverable:hover:-translate-y-px hoverable:hover:border-brand/40 hoverable:hover:text-brand disabled:opacity-30">
          <Icon name="arrow-down" className="h-4 w-4 -rotate-90" />
        </button>
      </div>
    </Modal>
  )
}

/** The deck, with every page a snap target of the rail's own width. */
function PagedDeck({ creator, portfolio, videos, certificates, width }) {
  return (
    <PortfolioDeck
      creator={creator}
      portfolio={portfolio}
      videos={videos}
      certificates={certificates}
      width={width}
      gap={12}
      horizontal
    />
  )
}

function Pager({ page, onGo }) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" onClick={() => onGo(-1)} disabled={page === 0} aria-label="Previous page"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-cloud hover:text-smoke disabled:opacity-30">
        <Icon name="arrow-down" className="h-4 w-4 rotate-90" />
      </button>
      <button type="button" onClick={() => onGo(1)} aria-label="Next page"
        className="flex h-7 w-7 items-center justify-center rounded-lg text-gray-300 transition-colors hover:bg-cloud hover:text-smoke">
        <Icon name="arrow-down" className="h-4 w-4 -rotate-90" />
      </button>
    </div>
  )
}
