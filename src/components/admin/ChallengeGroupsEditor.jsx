import { useMemo, useState } from 'react'
import Icon from '../Icon'
import { Avatar } from '../ui'
import PeoplePicker from '../network/PeoplePicker'
import { dealEvenly } from '../../lib/challengeGroups'
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

const BLANK_GROUP = () => ({
  id: null,
  name: '',
  prize_amount: '',
  prize_currency: 'EUR',
  prize_type: '',
  winners_count: '',
  members: [],
})

/** Group A, Group B, ... - the names Spain already uses out loud. */
const suggestName = (i) => `Group ${String.fromCharCode(65 + i)}`

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

  function addGroup() {
    onChange([...groups, { ...BLANK_GROUP(), name: suggestName(groups.length), prize_currency: currency }])
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

  if (groups.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-gray-200 p-6 text-center">
        <p className="text-sm font-semibold text-ink">One leaderboard</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-smoke">
          Everybody who enters competes against everybody else. Add groups to run
          two or more separate leaderboards inside this one brief, each with its
          own prize.
        </p>
        <button type="button" onClick={addGroup} className="btn-secondary mt-4 !py-2.5 text-sm">
          <Icon name="plus" className="h-4 w-4" /> Split into groups
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
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
            <div className="w-28">
              <label htmlFor={`grp-pot-${i}`} className="label">Prize pot</label>
              <input
                id={`grp-pot-${i}`}
                className="input"
                inputMode="decimal"
                value={g.prize_amount}
                onChange={(e) => setGroup(i, { prize_amount: e.target.value })}
                placeholder="Same"
              />
            </div>
            <div className="w-24">
              <label htmlFor={`grp-win-${i}`} className="label">Winners</label>
              <input
                id={`grp-win-${i}`}
                className="input"
                inputMode="numeric"
                value={g.winners_count}
                onChange={(e) => setGroup(i, { winners_count: e.target.value })}
                placeholder="Same"
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
          {/* "Same" is not a placeholder being coy - it is the actual rule, and
              stating it under the two boxes stops an admin typing the same
              prize into every group to be safe. */}
          <p className="mt-1.5 text-[11px] text-smoke">
            Leave the prize blank and this group plays for whatever the challenge itself is offering.
          </p>

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
            <span className={cx('ml-auto text-xs tabular-nums', g.members.length ? 'text-smoke' : 'text-red-500')}>
              {g.members.length} {g.members.length === 1 ? 'creator' : 'creators'}
            </span>
          </div>
        </div>
      ))}

      {unassigned.length > 0 && (
        <p className="text-xs text-smoke">
          Anyone not in a group still sees the brief and can still enter. Their entries
          appear on a separate &ldquo;Not in a group&rdquo; board so nothing is lost, but
          they are not competing for any group&rsquo;s prize.
        </p>
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
