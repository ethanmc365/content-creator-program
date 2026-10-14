import { Link } from 'react-router-dom'
import Icon from '../Icon'
import { Avatar } from '../ui'
import { useUnread } from '../../context/UnreadContext'
import { useT } from '../../lib/i18n'
import { timeAgo } from '../../lib/utils'

// NEW IN YOUR ROOMS, AT THE TOP OF WORLDWIDE (14 Oct 2026). The team: creators are missing what is said in their market
// rooms, so "just below the title Worldwide, we could have ... a quick summary" that gets them into the chats. The
// rooms with something new since this person last read them, newest first: who wrote, a line of it, one press to open
// the room at the new messages. Nothing when everything is read.
export default function NewInRooms({ className }) {
  const tr = useT()
  const { unread, rooms, lastByChannel, ready } = useUnread()
  if (!ready || !unread.size) return null
  const fresh = rooms
    .filter((r) => unread.has(r.channel))
    .map((r) => ({ r, last: lastByChannel.get(r.channel) }))
    .sort((a, b) => String(b.last?.created_at || '').localeCompare(String(a.last?.created_at || '')))
  if (!fresh.length) return null
  const shown = fresh.slice(0, 3)
  const hrefOf = (r) => (r.place.kind === 'network' ? `/global/chat/${r.key}` : `/c/${r.place.slug}/chat/${r.key}`)
  return (
    <section className={`overflow-hidden rounded-card border border-gray-100 bg-white shadow-card animate-rise ${className || ""}`}>
      <Link to="/rooms" className="flex items-center gap-2 px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-[0.12em] text-ink/70">
        <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand/60" /><span className="relative inline-flex h-2 w-2 rounded-full bg-brand" /></span>
        {fresh.length === 1 ? tr('1 room has new messages') : tr('{n} rooms have new messages', { n: fresh.length })}
        <Icon name="chevronRight" className="ml-auto h-4 w-4 text-gray-300" />
      </Link>
      <ul className="divide-y divide-gray-50">
        {shown.map(({ r, last }) => (
          <li key={r.channel}>
            <Link to={hrefOf(r)} className="flex items-center gap-3 px-4 py-2.5 transition-colors active:bg-cloud hoverable:hover:bg-cloud/60">
              <Avatar src={last?.profiles?.photo_url} name={last?.profiles?.name || r.label} size="xs" />
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-1.5 text-[13px]">
                  <span className="truncate font-semibold text-ink">{r.place.kind === 'network' ? tr('Worldwide') : r.place.name} · {tr(r.label)}</span>
                  {last?.created_at && <span className="ml-auto shrink-0 text-[11px] text-gray-400">{timeAgo(last.created_at)}</span>}
                </span>
                <span className="block truncate text-[12.5px] text-smoke">
                  {last?.profiles?.name ? `${last.profiles.name.split(' ')[0]}: ` : ''}
                  {last?.body ? String(last.body).replace(/[*_#>`]/g, '') : last?.video_url ? tr('Sent a video') : last?.image_url ? tr('Sent a photo') : ''}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {fresh.length > 3 && (
        <Link to="/rooms" className="block border-t border-gray-50 py-2 text-center text-xs font-semibold text-brand">{tr('See all {n}', { n: fresh.length })}</Link>
      )}
    </section>
  )
}
