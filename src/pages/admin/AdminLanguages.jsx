import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import { useCommunity } from '../../context/CommunityContext'
import { supabase } from '../../lib/supabase'
import { PageHeader, Skeleton, EmptyState, Spinner } from '../../components/ui'
import Icon from '../../components/Icon'
import AutoTextarea from '../../components/AutoTextarea'
import Segmented from '../../components/network/Segmented'
import { LOCALES, DEFAULT_LOCALE, bundledDict, loadLocale, setOverrides, useT } from '../../lib/i18n'
import { listOverrides, saveOverride } from '../../lib/translations'
import { forgetTranslation } from '../../lib/contentTranslate'
import { toastSuccess } from '../../lib/toast'
import { cx, timeAgo } from '../../lib/utils'

// THE PLATFORM'S WORDS, EDITED BY THE PEOPLE WHO SPEAK THEM.
//
// Ethan: "can we have the ability for a country manager to edit this like an admin? ...
// there could be a section on the admin panel for languages, and they can edit the
// translation across the entire platform just for Spanish ... Build it so whenever we
// build future languages it's easy." And on 29 Sep: "improve the language edit tool,
// design it better, make it easier to use, improve functionality and UI."
//
// THREE DECISIONS MAKE THIS SMALL, AND THEY ARE ALL DOWNSTREAM OF ONE THING: the
// dictionary is keyed on the ENGLISH SENTENCE (lib/i18n).
//  1. THERE IS NOTHING TO INVENT. A translator sees the English sentence and types the
//     Spanish one. The key IS the context.
//  2. THE SCREENS COME FOR FREE. `src/locales/catalogue.json` is generated at build from
//     the same scan the i18n report uses, so "the Challenges page" is a real list.
//  3. AN EDIT IS A ROW, NOT A DEPLOY. `public.translations` is an override layer over the
//     bundled file on the same keys; clearing a box falls back to the shipped word.
//
// WHAT THE REDESIGN ADDS, and why each earns its place:
//  * A COMPLETION RING PER LANGUAGE, so "how finished is Portuguese" is an answer.
//  * STATUS FILTERS (needs work / edited here / shipped), because the useful list is
//    always "what is still English", never "every sentence".
//  * SUGGEST, a machine draft the translator reviews and changes - never saved on its own.
//  * PLACEHOLDER GUARD: a translation that drops or mangles `{n}` would print "{n}" to a
//    creator, so it is flagged the moment it is typed and blocked from saving.
//  * SAVE-ALL for a screen worth of drafts, and ARROW-KEY-FREE flow: Tab moves to the next.
//  * A SECOND TAB for BRIEFS AND CONTENT: what a person wrote (a challenge brief) is
//    translated automatically for readers and cached; a lead reviews and corrects it here.
//
// WHO CAN OPEN IT. A platform admin, and a manager of a market whose `language` is not
// English. The DATABASE decides what actually saves (RLS calls `can_edit_locale`); this
// only decides what to draw.

const loadCatalogue = () => import('../../locales/catalogue.json')

// A screen's name as a person would say it: "Admin · Admin Kpis" is the file it came from, "KPIs"
// is the screen. The key is unchanged; only the label is tidied.
const screenLabel = (name) => name
  .replace(/^Admin · (Admin )?/, '')
  .replace(/^(Shared|Other|Signing in) · /, '')
  .replace(/\bKpis?\b/g, (m) => m.toUpperCase().replace('S', 's'))
  .replace(/^creator /, 'Creator ')
const isAdminScreen = (name) => name.startsWith('Admin · ')

// THE SCREENS GROUPED THE WAY THE PLATFORM IS (30 Sep 2026). Ethan: the list on the left "is quite hard
// to find ... Maybe section it better in the actual main section of the platform, like the worldwide
// section, challenges section, room section, messages, calendar, and the other pages." ~170 files in
// one alphabetical list became one list per part of the app, in the order of the app's own nav, each
// folding open. A screen goes to the first section whose words it matches; anything unmatched is
// "Shared pieces".
const SECTIONS = [
  { key: 'home', label: 'Home and getting started', icon: 'home', re: /^(Dashboard|Landing|Onboarding|Signing in|Settings|Global Settings|Notifications)$|Signing in|Tour Host|Add To Home|App Layout|App Icon|Intro (Card|Prompt)|Timezone Prompt|Notification (Bell|Preferences)|Offline Screen|Error Screen|Protected Route|Turnstile|Google Button|Command Palette|Help Team/ },
  { key: 'worldwide', label: 'Worldwide and markets', icon: 'globe', re: /Global Home|Explore Markets|Chapter Home|Directory|Market (Members|Header|Map|Picker|Activity)|Manage Chapter|Creator (Map|Card|Spotlight)|Country Panel|World Map|Who To Meet|Place Switcher|Group Panels|Global Challenge Strip|Connect|Connections/ },
  { key: 'challenges', label: 'Challenges', icon: 'flag', re: /Challenge|Board|Leaderboard|Bonus Points|Point Rules|Scoring|Submission|Submitted|Entry Feedback|Hook|Winners|Podium|Participation Bar|Recap|Countdown|Live Challenge|Streak|Resource|Deal Finder|story/i },
  { key: 'rooms', label: 'Rooms and messages', icon: 'chat', re: /Rooms|Network Chat|Messages|Chat|Composer|Message|Reaction|Seen By|Poll|Media Attachment|Rich Toolbar|Outbox|Unread|People Picker|Report|Photo Board|Collapsible Rich|Translated Text|Collab|Jobs/ },
  { key: 'calendar', label: 'Calendar and events', icon: 'calendar', re: /Events|Event|Calendar|Reminder|Date Time|Personal Event/ },
  { key: 'profile', label: 'Profile and rewards', icon: 'user', re: /Profile|Portfolio|Slides|Kit Strip|Certificate|Milestone|Rewards|Refer|Voucher|Payment|Bank Details|Year In Review|Viewing As|Photo (Cropper|Lightbox)/ },
  { key: 'games', label: 'Games and flights', icon: 'plane', re: /Game|Puzzle|Pinpoint|Zip|Flight|Aircraft|Boarding Pass|Language Game/ },
]
const sectionOf = (name) => {
  if (isAdminScreen(name)) return 'admin'
  const label = name.replace(/^(Shared|Other|Signing in) · /, '')
  if (name.startsWith('Signing in')) return 'home'
  const hit = SECTIONS.find((sec) => sec.re.test(label))
  return hit ? hit.key : 'shared'
}
const SECTION_META = [...SECTIONS, { key: 'shared', label: 'Shared pieces', icon: 'squares' }, { key: 'admin', label: 'Admin screens', icon: 'shield' }]

// The `{placeholders}` in a sentence, as a sorted list, so "same set" is a string compare.
const holes = (s) => (String(s).match(/\{[a-zA-Z0-9_]+\}/g) || []).sort().join(',')
const holesProblem = (source, text) => {
  if (!text.trim()) return null
  const need = holes(source)
  const got = holes(text)
  if (need === got) return null
  return need
    ? `Keep ${need.split(',').join(' ')} exactly as written - it is replaced by a real value.`
    : 'This sentence has no {placeholders}, so there should be none here.'
}

export default function AdminLanguages() {
  const tr = useT()
  const { user, isAdmin } = useAuth()
  const { communities, memberships, loading: ctxLoading } = useCommunity()

  const editable = useMemo(() => {
    const codes = LOCALES.filter((l) => l.code !== DEFAULT_LOCALE).map((l) => l.code)
    if (isAdmin) return codes
    const managed = new Set(memberships.filter((m) => m.role === 'manager').map((m) => m.community_id))
    const mine = new Set(communities.filter((c) => managed.has(c.id)).map((c) => c.language).filter(Boolean))
    return codes.filter((c) => mine.has(c))
  }, [isAdmin, communities, memberships])

  const [locale, setLocaleChoice] = useState(null)
  useEffect(() => { if (!locale && editable.length) setLocaleChoice(editable[0]) }, [editable, locale])
  const [tab, setTab] = useState('interface')

  const [catalogue, setCatalogue] = useState(null)
  const [screen, setScreen] = useState(null)
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [rows, setRows] = useState(null)
  const [dictReady, setDictReady] = useState(false)
  const [error, setError] = useState('')
  const [savingKey, setSavingKey] = useState(null)
  const [drafts, setDrafts] = useState({}) // source -> unsaved text (typed or suggested)
  const [bulk, setBulk] = useState(null) // 'saving' | null
  const [limit, setLimit] = useState(30)

  useEffect(() => { loadCatalogue().then((m) => setCatalogue(m.default)) }, [])
  useEffect(() => {
    if (!locale) return
    setDictReady(false)
    loadLocale(locale).then(() => setDictReady(true))
  }, [locale])

  const refresh = useCallback(async () => {
    if (!locale) return
    setRows(null)
    const { rows: got, error: err } = await listOverrides(locale)
    if (err) { setError(err); setRows({}); return }
    const map = {}
    for (const r of got) map[r.source] = { value: r.value, at: r.updated_at, by: r.profiles?.name }
    setRows(map)
    // The app follows the edit at once: switch to that language and the change is there.
    setOverrides(locale, Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v.value])))
  }, [locale])
  useEffect(() => { refresh() }, [refresh])

  // EVERY SCREEN, PLUS THE STRINGS NO SCREEN CLAIMS (see the note in the shipped catalogue).
  const withExtras = useMemo(() => {
    if (!catalogue) return null
    const claimed = new Set(Object.values(catalogue).flat())
    const loose = Object.keys(bundledDict(locale) || {}).filter((k) => !claimed.has(k)).sort()
    return loose.length ? { ...catalogue, 'Everything else': loose } : catalogue
    // `dictReady` is the dependency the lint cannot see: `bundledDict` reads a module cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalogue, locale, dictReady])
  // Creator-facing screens first - they are what creators read - then the admin ones.
  const screens = useMemo(() => (withExtras ? Object.keys(withExtras) : [])
    .sort((a, b) => (isAdminScreen(a) - isAdminScreen(b)) || screenLabel(a).localeCompare(screenLabel(b))), [withExtras])

  const sections = useMemo(() => SECTION_META.map((m) => ({
    ...m, screens: screens.filter((n) => sectionOf(n) === m.key),
  })).filter((m) => m.screens.length), [screens])
  const [openSection, setOpenSection] = useState(null)
  const currentSection = screen ? sectionOf(screen) : null

  const dict = bundledDict(locale) || {}
  const overrides = useMemo(() => {
    const src = rows ?? {}
    return Object.fromEntries(Object.entries(src).map(([k, v]) => [k, v.value]))
  }, [rows])
  const statusOf = useCallback((s) => (overrides[s] ? 'edited' : dict[s] ? 'shipped' : 'todo'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [overrides, dict, dictReady])

  const totals = useMemo(() => {
    if (!withExtras) return { done: 0, all: 0 }
    const all = new Set(Object.values(withExtras).flat())
    let done = 0
    for (const s of all) if (statusOf(s) !== 'todo') done += 1
    return { done, all: all.size }
  }, [withExtras, statusOf])

  // COUNTED ONCE, NOT ON EVERY KEYSTROKE (2 Oct 2026). Ethan: "it can be laggy when clicking".
  // This walked every sentence of every screen on each render - and typing in one box re-renders
  // the page - so a keystroke cost a few thousand lookups. Now it only reruns when a translation
  // actually lands.
  const screenCounts = useMemo(() => {
    const out = {}
    for (const [name, list] of Object.entries(withExtras || {})) {
      out[name] = { n: list.filter((x) => statusOf(x) !== 'todo').length, total: list.length }
    }
    return out
  }, [withExtras, statusOf])
  const doneOn = (name) => screenCounts[name] || { n: 0, total: 0 }

  // What is in view: one screen, or every string matching a search - across the whole
  // product, which is how somebody fixes a word they saw once and cannot place.
  const pool = useMemo(() => {
    if (!withExtras) return []
    const q = search.trim().toLowerCase()
    if (q) {
      const all = new Set()
      for (const list of Object.values(withExtras)) for (const s of list) all.add(s)
      return [...all].filter((s) => s.toLowerCase().includes(q)
        || String(overrides[s] ?? dict[s] ?? '').toLowerCase().includes(q)).sort().slice(0, 300)
    }
    return screen ? withExtras[screen] || [] : []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withExtras, screen, search, overrides, dict, dictReady])

  const shown = useMemo(
    () => (filter === 'all' ? pool : pool.filter((s) => statusOf(s) === filter)),
    [pool, filter, statusOf],
  )
  // The ones somebody changed here come first: they are what you come back to review.
  const ordered = useMemo(
    () => [...shown].sort((a, b) => (overrides[b] ? 1 : 0) - (overrides[a] ? 1 : 0)),
    [shown, overrides],
  )
  useEffect(() => { setLimit(30) }, [screen, search, filter, locale])
  const visible = useMemo(() => ordered.slice(0, limit), [ordered, limit])
  const setDraft = useCallback((source, v) => setDrafts((d) => {
    if (v == null) { const n = { ...d }; delete n[source]; return n }
    return { ...d, [source]: v }
  }), [])
  const counts = useMemo(() => {
    const c = { all: pool.length, todo: 0, edited: 0, shipped: 0 }
    for (const s of pool) c[statusOf(s)] += 1
    return c
  }, [pool, statusOf])

  const draftList = Object.entries(drafts).filter(([s, v]) => (v ?? '').trim() && (v.trim() !== (overrides[s] || dict[s] || '')))
  const draftProblems = draftList.filter(([s, v]) => holesProblem(s, v))

  const write = useCallback(async (source, value) => {
    setSavingKey(source)
    const { error: err } = await saveOverride(locale, source, value, user?.id)
    setSavingKey(null)
    if (err) { setError(err); return false }
    setError('')
    setRows((prev) => {
      const next = { ...(prev || {}) }
      if ((value || '').trim()) next[source] = { value: value.trim(), at: new Date().toISOString(), by: 'you' }
      else delete next[source]
      setOverrides(locale, Object.fromEntries(Object.entries(next).map(([k, v]) => [k, v.value])))
      return next
    })
    setDrafts((d) => { const n = { ...d }; delete n[source]; return n })
    return true
  }, [locale, user?.id])

  async function saveDrafts() {
    setBulk('saving')
    let n = 0
    for (const [s, v] of draftList) {
      if (holesProblem(s, v)) continue
      if (await write(s, v.trim() === dict[s] ? '' : v)) n += 1
    }
    setBulk(null)
    if (n) toastSuccess(n === 1 ? tr('1 translation saved') : tr('{n} translations saved', { n }))
  }

  if (ctxLoading) return <div className="page max-w-5xl"><Skeleton className="h-40 w-full" /></div>
  if (!editable.length) return <Navigate to="/home" replace />

  const loading = !withExtras || !dictReady || rows === null

  return (
    <div className="page max-w-6xl">
      <PageHeader
        title={tr('Languages')}
        subtitle={tr('Every word the platform says, in your language. Changes are live for everyone the moment you save.')}
      />

      {/* THE LANGUAGE, WITH HOW FINISHED IT IS. */}
      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-card border border-gray-100 bg-white p-3 shadow-card">
        <div className="flex flex-wrap gap-1.5">
          {editable.map((code) => {
            const meta = LOCALES.find((l) => l.code === code)
            const on = locale === code
            return (
              <button
                key={code}
                type="button"
                onClick={() => { setLocaleChoice(code); setScreen(null); setDrafts({}); setSearch('') }}
                aria-pressed={on}
                className={cx(
                  'inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold transition-all duration-200',
                  on ? 'bg-brand text-white shadow-card' : 'bg-cloud text-smoke hoverable:hover:text-ink',
                )}
              >
                <span className="text-base leading-none">{meta?.flag}</span>
                {meta?.native || code}
              </button>
            )
          })}
        </div>
        {/* A LINE OF TEXT, NOT A BAR (2 Oct 2026). Ethan: "the green progress bar seems unnecessary
            on every single thing". */}
        {!loading && tab === 'interface' && (
          <span className="ml-auto whitespace-nowrap text-xs font-semibold tabular-nums text-smoke animate-page-in">
            {totals.all - totals.done === 0
              ? tr('Everything is translated')
              : tr('{n} still in English', { n: (totals.all - totals.done).toLocaleString() })}
          </span>
        )}
      </div>

      <div className="mb-5">
        <Segmented
          value={tab}
          onChange={setTab}
          label={tr('What to edit')}
          options={[
            { value: 'interface', label: tr('Buttons and screens') },
            { value: 'content', label: tr('Briefs and content') },
          ]}
        />
      </div>

      {error && <p className="mb-4 rounded-card border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

      {tab === 'content' ? (
        <ContentTab locale={locale} userId={user?.id} onError={setError} />
      ) : loading ? (
        <div className="space-y-3">{Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="relative min-w-[14rem] flex-1">
              <Icon name="magnifier" className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-300" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tr('Search every word on the platform…')}
                aria-label={tr('Search the copy')}
                className="input !py-2.5 !pl-10"
              />
            </div>
            {(screen || search) && (
              <Segmented
                size="sm"
                value={filter}
                onChange={setFilter}
                label={tr('Which sentences')}
                options={[
                  { value: 'all', label: `${tr('All')} · ${counts.all}` },
                  { value: 'todo', label: `${tr('Still in English')} · ${counts.todo}` },
                  { value: 'edited', label: `${tr('Changed by us')} · ${counts.edited}` },
                ]}
              />
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
            {/* THE SCREENS - a list from a laptop up, a picker on a phone. */}
            <div className="lg:hidden">
              <select
                value={screen ?? ''}
                onChange={(e) => { setScreen(e.target.value || null); setSearch('') }}
                aria-label={tr('Screens')}
                className="input"
              >
                <option value="">{tr('Pick a screen')}</option>
                {sections.map((sec) => (
                  <optgroup key={sec.key} label={tr(sec.label)}>
                    {sec.screens.map((name) => {
                      const { n, total } = doneOn(name)
                      return <option key={name} value={name}>{screenLabel(name)}{n < total ? ` (${total - n})` : ''}</option>
                    })}
                  </optgroup>
                ))}
              </select>
            </div>
            <nav className="hidden max-h-[72vh] overflow-y-auto overscroll-contain rounded-card border border-gray-100 bg-white p-1.5 shadow-card lg:sticky lg:top-24 lg:block" aria-label={tr('Screens')}>
              {sections.map((sec) => {
                const expanded = (openSection ?? currentSection) === sec.key
                const left = sec.screens.reduce((x, name) => x + (doneOn(name).total - doneOn(name).n), 0)
                return (
                  <div key={sec.key} className="border-b border-gray-50 last:border-0">
                    <button
                      type="button"
                      onClick={() => setOpenSection(expanded ? '' : sec.key)}
                      aria-expanded={expanded}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2.5 text-left transition-colors hoverable:hover:bg-cloud"
                    >
                      <Icon name={sec.icon} className="h-4 w-4 shrink-0 text-brand" />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-ink">{tr(sec.label)}</span>
                      {left > 0 && <span title={tr('Still in English')} className="shrink-0 rounded-full bg-brand-tint px-1.5 py-0.5 text-[10px] font-bold tabular-nums text-brand">{left}</span>}
                      <Icon name="chevronDown" className={cx('h-3.5 w-3.5 shrink-0 text-gray-400 transition-transform duration-200', expanded && 'rotate-180')} />
                    </button>
                    {expanded && (
                      <div className="animate-fade-up pb-1.5 pl-3">
                        {sec.screens.map((name) => {
                          const { n, total } = doneOn(name)
                          const complete = n === total
                          const on = screen === name && !search
                          return (
                            <button
                              key={name}
                              type="button"
                              onClick={() => { setScreen(name); setSearch(''); setFilter('all'); setOpenSection(sec.key) }}
                              aria-current={on ? 'true' : undefined}
                              className={cx('group block w-full rounded-lg border-l-2 px-3 py-1.5 text-left transition-all duration-150', on ? 'border-brand bg-brand text-white shadow-card' : 'border-gray-100 hoverable:hover:border-brand/40 hoverable:hover:bg-cloud')}
                            >
                              <span className="flex items-center gap-2">
                                <span className={cx('min-w-0 flex-1 truncate text-[12.5px] font-medium', on ? 'text-white' : 'text-ink')}>{screenLabel(name)}</span>
                                {!complete && (
                                  <span title={tr('Still in English')} className={cx('shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums', on ? 'bg-white/20 text-white' : 'bg-brand-tint text-brand')}>{total - n}</span>
                                )}
                              </span>
                            </button>
                          )
                        })}
                      </div>
                    )}
                  </div>
                )
              })}
            </nav>

            <div className="min-w-0">
              {!search && !screen ? (
                <EmptyState
                  icon={<Icon name="book" className="h-7 w-7" />}
                  title={tr('Pick a screen')}
                  hint={tr('Every sentence on that screen is listed with a box to translate it. Or search above to find one word anywhere.')}
                />
              ) : shown.length === 0 ? (
                <EmptyState
                  icon={<Icon name={filter === 'todo' ? 'check' : 'magnifier'} className="h-7 w-7" />}
                  title={filter === 'todo' ? tr('Everything here is translated') : tr('Nothing matches that')}
                  hint={filter === 'todo' ? tr('Every sentence on this screen has a translation. Switch to All to review them.') : tr('Try a shorter phrase, or another filter.')}
                />
              ) : (
                <>
                  {/* THE SCREEN'S TOOLBAR: one press drafts every missing sentence, and
                      the drafts are kept or dropped one at a time. */}
                  <div className="mb-3 flex flex-wrap items-center gap-2">
                    <p className="text-xs text-smoke">{shown.length === 1 ? tr('1 sentence') : tr('{n} sentences', { n: shown.length })}</p>
                  </div>
                  <ul key={`${screen}|${filter}|${search ? 's' : ''}`} className="space-y-2.5">
                    {visible.map((source, i) => (
                      <StringRow
                        key={source}
                        index={i}
                        source={source}
                        bundled={dict[source] || ''}
                        override={overrides[source] || ''}
                        meta={rows?.[source]}
                        draft={drafts[source]}
                        onDraft={setDraft}
                        busy={savingKey === source}
                        onSave={write}
                      />
                    ))}
                  </ul>
                  {/* 40 AT A TIME (30 Sep 2026). Ethan: the editor "is a bit laggy". A screen can
                      hold several hundred sentences, each a self-measuring text box; drawing all of
                      them at once was the lag. The rest are one press away. */}
                  {ordered.length > visible.length && (
                    <button type="button" onClick={() => setLimit((n) => n + 30)} className="btn-secondary mx-auto mt-4 !py-2 text-sm">
                      {tr('Show {n} more', { n: Math.min(30, ordered.length - visible.length) })}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </>
      )}

      {/* SAVE EVERYTHING DRAFTED, STICKY: it follows the scroll so a screen worth of
          suggestions is one press, and it says plainly if any cannot be saved. */}
      {tab === 'interface' && draftList.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+4.75rem)] z-30 flex justify-center px-4 lg:bottom-6">
          <div className="flex max-w-xl flex-1 items-center gap-3 rounded-full border border-gray-100 bg-white/95 py-2 pl-5 pr-2 shadow-lift backdrop-blur animate-fade-up">
            <p className="min-w-0 flex-1 text-sm">
              <span className="font-semibold">{draftList.length === 1 ? tr('1 draft') : tr('{n} drafts', { n: draftList.length })}</span>
              <span className="text-smoke"> · {draftProblems.length ? tr('{n} need fixing first', { n: draftProblems.length }) : tr('not saved yet')}</span>
            </p>
            <button type="button" onClick={() => setDrafts({})} className="btn-ghost !px-3 !py-1.5 text-xs">{tr('Discard')}</button>
            <button type="button" onClick={saveDrafts} disabled={bulk !== null} className="btn-primary !py-2 text-sm">
              {bulk === 'saving' ? <Spinner className="h-4 w-4" /> : tr('Save all')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ONE STRING. The English above, the translation beneath it, and a plain statement of where
// the current word came from - "shipped" and "somebody typed this here" are the two states a
// translator has to tell apart before deciding whether to touch it.
const StringRow = memo(function StringRow({ index = 0, source, bundled, override, meta, draft, onDraft, busy, onSave }) {
  const tr = useT()
  const current = override || bundled
  const dirty = draft != null
  const text = dirty ? draft : current
  const problem = dirty ? holesProblem(source, text) : null
  const changed = dirty && text.trim() !== current

  const commit = () => {
    if (!dirty || problem) return
    if (text.trim() === current) { onDraft(source, null); return }
    // Typing the shipped word back is not an override - it is agreeing with it.
    onSave(source, text.trim() === bundled ? '' : text)
  }

  // ONLY WHAT SOMEBODY CHANGED IS COLOURED (30 Sep 2026). Ethan: "it doesn't make sense that
  // they're all green, of course they should all have translations, the ones admins edit should be
  // highlighted." A shipped translation is the ordinary state and looks ordinary; an edit made
  // here is tinted and tagged; only a missing one is amber.
  const status = override ? 'edited' : current ? 'shipped' : 'todo'
  return (
    <li
      style={{ animationDelay: `${Math.min(index, 8) * 25}ms` }}
      className={cx(
      'animate-board-swap rounded-card border p-4 shadow-card transition-colors [contain-intrinsic-size:auto_120px] [content-visibility:auto]',
      problem ? 'border-red-300 bg-white' : changed ? 'border-brand/50 bg-white' : status === 'edited' ? 'border-brand/30 bg-brand-tint/40' : status === 'todo' ? 'border-dashed border-brand/40 bg-white' : 'border-gray-100 bg-white',
    )}>
      <div className="flex items-start gap-2.5">
        <p className="min-w-0 flex-1 text-[14px] leading-snug text-ink [overflow-wrap:anywhere]">{source}</p>
        {status === 'edited' && <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">{tr('Edited')}</span>}
        {status === 'todo' && <span className="shrink-0 rounded-full bg-brand-tint px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand">{tr('Still in English')}</span>}
      </div>

      <AutoTextarea
        minRows={1}
        value={text}
        onChange={(e) => onDraft(source, e.target.value)}
        onBlur={commit}
        placeholder={tr('Not translated yet')}
        aria-label={`Translation of: ${source}`}
        className="input mt-2.5 w-full resize-none !py-2.5 text-[14px] leading-snug"
      />
      {problem && <p className="mt-1.5 text-xs font-medium text-red-600">{problem}</p>}

      {(busy || (changed && !problem) || status === 'edited' || dirty || (override && bundled)) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[11px] text-smoke">
          {busy ? <span className="inline-flex items-center gap-1.5 font-semibold text-brand"><Spinner className="h-3 w-3" />{tr('Saving…')}</span>
            : changed && !problem ? <span className="font-semibold text-brand">{tr('Not saved yet. Click away to save, or press Save all.')}</span>
              : status === 'edited' ? <span>{meta?.at ? timeAgo(meta.at) : ''}{meta?.by ? ` · ${meta.by}` : ''}</span> : null}
          <span className="ml-auto flex items-center gap-1">
            {dirty && (
              <button type="button" onClick={() => onDraft(source, null)} className="rounded-full px-2.5 py-1 font-semibold text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-ink">{tr('Undo')}</button>
            )}
            {override && bundled && !dirty && (
              <button type="button" onClick={() => onSave(source, '')} className="rounded-full px-2.5 py-1 font-semibold text-smoke transition-colors hoverable:hover:bg-cloud hoverable:hover:text-ink">
                {tr('Back to the shipped wording')}
              </button>
            )}
          </span>
        </div>
      )}
    </li>
  )
})

// BRIEFS AND CONTENT: what people wrote, translated for readers automatically, reviewed here.
//
// Nobody types these in. The first time a creator reads a brief in their language it is
// translated and cached (lib/contentTranslate); this lists what has been made, so a lead who
// speaks the language can read it and correct anything. A corrected one is marked as
// reviewed and is never overwritten. Deleting one makes the next reader's view translate it
// afresh - the way to redo a bad one.
function ContentTab({ locale, userId, onError }) {
  const tr = useT()
  const [list, setList] = useState(null)
  const [filter, setFilter] = useState('auto')
  const [busyKey, setBusyKey] = useState(null)

  const load = useCallback(async () => {
    setList(null)
    const { data, error } = await supabase.from('content_translations')
      .select('source_hash, source, value, src_lang, same, auto, updated_at, reviewer:reviewed_by(name)')
      .eq('locale', locale).eq('same', false).order('updated_at', { ascending: false }).limit(200)
    if (error) { onError(error.message); setList([]); return }
    setList(data || [])
  }, [locale, onError])
  useEffect(() => { load() }, [load])

  async function save(row, value) {
    setBusyKey(row.source_hash)
    const { error } = await supabase.from('content_translations')
      .update({ value: value.trim(), auto: false, reviewed_by: userId, updated_at: new Date().toISOString() })
      .eq('source_hash', row.source_hash).eq('locale', locale)
    setBusyKey(null)
    if (error) { onError(error.message); return }
    forgetTranslation(locale, row.source)
    toastSuccess(tr('Saved. Readers see your version.'))
    load()
  }
  async function redo(row) {
    setBusyKey(row.source_hash)
    const { error } = await supabase.from('content_translations').delete().eq('source_hash', row.source_hash).eq('locale', locale)
    setBusyKey(null)
    if (error) { onError(error.message); return }
    forgetTranslation(locale, row.source)
    load()
  }

  const shown = (list || []).filter((r) => (filter === 'auto' ? r.auto : filter === 'reviewed' ? !r.auto : true))
  return (
    <div>
      <p className="mb-4 max-w-2xl text-sm leading-relaxed text-smoke">
        {tr('Challenge briefs and rules are translated automatically the first time a creator reads them in this language. Check them here, and correct anything that reads wrong. Your version is kept and shown instead.')}
      </p>
      <div className="mb-4">
        <Segmented
          size="sm"
          value={filter}
          onChange={setFilter}
          label={tr('Which translations')}
          options={[
            { value: 'auto', label: tr('Not checked yet') },
            { value: 'reviewed', label: tr('Corrected by us') },
            { value: 'all', label: tr('All') },
          ]}
        />
      </div>
      {list === null ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}</div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<Icon name="book" className="h-7 w-7" />}
          title={tr('Nothing to check yet')}
          hint={tr('Translations appear here after a creator reads a brief written in another language.')}
        />
      ) : (
        <ul className="space-y-3">
          {shown.map((r) => (
            <ContentRow key={r.source_hash} row={r} busy={busyKey === r.source_hash} onSave={(v) => save(r, v)} onRedo={() => redo(r)} />
          ))}
        </ul>
      )}
    </div>
  )
}

function ContentRow({ row, busy, onSave, onRedo }) {
  const tr = useT()
  const [text, setText] = useState(row.value)
  const changed = text.trim() !== row.value.trim()
  const from = LOCALES.find((l) => l.code === row.src_lang)?.native
  return (
    <li className="overflow-hidden rounded-card border border-gray-100 bg-white shadow-card animate-board-swap">
      <div className="grid gap-px bg-gray-100 lg:grid-cols-2">
        <div className="bg-cloud/50 p-4">
          <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">{from ? tr('Original ({lang})', { lang: from }) : tr('Original')}</p>
          <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-[13px] leading-relaxed text-ink [overflow-wrap:anywhere]">{row.source}</p>
        </div>
        <div className="bg-white p-4">
          <p className="mb-1.5 flex items-center gap-2 text-[10px] font-bold uppercase tracking-wide text-gray-400">
            {tr('Translation')}
            {row.auto
              ? <span className="rounded-full bg-cloud px-2 py-0.5 text-smoke">{tr('Automatic')}</span>
              : <span className="rounded-full bg-brand px-2 py-0.5 text-white">{tr('Corrected')}{row.reviewer?.name ? ` · ${row.reviewer.name}` : ''}</span>}
          </p>
          <AutoTextarea value={text} minRows={4} maxHeight={320} onChange={(e) => setText(e.target.value)} className="input w-full resize-none text-[13px] leading-relaxed" />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3">
        <button type="button" onClick={onRedo} disabled={busy} className="btn-ghost !py-1.5 text-xs">{tr('Translate it again')}</button>
        <button type="button" onClick={() => onSave(text)} disabled={busy || (!changed && !row.auto)} className="btn-primary !py-1.5 text-xs disabled:opacity-50">
          {busy ? <Spinner className="h-3.5 w-3.5" /> : changed ? tr('Save my version') : tr('Looks right')}
        </button>
      </div>
    </li>
  )
}
