import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Skeleton, Modal, Spinner, Select, Avatar } from '../../components/ui'
import Icon from '../../components/Icon'
import { PLATFORMS as PLATFORM_MARKS } from '../../components/VideoThumb'
import Reveal from '../../components/network/Reveal'
import MarketScope, { useScopedMarkets } from '../../components/admin/MarketScope'
import TrackedVideoSheet from '../../components/admin/TrackedVideoSheet'
import { cx, formatViews, formatDate, downloadCsv } from '../../lib/utils'
import {
  CSV_COLUMNS, PLATFORMS, SORTS, atHandle, challengeOf,
  challengeOptions, creatorLink, monthLabel, monthsOf, summarise,
  toCsvRows, visibleVideos,
} from '../../lib/videoTracker'
import { resolveThumbnail, forgetThumbnail } from '../../lib/videoThumbs'
import { useT } from '../../lib/i18n'

// THE VIDEO TRACKER.
//
// Ethan, 9 Sep 2026: "I want you to build into the admin tool another page
// called Video Tracker. This is going to track all the best videos from the
// entire community, obviously filtered by market and by the challenges. We want
// to track the top three videos from every challenge, and also any videos that
// have got over ten thousand views... And we would want the hooks for this - see
// if you can pull the hook they used and maybe the description, or their
// accounts. This is what we're going to share with the whole Tryp.com team so
// they can take inspiration from the viral videos and the ones that performed
// well, and we can share them with the other markets."
//
// WHAT THIS PAGE IS FOR, WHICH DECIDES ITS SHAPE.
//
// It is not analytics. `/admin/analytics` already answers "how did the
// programme do" in rows of numbers, and this would be a bad version of it. The
// question here is "what should I make", asked by somebody who is about to
// brief a creator or write a challenge - so the unit is a VIDEO, the loudest
// thing on each card is its HOOK rather than its view count, and the whole page
// is a grid you scan rather than a table you read.
//
// THE HOOK IS THE PRODUCT. A view count says a video worked; it says nothing
// about why, and "why" is the only part that transfers to another market. The
// hook is derived from the first line of the caption on sync
// (`hook_from_caption`, migration 212) and is editable, because the real hook is
// often the first line SPOKEN rather than written and only a person watching it
// knows that. Editing it sets `hook_source = 'manual'` and a resync then leaves
// it alone.
//
// WHERE THE ROWS COME FROM (migration 252): anything over the view threshold,
// always - no podium, no per-challenge top N. It runs itself the moment a
// submission's views actually change (the hourly sweep, "Sync now", or a
// manual view-count edit), a challenge ending/publishing winners, or a
// disqualification - never on a timer. Everything else is added by hand -
// which is how a video from a market that is not on this platform yet gets in,
// and there are five such markets.
//
// NOTHING HERE IS EVER DELETED BY THE MACHINE. A video that drops under the
// threshold, or is disqualified, stops qualifying and keeps its notes in the
// database (migration 211) - but this page never shows it again. Ethan, 23
// Sep 2026: "there's no need to show the retired button and retired videos,
// they should just be gone from this tracker", so a non-qualifying row is
// filtered out with no toggle back to it (see `visibleVideos`).
export default function AdminVideoTracker() {
  const tr = useT()
  const { profile } = useAuth()
  const { markets } = useScopedMarkets()

  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncNote, setSyncNote] = useState('')
  const [editing, setEditing] = useState(null)   // a row, or {} for a new one
  const [playing, setPlaying] = useState(null)
  // THE ONE NUMBER THAT DECIDES WHAT GETS TRACKED (migration 252): any video
  // over this many views, always - no podium, no per-challenge top N. It lives
  // in `app_settings.video_tracker.view_threshold`, read fresh from whatever
  // the sync RPC last reported.
  const [threshold, setThreshold] = useState(10000)

  // THE FILTER IS ONE OBJECT, not six pieces of state, because every consumer
  // of it takes the whole thing (`visibleVideos`) and because that makes
  // "clear all" one line rather than six.
  // `q` HAS NO CONTROL AND IS NOT DEAD (10 Sep 2026). The search box was removed
  // at three videos - see the note on the filter strip - and `visibleVideos`
  // still reads this and is still tested on it, so putting the input back is one
  // element. It stays in the shape so that `Clear` and `filtered` keep meaning
  // the same thing whichever of those two states the page is in.
  const [filter, setFilter] = useState({
    market: '', challenge: '', platform: '', month: '', q: '', sort: 'views',
  })
  const set = useCallback((patch) => setFilter((f) => ({ ...f, ...patch })), [])

  const load = useCallback(async () => {
    const [videos, settings] = await Promise.all([
      supabase.rpc('admin_tracked_videos'),
      supabase.from('app_settings').select('value').eq('key', 'video_tracker').maybeSingle(),
    ])
    if (videos.error) { setErr(videos.error.message); setRows([]); return }
    setErr('')
    setRows(videos.data || [])
    // A MISSING ROW IS NOT AN ERROR, it is a database that has not been told
    // yet, and the default here is the same one the function falls back to.
    setThreshold(Number(settings.data?.value?.view_threshold ?? 10000))
  }, [])
  useEffect(() => { load() }, [load])

  async function sync() {
    setSyncing(true)
    setSyncNote('')
    const { data, error } = await supabase.rpc('sync_tracked_videos')
    setSyncing(false)
    if (error) { setErr(error.message); return }
    setErr('')
    // SAY WHAT IT DID, INCLUDING WHEN IT DID NOTHING. A sync that reports
    // nothing is indistinguishable from a sync that failed, which is the
    // report the view-sync button collected twice before it learned to count.
    const n = data || {}
    setSyncNote(
      n.added || n.updated || n.dropped
        ? `${n.added || 0} new, ${n.updated || 0} refreshed, ${n.dropped || 0} retired`
        : `Nothing changed. Anything over ${formatViews(n.threshold ?? 10000)} views appears here automatically.`,
    )
    load()
  }

  const challenges = useMemo(() => challengeOptions(rows || []), [rows])
  // The selected challenge as a whole object - its label and its market - for
  // the heading above the grid.
  const chosenChallenge = useMemo(
    () => challenges.find((c) => c.key === filter.challenge) || null,
    [challenges, filter.challenge],
  )
  const shown = useMemo(() => visibleVideos(rows || [], filter), [rows, filter])
  const totals = useMemo(() => summarise(shown), [shown])

  const months = useMemo(() => monthsOf(rows || []), [rows])
  const filtered = filter.challenge || filter.platform || filter.q || filter.market || filter.month

  return (
    <div className="page">
      <PageHeader
        back="/admin"
        title={tr('Video tracker')}
        action={
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={sync} disabled={syncing} className="btn-secondary disabled:opacity-50">
              {syncing ? <Spinner className="h-4 w-4" /> : <Icon name="refresh" className="h-4 w-4" strokeWidth={2.2} />}
              {tr('Sync from entries')}
            </button>
            <button type="button" onClick={() => setEditing({})} className="btn-primary">
              <Icon name="plus" className="h-4 w-4" strokeWidth={2.4} />
              {tr('Add a video')}
            </button>
          </div>
        }
      />

      {err && <p className="mb-5 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{err}</p>}
      {syncNote && (
        <p className="mb-5 flex items-center gap-2 rounded-xl bg-brand-tint/50 px-4 py-3 text-sm text-ink">
          <Icon name="check" className="h-4 w-4 shrink-0 text-brand" />
          {syncNote}
        </p>
      )}

      {/* NO `note` HERE. It said "3 videos", eighty pixels above a line in the
          filter card that says "3 videos · best 15.2k" - the same fact twice on
          one screen, which is a third of what "there's too much going on"
          meant. The card's version is the one that stays: it is beside the
          filters that change it. */}
      <MarketScope markets={markets} value={filter.market} onChange={(m) => set({ market: m })} />

      {/* (The standing "syncing the top 3 of every challenge, plus anything over
          10k views" line used to sit here as a paragraph of its own. Ethan: "I
          don't like how it says top three of every challenge plus everything
          over ten thousand views. This is not necessarily needed there - it
          could be an actual button somewhere, the Change button. Maybe just
          build it into the design better, because currently it looks like
          there's too much going on."

          Right, and the reason is that it was answering a question nobody had
          asked yet. It exists for "why isn't my video in here", which is asked
          about ONCE, by somebody who is already looking for a control. So it is
          a control: `3 / 10k` beside Export, which says the same two numbers in
          six characters and opens the panel that explains them in full. See
          `RulesModal`.) */}

      {/* ONE CARD, NOT A WALL OF TILES AND A LOOSE ROW OF PILLS (9 Sep 2026).
          Ethan: "improve how this looks - have everything in one card, similar
          to how Worldwide/Germany/Nordics is in one card, and have the filters
          inside that, still separated but a cleaner design. The export button
          can even be just to the right of that." And on the tiles: "some of
          these metrics are not necessary. Why do we need the views from the
          best videos? Number of videos you can keep, the other two maybe change
          them or delete them."

          So the four StatCards are gone and what survives of them - how many
          videos, and the best one - is a single line at the top of the same
          card the filters live in. Two 96px tiles to say "3" and "15.2k" was
          the page shouting a number it had already put on every card.

          The line still describes WHAT IS ON SCREEN rather than the table: a
          page whose totals ignore its own filter tells you the wrong thing
          every time you use it. */}
      {/* ONE LINE, THREE FILTERS, AND NO SEARCH BOX (10 Sep 2026).
          Ethan: "remove the search bar to search for hooks, captions - we don't
          need that. Instead just have those filters, every challenge, every
          platform, most views. And I would square them up rather than having
          them rounded. Then you can put everything on one line, including the
          3 videos, best is 15.2k, what gets tracked, and the export button."

          THE SEARCH BOX WENT BECAUSE OF WHAT IT COST, NOT WHAT IT DID. It was
          the widest thing on the line - a flexible 240px - and at three videos
          it answers a question nobody has. `visibleVideos` still takes `q` and
          is still tested on it (see lib/videoTracker): the FILTER survives, the
          control does not, and it is one input away from coming back the day
          this list is four hundred rows.

          SQUARED, TO MATCH THE CARD THEY SIT IN. `variant="field"` is the same
          `rounded-xl` and the same padding as `.input`, so the three selects and
          the three buttons beside them are one shape family rather than a row of
          lozenges inside a rounded rectangle. The buttons pick up the same
          radius and height by hand.

          Nothing in this row may move when anything in it changes - the widths
          are fixed and the right-hand group is anchored by its RIGHT edge, so a
          count going from "3 videos" to "13 videos" moves nothing but its own
          left edge. Below `lg` it wraps by itself, which is the right answer on
          a phone and needs no second rule to say so. */}
      <div className="mb-6 rounded-card border border-gray-100 bg-white p-2 shadow-card sm:p-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          <Select
            value={filter.challenge}
            onChange={(v) => set({ challenge: v })}
            // FIXED WIDTHS, NOT MINIMUMS. A `min-w` select grows to fit
            // whatever is chosen, so picking "Tryp.com Creative Challenge"
            // pushed the two selects to its right along by 55px - the same
            // complaint as the Clear button ("I don't like how everything
            // moves"), from a different cause. The trigger truncates instead;
            // the full label is one click away and is also the heading above
            // the grid.
            variant="field"
            className="w-[13rem] shrink-0"
            ariaLabel={tr('Challenge')}
            options={[{ value: '', label: tr('Every challenge') },
              ...challenges.map((c) => ({ value: c.key, label: c.label }))]}
          />
          <Select
            value={filter.platform}
            onChange={(v) => set({ platform: v })}
            // WIDE ENOUGH FOR ITS OWN PLACEHOLDER (10 Sep 2026). Ethan: "the
            // Every platform filter only says 'plat fo'." The padding, the
            // chevron and its gap take 52px, so the label needs 112 of its own.
            variant="field"
            className="w-[11rem] shrink-0"
            ariaLabel={tr('Platform')}
            options={[{ value: '', label: tr('Every platform') },
              ...PLATFORMS.map((p) => ({ value: p, label: p }))]}
          />
          <Select
            value={filter.sort}
            onChange={(v) => set({ sort: v })}
            variant="field"
            className="w-[10rem] shrink-0"
            ariaLabel={tr('Sort')}
            options={Object.entries(SORTS).map(([k, s]) => ({ value: k, label: tr(s.label) }))}
          />

          {/* IT IS ALWAYS THERE, AND SOMETIMES INVISIBLE (9 Sep 2026).
              Ethan: "when I click on July 2026 it changes how the card above
              looks, because the Clear button appears. I don't like how
              everything moves."

              A control that appears when it becomes useful is a reasonable
              instinct and it is wrong in a WRAPPING row: adding an item to a
              flex-wrap line does not add a button, it re-flows every button on
              the line. So the space is reserved permanently and only the
              button's visibility changes.

              `invisible` rather than `opacity-0`: it must also leave the tab
              order when it does nothing. */}
          <button
            type="button"
            onClick={() => setFilter({ market: '', challenge: '', platform: '', month: '', q: '', sort: filter.sort })}
            aria-hidden={!filtered}
            tabIndex={filtered ? 0 : -1}
            className={cx(
              'rounded-xl px-3 py-2.5 text-sm font-medium text-smoke transition-colors hover:text-ink',
              !filtered && 'invisible',
            )}
          >
            {tr('Clear')}
          </button>

          <div className="ml-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
          <span className="font-semibold text-ink">
            {rows ? totals.count : '—'} {totals.count === 1 ? tr('video') : tr('videos')}
          </span>
          {totals.best > 0 && (
            <>
              <span className="text-gray-300" aria-hidden>·</span>
              <span className="text-smoke">
                {tr('best')} <strong className="font-semibold text-brand">{formatViews(totals.best)}</strong>
              </span>
            </>
          )}
          {filter.month && (
            <>
              <span className="text-gray-300" aria-hidden>·</span>
              <span className="text-smoke">{monthLabel(filter.month)}</span>
            </>
          )}
          <span className="text-gray-300" aria-hidden>·</span>
          <span className="text-xs text-gray-400">{tr('over')} {formatViews(threshold)}</span>
          <button
            type="button"
            onClick={() => downloadCsv(`tryp-video-tracker-${filter.month || new Date().toISOString().slice(0, 10)}.csv`, toCsvRows(shown), CSV_COLUMNS)}
            disabled={!shown.length}
            className="rounded-xl border border-gray-200 px-3.5 py-2 text-sm font-medium text-smoke transition-all duration-200 disabled:opacity-40 hoverable:hover:border-brand hoverable:hover:text-ink"
          >
            <Icon name="download" className="mr-1.5 inline h-4 w-4 align-[-3px]" />
            {tr('Export')}
          </button>
          </div>
        </div>

      </div>

      {/* --------------------------------------------- the grid + the months --

          A MONTH IS A REPORT, AND A REPORT IS THE GRID WITH ONE MORE FILTER ON
          IT (9 Sep 2026).

          Ethan: "I would love you to generate a monthly report I can click,
          maybe on the right side another bar I can go month by month and see
          the best videos from each month."

          The honest version of that is not a second page and a second query -
          the grid already sorts by views, already shows the hook, the account,
          the challenge and the placing, and already exports. What it lacked was
          a way to say "July". So the rail is a filter, the export filename
          picks up the month, and "the best videos from August" is the page you
          are already looking at with August selected.

          On a desktop it is a column on the RIGHT, as asked. Below `lg` it
          becomes a horizontal strip above the grid, because a 12rem column
          beside a one-card grid on a phone is a column and no grid. */}
      <div className="lg:flex lg:items-start lg:gap-6">
        <div className="min-w-0 flex-1">
          {!rows && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-72 w-full rounded-card" />)}
            </div>
          )}

          {rows && shown.length === 0 && (
            <div className="rounded-card border border-dashed border-gray-200 px-6 py-16 text-center">
              <Icon name="video" className="mx-auto h-8 w-8 text-gray-300" />
              <p className="mt-3 text-sm font-semibold text-ink">
                {rows.length === 0 ? tr('Nothing tracked yet') : tr('Nothing matches that')}
              </p>
              <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-smoke">
                {rows.length === 0
                  ? tr('Press "Sync from entries" to pull in every video over the line from across the platform, or add one by hand from any market.')
                  : tr('Try a wider filter, or clear them all.')}
              </p>
            </div>
          )}

          {/* THE CHALLENGE NAMES ITSELF ONCE, ABOVE ITS OWN VIDEOS (9 Sep 2026).
              Ethan: "whenever you filter by challenge, just show them up with
              the challenge name on top of it - the community flag or market,
              whatever."

              With a challenge selected, every card in the grid is wearing the
              same challenge badge, which is twenty repetitions of a fact that
              belongs at the top of the page exactly once. It is also the state
              this page is USED in - "show me the UK challenge" is the question
              somebody arrives with - so the answer deserves a heading rather
              than a filter chip. */}
          {rows && shown.length > 0 && filter.challenge && chosenChallenge && (
            <div className="mb-4 flex flex-wrap items-baseline gap-x-2.5 gap-y-1 px-1">
              <h2 className="text-lg font-bold tracking-tight text-ink">{chosenChallenge.label}</h2>
              {chosenChallenge.market && (
                <span className="rounded-full bg-brand-tint/60 px-2.5 py-0.5 text-xs font-semibold text-brand">
                  {chosenChallenge.market}
                </span>
              )}
              <span className="text-sm text-smoke">
                {shown.length} {shown.length === 1 ? tr('video') : tr('videos')}
                {filter.month ? ` · ${monthLabel(filter.month)}` : ''}
              </span>
            </div>
          )}

          {rows && shown.length > 0 && (
            <Reveal
              className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
              stagger={0.05}
              maxStagger={9}
            >
              {shown.map((v, i) => (
                <VideoCard
                  key={v.id}
                  v={v}
                  place={filter.sort === 'views' ? i + 1 : null}
                  onOpen={() => setEditing(v)}
                  onPlay={() => setPlaying(v)}
                  onPin={async () => {
                    await supabase.from('tracked_videos').update({ pinned: !v.pinned }).eq('id', v.id)
                    load()
                  }}
                />
              ))}
            </Reveal>
          )}
        </div>

        {months.length > 0 && (
          <aside className="order-first mb-5 lg:order-none lg:mb-0 lg:w-44 lg:shrink-0">
            <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wide text-gray-400">
              {tr('By month')}
            </p>
            {/* One scroller, laid out along whichever axis the layout is using.
                `[-ms-overflow-style]`/`scrollbar-width` for the same reason the
                landing rails hide theirs: a scrollbar across a row of four
                chips is taller than the chips. */}
            <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2 [-ms-overflow-style:none] [scrollbar-width:none] lg:mx-0 lg:max-h-[32rem] lg:flex-col lg:overflow-y-auto lg:overflow-x-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden">
              <MonthChip
                label={tr('All months')}
                count={rows ? rows.filter((v) => v.qualifies || v.pinned).length : 0}
                active={!filter.month}
                onClick={() => set({ month: '' })}
              />
              {months.map((m) => (
                <MonthChip
                  key={m.key}
                  label={m.label}
                  count={m.count}
                  active={filter.month === m.key}
                  onClick={() => set({ month: filter.month === m.key ? '' : m.key })}
                />
              ))}
            </div>
          </aside>
        )}
      </div>

      {editing && (
        <TrackedVideoSheet
          row={editing}
          markets={markets}
          challenges={challenges}
          profileId={profile?.id}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load() }}
        />
      )}

      {playing && <PlayerModal v={playing} onClose={() => setPlaying(null)} />}
    </div>
  )
}

// ONE VIDEO.
//
// The hierarchy is the argument: the HOOK is the heading, the view count is a
// number beside it, and the caption is the small print. Every other card in
// this product leads with a person or a title; this one leads with a sentence,
// because the sentence is what somebody came here to steal.
function VideoCard({ v, place, onOpen, onPlay, onPin }) {
  const tr = useT()
  const handle = atHandle(v.creator_handle)
  const account = creatorLink(v)
  const challenge = challengeOf(v)

  // A REAL FRAME OF THE VIDEO WHERE ONE CAN BE HAD.
  //
  // Ethan: "we don't necessarily need the TikTok/Instagram sign there the way
  // it shows for the other creators", and "maybe actually show a preview of the
  // video if you can."
  //
  // `VideoThumb` paints a 128px orange slab with a giant platform logo on it,
  // which is the right answer on a challenge entry - it is a link somebody is
  // about to open, and the platform is the useful fact. On this page it is the
  // wrong answer twice over: the platform is already a filter and a badge, and
  // a wall of identical orange rectangles is the opposite of a page whose job
  // is to help you tell twenty videos apart.
  //
  // EVERY PLATFORM GETS A FRAME NOW, INCLUDING INSTAGRAM (9 Sep 2026).
  //
  // Ethan: "for some of them, like the TikTok one, you have the nice preview
  // that shows up. But for Instagram this doesn't seem to work. Make sure you
  // can build this preview into all of them."
  //
  // He is describing a real asymmetry with a boring cause: TikTok and YouTube
  // publish tokenless oEmbed endpoints and Instagram does not, so the
  // browser-side lookup could only ever answer for two of the three. The third
  // answer has existed since this morning and nothing was asking for it - the
  // `view-sync` probe reads Instagram server-side for the view count and brings
  // a `thumbnail` back with it. `resolveThumbnail` is the one place that knows
  // all three routes and the order to try them in; see lib/videoThumbs.
  //
  // WHAT IS FOUND IS WRITTEN BACK to `tracked_videos.thumbnail_url`, so this
  // costs one lookup per video ever rather than one per page view - and when
  // Instagram's signed URL eventually expires, `onError` on the <img> below
  // throws the cache away and asks again. A frame that heals is why caching an
  // expiring URL is the right thing to do rather than a corner cut.
  const [thumb, setThumb] = useState(v.thumbnail_url || null)
  const [retried, setRetried] = useState(false)
  useEffect(() => {
    if (v.thumbnail_url && !retried) { setThumb(v.thumbnail_url); return undefined }
    let alive = true
    resolveThumbnail(v.video_url, { probe: true }).then((url) => {
      if (!alive || !url) return
      setThumb(url)
      // Best effort, and deliberately unawaited: the picture is already on
      // screen, and whether the note survives to the next page load is not
      // something the reader should be made to wait for.
      if (url !== v.thumbnail_url) {
        supabase.from('tracked_videos').update({ thumbnail_url: url }).eq('id', v.id).then(() => {})
      }
    })
    return () => { alive = false }
  }, [v.video_url, v.thumbnail_url, v.id, retried])

  // ONE RETRY, AND ONLY ONE. A URL that has expired resolves to a new one; a
  // URL that is simply wrong would otherwise loop for ever against an endpoint
  // that is going to keep saying no.
  const onThumbError = () => {
    setThumb(null)
    if (retried) return
    forgetThumbnail(v.video_url)
    setRetried(true)
  }

  return (
    <article
      className={cx(
        'group relative flex h-full flex-col overflow-hidden rounded-card border bg-white shadow-card transition-all duration-300',
        'hoverable:hover:-translate-y-1 hoverable:hover:shadow-lift',
        v.pinned ? 'border-brand/40' : 'border-gray-100',
        !v.qualifies && 'opacity-70',
      )}
    >
      {/* The frame doubles as the play control, exactly as it does on a profile
          and on a challenge - one gesture for "watch this" everywhere. */}
      {/* 4:5, NOT A 144px LETTERBOX (10 Sep 2026). Ethan: "make the preview
          even bigger - you can see in the second one the whole person's face is
          cut off. Make the card a little bit longer."

          Every video here is shot 9:16 and the frame was `h-36` on a card about
          300px wide, so `object-cover` was showing 48% of the picture's height
          and throwing away the rest from both ends at once. Faces sit in the
          top half of a vertical frame, which is why it was faces that went. 4:5
          shows 71% of it and is still a card rather than a poster; 3:4 was
          tried and makes a three-column grid two screens tall. */}
      <button
        type="button"
        onClick={onPlay}
        className="relative block aspect-[4/5] w-full overflow-hidden bg-cloud text-left"
        aria-label={tr('Play this video')}
      >
        {thumb
          ? <img src={thumb} alt="" onError={onThumbError} referrerPolicy="no-referrer" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
          : <span className="absolute inset-0 bg-gradient-to-br from-brand/10 to-brand/25" aria-hidden />}
        {/* NO PLAY MARK. Ethan: "completely remove the play button from the
            middle and just still have the function there to click anywhere on
            that." The frame IS the button - this whole block is one - so the
            triangle was announcing an affordance rather than carrying it, and
            it landed on the face every time, because a face is what a vertical
            video puts in the middle. Same change on the challenge board and on
            a creator's profile; see components/VideoThumb. */}
        {v.views != null && (
          <span className="absolute bottom-2 right-2 rounded-full bg-ink/70 px-2.5 py-1 text-xs font-bold tabular-nums text-white backdrop-blur-sm">
            {formatViews(v.views)}
          </span>
        )}
        {/* THE PLACING, and it is two different facts wearing one badge. `rank`
            is where it came in its CHALLENGE, which is the stronger statement
            and wins; `place` is where it sits in the list you are looking at,
            which is what makes a monthly report read as a chart. */}
        {(v.rank || place) && (
          <span className="absolute left-2 top-2 flex h-7 min-w-[1.75rem] items-center justify-center rounded-full bg-white px-1.5 text-xs font-bold text-brand shadow-card">
            {v.rank || place}
          </span>
        )}
        {/* THE PLATFORM AS ITS OWN MARK. Ethan: "change that to the actual
            social media brand icon, the logo, instead of just general
            Instagram, TikTok in white and grey." Same marks as the challenge
            board, imported rather than copied. */}
        {v.platform && PLATFORM_MARKS[v.platform] && (
          <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-ink shadow-card backdrop-blur-sm">
            <span className="h-4 w-4">{PLATFORM_MARKS[v.platform].icon}</span>
          </span>
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col p-4">
        {/* THE HOOK, AS THE HEADING. `line-clamp-3` rather than a truncation:
            a hook that stops mid-word teaches nothing, and three lines is the
            longest one anybody has actually written. */}
        <p className="text-[15px] font-semibold leading-snug text-ink line-clamp-3">
          {v.hook || <span className="text-gray-300">{tr('No hook written yet')}</span>}
        </p>

        {/* AND THE REST OF THE CAPTION IS GONE ENTIRELY (10 Sep 2026). Ethan:
            "condense the bottom a bit - you don't need to show the second
            caption. All you need is the caption you pulled from it, then the
            creator, then the link button and the added button."

            `captionRest` was already the fix for printing the hook twice, and
            it was the wrong fix for the right complaint: the remainder of a
            caption is hashtags and a shop link. It is two lines of noise under
            the one line this page is FOR, and every pixel it takes is a pixel
            the frame above it does not have. The full caption is still on the
            row and is still in the edit sheet, which is where somebody who
            wants it goes. */}

        {/* THE PERSON, WITH THEIR FACE. Ethan: "as well as just saying Lisa
            Burns, I would show the profile photo there with a clickable name to
            bring it there." One row: portrait, name, handle - and the whole row
            is the link to their account, so there is one target rather than a
            name that does nothing beside a handle that does. */}
        <div className="mt-3 flex items-center gap-2.5">
          <Avatar src={v.creator_photo} name={v.creator_name || handle} size="xs" />
          <span className="min-w-0 flex-1">
            {account
              ? (
                <a
                  href={account}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block truncate text-xs font-semibold text-ink transition-colors hover:text-brand"
                >
                  {v.creator_name || handle || tr('Unknown creator')}
                  {handle && <span className="ml-1 font-medium text-brand">{handle}</span>}
                </a>
              )
              : (
                <span className="block truncate text-xs font-semibold text-ink">
                  {v.creator_name || tr('Unknown creator')}
                  {handle && <span className="ml-1 font-medium text-smoke">{handle}</span>}
                </span>
              )}
            {(challenge || v.market_name) && (
              <span className="block truncate text-[11px] text-smoke">
                {[challenge, v.market_name].filter(Boolean).join(' · ')}
              </span>
            )}
          </span>
        </div>

        {v.tags?.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {v.tags.map((t) => (
              <span key={t} className="rounded-full bg-cloud px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-smoke">
                {t}
              </span>
            ))}
          </div>
        )}

        {/* THE "OVER THE VIEW LINE" BADGE IS GONE (23 Sep 2026). Migration 252
            made the tracker threshold-only - every synced row's reason IS
            "over the line", always, so a badge repeating that on every single
            card said nothing. Ethan: "there's no need to add that thing saying
            'over the view line'... remove it and improve the UI of the whole
            thing." What survives, `reason === 'manual'`, is a fact that still
            varies card to card - a video from a market not yet on this
            platform, added by a person - so it keeps a mark, just a quieter
            one than a full-width pill. A thin top rule now separates the
            footer from the card body instead. */}
        <div className="mt-auto flex items-center gap-2 border-t border-gray-100 pt-3">
          <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-gray-400">
            {v.posted_at && <span className="tabular-nums">{formatDate(v.posted_at)}</span>}
            {v.reason === 'manual' && (
              <>
                {v.posted_at && <span aria-hidden>·</span>}
                <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-smoke">
                  <Icon name="plus" className="h-3 w-3" strokeWidth={2.4} />
                  {tr('Added by hand')}
                </span>
              </>
            )}
          </span>

          <span className="ml-auto flex shrink-0 items-center gap-1">
            <IconButton label={v.pinned ? tr('Unpin') : tr('Pin to the top')} onClick={onPin} active={v.pinned} name="star" />
            <IconButton label={tr('Open on the platform')} href={v.video_url} name="link" />
            <IconButton label={tr('Edit')} onClick={onOpen} name="pencil" />
          </span>
        </div>
      </div>
    </article>
  )
}

// ONE MONTH IN THE RAIL.
function MonthChip({ label, count, active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        'flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200 lg:w-full lg:justify-between lg:rounded-xl',
        active
          ? 'bg-brand text-white shadow-card'
          : 'border border-gray-200 bg-white text-smoke hoverable:hover:-translate-y-0.5 hoverable:hover:text-ink lg:border-0 lg:bg-transparent lg:hoverable:hover:translate-y-0 lg:hoverable:hover:bg-cloud',
      )}
    >
      <span className="truncate">{label}</span>
      <span className={cx('text-xs font-bold tabular-nums', active ? 'text-white/75' : 'text-gray-400')}>{count}</span>
    </button>
  )
}

function IconButton({ label, onClick, href, name, active = false }) {
  const cls = cx(
    'flex h-8 w-8 items-center justify-center rounded-full transition-all duration-200',
    active ? 'bg-brand text-white' : 'text-smoke hoverable:hover:bg-cloud hoverable:hover:text-ink',
  )
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" title={label} aria-label={label} className={cls}>
        <Icon name={name} className="h-4 w-4" />
      </a>
    )
  }
  return (
    <button type="button" onClick={onClick} title={label} aria-label={label} className={cls}>
      <Icon name={name} className="h-4 w-4" />
    </button>
  )
}

// WATCHING IT WITHOUT LEAVING THE PAGE.
//
// `videoEmbed` builds a tokenless player for the three platforms that offer one
// (lib/videoPreview). Where it cannot - a shortened TikTok link whose id has
// never been resolved, a private post - the honest answer is a link out rather
// than an empty black box, which is what the profile page already does.
function PlayerModal({ v, onClose }) {
  const tr = useT()
  const [embed, setEmbed] = useState(null)
  useEffect(() => {
    let alive = true
    import('../../lib/videoPreview').then((m) => { if (alive) setEmbed(m.videoEmbed(v.video_url)) })
    return () => { alive = false }
  }, [v.video_url])

  return (
    <Modal open onClose={onClose} title={v.hook || tr('Watch')} wide>
      {embed
        ? (
          <div className={cx('mx-auto overflow-hidden rounded-card bg-ink', embed.vertical ? 'aspect-[9/16] max-w-xs' : 'aspect-video')}>
            <iframe
              src={embed.embedUrl}
              title={v.hook || 'Video'}
              className="h-full w-full"
              allow="autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          </div>
        )
        : (
          <p className="rounded-card bg-cloud px-4 py-8 text-center text-sm text-smoke">
            {tr('This one cannot be played here. Open it on the platform instead.')}
          </p>
        )}
      <a href={v.video_url} target="_blank" rel="noopener noreferrer" className="btn-secondary mt-4 w-full justify-center">
        <Icon name="link" className="h-4 w-4" />
        {tr('Open on')} {v.platform || tr('the platform')}
      </a>
    </Modal>
  )
}
