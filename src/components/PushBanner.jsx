import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Icon from './Icon'
import { Spinner } from './ui'
import { useAuth } from '../context/AuthContext'
import { isIOS, isStandalone } from '../lib/install'
import { enablePush, pushPermission, pushSupported } from '../lib/push'
import { useT } from '../lib/i18n'

// NOTIFICATIONS, ASKED FOR WITH A BANNER, NOT A POP-UP.
//
// The ask used to be a modal in AddToHomePrompt, once per app open: one tap on "Not now" and it was gone until the next
// open, and it stood between the creator and whatever they opened the app to do. A banner sits at the top of every page
// instead, costs them nothing to ignore, and is one tap to act on. The cross hides it for this app open only; it is back
// next time until notifications are on.
//
// Same rules as the old ask (lib/install.installPromptFor): approved creators, not the team, and only when the browser
// can actually ask - a phone that has blocked it is told how in Settings, and an iPhone tab cannot have push at all
// until the app is on the home screen (the install wall handles that first).
const HIDDEN = 'tryp_push_banner_hidden'

export default function PushBanner() {
  const { profile } = useAuth()
  const { pathname } = useLocation()
  const tr = useT()
  const [busy, setBusy] = useState(false)
  const [hidden, setHidden] = useState(() => {
    try { return sessionStorage.getItem(HIDDEN) === '1' } catch { return false }
  })
  const [perm, setPerm] = useState(() => pushPermission())
  // A permission changed in another tab or in Settings shows up when the app comes back to the front.
  useEffect(() => {
    const check = () => setPerm(pushPermission())
    document.addEventListener('visibilitychange', check)
    return () => document.removeEventListener('visibilitychange', check)
  }, [])

  // Not over a chat: those screens are sized to the window and a banner on top would push the composer off it.
  if (/(^|\/)(chat|rooms|messages)(\/|$)/.test(pathname)) return null
  if (hidden || !profile || profile.is_admin || profile.status !== 'active' || !profile.tour_completed_at) return null
  if (!pushSupported() || perm !== 'default') return null
  if (isIOS() && !isStandalone()) return null

  async function turnOn() {
    setBusy(true)
    try { await enablePush(profile.id) } catch { /* the permission state is the answer */ }
    setBusy(false)
    setPerm(pushPermission())
  }
  function hide() {
    try { sessionStorage.setItem(HIDDEN, '1') } catch { /* private mode */ }
    setHidden(true)
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 pt-3 sm:px-6 lg:px-8">
      <div role="status" className="push-banner flex items-center gap-3 rounded-card border border-gray-100 bg-white px-3.5 py-2.5 shadow-card sm:px-4">
        <Icon name="bell" className="push-banner-bell h-5 w-5 shrink-0 text-brand" />
        <p className="min-w-0 flex-1 text-[13px] leading-snug text-ink">
          <span className="font-semibold">{tr('Turn notifications on')}</span>
          <span className="hidden text-smoke sm:inline"> · {tr('Hear the moment a challenge goes live, results are in or you have been paid.')}</span>
          <span className="block text-smoke sm:hidden">{tr('So you never miss a challenge going live.')}</span>
        </p>
        <button type="button" onClick={turnOn} disabled={busy} className="btn-primary shrink-0 !px-3.5 !py-1.5 text-xs disabled:opacity-60">
          {busy ? <Spinner /> : tr('Turn on')}
        </button>
        <button type="button" onClick={hide} aria-label={tr('Hide for now')} className="-mr-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-300 transition-colors hover:text-ink">
          <Icon name="close" className="h-4 w-4" />
        </button>
      </div>
    </div>
  )
}
