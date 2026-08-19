import { Link } from 'react-router-dom'
import { Avatar } from '../ui'
import { cx } from '../../lib/utils'

// WHO ELSE IS GOING, AS PEOPLE.
//
// Ethan: '"Ana and six others" is the reason to come; "7 going" is a number.'
//
// That is the whole design brief and it is right. A count is a fact about an
// event; a face is a fact about somebody you know. The row leads with faces,
// names the first one, and only then says how many - and the number is the
// quiet part of the sentence, not the loud one.
//
// WHOSE FACE COMES FIRST. Anybody the reader is connected to, then anybody with
// a photo, then the rest by name. Sorting by RSVP time looked arbitrary: the
// person who happened to answer first is not the person who makes you want to
// come.
export function orderFaces(rows, { myId, connectedIds } = {}) {
  const score = (r) => {
    let s = 0
    if (connectedIds?.has?.(r.user_id)) s += 4
    if (r.profiles?.photo_url) s += 2
    if (r.user_id === myId) s -= 8   // you already know you are going
    return s
  }
  return [...rows].sort((a, b) => score(b) - score(a) || String(a.profiles?.name || '').localeCompare(String(b.profiles?.name || '')))
}

// "Ana and 6 others are going" / "Ana and Tom are going" / "Ana is going".
function sentence(rows, mine) {
  const names = rows.map((r) => String(r.profiles?.name || '').split(' ')[0]).filter(Boolean)
  const n = rows.length
  if (n === 0) return mine ? 'You are going' : null
  const lead = names[0] || `${n} creator${n === 1 ? '' : 's'}`
  if (n === 1) return mine ? `${lead} and you are going` : `${lead} is going`
  if (n === 2 && names[1]) return mine ? `${lead}, ${names[1]} and you are going` : `${lead} and ${names[1]} are going`
  const others = n - 1
  return mine
    ? `${lead}, ${others} other${others === 1 ? '' : 's'} and you are going`
    : `${lead} and ${others} other${others === 1 ? '' : 's'} are going`
}

export default function RsvpFaces({ rows = [], myId, connectedIds, max = 5, className = '' }) {
  const going = rows.filter((r) => r.status === 'going')
  const mine = going.some((r) => r.user_id === myId)
  const others = orderFaces(going.filter((r) => r.user_id !== myId), { myId, connectedIds })
  const line = sentence(others, mine)
  if (!line) return null

  const shown = others.slice(0, max)
  const rest = others.length - shown.length

  return (
    <div className={cx('flex items-center gap-2.5', className)}>
      {(shown.length > 0 || mine) && (
        <div className="flex -space-x-2">
          {shown.map((r) => (
            <Link
              key={r.user_id}
              to={`/profile/${r.user_id}`}
              title={r.profiles?.name}
              // A face lifts out of the stack on hover, which is what makes a
              // row of overlapping circles feel like people rather than a
              // texture. `relative` so the lifted one wins the paint order.
              className="relative transition-transform duration-200 hover:z-10 hover:-translate-y-0.5"
            >
              <Avatar src={r.profiles?.photo_url} name={r.profiles?.name} size="xs" className="!h-7 !w-7 ring-2 ring-white" />
            </Link>
          ))}
          {rest > 0 && (
            <span className="relative flex h-7 w-7 items-center justify-center rounded-full bg-cloud text-[10px] font-bold text-smoke ring-2 ring-white">
              +{rest}
            </span>
          )}
        </div>
      )}
      <p className="min-w-0 truncate text-xs text-smoke">{line}</p>
    </div>
  )
}
