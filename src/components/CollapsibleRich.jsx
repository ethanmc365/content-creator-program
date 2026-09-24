import { useLayoutEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { mdToHtml } from '../lib/richEditor'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

// A BRIEF THAT OPENS ON ITS FIRST PARAGRAPH (21 Sep 2026).
//
// Ethan, of the Global Challenge: "I would have this collapsible so it only
// shows the first paragraph and then has an arrow to extend it to read it all
// ... and then you can collapse it again to hide it so it's not taking up so
// much space. Same for rules." The points table and the leaderboard sit under
// the brief, and a long brief pushed them a screen away.
//
// The whole text is rendered once (so nothing re-parses on toggle) and the box
// is clipped to the bottom of the first block of prose - the heading above it
// comes along. When the rest is shorter than a couple of lines there is nothing
// worth hiding and no control is drawn at all.
export default function CollapsibleRich({ md = '', className = '' }) {
  const tr = useT()
  const body = useRef(null)
  const [open, setOpen] = useState(false)
  const [clip, setClip] = useState(null) // px, or null when it all fits
  const [full, setFull] = useState(0)

  useLayoutEffect(() => {
    const el = body.current
    if (!el) return undefined
    const measure = () => {
      const kids = [...el.children]
      const first = kids.find((k) => !/^H[1-6]$/.test(k.tagName)) || kids[0]
      const total = el.scrollHeight
      setFull(total)
      if (!first) { setClip(null); return }
      // A LONG list (more than six) folds after its third item rather than
      // after the whole list, which would be no fold at all.
      const items = /^(UL|OL)$/.test(first.tagName) ? [...first.children] : []
      const cut = items.length > 6 ? items[2] : first
      const bottom = cut === first
        ? first.offsetTop + first.offsetHeight
        : first.offsetTop + cut.offsetTop + cut.offsetHeight
      // Clip a little PAST the paragraph, so the fade sits over the next
      // block and the first paragraph itself is read in full.
      setClip(total - bottom > 72 ? bottom + 40 : null)
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [md])

  const collapsed = clip != null && !open
  return (
    <div className={className}>
      <div
        className="relative overflow-hidden transition-[max-height] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
        style={clip != null ? { maxHeight: open ? full + 24 : clip } : undefined}
      >
        <div
          ref={body}
          className="rt-editor rt-brief leading-relaxed text-ink"
          dangerouslySetInnerHTML={{ __html: mdToHtml(md) }}
        />
        {/* The fade says "there is more" before the button does. */}
        <span
          aria-hidden
          className={cx(
            'pointer-events-none absolute inset-x-0 bottom-0 h-12 bg-gradient-to-t from-white to-transparent transition-opacity duration-300',
            collapsed ? 'opacity-100' : 'opacity-0',
          )}
        />
      </div>
      {clip != null && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white shadow-card transition-transform duration-200 hover:-translate-y-0.5 active:scale-95"
        >
          {open ? tr('Show less') : tr('Read all')}
          <Icon name="chevronDown" className={cx('h-4 w-4 transition-transform duration-300', open && 'rotate-180')} />
        </button>
      )}
    </div>
  )
}
