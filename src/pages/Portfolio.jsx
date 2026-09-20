import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useViewAs, ViewingAsBanner } from '../components/ViewingAs'
import { PageHeader, Skeleton, Spinner } from '../components/ui'
import Icon from '../components/Icon'
import { useT } from '../lib/i18n'
import { notice } from '../lib/confirm'
import { downloadBlob } from '../lib/domSnapshot'
import PortfolioDeck, { useFluidWidth } from '../components/portfolio/PortfolioDeck'
import { PAGE_W, orderedVideos, slugify, workMode } from '../lib/portfolio'
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
// How long a run of edits counts as ONE undo step, and how many steps are kept.
const UNDO_COALESCE_MS = 700
// How long the page waits for somebody to stop before it writes.
const AUTOSAVE_MS = 1500
const UNDO_DEPTH = 50

export default function Portfolio() {
  const tr = useT()
  // ONE MECHANISM FOR "AN ADMIN IS LOOKING AT SOMEBODY ELSE'S PAGE", and it is
  // the one that already existed. This was `/portfolio/:id` for a day, which is
  // a SECOND way to express exactly what `?as=` expresses on the dashboard, the
  // rewards page and the milestones page - a different URL shape, a different
  // banner, and a second place for the rule to drift. `useViewAs` returns null
  // for anybody who is not an admin, so the parameter is inert for a creator
  // who guesses it, and the RLS policy decides what actually comes back either
  // way. See components/ViewingAs.
  const { id: viewingId, viewing, person } = useViewAs()
  const readOnly = viewing

  const [state, setState] = useState(null)      // { creator, portfolio, videos, certificates }
  const [dirty, setDirty] = useState(false)
  const [past, setPast] = useState([])          // portfolio snapshots, oldest first
  const [saveError, setSaveError] = useState(false)
  const saveRef = useRef(null)
  const stateRef = useRef(null)
  const lastUndoPush = useRef(0)
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
    setPast([])
    lastUndoPush.current = 0
  }, [viewingId])

  useEffect(() => { load() }, [load])
  useEffect(() => { stateRef.current = state }, [state])

  // UNDO, AND WHY IT IS NOT ONE STEP PER KEYSTROKE.
  //
  // Ethan: "there should be also a back button to undo a change that you made".
  // Every control here calls `setPortfolio`, including a textarea on every
  // character - so a naive stack would make Undo a very slow backspace, and
  // twelve presses would still be inside the same sentence.
  //
  // So a change only becomes an undo point if it is the FIRST of a burst:
  // pushes inside `UNDO_COALESCE_MS` of the last one are folded into it. Typing
  // a paragraph is one entry (the state before you started typing), and so is
  // dragging a video up three places in quick succession, which is what a
  // person means by "the change I just made".
  //
  // `stateRef` exists because this callback has no deps and must not get them:
  // re-creating it on every state change re-renders the whole editor panel
  // under the cursor of whoever is typing into it.
  const pushUndo = useCallback((snapshot) => {
    const now = Date.now()
    if (now - lastUndoPush.current < UNDO_COALESCE_MS) return
    lastUndoPush.current = now
    setPast((h) => [...h.slice(-(UNDO_DEPTH - 1)), snapshot])
  }, [])

  const setPortfolio = useCallback((patch) => {
    const current = stateRef.current?.portfolio
    if (current) pushUndo(current)
    setState((s) => (s ? { ...s, portfolio: { ...s.portfolio, ...patch } } : s))
    setDirty(true)
  }, [pushUndo])

  const undo = useCallback(() => {
    if (!past.length) return
    const previous = past[past.length - 1]
    setPast((h) => h.slice(0, -1))
    setState((s) => (s ? { ...s, portfolio: previous } : s))
    setDirty(true)
    // The next edit after an undo is its own undo point rather than being
    // coalesced into whatever was typed before it.
    lastUndoPush.current = 0
  }, [past])

  async function save({ reload = true } = {}) {
    setSaving(true)
    const p = stateRef.current?.portfolio ?? state.portfolio
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
    if (error) {
      setSaveError(true)
      // A FAILED AUTOSAVE MUST NOT POP A DIALOG. It fires on a timer, so a
      // dropped connection would throw a modal into the middle of a sentence,
      // and again on the next attempt. The bar says "Not saved - retry" and
      // stays dirty; an explicit press still explains itself properly.
      if (reload) notice(error.message, { title: tr('Could not save that') })
      return
    }
    setSaveError(false)
    setDirty(false)
    // Only an EXPLICIT save re-reads. Autosave runs while somebody is typing,
    // and replacing the draft under the cursor with the server's copy loses
    // whatever they wrote in the round trip.
    if (reload) load()
    else if (slug && !p.slug) setState((st) => (st ? { ...st, portfolio: { ...st.portfolio, slug } } : st))
  }

  // AUTOSAVE, DEBOUNCED.
  //
  // Ethan: "obviously the changes should be saved automatically". They were
  // not - there was a "Save changes" button that appeared when dirty, so a
  // creator who edited their bio and closed the tab lost it.
  //
  // AUTOSAVE_MS is longer than the undo coalesce window on purpose: undo should
  // step back per edit, but a write should only happen once somebody has
  // actually stopped. Every keystroke resets the timer, so a paragraph is one
  // write rather than two hundred.
  //
  // `saveRef` keeps the effect from depending on `save`, which is redefined on
  // every render and would restart the timer forever.
  useEffect(() => { saveRef.current = save })
  useEffect(() => {
    if (readOnly || !dirty || saving) return undefined
    const t = setTimeout(() => { saveRef.current?.({ reload: false }) }, AUTOSAVE_MS)
    return () => clearTimeout(t)
  }, [dirty, saving, readOnly, state?.portfolio])

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
  const shownVideos = orderedVideos(videos, portfolio.picks, 10, workMode(portfolio))

  return (
    <div className="page max-w-6xl">
      <PageHeader
        title={tr('Portfolio')}
        subtitle={readOnly
          ? tr('You are looking at this the way the creator sees it. Nothing here can be edited by you.')
          : tr('A media kit you can send to a brand, share as a link, or download as a PDF. Every word on it is yours to change.')}
      />

      <ViewingAsBanner viewing={viewing} person={person} />

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
            {!readOnly && past.length > 0 && (
              <button type="button" onClick={undo} className="btn-secondary" title={tr('Undo the last change')}>
                <Icon name="chevronLeft" className="h-4 w-4" /> {tr('Undo')}
              </button>
            )}

            {/* THE SAVE BUTTON IS GONE, BECAUSE SAVING IS NOT A DECISION ANY
                MORE. What is left is a status: it says what just happened, and
                only becomes pressable when something needs a person - which is
                a failed write and nothing else. */}
            {!readOnly && (
              saveError ? (
                <button type="button" onClick={() => save()} disabled={saving} className="btn-secondary !text-brand">
                  <Icon name="refresh" className="h-4 w-4" /> {tr('Not saved · Retry')}
                </button>
              ) : saving ? (
                <span className="flex items-center gap-2 text-xs font-semibold text-gray-400">
                  <Spinner className="h-3.5 w-3.5" /> {tr('Saving…')}
                </span>
              ) : dirty ? (
                <span className="text-xs font-semibold text-gray-400">{tr('Saving…')}</span>
              ) : (
                <span className="flex items-center gap-1.5 text-xs font-semibold text-gray-400">
                  <Icon name="check" className="h-3.5 w-3.5" /> {tr('All changes saved')}
                </span>
              )
            )}
          </div>

          {/* Above the deck on purpose - see the note in KitStrip. */}
          {!readOnly && <KitStrip className="mb-6" />}

          <PortfolioDeck
            creator={creator}
            portfolio={portfolio}
            videos={videos}
            certificates={certificates}
            width={width}
          />

        </div>

        {!readOnly && (
          <PortfolioEditor
            portfolio={portfolio}
            creator={creator}
            videos={videos}
            shown={shownVideos}
            certificates={certificates}
            onChange={setPortfolio}
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
