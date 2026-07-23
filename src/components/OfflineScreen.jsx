import { useEffect, useState } from 'react'
import TrypPlaneScene from './TrypPlaneScene'

// A friendly full-screen takeover when the device loses its connection: the
// Tryp.com plane cruising through cartoon clouds. Clears itself the moment we're
// back online.
export default function OfflineScreen() {
  const [offline, setOffline] = useState(() => !navigator.onLine)

  useEffect(() => {
    const goOnline = () => setOffline(false)
    const goOffline = () => setOffline(true)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (!offline) return null

  return (
    <TrypPlaneScene
      title="No connection"
      subtitle="It looks like you're on airplane mode, or just have no internet right now. Sit back and we'll reconnect you automatically the moment you're back."
    />
  )
}
