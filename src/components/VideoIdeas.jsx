import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Icon from './Icon'
import VideoThumb from './VideoThumb'
import VideoEmbedModal from './VideoEmbedModal'
import SocialMark from './SocialMark'
import { Avatar, Skeleton } from './ui'
import { CountUp } from './network/Motion'
import { copyToClipboard } from '../lib/clipboard'
import { toastSuccess } from '../lib/toast'
import { formatViews, cx } from '../lib/utils'
import { useT } from '../lib/i18n'

// VIDEO IDEAS (7 Oct 2026).
//
// Ethan: "we currently have the video tracker admin tool, but I want to create a space ... that shows the top videos
// that the general community members have access to and that the VIP creators have access to, so they can view the
// top videos and get ideas from them ... It can scroll. I think they should scroll maybe horizontally and see the
// hooks for the creators and how many views it got ... only show videos that have got 50k or more."
//
// The rows come from the tracker the team already curates (`video_ideas`, migration 351: tracked videos with 50,000
// views or more). Each row scrolls sideways with snap points; a card is the cover, the views, the hook in big type and
// who made it. Pressing it plays the video here; the hook copies with one press, because copying the hook is the
// whole point of the page.
export const IDEAS_MIN_VIEWS = 50000

export function useVideoIdeas() {
  const [rows, setRows] = useState(undefined)
  useEffect(() => {
    let alive = true
    supabase.rpc('video_ideas', { p_min: IDEAS_MIN_VIEWS }).then(({ data, error }) => {
      if (alive) setRows(error ? [] : (data || []))
    })
    return () => { alive = false }
  }, [])
  return rows
}

const PLATFORM_ORDER = ['TikTok', 'Instagram', 'YouTube', 'Facebook']
const DAY = 86400000

/** The shelves the page draws, from the rows: biggest, newest, then one per platform with at least two videos. */
export function shelvesFor(rows, tr = (s) => s) {
  if (!rows?.length) return []
  const byViews = [...rows].sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0))
  const shelves = [{ key: 'top', title: tr('The biggest hits'), hint: tr('The most viewed videos the community has made'), rows: byViews.slice(0, 15) }]
  const recent = rows.filter((r) => r.posted_at && Date.now() - Date.parse(r.posted_at) < 45 * DAY)
    .sort((a, b) => Date.parse(b.posted_at) - Date.parse(a.posted_at))
  if (recent.length >= 2) shelves.push({ key: 'new', title: tr('Working right now'), hint: tr('Posted in the last six weeks'), rows: recent.slice(0, 15) })
  for (const p of PLATFORM_ORDER) {
    const list = byViews.filter((r) => r.platform === p)
    // A platform shelf that holds every video would only repeat the first shelf.
    if (list.length >= 2 && list.length < rows.length) shelves.push({ key: p, title: tr('Best on {p}', { p }), hint: null, platform: p, rows: list.slice(0, 15) })
  }
  return shelves
}

export default function VideoIdeasBoard({ compact = false }) {
  const tr = useT()
  const rows = useVideoIdeas()
  const [playing, setPlaying] = useState(null)
  const shelves = useMemo(() => shelvesFor(rows, tr), [rows, tr])
  const total = (rows || []).reduce((n, r) => n + (Number(r.views) || 0), 0)
  const hooks = useMemo(() => (rows || []).filter((r) => r.hook).sort((a, b) => b.views - a.views).slice(0, 12), [rows])

  return (
    <div className="space-y-8">
      <IdeasHero count={rows?.length} total={total} compact={compact} />
      {rows === undefined ? (
        <div className="flex gap-4 overflow-hidden">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[380px] w-[220px] shrink-0 rounded-3xl" />)}</div>
      ) : rows.length === 0 ? (
        <div className="rounded-card border border-dashed border-gray-200 bg-white px-6 py-14 text-center">
          <Icon name="bulb" className="mx-auto h-8 w-8 text-brand" />
          <p className="mt-3 font-semibold text-ink">{tr('No 50k videos yet')}</p>
          <p className="mt-1 text-sm text-smoke">{tr('The first video to pass 50,000 views lands here.')}</p>
        </div>
      ) : (
        <>
          {shelves.map((s, i) => <Shelf key={s.key} shelf={s} index={i} onPlay={setPlaying} />)}
          {hooks.length > 0 && <HookWall hooks={hooks} />}
        </>
      )}
      {playing && <VideoEmbedModal url={playing.video_url} platform={playing.platform} title={playing.hook || playing.creator_name} onClose={() => setPlaying(null)} />}
    </div>
  )
}

function IdeasHero({ count, total, compact }) {
  const tr = useT()
  return (
    <section className={cx('ideas-hero relative overflow-hidden rounded-[28px] bg-ink text-white shadow-lift', compact ? 'px-5 py-6' : 'px-6 py-8 sm:px-10 sm:py-10')}>
      <span aria-hidden className="ideas-orb ideas-orb-a" />
      <span aria-hidden className="ideas-orb ideas-orb-b" />
      <div className="relative max-w-2xl">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-brand-light"><Icon name="bulb" className="h-4 w-4" />{tr('Video Ideas')}</p>
        <h1 className={cx('mt-2 font-extrabold leading-[1.05] tracking-tight', compact ? 'text-2xl' : 'text-3xl sm:text-[40px]')}>
          {tr('Steal the hooks that got 50k views')}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-white/75 sm:text-[15px]">
          {tr('Every video here passed 50,000 views. Watch how they open, copy the hook, and make it yours.')}
        </p>
        {count > 0 && (
          <div className="mt-5 flex flex-wrap gap-2.5">
            <span className="rounded-full bg-white/10 px-3.5 py-1.5 text-xs font-bold tabular-nums ring-1 ring-white/15">
              <CountUp value={count} /> {tr('videos')}
            </span>
            <span className="rounded-full bg-brand px-3.5 py-1.5 text-xs font-bold tabular-nums shadow-card">
              <CountUp value={total} format={formatViews} /> {tr('views between them')}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}

function Shelf({ shelf, index, onPlay }) {
  const tr = useT()
  const ref = useRef(null)
  const [edge, setEdge] = useState({ start: true, end: false })
  const measure = () => {
    const el = ref.current
    if (!el) return
    setEdge({ start: el.scrollLeft < 8, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 8 })
  }
  useEffect(() => { measure() }, [shelf.rows.length])
  const nudge = (dir) => ref.current?.scrollBy({ left: dir * Math.max(240, ref.current.clientWidth * 0.8), behavior: 'smooth' })

  return (
    <section className="animate-rise" style={{ animationDelay: `${Math.min(index, 5) * 70}ms` }}>
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
            {shelf.platform ? <SocialMark brand={shelf.platform.toLowerCase()} className="h-5 w-5" colored /> : <Icon name={shelf.key === 'new' ? 'fire' : 'trophy'} className="h-5 w-5 text-brand" />}
            {shelf.title}
          </h2>
          {shelf.hint && <p className="text-xs text-smoke">{shelf.hint}</p>}
        </div>
        <div className="hidden shrink-0 gap-1.5 sm:flex">
          <button type="button" onClick={() => nudge(-1)} disabled={edge.start} aria-label={tr('Scroll back')} className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-ink shadow-sm transition-all duration-200 disabled:opacity-30 hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-card"><Icon name="chevronLeft" className="h-4 w-4" /></button>
          <button type="button" onClick={() => nudge(1)} disabled={edge.end} aria-label={tr('Scroll on')} className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-ink shadow-sm transition-all duration-200 disabled:opacity-30 hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-card"><Icon name="chevronRight" className="h-4 w-4" /></button>
        </div>
      </div>
      <div className="relative">
        <div ref={ref} onScroll={measure} className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-3 pt-1 sm:-mx-6 sm:scroll-px-6 sm:px-6">
          {shelf.rows.map((v, i) => <IdeaCard key={v.id} v={v} rank={shelf.key === 'top' ? i + 1 : null} delay={i} onPlay={() => onPlay(v)} />)}
        </div>
        {!edge.end && <span aria-hidden className="pointer-events-none absolute inset-y-0 -right-4 w-12 ideas-fade sm:-right-6" />}
      </div>
    </section>
  )
}

function IdeaCard({ v, rank, delay, onPlay }) {
  const tr = useT()
  const copy = async (e) => {
    e.stopPropagation()
    if (await copyToClipboard(v.hook)) toastSuccess(tr('Hook copied'))
  }
  return (
    <article
      className="idea-card group relative w-[210px] shrink-0 snap-start overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-black/5 transition-all duration-300 hoverable:hover:-translate-y-1.5 hoverable:hover:shadow-lift sm:w-[232px]"
      style={{ animationDelay: `${Math.min(delay, 8) * 55}ms` }}
    >
      <button type="button" onClick={onPlay} className="block w-full text-left" aria-label={tr('Play {who}', { who: v.hook || v.creator_name || '' })}>
        <div className="relative">
          <VideoThumb url={v.video_url} platform={v.platform} thumbnailUrl={v.thumbnail_url} className="!aspect-[9/14] transition-transform duration-500 group-hover:scale-[1.04]" mark={false} />
          <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/85 via-black/20 to-black/10" />
          <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-bold tabular-nums text-white backdrop-blur-md">
            <Icon name="eye" className="h-3.5 w-3.5" />{formatViews(v.views)}
          </span>
          {rank && rank <= 3 && (
            <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-light to-brand text-xs font-black text-white shadow-card">{rank}</span>
          )}
          <span className="absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-300 group-hover:opacity-100">
            <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/90 text-brand shadow-lift backdrop-blur"><svg viewBox="0 0 24 24" className="ml-0.5 h-6 w-6" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l11-6.5a1 1 0 0 0 0-1.72l-11-6.5A1 1 0 0 0 8 5.5z" /></svg></span>
          </span>
          {v.hook && (
            <p className="absolute inset-x-3 bottom-3 line-clamp-4 text-[15px] font-extrabold leading-snug text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.5)] [overflow-wrap:anywhere]">
              &ldquo;{v.hook}&rdquo;
            </p>
          )}
        </div>
      </button>
      <div className="flex items-center gap-2 px-3 py-2.5">
        {v.creator_id ? (
          <Link to={`/profile/${v.creator_id}`} className="flex min-w-0 flex-1 items-center gap-2">
            <Avatar src={v.creator_photo} name={v.creator_name || ''} size="xs" />
            <span className="min-w-0">
              <span className="block truncate text-[12.5px] font-semibold text-ink">{v.creator_name}</span>
              <span className="block truncate text-[10.5px] text-smoke">{[v.platform, v.market_name].filter(Boolean).join(' · ')}</span>
            </span>
          </Link>
        ) : (
          <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink">{v.creator_name || v.platform}</span>
        )}
        {v.hook && (
          <button type="button" onClick={copy} aria-label={tr('Copy the hook')} title={tr('Copy the hook')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-brand transition-all duration-200 hoverable:hover:scale-110 hoverable:hover:bg-brand-tint">
            <Icon name="copy" className="h-4 w-4" />
          </button>
        )}
        <a href={v.video_url} target="_blank" rel="noopener noreferrer" aria-label={tr('Open the original post')} title={tr('Open the original post')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-smoke transition-all duration-200 hoverable:hover:scale-110 hoverable:hover:bg-cloud hoverable:hover:text-ink">
          <Icon name="link" className="h-4 w-4" />
        </a>
      </div>
    </article>
  )
}

function HookWall({ hooks }) {
  const tr = useT()
  const [copied, setCopied] = useState(null)
  return (
    <section className="animate-rise rounded-[28px] bg-gradient-to-br from-brand to-brand-light p-5 text-white shadow-card sm:p-7">
      <h2 className="flex items-center gap-2 text-lg font-bold"><Icon name="quote" className="h-5 w-5" />{tr('Hooks that worked')}</h2>
      <p className="mt-0.5 text-sm text-white/80">{tr('Tap one to copy it.')}</p>
      <ul className="mt-4 grid gap-2.5 sm:grid-cols-2">
        {hooks.map((h) => (
          <li key={h.id}>
            <button
              type="button"
              onClick={async () => { if (await copyToClipboard(h.hook)) { setCopied(h.id); toastSuccess(tr('Hook copied')); setTimeout(() => setCopied((c) => (c === h.id ? null : c)), 1600) } }}
              className="group flex w-full items-start gap-3 rounded-2xl bg-white px-4 py-3 text-left text-ink shadow-sm transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-card"
            >
              <span className="min-w-0 flex-1 text-[14px] font-semibold leading-snug [overflow-wrap:anywhere]">&ldquo;{h.hook}&rdquo;</span>
              <span className="flex shrink-0 flex-col items-end gap-1">
                <span className="rounded-full bg-brand-tint px-2 py-0.5 text-[10.5px] font-bold tabular-nums text-brand">{formatViews(h.views)}</span>
                <Icon name={copied === h.id ? 'check' : 'copy'} className={cx('h-4 w-4 transition-colors', copied === h.id ? 'text-brand' : 'text-gray-300 group-hover:text-brand')} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
