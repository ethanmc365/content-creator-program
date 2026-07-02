import { useEffect, useState } from 'react'

// A friendly full-screen takeover when the device loses its connection: the
// Tryp.com plane cruising through cartoon clouds with puffy exhaust trailing
// from its engines. Clears itself the moment we're back online. (The plane
// artwork has a white background, so the screen is kept white for a seamless
// blend; clouds/puffs are outlined so they read against it.)
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

  // Cartoon clouds drift left→right (opposite the plane's heading) at parallax
  // speeds and pass in front of it, so it looks like it's flying through them.
  const clouds = [
    { top: '6%', scale: 1.2, dur: 33, delay: -4, o: 0.95 },
    { top: '16%', scale: 0.75, dur: 24, delay: -15, o: 0.9 },
    { top: '24%', scale: 1.4, dur: 20, delay: -2, o: 0.72 },
    { top: '45%', scale: 0.9, dur: 16, delay: -9, o: 0.72 },
    { top: '12%', scale: 0.55, dur: 28, delay: -21, o: 0.85 },
  ]

  // Two exhaust trails, anchored at the engine (~56%,70% of the artwork).
  const trails = [
    { top: '69%', delay: 0 },
    { top: '73%', delay: 0.9 },
  ]
  const puffTimes = [0, 0.3, 0.6, 0.9, 1.2, 1.5]

  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-white">
      <style>{`
        @keyframes trypCruise {
          0%,100% { transform: translate(0,0) rotate(-0.5deg) }
          50%     { transform: translate(-8px,-12px) rotate(0.5deg) }
        }
        @keyframes trypCloud { from { transform: translateX(-45vw) } to { transform: translateX(120vw) } }
        @keyframes trypExhaust {
          0%   { opacity: 0; transform: translate(0,0) scale(.35) }
          14%  { opacity: 1 }
          78%  { opacity: 1 }
          100% { opacity: 0; transform: translate(60px,10px) scale(1.7) }
        }
        .tryp-plane { animation: trypCruise 4s ease-in-out infinite; transform-origin: center }
        .tryp-cloud { position: absolute; left: 0; pointer-events: none; animation: trypCloud linear infinite }
        .tryp-puff {
          position: absolute; border-radius: 9999px; background: #fff;
          border: 2px solid #bcd0e6; pointer-events: none;
          animation: trypExhaust 1.8s linear infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .tryp-plane, .tryp-cloud, .tryp-puff { animation: none }
          .tryp-puff:nth-child(n+3) { display: none }
        }
      `}</style>

      {/* Centered plane + message */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="tryp-plane relative w-[320px] max-w-full sm:w-[460px]">
          <img src="/brand/tryp-plane.png" alt="Tryp.com plane" className="relative z-10 w-full" />
          {/* Engine exhaust puffs (in front of the plane, from the engine) */}
          {trails.map((t, ti) => (
            <div key={ti} className="absolute z-20" style={{ top: t.top, left: '56%' }} aria-hidden="true">
              {puffTimes.map((d, i) => (
                <span key={i} className="tryp-puff" style={{ top: 0, left: 0, width: '17px', height: '17px', animationDelay: `${d + t.delay}s` }} />
              ))}
            </div>
          ))}
        </div>

        <div className="max-w-sm">
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">No connection</h1>
          <p className="mt-2 text-sm leading-relaxed text-smoke sm:text-base">
            It looks like you're on airplane mode, or just have no internet right now.
            Sit back and we'll reconnect you automatically the moment you're back.
          </p>
        </div>
      </div>

      {/* Cartoon clouds passing in front of the plane */}
      <div className="pointer-events-none absolute inset-0 z-20" aria-hidden="true">
        {clouds.map((c, i) => (
          <div
            key={i}
            className="tryp-cloud"
            style={{ top: c.top, opacity: c.o, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}
          >
            <Cloud style={{ width: 150 * c.scale }} />
          </div>
        ))}
      </div>
    </div>
  )
}

// A chunky cartoon cloud: a white body with a soft blue-grey outline (drawn as a
// slightly larger shape behind the white fill).
function Cloud({ style }) {
  const bumps = [
    ['circle', 46, 40, 28],
    ['circle', 84, 33, 26],
    ['circle', 112, 46, 22],
    ['circle', 24, 52, 20],
    ['ellipse', 72, 60, 60, 22],
  ]
  const shape = (b, grow, fill, key) =>
    b[0] === 'circle'
      ? <circle key={key} cx={b[1]} cy={b[2]} r={b[3] + grow} fill={fill} />
      : <ellipse key={key} cx={b[1]} cy={b[2]} rx={b[3] + grow} ry={b[4] + grow} fill={fill} />
  return (
    <svg viewBox="0 0 150 88" style={style} aria-hidden="true">
      <g>{bumps.map((b, i) => shape(b, 3.5, '#bcd0e6', `o${i}`))}</g>
      <g>{bumps.map((b, i) => shape(b, 0, '#ffffff', `f${i}`))}</g>
    </svg>
  )
}
