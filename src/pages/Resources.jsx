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
  const { isAdmin } = useAuth()
  const [resources, setResources] = useState([])
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [openId, setOpenId] = useState(null) // expanded card
  const [params] = useSearchParams()
  const cardRefs = useRef({})

  useEffect(() => {
    supabase
      .from('resources')
      .select('*, profiles:created_by(name)')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setResources(data ?? [])
        setLoading(false)
      })
  }, [])

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
        if (category !== 'All' && r.category !== category) return false
        if (search && !(r.title + ' ' + r.body).toLowerCase().includes(search.toLowerCase())) return false
        return true
      }),
    [resources, category, search]
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
                  </h2>
                  <Badge tone="light">{r.category}</Badge>
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
