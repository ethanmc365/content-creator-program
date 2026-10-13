import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'
import Icon from './Icon'
import { useT } from '../lib/i18n'
import { onLoadTrouble, clearLoadFailure } from '../lib/loadTrouble'

// The one retry every page shares (see lib/loadTrouble). Retry remounts the page, which re-runs all of its loads.
export default function LoadTrouble({ onRetry }) {
  const tr = useT()
  const [show, setShow] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => onLoadTrouble(setShow), [])
  useEffect(() => { clearLoadFailure() }, [pathname])
  if (!show) return null
  return (
    <div role="alert" className="fixed inset-x-4 bottom-[calc(5.75rem+env(safe-area-inset-bottom))] z-40 mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-gray-100 bg-white px-4 py-3 shadow-lift animate-rise lg:bottom-6">
      <Icon name="alert" className="h-5 w-5 shrink-0 text-brand" />
      <p className="min-w-0 flex-1 text-sm text-ink">{tr('Some of this page did not load.')}</p>
      <button type="button" className="btn-primary shrink-0 !px-4 !py-2 text-sm" onClick={() => { clearLoadFailure(); onRetry() }}>
        {tr('Try again')}
      </button>
    </div>
  )
}
