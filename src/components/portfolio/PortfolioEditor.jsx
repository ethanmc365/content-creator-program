import { useState } from 'react'
import Icon from '../Icon'
import SocialMark from '../SocialMark'
import { Toggle } from '../ui'
import { cx } from '../../lib/utils'
import { pickClass } from '../../lib/pick'
import { notice } from '../../lib/confirm'
import { useT } from '../../lib/i18n'
import { DEFAULT_COPY, compactViews, copyFor, slugify, workMode } from '../../lib/portfolio'

// THE CONTROLS, BESIDE THE DOCUMENT THEY CHANGE.
//
// Ethan: "The design should be intuitive, easy to use and look good."
//
// EVERY CHANGE LANDS ON THE PAGE BESIDE IT, WITH NO PREVIEW BUTTON. That is the
// whole interaction: the document is the screen, and this panel is a set of
// handles on it. A form that has to be submitted before you can see what you
// did turns "write a headline" into a loop with a round trip in it, and people
// stop after one attempt.
//
// SECTIONS COLLAPSE, AND ONLY ONE IS OPEN. Six open accordions is a scrolling
// form beside a scrolling document, and the two scroll positions fight. One
// open section keeps the panel about the height of the thing it sits next to.

const SECTIONS = [
  { key: 'words', label: 'Words', icon: 'pencil' },
  { key: 'work', label: 'Your videos', icon: 'video' },
  { key: 'you', label: 'Tools and platforms', icon: 'user' },
  { key: 'share', label: 'Share it', icon: 'share' },
]

export default function PortfolioEditor({ portfolio, creator, videos, shown, certificates, onChange }) {
  const tr = useT()
  const [open, setOpen] = useState('words')

  return (
    <aside className="space-y-3 lg:sticky lg:top-24 lg:self-start">
      {SECTIONS.map((s) => (
        <section key={s.key} className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card">
          <button
            type="button"
            onClick={() => setOpen(open === s.key ? null : s.key)}
            aria-expanded={open === s.key}
            className="flex w-full items-center gap-3 px-4 py-3.5 text-left hover:bg-cloud/60"
          >
            <Icon name={s.icon} className="h-4 w-4 shrink-0 text-brand" />
            <span className="flex-1 text-sm font-bold text-ink">{tr(s.label)}</span>
            <Icon name="chevron-down" className={cx('h-4 w-4 shrink-0 text-gray-300 transition-transform', open === s.key && 'rotate-180')} />
          </button>
          {open === s.key && (
            <div className="space-y-5 border-t border-gray-100 p-4">
              {s.key === 'words' && <Words portfolio={portfolio} onChange={onChange} certificates={certificates} tr={tr} />}
              {s.key === 'work' && <Videos portfolio={portfolio} videos={videos} shown={shown} onChange={onChange} tr={tr} />}
              {s.key === 'you' && <YouBits portfolio={portfolio} onChange={onChange} tr={tr} />}
              {s.key === 'share' && <Share portfolio={portfolio} creator={creator} onChange={onChange} tr={tr} />}
            </div>
          )}
        </section>
      ))}

      {/* No save button here either. The page autosaves and says so in the bar
          above the document; a second control that means the same thing invites
          the question of whether it means something different. */}
    </aside>
  )
}

// ------------------------------------------------------------------ words ---
// EVERY FIELD HAS A CEILING, AND THE CEILING IS THE SLIDE.
//
// Ethan, on the about box: "if they type too much it doesn't fit in so limit it
// so that all the words fit in on the actual slide". The page is a fixed
// 1280x720 with `overflow: hidden`, so there was no feedback at all - the
// eleventh line of a paragraph simply was not painted, and the creator found
// out when a brand opened the PDF.
//
// `max` is measured against the box each string actually lands in. `about_body`
// renders at 16px/1.72 in a column about 600px wide, which is ~62 characters a
// line and ten lines before it reaches the tools row: 600. The rest are sized
// the same way. They are generous - the point is to stop the invisible cliff,
// not to make people write telegrams.
//
// `lines` is the height of the EDITOR box, not the slide. Ethan: "make that box
// bigger whenever they're typing in that box... rather than them having to
// expand it themselves." Six rows for a ten-line paragraph meant scrolling a
// textarea to read your own bio.
const WORD_FIELDS = [
  { key: 'cover_kicker', label: 'Line above your name', lines: 1, max: 52 },
  { key: 'cover_role', label: 'What you do', lines: 1, max: 44 },
  { key: 'about_title', label: 'About: heading', lines: 1, max: 34 },
  { key: 'about_body', label: 'About: your paragraph', lines: 10, max: 600 },
  { key: 'work_title', label: 'Work: heading', lines: 1, max: 34 },
  { key: 'work_body', label: 'Work: one line under it', lines: 3, max: 150 },
  { key: 'awards_title', label: 'Awards: heading', lines: 1, max: 34, needsCerts: true },
  { key: 'awards_body', label: 'Awards: one line under it', lines: 3, max: 150, needsCerts: true },
  { key: 'contact_title', label: 'Contact: heading', lines: 1, max: 34 },
  { key: 'contact_body', label: 'Contact: your paragraph', lines: 7, max: 420 },
]

function Words({ portfolio, onChange, certificates, tr }) {
  const copy = portfolio.copy || {}
  const set = (key, value) => onChange({ copy: { ...copy, [key]: value } })
  const fields = WORD_FIELDS.filter((f) => !f.needsCerts || certificates?.length)
  return (
    <>
      <p className="text-[11px] leading-relaxed text-smoke">
        {tr('Every line starts as something you could publish as it is. Change what you want, leave the rest.')}
      </p>
      {fields.map((f) => {
        const written = copy[f.key]
        const changed = typeof written === 'string' && written.trim() && written !== DEFAULT_COPY[f.key]
        const value = copyFor(copy, f.key)
        const left = f.max - value.length
        // Silent until it matters. A counter on every field all the time reads
        // as a form with ten limits in it; one that appears in the last fifth
        // reads as the page telling you where the edge is.
        const showCount = left <= Math.max(12, Math.round(f.max * 0.2))
        return (
          <div key={f.key}>
            <div className="mb-1 flex items-baseline justify-between gap-2">
              <p className="label !mb-0">{tr(f.label)}</p>
              <div className="flex items-baseline gap-2">
                {showCount && (
                  <span className={cx('text-[10px] font-semibold tabular-nums',
                    left <= 0 ? 'text-brand' : 'text-gray-400')}>
                    {left <= 0 ? tr('Full') : `${left}`}
                  </span>
                )}
                {changed && (
                  <button type="button" onClick={() => set(f.key, '')}
                    className="text-[10px] font-semibold text-gray-400 hover:text-brand">
                    {tr('Reset')}
                  </button>
                )}
              </div>
            </div>
            {f.lines > 1 ? (
              <textarea
                value={value}
                onChange={(e) => set(f.key, e.target.value.slice(0, f.max))}
                maxLength={f.max}
                rows={f.lines}
                className="input resize-y text-[13px]"
              />
            ) : (
              <input
                value={value}
                onChange={(e) => set(f.key, e.target.value.slice(0, f.max))}
                maxLength={f.max}
                className="input text-[13px]"
              />
            )}
          </div>
        )
      })}
    </>
  )
}

// ------------------------------------------------------------------- work ---
// Ethan: "the videos should show up in the order from highest views, and only
// show top 6-10. The creators should be able to choose specific videos and
// rearrange them if they'd like."
//
// SO THERE ARE TWO MODES AND THE DEFAULT IS THE GOOD ONE. Untouched, the
// portfolio shows the best work by views and needs no attention at all.
// Touching anything switches it to a hand-picked list, which is then EXACTLY
// what they chose - see `orderedVideos`.
function Videos({ portfolio, videos, shown, onChange, tr }) {
  const picks = portfolio.picks || []
  // THE MODE IS READ, NOT INFERRED - see `workMode`. Inferring it from
  // `picks.length` made this whole control dead for anybody with no videos yet.
  const auto = workMode(portfolio) === 'auto'
  const copy = portfolio.copy || {}
  const setMode = (mode, extra = {}) => onChange({ copy: { ...copy, work_mode: mode }, ...extra })

  // Unticking the LAST video used to drop the portfolio back to automatic,
  // because empty picks meant automatic. It now stays where the creator put it.
  const toggle = (id) => {
    const next = picks.includes(id) ? picks.filter((p) => p !== id) : [...picks, id]
    setMode('manual', { picks: next })
  }
  const move = (id, by) => {
    const list = [...picks]
    const from = list.indexOf(id)
    const to = from + by
    if (from < 0 || to < 0 || to >= list.length) return
    list.splice(to, 0, list.splice(from, 1)[0])
    setMode('manual', { picks: list })
  }
  // Switching from automatic to hand-picked starts from what is ON SCREEN, not
  // from nothing. Somebody pressing "choose them myself" wants to adjust the
  // six they can see, and handing them an empty portfolio to rebuild is a
  // punishment for touching the control.
  const startPicking = () => setMode('manual', { picks: shown.map((v) => v.id) })

  return (
    <>
      <div className="flex gap-2">
        <button type="button" onClick={() => setMode('auto', { picks: [] })}
          className={pickClass(auto, 'flex-1 rounded-xl border px-3 py-2 text-xs font-semibold')}>
          {tr('Best by views')}
        </button>
        <button type="button" onClick={startPicking}
          className={pickClass(!auto, 'flex-1 rounded-xl border px-3 py-2 text-xs font-semibold')}>
          {tr('Choose my own')}
        </button>
      </div>
      <p className="text-[11px] leading-relaxed text-smoke">
        {auto
          ? tr('Your ten most-viewed entries, updated by themselves as view counts change.')
          : tr('Drag order with the arrows. Untick one to take it off. Up to ten.')}
      </p>

      {videos.length === 0 && (
        <p className="rounded-xl bg-cloud/60 px-3 py-3 text-[12px] text-smoke">
          {tr('Once you enter a challenge, your videos appear here and on your portfolio automatically.')}
        </p>
      )}
      {videos.length > 0 && !auto && picks.length === 0 && (
        <p className="rounded-xl bg-amber-50 px-3 py-3 text-[12px] text-amber-800">
          {tr('Nothing is picked, so the work page is empty. Tick one below, or switch back to Best by views.')}
        </p>
      )}

      <div className="max-h-80 space-y-1.5 overflow-y-auto overscroll-contain">
        {(auto ? shown : picks.map((id) => videos.find((v) => v.id === id)).filter(Boolean)).map((v, i, arr) => (
          <VideoRow key={v.id} video={v} auto={auto} first={i === 0} last={i === arr.length - 1}
            onToggle={() => toggle(v.id)} onMove={(by) => move(v.id, by)} />
        ))}
        {!auto && videos.filter((v) => !picks.includes(v.id)).length > 0 && (
          <>
            <p className="pt-3 text-[10px] font-bold uppercase tracking-wider text-gray-400">{tr('Not shown')}</p>
            {videos.filter((v) => !picks.includes(v.id)).map((v) => (
              <VideoRow key={v.id} video={v} off onToggle={() => {
                if (picks.length >= 10) return notice(tr('Ten is the most a portfolio shows. Take one off first.'), { title: tr('That is ten') })
                toggle(v.id)
              }} />
            ))}
          </>
        )}
      </div>
    </>
  )
}

function VideoRow({ video, auto, off, first, last, onToggle, onMove }) {
  return (
    <div className={cx('flex items-center gap-2 rounded-xl border p-1.5', off ? 'border-gray-100 opacity-60' : 'border-gray-200')}>
      <div className="h-11 w-8 shrink-0 overflow-hidden rounded-md bg-cloud">
        {video.thumbnail_url && <img src={video.thumbnail_url} alt="" className="h-full w-full object-cover" loading="lazy" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12px] font-bold text-ink">{compactViews(video.views)} views</p>
        <p className="truncate text-[10px] capitalize text-smoke">{video.platform}{video.market ? ` · ${video.market}` : ''}</p>
      </div>
      {!auto && !off && (
        <div className="flex shrink-0 items-center">
          <button type="button" onClick={() => onMove(-1)} disabled={first} aria-label="Move up"
            className="flex h-6 w-6 items-center justify-center rounded text-gray-300 hover:text-smoke disabled:opacity-30">
            <Icon name="arrow-down" className="h-3.5 w-3.5 rotate-180" />
          </button>
          <button type="button" onClick={() => onMove(1)} disabled={last} aria-label="Move down"
            className="flex h-6 w-6 items-center justify-center rounded text-gray-300 hover:text-smoke disabled:opacity-30">
            <Icon name="arrow-down" className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      {!auto && (
        <button type="button" onClick={onToggle} aria-label={off ? 'Add' : 'Remove'}
          className={cx('flex h-6 w-6 shrink-0 items-center justify-center rounded', off ? 'text-brand' : 'text-gray-300 hover:text-red-500')}>
          <Icon name={off ? 'plus' : 'close'} className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  )
}

// -------------------------------------------------------------------- you ---
function YouBits({ portfolio, onChange, tr }) {
  const tools = portfolio.tools || []
  const extra = portfolio.extra_platforms || []
  const [tool, setTool] = useState('')

  const addTool = () => {
    const t = tool.trim()
    if (!t || tools.includes(t)) return setTool('')
    onChange({ tools: [...tools, t].slice(0, 12) })
    setTool('')
  }

  return (
    <>
      <div>
        <p className="label">{tr('What you shoot and edit with')}</p>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {tools.map((t) => (
            <span key={t} className="flex items-center gap-1 rounded-full bg-cloud px-2.5 py-1 text-[11px] font-semibold text-smoke">
              {t}
              <button type="button" onClick={() => onChange({ tools: tools.filter((x) => x !== t) })} aria-label={`Remove ${t}`}>
                <Icon name="close" className="h-3 w-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            value={tool}
            onChange={(e) => setTool(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addTool() } }}
            placeholder={tr('e.g. iPhone 15 Pro, CapCut, DJI Mini')}
            className="input flex-1 text-[13px]"
          />
          <button type="button" onClick={addTool} className="btn-secondary !px-3">
            <Icon name="plus" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div>
        <p className="label">{tr('Other platforms you post on')}</p>
        <p className="mb-2 text-[11px] leading-relaxed text-smoke">
          {tr('The ones you have entered challenges from are already on there. Add anything else.')}
        </p>
        {extra.map((row, i) => (
          <div key={i} className="mb-1.5 flex items-center gap-1.5">
            {/* THE MARK APPEARS AS YOU TYPE. Ethan: "have the actual social
                media icons, for example, TikTok icon. And even showing up
                whenever you're actually entering the thing."
                `SocialMark` already draws the real glyphs and falls back to a
                chain link for anything it does not know, so typing "tik" turns
                into the TikTok note in front of you - which is also the fastest
                way to find out you have spelled it wrong. */}
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-gray-200 text-smoke">
              <SocialMark brand={String(row.platform || '').trim().toLowerCase()} className="h-4 w-4" />
            </span>
            <input value={row.platform || ''} placeholder={tr('Platform')}
              onChange={(e) => onChange({ extra_platforms: extra.map((r, j) => (j === i ? { ...r, platform: e.target.value } : r)) })}
              className="input w-[32%] text-[12px]" />
            <input value={row.handle || ''} placeholder={tr('@handle')}
              onChange={(e) => onChange({ extra_platforms: extra.map((r, j) => (j === i ? { ...r, handle: e.target.value } : r)) })}
              className="input flex-1 text-[12px]" />
            <button type="button" onClick={() => onChange({ extra_platforms: extra.filter((_, j) => j !== i) })}
              aria-label={tr('Remove')}
              className="flex h-9 w-8 shrink-0 items-center justify-center rounded-lg text-gray-300 hover:text-red-500">
              <Icon name="close" className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
        <button type="button" onClick={() => onChange({ extra_platforms: [...extra, { platform: '', handle: '' }] })}
          className="mt-1 text-[12px] font-semibold text-brand hover:underline">
          + {tr('Add a platform')}
        </button>
      </div>
    </>
  )
}

// ------------------------------------------------------------------ share ---
function Share({ portfolio, creator, onChange, tr }) {
  const slug = portfolio.slug || slugify(creator?.name)
  const url = `${window.location.origin}/p/${slug}`
  return (
    <>
      {/* TWO SWITCHES, TWO DECISIONS. See migration 223: showing your work to
          the community you are already in is a much smaller thing than putting
          it on the open web, and plenty of people want the first without the
          second. */}
      <Row
        title={tr('Show it on my profile')}
        hint={tr('Other creators in the community see it on your profile page. It does not go on the web.')}
        on={portfolio.show_on_profile}
        onChange={(on) => onChange({ show_on_profile: on })}
      />
      <Row
        title={tr('Publish it as a link')}
        hint={tr('Anybody with the address can open it, and search engines can find it. Nothing else about your account is shown.')}
        on={portfolio.is_public}
        onChange={(on) => onChange({ is_public: on })}
      />

      {portfolio.is_public && (
        <div className="rounded-xl bg-cloud/60 p-3">
          <p className="label">{tr('Your web address')}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded-lg bg-white px-2.5 py-2 text-[11px] text-ink">{url}</code>
            <button
              type="button"
              onClick={() => { navigator.clipboard?.writeText(url); notice(tr('Copied. Paste it into your bio or send it to a brand.'), { title: tr('Copied') }) }}
              className="btn-secondary !px-3 !py-2"
              aria-label={tr('Copy')}
            >
              <Icon name="copy" className="h-4 w-4" />
            </button>
          </div>
          {!portfolio.slug && (
            <p className="mt-2 text-[11px] text-smoke">
              {tr('This becomes real when you save.')}
            </p>
          )}
        </div>
      )}
    </>
  )
}

function Row({ title, hint, on, onChange }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[13px] font-bold text-ink">{title}</p>
        <p className="mt-0.5 text-[11px] leading-relaxed text-smoke">{hint}</p>
      </div>
      <Toggle on={on} onChange={onChange} label={title} />
    </div>
  )
}
