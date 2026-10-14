import { useEffect, useState } from 'react'
import Icon from '../Icon'
import { Spinner } from '../ui'
import { useAuth } from '../../context/AuthContext'
import { isIOS, isStandalone } from '../../lib/install'
import { enablePush, pushPermission, pushSupported } from '../../lib/push'
import { useT } from '../../lib/i18n'

// NOTIFICATIONS, WHERE THEY MATTER MOST (14 Oct 2026). On 14 Oct 124 of 230 creators had no device to push to: over 14
// days 4,333 room notifications had nowhere to go, which is the "people not seeing messages in the market chats" the
// team heard. The app-wide banner stays off chat screens (it would push the composer away), so the rooms index carries
// its own: one press to turn them on, or, once refused, how to turn them back on in the phone's settings.
export default function RoomsPushCard() {
  const tr = useT()
  const { profile } = useAuth()
  const [perm, setPerm] = useState(() => pushPermission())
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    const check = () => setPerm(pushPermission())
    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, [])
  if (!profile || profile.is_admin || !pushSupported() || perm === 'granted') return null
  if (isIOS() && !isStandalone()) return null
  async function on() {
    setBusy(true)
    try { await enablePush(profile.id) } catch { /* the permission is the answer */ }
    setBusy(false)
    setPerm(pushPermission())
  }
  return (
    <section className="flex items-start gap-3 rounded-card border border-brand/25 bg-white p-4 shadow-card animate-rise">
      <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center text-brand"><Icon name="bell" className="h-6 w-6" /></span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-ink">{tr('You are missing messages')}</p>
        <p className="mt-0.5 text-[13px] leading-snug text-smoke">
          {perm === 'denied'
            ? tr('Notifications are blocked for this app. Turn them on in your phone settings, under Notifications, to hear when your market posts.')
            : tr('Turn on notifications to hear when someone posts in your rooms or mentions you.')}
        </p>
        {perm !== 'denied' && (
          <button type="button" onClick={on} disabled={busy} className="btn-primary mt-3 !px-4 !py-2 text-sm">
            {busy ? <Spinner className="h-4 w-4" /> : <Icon name="bell" className="h-4 w-4" />}{tr('Turn on notifications')}
          </button>
        )}
      </div>
    </section>
  )
}
