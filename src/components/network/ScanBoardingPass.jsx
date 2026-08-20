import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, PlaneLoader } from '../ui'
import Icon from '../Icon'
import { cx } from '../../lib/utils'
import { boardingPassToForm } from '../../lib/bcbp'
import { scanBarcode, scanNeedsDownload } from '../../lib/scanPass'

// ONE PHOTO INSTEAD OF FIVE FIELDS.
//
// The owner: "Auto-log from a boarding pass photo, the barcode on a boarding
// pass encodes origin, destination, flight number, seat and date. One photo
// fills the whole form. This is good with physical boarding passes and using
// the camera to scan it, but maybe you can also build in ability to upload
// photo of boarding pass or even virtual boarding pass like the screenshot from
// apple wallet."
//
// All three of those are the same operation - find a PDF417 or Aztec in an
// image - so there is one scanner with two ways in:
//
//   CAMERA   a live view with the decoder running a few times a second. This is
//            the one for a printed pass in your hand at the gate.
//   PHOTO    a file picker, which on a phone offers the camera roll. This is the
//            one for an Apple Wallet screenshot, and it is the case that will
//            actually get used most, because almost nobody has a paper pass any
//            more.
//
// WHY THE CAMERA IS NOT THE DEFAULT ON DESKTOP. A laptop webcam pointed at a
// phone screen reads a boarding pass barcode roughly never - the screen is too
// small in frame and the moire kills it. So the file picker leads everywhere
// and the camera is offered second.
//
// IT NEVER FILLS THE FORM SILENTLY. What it read is shown back first, because
// the one field it has to GUESS at is the date: a boarding pass barcode carries
// a day of the year and no year at all (see lib/bcbp). Getting that wrong by a
// year and writing it straight into somebody's log would be worse than not
// having the feature.

const TICK_MS = 400

export default function ScanBoardingPass({ open, onClose, onFilled, now }) {
  const [mode, setMode] = useState('idle')       // idle | camera | working | found | failed
  const [result, setResult] = useState(null)
  const videoRef = useRef(null)
  const streamRef = useRef(null)
  const fileRef = useRef(null)
  const [heavy] = useState(() => scanNeedsDownload())

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks?.().forEach((t) => t.stop())
    streamRef.current = null
  }, [])

  useEffect(() => {
    if (!open) { stopCamera(); setMode('idle'); setResult(null) }
  }, [open, stopCamera])
  useEffect(() => stopCamera, [stopCamera])

  const handle = useCallback((raw) => {
    const out = boardingPassToForm(raw, now || new Date())
    if (!out) { setMode('failed'); return false }
    setResult(out)
    setMode('found')
    stopCamera()
    return true
  }, [now, stopCamera])

  async function pickFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setMode('working')
    const raw = await scanBarcode(file)
    if (!raw || !handle(raw)) setMode('failed')
  }

  async function startCamera() {
    setMode('working')
    try {
      // `environment` is the back camera on a phone, which is the one pointed at
      // a boarding pass. Desktop ignores it and uses the only camera there is.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
      })
      streamRef.current = stream
      setMode('camera')
      // The element only exists once `camera` has rendered.
      requestAnimationFrame(() => {
        const v = videoRef.current
        if (!v) return
        v.srcObject = stream
        v.play?.().catch(() => {})
      })
    } catch {
      setMode('failed')
    }
  }

  // The live loop. An interval rather than rAF: decoding is expensive and there
  // is nothing to gain from trying sixty times a second when a hand holding a
  // piece of card moves at about two.
  useEffect(() => {
    if (mode !== 'camera') return undefined
    let alive = true
    let busy = false
    const id = setInterval(async () => {
      if (!alive || busy) return
      const v = videoRef.current
      if (!v || v.readyState < 2) return
      busy = true
      const raw = await scanBarcode(v)
      busy = false
      if (alive && raw) handle(raw)
    }, TICK_MS)
    return () => { alive = false; clearInterval(id) }
  }, [mode, handle])

  function accept() {
    onFilled?.(result.form, result.parsed)
    onClose()
  }

  return (
    <Modal open={open} onClose={onClose} title="Scan a boarding pass">
      <div className="space-y-5">
        {mode === 'idle' && (
          <>
            <p className="text-sm text-smoke">
              Point the camera at the barcode, or pick a photo. A screenshot of the pass in Apple
              Wallet works just as well as a paper one.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <button onClick={() => fileRef.current?.click()} className="group flex items-center gap-3 rounded-card border border-gray-100 bg-white p-4 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-lift">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand text-white transition-transform duration-200 group-hover:scale-110">
                  <Icon name="image" className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">Choose a photo</span>
                  <span className="block text-xs text-smoke">Or a Wallet screenshot</span>
                </span>
              </button>
              <button onClick={startCamera} className="group flex items-center gap-3 rounded-card border border-gray-100 bg-white p-4 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-lift">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand text-white transition-transform duration-200 group-hover:scale-110">
                  <Icon name="video" className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">Use the camera</span>
                  <span className="block text-xs text-smoke">For a printed pass</span>
                </span>
              </button>
            </div>
            {heavy && (
              <p className="flex items-start gap-2 text-[11px] text-smoke">
                <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                The first scan on this device downloads a small reader, so give it a second.
              </p>
            )}
          </>
        )}

        {mode === 'working' && (
          <div className="flex justify-center py-10"><PlaneLoader label="Reading the pass" /></div>
        )}

        {mode === 'camera' && (
          <>
            <div className="relative overflow-hidden rounded-card bg-ink">
              <video ref={videoRef} playsInline muted className="h-64 w-full object-cover" />
              {/* A frame to aim with. The barcode is a wide short strip along
                  the bottom of a boarding pass, so the guide is that shape
                  rather than a square. */}
              <span className="pointer-events-none absolute inset-x-6 top-1/2 h-20 -translate-y-1/2 rounded-lg border-2 border-white/70" aria-hidden />
            </div>
            <p className="text-center text-xs text-smoke">Line the barcode up inside the box.</p>
            <div className="flex justify-center">
              <button onClick={() => { stopCamera(); setMode('idle') }} className="btn-ghost text-sm">Stop</button>
            </div>
          </>
        )}

        {mode === 'failed' && (
          <div className="py-4 text-center">
            <p className="text-sm font-semibold text-ink">No boarding pass found</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-smoke">
              Make sure the whole barcode is in the picture and in focus. If it still will not read,
              close this and type the flight in - it is only five fields.
            </p>
            <button onClick={() => setMode('idle')} className="btn-secondary mt-4 text-sm">Try again</button>
          </div>
        )}

        {mode === 'found' && result && (
          <>
            {/* WHAT IT READ, BEFORE ANYTHING IS WRITTEN. The date especially:
                the barcode says "day 195" and not which year. */}
            <div className="rounded-card border border-brand/25 bg-brand-tint/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-brand">From</p>
                  <p className="text-2xl font-bold tracking-wider text-ink">{result.form.from_iata}</p>
                </div>
                <Icon name="plane" className="h-5 w-5 shrink-0 text-brand-light" />
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-brand">To</p>
                  <p className="text-2xl font-bold tracking-wider text-ink">{result.form.to_iata}</p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-3 gap-3 border-t border-brand/20 pt-3 text-center">
                {[
                  ['Flight', result.form.flight_number || '—'],
                  ['Seat', result.form.seat || '—'],
                  ['Date', result.form.flown_on || '—'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[10px] font-semibold uppercase tracking-widest text-smoke">{k}</dt>
                    <dd className="text-sm font-semibold text-ink">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
            <p className="flex items-start gap-2 text-xs text-smoke">
              <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand" />
              A boarding pass barcode carries the day of the year but not the year, so check the
              date. Everything else came straight off the pass.
            </p>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <button onClick={() => setMode('idle')} className="btn-ghost w-full justify-center sm:w-auto">Scan another</button>
              <button onClick={accept} className={cx('btn-primary w-full justify-center sm:w-auto')}>Fill the form</button>
            </div>
          </>
        )}

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
      </div>
    </Modal>
  )
}
