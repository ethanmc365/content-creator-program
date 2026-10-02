import { useState } from 'react'
import Icon from './Icon'
import { useSlowNetwork } from '../lib/netQuality'
import { atlasReady } from '../lib/mapCountries'
import { cx } from '../lib/utils'
import { useT } from '../lib/i18n'

// ON A WEAK SIGNAL THE MAP WAITS (2 Oct 2026).
//
// Ethan: "if the creator map takes a long time to load and causes lag then saying something like 'will show when
// wifi signal improves' and not loading it to reduce lag could be useful on really bad wifi."
//
// A world map is ~170kB of geometry to download and parse, then hundreds of paths to lay out - the single most
// expensive thing on any page that has one, and the least urgent. When lib/netQuality has measured the connection
// as slow AND the atlas is not already in memory, the map is replaced by a card the same shape saying so, with a
// button to load it anyway. The moment the connection recovers the real map takes its place by itself. An atlas
// already downloaded this session costs nothing to draw, so it is never held back.
export default function SlowMapGate({ children, className, aspect = 'aspect-[2/1]' }) {
  const tr = useT()
  const slow = useSlowNetwork()
  const [forced, setForced] = useState(false)
  if (!slow || forced || atlasReady()) return children
  return (
    <div className={cx('relative flex w-full flex-col items-center justify-center gap-2 overflow-hidden rounded-card border border-dashed border-gray-200 bg-cloud/50 px-6 py-8 text-center animate-fade-up', aspect, className)}>
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white text-brand shadow-card">
        <Icon name="globe" className="h-5 w-5" />
      </span>
      <p className="text-sm font-semibold text-ink">{tr('The map will show when your signal improves')}</p>
      <p className="max-w-xs text-xs text-smoke">{tr('Your connection is slow right now, so we are saving it for the rest of the page.')}</p>
      <button type="button" onClick={() => setForced(true)} className="mt-1 text-xs font-semibold text-brand transition-transform duration-200 hover:scale-105">
        {tr('Load the map anyway')}
      </button>
    </div>
  )
}
