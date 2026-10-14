// Automatic view counts: the client side of the `view-sync` Edge Function.
//
// The function reads a challenge entry's view count off the page the creator
// linked to (see supabase/functions/view-sync/index.ts). Everything here is
// admin-only at the server; these helpers exist so the admin panel and the
// Testing Centre call it the same way and read the same vocabulary of errors.
import { supabase } from './supabase'
import { teamApi } from '../api/team'
import { settingsApi } from '../api/settings'

// What the sync can come back with, in the words an admin should see. The keys
// are the `views_sync_error` values the function writes onto a submission, so a
// stale row explains itself long after the run that produced it.
// Every error code the view reader (edge function view-sync) stores on an entry, in plain English: what happened
// (`hint`) and what the team should do about it (`action`). Shown on the results page, the sync panel and the video
// tracker. A code missing here still shows, with the generic fallback in describeSyncError.
export const SYNC_ERRORS = {
  needs_youtube_key: {
    label: 'YouTube key needed',
    hint: 'YouTube blocks servers from reading its pages, so YouTube links need a free YouTube Data API key.',
    action: 'Add the key under Admin > Platform connections. These entries fill in on the next run.',
  },
  youtube_key_rejected: {
    label: 'YouTube key rejected',
    hint: 'YouTube refused the stored key.',
    action: 'Check the key is valid and unrestricted and that the YouTube Data API v3 is switched on for its project.',
  },
  not_a_video: {
    label: 'Photo or carousel post',
    hint: 'That post is not a video, so it has no view count.',
    action: 'If the creator meant to enter a video, ask them for the right link. Otherwise it can stay on zero or be disqualified.',
  },
  write_failed: {
    label: 'Could not save',
    hint: 'The number was read, but writing it to the entry failed.',
    action: 'Nothing to do: it is retried on the next run. If it keeps happening, check the admin desk for a database alert.',
  },
  not_on_reels_tab: {
    label: 'Not on the public reels tab',
    hint: 'Instagram counts are read off the creator\'s public reels tab, and this one is not there: a private account, a feed video rather than a reel, or a reel too far back to reach.',
    action: 'Ask the creator for the number (a screenshot) and type it in.',
  },
  no_video_id: {
    label: 'Link does not open a video',
    hint: 'No video could be reached at this link.',
    action: 'Open the link. If the video is gone, disqualify the entry; if it plays, type the views in from the post.',
  },
  no_count_in_page: {
    label: 'No view count on the post',
    hint: 'The post opened but states no view count. Photo and text posts have none.',
    action: 'If it is a video, type the views in from the post or a screenshot.',
  },
  removed: {
    label: 'Video deleted',
    hint: 'The platform says this video has been deleted or made private, so it cannot gain views.',
    action: 'It keeps its last reading. Ask the creator about it, or disqualify the entry.',
  },
  count_hidden: {
    label: 'Count not shown',
    hint: 'The platform would not state a count for this video.',
    action: 'Type the plays in from the creator\'s screenshot.',
  },
  blocked: {
    label: 'Platform refused',
    hint: 'The platform showed a login or check page instead of the video, from every place we asked.',
    action: 'Nothing to do yet: the last reading is kept and it is read again on the next run. If it stays blocked for a day, type the views in.',
  },
  fetch_failed: {
    label: 'Could not reach it',
    hint: 'The request failed or timed out.',
    action: 'Nothing to do: it is retried on the next run.',
  },
  unsupported: {
    label: 'Not a platform we can read',
    hint: 'Only TikTok, Instagram, YouTube and Facebook links carry a view count this can read.',
    action: 'Type the views in by hand, or ask the creator for a link on one of those four platforms.',
  },
  bad_url: {
    label: 'Not a link',
    hint: 'What was saved is not a web address.',
    action: 'Ask the creator for the link to the video and correct the entry.',
  },
}

export const NEEDS_ATTENTION = new Set([
  'not_on_reels_tab', 'not_a_video', 'no_video_id', 'no_count_in_page', 'removed', 'count_hidden',
  'needs_youtube_key', 'youtube_key_rejected', 'unsupported', 'bad_url',
])

export function describeSyncError(code) {
  if (!code) return null
  const meta = SYNC_ERRORS[code] ?? {
    label: code.replace(/_/g, ' '),
    hint: `The reader stopped with the code "${code}", which has no explanation here yet.`,
    action: 'Open the link: if it plays, type the views in. Tell the developer the code so it can be explained.',
  }
  return { ...meta, needsAttention: NEEDS_ATTENTION.has(code) }
}

// Read one pasted link and report what is on it. Writes NOTHING, which is what
// lets the Testing Centre use it against real links without breaking the rule
// that no lab touches real data.
export async function probeLink(url) {
  const { data, error } = await supabase.functions.invoke('view-sync', { body: { probe: url } })
  if (error) throw error
  return data
}

// Start a sync. Returns as soon as the run is ACCEPTED, not when it finishes:
// a sweep can take a while, and a request held open that long is one the browser
// eventually abandons - which is what made the button look broken and invited
// people to press it again and start a second overlapping run.
//
// Poll `viewSyncStatus().run` for progress. `{ busy: true }` means a run is
// already going, which is a normal answer rather than an error.
// `force` skips the staleness rule, which is what a person pressing a button
// means. The scheduled sweep leaves it off and reads only what has gone stale;
// that is what lets a programme of thousands drain steadily.
export async function startViewSync({ challengeId, submissionIds, force = false } = {}) {
  const body = {}
  if (challengeId) body.challenge_id = challengeId
  if (submissionIds?.length) body.submission_ids = submissionIds
  if (force) body.force = true

  const { data, error } = await supabase.functions.invoke('view-sync', { body })
  // A 409 arrives as an error with the body attached; "already running" is not
  // something to shout about.
  if (error) {
    const status = error.context?.status ?? error.status
    if (status === 409) return { busy: true }
    throw error
  }
  return data ?? {}
}

// Schedule, last run, whether an Instagram session is present (never the cookie
// itself) and how the current entries are doing.
export async function viewSyncStatus() {
  const { data, error } = await teamApi.viewSyncStatus()
  if (error) throw error
  return data
}

// How many entries are waiting to be read. Only interesting once a programme is
// big enough that one sweep does not clear it, which is the point at which an
// admin needs to be told the queue is draining rather than stuck.
export async function viewSyncBacklog() {
  const { data, error } = await teamApi.viewSyncBacklog()
  if (error) throw error
  return data
}

// The two credentials automatic views needs. Written by admins, read only by
// the Edge Function, never readable back through the API.
export async function saveViewSyncSecret(name, value) {
  const { error } = await teamApi.setViewSyncSecret({ p_name: name, p_value: value })
  if (error) throw error
}

// `enabled` is written true and never offered as a choice. Reading views is how
// the leaderboard works now, on every challenge, current and future; only how
// OFTEN is a decision worth anybody's attention.
export async function saveViewSyncSettings({ intervalHours }) {
  const { error } = await settingsApi
    .appSettings()
    .upsert({ key: 'view_sync', value: { enabled: true, interval_hours: intervalHours }, updated_at: new Date().toISOString() })
  if (error) throw error
}

// The cadences worth offering. Anything under an hour is pointless (the sweep
// itself is the slow part) and anything over a week outlives a challenge.
// `label` stands alone; `short` follows the word "Every", so the two together
// always read as a sentence. Deriving one from the other by trimming a prefix
// produced "Every Twice a day".
export const CADENCES = [
  { hours: 3, label: 'Every 3 hours', short: '3 hours' },
  { hours: 6, label: 'Every 6 hours', short: '6 hours' },
  { hours: 12, label: 'Twice a day', short: '12 hours' },
  { hours: 24, label: 'Once a day', short: '1 day' },
  { hours: 72, label: 'Every 3 days', short: '3 days' },
  { hours: 168, label: 'Once a week', short: '1 week' },
]
