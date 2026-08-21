import { supabase } from './supabase'

// REPORTING A PERSON.
//
// Ethan: "the ability to report a creator similar to the report a chat thing.
// You could report a creator for a certain thing, and this could show up
// somewhere. Obviously you have to enter the reason for reporting them, and
// then this will show up on the report section we already have for the chats on
// the admin panel, but obviously it'll be split for like report a creator."
//
// WHY THIS IS A DIFFERENT TABLE FROM A MESSAGE REPORT, and not a `kind` column
// on the existing one: a message report is about a THING that was said, and
// that table is built around preserving it - it snapshots the body and any
// media at report time, because the message may be deleted before an admin
// looks at it, and because a DM is participants-only under RLS so the snapshot
// is the only way to review one at all. Reporting a person has no artefact.
// See migration 106.
//
// THE REASONS ARE THE CHAT'S REASONS, MINUS ONE AND PLUS ONE. Sharing the list
// wholesale would have been tidier and wrong in one specific way: "Sexual or
// graphic content" is about a message, and the equivalent complaint about a
// PERSON is that their profile carries it. And a person can be a fake account,
// which a message cannot.

export const CREATOR_REPORT_REASONS = [
  { key: 'harassment', label: 'Harassment or bullying', hint: 'Targeting someone, repeatedly, or threatening them.' },
  { key: 'hate', label: 'Hate or discrimination', hint: 'Attacks a person or group for who they are.' },
  { key: 'profile', label: 'Their profile content', hint: 'Photos, bio or links that do not belong here.' },
  { key: 'spam', label: 'Spam or self-promotion', hint: 'Selling, recruiting, or the same message to everybody.' },
  { key: 'scam', label: 'Scam or phishing', hint: 'Asking for money, logins or personal details.' },
  { key: 'fake', label: 'Not who they say they are', hint: 'An impersonation, or an account that is not a real creator.' },
  { key: 'other', label: 'Something else', hint: 'Tell us what is wrong.' },
]

export const CREATOR_REPORT_LABEL =
  Object.fromEntries(CREATOR_REPORT_REASONS.map((r) => [r.key, r.label]))

/**
 * File a report.
 *
 * THE DUPLICATE IS NOT AN ERROR AND MUST NOT LOOK LIKE ONE. There is a partial
 * unique index on (reporter, reported) while a report is still open, so
 * pressing the button twice raises 23505. That is the database doing its job,
 * and the honest thing to tell the reporter is that it is already with us -
 * "something went wrong" would invite them to try again, which cannot work.
 *
 * @returns {Promise<{ok: true} | {ok: false, message: string}>}
 */
export async function reportCreator(reportedId, reason, details) {
  const { data: { user } = {} } = await supabase.auth.getUser()
  if (!user) return { ok: false, message: 'You need to be signed in to do that.' }
  if (user.id === reportedId) return { ok: false, message: 'You cannot report yourself.' }

  const { error } = await supabase.from('creator_reports').insert({
    reporter_id: user.id,
    reported_id: reportedId,
    reason,
    details: (details || '').trim() || null,
  })
  if (!error) return { ok: true }
  if (error.code === '23505') {
    return { ok: false, message: 'You have already reported this creator. We are looking at it.' }
  }
  return { ok: false, message: 'That did not send. Please try again.' }
}
