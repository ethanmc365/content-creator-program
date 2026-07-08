// Capture a still poster frame from a video FILE (a local blob), before upload,
// so chat/DMs can show a real preview while the browser's own <video controls>
// handles playback. Capturing from the local file keeps the canvas same-origin
// (never tainted), unlike capturing from the remote <video> at render time.
//
// iOS is the hard part. To get a NON-BLACK frame there:
//   * the <video> must be genuinely rendered - a display:none / opacity:0 /
//     tiny (1-2px) element does NOT decode real pixels, so drawImage yields
//     black. We render it at a real size (200px) but at opacity 0.01 (visually
//     imperceptible) so iOS actually decodes it.
//   * iOS only produces frames once the clip PLAYS, and the first frames are a
//     black decoder warm-up. So we play it muted briefly, then SEEK to a
//     content frame (~a third in) and capture on `seeked` - a seek forces that
//     exact frame to render.
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
    // Real size but ~invisible: iOS won't decode a hidden/tiny video.
    video.style.cssText = 'position:fixed;left:0;top:0;width:200px;height:auto;opacity:0.01;pointer-events:none;z-index:2147483647;border:0;'
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

    let seeked = false
    const doSeek = () => {
      if (seeked || done) return
      seeked = true
      try { video.pause() } catch { /* ignore */ }
      const dur = video.duration
      const t = dur && isFinite(dur) ? Math.min(0.6, dur / 3) : 0.2
      video.addEventListener('seeked', grab, { once: true })
      // If the seek doesn't fire (some browsers), grab whatever's rendered.
      setTimeout(grab, 400)
      try { video.currentTime = t } catch { grab() }
    }

    video.onloadeddata = () => {
      // Play muted to warm up the decoder / force iOS to render frames, then
      // seek to a content frame and capture it.
      const p = video.play()
      if (p && typeof p.then === 'function') {
        p.then(() => setTimeout(doSeek, 150)).catch(() => doSeek())
      } else {
        setTimeout(doSeek, 150)
      }
    }
    video.onerror = () => finish(null)
    // Safety net so a stuck decode never leaves the promise hanging.
    setTimeout(() => { grab(); setTimeout(() => finish(null), 300) }, 4000)
  })
}

// The poster object lives next to the clip with a .jpg extension (same base
// name). Deriving it avoids an extra DB column: given a video URL/path we know
// where its poster is (keeps any ?token query on signed URLs).
export function posterPathFor(videoPathOrUrl) {
  return videoPathOrUrl.replace(/\.[^./?#]+(\?.*)?$/i, '.jpg$1')
}
