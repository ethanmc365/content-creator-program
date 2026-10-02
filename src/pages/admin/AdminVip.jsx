import { Navigate, useSearchParams } from 'react-router-dom'

// THE VIP TOOLS MOVED INTO THE VIP PAGE (2 Oct 2026). Ethan: "build all those admin tools into that VIP page for admins
// rather than having a separate page." Old links, bookmarks and notifications (`/admin/vip?tab=close`) still land in
// the right tool: the third view of /vip (components/vip/VipTools).
export default function AdminVip() {
  const [params] = useSearchParams()
  const next = new URLSearchParams(params)
  next.set('mode', 'tools')
  return <Navigate to={`/vip?${next.toString()}`} replace />
}
