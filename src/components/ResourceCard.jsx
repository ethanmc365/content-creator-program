import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import Icon from './Icon'

// An inline resource-library card inside a chat message: admins drop these into
// any channel so creators can jump straight to a guide or asset. (Mirrors
// GameEventCard / PollCard.)
export default function ResourceCard({ resourceId }) {
  const [resource, setResource] = useState(null)

  useEffect(() => {
    supabase.from('resources').select('*').eq('id', resourceId).single()
      .then(({ data }) => setResource(data))
  }, [resourceId])

  if (!resource) return null
  const snippet = (resource.body || '').slice(0, 140)

  return (
    <div className="mt-1 w-72 max-w-full overflow-hidden rounded-2xl border border-brand/20 bg-white sm:w-80">
      <div className="bg-gradient-to-br from-brand to-brand-light px-4 py-3 text-white">
        <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-white/80"><Icon name="book" className="h-3.5 w-3.5" /> Resource library</p>
        <p className="text-sm font-bold leading-snug">{resource.title}</p>
        {resource.category && <p className="text-xs text-white/85">{resource.category}</p>}
      </div>
      <div className="p-3">
        {snippet && (
          <p className="mb-3 whitespace-pre-line text-xs leading-relaxed text-smoke">
            {snippet}{(resource.body || '').length > 140 ? '…' : ''}
          </p>
        )}
        <div className="flex gap-2">
          <Link to={`/resources?open=${resourceId}`} className="btn-primary flex-1 !py-2 text-xs">Open in library →</Link>
          {resource.file_url && (
            <a href={resource.file_url} target="_blank" rel="noopener noreferrer" className="btn-secondary !px-3 !py-2 text-xs">↓</a>
          )}
        </div>
      </div>
    </div>
  )
}
