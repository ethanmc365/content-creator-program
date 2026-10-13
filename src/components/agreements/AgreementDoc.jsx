import { useEffect, useMemo, useRef } from 'react'
import { renderNote } from '../../lib/noteMarkdown'
import { cx } from '../../lib/utils'

// AN AGREEMENT, READ AS A DOCUMENT.
//
// The team, on the first sheet (a list of headings as chips and a "Read the full text" button): "Should it always show
// up as full text rather than those buttons... or they can expand it to read it all, like the other websites go." The
// full text is what is being agreed to, so it is what is shown - the way the better clickwrap screens do it: the whole
// document in a reading pane and a line that says how far through you are. Nobody is made to scroll to the bottom first;
// the text is simply there.
//
// THE NUMBERED STRIP IS GONE. The sections keep their numbers in the text; the reader scrolls or accepts.
//
// The same component draws the document in the sign-up sheet, in Settings > Agreements and on Admin > Agreements, so
// the team previews exactly what a creator reads.

const slug = (s, i) => `${i + 1}-${String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)}`

/** The document split into the part before the first section (the parties, the summary) and its numbered sections. */
export function splitSections(md = '') {
  const lines = String(md || '').replace(/\r\n/g, '\n').replace(/^[\s\u200b\ufeff]+/, '').split('\n')
  // The `# Title` line is the sheet's own heading, so the text starts after it.
  if (/^\s*#\s+/.test(lines[0] || '')) lines.shift()
  const intro = []
  const sections = []
  for (const line of lines) {
    const h = line.match(/^##\s+(.*)$/)
    if (h) {
      const raw = h[1].trim()
      const num = raw.match(/^(\d+)\.\s*/)
      const title = raw.replace(/^\d+\.\s*/, '')
      sections.push({ id: `ag-${slug(title, sections.length)}`, n: num ? num[1] : String(sections.length + 1), title, lines: [] })
    } else if (sections.length) sections[sections.length - 1].lines.push(line)
    else intro.push(line)
  }
  return { intro: intro.join('\n').trim(), sections: sections.map((s) => ({ ...s, body: s.lines.join('\n').trim() })) }
}

/** The section headings of a document, for "what is inside". */
export function headingsOf(md = '') {
  return splitSections(md).sections.map((s) => s.title)
}

/**
 * @param body        the markdown, already filled in for the reader
 * @param scrollRef   the element that scrolls (the sheet's body, or the window when omitted)
 */
export default function AgreementDoc({ body, scrollRef, className, onProgress }) {
  const { intro, sections } = useMemo(() => splitSections(body), [body])
  const rootRef = useRef(null)

  // How far through the document. One scroll listener, measured, not observed: an IntersectionObserver on a scroller
  // inside a fixed sheet reports the wrong root on iOS 16.
  useEffect(() => {
    if (!onProgress) return undefined
    const scroller = scrollRef?.current || window
    const box = () => (scrollRef?.current ? scrollRef.current.getBoundingClientRect() : { top: 0, height: window.innerHeight })
    let raf = 0
    const read = () => {
      raf = 0
      const root = rootRef.current
      if (!root) return
      const b = box()
      const r = root.getBoundingClientRect()
      const total = r.height - b.height * 0.6
      onProgress(total <= 0 ? 1 : Math.max(0, Math.min(1, (b.top - r.top) / total)))
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read) }
    read()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { scroller.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [sections, scrollRef, onProgress])

  return (
    <div ref={rootRef} className={cx('agreement-doc', className)}>
      {intro && <div className="agreement-text agreement-intro text-[14.5px]">{renderNote(intro)}</div>}
      {sections.map((s, i) => (
        <section key={s.id} id={s.id} className="agreement-section scroll-mt-24" style={{ animationDelay: `${Math.min(i, 8) * 40}ms` }}>
          <h3 className="flex items-baseline gap-2.5 text-[17px] font-bold leading-snug text-ink">
            <span className="text-[13px] font-black tabular-nums text-brand">{s.n}</span>{s.title}
          </h3>
          <div className="agreement-text mt-1.5 text-[14.5px]">{renderNote(s.body)}</div>
        </section>
      ))}
    </div>
  )
}
