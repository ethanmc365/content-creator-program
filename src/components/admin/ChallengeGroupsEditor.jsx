import { useMemo, useState } from 'react'
import Icon from '../Icon'
import { Avatar } from '../ui'
import PeoplePicker from '../network/PeoplePicker'
import { dealEvenly } from '../../lib/challengeGroups'
import PrizeBreakdownFields, { prizeTotals } from './PrizeBreakdownFields'
import { cx } from '../../lib/utils'

// SPLITTING ONE CHALLENGE INTO SEVERAL LEADERBOARDS.
//
// Ethan: "the admin creating the challenge would need to have the ability to
// select which creators to add to each group, but also have an option to split
// randomly, so the amount of creators would be randomly split in two groups or
// however many groups the admin created. There would need to be prizes set for
// each group."
//
// THE SPLIT IS PREVIEWED, NOT PERFORMED. "Split randomly" fills the lists in
// this editor and changes nothing in the database until the challenge is saved.
// That is the whole reason the deal is a pure function in lib/challengeGroups
// rather than an RPC: an admin presses the button, reads the names, moves the
// two people they want moved, and then commits. A button whose result you can
// only inspect after it has happened is the wrong shape for a decision people
// want to adjust.
//
// A CREATOR IS IN AT MOST ONE GROUP, and this component enforces it by
// construction rather than by validating afterwards: adding somebody to a group
// removes them from whichever one they were in. The database says the same
// thing with a primary key on (challenge, creator), so the two cannot drift.
//
// PRIZES ARE OPTIONAL PER GROUP. Blank means "whatever the challenge says",
// which is the common case - two groups racing for the same pot - and it means
// a one-prize challenge does not have to state the same prize twice. See
// `prizeForGroup`.
//
// AND WHEN A GROUP DOES PLAY FOR ITS OWN, IT IS A WHOLE PRIZE. It used to be a
// pot and a winner count, which are the two REPORTING figures - derived from
// the rows everywhere else on this form - asked for as though they were the
// prize itself. Nothing wrote `challenge_groups.prize_structure`, so the
// payout function (which pays from exactly that column, falling through to the
// challenge's when it is empty) never saw a group prize at all: an admin could
// type "300" and "3 winners" into this editor and every board would still be
// paid the challenge's breakdown. Ethan: "it needs the actual proper data, and
// this would need to be synced to the database and everything so it works
// correctly." Same editor as the challenge now - see PrizeBreakdownFields -
// and the pot, the winner count and the prize type are derived on save.

const BLANK_GROUP = () => ({
  id: null,
  name: '',
  prize_currency: 'EUR',
  // The prize itself. `prize_amount`, `winners_count` and `prize_type` are NOT
  // here: they are derived from these rows when the challenge saves, exactly as
  // the challenge's own are.
  prize_structure: [],
  participation_threshold: '',
  participation_prize: '',
  members: [],
})

/** Group A, Group B, ... - the names Spain already uses out loud. */
const suggestName = (i) => `Group ${String.fromCharCode(65 + i)}`

const SYMBOL = { GBP: '£', EUR: '€', USD: '$', RON: 'lei ', SEK: 'kr ', NOK: 'kr ', DKK: 'kr ' }

// DOES THIS GROUP PLAY FOR ITS OWN PRIZE?
//
// Derived rather than stored, because it already is: a group with prize rows of
// its own, or its own participation reward, has its own prize; one with neither
// plays for the challenge's. That is the same rule `prizeForGroup` applies when
// the app reads it back and the same one the payout function applies in SQL, so
// there is nothing to keep in step.
//
// `prize_own` only carries the answer for the moment between pressing "its own
// prize" and typing anything into it - without it the editor would vanish again
// on the next render, which is the sort of control that looks broken. It is
// never saved.
const ownPrize = (g) => g.prize_own ?? !!(
  (Array.isArray(g.prize_structure) && g.prize_structure.length > 0)
  || String(g.participation_prize ?? '').trim()
)

// `audience` is who can be ADDED (the market's roster). `people` is everybody
// the editor might have to DRAW, which is the roster plus anybody already in a
// group who has since left it - see the note on `strangers` in the form. They
// are the same list in the normal case and the distinction only matters at the
// edges, which is exactly where a chip reading "?" would have appeared.
export default function ChallengeGroupsEditor({ groups, onChange, audience = [], people = null, currency = 'EUR' }) {
  const [pickerFor, setPickerFor] = useState(null) // index of the group being added to

  const byId = useMemo(() => new Map((people ?? audience).map((p) => [p.id, p])), [people, audience])
  const assigned = useMemo(
    () => new Set(groups.flatMap((g) => g.members)),
    [groups],
  )
  const unassigned = audience.filter((p) => !assigned.has(p.id))

  const setGroup = (i, patch) =>
    onChange(groups.map((g, j) => (j === i ? { ...g, ...patch } : g)))

  const makeGroup = (i) => ({ ...BLANK_GROUP(), name: suggestName(i), prize_currency: currency })

  function addGroup() {
    onChange([...groups, makeGroup(groups.length)])
  }

  // SPLITTING MAKES TWO, NOT ONE.
  //
  // Ethan: "if someone clicks 'split into groups', for some reason it just
  // shows up Group A. It should obviously already show Group B, because there's
  // going to be at least two groups, and then the ability to add more."
  // He is right that one group is not a split - it is the same single
  // leaderboard with a name on it, and every admin who pressed the button then
  // had to press a second one to get to the state they had asked for.
  function startGroups() {
    onChange([makeGroup(0), makeGroup(1)])
  }

  function removeGroup(i) {
    onChange(groups.filter((_, j) => j !== i))
  }

  // Adding somebody to a group TAKES THEM OUT of any other. The alternative is
  // a creator on two leaderboards with the same views who can win twice, which
  // is not a thing anybody means by splitting a challenge in two.
  function addMembers(i, ids) {
    onChange(groups.map((g, j) => ({
      ...g,
      members: j === i
        ? [...new Set([...g.members, ...ids])]
        : g.members.filter((m) => !ids.includes(m)),
    })))
  }

  function removeMember(i, id) {
    setGroup(i, { members: groups[i].members.filter((m) => m !== id) })
  }

  function splitRandomly() {
    const ids = audience.map((p) => p.id)
    const deal = dealEvenly(ids, groups.map((_, i) => i))
    onChange(groups.map((g, i) => ({
      ...g,
      members: ids.filter((id) => deal.get(id) === i),
    })))
  }

  // TWO ANSWERS, DRAWN AS TWO ANSWERS.
  //
  // Ethan: "most of the time we'll be selecting one leaderboard, so have that as
  // the obvious button, like a big button, or just make it clear - because
  // currently I don't like the design."
  //
  // It was a dashed empty-state panel that described the current setting in
  // grey and offered one button to change it. That is a state, not a choice:
  // "one leaderboard" never looked like something you had picked, so the only
  // thing on the panel that looked pressable was the option nobody usually
  // wants. Now it is the same two-card chooser as "How it is won" directly
  // above it, with the common answer picked and orange - so the section reads
  // as answered rather than as unfinished.
  const CHOICES = [
    {
      on: groups.length === 0,
      icon: 'trophy',
      title: 'One leaderboard',
      blurb: 'Everybody who enters races everybody else, for the prizes below.',
      act: () => onChange([]),
    },
    {
      on: groups.length > 0,
      icon: 'users',
      title: 'Split into groups',
      blurb: 'Two or more separate races inside this one brief, each with its own prize.',
      act: startGroups,
    },
  ]
  const chooser = (
    <div className="grid gap-3 sm:grid-cols-2">
      {CHOICES.map((c) => (
        <button
          key={c.title}
          type="button"
          onClick={() => { if (!c.on) c.act() }}
          aria-pressed={c.on}
          className={cx(
            'flex flex-col rounded-xl border p-4 text-left transition-all duration-200 hover:-translate-y-0.5',
            c.on ? 'border-brand bg-brand text-white shadow-card' : 'border-gray-200 bg-white hover:border-brand/40',
          )}
        >
          <span className="flex items-center gap-2">
            <Icon name={c.icon} className={cx('h-5 w-5 shrink-0', c.on ? 'text-white' : 'text-smoke')} />
            <span className="text-sm font-semibold">{c.title}</span>
          </span>
          <span className={cx('mt-2 text-xs leading-relaxed', c.on ? 'text-white/80' : 'text-smoke')}>{c.blurb}</span>
        </button>
      ))}
    </div>
  )

  if (groups.length === 0) return chooser

  return (
    <div className="space-y-4">
      {chooser}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={addGroup} className="btn-secondary !py-2 text-xs">
          <Icon name="plus" className="h-3.5 w-3.5" /> Add a group
        </button>
        {/* The split covers the WHOLE audience, not just the people nobody has
            placed yet: it is a re-deal, and saying so in the label is cheaper
            than an admin discovering it. */}
        <button type="button" onClick={splitRandomly} disabled={audience.length === 0}
          className="btn-secondary !py-2 text-xs disabled:opacity-40">
          <Icon name="reorder" className="h-3.5 w-3.5" /> Split all {audience.length} randomly
        </button>
        {unassigned.length > 0 && (
          <span className="text-xs text-smoke">
            {unassigned.length} not in a group yet
          </span>
        )}
      </div>

      {groups.map((g, i) => (
        <div key={g.id || `new-${i}`} className="rounded-card border border-gray-100 bg-white p-4 shadow-card">
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-0 flex-1">
              <label htmlFor={`grp-name-${i}`} className="label">Group name</label>
              <input
                id={`grp-name-${i}`}
                className="input"
                value={g.name}
                onChange={(e) => setGroup(i, { name: e.target.value })}
                placeholder={suggestName(i)}
              />
            </div>
            <button
              type="button"
              onClick={() => removeGroup(i)}
              aria-label={`Remove ${g.name || suggestName(i)}`}
              className="mb-1 rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-50 hover:text-red-500"
            >
              <Icon name="trash" className="h-4 w-4" />
            </button>
          </div>

          {/* THE PRIZE IS A CHOICE BEFORE IT IS A FORM.
              Ethan: "it's the same and same... what do you mean, type in? I
              can't type in a prize here. It really makes no sense, so that UI
              needs to be improved."
              He was describing two identical-looking boxes both placeholdered
              "Same" - which is the RULE (blank means the challenge's own prize)
              printed where a value goes, so the fields looked pre-filled with a
              word you could not edit, on every group, twice. The rule is a
              question now, asked once per group, and the editor only exists
              once the answer is "its own". Choosing "same as the challenge"
              clears it, so a group cannot carry a prize it is no longer
              using. */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {[
              { own: false, label: 'Same prize as the challenge' },
              { own: true, label: 'Its own prize' },
            ].map((o) => {
              const on = ownPrize(g) === o.own
              return (
                <button
                  key={String(o.own)}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setGroup(i, o.own
                    ? {
                      prize_own: true,
                      // Opening the editor on an empty list is opening it on
                      // nothing at all, so it starts with one row to fill in.
                      prize_structure: (g.prize_structure ?? []).length
                        ? g.prize_structure
                        : [{ place: '1st', prize: '', amount: '' }],
                    }
                    : {
                      prize_own: false,
                      prize_structure: [],
                      participation_threshold: '',
                      participation_prize: '',
                    })}
                  className={cx(
                    'rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200 hover:-translate-y-0.5',
                    on ? 'border-brand bg-brand text-white shadow-card' : 'border-gray-200 bg-white text-smoke hover:border-brand hover:text-brand',
                  )}
                >
                  {o.label}
                </button>
              )
            })}
          </div>

          {ownPrize(g) && (
            <div className="mt-3 rounded-xl border border-gray-100 bg-cloud/40 p-4">
              {/* THE SAME EDITOR THE CHALLENGE USES. A board has to be able to
                  promise exactly what a challenge can promise, because it is
                  the column the payout function actually reads. */}
              <PrizeBreakdownFields
                dense
                idPrefix={`grp-${i}`}
                prizes={g.prize_structure ?? []}
                onPrizes={(next) => setGroup(i, { prize_structure: next, prize_own: true })}
                symbol={SYMBOL[g.prize_currency || currency] || ''}
                participationThreshold={g.participation_threshold ?? ''}
                participationPrize={g.participation_prize ?? ''}
                onParticipation={({ threshold, prize }) =>
                  setGroup(i, { participation_threshold: threshold, participation_prize: prize, prize_own: true })}
              />
              {/* Derived, and shown for the same reason the challenge shows it:
                  so nobody has to add up their own prize rows to check the
                  board pays what they meant it to. */}
              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-gray-200/70 pt-3 text-xs">
                <span>
                  <span className="text-smoke">Pot </span>
                  <span className="font-bold text-brand">
                    {SYMBOL[g.prize_currency || currency] || ''}
                    {prizeTotals(g.prize_structure).pot.toLocaleString()}
                  </span>
                </span>
                <span>
                  <span className="text-smoke">Winners </span>
                  <span className="font-bold">{prizeTotals(g.prize_structure).winners}</span>
                </span>
              </div>
            </div>
          )}

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {g.members.map((id) => {
              const p = byId.get(id)
              return (
                <span key={id} className="flex items-center gap-1.5 rounded-full bg-cloud py-1 pl-1 pr-2 text-xs font-medium">
                  <Avatar src={p?.photo_url} name={p?.name} size="xs" />
                  <span className="max-w-[9rem] truncate">{p?.name || 'Creator'}</span>
                  <button type="button" onClick={() => removeMember(i, id)} aria-label={`Remove ${p?.name || 'creator'}`}
                    className="text-gray-400 transition-colors hover:text-red-500">
                    <Icon name="close" className="h-3 w-3" />
                  </button>
                </span>
              )
            })}
            <button type="button" onClick={() => setPickerFor(i)}
              className="rounded-full border border-dashed border-gray-300 px-3 py-1.5 text-xs font-semibold text-smoke transition-colors hover:border-brand hover:text-brand">
              + Add creators
            </button>
            {/* An empty group is a thing to notice, not an error to shout
                about: brand, like every other "look at this" on the platform.
                See the block below for why red left this component. */}
            <span className={cx('ml-auto text-xs tabular-nums', g.members.length ? 'text-smoke' : 'text-brand')}>
              {g.members.length} {g.members.length === 1 ? 'creator' : 'creators'}
            </span>
          </div>
        </div>
      ))}

      {/* NOBODY IS LEFT OUT, AND THIS IS NOW A BLOCK RATHER THAN A FOOTNOTE.
          It read: "anyone not in a group still sees the brief and can still
          enter... they are not competing for any group's prize." True, and the
          wrong thing to be relaxed about. Ethan: "remove that and instead make
          it so that if someone's not added to a group it just doesn't work.
          Someone always has to be in a group - it doesn't have to be even, but
          they have to be in a group. Maybe suggest that if someone isn't added,
          maybe they forgot."
          So it names them, offers the one-press fix, and the form refuses to
          save while anybody is here - see `unassignedInGroups` in
          AdminChallengeForm. The "Not in a group" board on the leaderboard
          stays, because a challenge saved before this rule existed still has to
          rank whoever it has.
          IT IS BRAND, NOT RED. Ethan: "let's say I'm creating a group, and then
          it shows up 'everyone at 44 creators not in a group'. I don't like how
          it's red. I want it to actually match the platform colour."
          He is right about more than the colour. Red is this platform's
          DESTRUCTIVE tone - it is on delete, on the danger zone, and nowhere
          else - and nothing has gone wrong here: an admin who has just pressed
          "split into groups" has not yet dealt anybody out, so the very first
          thing they saw was a red panel telling them off for a step they were
          about to take. Brand orange is the "look at this" tone, which is what
          this is, and it still blocks the save. */}
      {unassigned.length > 0 && (
        <div className="rounded-xl border border-brand/25 bg-brand-tint/40 px-4 py-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand">
            <Icon name="alert" className="h-4 w-4 shrink-0" />
            {unassigned.length} {unassigned.length === 1 ? 'creator is' : 'creators are'} not in a group yet
          </p>
          <p className="mt-1 text-xs leading-relaxed text-smoke">
            Everyone in the market has to be on one of these boards before this can be saved. Easy to forget somebody.
          </p>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {unassigned.slice(0, 8).map((p) => (
              <span key={p.id} className="flex items-center gap-1.5 rounded-full bg-white py-1 pl-1 pr-2.5 text-xs font-medium">
                <Avatar src={p.photo_url} name={p.name} size="xs" />
                <span className="max-w-[9rem] truncate">{p.name || 'Creator'}</span>
              </span>
            ))}
            {unassigned.length > 8 && (
              <span className="text-xs text-smoke">and {unassigned.length - 8} more</span>
            )}
          </div>
          <button
            type="button"
            onClick={splitRandomly}
            className="btn-secondary mt-3 !py-2 text-xs"
          >
            <Icon name="reorder" className="h-3.5 w-3.5" /> Deal everyone out evenly
          </button>
        </div>
      )}

      <PeoplePicker
        open={pickerFor != null}
        onClose={() => setPickerFor(null)}
        people={audience}
        title={`Add to ${groups[pickerFor]?.name || 'this group'}`}
        hint="Anyone already in another group moves across."
        confirmLabel="Add"
        onConfirm={(ids) => { addMembers(pickerFor, ids); setPickerFor(null) }}
      />
    </div>
  )
}
