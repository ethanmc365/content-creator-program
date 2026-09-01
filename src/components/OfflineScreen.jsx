import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import TrypPlaneScene from './TrypPlaneScene'
import { useT } from '../lib/i18n'

// The chat surfaces, where losing signal is not a reason to be shown a plane.
// See the note in the component.
const WRITING = /^\/(chat|messages)(\/|$)|\/chat(\/|$)/

// A friendly full-screen takeover when the device loses its connection: the
// Tryp.com plane cruising through cartoon clouds. Clears itself the moment we're
// back online.
//
// EXCEPT WHERE YOU MIGHT BE TYPING. This covered the whole app including the
// composer, which quietly made the offline message queue impossible: a person
// in a tunnel could not write the message the queue exists to hold, because the
// screen they needed had been replaced by a cartoon. On the chats and the DMs
// the connection is now reported by the line above the composer instead - which
// is the truthful place for it anyway, since it can also say what happened to
// the message you already sent. Everywhere else the plane is still right: there
// is nothing to do on a page that cannot load.
export default function OfflineScreen() {
  const tr = useT()
  const { pathname } = useLocation()
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

  if (!offline || WRITING.test(pathname)) return null

  return (
    <TrypPlaneScene
      title={tr("No connection")}
      subtitle="It looks like you're on airplane mode, or just have no internet right now. Sit back and we'll reconnect you automatically the moment you're back."
    />
  )
}
