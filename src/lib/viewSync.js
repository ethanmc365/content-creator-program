// Automatic view counts: the client side of the `view-sync` Edge Function.
//
// The function reads a challenge entry's view count off the page the creator
// linked to (see supabase/functions/view-sync/index.ts). Everything here is
// admin-only at the server; these helpers exist so the admin panel and the
// Testing Centre call it the same way and read the same vocabulary of errors.
import { supabase } from './supabase'

// What the sync can come back with, in the words an admin should see. The keys
// are the `views_sync_error` values the function writes onto a submission, so a
// stale row explains itself long after the run that produced it.
export const SYNC_ERRORS = {
  needs_session: {
    label: 'Instagram sign-in needed',
    hint: 'Instagram only shows view counts to a signed-in account. Add a session and these fill in on the next run.',
  },
  needs_youtube_key: {
    label: 'YouTube key needed',
    hint: 'YouTube blocks servers from reading its pages, so these need a free YouTube Data API key. Add one and they fill in on the next run.',
  },
  youtube_key_rejected: {
    label: 'YouTube key rejected',
    hint: 'YouTube refused the stored key. Check it is valid and unrestricted, and that the Data API v3 is switched on for its project.',
  },
  not_a_video: {
    label: 'Photo or carousel post',
    hint: 'That Instagram post is not a video, so it has no view count. If the creator meant to enter a reel, ask them for the right link.',
  },
  write_failed: {
    label: 'Could not save',
    hint: 'The number was read but writing it to the entry failed. It will be retried on the next run.',
  },
  trial_reel: {
    label: 'No view count found (likely trial reel)',
    hint: 'A trial reel is shown only to people who do not follow the account and never appears on the creator\'s own profile, so it has no readable count and never will. Ask the creator for the number and type it in.',
  },
  session_expired: {
    label: 'Instagram session expired',
    hint: 'The stored Instagram session has been rejected. Paste a fresh one to start these again.',
  },
  no_video_id: {
    label: 'Link goes nowhere',
    hint: 'The link does not resolve to a video. Usually it was deleted, set to private, or pasted incompletely.',
  },
  no_count_in_page: {
    label: 'No count on the page',
    hint: 'The post loaded but carries no view count. Photo posts and carousels have none.',
  },
  approximate: {
    label: 'Rounded figure',
    hint: 'Facebook only ever states a rounded number logged out, so this is accurate to about a percent. Type an exact one if a ranking turns on it.',
  },
  blocked: {
    label: 'Platform refused',
    hint: 'The platform served a check page instead of the video. It usually clears by itself on the next run.',
  },
  fetch_failed: {
    label: 'Could not reach it',
    hint: 'The request failed or timed out. It will be retried on the next run.',
  },
  lower_than_recorded: {
    label: 'Lower than the saved number',
    hint: 'The live count is BELOW the number already saved. Views do not fall, so the saved one was probably typed from somewhere else. Nothing was overwritten.',
  },
  unsupported: {
    label: 'Not a platform we can read',
    hint: 'Only TikTok, Instagram, YouTube and Facebook links carry a view count this can read.',
  },
  bad_url: { label: 'Not a link', hint: 'That is not a URL.' },
}

export function describeSyncError(code) {
  if (!code) return null
  return SYNC_ERRORS[code] ?? { label: code.replace(/_/g, ' '), hint: '' }
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
export async function startViewSync({ challengeId, submissionIds } = {}) {
  const body = {}
  if (challengeId) body.challenge_id = challengeId
  if (submissionIds?.length) body.submission_ids = submissionIds

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
  const { data, error } = await supabase.rpc('view_sync_status')
  if (error) throw error
  return data
}

// The two credentials automatic views needs. Written by admins, read only by
// the Edge Function, never readable back through the API.
export async function saveViewSyncSecret(name, value) {
  const { error } = await supabase.rpc('set_view_sync_secret', { p_name: name, p_value: value })
  if (error) throw error
}

// `enabled` is written true and never offered as a choice. Reading views is how
// the leaderboard works now, on every challenge, current and future; only how
// OFTEN is a decision worth anybody's attention.
export async function saveViewSyncSettings({ intervalHours }) {
  const { error } = await supabase
    .from('app_settings')
    .upsert({ key: 'view_sync', value: { enabled: true, interval_hours: intervalHours }, updated_at: new Date().toISOString() })
  if (error) throw error
}

// The cadences worth offering. Anything under an hour is pointless (the sweep
// itself is the slow part) and anything over a week outlives a challenge.
export const CADENCES = [
  { hours: 3, label: 'Every 3 hours' },
  { hours: 6, label: 'Every 6 hours' },
  { hours: 12, label: 'Twice a day' },
  { hours: 24, label: 'Once a day' },
  { hours: 72, label: 'Every 3 days' },
  { hours: 168, label: 'Once a week' },
]

export function cadenceLabel(hours) {
  return CADENCES.find((c) => c.hours === Number(hours))?.label ?? `Every ${hours} hours`
}

// The most recent snapshot of every submission, oldest first, for a sparkline
// or a "grew by N since yesterday" line.
export async function viewHistory(submissionIds) {
  if (!submissionIds?.length) return {}
  const { data, error } = await supabase
    .from('view_snapshots')
    .select('submission_id, views, source, captured_at')
    .in('submission_id', submissionIds)
    .order('captured_at', { ascending: true })
  if (error) throw error
  const bySubmission = {}
  for (const row of data ?? []) {
    ;(bySubmission[row.submission_id] ??= []).push(row)
  }
  return bySubmission
}
