import { useEffect, useMemo, useRef, useState } from 'react'
import { renderNote } from '../../lib/noteMarkdown'
import { cx } from '../../lib/utils'

// AN AGREEMENT, READ AS A DOCUMENT (7 Oct 2026).
//
// Ethan, on the first sheet (a list of headings as chips and a "Read the full text" button): "Should it always show up
// as full text rather than those buttons ... or they can expand it to read it all, like the other websites go." The
// full text is what is being agreed to, so it is what is shown - the way the better clickwrap screens do it: the
// whole document in a reading pane, a strip of its sections that follows you as you read and jumps on a press, and a
// thin line that says how far through you are. Nobody is made to scroll to the bottom first; the text is simply there.
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
 * @param navTop      the sticky offset of the section strip inside that scroller
 */
export default function AgreementDoc({ body, scrollRef, navTop = 0, className, onProgress }) {
  const { intro, sections } = useMemo(() => splitSections(body), [body])
  const [active, setActive] = useState(sections[0]?.id || null)
  const navRef = useRef(null)
  const rootRef = useRef(null)

  // Which section is being read, and how far through the document. One scroll listener, measured, not observed: an
  // IntersectionObserver on a scroller inside a fixed sheet reports the wrong root on iOS 16.
  useEffect(() => {
    const scroller = scrollRef?.current || window
    const box = () => (scrollRef?.current ? scrollRef.current.getBoundingClientRect() : { top: 0, height: window.innerHeight })
    let raf = 0
    const read = () => {
      raf = 0
      const root = rootRef.current
      if (!root) return
      const b = box()
      const line = b.top + Math.min(160, b.height * 0.3)
      let current = sections[0]?.id || null
      for (const s of sections) {
        const el = root.querySelector(`#${CSS.escape(s.id)}`)
        if (el && el.getBoundingClientRect().top <= line) current = s.id
      }
      setActive(current)
      if (onProgress) {
        const r = root.getBoundingClientRect()
        const total = r.height - b.height * 0.6
        onProgress(total <= 0 ? 1 : Math.max(0, Math.min(1, (b.top - r.top) / total)))
      }
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(read) }
    read()
    scroller.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => { scroller.removeEventListener('scroll', onScroll); window.removeEventListener('resize', onScroll); if (raf) cancelAnimationFrame(raf) }
  }, [sections, scrollRef, onProgress])

  // Keep the lit chip in view on the strip as the reader moves down.
  useEffect(() => {
    const chip = navRef.current?.querySelector(`[data-chip="${active}"]`)
    if (!chip || !navRef.current) return
    const nav = navRef.current
    const left = chip.offsetLeft - nav.clientWidth / 2 + chip.clientWidth / 2
    nav.scrollTo({ left: Math.max(0, left), behavior: 'smooth' })
  }, [active])

  const jump = (id) => {
    const el = rootRef.current?.querySelector(`#${CSS.escape(id)}`)
    if (!el) return
    const scroller = scrollRef?.current
    if (scroller) {
      const top = el.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop - navTop - 56
      scroller.scrollTo({ top, behavior: 'smooth' })
    } else {
      window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 120, behavior: 'smooth' })
    }
  }

  return (
    <div ref={rootRef} className={cx('agreement-doc', className)}>
      {sections.length > 2 && (
        <nav
          ref={navRef}
          aria-label="Sections"
          className="agreement-nav sticky z-10 -mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 py-2"
          style={{ top: navTop }}
        >
          {sections.map((s) => (
            <button
              key={s.id} type="button" data-chip={s.id} onClick={() => jump(s.id)} aria-current={active === s.id ? 'true' : undefined}
              className={cx('flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold transition-all duration-300',
                active === s.id ? 'border-brand bg-brand text-white shadow-card' : 'border-gray-200 bg-white text-ink hoverable:hover:-translate-y-px hoverable:hover:border-brand/50')}
            >
              <span className={cx('tabular-nums', active === s.id ? 'text-white/80' : 'text-brand')}>{s.n}</span>{s.title}
            </button>
          ))}
        </nav>
      )}
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
