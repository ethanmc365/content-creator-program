// YouTube: exact view count from the official Data API v3 (needs the key in private.config).
import { secrets, HttpError, getText, type Resolved, fail } from './shared.ts'

// ------------------------------------------------------------------ youtube
export function youtubeIdFrom(url: string): string | null {
  return (
    url.match(/[?&]v=([A-Za-z0-9_-]{11})/)?.[1] ??
    url.match(/youtu\.be\/([A-Za-z0-9_-]{11})/)?.[1] ??
    url.match(/\/(?:shorts|embed|live|v)\/([A-Za-z0-9_-]{11})/)?.[1] ??
    null
  )
}

export async function youtubeViews(url: string, meta = false): Promise<Resolved> {
  const base = { platform: 'YouTube' as const, approx: false }
  const id = youtubeIdFrom(url)
  if (!id) return fail(base, 'no_video_id', 'No YouTube video id in that link.')

  const canonicalUrl = `https://www.youtube.com/watch?v=${id}`
  const { youtube_api_key: key } = await secrets()
  if (!key) {
    return fail({ ...base, videoId: id, canonicalUrl }, 'needs_youtube_key',
      'YouTube blocks servers from reading its pages. Add a free YouTube Data API key.')
  }

  try {
    // `snippet` ONLY WHEN SOMEBODY ASKED FOR IT. `videos.list` is one quota unit
    // per call whatever parts are requested, so this is not about quota - it is
    // about the response, which grows from a few hundred bytes to several
    // kilobytes with a description in it. The sweep reads hundreds of rows an
    // hour and has no use for any of it.
    const parts = meta ? 'statistics,snippet' : 'statistics'
    const body = await getText(
      `https://www.googleapis.com/youtube/v3/videos?part=${parts}&id=${id}&key=${encodeURIComponent(key)}`,
    )
    const parsed = JSON.parse(body)
    const item = parsed?.items?.[0]
    const views = item?.statistics?.viewCount
    if (views != null) {
      const sn = item?.snippet
      return {
        ...base,
        videoId: id,
        canonicalUrl,
        views: Number(views),
        error: null,
        // The TITLE is the hook on YouTube, and the description is the
        // description - the opposite way round from Instagram and TikTok, where
        // one caption is both. Sending the title as the caption would be a lie
        // about which field it is, so both are joined in reading order and the
        // tracker's own `hook_from_caption` takes the first line, which is the
        // title. See migration 212.
        caption: sn ? [sn.title, sn.description].filter(Boolean).join('\n') || null : null,
        author: sn?.channelTitle ?? null,
        thumbnail: sn?.thumbnails?.high?.url ?? sn?.thumbnails?.default?.url ?? null,
        postedAt: sn?.publishedAt ?? null,
      }
    }
    return fail({ ...base, videoId: id, canonicalUrl }, 'no_video_id',
      'YouTube has no video with that id, or its owner has hidden its statistics.')
  } catch (e) {
    if (e instanceof HttpError && (e.status === 400 || e.status === 403)) {
      return fail({ ...base, videoId: id, canonicalUrl }, 'youtube_key_rejected',
        'YouTube rejected the API key. Check it is unrestricted, that the Data API v3 is enabled, and that the daily quota is not spent.')
    }
    return fail({ ...base, videoId: id, canonicalUrl }, 'fetch_failed', 'Could not reach the YouTube API.')
  }
}
