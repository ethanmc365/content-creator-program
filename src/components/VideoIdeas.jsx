import { useEffect, useMemo, useState } from 'react'
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
import { translateTexts } from '../lib/contentTranslate'
import { getLocale, useLocale, useT } from '../lib/i18n'

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
//
// 100,000 AND THE WORDS ON THE VIDEO (9 Oct 2026). Ethan: "record videos over 100k here, because currently it's just over 50k",
// and "you have pulled the hooks from all these videos because they're visibly on the screen, but they're in a different
// language ... translate it to any language". The hook is the text the creator typed onto the video (TikTok keeps it as a
// text sticker, read by view-sync with the view count at no extra cost); it is shown in the READER'S language, from the
// shared translation cache, with the original one press away. Spanish stays Spanish for a Spanish reader.
export const IDEAS_MIN_VIEWS = 100000

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

/**
 * The words on each video, in the reader's language. One cache lookup for the whole page (translateTexts merges them), and a
 * switch for the original. A translator that is down shows the original, never a blank.
 */
export function useHookTexts(rows) {
  const locale = useLocale()
  const [map, setMap] = useState({})
  const [showOriginal, setShowOriginal] = useState(false)
  const texts = useMemo(() => [...new Set((rows || []).map((r) => r.screen_text).filter(Boolean))], [rows])
  const key = texts.join('\u0001')
  useEffect(() => {
    let alive = true
    if (!key) { setMap({}); return undefined }
    translateTexts(key.split('\u0001'), getLocale()).then((res) => { if (alive) setMap(res || {}) })
    return () => { alive = false }
  }, [key, locale])
  const differs = (t) => { const r = map[t]; return !!r && !r.same && !!r.value && r.value !== t }
  return {
    differs,
    pick: (t) => (!showOriginal && differs(t) ? map[t].value : t),
    translated: texts.some(differs),
    showOriginal,
    toggle: () => setShowOriginal((v) => !v),
  }
}

const PLATFORM_ORDER = ['TikTok', 'Instagram', 'YouTube', 'Facebook']
const DAY = 86400000

/** The shelves the page draws, from the rows: biggest, newest, then one per platform with at least two videos. */
export function shelvesFor(rows, tr = (s) => s) {
  if (!rows?.length) return []
  const byViews = [...rows].sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0))
  const shelves = []
  // WORKING RIGHT NOW LEADS (9 Oct 2026: "move the biggest hits below Working Right Now, so Working Right Now is at the top").
  const recent = rows.filter((r) => r.posted_at && Date.now() - Date.parse(r.posted_at) < 45 * DAY)
    .sort((a, b) => Date.parse(b.posted_at) - Date.parse(a.posted_at))
  if (recent.length >= 2) shelves.push({ key: 'new', title: tr('Working right now'), hint: tr('Posted in the last six weeks'), rows: recent.slice(0, 15) })
  shelves.push({ key: 'top', title: tr('The biggest hits of all time'), hint: tr('The most viewed videos the community has made'), rows: byViews.slice(0, 15) })
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
  const hooks = useHookTexts(rows)

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
          <p className="mt-3 font-semibold text-ink">{tr('No 100k videos yet')}</p>
          <p className="mt-1 text-sm text-smoke">{tr('The first video to pass 100,000 views lands here.')}</p>
        </div>
      ) : (
        <>
          {hooks.translated && (
            <div className="-mb-3 flex items-center justify-end gap-2 text-xs text-smoke animate-fade-up">
              <Icon name="globe" className="h-3.5 w-3.5 text-brand" />
              <span>{hooks.showOriginal ? tr('Hooks as written') : tr('Hooks in your language')}</span>
              <button type="button" onClick={hooks.toggle} className="rounded-full border border-gray-200 bg-white px-2.5 py-1 font-semibold text-ink transition-colors hoverable:hover:border-brand hoverable:hover:text-brand">{hooks.showOriginal ? tr('Translate') : tr('Show original')}</button>
            </div>
          )}
          {shelves.map((s, i) => <Shelf key={s.key} shelf={s} index={i} onPlay={setPlaying} hooks={hooks} />)}
        </>
      )}
      {playing && (
        <VideoEmbedModal
          url={playing.video_url} platform={playing.platform} title={playing.creator_name || playing.platform} onClose={() => setPlaying(null)}
          footer={playing.screen_text ? <HookPanel text={playing.screen_text} hooks={hooks} /> : null}
        />
      )}
    </div>
  )
}

function IdeasHero({ count, total, compact }) {
  const tr = useT()
  return (
    <section className={cx('ideas-hero animate-rise relative overflow-hidden rounded-[28px] text-white shadow-card', compact ? 'px-5 py-6' : 'px-6 py-8 sm:px-10 sm:py-10')}>
      {/* A CONSTELLATION OF BULBS (9 Oct 2026). Ethan: "more vibrant, kind of like the get help icon, and have multiple of them
          there, animating a bulb." One faint bulb became five of different sizes, each bobbing on its own beat with a glow
          that breathes, on the same orange as Get Help. */}
      <Icon name="bulb" aria-hidden className="ideas-bulb ideas-bulb-a pointer-events-none absolute" />
      <Icon name="bulb" aria-hidden className="ideas-bulb ideas-bulb-b pointer-events-none absolute" />
      <Icon name="bulb" aria-hidden className="ideas-bulb ideas-bulb-c pointer-events-none absolute" />
      <Icon name="bulb" aria-hidden className="ideas-bulb ideas-bulb-d pointer-events-none absolute" />
      <Icon name="bulb" aria-hidden className="ideas-bulb ideas-bulb-e pointer-events-none absolute" />
      <div className="relative max-w-2xl">
        <p className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-white/85"><Icon name="bulb" className="h-4 w-4" />{tr('Video Ideas')}</p>
        <h1 className={cx('mt-2 font-extrabold leading-[1.05] tracking-tight', compact ? 'text-2xl' : 'text-3xl sm:text-[40px]')}>
          {tr('Videos that passed 100k views')}
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-white/90 sm:text-[15px]">
          {tr('Watch how the community\'s biggest videos open, then grab a hook and a deal and make your own.')}
        </p>
        {count > 0 && (
          <div className="mt-5 flex flex-wrap gap-2.5">
            <span className="animate-pop-in rounded-full bg-white/20 px-3.5 py-1.5 text-xs font-bold tabular-nums text-white backdrop-blur [animation-delay:200ms]">
              <CountUp value={count} /> {tr('videos')}
            </span>
            <span className="animate-pop-in rounded-full bg-white px-3.5 py-1.5 text-xs font-bold tabular-nums text-brand shadow-card [animation-delay:280ms]">
              <CountUp value={total} format={formatViews} /> {tr('views between them')}
            </span>
          </div>
        )}
      </div>
    </section>
  )
}

function Shelf({ shelf, index, onPlay, hooks }) {
  // NO ARROWS (9 Oct 2026): "we can just scroll on mobile with our finger or on desktop with the trackpad." The row scrolls
  // sideways with snap points and a soft fade on the right edge says there is more.
  return (
    <section className="animate-rise" style={{ animationDelay: `${Math.min(index, 5) * 70}ms` }}>
      <div className="mb-3 min-w-0">
        <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
          {shelf.platform ? <SocialMark brand={shelf.platform.toLowerCase()} className="h-5 w-5" colored /> : <Icon name={shelf.key === 'new' ? 'fire' : 'trophy'} className="h-5 w-5 text-brand" />}
          {shelf.title}
        </h2>
        {shelf.hint && <p className="text-xs text-smoke">{shelf.hint}</p>}
      </div>
      <div className="relative">
        <div className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-4 px-4 pb-3 pt-1 sm:-mx-6 sm:scroll-px-6 sm:px-6">
          {shelf.rows.map((v, i) => <IdeaCard key={v.id} v={v} rank={shelf.key === 'top' ? i + 1 : null} delay={i} onPlay={() => onPlay(v)} hook={v.screen_text ? hooks.pick(v.screen_text) : null} />)}
        </div>
        <span aria-hidden className="pointer-events-none absolute inset-y-0 -right-4 w-8 ideas-fade sm:-right-6 sm:w-10" />
      </div>
    </section>
  )
}

function IdeaCard({ v, rank, delay, onPlay, hook }) {
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
      {/* THE HOOK: the words on the video, in the reader's language. Cards with none (Instagram, YouTube, a video with no
          text on it) simply have no line, rather than a caption pretending to be one. */}
      {/* NAMED AND NEVER CUT OFF (9 Oct 2026). Ethan: "improve the UI and identify that it is the hook ... some of the longer ones are
          cut off." It is a labelled block now, shown in full, and pressing it plays the video with the hook under it. */}
      {hook && (
        <button type="button" onClick={onPlay} className="mx-3 mt-2.5 block w-[calc(100%-1.5rem)] rounded-2xl bg-brand/[0.07] px-3 py-2 text-left transition-colors hoverable:hover:bg-brand/10">
          <span className="flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-brand"><Icon name="bulb" className="h-3 w-3" />{tr('The hook')}</span>
          <span className="mt-1 block whitespace-pre-line text-[13px] font-bold leading-snug text-ink [overflow-wrap:anywhere]">{hook}</span>
        </button>
      )}
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
 * The hook under a playing video: what is written on the screen, in the reader's language, with the original one press away.
 * "Whenever you click on them ... this is the hook to use, with the translate button as well for the other languages."
 */
export function HookPanel({ text, hooks }) {
  const tr = useT()
  const [copied, setCopied] = useState(false)
  const shown = hooks.pick(text)
  const copy = async () => {
    try { await navigator.clipboard.writeText(shown); setCopied(true); setTimeout(() => setCopied(false), 1600) } catch { /* no clipboard: the text is on screen to read */ }
  }
  return (
    <div className="mt-4 w-full rounded-2xl bg-white p-4 text-left shadow-lift animate-fade-up">
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-brand"><Icon name="bulb" className="h-4 w-4" />{tr('The hook to use')}</span>
        {hooks.differs(text) && (
          <button type="button" onClick={hooks.toggle} className="flex items-center gap-1.5 rounded-full border border-gray-200 px-2.5 py-1 text-xs font-semibold text-ink transition-all hoverable:hover:scale-105 hoverable:hover:border-brand hoverable:hover:text-brand">
            <Icon name="globe" className="h-3.5 w-3.5 text-brand" />{hooks.showOriginal ? tr('Translate') : tr('Show original')}
          </button>
        )}
      </div>
      <p className="mt-2 whitespace-pre-line text-[15px] font-bold leading-snug text-ink [overflow-wrap:anywhere]">{shown}</p>
      <p className="mt-1 text-[11px] text-smoke">{tr('The words the creator typed onto the video.')}</p>
      <button type="button" onClick={copy} className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand px-3.5 py-1.5 text-xs font-bold text-white transition-transform hoverable:hover:scale-105">
        <Icon name={copied ? 'check' : 'copy'} className="h-3.5 w-3.5" />{copied ? tr('Copied') : tr('Copy hook')}
      </button>
    </div>
  )
}

/**
 * The door into /ideas from other pages: the Worldwide rail (below Your markets), the main column on a phone (below the latest
 * announcements) and the Resource library.
 *
 * 9 Oct 2026. Ethan: "I would like 10 videos here so it is scrollable to the right, and clicking on that will open up the
 * actual ideas page." So it is a strip of up to ten covers that scrolls sideways under a finger or a trackpad (no arrows),
 * each with its views and, where the video has one, its hook in the reader's language; the whole card is the link. Nothing
 * on it moves when the pointer is over it except the card's own lift, like every other card in the rail.
 */
export function IdeasTeaser({ className }) {
  const tr = useT()
  const rows = useVideoIdeas()
  const top = useMemo(() => [...(rows || [])].sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0)).slice(0, 10), [rows])
  const hooks = useHookTexts(top)
  if (rows && rows.length === 0) return null
  return (
    <Link to="/ideas" className={cx('group block min-w-0 overflow-hidden rounded-card border border-gray-100 bg-white p-4 shadow-card transition-all duration-300 hoverable:hover:-translate-y-0.5 hoverable:hover:shadow-lift', className)}>
      <div className="flex items-center gap-2">
        <Icon name="bulb" className="h-5 w-5 shrink-0 text-brand" />
        <span className="min-w-0 flex-1">
          <span className="block text-[14px] font-bold leading-snug text-ink">{tr('Video Ideas')}</span>
          <span className="block text-xs text-smoke">{rows ? tr('{n} videos with 100k+ views', { n: rows.length }) : tr('The community\'s biggest videos')}</span>
        </span>
        <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-gray-300" />
      </div>
      <div className="scrollbar-none -mx-4 mt-3 flex snap-x gap-2.5 overflow-x-auto px-4 pb-1">
        {rows === undefined
          ? [0, 1, 2, 3].map((i) => <Skeleton key={i} className="aspect-[9/14] w-[108px] shrink-0 rounded-xl" />)
          : top.map((v, i) => (
            <div key={v.id} className="relative w-[108px] shrink-0 snap-start overflow-hidden rounded-xl bg-ink animate-rise" style={{ animationDelay: `${Math.min(i, 6) * 50}ms` }}>
              <VideoThumb url={v.video_url} platform={v.platform} thumbnailUrl={v.thumbnail_url} className="!aspect-[9/14]" mark={false} />
              {v.screen_text && <span aria-hidden className="pointer-events-none absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/75 to-transparent" />}
              {v.screen_text && <span className="pointer-events-none absolute inset-x-1.5 bottom-6 line-clamp-3 text-[10px] font-bold leading-tight text-white [overflow-wrap:anywhere]">{hooks.pick(v.screen_text)}</span>}
              <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-white backdrop-blur">{formatViews(v.views)}</span>
            </div>
          ))}
      </div>
    </Link>
  )
}
