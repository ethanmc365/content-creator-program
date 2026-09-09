import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Skeleton, Modal, Spinner, Select, Avatar } from '../../components/ui'
import Icon from '../../components/Icon'
import Reveal from '../../components/network/Reveal'
import MarketScope, { useScopedMarkets } from '../../components/admin/MarketScope'
import TrackedVideoSheet from '../../components/admin/TrackedVideoSheet'
import { cx, formatViews, downloadCsv } from '../../lib/utils'
import {
  CSV_COLUMNS, PLATFORMS, SORTS, atHandle, captionRest, challengeOf,
  challengeOptions, creatorLink, monthLabel, monthsOf, reasonLabel, summarise,
  toCsvRows, visibleVideos,
} from '../../lib/videoTracker'
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
// WHERE THE ROWS COME FROM: `sync_tracked_videos()` pulls the top N of every
// challenge and anything over the view threshold out of `submissions`, both
// settings rather than constants. Everything else is added by hand - which is
// how a video from a market that is not on this platform yet gets in, and there
// are five such markets.
//
// NOTHING HERE IS EVER DELETED BY THE MACHINE. A video that drops out of a
// challenge's top three stops qualifying and keeps its notes; `Show retired`
// is the way back to it. See migration 211.
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
  // THE TWO NUMBERS THAT DECIDE WHAT GETS TRACKED, and they live in the
  // database rather than in this file. See migration 212: ten thousand views is
  // a strong video in the UK and an ordinary one in a market with ten times the
  // reach, and "top three" is right for a challenge with forty entries and thin
  // for one with four hundred. Both belong to the person running the programme,
  // not to a deploy.
  const [rules, setRules] = useState(null)
  const [tuning, setTuning] = useState(false)

  // THE FILTER IS ONE OBJECT, not six pieces of state, because every consumer
  // of it takes the whole thing (`visibleVideos`) and because that makes
  // "clear all" one line rather than six.
  const [filter, setFilter] = useState({
    market: '', challenge: '', platform: '', reason: '', month: '', q: '', sort: 'views', showRetired: false,
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
    // yet, and the defaults here are the same two the function falls back to.
    setRules({
      view_threshold: Number(settings.data?.value?.view_threshold ?? 10000),
      top_per_challenge: Number(settings.data?.value?.top_per_challenge ?? 3),
    })
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
        : `Nothing changed. Top ${n.top ?? 3} of each challenge, plus anything over ${formatViews(n.threshold ?? 10000)} views.`,
    )
    load()
  }

  const challenges = useMemo(() => challengeOptions(rows || []), [rows])
  const shown = useMemo(() => visibleVideos(rows || [], filter), [rows, filter])
  const totals = useMemo(() => summarise(shown), [shown])
  const retired = useMemo(() => (rows || []).filter((v) => !v.qualifies && !v.pinned).length, [rows])

  const months = useMemo(() => monthsOf(rows || []), [rows])
  const filtered = filter.challenge || filter.platform || filter.reason || filter.q || filter.market || filter.month

  return (
    <div className="page">
      <PageHeader
        back="/admin"
        title={tr('Video tracker')}
        subtitle={tr('The best videos the community has made, with the hook that made each one work. Built for briefing creators and for sharing with the rest of the team.')}
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

      <MarketScope markets={markets} value={filter.market} onChange={(m) => set({ market: m })}
        note={rows ? `${shown.length} ${shown.length === 1 ? 'video' : 'videos'}` : ''} />

      {/* WHAT THE SYNC IS CURRENTLY LOOKING FOR, SAID OUT LOUD. A page whose
          contents are decided by two numbers nobody can see is a page that
          looks broken every time it disagrees with somebody's expectation -
          "why isn't my video in here" has an answer, and this is it. */}
      {rules && (
        <p className="-mt-2 mb-5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-smoke">
          <Icon name="bulb" className="h-3.5 w-3.5 shrink-0 text-brand" />
          {tr('Syncing the top')} <strong className="font-semibold text-ink">{rules.top_per_challenge}</strong> {tr('of every challenge, plus anything over')}{' '}
          <strong className="font-semibold text-ink">{formatViews(rules.view_threshold)}</strong> {tr('views')}.
          <button type="button" onClick={() => setTuning(true)} className="font-semibold text-brand hover:underline">
            {tr('Change')}
          </button>
        </p>
      )}

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
      <div className="mb-6 rounded-card border border-gray-100 bg-white p-3 shadow-card sm:p-4">
        <div className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-sm">
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
          <button
            type="button"
            onClick={() => downloadCsv(`tryp-video-tracker-${filter.month || new Date().toISOString().slice(0, 10)}.csv`, toCsvRows(shown), CSV_COLUMNS)}
            disabled={!shown.length}
            className="ml-auto rounded-full px-3 py-1.5 text-sm font-medium text-smoke transition-all duration-200 disabled:opacity-40 hoverable:hover:bg-cloud hoverable:hover:text-ink"
          >
            <Icon name="download" className="mr-1.5 inline h-4 w-4 align-[-3px]" />
            {tr('Export')}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3">
          <label className="relative min-w-[11rem] flex-1 sm:max-w-xs">
            <Icon name="magnifier" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-smoke" />
            <input
              value={filter.q}
              onChange={(e) => set({ q: e.target.value })}
              placeholder={tr('Search hooks, captions, creators')}
              className="no-ios-zoom w-full rounded-full border border-gray-200 bg-white py-2 pl-9 pr-3 text-sm outline-none transition-colors focus:border-brand"
              aria-label={tr('Search the tracker')}
            />
          </label>

          <Select
            value={filter.challenge}
            onChange={(v) => set({ challenge: v })}
            className="min-w-[11rem]"
            ariaLabel={tr('Challenge')}
            options={[{ value: '', label: tr('Every challenge') },
              ...challenges.map((c) => ({ value: c.key, label: c.label }))]}
          />
          <Select
            value={filter.platform}
            onChange={(v) => set({ platform: v })}
            className="min-w-[9rem]"
            ariaLabel={tr('Platform')}
            options={[{ value: '', label: tr('Every platform') },
              ...PLATFORMS.map((p) => ({ value: p, label: p }))]}
          />
          <Select
            value={filter.reason}
            onChange={(v) => set({ reason: v })}
            className="min-w-[10rem]"
            ariaLabel={tr('Why it is here')}
            options={[
              { value: '', label: tr('Any reason') },
              { value: 'podium', label: tr('Top of a challenge') },
              { value: 'threshold', label: tr('Over the view line') },
              { value: 'manual', label: tr('Added by hand') },
            ]}
          />
          <Select
            value={filter.sort}
            onChange={(v) => set({ sort: v })}
            className="min-w-[10rem]"
            ariaLabel={tr('Sort')}
            options={Object.entries(SORTS).map(([k, s]) => ({ value: k, label: tr(s.label) }))}
          />

          {/* RETIRED ROWS ARE A DELIBERATE VISIT, not a default view. The count
              is on the button because "show retired" with nothing behind it is
              a control that does nothing, and no way to tell from here. */}
          {retired > 0 && (
            <button
              type="button"
              onClick={() => set({ showRetired: !filter.showRetired })}
              aria-pressed={filter.showRetired}
              className={cx(
                'rounded-full px-3.5 py-2 text-sm font-medium transition-all duration-200',
                filter.showRetired
                  ? 'bg-brand text-white shadow-card'
                  : 'border border-gray-200 bg-white text-smoke hoverable:hover:-translate-y-0.5 hoverable:hover:text-ink',
              )}
            >
              {tr('Retired')} · {retired}
            </button>
          )}

          {(filtered || filter.showRetired) && (
            <button
              type="button"
              onClick={() => setFilter({ market: '', challenge: '', platform: '', reason: '', month: '', q: '', sort: filter.sort, showRetired: false })}
              className="rounded-full px-3 py-2 text-sm font-medium text-smoke transition-colors hover:text-ink"
            >
              {tr('Clear')}
            </button>
          )}
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
                  ? tr('Press "Sync from entries" to pull the top videos out of every challenge on the platform, or add one by hand from any market.')
                  : tr('Try a wider filter, or clear them all.')}
              </p>
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

      {tuning && rules && (
        <RulesModal
          rules={rules}
          onClose={() => setTuning(false)}
          onSaved={(next) => { setRules(next); setTuning(false); setSyncNote(tr('Saved. Press "Sync from entries" to apply it.')) }}
        />
      )}
    </div>
  )
}

// THE TWO NUMBERS, EDITABLE.
//
// Deliberately not a settings page: they are two integers that only make sense
// beside the list they decide, and a trip to /settings to change them is a trip
// away from the thing you are trying to fix.
function RulesModal({ rules, onClose, onSaved }) {
  const tr = useT()
  const [top, setTop] = useState(String(rules.top_per_challenge))
  const [threshold, setThreshold] = useState(String(rules.view_threshold))
  const [saving, setSaving] = useState(false)
  const [err, setErr] = useState('')

  async function save() {
    const next = {
      // CLAMPED, because both of these are a `limit` on a query that runs over
      // every entry the programme has. Zero is meaningful for the top (track
      // nothing but the big ones); a hundred is more than any challenge has had.
      top_per_challenge: Math.max(0, Math.min(100, Number(top) || 0)),
      view_threshold: Math.max(0, Number(threshold) || 0),
    }
    setSaving(true)
    const { error } = await supabase.from('app_settings')
      .upsert({ key: 'video_tracker', value: next, updated_at: new Date().toISOString() })
    setSaving(false)
    if (error) { setErr(error.message); return }
    onSaved(next)
  }

  return (
    <Modal open onClose={onClose} title={tr('What gets tracked')}>
      <div className="space-y-4">
        {err && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{err}</p>}
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-smoke">{tr('Top videos per challenge')}</span>
          <input value={top} onChange={(e) => setTop(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric"
            className="no-ios-zoom w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm tabular-nums outline-none focus:border-brand" />
          <span className="mt-1.5 block text-xs text-smoke">{tr('Three is the podium. Raise it on a challenge with hundreds of entries.')}</span>
        </label>
        <label className="block">
          <span className="mb-1.5 block text-xs font-semibold uppercase tracking-wide text-smoke">{tr('View count that earns a place on its own')}</span>
          <input value={threshold} onChange={(e) => setThreshold(e.target.value.replace(/[^\d]/g, ''))} inputMode="numeric"
            className="no-ios-zoom w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-sm tabular-nums outline-none focus:border-brand" />
          <span className="mt-1.5 block text-xs text-smoke">
            {tr('Any video over this is tracked whatever it placed. Currently')} {formatViews(Number(threshold) || 0)}.
          </span>
        </label>
        <p className="rounded-xl bg-cloud/70 px-4 py-3 text-xs leading-relaxed text-smoke">
          {tr('Changing these never removes anything. A video that stops qualifying is marked retired and keeps its hook and notes.')}
        </p>
        <div className="flex flex-col gap-2 sm:flex-row-reverse">
          <button type="button" onClick={save} disabled={saving} className="btn-primary flex-1 justify-center disabled:opacity-50">
            {saving ? <Spinner /> : tr('Save')}
          </button>
          <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">{tr('Cancel')}</button>
        </div>
      </div>
    </Modal>
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
  const why = reasonLabel(v)
  const handle = atHandle(v.creator_handle)
  const account = creatorLink(v)
  const challenge = challengeOf(v)
  const rest = captionRest(v)

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
  // `getVideoPreview` is the same tokenless oEmbed lookup the submission cards
  // use - no key, cached per page load, and it resolves for TikTok and YouTube.
  // Instagram gives nothing, so those keep a quiet tinted panel with the
  // platform mark small in the corner rather than filling the frame.
  const [thumb, setThumb] = useState(v.thumbnail_url || null)
  useEffect(() => {
    if (v.thumbnail_url) { setThumb(v.thumbnail_url); return undefined }
    let alive = true
    import('../../lib/videoPreview')
      .then((m) => m.getVideoPreview(v.video_url))
      .then((p) => { if (alive && p?.thumbnail) setThumb(p.thumbnail) })
      .catch(() => {})
    return () => { alive = false }
  }, [v.video_url, v.thumbnail_url])

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
      <button
        type="button"
        onClick={onPlay}
        className="relative block h-36 w-full overflow-hidden bg-cloud text-left"
        aria-label={tr('Play this video')}
      >
        {thumb
          ? <img src={thumb} alt="" className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" />
          : <span className="absolute inset-0 bg-gradient-to-br from-brand/10 to-brand/25" aria-hidden />}
        {/* A play affordance that reads on a photograph as well as on a tint. */}
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/85 shadow-card backdrop-blur-sm transition-transform duration-300 group-hover:scale-110">
            <svg viewBox="0 0 24 24" className="ml-0.5 h-4 w-4 text-brand" fill="currentColor" aria-hidden>
              <path d="M8 5.2v13.6a1 1 0 0 0 1.5.87l11-6.8a1 1 0 0 0 0-1.74l-11-6.8A1 1 0 0 0 8 5.2z" />
            </svg>
          </span>
        </span>
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
        {v.platform && (
          <span className="absolute right-2 top-2 rounded-full bg-white/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-smoke backdrop-blur-sm">
            {v.platform}
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

        {/* WHAT THE CAPTION SAYS THAT THE HOOK HAS NOT. Ethan: "it says
            beautiful outfits, new destinations, and it says it again." The hook
            IS the caption's first line, so printing both always printed one of
            them twice. See `captionRest`. */}
        {rest && <p className="mt-1.5 text-xs leading-relaxed text-smoke line-clamp-2">{rest}</p>}

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

        <div className="mt-auto flex items-center gap-2 pt-3.5">
          <span className={cx(
            'rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide',
            why.tone === 'brand' && 'bg-brand-tint text-brand',
            why.tone === 'green' && 'bg-green-50 text-green-700',
            why.tone === 'grey' && 'bg-cloud text-smoke',
          )}>
            {why.label}
          </span>
          {!v.qualifies && (
            <span className="rounded-full bg-cloud px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">
              {tr('Retired')}
            </span>
          )}

          <span className="ml-auto flex items-center gap-1">
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
