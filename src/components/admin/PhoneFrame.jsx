import { useEffect, useRef, useState } from 'react'

// A REAL IPHONE TO PREVIEW ON (4 Oct 2026). 393 x 852 points (the 15 / 16 Pro), drawn at that size with its dynamic island and a clock and
// signal in the status bar, and scaled down as one piece when the column is narrower, so what is inside is laid out exactly as it is on a phone.
// The survey preview built this first; the VIP announcement preview uses it too, so both read as the same device. `children` is the app's
// screen, below the status bar.
export const PHONE = { w: 393, h: 852 }

export default function PhoneFrame({ children, maxH }) {
  const ref = useRef(null)
  const [room, setRoom] = useState(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const measure = () => setRoom(el.clientWidth)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const frameW = PHONE.w + 18
  const scale = room ? Math.min(1, room / frameW, maxH ? maxH / (PHONE.h + 18) : 1) : 1
  return (
    <div ref={ref} className="mx-auto w-full" style={{ maxWidth: frameW }}>
      <div style={{ width: frameW * scale, height: (PHONE.h + 18) * scale }} className="mx-auto">
        <div className="rounded-[3.4rem] bg-ink p-[9px] shadow-lift" style={{ width: frameW, transform: `scale(${scale})`, transformOrigin: 'top left' }}>
          <div className="relative overflow-hidden rounded-[2.8rem] bg-cloud" style={{ width: PHONE.w, height: PHONE.h }}>
            <div className="relative flex items-center justify-between px-8 pb-1 pt-4 text-[15px] font-semibold text-ink" aria-hidden>
              <span>9:41</span>
              <span className="absolute left-1/2 top-2.5 h-[34px] w-[118px] -translate-x-1/2 rounded-full bg-ink" />
              <span className="flex items-center gap-1.5"><span className="flex items-end gap-[2px]">{[5, 8, 11, 14].map((h) => <span key={h} className="w-[3px] rounded-sm bg-ink" style={{ height: h }} />)}</span><span className="h-3 w-6 rounded-[4px] border border-ink/70 p-[1px]"><span className="block h-full w-4/5 rounded-[2px] bg-ink" /></span></span>
            </div>
            <div className="px-4 pt-2">{children}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
