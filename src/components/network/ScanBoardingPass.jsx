import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, PlaneLoader } from '../ui'
import Icon from '../Icon'
import { cx, formatDate } from '../../lib/utils'
import { boardingPassToForm } from '../../lib/bcbp'
import { scanBarcode, scanNeedsDownload } from '../../lib/scanPass'
import { useT } from '../../lib/i18n'

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
  const tr = useT()
  const [mode, setMode] = useState('idle')       // idle | camera | working | found | failed | nocamera
  // A COARSE POINTER IS THE ONLY HONEST TEST FOR "HAS A CAMERA WORTH USING".
  // User-agent sniffing is a losing game and `mediaDevices` exists on every
  // laptop; what actually separates the two cases is whether the device is
  // held in a hand. Read once at mount rather than on every render.
  const [handheld] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches)
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
    // EXHAUSTIVE, because this is the one-shot path. The camera loop below
    // deliberately does not ask for it. See lib/scanPass.
    const raw = await scanBarcode(file, { exhaustive: true })
    if (!raw || !handle(raw)) setMode('failed')
  }

  async function startCamera() {
    setMode('working')
    try {
      // NO CAMERA IS NOT A FAILED SCAN, AND SAYING SO WAS THE BUG.
      //
      // On a laptop `getUserMedia` either throws outright or hands back a
      // webcam pointed at the person's face, and both landed in the same
      // 'failed' branch - so clicking "use the camera" on a desktop answered
      // "No boarding pass found. Make sure the whole barcode is in the picture
      // and in focus", which is advice about a photo that was never taken.
      if (!navigator.mediaDevices?.getUserMedia) { setMode('nocamera'); return }
      // `environment` is the back camera on a phone, which is the one pointed at
      // a boarding pass. Desktop ignores it and uses the only camera there is.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 } },
      })
      streamRef.current = stream
      // The <video> does not exist yet - it renders when `mode` becomes
      // 'camera'. Attaching the stream is done in the effect below, AFTER the
      // commit, rather than here. See the note there: doing it from a bare
      // requestAnimationFrame is what produced a black box.
      setMode('camera')
    } catch {
      setMode('nocamera')
    }
  }

  // ATTACHING THE STREAM, AND WHY THIS IS AN EFFECT.
  //
  // THE BUG: "trying to scan a physical boarding pass shows up the camera
  // screen but then just pure black." The stream was attached inside a single
  // `requestAnimationFrame` fired immediately after `setMode('camera')`. That
  // is a race. React batches the state update and commits when it is ready;
  // one animation frame is not a promise that the commit has happened, and on a
  // phone - slower, and often mid-scroll or mid-transition - it frequently had
  // not. `videoRef.current` was then still null, the callback hit its
  // `if (!v) return` guard, and nothing ever attached the stream to anything.
  // The element rendered, the modal looked right, and the box stayed black
  // forever with no error anywhere.
  //
  // An effect cannot lose that race: it runs after the commit, so the ref is
  // populated by definition. Keying it on `mode` also means it re-attaches if
  // the camera is stopped and started again, which the rAF version did not.
  //
  // `play()` is called AND `autoplay` is set on the element. Belt and braces on
  // purpose: iOS only autoplays a video that is `muted` and `playsinline`
  // (both set), and Safari has historically wanted the explicit call as well.
  // The promise is caught because a play interrupted by an immediate unmount
  // rejects, and that is not an error worth surfacing.
  useEffect(() => {
    if (mode !== 'camera') return undefined
    const v = videoRef.current
    const stream = streamRef.current
    if (!v || !stream) return undefined
    v.srcObject = stream
    const tryPlay = () => { v.play?.().catch(() => {}) }
    tryPlay()
    // Some browsers are not ready to play on the frame the source is set.
    v.addEventListener('loadedmetadata', tryPlay)
    return () => {
      v.removeEventListener('loadedmetadata', tryPlay)
      // Detach so a stopped stream is not left held by a hidden element.
      if (v.srcObject === stream) v.srcObject = null
    }
  }, [mode])

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
    <Modal open={open} onClose={onClose} title={tr("Scan a boarding pass")}>
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
                  <span className="block text-sm font-semibold text-ink">{tr("Choose a photo")}</span>
                  <span className="block text-xs text-smoke">{tr("Or a Wallet screenshot")}</span>
                </span>
              </button>
              <button onClick={startCamera} className="group flex items-center gap-3 rounded-card border border-gray-100 bg-white p-4 text-left shadow-card transition-all duration-200 hover:-translate-y-0.5 hover:border-brand/50 hover:shadow-lift">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand text-white transition-transform duration-200 group-hover:scale-110">
                  <Icon name="video" className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-ink">{tr("Use the camera")}</span>
                  <span className="block text-xs text-smoke">{handheld ? 'For a printed pass' : 'Best on your phone'}</span>
                </span>
              </button>
            </div>
            {heavy && (
              <p className="flex items-start gap-2 text-[11px] text-smoke">
                <Icon name="alert" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                {tr("The first scan on this device downloads a small reader, so give it a second.")}
              </p>
            )}
          </>
        )}

        {mode === 'working' && (
          <div className="flex justify-center py-10"><PlaneLoader label={tr("Reading the pass")} /></div>
        )}

        {mode === 'camera' && (
          <>
            <div className="relative overflow-hidden rounded-card bg-ink">
              <video ref={videoRef} playsInline muted autoPlay className="h-64 w-full object-cover" />
              {/* A frame to aim with. The barcode is a wide short strip along
                  the bottom of a boarding pass, so the guide is that shape
                  rather than a square. */}
              <span className="pointer-events-none absolute inset-x-6 top-1/2 h-20 -translate-y-1/2 rounded-lg border-2 border-white/70" aria-hidden />
            </div>
            <p className="text-center text-xs text-smoke">{tr("Line the barcode up inside the box.")}</p>
            <div className="flex justify-center">
              <button onClick={() => { stopCamera(); setMode('idle') }} className="btn-ghost text-sm">{tr("Stop")}</button>
            </div>
          </>
        )}

        {/* A FAILED READ NOW NAMES THE THING THAT USUALLY WORKS.
            It used to end at "type the flight in - it is only five fields",
            which is the last resort offered as the first one. The step that
            actually rescues most failures is going one rung UP in quality: a
            photograph of a paper pass, or of a phone screen, loses contrast and
            sharpness that the original digital pass still has. Ethan: "if a scan
            boarding pass is an error, like you can't really read it properly,
            just show up a message to try upload the digital boarding pass, and
            that might work, or just fill it in manually." Both, in that order. */}
        {mode === 'failed' && (
          <div className="py-4 text-center">
            <p className="text-sm font-semibold text-ink">{tr("No boarding pass found")}</p>
            <p className="mx-auto mt-1 max-w-sm text-sm text-smoke">
              {tr("Make sure the whole barcode is in the picture, in focus, and not cut off at the edges.")}
            </p>
            <p className="mx-auto mt-2 max-w-sm text-sm text-smoke">
              If it still will not read, try the digital pass instead: a screenshot straight from
              Apple Wallet or the airline app scans far more reliably than a photo of a printed one.
              Otherwise close this and type the flight in.
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <button onClick={() => fileRef.current?.click()} className="btn-primary text-sm">{tr("Choose a photo")}</button>
              <button onClick={() => setMode('idle')} className="btn-secondary text-sm">{tr("Back")}</button>
            </div>
          </div>
        )}

        {/* THE DESKTOP ANSWER, WHICH IS "DO THIS ON YOUR PHONE".
            A laptop webcam is fixed-focus, pointed at your face, and could not
            resolve a barcode even if you held the pass up to it. So this does
            not offer a retry - retrying is the one thing that cannot work.

            TWO THINGS WERE WRONG WITH IT AND BOTH ARE FIXED HERE.

            THE COPY LED WITH THE DIAGNOSIS. "There is no camera here that can
            read a barcode" is a sentence about the hardware, offered to somebody
            who asked to do a task, and it reads as the app apologising for
            itself. Ethan: "it shouldn't need to say that. Instead it should just
            say something simple like: open the app on your phone, open flight
            log, tap scan your boarding pass, the camera will then show up."
            So it is three steps in order, and the reason is dropped entirely -
            nobody needs to be told why their laptop is not a scanner.

            AND "CHOOSE A PHOTO" OPENED TWO THINGS AT ONCE. It called
            `setMode('idle')` AND `fileRef.click()`, so the file dialog came up
            over a screen that had just flipped back to the two option cards.
            Ethan: "whenever I click choose a photo, it actually shows up that
            choose a photo or use camera option again, but then also loads the
            choose a photo." It only opens the picker now; `pickFile` moves the
            mode on when a file actually arrives, and cancelling leaves this
            screen up with its own Back button, which is what should happen. */}
        {mode === 'nocamera' && (
          <div className="py-4 text-center">
            <p className="text-sm font-semibold text-ink">{tr("Use your phone for this one")}</p>
            <ol className="mx-auto mt-3 max-w-xs space-y-2 text-left text-sm text-smoke">
              {[
                'Open the app on your phone.',
                'Open the flight log.',
                'Tap "Scan your boarding pass".',
                'The camera opens. Scan the pass.',
              ].map((step, i) => (
                <li key={step} className="flex gap-2.5">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brand-tint text-[10px] font-bold text-brand">
                    {i + 1}
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
            <p className="mx-auto mt-4 max-w-sm text-sm text-smoke">
              On a computer you can still choose a photo of the pass, or a screenshot of it from
              Apple Wallet.
            </p>
            <div className="mt-4 flex justify-center gap-3">
              <button onClick={() => fileRef.current?.click()} className="btn-primary text-sm">{tr("Choose a photo")}</button>
              <button onClick={() => setMode('idle')} className="btn-secondary text-sm">{tr("Back")}</button>
            </div>
          </div>
        )}

        {mode === 'found' && result && (
          <>
            {/* WHAT IT READ, BEFORE ANYTHING IS WRITTEN. The date especially:
                the barcode says "day 195" and not which year. */}
            <div className="rounded-card border border-brand/25 bg-brand-tint/40 p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-brand">{tr("From")}</p>
                  <p className="text-2xl font-bold tracking-wider text-ink">{result.form.from_iata}</p>
                </div>
                <Icon name="plane" className="h-5 w-5 shrink-0 text-brand-light" />
                <div className="text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-brand">To</p>
                  <p className="text-2xl font-bold tracking-wider text-ink">{result.form.to_iata}</p>
                </div>
              </div>
              <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-brand/20 pt-3 text-center sm:grid-cols-4">
                {/* THE DATE WAS PRINTED AS ITS STORAGE FORMAT. `flown_on` is
                    an ISO string because that is what the column takes, and it
                    was going straight onto the card - so the one field this
                    screen exists to have CHECKED was displayed as "2026-08-18".
                    Ethan: "whenever I'm showing the date there, I'm showing it
                    back to front, like 2026 to the 18. Ensure it shows the date
                    normally, like it always does." `formatDate` is what the
                    rest of the app uses, and it gives "18 Aug 2026". */}
                {[
                  ['Airline', result.form.airline || '—'],
                  ['Flight', result.form.flight_number || '—'],
                  ['Seat', result.form.seat || '—'],
                  ['Date', result.form.flown_on ? formatDate(result.form.flown_on) : '—'],
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
              <button onClick={() => setMode('idle')} className="btn-ghost w-full justify-center sm:w-auto">{tr("Scan another")}</button>
              <button onClick={accept} className={cx('btn-primary w-full justify-center sm:w-auto')}>{tr("Fill the form")}</button>
            </div>
          </>
        )}

        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={pickFile} />
      </div>
    </Modal>
  )
}
