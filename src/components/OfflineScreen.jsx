import { useEffect, useState } from 'react'

// A friendly full-screen takeover when the device loses its connection: the
// Tryp.com plane cruising through drifting clouds with soft contrails billowing
// behind it. Clears itself the moment we're back online. (The plane artwork has
// a white background, so the screen is kept white for a seamless blend and the
// clouds/contrails are tinted so they read against it.)
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

  // Clouds drift left→right (opposite the plane's heading) at parallax speeds so
  // it looks like the plane is flying through them.
  const clouds = [
    { top: '9%', w: 240, o: 0.9, blur: 22, dur: 33, delay: -4 },
    { top: '22%', w: 160, o: 0.8, blur: 16, dur: 24, delay: -15 },
    { top: '35%', w: 300, o: 0.95, blur: 24, dur: 20, delay: -2 },
    { top: '43%', w: 200, o: 0.85, blur: 18, dur: 15, delay: -9 },
    { top: '30%', w: 150, o: 0.7, blur: 16, dur: 19, delay: -13 },
    { top: '15%', w: 120, o: 0.6, blur: 14, dur: 29, delay: -22 },
  ]

  // Two contrails, each a soft base streak plus billowing puffs.
  const trails = [
    { top: '44%', left: '93%', dy: '-6px' },
    { top: '52%', left: '95%', dy: '5px' },
  ]

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-white">
      <style>{`
        @keyframes trypCruise {
          0%,100% { transform: translate(0,0) rotate(-0.5deg) }
          50%     { transform: translate(-8px,-12px) rotate(0.5deg) }
        }
        @keyframes trypCloud { from { transform: translateX(-40vw) } to { transform: translateX(115vw) } }
        @keyframes trypPuff {
          0%   { opacity: 0;   transform: translate(0,0) scale(.4) }
          18%  { opacity: .55 }
          100% { opacity: 0;   transform: translate(78px, var(--dy,0px)) scale(1.9) }
        }
        .tryp-plane { animation: trypCruise 4s ease-in-out infinite; transform-origin: center }
        .tryp-cloud {
          position: absolute; left: 0; border-radius: 9999px; pointer-events: none;
          background: radial-gradient(60% 60% at 50% 50%, #c4d8ee 0%, rgba(196,216,238,0) 72%);
          animation: trypCloud linear infinite;
        }
        .tryp-trailbase {
          position: absolute; pointer-events: none; border-radius: 9999px;
          background: linear-gradient(90deg, rgba(190,214,236,.55), rgba(190,214,236,0) 88%);
          filter: blur(3px);
        }
        .tryp-puff {
          position: absolute; border-radius: 9999px; pointer-events: none;
          background: radial-gradient(closest-side, rgba(198,218,238,.95), rgba(198,218,238,0));
          filter: blur(2px);
          animation: trypPuff 2s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .tryp-plane, .tryp-cloud, .tryp-puff { animation: none }
          .tryp-puff { opacity: .4 }
        }
      `}</style>

      {/* Centered plane + message */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="tryp-plane relative w-[320px] max-w-full sm:w-[460px]">
          {trails.map((t, ti) => (
            <div key={ti} className="absolute z-0" style={{ top: t.top, left: t.left }} aria-hidden="true">
              <span className="tryp-trailbase" style={{ top: '6px', left: 0, width: '190px', height: '9px' }} />
              {[0, 0.33, 0.66, 1, 1.33, 1.66].map((d, i) => (
                <span key={i} className="tryp-puff" style={{ top: 0, left: 0, width: '18px', height: '18px', animationDelay: `${d}s`, '--dy': t.dy }} />
              ))}
            </div>
          ))}
          <img src="/brand/tryp-plane.png" alt="Tryp.com plane" className="relative z-10 w-full" />
        </div>

        <div className="max-w-sm">
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">No connection</h1>
          <p className="mt-2 text-sm leading-relaxed text-smoke sm:text-base">
            It looks like you're on airplane mode, or just have no internet right now.
            Sit back and we'll reconnect you automatically the moment you're back.
          </p>
        </div>
      </div>

      {/* Foreground clouds pass in front of the plane (translucent, so it shows
          through) — sells the "flying through the clouds" feel. */}
      <div className="pointer-events-none absolute inset-0 z-20" aria-hidden="true">
        {clouds.map((c, i) => (
          <span
            key={i}
            className="tryp-cloud"
            style={{ top: c.top, width: c.w, height: c.w * 0.6, opacity: c.o, filter: `blur(${c.blur}px)`, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}
          />
        ))}
      </div>
    </div>
  )
}
