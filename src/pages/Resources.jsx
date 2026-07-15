import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Badge, EmptyState, PageHeader, SkeletonCards } from '../components/ui'
import MediaAttachment from '../components/MediaAttachment'
import { formatDate, cx } from '../lib/utils'

// The permanent content library: tips, video ideas, brand guidelines,
// do's & don'ts, downloadable assets and example content.
// Categories are admin-defined (free text), so the filter pills are built
// from whatever categories actually exist in the library.
const CATEGORY_EMOJI = {
  Tips: '💡', 'Video Ideas': '🎬', 'Brand Guidelines': '🧭',
  "Do's & Don'ts": '✅', Assets: '📦', Examples: '⭐',
}

export default function Resources() {
  const { user, profile, isAdmin, refreshProfile } = useAuth()
  const [resources, setResources] = useState([])
  const [bookmarks, setBookmarks] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [savedOnly, setSavedOnly] = useState(false)
  const [openId, setOpenId] = useState(null) // expanded card
  const [params] = useSearchParams()
  const cardRefs = useRef({})
  // What "new" means is frozen at mount: everything since the PREVIOUS visit
  // (the stamp below moves the marker for next time, not this render).
  const [seenBefore] = useState(() => (profile?.resources_seen_at ? new Date(profile.resources_seen_at).getTime() : 0))

  useEffect(() => {
    async function load() {
      const [{ data }, { data: marks }] = await Promise.all([
        supabase.from('resources').select('*, profiles:created_by(name)').order('created_at', { ascending: false }),
        supabase.from('resource_bookmarks').select('resource_id').eq('creator_id', user.id),
      ])
      setResources(data ?? [])
      setBookmarks(new Set((marks ?? []).map((m) => m.resource_id)))
      setLoading(false)
    }
    load()
    // Visiting the library clears the "new" dot for next time.
    supabase.from('profiles').update({ resources_seen_at: new Date().toISOString() }).eq('id', user.id)
      .then(() => refreshProfile?.())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  async function toggleBookmark(r) {
    const has = bookmarks.has(r.id)
    setBookmarks((prev) => {
      const next = new Set(prev)
      has ? next.delete(r.id) : next.add(r.id)
      return next
    })
    if (has) await supabase.from('resource_bookmarks').delete().eq('resource_id', r.id).eq('creator_id', user.id)
    else await supabase.from('resource_bookmarks').insert({ resource_id: r.id, creator_id: user.id })
  }

  // Deep link from a chat resource card (/resources?open=<id>): expand that
  // resource and scroll it into view once the library has loaded.
  const openParam = params.get('open')
  useEffect(() => {
    if (!openParam || loading) return
    setOpenId(openParam)
    const el = cardRefs.current[openParam]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [openParam, loading])

  // Build the pill list from the categories actually in use.
  const CATEGORIES = useMemo(
    () => ['All', ...[...new Set(resources.map((r) => r.category).filter(Boolean))].sort()],
    [resources]
  )

  const filtered = useMemo(
    () =>
      resources.filter((r) => {
        if (savedOnly && !bookmarks.has(r.id)) return false
        if (category !== 'All' && r.category !== category) return false
        if (search && !(r.title + ' ' + r.body).toLowerCase().includes(search.toLowerCase())) return false
        return true
      }),
    [resources, category, search, savedOnly, bookmarks]
  )

  return (
    <div className="page">
      <PageHeader
        title="Resource library"
        subtitle="Tips, briefs, brand rules and assets. Everything you need to make winning content."
        action={isAdmin && <Link to="/admin/resources" className="btn-primary">Manage resources</Link>}
      />

      {/* Search + category pills */}
      <div className="mb-10 space-y-4">
        <input
          type="search" className="input max-w-md" placeholder="Search the library…"
          value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search resources"
        />
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={cx(
                'rounded-full px-4 py-1.5 text-xs font-medium transition-colors',
                category === c ? 'bg-brand text-white' : 'border border-gray-200 text-smoke hover:border-brand hover:text-brand'
              )}
            >
              {c !== 'All' && <span aria-hidden>{CATEGORY_EMOJI[c]} </span>}{c}
            </button>
          ))}
          {/* Your shelf: everything you've bookmarked */}
          <button
            onClick={() => setSavedOnly((v) => !v)}
            aria-pressed={savedOnly}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium transition-colors',
              savedOnly ? 'bg-brand text-white' : 'border border-gray-200 text-smoke hover:border-brand hover:text-brand'
            )}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill={savedOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M6 3h12v18l-6-4-6 4z" /></svg>
            Saved{bookmarks.size > 0 ? ` · ${bookmarks.size}` : ''}
          </button>
        </div>
      </div>

      {loading ? (
        <SkeletonCards count={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          emoji="📚"
          title={search || category !== 'All' ? 'Nothing matches that' : 'The library is being stocked'}
          hint={search || category !== 'All' ? 'Try a different search or category.' : 'The Tryp.com Team will publish guides and assets here soon.'}
        />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {filtered.map((r) => {
            const open = openId === r.id
            const long = (r.body || '').length > 280
            return (
              <article
                key={r.id}
                ref={(el) => { cardRefs.current[r.id] = el }}
                className={cx('card flex flex-col gap-4 scroll-mt-24', openParam === r.id && 'ring-2 ring-brand')}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-semibold leading-snug">
                    <span aria-hidden>{CATEGORY_EMOJI[r.category]} </span>{r.title}
                    {new Date(r.created_at).getTime() > seenBefore && (
                      <span className="ml-2 inline-block align-middle rounded-full bg-brand px-2 py-0.5 text-[10px] font-bold uppercase text-white">New</span>
                    )}
                  </h2>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone="light">{r.category}</Badge>
                    <button
                      onClick={() => toggleBookmark(r)}
                      aria-label={bookmarks.has(r.id) ? 'Remove bookmark' : 'Bookmark this resource'}
                      aria-pressed={bookmarks.has(r.id)}
                      className={cx('rounded-full p-1.5 transition-colors', bookmarks.has(r.id) ? 'text-brand' : 'text-gray-300 hover:text-brand')}
                    >
                      <svg viewBox="0 0 24 24" className="h-5 w-5" fill={bookmarks.has(r.id) ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M6 3h12v18l-6-4-6 4z" /></svg>
                    </button>
                  </div>
                </div>

                <p className={cx('whitespace-pre-line text-sm leading-relaxed text-smoke', !open && long && 'line-clamp-6')}>
                  {r.body}
                </p>

                {/* Attachment: images and videos preview inline (tap the video to
                    play); other files keep a download. Save routes through the
                    native share sheet so mobile can save to the camera roll. */}
                {r.file_url && <MediaAttachment url={r.file_url} />}

                <div className="mt-auto flex items-center justify-between gap-3 border-t border-gray-50 pt-4">
                  <p className="text-xs text-gray-400">
                    {r.profiles?.name && `By ${r.profiles.name} · `}{formatDate(r.created_at)}
                  </p>
                  <div className="flex gap-2">
                    {long && (
                      <button onClick={() => setOpenId(open ? null : r.id)} className="text-xs font-medium text-brand hover:underline">
                        {open ? 'Show less' : 'Read more'}
                      </button>
                    )}
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}
    </div>
  )
}
