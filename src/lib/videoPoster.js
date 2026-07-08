// Capture a still poster frame from a video FILE (a local blob), before upload.
// Doing it on the local file means the canvas is same-origin and never tainted,
// so it works on every browser incl. iOS Safari - unlike capturing from the
// remote <video> at render time (which iOS blocks / paints black).
//
// CRITICAL iOS detail: a paused/seeked <video> does NOT decode a frame you can
// draw to a canvas - iOS only produces a real frame once the clip actually
// PLAYS. So we mount the element (muted, inline, hidden), play it a hair, grab
// the presented frame via requestVideoFrameCallback (or a timeupdate fallback),
// then stop. We upload the resulting JPEG next to the clip so chat/DMs can show
// a real preview and let the browser's own <video controls> handle playback.
//
// Returns a Blob (image/jpeg) or null on any failure (never throws - a missing
// poster just means the player falls back to the video's own frame).
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
    video.crossOrigin = 'anonymous'
    // iOS needs the element in the document to decode frames for canvas.
    video.style.cssText = 'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;pointer-events:none;'
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
        // Scale to <= 720px on the long edge; it's only a preview.
        const scale = Math.min(1, 720 / Math.max(vw, vh))
        const w = Math.round(vw * scale)
        const h = Math.round(vh * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d').drawImage(video, 0, 0, w, h)
        canvas.toBlob((b) => finish(b), 'image/jpeg', 0.7)
      } catch {
        finish(null)
      }
    }

    const startCapture = () => {
      // Prefer the exact "a frame was presented" signal when available.
      if ('requestVideoFrameCallback' in video) {
        video.requestVideoFrameCallback(() => grab())
      } else {
        const onTime = () => { if (video.currentTime > 0) { video.removeEventListener('timeupdate', onTime); grab() } }
        video.addEventListener('timeupdate', onTime)
      }
      // Play (muted) so iOS actually decodes a frame; if autoplay is blocked,
      // fall back to a seek + immediate grab.
      const p = video.play()
      if (p && typeof p.catch === 'function') {
        p.catch(() => { try { video.currentTime = 0.1 } catch { /* ignore */ } grab() })
      }
    }

    video.onloadeddata = startCapture
    video.onerror = () => finish(null)
    // Safety net so a stuck decode never blocks the send.
    setTimeout(() => { grab(); setTimeout(() => finish(null), 250) }, 2500)
  })
}

// The poster object lives next to the clip with a .jpg extension (same base
// name). Deriving it avoids an extra DB column: given a video URL/path we know
// where its poster is (keeps any ?token query on signed URLs).
export function posterPathFor(videoPathOrUrl) {
  return videoPathOrUrl.replace(/\.[^./?#]+(\?.*)?$/i, '.jpg$1')
}
