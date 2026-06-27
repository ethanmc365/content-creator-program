import { useEffect, useRef, useState, useCallback } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import { showLocalNotification } from '../../lib/push'
import Icon from '../Icon'
import { timeAgo, cx } from '../../lib/utils'

const TYPE_ICON = {
  challenge: 'flag', announcement: 'megaphone', results: 'trophy',
  reward: 'money', deadline: 'clock', connection: 'users', dm: 'chat',
  event: 'calendar', application: 'shield', chat: 'chat', feedback: 'chat',
}

// Bell in the navbar: live unread count + dropdown of recent notifications.
// Subscribes to Supabase realtime so new notifications appear instantly.
export default function NotificationBell() {
  const { user, profile } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [open, setOpen] = useState(false)
  const panelRef = useRef(null)
  const prefsRef = useRef(profile?.notif_prefs)
  useEffect(() => { prefsRef.current = profile?.notif_prefs }, [profile?.notif_prefs])

  const unread = items.filter((n) => !n.read).length

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(12)
    setItems(data ?? [])
  }, [])

  useEffect(() => {
    if (!user) return
    load()
    // Realtime: prepend new notifications for me the moment they're created.
    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${user.id}` },
        (payload) => {
          setItems((prev) => [payload.new, ...prev].slice(0, 12))
          // Pop an OS notification when the app isn't in the foreground, unless
          // the creator has turned push off for this category.
          const pushOn = prefsRef.current?.[payload.new.type] !== false
          if (pushOn && document.visibilityState !== 'visible') {
            showLocalNotification({
              title: payload.new.title, body: payload.new.body,
              link: payload.new.link || '/notifications', tag: payload.new.id,
            })
          }
        }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [user, load])

  // Close the dropdown when clicking anywhere else.
  useEffect(() => {
    if (!open) return
    const onClick = (e) => {
      if (panelRef.current && !panelRef.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [open])

  async function openNotification(n) {
    setOpen(false)
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

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-full p-2.5 text-smoke transition-colors hover:bg-cloud hover:text-ink"
        aria-label={`Notifications${unread ? ` (${unread} unread)` : ''}`}
      >
        <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-40 mt-2 w-80 rounded-card border border-gray-100 bg-white p-2 shadow-lift animate-fade-up">
          <div className="flex items-center justify-between px-3 py-2">
            <p className="text-sm font-semibold">Notifications</p>
            {unread > 0 && (
              <button onClick={markAllRead} className="text-xs font-medium text-brand hover:underline">Mark all read</button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && <p className="px-3 py-8 text-center text-sm text-smoke">You're all caught up.</p>}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => openNotification(n)}
                className={cx('flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-cloud', !n.read && 'bg-brand-tint/50')}
              >
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-tint text-brand" aria-hidden>
                  <Icon name={TYPE_ICON[n.type] || 'bell'} className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{n.title}</span>
                  {n.body && <span className="mt-0.5 line-clamp-2 block text-xs text-smoke">{n.body}</span>}
                  <span className="mt-1 block text-[11px] text-gray-400">{timeAgo(n.created_at)}</span>
                </span>
                {!n.read && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" aria-label="Unread" />}
              </button>
            ))}
          </div>

          <Link to="/notifications" onClick={() => setOpen(false)} className="block rounded-xl px-3 py-2.5 text-center text-sm font-medium text-brand hover:bg-cloud">
            View all
          </Link>
        </div>
      )}
    </div>
  )
}
