import { forwardRef, useEffect, useState } from 'react'
import { About, Awards, Contact, Cover, Work } from './Slides'
import { PAGE_H, PAGE_W, orderedVideos, workMode } from '../../lib/portfolio'

// THE WHOLE DOCUMENT, SCALED TO THE COLUMN IT IS IN.
//
// Ethan: "it should show on the screen exactly how the pdf will look... you can
// scroll vertically down to see each new page."
//
// SO IT IS A STACK OF PAGES AND NOT A WEB PAGE. Each one is the fixed A4 node
// from Slides.jsx, transformed to fit whatever width it is given and wrapped in
// a box of the SCALED height - a transform does not affect layout, so without
// the wrapper the browser reserves 794px for a page drawn at 380 and every page
// has half a screen of white under it.
//
// THE NODES ARE HANDED BACK THROUGH `pageRefs`. That is what the export
// photographs: the same DOM the creator is looking at, at 2x, rather than a
// second drawing of it. See lib/portfolioPdf.

// How many videos fit on a work page. FOUR, not six, since the redesign:
// the tiles are 264x430 - a quarter of the content width, at the shape a
// vertical video actually is - rather than six 84x150 thumbnails with their
// numbers in a column of text beside them. See Slides.Work.
const PER_WORK_PAGE = 4

/**
 * Build the page list. Pure, and separate from the rendering, because the
 * export needs to know how many pages there are before any of them exist.
 */
export function buildPages({ videos = [], certificates = [] } = {}) {
  const pages = [{ key: 'cover' }, { key: 'about' }]
  const chunks = []
  for (let i = 0; i < videos.length; i += PER_WORK_PAGE) {
    chunks.push(videos.slice(i, i + PER_WORK_PAGE))
  }
  // A portfolio with no entries yet still gets a work page, because an empty
  // one says "no videos here yet" and a missing one silently renumbers the
  // document - and the creator wonders where their work went.
  if (chunks.length === 0) chunks.push([])
  chunks.forEach((videos, i) => pages.push({ key: `work-${i}`, videos, first: i === 0 }))
  if (certificates.length) pages.push({ key: 'awards' })
  pages.push({ key: 'contact' })
  return pages
}

const PortfolioDeck = forwardRef(function PortfolioDeck(
  { creator, portfolio, videos, certificates, width, pageRefs, gap = 28, horizontal = false, onPageCount },
  ref,
) {
  const all = videos || []
  const picked = orderedVideos(all, portfolio?.picks || [], 10, workMode(portfolio))
  const pages = buildPages({ videos: picked, certificates: certificates || [] })
  const scale = width / PAGE_W

  useEffect(() => { onPageCount?.(pages.length) }, [pages.length, onPageCount])

  const common = {
    creator,
    copy: portfolio?.copy || {},
    videos: all,
    extraPlatforms: portfolio?.extra_platforms || [],
    tools: portfolio?.tools || [],
    total: pages.length,
  }

  return (
    // VERTICAL IS A DOCUMENT AND HORIZONTAL IS A PAGER. The pages are the same
    // nodes either way; only the axis changes. `/portfolio` reads top-to-bottom
    // because that is how you read a document; the profile embed pages sideways
    // because there it is one section among nine, and five stacked A4 pages
    // would bury everything under it.
    <div
      ref={ref}
      style={horizontal
        ? { display: 'flex', gap, width: 'max-content' }
        : { display: 'flex', flexDirection: 'column', gap, width }}
    >
      {pages.map((p, i) => (
        <Sheet key={p.key} scale={scale} width={width} snap={horizontal} setRef={(el) => { if (pageRefs) pageRefs.current[i] = el }}>
          {p.key === 'cover' && <Cover {...common} />}
          {p.key === 'about' && <About {...common} n={i + 1} />}
          {p.key.startsWith('work') && <Work {...common} videos={p.videos} n={i + 1} />}
          {p.key === 'awards' && <Awards {...common} certificates={certificates || []} n={i + 1} />}
          {p.key === 'contact' && <Contact {...common} n={i + 1} />}
        </Sheet>
      ))}
    </div>
  )
})

function Sheet({ scale, width, snap, setRef, children }) {
  return (
    <div
      className={snap ? 'snap-start' : undefined}
      style={{
        width, flex: snap ? `0 0 ${width}px` : undefined,
        height: PAGE_H * scale, overflow: 'hidden',
        borderRadius: 14 * Math.min(1, scale * 1.6),
        boxShadow: '0 2px 14px rgba(0,0,0,0.07)',
        background: '#fff',
      }}
    >
      {/* The ref is on the UNSCALED node, which is what gets photographed. */}
      <div ref={setRef} style={{ transform: `scale(${scale})`, transformOrigin: 'top left' }}>
        {children}
      </div>
    </div>
  )
}

export default PortfolioDeck

/**
 * Measures its box and tells you how wide the deck may be.
 *
 * A CALLBACK REF, NOT A `useRef`, AND THAT IS A BUG FIX.
 *
 * The first version was `const holder = useRef(null)` with an effect that read
 * `holder.current` and bailed when it was null. On this page that is always
 * null on the first run: `Portfolio` renders a SKELETON while it loads, so the
 * div this attaches to does not exist yet - and the effect's deps never change,
 * so it never ran again once the real div arrived. The deck sat at its 280px
 * fallback inside a 696px column for ever, which looks like a styling problem
 * and is not one.
 *
 * A callback ref puts the element in STATE, so the effect is keyed on the thing
 * it actually depends on and re-runs the moment it exists. The general rule,
 * which has cost this codebase a session before: an effect that reads a ref and
 * returns early when it is empty must be keyed on the element, not on nothing.
 */
export function useFluidWidth(min = 280) {
  const [node, setNode] = useState(null)
  const [width, setWidth] = useState(min)
  useEffect(() => {
    if (!node) return undefined
    const measure = () => setWidth(Math.max(min, node.clientWidth))
    const ro = new ResizeObserver(measure)
    ro.observe(node)
    measure()
    return () => ro.disconnect()
  }, [node, min])
  return [setNode, width]
}
