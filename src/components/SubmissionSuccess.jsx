// The "your video is in" moment, shown straight after a challenge entry saves.
//
// Deliberately a celebration rather than a toast: the Tryp.com plane takes off
// across a band of cartoon clouds (the same plane + cloud language as
// TrypPlaneScene, scaled down to sit inside a card), then the creator picks
// between finishing up and submitting another video.

import { useEffect } from 'react'

const CLOUDS = [
  { top: '14%', scale: 0.55, dur: 9, delay: -1, o: 0.9 },
  { top: '52%', scale: 0.38, dur: 7, delay: -4, o: 0.75 },
  { top: '32%', scale: 0.7, dur: 12, delay: -8, o: 0.55 },
]

// Same chunky cloud as the full-screen scene, drawn white-on-orange here.
function Cloud({ style }) {
  const bumps = [
    ['circle', 46, 40, 28],
    ['circle', 84, 33, 26],
    ['circle', 112, 46, 22],
    ['circle', 24, 52, 20],
    ['ellipse', 72, 60, 60, 22],
  ]
  const shape = (b, key) =>
    b[0] === 'circle'
      ? <circle key={key} cx={b[1]} cy={b[2]} r={b[3]} fill="#ffffff" />
      : <ellipse key={key} cx={b[1]} cy={b[2]} rx={b[3]} ry={b[4]} fill="#ffffff" />
  return (
    <svg viewBox="0 0 150 88" style={style} aria-hidden="true">
      <g>{bumps.map((b, i) => shape(b, i))}</g>
    </svg>
  )
}

export default function SubmissionSuccess({
  open,
  onDone,
  onAddAnother,
  count = 1,
  platform,
}) {
  // Esc closes, and the page behind must not scroll under the card.
  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && onDone()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onDone])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="Video submitted"
    >
      <style>{`
        @keyframes trypTakeoff {
          0%   { transform: translate(-46%, 22px) scale(.86); opacity: 0 }
          45%  { transform: translate(0, 0) scale(1); opacity: 1 }
          100% { transform: translate(0, 0) scale(1); opacity: 1 }
        }
        @keyframes trypCruiseSm {
          0%,100% { transform: translate(0,0) rotate(-1deg) }
          50%     { transform: translate(-5px,-7px) rotate(1deg) }
        }
        @keyframes trypCloudSm { from { transform: translateX(-40%) } to { transform: translateX(340%) } }
        .sx-plane  { animation: trypTakeoff 1s cubic-bezier(.22,.9,.3,1) both }
        .sx-bob    { animation: trypCruiseSm 4s ease-in-out infinite 1s; transform-origin: center }
        .sx-cloud  { position:absolute; left:0; pointer-events:none; animation: trypCloudSm linear infinite }
        @media (prefers-reduced-motion: reduce) {
          .sx-plane { animation: none; opacity: 1 }
          .sx-bob, .sx-cloud { animation: none }
        }
      `}</style>

      <button aria-label="Close" className="absolute inset-0 bg-ink/40" onClick={onDone} />

      <div className="relative w-full overflow-hidden rounded-t-card bg-white shadow-lift animate-fade-up sm:max-w-md sm:rounded-card">
        {/* Plane taking off through the clouds */}
        <div className="relative h-44 overflow-hidden bg-gradient-to-br from-brand to-brand-light sm:h-48">
          <div className="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
            {CLOUDS.map((c, i) => (
              <div
                key={i}
                className="sx-cloud"
                style={{ top: c.top, opacity: c.o, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}
              >
                <Cloud style={{ width: 150 * c.scale }} />
              </div>
            ))}
          </div>
          <div className="absolute inset-0 z-20 flex items-center justify-center">
            <div className="sx-plane w-56 max-w-[70%] sm:w-64">
              <div className="sx-bob">
                <img
                  src="/brand/tryp-plane-transparent.png"
                  alt="Tryp.com plane taking off"
                  className="w-full drop-shadow-[0_8px_20px_rgba(0,0,0,0.25)]"
                />
              </div>
            </div>
          </div>
        </div>

        {/* On mobile the sheet runs to the bottom of the screen, where the tab
            bar sits on top of it, so the buttons get the tab bar's height (plus
            the home-indicator safe area) as extra padding. */}
        <div className="p-6 pb-[calc(6rem+env(safe-area-inset-bottom))] text-center sm:p-8 sm:pb-8">
          <h2 className="text-xl font-bold sm:text-2xl">Your video is submitted</h2>
          <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-smoke">
            {platform ? `Your ${platform} entry is in.` : 'Your entry is in.'} We'll log the views and it will show up
            on the leaderboard while the challenge is live.
          </p>
          <p className="mt-3 text-xs font-semibold uppercase tracking-wider text-brand">
            {count} {count === 1 ? 'video entered' : 'videos entered'}
          </p>

          <div className="mt-7 flex flex-col gap-3">
            <button type="button" onClick={onAddAnother} className="btn-primary w-full">
              + Submit another video
            </button>
            <button type="button" onClick={onDone} className="btn-secondary w-full">
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
