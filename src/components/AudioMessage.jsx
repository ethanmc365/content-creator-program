import { useEffect, useRef, useState } from 'react'
import Icon from './Icon'
import { cx } from '../lib/utils'

function fmt(s) {
  if (!isFinite(s) || s < 0) return '0:00'
  const m = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
  return `${m}:${String(ss).padStart(2, '0')}`
}

// Compact WhatsApp-style voice-note player: play/pause, a seekable progress bar
// and a running time. `onDark` recolours it for the sender's orange bubble.
export default function AudioMessage({ src, onDark }) {
  const ref = useRef(null)
  const [playing, setPlaying] = useState(false)
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)

  useEffect(() => {
    const a = ref.current
    if (!a) return
    const onTime = () => setCur(a.currentTime)
    const onMeta = () => { if (isFinite(a.duration)) setDur(a.duration) }
    const onEnd = () => { setPlaying(false); setCur(0) }
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('loadedmetadata', onMeta)
    a.addEventListener('durationchange', onMeta)
    a.addEventListener('ended', onEnd)
    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('loadedmetadata', onMeta)
      a.removeEventListener('durationchange', onMeta)
      a.removeEventListener('ended', onEnd)
    }
  }, [])

  const toggle = () => {
    const a = ref.current
    if (!a) return
    if (a.paused) { a.play(); setPlaying(true) } else { a.pause(); setPlaying(false) }
  }
  const seek = (e) => {
    const a = ref.current
    if (!a || !dur) return
    const rect = e.currentTarget.getBoundingClientRect()
    const pct = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width))
    a.currentTime = pct * dur
    setCur(a.currentTime)
  }
  const pct = dur ? (cur / dur) * 100 : 0
  const shown = playing || cur > 0 ? cur : dur

  return (
    <div className={cx('flex items-center gap-3 py-0.5', onDark ? 'text-white' : 'text-ink')} style={{ minWidth: 190 }}>
      <audio ref={ref} src={src} preload="metadata" />
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        className={cx(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-transform hover:scale-105',
          onDark ? 'bg-white/25 text-white' : 'bg-brand text-white'
        )}
      >
        <Icon name={playing ? 'pause' : 'play'} className="h-4 w-4" strokeWidth={2} />
      </button>
      <div className="flex-1">
        <div onClick={seek} className={cx('h-1.5 cursor-pointer rounded-full', onDark ? 'bg-white/30' : 'bg-gray-200')}>
          <div className={cx('h-1.5 rounded-full', onDark ? 'bg-white' : 'bg-brand')} style={{ width: `${pct}%` }} />
        </div>
        <div className={cx('mt-1 text-[11px] tabular-nums', onDark ? 'text-white/80' : 'text-smoke')}>{fmt(shown)}</div>
      </div>
    </div>
  )
}
