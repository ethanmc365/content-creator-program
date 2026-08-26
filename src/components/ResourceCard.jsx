import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Icon from './Icon'
import MediaAttachment from './MediaAttachment'
import { noteExcerpt } from '../lib/noteMarkdown'

// An inline resource-library card inside a chat message: admins drop these into
// any room or DM so creators can jump straight to a guide or asset.
//
// WHAT CHANGED, 26 Aug 2026
//
// The snippet was `resource.body.slice(0, 140)` printed with `whitespace-pre-line`
// - the RAW markdown. So the one place a resource is advertised showed the
// reader "## Do's and don'ts \n\n* Shoot vertical", hashes and asterisks
// included. That is the "stray * or #" Ethan asked to stop seeing, surviving in
// the surface that reaches the most people. `noteExcerpt` is the same stripper
// the note cards use.
//
// And the card is left-aligned now. It was centred, which is right for a poll
// (a title and a row of options) and wrong for a paragraph of prose: centred
// body text has a ragged left edge, which is the edge you read down.
export default function ResourceCard({ resourceId }) {
  const [resource, setResource] = useState(null)

  useEffect(() => {
    let alive = true
    supabase.from('resources').select('*').eq('id', resourceId).single()
      .then(({ data }) => { if (alive) setResource(data) })
    return () => { alive = false }
  }, [resourceId])

  if (!resource) return null
  const excerpt = noteExcerpt(resource.body || '', 150)
  const links = resource.links?.length || 0

  return (
    <div className="mt-1 w-72 max-w-full overflow-hidden rounded-2xl border border-brand/20 bg-white sm:w-80">
      <div className="bg-gradient-to-br from-brand to-brand-light px-4 py-3 text-white">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/80">
          <Icon name="book" className="h-3.5 w-3.5" /> Resource library
        </p>
        <p className="mt-0.5 text-sm font-bold leading-snug">{resource.title}</p>
        {resource.category && <p className="text-xs text-white/85">{resource.category}</p>}
      </div>
      <div className="p-3">
        {excerpt && <p className="mb-3 text-xs leading-relaxed text-smoke">{excerpt}</p>}

        {/* What is IN it, before you decide to open it. */}
        {(links > 0 || resource.file_url) && (
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium text-smoke">
            {links > 0 && (
              <span className="inline-flex items-center gap-1">
                <Icon name="link" className="h-3.5 w-3.5" /> {links} {links === 1 ? 'link' : 'links'}
              </span>
            )}
            {resource.file_url && (
              <span className="inline-flex items-center gap-1">
                <Icon name="image" className="h-3.5 w-3.5" /> Attachment
              </span>
            )}
          </div>
        )}

        {/* Preview the attachment inline (image/video) with a save button. */}
        {resource.file_url && <MediaAttachment url={resource.file_url} compact className="mb-3" />}
        <Link to={`/resources?open=${resourceId}`} className="btn-primary block w-full !py-2 text-center text-xs">
          Open in library →
        </Link>
      </div>
    </div>
  )
}
