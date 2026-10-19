import { Link, useNavigate } from 'react-router-dom'
import { Avatar } from './ui'
import Icon from './Icon'
import { cx } from '../lib/utils'

// A PERSON IN A STAFF LIST IS A DOOR (19 Oct 2026). Ethan, on the money page: clicking a creator's photo or name in
// "Still to pay" did nothing, so there was no way to message the person you were about to pay. The photo and the name
// open their profile, and the small message button beside them opens a DM (`/messages?to=` drafts one, creating
// nothing until the first send). Clicks stop here, so a row that is itself clickable (an invoice) keeps working.
export default function PersonLink({ person, size = 'sm', className = '', nameClass = 'text-sm font-semibold', children = null, dm = true }) {
  const navigate = useNavigate()
  const id = person?.id
  const stop = (e) => e.stopPropagation()
  if (!id) {
    return (
      <div className={cx('flex min-w-0 items-center gap-3', className)}>
        <Avatar src={person?.photo_url} name={person?.name || ''} size={size} />
        <div className="min-w-0"><span className={cx('block truncate', nameClass)}>{person?.name}</span>{children}</div>
      </div>
    )
  }
  return (
    <div className={cx('flex min-w-0 items-center gap-3', className)}>
      <Link to={`/profile/${id}`} onClick={stop} className="shrink-0 rounded-full transition-transform duration-200 hoverable:hover:scale-105" aria-label={`${person.name}'s profile`}>
        <Avatar src={person.photo_url} name={person.name || ''} size={size} />
      </Link>
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <Link to={`/profile/${id}`} onClick={stop} className={cx('truncate transition-colors hover:text-brand', nameClass)}>{person.name}</Link>
          {dm && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); navigate(`/messages?to=${id}`) }}
              title={`Message ${person.name?.split(' ')[0] || ''}`}
              aria-label={`Message ${person.name || ''}`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-smoke transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:text-brand"
            >
              <Icon name="envelope" className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {children}
      </div>
    </div>
  )
}
