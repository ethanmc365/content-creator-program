// Helpers for rendering + saving attachment files (resource library, chat).

const IMAGE_EXT = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif', 'bmp', 'svg']
const VIDEO_EXT = ['mp4', 'mov', 'webm', 'm4v', 'ogv', 'ogg', 'mkv']

// Best-effort file type from a URL: 'image' | 'video' | 'file'. Strips any
// query string first so signed/public URLs still classify correctly.
export function mediaType(url) {
  if (!url) return 'file'
  const ext = url.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase()
  if (IMAGE_EXT.includes(ext)) return 'image'
  if (VIDEO_EXT.includes(ext)) return 'video'
  return 'file'
}

export function fileNameFromUrl(url) {
  try {
    return decodeURIComponent(url.split('?')[0].split('/').pop()) || 'download'
  } catch {
    return 'download'
  }
}

// Save a remote file. On mobile this opens the native share sheet, whose
// "Save Image"/"Save Video" action drops the file into the camera roll (and
// also offers sharing to other apps). Falls back to a plain download on desktop
// or where file-sharing isn't supported. Returns true on success/started.
export async function saveFile(url, filename = fileNameFromUrl(url)) {
  // Fetch the bytes so we can hand a real File to the share sheet (a bare URL
  // share only offers "Copy link", never "Save to camera roll").
  let blob = null
  try {
    const res = await fetch(url, { mode: 'cors' })
    if (res.ok) blob = await res.blob()
  } catch {
    // CORS/network failure - fall through to opening the URL directly.
  }

  if (blob) {
    const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' })
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
        return true
      } catch (err) {
        if (err?.name === 'AbortError') return true // user dismissed the sheet
        // otherwise fall through to a normal download
      }
    }
    const objUrl = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = objUrl
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(objUrl)
    return true
  }

  // Last resort: open the file in a new tab so the user can long-press → Save.
  window.open(url, '_blank', 'noopener,noreferrer')
  return false
}
