// Capture a still poster frame from a video FILE (a local blob), before upload,
// so chat/DMs can show a real preview and let the browser's own <video controls>
// handle playback. Capturing from the local file keeps the canvas same-origin
// (never tainted), unlike capturing from the remote <video> at render time.
//
// iOS is the hard part, and there are TWO traps:
//   1. A <video> that is display:none / opacity:0 / offscreen does NOT decode
//      real pixels on iOS - drawImage() just yields BLACK. So the element must
//      be genuinely rendered. We make it 2px at opacity 0.01 in the corner:
//      technically painted (so iOS decodes) but imperceptible.
//   2. iOS only produces a frame once the clip actually PLAYS, and the first
//      presented frame(s) can still be black (decoder warm-up). So we play it
//      muted and grab a frame a few frames in / past ~0.1s of media time.
//
// Returns a Blob (image/jpeg) or null on any failure (never throws).
export function captureVideoPoster(file) {
  return new Promise((resolve) => {
    let url
    try {
      url = URL.createObjectURL(file)
    } catch {
      resolve(null)
      return
    }

    const video = document.createElement('video')
    video.muted = true
    video.defaultMuted = true
    video.playsInline = true
    video.setAttribute('muted', '')
    video.setAttribute('playsinline', '')
    video.preload = 'auto'
    // Rendered but invisible: iOS won't decode a fully-hidden video.
    video.style.cssText = 'position:fixed;left:0;top:0;width:2px;height:2px;opacity:0.01;pointer-events:none;z-index:2147483647;border:0;'
    document.body.appendChild(video)
    video.src = url

    let done = false
    const finish = (blob) => {
      if (done) return
      done = true
      try { video.pause() } catch { /* ignore */ }
      try { video.removeAttribute('src'); video.load() } catch { /* ignore */ }
      try { video.remove() } catch { /* ignore */ }
      try { URL.revokeObjectURL(url) } catch { /* ignore */ }
      resolve(blob || null)
    }

    const grab = () => {
      if (done) return
      try {
        const vw = video.videoWidth
        const vh = video.videoHeight
        if (!vw || !vh) return
        const scale = Math.min(1, 720 / Math.max(vw, vh))
        const w = Math.round(vw * scale)
        const h = Math.round(vh * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(video, 0, 0, w, h)
        canvas.toBlob((b) => finish(b), 'image/jpeg', 0.72)
      } catch {
        finish(null)
      }
    }

    let frames = 0
    const useRVFC = 'requestVideoFrameCallback' in video
    const onFrame = (_now, meta) => {
      if (done) return
      frames += 1
      // Wait a few presented frames AND ~0.1s of media time so we skip the
      // black decoder warm-up, then grab.
      const t = meta?.mediaTime ?? video.currentTime
      if (frames >= 3 && t >= 0.08) return grab()
      video.requestVideoFrameCallback(onFrame)
    }

    const start = () => {
      if (useRVFC) video.requestVideoFrameCallback(onFrame)
      else {
        const onTime = () => { if (video.currentTime >= 0.12) { video.removeEventListener('timeupdate', onTime); grab() } }
        video.addEventListener('timeupdate', onTime)
      }
      const p = video.play()
      if (p && typeof p.catch === 'function') {
        p.catch(() => { try { video.currentTime = 0.12 } catch { /* ignore */ } setTimeout(grab, 120) })
      }
    }

    video.onloadeddata = start
    video.onerror = () => finish(null)
    // Safety net: grab whatever we have, then give up, so a stuck decode never
    // blocks the send.
    setTimeout(() => { grab(); setTimeout(() => finish(null), 300) }, 3000)
  })
}

// The poster object lives next to the clip with a .jpg extension (same base
// name). Deriving it avoids an extra DB column: given a video URL/path we know
// where its poster is (keeps any ?token query on signed URLs).
export function posterPathFor(videoPathOrUrl) {
  return videoPathOrUrl.replace(/\.[^./?#]+(\?.*)?$/i, '.jpg$1')
}
