import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../context/AuthContext'
import { notice } from '../lib/confirm'
import { toast } from '../lib/toast'
import Icon from './Icon'
import { cx, timeAgo } from '../lib/utils'
import { useT } from '../lib/i18n'

// A LINE FROM THE TEAM ON EVERY ENTRY.
//
// Ethan: "I want admins to be able to give feedback on every entry, positive or
// constructive. It shows up when they view their own entry, but other creators
// won't see it."
//
// WHY THIS IS WORTH THE TABLE IT COSTS. A challenge with forty entries gives
// thirty-nine people nothing back: they post, the leaderboard moves, somebody
// else wins. One sentence that proves a human watched the video is the whole
// difference between entering a competition and being in a programme, and it is
// the cheapest retention there is.
//
// PRIVACY IS A PROPERTY OF THE TABLE, NOT OF EVERY QUERY. The feedback lives in
// `submission_feedback` with its own policy - the entry's creator and the team,
// nobody else - rather than as a column on `submissions`, which every member can
// read by design (that is what makes the entries gallery work). RLS is
// row-level; there is no way to hide one column of a row somebody is allowed to
// read, so a `feedback` column there would have been public the day it shipped.
//
// SAVING ALSO SENDS THE DM. `set_entry_feedback` does both in one call, because
// feedback that saved and a DM that did not is the failure nobody notices: the
// creator is told nothing and the admin has no way to know.

/** What the creator sees on their own entry. Renders nothing without feedback. */
export function EntryFeedbackNote({ feedback, className }) {
  const tr = useT()
  if (!feedback?.body) return null
  return (
    <div className={cx('rounded-xl border border-brand/25 bg-brand-tint/30 p-3', className)}>
      <p className="mb-1 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-widest text-brand">
        <Icon name="sparkles" className="h-3 w-3" />
        {tr("Feedback from the team")}
      </p>
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{feedback.body}</p>
      {feedback.created_at && (
        <p className="mt-1.5 text-[11px] text-smoke">{timeAgo(feedback.created_at)}</p>
      )}
    </div>
  )
}

/**
 * The admin's editor, inline on the entry card in the Entries tab.
 *
 * Collapsed to a single line until pressed. Forty entries each carrying an open
 * textarea is a page you cannot read, and the common case on any given visit is
 * that you are looking at the videos rather than writing on all of them.
 */
export function EntryFeedbackEditor({ submissionId, creatorName, feedback, onSaved }) {
  const tr = useT()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [body, setBody] = useState(feedback?.body || '')
  const [busy, setBusy] = useState(false)
  const existing = !!feedback?.body
  const isMine = feedback?.author_id === user?.id

  async function save() {
    const v = body.trim()
    if (!v || busy) return
    setBusy(true)
    const { error } = await supabase.rpc('set_entry_feedback', { p_submission: submissionId, p_body: v })
    setBusy(false)
    if (error) { notice(`That did not send: ${error.message}`); return }
    toast(existing ? 'Feedback updated' : `Sent to ${creatorName || 'them'}`)
    setOpen(false)
    onSaved?.({ body: v, author_id: user.id, created_at: new Date().toISOString() })
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cx(
          'flex w-full items-center gap-2 rounded-xl border px-3 py-2 text-left text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5',
          existing
            ? 'border-green-500/40 bg-green-50 text-green-700'
            : 'border-brand/30 bg-brand-tint/20 text-brand hover:border-brand/60',
        )}
      >
        <Icon name={existing ? 'check' : 'pencil'} className="h-3.5 w-3.5 shrink-0" />
        <span className="min-w-0 flex-1 truncate">
          {existing ? feedback.body : 'Leave feedback for this entry'}
        </span>
      </button>
    )
  }

  return (
    <div className="rounded-xl border border-brand/30 bg-brand-tint/15 p-3">
      <label htmlFor={`fb-${submissionId}`} className="mb-1.5 block text-[11px] font-bold uppercase tracking-widest text-brand">
        {existing ? 'Edit the feedback' : 'Feedback for this entry'}
      </label>
      <textarea
        id={`fb-${submissionId}`}
        rows={3}
        maxLength={2000}
        className="input bg-white no-ios-zoom sm:text-sm"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={tr("What worked, and one thing that would make the next one land harder.")}
      />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={save} disabled={!body.trim() || busy} className="btn-primary !px-4 !py-1.5 !text-xs disabled:opacity-40">
          {busy ? 'Sending…' : existing ? 'Update' : 'Send feedback'}
        </button>
        <button type="button" onClick={() => { setOpen(false); setBody(feedback?.body || '') }} className="btn-ghost !px-3 !py-1.5 !text-xs">
          {tr("Cancel")}
        </button>
        {/* The consequence, said before the button is pressed. An admin should
            never discover by accident that this DMs somebody. */}
        <span className="text-[11px] text-smoke">
          {existing && !isMine
            ? 'Replaces the current note and sends it again.'
            : `Only ${creatorName || 'they'} will see it, and it arrives as a DM.`}
        </span>
      </div>
    </div>
  )
}

// THE ENTRY, INSIDE THE DM.
//
// Ethan asked for the feedback to arrive "as a DM with a specific card showing
// their entry, like the entry card with the feedback attached". The feedback
// itself is the message body; this is the entry it is about, so the creator does
// not have to go and work out which video the team means. A thumbnail, the
// challenge it was for, and a way to open it.
//
// Deliberately NOT the full entry card from the challenge page: that one carries
// a play button, a view count and a remove button, none of which belong in a
// message bubble 240px wide.
export function EntryReferenceCard({ entry, onDark = false }) {
  if (!entry) return null
  return (
    <a
      href={entry.video_url}
      target="_blank"
      rel="noopener noreferrer"
      className={cx(
        'mb-1.5 flex items-center gap-3 rounded-xl border px-3 py-2 transition-transform duration-200 hover:scale-[1.02]',
        onDark ? 'border-white/30 bg-white/15' : 'border-gray-200 bg-white',
      )}
    >
      <span className={cx(
        'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
        onDark ? 'bg-white/20 text-white' : 'bg-brand-tint text-brand',
      )}>
        <Icon name="video" className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cx('block truncate text-xs font-semibold', onDark ? 'text-white' : 'text-ink')}>
          Your entry{entry.platform ? ` · ${entry.platform}` : ''}
        </span>
        <span className={cx('block truncate text-[11px]', onDark ? 'text-white/70' : 'text-smoke')}>
          {entry.challenges?.title || 'Challenge entry'}
        </span>
      </span>
      <Icon name="chevronRight" className={cx('h-4 w-4 shrink-0', onDark ? 'text-white/70' : 'text-brand')} />
    </a>
  )
}

/** The entries a thread references, keyed by id, for the card above. */
export async function loadEntryRefs(ids) {
  const list = [...new Set((ids || []).filter(Boolean))]
  if (!list.length) return {}
  const { data } = await supabase
    .from('submissions')
    .select('id, video_url, platform, challenge_id, challenges:challenge_id(title)')
    .in('id', list)
  return Object.fromEntries((data || []).map((r) => [r.id, r]))
}

/**
 * Every feedback row this viewer is allowed to see, for a list of entries.
 * The policy does the filtering, so a creator gets their own and an admin gets
 * all of them from the same query.
 */
export async function loadFeedback(submissionIds) {
  if (!submissionIds?.length) return {}
  const { data } = await supabase
    .from('submission_feedback')
    .select('submission_id, body, author_id, created_at')
    .in('submission_id', submissionIds)
  return Object.fromEntries((data || []).map((r) => [r.submission_id, r]))
}
