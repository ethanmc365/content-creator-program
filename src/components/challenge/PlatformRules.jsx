import SocialMark from '../SocialMark'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'

// WHAT COUNTS ON EACH PLATFORM, SPELLED OUT (19 Oct 2026).
//
// The brief listed the platforms as chips and then said, under all of them, "Photo posts and carousels do not count".
// That was wrong for TikTok: a TikTok photo carousel has a view count, the sync reads it, it counts - and they are some
// of the best performers in the programme. The team wanted it highlighted, and the rule made clear per platform. So each
// platform is a tile with what counts (ticked) and what does not (crossed), and the TikTok carousel line is called out.
// The refusals match lib/photoPost, which turns away Instagram and Facebook photo posts at submit.
// Built with the reader's `tr`, so every word is a literal the translation catalogue can see.
const rulesFor = (tr) => ({
  TikTok: { yes: [tr('Videos'), tr('Photo carousels')], no: [] },
  Instagram: { yes: [tr('Reels')], no: [tr('Photo posts'), tr('Carousels')] },
  Facebook: { yes: [tr('Reels'), tr('Videos')], no: [tr('Photo posts')] },
  YouTube: { yes: [tr('Shorts'), tr('Videos')], no: [] },
})
const BRAND = { Instagram: 'instagram', TikTok: 'tiktok', YouTube: 'youtube', Facebook: 'facebook' }
const ORDER = ['TikTok', 'Instagram', 'Facebook', 'YouTube']

export default function PlatformRules({ platforms = [] }) {
  const tr = useT()
  const RULES = rulesFor(tr)
  const list = [...platforms].sort((a, b) => (ORDER.indexOf(a) + 1 || 99) - (ORDER.indexOf(b) + 1 || 99))
  if (!list.length) return <p className="text-sm text-smoke">{tr('Any platform.')}</p>
  return (
    <ul className="space-y-2">
      {/* Every tick the same green, and no legend: a tick and a crossed-out word explain themselves (Ethan). */}
      {list.map((p, i) => {
        const r = RULES[p] || { yes: [tr('Videos')], no: [] }
        return (
          <li
            key={p}
            className="rounded-2xl border border-gray-100 bg-white px-3.5 py-3 shadow-card animate-fade-up"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <p className="flex items-center gap-2 text-sm font-bold text-ink">
              <SocialMark brand={BRAND[p] || 'link'} colored className="h-5 w-5 shrink-0" />
              {p}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {r.yes.map((x) => (
                <span key={x} className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                  <Tick />{x}
                </span>
              ))}
              {r.no.map((x) => (
                <span key={x} className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2.5 py-1 text-xs font-semibold text-gray-500" title={tr('Does not count')}>
                  <Cross /><span className="line-through decoration-gray-400">{x}</span>
                </span>
              ))}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

function Tick({ className = '' }) {
  return <svg viewBox="0 0 16 16" className={cx('h-3.5 w-3.5 shrink-0', className)} aria-hidden><path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
}
function Cross({ className = '' }) {
  return <svg viewBox="0 0 16 16" className={cx('h-3 w-3 shrink-0', className)} aria-hidden><path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
}
