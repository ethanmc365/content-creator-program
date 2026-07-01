import { useEffect, useState } from 'react'

// A friendly full-screen takeover when the device loses its connection: a calm
// sky, a Tryp.com-branded 737 cruising with smoke trailing from the engine, and
// a short reassuring message. It clears itself the moment we're back online.
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
        @keyframes trypCruise { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-9px) } }
        @keyframes trypSmoke {
          0%   { opacity: 0;   transform: translate(0,0)       scale(.45) }
          25%  { opacity: .5 }
          100% { opacity: 0;   transform: translate(52px,-7px) scale(2) }
        }
        @keyframes trypDrift { from { transform: translateX(0) } to { transform: translateX(-120vw) } }
        .tryp-plane { animation: trypCruise 3.6s ease-in-out infinite; transform-origin: center }
        .tryp-smoke { transform-box: fill-box; transform-origin: center; animation: trypSmoke 1.7s linear infinite }
        .tryp-cloud { animation: trypDrift linear infinite }
        @media (prefers-reduced-motion: reduce) {
          .tryp-plane, .tryp-smoke, .tryp-cloud { animation: none }
          .tryp-smoke { opacity: .3 }
        }
      `}</style>

      {/* Drifting background clouds for a sense of flight */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="tryp-cloud absolute left-[85%] top-[22%] h-16 w-40 rounded-full bg-white/70 blur-md" style={{ animationDuration: '27s' }} />
        <div className="tryp-cloud absolute left-[96%] top-[60%] h-12 w-32 rounded-full bg-white/60 blur-md" style={{ animationDuration: '35s' }} />
        <div className="tryp-cloud absolute left-[72%] top-[80%] h-10 w-28 rounded-full bg-white/60 blur-md" style={{ animationDuration: '31s' }} />
      </div>

      <PlaneArt />

      <div className="relative max-w-sm">
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">No connection</h1>
        <p className="mt-2 text-sm leading-relaxed text-smoke sm:text-base">
          It looks like you're on airplane mode, or just have no internet right now.
          Sit back and we'll reconnect you automatically the moment you're back.
        </p>
      </div>
    </div>
  )
}

// A 737 in Tryp.com livery (nose left), white with orange trim, "tryp.com"
// titles and a paper-plane emblem on the tail, smoke puffing from the engine.
function PlaneArt() {
  return (
    <svg viewBox="0 0 440 160" className="relative w-[330px] max-w-full sm:w-[440px]" aria-label="Tryp.com plane" role="img">
      {/* Engine smoke (behind the plane, trailing right from the exhaust) */}
      <g fill="#c3ccd6">
        {[0, 0.34, 0.68, 1.02, 1.36].map((d, i) => (
          <circle key={i} className="tryp-smoke" cx="205" cy="112" r={5 + (i % 3)} style={{ animationDelay: `${d}s` }} />
        ))}
      </g>

      <g className="tryp-plane">
        {/* Tail fin (rear = right), orange, swept back */}
        <path d="M298 66 L366 15 L392 18 Q400 20 395 32 L372 66 Z" fill="#d94407" />
        {/* Paper-plane emblem on the tail (the app's plane glyph, white) */}
        <path
          d="M360 30 L343 27 A22 22 0 01352 40 L356 35 Z M360 30 L349 41 L351 47 Z"
          fill="#ffffff" opacity="0.95"
        />
        {/* Horizontal stabiliser */}
        <path d="M336 82 L388 76 L386 85 L340 88 Z" fill="#e0e6ee" />

        {/* Fuselage */}
        <path
          d="M30 84 C34 74 60 66 96 65 L300 65 Q352 65 398 52 Q378 74 328 88 L300 90 L96 92 C58 92 40 92 30 84 Z"
          fill="#ffffff" stroke="#dfe5ee" strokeWidth="1.5"
        />
        {/* Orange cheatline along the lower fuselage */}
        <path d="M40 88 C90 90 150 89 300 86 Q350 84 384 74" stroke="#f5853f" strokeWidth="4.5" fill="none" strokeLinecap="round" />
        {/* Nose cockpit windows */}
        <path d="M44 74 L58 71 L60 78 L46 80 Z" fill="#2a3442" />

        {/* Cabin windows */}
        <g fill="#9fb0c2">
          {Array.from({ length: 20 }).map((_, i) => (
            <rect key={i} x={92 + i * 10} y="73.5" width="4.5" height="4" rx="1.2" />
          ))}
        </g>
        {/* Titles */}
        <text x="112" y="86" fontFamily="Poppins, Arial, sans-serif" fontWeight="800" fontSize="19" fill="#d94407" letterSpacing="0.4">tryp.com</text>
        <text x="322" y="83" fontFamily="Poppins, Arial, sans-serif" fontWeight="600" fontSize="6.5" fill="#9aa4b0">EI-TRYP</text>

        {/* Wing sweeping back and a winglet */}
        <path d="M186 90 L262 126 L280 126 L214 90 Z" fill="#cdd6e1" stroke="#bcc6d3" strokeWidth="1" />
        <path d="M270 126 L288 114 L293 118 L278 128 Z" fill="#d94407" />

        {/* Engine nacelle under the wing (intake left, exhaust right) */}
        <g>
          <path d="M150 102 Q150 94 170 94 L192 94 Q210 94 210 104 Q210 116 192 116 L170 116 Q150 116 150 102 Z" fill="#5b6675" />
          <path d="M150 102 Q150 94 170 94 L172 94 Q156 96 156 104 Q156 114 172 116 L170 116 Q150 116 150 102 Z" fill="#d94407" />
          <ellipse cx="205" cy="105" rx="4" ry="9" fill="#39424f" />
          {/* pylon to the wing/fuselage */}
          <path d="M182 94 L188 88 L196 88 L192 94 Z" fill="#c9d2dd" />
        </g>
      </g>
    </svg>
  )
}
