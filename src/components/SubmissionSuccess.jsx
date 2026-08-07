// The "your video is in" moment, shown straight after a challenge entry saves.
//
// Deliberately a celebration rather than a toast: the Tryp.com plane takes off
// across a band of cartoon clouds (the same plane + cloud language as
// TrypPlaneScene, scaled down to sit inside a card), then the creator picks
// between finishing up and submitting another video.

import { useEffect } from 'react'

const CLOUDS = [
  { top: '10%', scale: 0.5, dur: 13, delay: -2, o: 0.9 },
  { top: '54%', scale: 0.34, dur: 10, delay: -6, o: 0.75 },
  { top: '30%', scale: 0.64, dur: 17, delay: -12, o: 0.5 },
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
      className="fixed inset-0 z-[70] flex items-end justify-center px-4 pb-[calc(5rem+env(safe-area-inset-bottom))] sm:items-center sm:p-6"
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
        /* The track is the full width of the band, so -100%/100% put the cloud
           completely off the left/right edge - it drifts on and off instead of
           popping in and out partway across. The fade at each end hides the
           wrap for anyone watching a single cloud. */
        @keyframes trypCloudSm {
          0%        { transform: translateX(-100%); opacity: 0 }
          12%, 88%  { opacity: 1 }
          100%      { transform: translateX(100%); opacity: 0 }
        }
        .sx-plane  { animation: trypTakeoff 1s cubic-bezier(.22,.9,.3,1) both }
        .sx-bob    { animation: trypCruiseSm 4s ease-in-out infinite 1s; transform-origin: center }
        .sx-cloud  { position:absolute; left:0; width:100%; pointer-events:none; animation: trypCloudSm linear infinite }
        @media (prefers-reduced-motion: reduce) {
          .sx-plane { animation: none; opacity: 1 }
          .sx-bob { animation: none }
          .sx-cloud { animation: none; transform: translateX(20%); opacity: 1 }
        }
      `}</style>

      <button aria-label="Close" className="absolute inset-0 bg-ink/40" onClick={onDone} />

      <div className="relative w-full max-w-sm overflow-hidden rounded-card bg-white shadow-lift animate-fade-up sm:max-w-md">
        {/* Plane taking off through the clouds */}
        <div className="relative h-32 overflow-hidden bg-gradient-to-br from-brand to-brand-light sm:h-44">
          <div className="pointer-events-none absolute inset-0 z-10" aria-hidden="true">
            {CLOUDS.map((c, i) => (
              <div
                key={i}
                className="sx-cloud"
                style={{ top: c.top, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}
              >
                <Cloud style={{ width: 150 * c.scale, opacity: c.o }} />
              </div>
            ))}
          </div>
          <div className="absolute inset-0 z-20 flex items-center justify-center">
            <div className="sx-plane w-44 max-w-[72%] sm:w-56">
              <div className="sx-bob">
                <img
                  src="/brand/tryp-plane-cutout.png"
                  alt="Tryp.com plane taking off"
                  className="w-full drop-shadow-[0_6px_14px_rgba(0,0,0,0.18)]"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="p-5 text-center sm:p-7">
          <h2 className="text-lg font-bold sm:text-2xl">Your video is submitted</h2>
          <p className="mx-auto mt-1.5 max-w-xs text-[13px] leading-relaxed text-smoke sm:mt-2 sm:text-sm">
            {platform ? `Your ${platform} entry is in.` : 'Your entry is in.'} Once we log the views it will show up
            on the leaderboard.
          </p>
          <p className="mt-2.5 text-xs font-semibold uppercase tracking-wider text-brand">
            {count} {count === 1 ? 'video entered' : 'videos entered'}
          </p>

          <div className="mt-5 flex flex-col gap-2.5 sm:mt-6 sm:gap-3">
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
