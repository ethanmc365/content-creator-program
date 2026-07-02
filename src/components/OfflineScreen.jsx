import { useEffect, useState } from 'react'

// A friendly full-screen takeover when the device loses its connection: the
// Tryp.com plane cruising across a clean sky with contrails streaming behind it,
// and a short reassuring message. Clears itself the moment we're back online.
// (The plane artwork has a white background, so the screen is kept white for a
// seamless blend.)
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
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center gap-6 overflow-hidden bg-white px-6 text-center">
      <style>{`
        @keyframes trypCruise {
          0%,100% { transform: translate(0,0) rotate(-0.5deg) }
          50%     { transform: translate(-8px,-12px) rotate(0.5deg) }
        }
        @keyframes trypContrail { from { background-position: 0 0 } to { background-position: 40px 0 } }
        @keyframes trypDrift { from { transform: translateX(0) } to { transform: translateX(-120vw) } }
        .tryp-plane { animation: trypCruise 4s ease-in-out infinite; transform-origin: center }
        .tryp-contrail {
          position: absolute; height: 7px; border-radius: 999px; pointer-events: none;
          background: repeating-linear-gradient(90deg, rgba(150,192,228,.85) 0 20px, rgba(150,192,228,0) 20px 40px);
          -webkit-mask-image: linear-gradient(90deg, #000, #000 15%, transparent);
          mask-image: linear-gradient(90deg, #000, #000 15%, transparent);
          animation: trypContrail 1.1s linear infinite;
        }
        .tryp-cloud { animation: trypDrift linear infinite }
        @media (prefers-reduced-motion: reduce) {
          .tryp-plane, .tryp-contrail, .tryp-cloud { animation: none }
        }
      `}</style>

      {/* Drifting soft clouds for a hint of sky */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="tryp-cloud absolute left-[88%] top-[20%] h-16 w-44 rounded-full bg-[#e7f1fb] blur-xl" style={{ animationDuration: '28s' }} />
        <div className="tryp-cloud absolute left-[98%] top-[66%] h-12 w-32 rounded-full bg-[#eaf3fb] blur-xl" style={{ animationDuration: '36s' }} />
        <div className="tryp-cloud absolute left-[74%] top-[84%] h-10 w-28 rounded-full bg-[#eaf3fb] blur-xl" style={{ animationDuration: '32s' }} />
      </div>

      {/* Plane + contrails (both bob together for a "cruising" feel) */}
      <div className="tryp-plane relative w-[320px] max-w-full sm:w-[460px]">
        <span className="tryp-contrail" style={{ top: '41%', left: '90%', width: '50%', animationDelay: '0s' }} aria-hidden="true" />
        <span className="tryp-contrail" style={{ top: '49%', left: '91%', width: '55%', animationDelay: '.4s' }} aria-hidden="true" />
        <img src="/brand/tryp-plane.png" alt="Tryp.com plane" className="relative z-10 w-full" />
      </div>

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
