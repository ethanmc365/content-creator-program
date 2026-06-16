import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { EmptyState, PageHeader, Skeleton } from '../components/ui'
import Icon from '../components/Icon'
import { timeAgo, cx } from '../lib/utils'

// Each notification type gets a custom icon (no emoji).
const TYPE_ICON = {
  challenge: 'flag', announcement: 'megaphone', results: 'trophy',
  reward: 'money', deadline: 'clock', connection: 'users', dm: 'chat',
  event: 'calendar', application: 'shield', chat: 'chat',
}

// Full notification history (the bell shows only the latest few).
export default function Notifications() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setItems(data ?? [])
        setLoading(false)
      })
  }, [])

  async function open(n) {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)))
      await supabase.from('notifications').update({ read: true }).eq('id', n.id)
    }
    if (n.link) navigate(n.link)
  }

  async function markAllRead() {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })))
    await supabase.from('notifications').update({ read: true }).eq('recipient_id', user.id).eq('read', false)
  }

  const unread = items.filter((n) => !n.read).length

  return (
    <div className="page max-w-3xl">
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread` : "You're all caught up."}
        action={unread > 0 && <button onClick={markAllRead} className="btn-secondary">Mark all read</button>}
      />

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : items.length === 0 ? (
        <EmptyState icon={<Icon name="bell" className="h-7 w-7" />} title="Nothing here yet" hint="Challenge launches, results, rewards and DMs will all show up here." />
      ) : (
        <div className="overflow-hidden rounded-card border border-gray-100 shadow-card">
          {items.map((n) => (
            <button
              key={n.id}
              onClick={() => open(n)}
              className={cx(
                'flex w-full items-start gap-4 border-b border-gray-50 px-5 py-4 text-left transition-colors last:border-0 hover:bg-cloud/60 sm:px-7',
                !n.read && 'bg-brand-tint/40'
              )}
            >
              <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-tint text-brand" aria-hidden>
                <Icon name={TYPE_ICON[n.type] || 'bell'} className="h-5 w-5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{n.title}</span>
                {n.body && <span className="mt-0.5 block text-sm text-smoke">{n.body}</span>}
                <span className="mt-1 block text-xs text-gray-400">{timeAgo(n.created_at)}</span>
              </span>
              {!n.read && <span className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
