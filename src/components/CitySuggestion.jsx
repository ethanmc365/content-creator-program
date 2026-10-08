import { useEffect, useState } from 'react'
import { suggestCity } from '../lib/geocode'
import { useT } from '../lib/i18n'

// "Did you mean Melbourne, Australia?" under a town field (8 Oct 2026).
//
// Creators type their town freehand, and a typo ("Melbournr", "Canguu", "Subai") meant no pin on the creator map
// and nobody noticing. The geocoder now corrects spelling (Photon fallback in the `geocode` function); this asks
// rather than rewriting, because a creator knows their own town better than a fuzzy match does. Waits until they
// stop typing, asks once per spelling (the geocoder caches per town), and goes away once used or dismissed.
export default function CitySuggestion({ city, country, onUse }) {
  const tr = useT()
  const [hint, setHint] = useState(null)
  const [dismissed, setDismissed] = useState('')

  useEffect(() => {
    setHint(null)
    const typed = (city || '').trim()
    if (typed.length < 3 || typed === dismissed) return undefined
    let alive = true
    const t = setTimeout(() => {
      suggestCity(typed, country).then((s) => { if (alive) setHint(s) }).catch(() => {})
    }, 900)
    return () => { alive = false; clearTimeout(t) }
  }, [city, country, dismissed])

  if (!hint) return null
  const label = [hint.city, hint.country].filter(Boolean).join(', ')
  return (
    <div className="mt-2 flex animate-fade-up flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
      <span className="text-smoke">{tr('Did you mean')} <span className="font-semibold text-ink">{label}</span>?</span>
      <button
        type="button"
        className="rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white transition-transform duration-200 hover:scale-105"
        onClick={() => { onUse(hint); setHint(null) }}
      >
        {tr('Use it')}
      </button>
      <button
        type="button"
        className="text-xs text-smoke transition-colors hover:text-ink"
        onClick={() => { setDismissed((city || '').trim()); setHint(null) }}
      >
        {tr('No, keep mine')}
      </button>
    </div>
  )
}
