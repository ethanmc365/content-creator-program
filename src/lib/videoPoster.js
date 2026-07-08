// Capture a still poster frame from a video FILE (a local blob), before upload.
// Doing it on the local file means the canvas is same-origin and never tainted,
// so it works on every browser incl. iOS Safari - unlike capturing from the
// remote <video> at render time (which iOS blocks / paints black). We upload the
// resulting JPEG next to the clip so the chat can show a real thumbnail and let
// the browser's own <video controls> handle playback.
//
// Returns a Blob (image/jpeg) or null if anything goes wrong (never throws - a
// missing poster just means the player falls back to the video's own frame).
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
    video.playsInline = true
    video.preload = 'auto'
    video.src = url

    let done = false
    const finish = (blob) => {
      if (done) return
      done = true
      try { URL.revokeObjectURL(url) } catch { /* ignore */ }
      resolve(blob || null)
    }

    const grab = () => {
      try {
        const vw = video.videoWidth
        const vh = video.videoHeight
        if (!vw || !vh) return finish(null)
        // Scale the poster down to <= 720px on the long edge - it's only a
        // preview, so there's no need to store a full-resolution still.
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

    // Seek a hair into the clip so we don't grab an all-black leading frame.
    video.onloadeddata = () => {
      if (video.currentTime >= 0.1) return grab()
      video.onseeked = grab
      try { video.currentTime = 0.1 } catch { grab() }
    }
    video.onerror = () => finish(null)
    // Safety timeout so a stuck decode never blocks the send.
    setTimeout(() => finish(null), 3000)
  })
}

// The poster object lives next to the clip with a .jpg extension (same base
// name). Deriving it keeps us from needing an extra DB column: given a video
// URL/path we know where its poster is.
export function posterPathFor(videoPathOrUrl) {
  return videoPathOrUrl.replace(/\.[^./?#]+(\?.*)?$/i, '.jpg$1')
}
