import { SCORING_MODES, STARTER_POINT_RULES } from '../../lib/scoring'
import { cx, parseDateTime } from '../../lib/utils'
import Icon from '../../components/Icon'
import PointRulesEditor from '../../components/network/PointRulesEditor'
import BoostsEditor from '../../components/admin/BoostsEditor'
import { JoinBonusEditor, VoucherDaysEditor } from '../../components/admin/ChallengeExtrasEditor'
import { Skeleton } from '../../components/ui'
import ChallengeGroupsEditor from '../../components/admin/ChallengeGroupsEditor'

// Part of AdminChallengeForm.jsx: every value it shows comes in as a prop from the page.
export default function AdminChallengeFormScoring({
  PICKED,
  UNPICKED,
  audience,
  editing,
  form,
  groupPeople,
  groups,
  groupsLoaded,
  id,
  rules,
  set,
  setGroups,
  setRules,
  subText,
}) {
  return (
    <section className="card space-y-5 max-sm:!rounded-none max-sm:!border-x-0 max-sm:!border-b-0 max-sm:!bg-transparent max-sm:!p-0 max-sm:!pt-6 max-sm:!shadow-none">
      <h2 className="text-lg font-semibold">How it is won</h2>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {SCORING_MODES.map((m) => (
          <button
            key={m.value} type="button" onClick={() => {
              set({ scoring: m.value })
              // Seed the standard rules the first time points is chosen, so
              // the common case is one click rather than four.
              if (m.value === 'points' && rules.length === 0) {
                setRules(STARTER_POINT_RULES.map((r, i) => ({ ...r, id: `seed-${i}` })))
              }
            }}
            aria-pressed={form.scoring === m.value}
            className={cx(
              'flex flex-col rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5',
              form.scoring === m.value ? PICKED : UNPICKED,
            )}
          >
            <span className="flex items-center gap-2">
              <Icon name={m.icon} className={cx('h-5 w-5 shrink-0', form.scoring === m.value ? 'text-white' : 'text-smoke')} />
              <span className="text-sm font-semibold">{m.label}</span>
            </span>
            <span className={cx('mt-2 text-xs leading-relaxed', subText(form.scoring === m.value))}>{m.blurb}</span>
            <span className={cx('mt-3 text-[11px] font-semibold uppercase tracking-wide', form.scoring === m.value ? 'text-white' : 'text-brand')}>{m.winner}</span>
          </button>
        ))}
      </div>

      {/* A challenge run under the old prize format keeps it. The option is
          not offered for a new one, and the warning that used to sit here is
          gone at Ethan's request - it explained a format nobody is choosing
          and made an edit screen for a finished contest look alarming. */}
      {form.scoring === 'points' && (
        // A NEUTRAL PANEL. It was a brand-tinted box holding brand-tinted
        // controls, which Ethan flagged: everything inside it was the same
        // pale orange as everything else, so the points values - the one
        // thing on the panel worth spotting - had nothing to stand out
        // against. The panel is plain now and the points are the only
        // orange thing on it.
        <div className="rounded-xl border border-gray-200 bg-cloud/40 p-4 max-sm:!rounded-none max-sm:!border-0 max-sm:!bg-transparent max-sm:!p-0">
          <p className="label">Scoring rules for this challenge</p>
          <p className="mb-4 text-xs text-smoke">
            Creators see these on the brief. Editing them after the challenge is live rescores it.
          </p>
          <PointRulesEditor
            rules={rules}
            onChange={setRules}
            thresholdMode={form.threshold_mode}
            onThresholdMode={(v) => set({ threshold_mode: v })}
            challengeStart={parseDateTime(form.startDateStr, form.startTimeStr)}
            challengeEnd={parseDateTime(form.endDateStr, form.endTimeStr)}
          />
        </div>
      )}
      {form.scoring === 'points' && editing && <BoostsEditor challengeId={id} />}
      {form.scoring === 'points' && editing && <JoinBonusEditor challengeId={id} />}
      {editing && <VoucherDaysEditor challengeId={id} currency={form.prize_currency || 'EUR'} />}
      {!editing && <p className="rounded-xl border border-dashed border-gray-200 px-4 py-3 text-xs text-smoke">A joining bonus and voucher days can be added once the challenge is saved.</p>}
      {form.scoring === 'points' && !editing && <p className="rounded-xl border border-dashed border-gray-200 px-4 py-3 text-xs text-smoke">Point boosts (double points for a few hours) can be added once the challenge is saved.</p>}

      {/* NOTHING HERE FOR THE VIEW-RANKED MODES.
          Picking "best single video" used to print a paragraph explaining
          what best single video means - directly under the card that had
          just explained it, and next to a line about keeping view counts up
          to date which has not been true since they became automatic. The
          card is the explanation. Only points needs a box, because points
          is the only mode with anything left to decide. */}

      {/* ---- GROUPS ----
          MORE THAN ONE LEADERBOARD INSIDE ONE BRIEF.
          Ethan: "the way the Spanish community is currently run, they have
          two groups inside the one challenge."
          It sits under "How it is won" because that is what it is: not a
          different contest, a different way of deciding who is racing
          whom. See lib/challengeGroups and migration 154. */}
      <div id="groups" className="scroll-mt-24 border-t border-gray-100 pt-5">
        {/* NO STANDING EXPLANATION - see the note in "Who it is for". */}
        <p className="label mb-3">Leaderboards</p>
        {!groupsLoaded ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <ChallengeGroupsEditor
            groups={groups}
            onChange={setGroups}
            audience={audience}
            people={groupPeople}
            currency={form.prize_currency || 'EUR'}
            pointsAllowed={form.scoring === 'points'}
            basis={form.scoring === 'points' ? form.participation_basis : 'entries'}
            onBasis={(b) => set({ participation_basis: b })}
          />
        )}
        {groups.length > 0 && !form.community_id && (
          <p className="mt-2 text-xs text-red-500">
            Pick the market first - the creators you can deal into a group are its roster.
          </p>
        )}
      </div>
    </section>
  )
}
