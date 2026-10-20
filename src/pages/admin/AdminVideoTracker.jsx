import { useCallback, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../../context/AuthContext'
import { PageHeader, Skeleton, Spinner, Select, Avatar } from '../../components/ui'
import Icon from '../../components/Icon'
import { PLATFORMS as PLATFORM_MARKS } from '../../components/VideoThumb'
import { useScopedMarkets } from '../../components/admin/MarketScope'
import TrackedVideoSheet from '../../components/admin/TrackedVideoSheet'
import { cx, formatViews, formatDate, downloadCsv } from '../../lib/utils'
import {
  CSV_COLUMNS, PLATFORMS, SORTS, atHandle, challengeOf,
  challengeOptions, countryOptions, creatorLink, handleOf, monthLabel, monthsOf, summarise,
  toCsvRows, visibleVideos,
} from '../../lib/videoTracker'
import { flagFromIso } from '../../lib/flags'
import { resolveThumbnail, forgetThumbnail } from '../../lib/videoThumbs'
import { useT } from '../../lib/i18n'
import { translateTexts } from '../../lib/contentTranslate'
import { useLocale } from '../../lib/i18n'
import { notice, promptText } from '../../lib/confirm'
import { toastSuccess } from '../../lib/toast'
import { safeUrl } from '../../lib/safeUrl'
import { contentApi } from '../../api/content'

// THE VIDEO TRACKER.
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
// NOTHING HERE IS EVER DELETED BY THE MACHINE. A video that drops under the threshold, or is disqualified, stops
// qualifying and keeps its notes in the database (migration 211) - but this page never shows it again., so a
// non-qualifying row is filtered out with no toggle back to it (see `visibleVideos`).
export default function AdminVideoTracker() {
  const tr = useT()
  const { profile } = useAuth()
  const { markets } = useScopedMarkets()

  const [rows, setRows] = useState(null)
  const [err, setErr] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [syncNote, setSyncNote] = useState('')
  const [editing, setEditing] = useState(null)   // a row, or {} for a new one

  // THE FILTER IS ONE OBJECT, not six pieces of state, because every consumer of it takes the whole thing
  // (`visibleVideos`) and because that makes "clear all" one line rather than six. `q` HAS NO CONTROL AND IS NOT DEAD.
  // The search box was removed at three videos - see the note on the filter strip - and `visibleVideos` still reads this
  // and is still tested on it, so putting the input back is one element. It stays in the shape so that `Clear` and
  // `filtered` keep meaning the same thing whichever of those two states the page is in.
  const [filter, setFilter] = useState({
    market: '', challenge: '', platform: '', month: '', q: '', sort: 'views', source: '', country: '',
  })
  // THE HOOKS IN ANOTHER LANGUAGE. '' is the words as written; a language code translates every hook on the page through
  // the shared cache, original one press away.
  // IN THE LANGUAGE YOU READ THE APP IN (15 Oct 2026): "the hook should be translated to the language you're viewing it
  // in, with the option to show the original". One toggle beside the count, not a whole line.
  const locale = useLocale()
  const [showOriginal, setShowOriginal] = useState(false)
  const hookLang = showOriginal ? '' : locale
  const set = useCallback((patch) => setFilter((f) => ({ ...f, ...patch })), [])

  const load = useCallback(async () => {
    const videos = await contentApi.adminTrackedVideos()
    if (videos.error) { setErr(videos.error.message); setRows([]); return }
    setErr('')
    setRows(videos.data || [])
  }, [])
  useEffect(() => { load() }, [load])

  async function sync() {
    setSyncing(true)
    setSyncNote('')
    const { data, error } = await contentApi.syncTrackedVideos()
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
        : 'Nothing changed.',
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

  // THE MONTH COUNTS FOLLOW THE OTHER FILTERS. They counted every row ever tracked, retired ones included, so "September
  // 21" sat under "All months 15" - two numbers for one list.
  const months = useMemo(() => monthsOf(visibleVideos(rows || [], { ...filter, month: '' })), [rows, filter])
  const filtered = filter.challenge || filter.platform || filter.q || filter.market || filter.month || filter.source || filter.country
  // THE COUNTRY FILTER (20 Oct 2026): the creator's own country, so "Bulgaria" can be picked even though Bulgaria is not
  // one of our markets. Only countries with a video under the OTHER filters are listed (month included), with counts.
  const countries = useMemo(
    () => countryOptions(visibleVideos(rows || [], { ...filter, country: '' }), filter.country),
    [rows, filter],
  )
  const chosenCountry = countries.find((c) => c.key === filter.country) || null
  // The file says what is in it: tryp-videos_october-2026_spain_bulgaria_vip.csv, or _all for the whole tracker.
  const exportName = () => {
    const slug = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    const parts = [
      filter.month ? monthLabel(filter.month) : 'all-months',
      markets.find((m) => m.id === filter.market)?.name,
      chosenCountry?.name,
      filter.source,
      filter.platform,
    ].map(slug).filter(Boolean)
    return `tryp-videos_${parts.join('_')}.csv`
  }
  const hooks = useTranslatedHooks(shown, hookLang)
  // One dropdown for "which videos": a whole group (community, VIP, official) or one challenge or programme.
  const scopeValue = filter.challenge
  const setScope = (v) => set({ challenge: v })
  const hasVip = (rows || []).some((r) => r.source === 'vip')
  const hasOfficial = (rows || []).some((r) => r.source === 'official')

  async function editVipHook(v) {
    const next = await promptText('The words on this video, as they appear on screen.', {
      title: v.screen_text ? 'Edit the hook' : 'Type the hook', defaultValue: v.screen_text || '', confirmLabel: 'Save',
    })
    if (next === null || next === undefined) return
    const { error } = await contentApi.setVideoHook({ p_video: v.id, p_is_vip: true, p_text: next })
    if (error) { notice(error.message); return }
    toastSuccess('Hook saved.')
    setRows((rs) => rs.map((r) => (r.id === v.id ? { ...r, screen_text: next.trim() || null } : r)))
  }

  return (
    <div className="page">
      <PageHeader
        back="/admin"
        title={tr('Video tracker')}
        action={
          <div className="flex flex-wrap gap-2">
            {/* FEWER BUTTONS (15 Oct 2026): the sync is a round icon beside Add, its name in the tooltip. */}
            <button type="button" onClick={sync} disabled={syncing} title={tr('Sync from entries')} aria-label={tr('Sync from entries')}
              className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-200 bg-white text-smoke transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:border-brand hoverable:hover:text-brand disabled:opacity-50">
              {syncing ? <Spinner className="h-4 w-4" /> : <Icon name="refresh" className="h-4 w-4" strokeWidth={2.2} />}
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
        <p className="mb-5 flex items-center gap-2 rounded-xl bg-cloud/70 px-4 py-3 text-sm text-ink">
          <Icon name="check" className="h-4 w-4 shrink-0 text-brand" />
          {syncNote}
        </p>
      )}

      {/* NO `note` HERE. It said "3 videos", eighty pixels above a line in the
          filter card that says "3 videos · best 15.2k" - the same fact twice on
          one screen, which is a third of what "there's too much going on"
          meant. The card's version is the one that stays: it is beside the
          filters that change it. */}
      {/* WHERE AND WHOSE, ONE ROW (15 Oct 2026: the General / VIP / Official switch "takes up too much space and should be
          combined with Worldwide, Germany, Nordics"). Markets on the left, the space on the right, both in one card. */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-card border border-gray-100 bg-white p-1.5 shadow-card animate-fade-up">
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-0.5 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {[{ id: '', name: tr('Worldwide') }, ...markets].map((m) => {
            const on = filter.market === m.id
            return (
              <button key={m.id || 'all'} type="button" onClick={() => set({ market: m.id })} aria-pressed={on}
                className={cx('inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-200', on ? 'bg-brand text-white shadow-card' : 'text-smoke hover:bg-cloud hover:text-ink')}>
                {!m.id && <Icon name="globe" className="h-3.5 w-3.5" />}{m.name}
              </button>
            )
          })}
        </div>
        {(hasVip || hasOfficial) && (
          <div className="flex shrink-0 gap-0.5 rounded-lg bg-cloud p-0.5 max-sm:w-full max-sm:overflow-x-auto">
            {[
              ['', tr('All'), 'squares'],
              ['community', tr('Community'), 'users'],
              ...(hasVip ? [['vip', tr('VIP'), 'star']] : []),
              ...(hasOfficial ? [['official', tr('Official'), 'badge']] : []),
            ].map(([k, label, icon]) => {
              const on = filter.source === k
              const n = visibleVideos(rows || [], { ...filter, source: k, challenge: '' }).length
              return (
                <button key={k || 'all'} type="button" onClick={() => set({ source: k, challenge: '' })} aria-pressed={on} title={label}
                  className={cx('inline-flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold transition-all duration-200', on ? 'bg-white text-ink shadow-card' : 'text-smoke hover:text-ink')}>
                  <Icon name={icon} className={cx('h-3.5 w-3.5', on ? 'text-brand' : '')} />{label}
                  <span className="tabular-nums text-[10px] text-gray-400">{n}</span>
                </button>
              )
            })}
          </div>
        )}
      </div>

      {/* (The standing "syncing the top 3 of every challenge, plus anything over 10k views" line used to sit here as a
          paragraph of its own.

          Right, and the reason is that it was answering a question nobody had
          asked yet. It exists for "why isn't my video in here", which is asked
          about ONCE, by somebody who is already looking for a control. So it is
          a control: `3 / 10k` beside Export, which says the same two numbers in
          six characters and opens the panel that explains them in full. See
          `RulesModal`.) */}

      {/* ONE CARD, NOT A WALL OF TILES AND A LOOSE ROW OF PILLS. And on the tiles: "some of these metrics are not
          necessary. Why do we need the views from the best videos? Number of videos you can keep, the other two maybe
          change them or delete them."

          So the four StatCards are gone and what survives of them - how many
          videos, and the best one - is a single line at the top of the same
          card the filters live in. Two 96px tiles to say "3" and "15.2k" was
          the page shouting a number it had already put on every card.

          The line still describes WHAT IS ON SCREEN rather than the table: a
          page whose totals ignore its own filter tells you the wrong thing
          every time you use it. */}
      {/* ONE LINE, THREE FILTERS, AND NO SEARCH BOX.

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
      <div className="mb-6 animate-fade-up rounded-card border border-gray-100 bg-white p-2 shadow-card [animation-delay:80ms] sm:p-2.5">
        <div className="flex flex-wrap items-center gap-1.5 xl:flex-nowrap">
          {/* THE SEARCH BOX IS BACK, now that the list is hundreds of videos. It matches the creator, their handle, the
              hook (typed or read off the video), the caption, the challenge, the market and the link, accents ignored. */}
          {/* ONE LINE ON A DESKTOP. The team: the placeholder was cut off ("Search creator hook or the cap") and the
              count, best and Export fell to a second line. The box says "Search", and every control is a little narrower
              so the whole strip fits beside the month rail. */}
          <div className="relative w-full sm:w-[10rem] sm:shrink-0">
            <Icon name="magnifier" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
            <input
              type="search"
              value={filter.q}
              onChange={(e) => set({ q: e.target.value })}
              placeholder={tr('Search')}
              aria-label={tr('Search videos')}
              className="input !py-2.5 !pl-9 text-sm"
            />
          </div>
          <Select
            value={scopeValue}
            onChange={setScope}
            // FIXED WIDTHS, NOT MINIMUMS. A `min-w` select grows to fit
            // whatever is chosen, so picking "Tryp.com Creative Challenge"
            // pushed the two selects to its right along by 55px - the same
            // complaint as the Clear button ("I don't like how everything
            // moves"), from a different cause. The trigger truncates instead;
            // the full label is one click away and is also the heading above
            // the grid.
            variant="field"
            className="w-[11.5rem] shrink-0"
            ariaLabel={tr('Challenge')}
            options={[{ value: '', label: tr('Every challenge') },
              ...challenges.filter((c) => !filter.source || c.source === filter.source || (!c.source && filter.source === 'community')).map((c) => ({ value: c.key, label: c.label }))]}
          />
          <Select
            value={filter.platform}
            onChange={(v) => set({ platform: v })}
            // WIDE ENOUGH FOR ITS OWN PLACEHOLDER. The padding, the chevron and its gap take 52px, so the label needs
            // 112 of its own.
            variant="field"
            className="w-[10.5rem] shrink-0"
            ariaLabel={tr('Platform')}
            options={[{ value: '', label: tr('Every platform') },
              ...PLATFORMS.map((p) => ({ value: p, label: p }))]}
          />
          <Select
            value={filter.country}
            onChange={(v) => set({ country: v })}
            variant="field"
            className="w-[10.5rem] shrink-0"
            ariaLabel={tr('Country')}
            options={[{ value: '', label: tr('Every country') },
              ...countries.map((c) => ({ value: c.key, label: `${c.code ? `${flagFromIso(c.code)} ` : ''}${c.name} (${c.count})` }))]}
          />
          <Select
            value={filter.sort}
            onChange={(v) => set({ sort: v })}
            variant="field"
            className="w-[9rem] shrink-0"
            ariaLabel={tr('Sort')}
            options={Object.entries(SORTS).map(([k, s]) => ({ value: k, label: tr(s.label) }))}
          />

          {/* IT IS ALWAYS THERE, AND SOMETIMES INVISIBLE.

              A control that appears when it becomes useful is a reasonable
              instinct and it is wrong in a WRAPPING row: adding an item to a
              flex-wrap line does not add a button, it re-flows every button on
              the line. So the space is reserved permanently and only the
              button's visibility changes.

              `invisible` rather than `opacity-0`: it must also leave the tab
              order when it does nothing. */}
          <button
            type="button"
            onClick={() => setFilter({ market: '', challenge: '', platform: '', month: '', q: '', sort: filter.sort, source: '', country: '' })}
            aria-hidden={!filtered}
            tabIndex={filtered ? 0 : -1}
            className={cx(
              'rounded-xl px-2 py-2.5 text-sm font-medium text-smoke transition-colors hover:text-ink',
              !filtered && 'invisible',
            )}
          >
            {tr('Clear')}
          </button>

          <div className="ml-auto flex items-center gap-x-2 gap-y-1 whitespace-nowrap text-sm">
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
          {/* "over 10k" is gone (). The threshold is still the rule; it is simply not restated on every visit. */}
          <button
            type="button"
            onClick={() => downloadCsv(exportName(), toCsvRows(shown), CSV_COLUMNS)}
            disabled={!shown.length}
            title={tr('Download CSV of these videos')} aria-label={tr('Download CSV of these videos')}
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-gray-200 text-smoke transition-all duration-200 disabled:opacity-40 hoverable:hover:border-brand hoverable:hover:text-brand"
          >
            <Icon name="download" className="h-4 w-4" />
          </button>
          </div>
        </div>

      </div>

      {/* --------------------------------------------- the grid + the months --

          A MONTH IS A REPORT, AND A REPORT IS THE GRID WITH ONE MORE FILTER ON IT.

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
            <div className="animate-fade-up rounded-card border border-dashed border-gray-200 px-6 py-16 text-center">
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

          {/* THE CHALLENGE NAMES ITSELF ONCE, ABOVE ITS OWN VIDEOS.

              With a challenge selected, every card in the grid is wearing the
              same challenge badge, which is twenty repetitions of a fact that
              belongs at the top of the page exactly once. It is also the state
              this page is USED in - "show me the UK challenge" is the question
              somebody arrives with - so the answer deserves a heading rather
              than a filter chip. */}
          {rows && shown.length > 0 && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2 px-1">
              <span className="text-sm text-smoke">
                {filter.source === 'vip' ? tr('Every VIP community video over the line') : filter.source === 'official' ? tr('Every official creator video over the line') : filter.source === 'community' ? tr('Community videos') : ''}
              </span>
              <HookToggle original={showOriginal} onChange={setShowOriginal} locale={locale} />
            </div>
          )}
          {rows && shown.length > 0 && filter.challenge && chosenChallenge && (
            <div key={chosenChallenge.label} className="mb-4 flex animate-fade-up flex-wrap items-baseline gap-x-2.5 gap-y-1 px-1">
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
            // ONE ENTRANCE FOR THE WHOLE GRID. The scroll-triggered, staggered reveal made cards arrive one by one as
            // each came into view; now the grid rises as one, keyed on the filter so a change of filter replays it, and
            // each frame fades in over its own placeholder the moment its picture has loaded.
            <div
              key={JSON.stringify(filter)}
              className="grid animate-fade-up grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3"
            >
              {shown.map((v, i) => (
                <VideoCard
                  key={v.id}
                  v={v}
                  eager={i < 6}
                  hook={(v.screen_text || v.hook) ? hooks.pick(v.screen_text || v.hook) : null}
                  translated={!!(v.screen_text || v.hook) && hooks.differs(v.screen_text || v.hook)}
                  onOpen={() => (v.source && v.source !== 'community' ? editVipHook(v) : setEditing(v))}
                />
              ))}
            </div>
          )}
        </div>

        {months.length > 0 && (
          <aside className="order-first mb-5 animate-fade-up [animation-delay:160ms] lg:order-none lg:mb-0 lg:w-44 lg:shrink-0">
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
                count={rows ? visibleVideos(rows, { ...filter, month: '' }).length : 0}
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

    </div>
  )
}

// ONE VIDEO.
//
// The hierarchy is the argument: the HOOK is the heading, the view count is a
// number beside it, and the caption is the small print. Every other card in
// this product leads with a person or a title; this one leads with a sentence,
// because the sentence is what somebody came here to steal.
function VideoCard({ v, onOpen, eager = false, hook = null, translated = false }) {
  const tr = useT()
  const handle = atHandle(handleOf(v))
  const account = creatorLink(v)
  const challenge = challengeOf(v)

  // A REAL FRAME OF THE VIDEO WHERE ONE CAN BE HAD.
  //
  // , and "maybe actually show a preview of the video if you can."
  //
  // `VideoThumb` paints a 128px orange slab with a giant platform logo on it,
  // which is the right answer on a challenge entry - it is a link somebody is
  // about to open, and the platform is the useful fact. On this page it is the
  // wrong answer twice over: the platform is already a filter and a badge, and
  // a wall of identical orange rectangles is the opposite of a page whose job
  // is to help you tell twenty videos apart.
  //
  // EVERY PLATFORM GETS A FRAME NOW, INCLUDING INSTAGRAM.
  //
  // They are describing a real asymmetry with a boring cause: TikTok and YouTube publish tokenless oEmbed endpoints and
  // Instagram does not, so the browser-side lookup could only ever answer for two of the three. The third answer has
  // existed since this morning and nothing was asking for it - the `view-sync` probe reads Instagram server-side for the
  // view count and brings a `thumbnail` back with it. `resolveThumbnail` is the one place that knows all three routes
  // and the order to try them in; see lib/videoThumbs.
  //
  // WHAT IS FOUND IS WRITTEN BACK to `tracked_videos.thumbnail_url`, so this
  // costs one lookup per video ever rather than one per page view - and when
  // Instagram's signed URL eventually expires, `onError` on the <img> below
  // throws the cache away and asks again. A frame that heals is why caching an
  // expiring URL is the right thing to do rather than a corner cut.
  const [thumb, setThumb] = useState(v.thumbnail_url || null)
  const [retried, setRetried] = useState(false)
  const [loaded, setLoaded] = useState(false)
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
        contentApi.trackedVideos().update({ thumbnail_url: url }).eq('id', v.id).then(() => {})
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
      {/* 4:5, NOT A 144px LETTERBOX.

          Every video here is shot 9:16 and the frame was `h-36` on a card about
          300px wide, so `object-cover` was showing 48% of the picture's height
          and throwing away the rest from both ends at once. Faces sit in the
          top half of a vertical frame, which is why it was faces that went. 4:5
          shows 71% of it and is still a card rather than a poster; 3:4 was
          tried and makes a three-column grid two screens tall. */}
      {/* STRAIGHT TO THE VIDEO. The team: the thumbnail showed "This one cannot be played here. Open it on the platform
          instead." - "clicking on the thumbnail or the card of any of these should just open the link directly in new
          tab." So the frame is a link now. */}
      <a
        href={v.video_url}
        target="_blank"
        rel="noopener noreferrer"
        className="relative block aspect-[4/5] w-full overflow-hidden bg-cloud text-left"
        aria-label={tr('Open on the platform')}
      >
        <span className={cx('absolute inset-0 bg-gradient-to-br from-brand/10 to-brand/20', !loaded && thumb && 'animate-pulse')} aria-hidden />
        {thumb && (
          <img
            src={thumb}
            alt=""
            onError={onThumbError}
            onLoad={() => setLoaded(true)}
            referrerPolicy="no-referrer"
            decoding="async"
            loading={eager ? 'eager' : 'lazy'}
            fetchpriority={eager ? 'high' : 'auto'}
            className={cx(
              'relative h-full w-full object-cover transition-[opacity,transform] duration-500 ease-out group-hover:scale-105',
              loaded ? 'opacity-100' : 'opacity-0',
            )}
          />
        )}
        {/* NO PLAY MARK. The frame IS the button - this whole block is one - so the triangle was announcing an
            affordance rather than carrying it, and it landed on the face every time, because a face is what a vertical
            video puts in the middle. Same change on the challenge board and on a creator's profile; see
            components/VideoThumb. */}
        {v.views != null && (
          <span className="absolute bottom-2 right-2 rounded-full bg-ink/70 px-2.5 py-1 text-xs font-bold tabular-nums text-white backdrop-blur-sm">
            {formatViews(v.views)}
          </span>
        )}
        {/* THE PLACING, and it is two different facts wearing one badge. `rank`
            is where it came in its CHALLENGE, which is the stronger statement
            and wins; `place` is where it sits in the list you are looking at,
            which is what makes a monthly report read as a chart. */}
        {/* NO NUMBER IN THE CORNER. */}
        {/* THE PLATFORM AS ITS OWN MARK. Same marks as the challenge board, imported rather than copied. */}
        {v.platform && PLATFORM_MARKS[v.platform] && (
          <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-white/95 text-ink shadow-card backdrop-blur-sm">
            <span className="h-4 w-4">{PLATFORM_MARKS[v.platform].icon}</span>
          </span>
        )}
      </a>

      {/* The card body opens it too; its own links and buttons keep their own jobs. */}
      <div
        className="flex min-w-0 flex-1 cursor-pointer flex-col p-4"
        onClick={(e) => {
          if (e.target.closest('a,button')) return
          if (safeUrl(v.video_url)) window.open(safeUrl(v.video_url), '_blank', 'noopener,noreferrer')
        }}
      >
        {/* THE HOOK, AS THE HEADING. `line-clamp-3` rather than a truncation:
            a hook that stops mid-word teaches nothing, and three lines is the
            longest one anybody has actually written. */}
        <p className="text-[15px] font-semibold leading-snug text-ink line-clamp-3">
          {/* THE WORDS ON THE VIDEO WIN: the text the creator typed onto it (read from TikTok with the view count) is
              the real hook; the caption's first line is the fallback. */}
          {/* TRANSLATED IS A SMALL GLOBE IN THE LINE, NOT A LINE OF ITS OWN (14 Oct 2026: the label above/below every hook
              "is taking up so much space"). Hover says what it means. */}
          {translated && <span title={tr('Translated from the video')} className="mr-1 inline-flex align-[-2px] text-brand"><Icon name="globe" className="h-3.5 w-3.5" /></span>}
          {hook || v.hook || <span className="text-gray-300">{tr('No hook written yet')}</span>}
        </p>
        {/* The caption under the on-screen hook, small, so both are there to compare. */}
        {v.screen_text && v.caption && (
          <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-smoke">{v.caption}</p>
        )}

        {/* AND THE REST OF THE CAPTION IS GONE ENTIRELY.

            `captionRest` was already the fix for printing the hook twice, and
            it was the wrong fix for the right complaint: the remainder of a
            caption is hashtags and a shop link. It is two lines of noise under
            the one line this page is FOR, and every pixel it takes is a pixel
            the frame above it does not have. The full caption is still on the
            row and is still in the edit sheet, which is where somebody who
            wants it goes. */}

        {/* THE PERSON, WITH THEIR FACE. One row: portrait, name, handle - and the whole row is the link to their
            account, so there is one target rather than a name that does nothing beside a handle that does. */}
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
                {[challenge, v.home_name && v.home_name !== v.market_name ? `${v.home_name} creator` : v.market_name].filter(Boolean).join(' · ')}
              </span>
            )}
          </span>
        </div>

        {/* THE "OVER THE VIEW LINE" BADGE IS GONE. Migration 252 made the tracker threshold-only - every synced row's
            reason IS "over the line", always, so a badge repeating that on every single card said nothing. What
            survives, `reason === 'manual'`, is a fact that still varies card to card - a video from a market not yet on
            this platform, added by a person - so it keeps a mark, just a quieter one than a full-width pill. A thin top
            rule now separates the footer from the card body instead. */}
        <div className="mt-auto flex items-center gap-2 border-t border-gray-100 pt-3">
          <span className="flex min-w-0 items-center gap-1.5 truncate text-xs text-gray-400">
            {v.posted_at && <span className="tabular-nums">{formatDate(v.posted_at)}</span>}
            {v.source && v.source !== 'community' && (
              <>
                {v.posted_at && <span aria-hidden>·</span>}
                <span className="inline-flex shrink-0 items-center gap-1 font-semibold text-brand">
                  <Icon name={v.source === 'official' ? 'badge' : 'star'} className="h-3 w-3" />
                  {v.source === 'official' ? tr('Official') : tr('VIP')}
                </span>
              </>
            )}
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
            {/* ONLY EDIT. The team: the card itself opens the video, "so you can remove the link button", and the star
                "acts as a pin... we don't need it because we have the pin to top" inside the edit sheet. A pinned video
                keeps its orange border. */}
            <IconButton label={v.source && v.source !== 'community' ? tr('Edit the hook') : tr('Edit')} onClick={onOpen} name="pencil" />
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

// THE HOOKS (on-screen text, else the caption's first line), IN THE READER'S LANGUAGE ('' = as written). One cache lookup for the whole page.
function useTranslatedHooks(rows, lang) {
  const [map, setMap] = useState({})
  const texts = useMemo(() => [...new Set((rows || []).map((r) => r.screen_text || r.hook).filter(Boolean))], [rows])
  const key = texts.join('\u0001')
  useEffect(() => {
    let alive = true
    if (!lang || !key) { setMap({}); return undefined }
    translateTexts(key.split('\u0001'), lang).then((res) => { if (alive) setMap(res || {}) })
    return () => { alive = false }
  }, [key, lang])
  const differs = (t) => { const r = map[t]; return !!lang && !!r && !r.same && !!r.value && r.value !== t }
  return { differs, pick: (t) => (differs(t) ? map[t].value : t) }
}

function HookToggle({ original, onChange, locale }) {
  const name = new Intl.DisplayNames([locale || 'en'], { type: 'language' }).of(locale || 'en') || 'English'
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-cloud p-0.5 text-xs font-semibold" role="group" aria-label="Hooks">
      <Icon name="language" className="ml-2 mr-1 h-3.5 w-3.5 text-brand" />
      {[[false, name.charAt(0).toUpperCase() + name.slice(1)], [true, 'Original']].map(([v, label]) => (
        <button key={String(v)} type="button" onClick={() => onChange(v)} aria-pressed={original === v}
          className={cx('rounded-full px-3 py-1 transition-all duration-200', original === v ? 'bg-white text-ink shadow-card' : 'text-smoke hover:text-ink')}>
          {label}
        </button>
      ))}
    </span>
  )
}
