import Icon from '../Icon'
import { cx } from '../../lib/utils'
import { metaFor } from '../../lib/notifications'
import { useNotificationActor } from '../../lib/notificationActors'
import { thumbUrl } from '../../lib/avatarUrl'

// WHAT A NOTIFICATION IS, SEEN BEFORE IT IS READ (19 Oct 2026).
//
// Ethan: every card in the bell "looks exactly the same and is hard to understand". Every row was the same orange
// square with a small glyph in it. Now the left of a row says what kind of thing it is in its own shape, all in the
// house palette and with no tinted squares:
//   a person        their photo in a round avatar, or their initials when we cannot tell who (a message, a mention, a
//                   connection...). The photo is looked up from the name in the text or the link: lib/notificationActors
//   the leaderboard the place itself, "#3", with an arrow up or down
//   money           a solid brand coin with the glyph in white
//   everything else the bare brand glyph, larger
// Read rows fade back so the unread ones lead.

const PEOPLE = new Set(['dm', 'chat', 'mention', 'reaction', 'connection', 'collab', 'feedback', 'new_member', 'referral', 'board_answer'])
const MONEY = new Set(['reward', 'vip'])

/** Initials from a title that starts with somebody's name ("Sam Rivera sent you..."), or null. */
export function initialsFrom(title = '') {
  const words = String(title).replace(/^[^\p{L}]+/u, '').split(/\s+/)
  const name = []
  for (const w of words.slice(0, 2)) {
    if (/^\p{Lu}[\p{L}'-]*$/u.test(w) && !/^(You|Your|New|A|The|Tu|Tus|Has|Du|Ai|Ești|Estás)$/u.test(w)) name.push(w)
    else break
  }
  return name.length ? name.map((w) => w[0]).join('').toUpperCase() : null
}

/** The place in a leaderboard alert, and which way it went. */
export function rankFrom(n) {
  const inTitle = String(n.title || '').match(/(\d+)/)
  if (inTitle) return { place: Number(inTitle[1]), up: true }
  const inBody = String(n.body || '').match(/#?(\d+)/)
  return inBody ? { place: Number(inBody[1]), up: false } : null
}

export default function NotificationLead({ n, size = 'sm' }) {
  const meta = metaFor(n.type)
  const actor = useNotificationActor(n, PEOPLE.has(n.type))
  const box = size === 'lg' ? 'h-10 w-10' : 'h-9 w-9'
  const fade = n.read && 'opacity-60'
  if (n.type === 'rank') {
    const r = rankFrom(n)
    return (
      <span className={cx('relative flex shrink-0 flex-col items-center justify-center rounded-full border-2 transition-transform duration-200 group-hover/row:scale-110', box, r?.up === false ? 'border-gray-300 text-ink' : 'border-brand text-brand', fade)} aria-hidden>
        <span className="text-[13px] font-extrabold leading-none tabular-nums">{r ? `#${r.place}` : '#'}</span>
        <span className={cx('absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white shadow-card', r?.up === false ? 'text-smoke' : 'text-brand')}>
          <Icon name={r?.up === false ? 'arrow-down' : 'arrow-up'} className="h-2.5 w-2.5" />
        </span>
      </span>
    )
  }
  if (PEOPLE.has(n.type)) {
    const ini = initialsFrom(n.title)
    return (
      <span className={cx('relative flex shrink-0 items-center justify-center rounded-full bg-cloud text-[12px] font-bold text-ink transition-transform duration-200 group-hover/row:scale-110', box, fade)} aria-hidden>
        {actor?.photo ? (
          <img
            src={thumbUrl(actor.photo, 72)}
            alt=""
            loading="lazy"
            onError={(e) => {
              if (e.currentTarget.dataset.raw) return
              e.currentTarget.dataset.raw = '1'
              e.currentTarget.src = actor.photo
            }}
            className="h-full w-full rounded-full object-cover"
          />
        ) : (ini || <Icon name={meta.icon} className="h-4 w-4 text-brand" />)}
        {(ini || actor?.photo) && (
          <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-white text-brand shadow-card">
            <Icon name={meta.icon} className="h-2.5 w-2.5" />
          </span>
        )}
      </span>
    )
  }
  if (MONEY.has(n.type)) {
    return (
      <span className={cx('flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-light to-brand text-white shadow-card transition-transform duration-200 group-hover/row:scale-110', box, fade)} aria-hidden>
        <Icon name={n.type === 'vip' ? 'star' : /voucher|vale|gutschein|voucher/i.test(`${n.title} ${n.body}`) ? 'ticket' : meta.icon} className="h-4 w-4" />
      </span>
    )
  }
  return (
    <span className={cx('flex shrink-0 items-center justify-center text-brand transition-transform duration-200 group-hover/row:scale-110', box, fade)} aria-hidden>
      <Icon name={meta.icon} className="h-6 w-6" />
    </span>
  )
}
