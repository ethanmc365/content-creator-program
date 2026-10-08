import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Icon from './Icon'
import VideoThumb from './VideoThumb'
import VideoEmbedModal from './VideoEmbedModal'
import SocialMark from './SocialMark'
import { Avatar, Skeleton } from './ui'
import { CountUp } from './network/Motion'
import HookButton from './HookButton'
import DealFinder from './DealFinder'
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
// who made it. Pressing it plays the video here.
//
// NO CAPTION "HOOKS" (8 Oct 2026). Ethan: "The Hooks That Work is showing up at the bottom, but these are not really
// hooks. These are just the descriptions they put in ... The actual hook is the text on the video." The tracker only
// ever sees the caption (in whatever language the creator wrote it); the words burned into the first second of the
// video are pixels, and reading them would mean downloading and OCR-ing every video, which the scrapers cannot do.
// So the cards are the videos and their numbers, and the page leads with the two buttons that DO give a real hook
// ("Hook me up", from the curated English bank) and a deal to film, side by side as on the VIP guides page.
// The header is a white card like every other page header (the black one with an orange glow was "not the normal
// style"), and a card magnifies under the pointer instead of drawing a play button over the cover.
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
  const shelves = [{ key: 'top', title: tr('The biggest hits of all time'), hint: tr('The most viewed videos the community has made'), rows: byViews.slice(0, 15) }]
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

  return (
    <div className="space-y-8">
      <IdeasHero count={rows?.length} total={total} compact={compact} />
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="animate-rise [animation-delay:80ms]"><HookButton variant="big" /></div>
        <div className="animate-rise [animation-delay:150ms]"><DealFinder variant="big" /></div>
      </section>
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
        </>
      )}
      {playing && <VideoEmbedModal url={playing.video_url} platform={playing.platform} title={playing.creator_name || playing.platform} onClose={() => setPlaying(null)} />}
    </div>
  )
}

function IdeasHero({ count, total, compact }) {
  const tr = useT()
  return (
    <section className={cx('animate-rise relative overflow-hidden rounded-[28px] border border-gray-100 bg-white shadow-card', compact ? 'px-5 py-6' : 'px-6 py-8 sm:px-10 sm:py-9')}>
      <Icon name="bulb" className="ideas-bulb pointer-events-none absolute -right-3 -top-3 h-28 w-28 text-brand/10 sm:right-6 sm:top-1/2 sm:h-36 sm:w-36 sm:-translate-y-1/2" />
      <div className="relative max-w-2xl">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-brand"><Icon name="bulb" className="h-4 w-4" />{tr('Video Ideas')}</p>
        <h1 className={cx('mt-2 font-extrabold leading-[1.05] tracking-tight text-ink', compact ? 'text-2xl' : 'text-3xl sm:text-[40px]')}>
          {tr('Videos that passed 50k views')}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-smoke sm:text-[15px]">
          {tr('Watch how the community\'s biggest videos open, then grab a hook and a deal and make your own.')}
        </p>
        {count > 0 && (
          <div className="mt-5 flex flex-wrap gap-2.5">
            <span className="animate-pop-in rounded-full bg-cloud px-3.5 py-1.5 text-xs font-bold tabular-nums text-ink [animation-delay:200ms]">
              <CountUp value={count} /> {tr('videos')}
            </span>
            <span className="animate-pop-in rounded-full bg-brand px-3.5 py-1.5 text-xs font-bold tabular-nums text-white shadow-card [animation-delay:280ms]">
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
        {!edge.end && <span aria-hidden className="pointer-events-none absolute inset-y-0 -right-4 w-8 ideas-fade sm:-right-6 sm:w-10" />}
      </div>
    </section>
  )
}

function IdeaCard({ v, rank, delay, onPlay }) {
  const tr = useT()
  return (
    <article
      className="idea-card group relative w-[210px] shrink-0 snap-start overflow-hidden rounded-3xl bg-white shadow-card ring-1 ring-black/5 transition-all duration-300 hoverable:hover:scale-[1.035] hoverable:hover:shadow-lift sm:w-[232px]"
      style={{ animationDelay: `${Math.min(delay, 8) * 55}ms` }}
    >
      <button type="button" onClick={onPlay} className="block w-full text-left" aria-label={tr('Play {who}', { who: v.creator_name || v.platform || '' })}>
        <div className="relative">
          <VideoThumb url={v.video_url} platform={v.platform} thumbnailUrl={v.thumbnail_url} className="!aspect-[9/14]" mark={false} />
          <span aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-b from-black/35 via-transparent to-transparent" />
          <span className="absolute left-3 top-3 flex items-center gap-1 rounded-full bg-black/45 px-2.5 py-1 text-[11px] font-bold tabular-nums text-white backdrop-blur-md">
            <Icon name="eye" className="h-3.5 w-3.5" />{formatViews(v.views)}
          </span>
          {rank && rank <= 3 && (
            <span className="absolute right-3 top-3 flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-brand-light to-brand text-xs font-black text-white shadow-card">{rank}</span>
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
        <a href={v.video_url} target="_blank" rel="noopener noreferrer" aria-label={tr('Open the original post')} title={tr('Open the original post')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-smoke transition-all duration-200 hoverable:hover:scale-110 hoverable:hover:bg-cloud hoverable:hover:text-ink">
          <Icon name="link" className="h-4 w-4" />
        </a>
      </div>
    </article>
  )
}

/**
 * The door into /ideas from other pages (8 Oct 2026): the Worldwide rail and the Resource library. Three covers of the
 * biggest videos, the count, and the whole card is the link; it magnifies under the pointer like the cards inside.
 */
export function IdeasTeaser({ className }) {
  const tr = useT()
  const rows = useVideoIdeas()
  const top = useMemo(() => [...(rows || [])].sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0)).slice(0, 3), [rows])
  if (rows && rows.length === 0) return null
  return (
    <Link to="/ideas" className={cx('group block rounded-card border border-gray-100 bg-white p-4 shadow-card transition-all duration-300 hoverable:hover:scale-[1.02] hoverable:hover:shadow-lift', className)}>
      <div className="flex items-center gap-2">
        <Icon name="bulb" className="h-5 w-5 shrink-0 text-brand transition-transform duration-300 group-hover:rotate-12" />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold leading-snug text-ink">{tr('Video Ideas')}</span>
          <span className="block text-xs text-smoke">{rows ? tr('{n} videos with 50k+ views', { n: rows.length }) : tr('The community\'s biggest videos')}</span>
        </span>
        <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-brand" />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {rows === undefined
          ? [0, 1, 2].map((i) => <Skeleton key={i} className="aspect-[9/14] w-full rounded-xl" />)
          : top.map((v, i) => (
            <div key={v.id} className="relative overflow-hidden rounded-xl animate-rise" style={{ animationDelay: `${i * 60}ms` }}>
              <VideoThumb url={v.video_url} platform={v.platform} thumbnailUrl={v.thumbnail_url} className="!aspect-[9/14]" mark={false} />
              <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white backdrop-blur">{formatViews(v.views)}</span>
            </div>
          ))}
      </div>
    </Link>
  )
}
