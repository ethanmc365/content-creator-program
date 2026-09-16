import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { PageHeader, Skeleton, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import { useT } from '../lib/i18n'
import { notice } from '../lib/confirm'
import { downloadBlob } from '../lib/domSnapshot'
import PortfolioDeck, { useFluidWidth } from '../components/portfolio/PortfolioDeck'
import { PAGE_W, orderedVideos, slugify } from '../lib/portfolio'
import PortfolioEditor from '../components/portfolio/PortfolioEditor'
import KitStrip from '../components/portfolio/KitStrip'
import { portfolioFilename, portfolioPdf } from '../lib/portfolioPdf'

// MY PORTFOLIO.
//
// Ethan: "similarly to how we have the 'my rewards' page for each creator on the
// profile drop down we should also have a 'my portfolio' page... the big
// functionality is that they can customise and export a pdf of their own
// portfolio."
//
// AND AN ADMIN CAN OPEN SOMEBODY ELSE'S: `/portfolio/:id`, the same shape as
// the rewards page, "just to ensure everything looks correct and works". It is
// READ ONLY for them, and that is enforced by the RLS policy as well as by this
// component - see migration 223. An admin needs to LOOK at a creator's
// portfolio. Nobody needs to be able to rewrite somebody else's bio.
export default function Portfolio() {
  const tr = useT()
  const { id } = useParams()
  const { user } = useAuth()
  const viewingId = id || user?.id
  const mine = viewingId === user?.id
  const readOnly = !mine

  const [state, setState] = useState(null)      // { creator, portfolio, videos, certificates }
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [exporting, setExporting] = useState(null)
  const [holder, width] = useFluidWidth(280)
  const exportRefs = useRef([])
  const [exportMounted, setExportMounted] = useState(false)

  const load = useCallback(async () => {
    if (!viewingId) return
    const [{ data: creator }, { data: port }, { data: subs }, { data: certs }] = await Promise.all([
      supabase.from('profiles')
        .select('id, name, photo_url, bio, city, country, instagram_url, tiktok_url, youtube_url, facebook_url, linkedin_url, other_links')
        .eq('id', viewingId).maybeSingle(),
      supabase.from('creator_portfolios').select('*').eq('profile_id', viewingId).maybeSingle(),
      supabase.from('submissions')
        .select('id, platform, video_url, thumbnail_url, caption, logged_views, submitted_at, challenge_id, community_id, challenge:challenges(title), market:communities(name)')
        .eq('creator_id', viewingId)
        .order('logged_views', { ascending: false, nullsFirst: false }),
      supabase.from('certificate_awards')
        .select('*, design:certificate_designs(title, tier, accent, emblem, body)')
        .eq('profile_id', viewingId)
        .order('awarded_at', { ascending: false }),
    ])
    setState({
      creator: creator ? { ...creator, links: {
        instagram: creator.instagram_url, tiktok: creator.tiktok_url,
        youtube: creator.youtube_url, facebook: creator.facebook_url, linkedin: creator.linkedin_url,
      } } : null,
      portfolio: port || blankPortfolio(viewingId, creator?.name),
      videos: (subs || []).map((s) => ({
        ...s,
        views: s.logged_views,
        challenge: s.challenge?.title || null,
        market: s.market?.name || null,
      })),
      certificates: (certs || []).map((c) => ({
        ...c,
        title: c.design?.title, tier: c.design?.tier,
        accent: c.design?.accent, emblem: c.design?.emblem, body: c.design?.body,
      })),
    })
    setDirty(false)
  }, [viewingId])

  useEffect(() => { load() }, [load])

  const setPortfolio = useCallback((patch) => {
    setState((s) => ({ ...s, portfolio: { ...s.portfolio, ...patch } }))
    setDirty(true)
  }, [])

  async function save() {
    setSaving(true)
    const p = state.portfolio
    // A SLUG IS MINTED ON THE WAY TO BEING PUBLIC, not on first load. A creator
    // who never shares their portfolio should not be silently holding a public
    // URL, and minting one at load would race every other creator whose name
    // begins the same way for a row nobody asked for.
    let slug = p.slug
    if (p.is_public && !slug) {
      slug = await freeSlug(state.creator?.name)
      if (!slug) { setSaving(false); return notice(tr('We could not find a free web address for that name. Try a different one in Advanced.'), { title: tr('Could not publish') }) }
    }
    const row = {
      profile_id: viewingId,
      is_public: p.is_public, slug: slug || null,
      show_on_profile: p.show_on_profile,
      headline: p.headline || null, intro: p.intro || null, about: p.about || null,
      tools: p.tools || [], extra_platforms: p.extra_platforms || [],
      picks: p.picks || [], copy: p.copy || {},
      updated_at: new Date().toISOString(),
      published_at: p.is_public ? (p.published_at || new Date().toISOString()) : null,
    }
    const { error } = await supabase.from('creator_portfolios').upsert(row, { onConflict: 'profile_id' })
    setSaving(false)
    if (error) return notice(error.message, { title: tr('Could not save that') })
    setDirty(false)
    load()
  }

  // THE EXPORT RENDERS ITS OWN DECK AT FULL SIZE.
  //
  // `snapshotNode` measures with `getBoundingClientRect`, which reports the
  // TRANSFORMED box - so photographing the deck on screen would produce a crisp
  // picture of a 380px-wide page. A second deck, off screen, at the natural
  // 1123px, is the same component with the same props, so there is nothing that
  // can drift between what is previewed and what is exported.
  async function exportPdf() {
    setExportMounted(true)
    setExporting({ done: 0, total: 0 })
    // Let the off-screen deck lay out and let its images reach the decoder
    // before anything is measured. See `settled` - this waited on a bare
    // `requestAnimationFrame` and hung for ever the first time it was run in a
    // hidden pane.
    await settled()
    try {
      const nodes = exportRefs.current.filter(Boolean)
      const blob = await portfolioPdf(nodes, (done, total) => setExporting({ done, total }))
      await downloadBlob(blob, portfolioFilename(state.creator?.name))
    } catch (err) {
      notice(err?.message || tr('Something went wrong making the PDF.'), { title: tr('Could not export') })
    } finally {
      setExporting(null)
      setExportMounted(false)
      exportRefs.current = []
    }
  }

  if (!state) {
    return <div className="page max-w-6xl space-y-6"><Skeleton className="h-10 w-72" /><Skeleton className="h-96 w-full" /></div>
  }

  const { creator, portfolio, videos, certificates } = state
  const shownVideos = orderedVideos(videos, portfolio.picks)

  return (
    <div className="page max-w-6xl">
      <PageHeader
        back={readOnly ? { to: `/profile/${viewingId}`, label: tr('Profile') } : null}
        title={readOnly ? `${creator?.name || tr('Creator')} — ${tr('portfolio')}` : tr('My portfolio')}
        subtitle={readOnly
          ? tr('You are looking at this the way the creator sees it. Nothing here can be edited by you.')
          : tr('A media kit you can send to a brand, share as a link, or download as a PDF. Every word on it is yours to change.')}
      />

      {readOnly && (
        <p className="mb-6 flex items-center gap-2 rounded-xl bg-brand-tint/60 px-4 py-3 text-sm font-medium text-brand">
          <Icon name="eye" className="h-4 w-4 shrink-0" />
          {tr('Admin view. Read only.')}
        </p>
      )}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        {/* THE DOCUMENT COMES FIRST IN THE DOM. On a phone the preview is what
            you land on, which is the thing this page is for; the controls are
            under it. On a desktop the grid puts the editor on the right. */}
        <div ref={holder} className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <button type="button" onClick={exportPdf} disabled={!!exporting} className="btn-primary">
              {exporting
                ? <><Spinner /> {exporting.total ? tr('Page {n} of {total}', { n: exporting.done + 1, total: exporting.total }) : tr('Preparing…')}</>
                : <><Icon name="download" className="h-4 w-4" /> {tr('Download PDF')}</>}
            </button>
            {!readOnly && dirty && (
              <button type="button" onClick={save} disabled={saving} className="btn-secondary">
                {saving ? <Spinner /> : tr('Save changes')}
              </button>
            )}
            {!readOnly && !dirty && (
              <span className="text-xs font-semibold text-gray-400">{tr('All changes saved')}</span>
            )}
          </div>

          <PortfolioDeck
            creator={creator}
            portfolio={portfolio}
            videos={videos}
            certificates={certificates}
            width={width}
          />

          {!readOnly && <KitStrip className="mt-8" />}
        </div>

        {!readOnly && (
          <PortfolioEditor
            portfolio={portfolio}
            creator={creator}
            videos={videos}
            shown={shownVideos}
            certificates={certificates}
            onChange={setPortfolio}
            onSave={save}
            saving={saving}
            dirty={dirty}
          />
        )}
      </div>

      {/* The off-screen, unscaled deck the exporter photographs. Mounted only
          while exporting - five A4 pages of images is not something to keep in
          the document for the whole visit. `left: -10000px` rather than
          `display: none`, which would give every node a zero-sized rect. */}
      {exportMounted && (
        <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, width: PAGE_W, pointerEvents: 'none' }}>
          <PortfolioDeck
            creator={creator}
            portfolio={portfolio}
            videos={videos}
            certificates={certificates}
            width={PAGE_W}
            gap={0}
            pageRefs={exportRefs}
          />
        </div>
      )}
    </div>
  )
}

/**
 * Wait until the off-screen deck has been laid out and painted.
 *
 * ARMED TWO WAYS, BECAUSE rAF DOES NOT RUN IN A HIDDEN TAB.
 *
 * This was `await new Promise(r => requestAnimationFrame(() =>
 * requestAnimationFrame(r)))`, which is the correct way to wait for a paint and
 * is a deadlock in the one situation that matters here: the browser throttles
 * animation frames to a stop in a background tab, and an export is exactly the
 * thing somebody starts and then switches away from while it runs. The button
 * sat on "Preparing..." for ever with nothing in the console, because nothing
 * had failed - it was waiting for a frame that was never going to come.
 *
 * This codebase has been bitten by the same thing in `Reveal`, in
 * `lib/chatScroll`, in the walkthrough's geometry loop and in
 * `useVisualViewport`, and the rule each of them arrived at is written down in
 * the memory file: NEVER GATE ANYTHING ON rAF ALONE. Whichever of the frames
 * and the timer arrives first wins.
 *
 * The 450ms is not a paint deadline, it is an IMAGE deadline: the pages carry
 * avatars and video thumbnails from storage, and `snapshotNode` inlines
 * whatever the DOM has. Two frames is enough for layout; the wait is so the
 * pictures are there to be photographed.
 */
function settled() {
  return new Promise((resolve) => {
    let done = false
    const finish = () => { if (!done) { done = true; resolve() } }
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(finish, 450)))
    setTimeout(finish, 1200)
  })
}

function blankPortfolio(profileId, name) {
  return {
    profile_id: profileId,
    is_public: false, slug: null, show_on_profile: false,
    headline: '', intro: '', about: '',
    tools: [], extra_platforms: [], picks: [], copy: {},
    published_at: null,
    __name: name,
  }
}

/**
 * A web address nobody else has.
 *
 * ASKED OF THE DATABASE RATHER THAN ASSUMED. Two creators called Sam Smith is
 * not a hypothetical on a platform with a directory, and the unique index would
 * turn the second one's "Publish" into an error message about a constraint.
 * Five tries then give up: the sixth `sam-smith-5` is not a link anybody wants
 * anyway, and Advanced lets them choose their own.
 */
async function freeSlug(name) {
  for (let i = 0; i < 6; i += 1) {
    const candidate = slugify(name, i === 0 ? '' : i + 1)
    const { data } = await supabase.from('creator_portfolios').select('profile_id').eq('slug', candidate).maybeSingle()
    if (!data) return candidate
  }
  return null
}
