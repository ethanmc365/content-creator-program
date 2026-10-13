import { Link } from 'react-router-dom'
import { Avatar } from '../components/ui'
import { formatDateTimeTz, cx } from '../lib/utils'
import { PointParts } from '../components/challenge/EntryPreview'
import Icon from '../components/Icon'
import { TLine } from '../components/TranslatedText'
import { EntryFeedbackNote, EntryFeedbackEditor } from '../components/EntryFeedback'
import { safeUrl } from '../lib/safeUrl'

// Part of ChallengeDetail.jsx: every value it shows comes in as a prop from the page.
export default function ChallengeDetailEntryBody({
  bonusById,
  challenge,
  claimBonus,
  claimableFor,
  claimsBySubmission,
  entryPoints,
  feedback,
  isAdmin,
  isLive,
  removeMySubmission,
  s,
  setFeedback,
  tr,
  unclaimBonus,
  user,
}) {
  return (
    <div className="flex flex-1 flex-col gap-2.5 p-3">
      <div className="flex items-center gap-2 sm:gap-3">
        <Link to={`/profile/${s.profiles?.id}`} className="shrink-0">
          <Avatar src={s.profiles?.photo_url} name={s.profiles?.name} size="sm" />
        </Link>
        <div className="min-w-0 flex-1">
          <Link to={`/profile/${s.profiles?.id}`} className="block truncate text-sm font-semibold hover:text-brand">
            {s.profiles?.name}
          </Link>
          {/* THE DATE AND THE TIME, NOT "1 DAY AGO".
              Ethan: "on challenges, show the date and time a video
              was submitted, not just 1 day ago or about 1 month
              ago." A relative stamp is arithmetic the reader has to
              undo, and on a challenge it is the one fact that
              settles a deadline argument - "about 1 month ago" is
              not evidence of anything. Shown in the reader's own
              zone, with the zone named. */}
          <p className="truncate text-[11px] text-smoke sm:text-xs">{formatDateTimeTz(s.submitted_at)}</p>
        </div>
      </div>
      {/* WHAT THE POINTS WERE FOR (28 Sep 2026): "+1 views · +5 bonus". */}
      {challenge.scoring === 'points' && <PointParts points={entryPoints.get(s.id)} />}
      {s.caption && <p className="line-clamp-2 text-xs text-smoke [overflow-wrap:anywhere] sm:line-clamp-3 sm:text-sm">{s.caption}</p>}

      {/* ---- WHAT THIS ENTRY CLAIMED ----
          Ethan: "it should show +1 point or plus x points on the
          entry card, because then the admin can easily check and
          ensure that it's correct and no one is cheating."
          That is the whole answer to trusting a creator with a tick
          box: the claim sits beside the video on a page an admin
          already reads, so checking is looking rather than
          auditing. Everybody sees these, not just the team - a
          claim made in public is a claim people are careful about.
          An admin can take one back from /admin/challenges/:id/results. */}
      {(claimsBySubmission.get(s.id)?.size > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {[...claimsBySubmission.get(s.id)].map((ruleId) => {
            const r = bonusById.get(ruleId)
            if (!r) return null
            // WAITING IS NOT THE SAME AS AWARDED, AND THE CHIP HAS
            // TO SAY WHICH. A gated bonus (migration 181) is claimed
            // the moment the creator ticks it and paid only once the
            // entry passes the view count. Drawn identically, an
            // admin reading the board could not tell a point that
            // has landed from one that has not - and neither could
            // the creator, who would reasonably report the points as
            // wrong. Amber and a target, green and a tick.
            const waiting = r.min_views > 0 && (s.logged_views ?? 0) < r.min_views
            return (
              <span key={ruleId}
                title={waiting
                  ? `${r.prompt || r.label}. Awarded at ${Number(r.min_views).toLocaleString()} views`
                  : (r.prompt || r.label)}
                className={cx(
                  'inline-flex max-w-full items-center gap-1 rounded-full px-2 py-1 text-[10px] font-semibold leading-snug sm:px-2.5 sm:text-[11px]',
                  waiting ? 'bg-amber-50 text-amber-700' : 'bg-green-50 text-green-700',
                )}>
                <Icon name={waiting ? 'clock' : 'check'} className="h-3 w-3 shrink-0" />
                <span className="min-w-0 truncate">+{r.points} <TLine text={r.label.replace(/^\+?\d+\s*/, '')} /></span>
                {waiting && ` · ${tr("at {n} views", { n: Number(r.min_views).toLocaleString() })}`}
                {isLive && s.creator_id === user.id && (
                  <button type="button" onClick={() => unclaimBonus(s, r)} aria-label={tr('Remove this bonus')} title={tr('Ticked by mistake? Remove it')}
                    className="-mr-0.5 ml-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full transition-transform duration-200 hoverable:hover:scale-125">
                    <Icon name="close" className="h-3 w-3" />
                  </button>
                )}
              </span>
            )
          })}
        </div>
      )}

      {/* A BONUS ADDED AFTER YOU ENTERED IS STILL CLAIMABLE.
          "Admins can do this at the beginning or in the middle of a
          challenge, it should always update correctly." A rule
          created on the fifteenth cannot have been offered to
          anybody who submitted on the third, and asking them to
          delete and re-post their video to claim it would be
          absurd. So an unclaimed bonus shows on your OWN entries
          while the challenge is live. */}
      {isLive && s.creator_id === user.id
        && claimableFor(s).length > 0 && (
        /* ONE SMALL CHIP PER BONUS (30 Sep 2026). Ethan, in Romanian: the "+5 bonus
           points for using the hook" card on an entry was "way, way too big". It was a
           boxed panel with a heading and a full-width button per bonus, and a translated
           prompt runs long. Now each is a single-line chip, the prompt cut to one line
           (the whole of it is the tooltip), in the reader's language. */
        <div className="flex flex-wrap items-center gap-1.5">
          {claimableFor(s).map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => claimBonus(s, r)}
              title={r.min_views > 0
                ? `${r.prompt} · ${tr("The bonus lands once this video passes {n} views.", { n: Number(r.min_views).toLocaleString() })}`
                : r.prompt}
              aria-label={tr("Bonus points you can still claim")}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-dashed border-brand/40 bg-brand-tint/30 py-1 pl-1 pr-2.5 text-[11px] font-semibold text-brand transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:bg-brand-tint/60"
            >
              <span className="shrink-0 rounded-full bg-brand px-1.5 py-0.5 text-[10px] font-bold tabular-nums leading-none text-white">+{r.points}</span>
              <span className="min-w-0 truncate"><TLine text={r.prompt} /></span>
            </button>
          ))}
        </div>
      )}
      {/* THE FOOT OF THE CARD IS ONE BLOCK, AND IT IS PINNED
          (10 Sep 2026).

          Ethan: "the cards are different sizes, some of them are in
          a different range depending on the caption they added. Fix
          this so the cards are always the same size - Open Link
          should always be at the bottom, Leave feedback for this
          entry just above it, and the views just above that. Then
          there can be extra space above if someone wrote a short
          caption."

          The cards were already the same HEIGHT - they are grid
          items and a grid stretches its row. What was different was
          where everything inside them sat, because only the Open
          Link row had `mt-auto`: the slack landed between the
          feedback box and the button, so on a short caption the
          three things at the foot were spread down the card and on
          a long one they were bunched. Moving the whole trio into
          one `mt-auto` block puts the slack ABOVE them, which is
          where an unused line belongs, and lines the three rows up
          across every card in the row.

          The views moved down here from just under the caption for
          the same reason - they are part of the foot, not part of
          the story.

          THE TEAM'S NOTE. The creator sees it on their own entry;
          an admin sees the editor on every entry. Nobody else sees
          anything, because nobody else's query returns a row. */}
      <div className="mt-auto flex flex-col gap-3 pt-1">
      {s.creator_id === user.id && <EntryFeedbackNote feedback={feedback[s.id]} />}
      {isAdmin && (
        <EntryFeedbackEditor
          submissionId={s.id}
          creatorName={s.profiles?.name?.split(' ')[0]}
          feedback={feedback[s.id]}
          onSaved={(row) => setFeedback((f) => ({ ...f, [s.id]: row }))}
        />
      )}

      <div className="flex gap-2">
        <a
          href={safeUrl(s.video_url)}
          target="_blank"
          rel="noopener noreferrer"
          className="btn inline-flex flex-1 items-center justify-center gap-1.5 bg-brand-tint !py-2 text-xs !text-brand transition-transform duration-200 hoverable:hover:-translate-y-0.5"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M10 13a5 5 0 0 0 7.07 0l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
            <path d="M14 11a5 5 0 0 0-7.07 0l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
          </svg>
          {tr("Open Link")}
        </a>
        {s.creator_id === user.id && isLive && (
          <button onClick={() => removeMySubmission(s.id)} className="btn-danger !py-2 text-xs">{tr("Remove")}</button>
        )}
      </div>
      </div>
    </div>
  )
}
