import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { supabase } from '../../lib/supabase'
import { useCommunity } from '../../context/CommunityContext'
import Icon from '../Icon'
import { Avatar } from '../ui'
import { flagFromIso } from '../../lib/flags'
import { cx } from '../../lib/utils'
import { overlay } from '../../lib/motion'

// One box that goes anywhere.
//
// WHY THIS AND NOT MORE MENUS
//
// The network has, deliberately, a lot of destinations: five tabs, a place
// switcher, ten network links, and then a page per market, per room, per
// challenge and per creator. Any navigation that tries to expose all of that by
// clicking becomes the fourteen-item dropdown we just removed. A palette scales
// the other way: the more there is, the more useful typing becomes, and it costs
// nothing on screen until you ask for it.
//
// The index is built from what the shell already knows (markets, rooms, the
// static pages) plus two cheap queries for creators and challenges. It is
// rebuilt when opened rather than kept live: it is a navigation aid, not a
// dashboard, and a stale row for four seconds costs nothing.

const PAGES = [
  { id: 'p-global', label: 'Worldwide', hint: 'The network hub', icon: 'globe', to: '/global' },
  { id: 'p-markets', label: 'Explore markets', hint: 'Every market', icon: 'magnifier', to: '/global/markets' },
  { id: 'p-creators', label: 'Creator directory', hint: 'Everyone, on a map', icon: 'users', to: '/creators' },
  { id: 'p-messages', label: 'Direct messages', hint: 'Your inbox', icon: 'envelope', to: '/messages' },
  { id: 'p-connections', label: 'Connections', hint: 'Requests and mutuals', icon: 'heart', to: '/connections' },
  { id: 'p-collab', label: 'Travel collab board', hint: 'Who is going where', icon: 'pin', to: '/collab' },
  { id: 'p-events', label: 'Calendar', hint: 'Events and meetups', icon: 'calendar', to: '/events' },
  { id: 'p-leaderboard', label: 'Leaderboard', hint: 'Across every market', icon: 'chart', to: '/leaderboard' },
  { id: 'p-game', label: 'Daily games', hint: 'One puzzle a day', icon: 'joystick', to: '/game' },
  { id: 'p-resources', label: 'Resource library', hint: 'Guides and templates', icon: 'book', to: '/resources' },
  { id: 'p-jobs', label: 'Roles', hint: 'Paid work', icon: 'briefcase', to: '/jobs' },
  { id: 'p-refer', label: 'Refer a creator', hint: 'Bring someone in', icon: 'share', to: '/refer' },
  { id: 'p-challenges', label: 'Challenges', hint: 'Your board', icon: 'flag', to: '/challenges' },
  { id: 'p-settings', label: 'Settings', hint: 'Your account', icon: 'pencil', to: '/settings' },
]

const GROUP_ORDER = ['Jump to', 'Markets', 'Rooms', 'Challenges', 'Creators']

function score(needle, hay) {
  if (!hay) return -1
  const h = hay.toLowerCase()
  const i = h.indexOf(needle)
  if (i === -1) return -1
  // A prefix match is what you meant; a match halfway through a word is a
  // coincidence you are willing to accept. Rank accordingly.
  return i === 0 ? 0 : h[i - 1] === ' ' ? 1 : 2
}

export default function CommandPalette({ open, onClose }) {
  const navigate = useNavigate()
  const { network, chapters, myChapters } = useCommunity()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const [extra, setExtra] = useState({ creators: [], challenges: [], rooms: [] })
  const inputRef = useRef(null)
  const listRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setQuery('')
    setActive(0)
    const t = setTimeout(() => inputRef.current?.focus(), 60)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { clearTimeout(t); document.body.style.overflow = prev }
  }, [open])

  // Built on open. Two queries, both small and both already permitted by RLS,
  // so a creator's palette can only ever surface what they could already reach.
  useEffect(() => {
    if (!open) return
    let alive = true
    Promise.all([
      supabase.from('profiles').select('id, name, photo_url, city, country, country_code')
        .eq('status', 'active').eq('is_test', false).order('name').limit(300),
      supabase.from('challenges').select('id, title, status, community_id')
        .neq('status', 'draft').order('start_date', { ascending: false }).limit(60),
      supabase.from('channels').select('id, key, label, community_id').order('position'),
    ]).then(([{ data: creators }, { data: challenges }, { data: rooms }]) => {
      if (!alive) return
      setExtra({ creators: creators || [], challenges: challenges || [], rooms: rooms || [] })
    })
    return () => { alive = false }
  }, [open])

  const items = useMemo(() => {
    const communityById = new Map([...(chapters || []), ...(network ? [network] : [])].map((c) => [c.id, c]))
    const out = []

    for (const p of PAGES) out.push({ ...p, group: 'Jump to' })

    for (const c of chapters || []) {
      const mine = myChapters.some((m) => m.id === c.id)
      out.push({
        id: `m-${c.id}`,
        group: 'Markets',
        label: c.name,
        hint: mine ? 'Your market' : c.is_active ? 'Open' : 'Not open yet',
        emoji: (c.country_codes || []).map(flagFromIso).join(''),
        to: `/c/${c.slug}`,
      })
    }

    for (const r of extra.rooms) {
      const c = communityById.get(r.community_id)
      if (!c) continue
      out.push({
        id: `r-${r.id}`,
        group: 'Rooms',
        label: r.label,
        hint: c.name,
        icon: 'chat',
        to: c.kind === 'network' ? `/global/chat/${r.key}` : `/c/${c.slug}/chat/${r.key}`,
      })
    }

    for (const ch of extra.challenges) {
      const c = communityById.get(ch.community_id)
      out.push({
        id: `c-${ch.id}`,
        group: 'Challenges',
        label: ch.title,
        hint: [c?.kind === 'network' ? 'Global' : c?.name, ch.status === 'active' ? 'Live' : ch.status]
          .filter(Boolean).join(' · '),
        icon: 'flag',
        to: `/challenges/${ch.id}`,
      })
    }

    for (const p of extra.creators) {
      out.push({
        id: `u-${p.id}`,
        group: 'Creators',
        label: p.name,
        hint: [p.city, p.country].filter(Boolean).join(', '),
        avatar: p.photo_url,
        to: `/profile/${p.id}`,
      })
    }

    return out
  }, [chapters, myChapters, network, extra])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) {
      // Empty state is a shortlist, not everything: 400 rows with no query is a
      // wall, and the useful default is "where you probably wanted to go".
      const mine = items.filter((i) => i.group === 'Markets' && i.hint === 'Your market')
      return [...items.filter((i) => i.group === 'Jump to').slice(0, 8), ...mine].slice(0, 12)
    }
    return items
      .map((i) => {
        const s = Math.min(...[score(q, i.label), score(q, i.hint)].filter((n) => n >= 0).concat([9]))
        return s === 9 ? null : { ...i, _s: s }
      })
      .filter(Boolean)
      .sort((a, b) => a._s - b._s || GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group))
      .slice(0, 24)
  }, [items, query])

  useEffect(() => { setActive(0) }, [query])

  const go = useCallback((item) => {
    if (!item) return
    onClose()
    navigate(item.to)
  }, [navigate, onClose])

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter') { e.preventDefault(); go(results[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); onClose() }
  }

  // Keep the highlighted row on screen while arrowing through a long list.
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  if (!open) return null

  let lastGroup = null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[12vh]" role="dialog" aria-modal="true" aria-label="Search">
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          onClick={onClose}
          className="absolute inset-0 bg-ink/50 backdrop-blur-[3px]"
        />
        <motion.div
          {...overlay}
          className="relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-card bg-white shadow-lift"
        >
          <div className="flex shrink-0 items-center gap-3 border-b border-gray-100 px-4">
            <Icon name="magnifier" className="h-4 w-4 shrink-0 text-smoke" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Search markets, rooms, challenges, creators"
              aria-label="Search"
              className="min-w-0 flex-1 border-0 bg-transparent py-4 text-base outline-none placeholder:text-gray-400 sm:text-sm"
            />
            <kbd className="hidden shrink-0 rounded-md border border-gray-200 px-1.5 py-0.5 text-[10px] font-medium text-smoke sm:block">
              esc
            </kbd>
          </div>

          <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
            {results.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-smoke">Nothing matches &ldquo;{query}&rdquo;.</p>
            ) : (
              results.map((r, i) => {
                const head = r.group !== lastGroup ? r.group : null
                lastGroup = r.group
                return (
                  <div key={r.id}>
                    {head && (
                      <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-widest text-gray-400">
                        {head}
                      </p>
                    )}
                    <button
                      data-active={i === active}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(r)}
                      className={cx(
                        'flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors',
                        i === active ? 'bg-brand-tint' : 'hover:bg-cloud',
                      )}
                    >
                      {r.avatar !== undefined ? (
                        <Avatar src={r.avatar} name={r.label} size="xs" />
                      ) : r.emoji ? (
                        <span className="w-7 shrink-0 text-center text-base leading-none" aria-hidden>{r.emoji}</span>
                      ) : (
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-cloud">
                          <Icon name={r.icon || 'chevronRight'} className="h-3.5 w-3.5 text-smoke" />
                        </span>
                      )}
                      <span className="min-w-0 flex-1">
                        <span className={cx('block truncate text-sm font-medium', i === active && 'text-brand')}>{r.label}</span>
                        {r.hint && <span className="block truncate text-xs text-smoke">{r.hint}</span>}
                      </span>
                      {i === active && <Icon name="chevronRight" className="h-4 w-4 shrink-0 text-brand" />}
                    </button>
                  </div>
                )
              })
            )}
          </div>

          <div className="hidden shrink-0 items-center gap-4 border-t border-gray-100 px-4 py-2.5 text-[11px] text-smoke sm:flex">
            <span className="flex items-center gap-1.5"><kbd className="rounded border border-gray-200 px-1">↑</kbd><kbd className="rounded border border-gray-200 px-1">↓</kbd> move</span>
            <span className="flex items-center gap-1.5"><kbd className="rounded border border-gray-200 px-1">↵</kbd> open</span>
            <span className="ml-auto flex items-center gap-1.5"><kbd className="rounded border border-gray-200 px-1">⌘</kbd><kbd className="rounded border border-gray-200 px-1">K</kbd> anywhere</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
