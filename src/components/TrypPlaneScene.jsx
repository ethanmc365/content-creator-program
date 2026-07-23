// The Tryp.com plane cruising through cartoon clouds, with a title + subtitle
// beneath. Shared by the offline takeover and the onboarding submit screen so
// both feel like the same branded moment. (The plane artwork has a white
// background, so the screen stays white for a seamless blend; the clouds are
// outlined so they still read against it.)

const CLOUDS = [
  { top: '6%', scale: 1.2, dur: 33, delay: -4, o: 0.95 },
  { top: '16%', scale: 0.75, dur: 24, delay: -15, o: 0.9 },
  { top: '24%', scale: 1.4, dur: 20, delay: -2, o: 0.72 },
  { top: '45%', scale: 0.9, dur: 16, delay: -9, o: 0.72 },
  { top: '12%', scale: 0.55, dur: 28, delay: -21, o: 0.85 },
]

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

export default function TrypPlaneScene({ title, subtitle, children }) {
  return (
    <div className="fixed inset-0 z-[100] overflow-hidden bg-white">
      <style>{`
        @keyframes trypCruise {
          0%,100% { transform: translate(0,0) rotate(-0.5deg) }
          50%     { transform: translate(-8px,-12px) rotate(0.5deg) }
        }
        @keyframes trypCloud { from { transform: translateX(-45vw) } to { transform: translateX(120vw) } }
        .tryp-plane { animation: trypCruise 4s ease-in-out infinite; transform-origin: center }
        .tryp-cloud { position: absolute; left: 0; pointer-events: none; animation: trypCloud linear infinite }
        @media (prefers-reduced-motion: reduce) {
          .tryp-plane, .tryp-cloud { animation: none }
        }
      `}</style>

      {/* Centered plane + message */}
      <div className="relative z-10 flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="tryp-plane relative w-[320px] max-w-full sm:w-[460px]">
          <img src="/brand/tryp-plane.png" alt="Tryp.com plane" className="relative z-10 w-full" />
        </div>
        <div className="max-w-sm">
          <h1 className="text-2xl font-bold text-ink sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-2 text-sm leading-relaxed text-smoke sm:text-base">{subtitle}</p>}
          {children}
        </div>
      </div>

      {/* Cartoon clouds passing in front of the plane */}
      <div className="pointer-events-none absolute inset-0 z-20" aria-hidden="true">
        {CLOUDS.map((c, i) => (
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
