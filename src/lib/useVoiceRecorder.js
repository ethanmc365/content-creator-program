import { useCallback, useRef, useState } from 'react'

// MediaRecorder wrapper for WhatsApp-style voice notes. Picks a mime the browser
// actually supports (iOS Safari records audio/mp4, Chrome audio/webm), tracks
// elapsed seconds, and resolves stop() with the finished blob + duration.
function pickMime() {
  const MR = typeof window !== 'undefined' ? window.MediaRecorder : null
  if (!MR?.isTypeSupported) return ''
  for (const t of ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg']) {
    if (MR.isTypeSupported(t)) return t
  }
  return ''
}

export function useVoiceRecorder() {
  const [recording, setRecording] = useState(false)
  const [seconds, setSeconds] = useState(0)
  const recRef = useRef(null)
  const streamRef = useRef(null)
  const chunksRef = useRef([])
  const timerRef = useRef(null)
  const startRef = useRef(0)
  const resolveRef = useRef(null)

  const teardown = useCallback(() => {
    clearInterval(timerRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    recRef.current = null
  }, [])

  const start = useCallback(async () => {
    if (recRef.current) return
    let stream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      throw new Error('Microphone access is needed to record a voice note.')
    }
    streamRef.current = stream
    const mime = pickMime()
    const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
    chunksRef.current = []
    mr.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data) }
    mr.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: mr.mimeType || 'audio/webm' })
      const secs = Math.max(1, Math.round((Date.now() - startRef.current) / 1000))
      teardown()
      setRecording(false)
      setSeconds(0)
      const resolve = resolveRef.current
      resolveRef.current = null
      resolve?.({ blob, seconds: secs })
    }
    recRef.current = mr
    startRef.current = Date.now()
    mr.start()
    setSeconds(0)
    setRecording(true)
    timerRef.current = setInterval(() => setSeconds((s) => s + 1), 1000)
  }, [teardown])

  // Stop recording and resolve with { blob, seconds }. Null if nothing recorded.
  const stop = useCallback(() => new Promise((resolve) => {
    if (!recRef.current) { resolve(null); return }
    resolveRef.current = resolve
    recRef.current.stop()
  }), [])

  // Abort without producing a blob (discard).
  const cancel = useCallback(() => {
    const mr = recRef.current
    if (mr) { mr.onstop = null; try { mr.stop() } catch { /* already stopped */ } }
    teardown()
    setRecording(false)
    setSeconds(0)
  }, [teardown])

  return { recording, seconds, start, stop, cancel }
}
