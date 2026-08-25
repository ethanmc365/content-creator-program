import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { Badge, EmptyState, Modal, PageHeader, SkeletonCards } from '../components/ui'
import Icon from '../components/Icon'
import { renderNote } from '../lib/noteMarkdown'
import MediaAttachment from '../components/MediaAttachment'
import { formatDate, cx } from '../lib/utils'
import Reveal from '../components/network/Reveal'

// The permanent content library: tips, video ideas, brand guidelines,
// do's & don'ts, downloadable assets and example content.
// Categories are admin-defined (free text), so the filter pills are built
// from whatever categories actually exist in the library.
// Custom line icons per category (no emoji anywhere in the chrome).

export default function Resources() {
  const { user, profile, isAdmin, refreshProfile } = useAuth()
  const [resources, setResources] = useState([])
  const [bookmarks, setBookmarks] = useState(() => new Set())
  const [loading, setLoading] = useState(true)
  const [category, setCategory] = useState('All')
  const [search, setSearch] = useState('')
  const [savedOnly, setSavedOnly] = useState(false)
  const [reading, setReading] = useState(null)
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
        action={isAdmin && <Link to="/admin/resources" className="btn-primary">Manage resources</Link>}
      />

      {/* ALL AND SAVED, AND NOTHING ELSE.
          The pills were built from whatever categories happened to exist, which
          grew a row of one-item filters nobody pressed - Ethan: "although these
          will still show up, we're not actually gonna be clicking different
          ones, because a lot of them will all be different". A category is still
          worth showing ON a card, as a label; it is not worth a control. What is
          left is the only division that means anything to a reader: everything,
          and the ones you kept.

          The search sits BELOW the two, because you narrow before you hunt. */}
      <div className="mb-10 space-y-4">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => { setCategory('All'); setSavedOnly(false) }}
            aria-pressed={!savedOnly}
            className={cx(
              'rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200',
              !savedOnly ? 'bg-brand text-white' : 'border border-gray-200 text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand',
            )}
          >
            All{resources?.length ? ` · ${resources.length}` : ''}
          </button>
          <button
            onClick={() => { setCategory('All'); setSavedOnly(true) }}
            aria-pressed={savedOnly}
            className={cx(
              'inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-semibold transition-all duration-200',
              savedOnly ? 'bg-brand text-white' : 'border border-gray-200 text-smoke hover:-translate-y-0.5 hover:border-brand hover:text-brand',
            )}
          >
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill={savedOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M6 3h12v18l-6-4-6 4z" /></svg>
            Saved{bookmarks.size > 0 ? ` · ${bookmarks.size}` : ''}
          </button>
        </div>
        <input
          type="search" className="input max-w-md" placeholder="Search the library…"
          value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search resources"
        />
      </div>

      {loading ? (
        <SkeletonCards count={4} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<Icon name="book" className="h-7 w-7" />}
          title={search || category !== 'All' ? 'Nothing matches that' : 'The library is being stocked'}
          hint={search || category !== 'All' ? 'Try a different search or category.' : 'The Tryp.com Team will publish guides and assets here soon.'}
        />
      ) : (
        <Reveal className="grid grid-cols-1 gap-6 lg:grid-cols-2">
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
                    {r.title}
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

                {/* RENDERED, NOT RAW. This printed the stored markdown as
                    plain text, so a resource written with headings and bullets
                    reached the reader as a wall of # and * - the exact thing
                    Ethan asked to stop showing up. */}
                <div className={cx('text-sm leading-relaxed', !open && long && 'line-clamp-6')}>
                  {renderNote(r.body || '')}
                </div>

                {/* Links a resource points at. Clickable, which they were not
                    when they were typed into the body as bare text. */}
                {r.links?.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {r.links.map((l) => (
                      <a
                        key={l.url}
                        href={l.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3 py-1.5 text-xs font-medium transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand"
                      >
                        <Icon name="link" className="h-3.5 w-3.5" />
                        {l.label || l.url}
                      </a>
                    ))}
                  </div>
                )}

                {/* Attachment: images and videos preview inline (tap the video to
                    play); other files keep a download. Save routes through the
                    native share sheet so mobile can save to the camera roll. */}
                {r.file_url && <MediaAttachment url={r.file_url} />}

                <div className="mt-auto flex items-center justify-between gap-3 border-t border-gray-50 pt-4">
                  <p className="text-xs text-gray-400">
                    {r.profiles?.name && `By ${r.profiles.name} · `}{formatDate(r.created_at)}
                  </p>
                  <div className="flex gap-2">
                    <button onClick={() => setReading(r)} className="text-xs font-medium text-brand hover:underline">
                      Open
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </Reveal>
      )}

      {/* READING ONE TAKES THE SCREEN.
          Ethan: a card should open "to accept most of the screen so I can view
          it clearly". Expanding in place pushed every other card down and left
          a long guide competing with its neighbours for attention; a resource
          you have chosen to read should be the only thing you are reading. */}
      <Modal open={!!reading} onClose={() => setReading(null)} title={reading?.title ?? ''} wide>
        {reading && (
          <div className="space-y-6">
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-400">
              {reading.category && <Badge tone="light">{reading.category}</Badge>}
              <span>{reading.profiles?.name && `By ${reading.profiles.name} · `}{formatDate(reading.created_at)}</span>
            </div>

            <div className="text-[15px] leading-relaxed">
              {renderNote(reading.body || '')}
            </div>

            {reading.links?.length > 0 && (
              <div className="flex flex-wrap gap-2 border-t border-gray-100 pt-5">
                {reading.links.map((l) => (
                  <a
                    key={l.url}
                    href={l.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 px-3.5 py-2 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand"
                  >
                    <Icon name="link" className="h-4 w-4" />
                    {l.label || l.url}
                  </a>
                ))}
              </div>
            )}

            {reading.file_url && <MediaAttachment url={reading.file_url} />}
          </div>
        )}
      </Modal>
    </div>
  )
}
