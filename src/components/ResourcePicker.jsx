import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { Modal, Skeleton } from './ui'
import Icon from './Icon'
import { noteExcerpt } from '../lib/noteMarkdown'

// PICKING A RESOURCE TO SHARE.
//
// This lived inside ChatAdminTools, which is a rooms-only component - so
// sharing a guide with one creator in a DM was impossible, and the answer to
// "have you read the brand rules?" was to paste a URL. The picker is its own
// component now and both surfaces mount it.
//
// It loads the library the first time it opens and keeps it: an admin sharing
// resources is usually sharing several, and re-fetching between each one made
// the second share slower than the first for no reason.
export default function ResourcePicker({ open, onClose, onPick, busy, where }) {
  const [resources, setResources] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open || resources !== null) return
    supabase.from('resources').select('id, title, category, body, links, file_url')
      .order('created_at', { ascending: false })
      .then(({ data }) => setResources(data ?? []))
  }, [open, resources])

  useEffect(() => { if (!open) setSearch('') }, [open])

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return resources ?? []
    return (resources ?? []).filter((r) =>
      `${r.title} ${r.category ?? ''} ${r.body ?? ''}`.toLowerCase().includes(q))
  }, [resources, search])

  return (
    <Modal open={open} onClose={onClose} title="Share a resource">
      {resources === null ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : resources.length === 0 ? (
        <p className="rounded-xl bg-cloud px-4 py-6 text-center text-sm text-smoke">
          No resources yet. Add some in{' '}
          <Link to="/admin/resources" className="font-medium text-brand hover:underline">Manage resources</Link> first.
        </p>
      ) : (
        <>
          {/* A search box appears once the library is big enough to scroll.
              Below that it is a control in the way of a list you can already
              see all of. */}
          {resources.length > 6 && (
            <input
              type="search"
              className="input mb-3"
              placeholder="Search the library…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              aria-label="Search resources"
            />
          )}
          <div className="max-h-[60vh] space-y-2 overflow-y-auto overscroll-contain">
            {shown.length === 0 && (
              <p className="px-4 py-6 text-center text-sm text-smoke">Nothing matches that.</p>
            )}
            {shown.map((r) => {
              const excerpt = noteExcerpt(r.body || '', 80)
              return (
                <button
                  key={r.id}
                  type="button"
                  disabled={busy}
                  onClick={() => onPick(r.id)}
                  className="flex w-full items-start gap-3 rounded-xl border border-gray-100 px-4 py-3 text-left transition-colors hover:border-brand hover:bg-brand-tint/40 disabled:opacity-50"
                >
                  <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand text-white">
                    <Icon name="book" className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{r.title}</span>
                    {/* The stripped excerpt, never the raw markdown - the same
                        rule the chat card follows. */}
                    {excerpt && <span className="mt-0.5 block truncate text-xs text-smoke">{excerpt}</span>}
                    <span className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-gray-400">
                      {r.category && <span>{r.category}</span>}
                      {r.links?.length > 0 && <span>{r.links.length} {r.links.length === 1 ? 'link' : 'links'}</span>}
                      {r.file_url && <span>Attachment</span>}
                    </span>
                  </span>
                  <span className="shrink-0 pt-1 text-xs font-medium text-brand">{where || 'Share'} →</span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </Modal>
  )
}
