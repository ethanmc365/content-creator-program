import Icon from '../Icon'
import { STARTER_POINT_RULES } from '../../lib/scoring'
import { cx } from '../../lib/utils'

// The scoring rules for ONE challenge.
//
// These used to live on the market, as a template every challenge there
// inherited. That was the wrong owner. A market runs a points challenge in
// March and a best-video challenge in April, and "the market's scoring rules"
// has no meaning during April. Worse, editing the market's rules quietly
// changed what a challenge people were already competing in was worth.
//
// So the rules belong to the challenge, are copied in at creation, and are
// frozen the moment it goes live unless someone deliberately edits it.

const KINDS = {
  per_post: { icon: 'video', label: 'Per video posted' },
  views_threshold: { icon: 'chart', label: 'View milestone' },
  bonus: { icon: 'star', label: 'Bonus' },
}

let tempId = 0
const newRule = (kind) => ({
  id: `new-${tempId++}`,
  kind,
  label: kind === 'per_post' ? 'Video posted' : kind === 'views_threshold' ? 'Passed 10,000 views' : 'Bonus',
  points: kind === 'views_threshold' ? 5 : 1,
  threshold: kind === 'views_threshold' ? 10000 : null,
  max_points: kind === 'per_post' ? 10 : null,
})

// ONE ROW, AND THE SAME SHAPE WHATEVER THE RULE IS.
//
// Ethan's report was that the three kinds looked different from each other and
// that points and views were easy to mix up. Both were true, and they had the
// same cause: the second number moved around. A "per video" row put its cap
// before the points, a milestone row put its view count before the points, and
// a bonus row had nothing there at all - so the eye never learned where to look
// and the two numbers on a milestone row (5 and 10,000) sat in identical boxes
// meaning completely different things.
//
// Now: the name is always the same width, POINTS ALWAYS COMES FIRST and always
// looks the same, and whatever else the rule needs comes after it in a box that
// is visibly not a points box. You read every row the same way.
function Row({ rule, onChange, onRemove }) {
  const meta = KINDS[rule.kind] || KINDS.bonus
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-100 bg-white px-3 py-2.5">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cloud text-smoke" title={meta.label}>
        <Icon name={meta.icon} className="h-4 w-4" />
      </span>

      {/* Always the same width, whatever kind of rule this is. */}
      <input
        className="input !w-auto min-w-[8rem] flex-1 !py-1.5 !text-sm"
        value={rule.label}
        onChange={(e) => onChange({ ...rule, label: e.target.value })}
        aria-label="Rule name"
      />

      {/* POINTS. Brand-coloured and first, every time. */}
      <label className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand-tint px-2 py-1">
        <input
          type="number" step="0.5"
          className="w-14 border-0 bg-transparent p-0 text-center text-sm font-bold text-brand outline-none focus:ring-0"
          value={rule.points}
          onChange={(e) => onChange({ ...rule, points: Number(e.target.value) })}
          aria-label="Points"
        />
        <span className="text-xs font-semibold text-brand">pts</span>
      </label>

      {/* And what earns them. Plain, so it can never be read as a points box. */}
      {rule.kind === 'views_threshold' && (
        <label className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1">
          <span className="text-xs text-smoke">at</span>
          <input
            type="number"
            className="w-24 border-0 bg-transparent p-0 text-center text-sm tabular-nums outline-none focus:ring-0"
            value={rule.threshold ?? ''}
            onChange={(e) => onChange({ ...rule, threshold: e.target.value === '' ? null : Number(e.target.value) })}
            aria-label="View threshold"
          />
          <span className="text-xs text-smoke">views</span>
        </label>
      )}

      {rule.kind === 'per_post' && (
        <label className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 px-2 py-1">
          <span className="text-xs text-smoke">up to</span>
          <input
            type="number"
            className="w-14 border-0 bg-transparent p-0 text-center text-sm tabular-nums outline-none focus:ring-0"
            value={rule.max_points ?? ''}
            onChange={(e) => onChange({ ...rule, max_points: e.target.value === '' ? null : Number(e.target.value) })}
            aria-label="Maximum points"
          />
          <span className="text-xs text-smoke">pts</span>
        </label>
      )}

      {rule.kind === 'bonus' && (
        <span className="shrink-0 rounded-lg border border-dashed border-gray-200 px-2.5 py-1.5 text-xs text-smoke">
          given by an admin, on an entry
        </span>
      )}

      <button
        type="button" onClick={onRemove}
        className="shrink-0 rounded-lg p-1.5 text-smoke transition-colors hover:bg-red-50 hover:text-red-600"
        aria-label={`Remove ${rule.label}`}
      >
        <Icon name="trash" className="h-4 w-4" />
      </button>
    </div>
  )
}

export default function PointRulesEditor({ rules, onChange, thresholdMode, onThresholdMode }) {
  const add = (kind) => onChange([...rules, newRule(kind)])
  const update = (i, next) => onChange(rules.map((r, j) => (j === i ? next : r)))
  const remove = (i) => onChange(rules.filter((_, j) => j !== i))

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        {rules.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center">
            <p className="text-sm text-smoke">No rules yet, so nobody can score.</p>
            <button
              type="button"
              onClick={() => onChange(STARTER_POINT_RULES.map((r, i) => ({ ...r, id: `new-${tempId++}-${i}` })))}
              className="btn-secondary mt-3 !py-2 !px-4 !text-sm"
            >
              Use the standard set
            </button>
            <p className="mt-2 text-xs text-smoke">
              A point per video capped at ten, plus 5k / 10k / 50k view milestones.
            </p>
          </div>
        ) : (
          rules.map((r, i) => (
            <Row key={r.id ?? i} rule={r} onChange={(next) => update(i, next)} onRemove={() => remove(i)} />
          ))
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {Object.entries(KINDS).map(([kind, meta]) => (
          <button key={kind} type="button" onClick={() => add(kind)} className="btn-secondary !py-2 !px-4 !text-sm">
            <Icon name={meta.icon} className="h-4 w-4" /> {meta.label}
          </button>
        ))}
      </div>

      {/* Only meaningful once there is more than one milestone, so it hides
          itself rather than asking a question with one possible answer. */}
      {rules.filter((r) => r.kind === 'views_threshold').length > 1 && (
        <div className="rounded-xl bg-cloud/60 p-4">
          <p className="label">When a video passes several milestones</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[
              { value: 'highest', label: 'Highest one only' },
              { value: 'cumulative', label: 'Every one it passed' },
            ].map((o) => (
              <button
                key={o.value} type="button" onClick={() => onThresholdMode(o.value)}
                className={cx(
                  'rounded-full px-4 py-2 text-sm font-medium transition-all duration-200 hover:-translate-y-0.5',
                  thresholdMode === o.value
                    ? 'bg-brand text-white'
                    : 'border border-gray-200 text-smoke hover:border-brand hover:text-brand',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-smoke">
            {(() => {
              const tiers = rules.filter((r) => r.kind === 'views_threshold' && r.threshold)
                .sort((a, b) => a.threshold - b.threshold)
              const top = tiers[tiers.length - 1]
              if (!top) return null
              return thresholdMode === 'highest'
                ? `A video past ${top.threshold.toLocaleString()} views scores ${top.points} points.`
                : `A video past ${top.threshold.toLocaleString()} views scores ${tiers.reduce((s, t) => s + Number(t.points), 0)} points, every tier added together.`
            })()}
          </p>
        </div>
      )}
    </div>
  )
}
