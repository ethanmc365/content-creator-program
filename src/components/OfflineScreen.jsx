import { useEffect, useState } from 'react'

// A friendly full-screen takeover when the device loses its connection: a calm
// sky, a Tryp.com-branded 737 cruising with vapour trailing from the engines,
// and a short reassuring message. It clears itself the moment we're back online.
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
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-8 overflow-hidden bg-gradient-to-b from-[#eaf5ff] to-white px-6 text-center">
      <style>{`
        @keyframes trypCruise { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
        @keyframes trypVapor {
          0%   { opacity: 0;   transform: translateX(0)     scaleX(.4) }
          22%  { opacity: .5 }
          100% { opacity: 0;   transform: translateX(-60px) scaleX(1.6) }
        }
        @keyframes trypDrift { from { transform: translateX(0) } to { transform: translateX(-120vw) } }
        .tryp-plane  { animation: trypCruise 3.6s ease-in-out infinite; transform-origin: center }
        .tryp-vapor  { transform-box: fill-box; transform-origin: right center; animation: trypVapor 1.5s linear infinite }
        .tryp-cloud  { animation: trypDrift linear infinite }
        @media (prefers-reduced-motion: reduce) {
          .tryp-plane, .tryp-vapor, .tryp-cloud { animation: none }
          .tryp-vapor { opacity: .35 }
        }
      `}</style>

      {/* Drifting background clouds for a sense of flight */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="tryp-cloud absolute left-[80%] top-[24%] h-16 w-40 rounded-full bg-white/70 blur-md" style={{ animationDuration: '26s' }} />
        <div className="tryp-cloud absolute left-[95%] top-[62%] h-12 w-32 rounded-full bg-white/60 blur-md" style={{ animationDuration: '34s' }} />
        <div className="tryp-cloud absolute left-[70%] top-[78%] h-10 w-28 rounded-full bg-white/60 blur-md" style={{ animationDuration: '30s' }} />
      </div>

      <PlaneArt />

      <div className="relative max-w-sm">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">No connection</h1>
        <p className="mt-2 text-sm leading-relaxed text-smoke sm:text-base">
          It looks like you're on airplane mode, or just have no internet right now.
          Sit back — we'll reconnect you automatically the moment you're back.
        </p>
      </div>
    </div>
  )
}

// The Tryp.com 737: white fuselage, orange tail & cheatline, "tryp.com" titles,
// with animated vapour streaming from the engine and tail.
function PlaneArt() {
  return (
    <svg viewBox="0 0 360 200" className="relative w-[300px] max-w-full sm:w-[380px]" aria-label="Tryp.com plane" role="img">
      {/* Vapour trails (behind everything, streaming left from the engine/tail) */}
      <g fill="#ffffff">
        <rect className="tryp-vapor" x="70" y="126" width="80" height="5" rx="2.5" style={{ animationDelay: '0s' }} />
        <rect className="tryp-vapor" x="60" y="133" width="90" height="5" rx="2.5" style={{ animationDelay: '.5s' }} />
        <rect className="tryp-vapor" x="66" y="119" width="70" height="4" rx="2" style={{ animationDelay: '.9s' }} />
        <rect className="tryp-vapor" x="40" y="99" width="60" height="4" rx="2" style={{ animationDelay: '.3s' }} />
      </g>

      <g className="tryp-plane">
        {/* Tail fin (rear = left), orange */}
        <path d="M92 96 L70 52 L118 96 Z" fill="#d94407" />
        <circle cx="88" cy="74" r="4.5" fill="#ffffff" />
        {/* Horizontal stabiliser */}
        <path d="M84 100 L58 90 L92 104 Z" fill="#e0e6ee" />

        {/* Wing sweeping back (down-left) */}
        <path d="M188 116 L150 158 L206 118 Z" fill="#c9d2dd" />
        {/* Engine pod under the wing */}
        <g>
          <ellipse cx="158" cy="130" rx="17" ry="8.5" fill="#3a4757" />
          <ellipse cx="173" cy="130" rx="4" ry="8" fill="#1f2733" />
          <rect x="150" y="122.5" width="18" height="3" rx="1.5" fill="#d94407" />
        </g>

        {/* Fuselage */}
        <path
          d="M74 100 Q74 86 104 85 L250 85 Q286 87 300 100 Q286 113 250 115 L104 115 Q74 114 74 100 Z"
          fill="#ffffff" stroke="#e4e9f0" strokeWidth="1.5"
        />
        {/* Orange cheatline */}
        <path d="M92 106 Q200 108 288 103" stroke="#f5853f" strokeWidth="4" fill="none" strokeLinecap="round" />
        {/* Nose cockpit window */}
        <path d="M300 100 Q286 95 276 96 Q280 100 276 104 Q286 105 300 100 Z" fill="#2a3442" />
        {/* Cabin windows */}
        <g fill="#aebdce">
          {Array.from({ length: 15 }).map((_, i) => (
            <rect key={i} x={116 + i * 10} y="95.5" width="4.5" height="3.5" rx="1.2" />
          ))}
        </g>
        {/* Titles */}
        <text x="150" y="103" fontFamily="Poppins, Arial, sans-serif" fontWeight="800" fontSize="12" fill="#d94407" letterSpacing="0.3">tryp.com</text>
      </g>
    </svg>
  )
}
