import Icon from '../Icon'
import { STARTER_POINT_RULES, RULE_USES_THRESHOLD } from '../../lib/scoring'
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

// FIVE KINDS, AND WHAT EACH ONE IS ACTUALLY FOR.
//
// The first three were all about ONE video, which quietly says "post a lot"
// and says nothing about the two things the programme wants. The two new ones
// say them:
//
//   Total views  - a creator with five videos at 4k out-reaches one with a
//                  single 15k video, and used to score nothing for it.
//   Platforms    - cross-posting is the cheapest reach there is, and nothing
//                  rewarded it.
const KINDS = {
  per_post: { icon: 'video', label: 'Per video posted' },
  views_threshold: { icon: 'chart', label: 'View milestone' },
  total_views_threshold: { icon: 'trophy', label: 'Total views milestone' },
  platform_spread: { icon: 'share', label: 'Per platform posted on' },
  bonus: { icon: 'star', label: 'Bonus' },
}

let tempId = 0
const DEFAULTS = {
  per_post: { label: 'Video posted', points: 1, threshold: null, max_points: 10 },
  views_threshold: { label: 'Passed 10,000 views', points: 5, threshold: 10000, max_points: null },
  total_views_threshold: { label: 'Passed 25,000 views in total', points: 8, threshold: 25000, max_points: null },
  platform_spread: { label: 'Posted on another platform', points: 2, threshold: null, max_points: 8 },
  bonus: { label: 'Bonus', points: 1, threshold: null, max_points: null, prompt: '' },
}

const newRule = (kind) => ({ id: `new-${tempId++}`, kind, ...(DEFAULTS[kind] || DEFAULTS.bonus) })

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
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 transition-colors hover:border-brand/30">
    <div className="flex flex-wrap items-center gap-2.5">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cloud text-smoke" title={meta.label}>
        <Icon name={meta.icon} className="h-4 w-4" />
      </span>

      {/* Always the same width, whatever kind of rule this is. */}
      <input
        className="input !w-auto min-w-[8rem] flex-1 !py-1.5 !text-sm"
        value={rule.label}
        onChange={(e) => onChange({ ...rule, label: e.target.value })}
        aria-label="Rule name"
      />

      {/* POINTS. First, every time, and in SOLID Tryp orange.
          It was a pale wash of the brand with brand-coloured digits on it -
          the light orange Ethan has asked twice to stop seeing, and, worse,
          barely louder than the plain bordered box beside it holding a view
          count. The two numbers on a milestone row (5 and 10,000) mean
          completely different things and now look completely different:
          white on orange is the score, ink on white is the condition. */}
      <label className="flex shrink-0 items-center gap-1.5 rounded-lg bg-brand px-2.5 py-1.5 shadow-sm">
        <input
          type="number" step="0.5"
          className="w-12 border-0 bg-transparent p-0 text-center text-sm font-bold text-white outline-none placeholder:text-white/50 focus:ring-0"
          value={rule.points}
          onChange={(e) => onChange({ ...rule, points: Number(e.target.value) })}
          aria-label="Points"
        />
        <span className="text-xs font-semibold text-white/90">pts</span>
      </label>

      {/* And what earns them. Plain, so it can never be read as a points box. */}
      {rule.kind === 'views_threshold' && (
        <label className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
          <span className="text-xs text-smoke">at</span>
          <input
            type="number"
            className="w-24 border-0 bg-transparent p-0 text-center text-sm font-medium tabular-nums outline-none focus:ring-0"
            value={rule.threshold ?? ''}
            onChange={(e) => onChange({ ...rule, threshold: e.target.value === '' ? null : Number(e.target.value) })}
            aria-label="View threshold"
          />
          <span className="text-xs text-smoke">views</span>
        </label>
      )}

      {rule.kind === 'total_views_threshold' && (
        <label className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
          <span className="text-xs text-smoke">at</span>
          <input
            type="number"
            className="w-24 border-0 bg-transparent p-0 text-center text-sm font-medium tabular-nums outline-none focus:ring-0"
            value={rule.threshold ?? ''}
            onChange={(e) => onChange({ ...rule, threshold: e.target.value === '' ? null : Number(e.target.value) })}
            aria-label="Total view threshold"
          />
          <span className="text-xs text-smoke">views in total</span>
        </label>
      )}

      {rule.kind === 'platform_spread' && (
        <label className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
          <span className="text-xs text-smoke">each, up to</span>
          <input
            type="number"
            className="w-14 border-0 bg-transparent p-0 text-center text-sm font-medium tabular-nums outline-none focus:ring-0"
            value={rule.max_points ?? ''}
            onChange={(e) => onChange({ ...rule, max_points: e.target.value === '' ? null : Number(e.target.value) })}
            aria-label="Maximum points"
          />
          <span className="text-xs text-smoke">pts</span>
        </label>
      )}

      {rule.kind === 'per_post' && (
        <label className="flex shrink-0 items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5">
          <span className="text-xs text-smoke">up to</span>
          <input
            type="number"
            className="w-14 border-0 bg-transparent p-0 text-center text-sm font-medium tabular-nums outline-none focus:ring-0"
            value={rule.max_points ?? ''}
            onChange={(e) => onChange({ ...rule, max_points: e.target.value === '' ? null : Number(e.target.value) })}
            aria-label="Maximum points"
          />
          <span className="text-xs text-smoke">pts</span>
        </label>
      )}

      {rule.kind === 'bonus' && (
        <span className={cx(
          'shrink-0 rounded-lg border border-dashed px-2.5 py-1.5 text-xs',
          rule.prompt?.trim()
            ? 'border-green-200 bg-green-50 text-green-700'
            : 'border-gray-200 bg-white text-smoke',
        )}>
          {rule.prompt?.trim() ? 'claimed by the creator' : 'given by an admin, on an entry'}
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

    {/* THE QUESTION, WHICH IS WHAT MAKES A BONUS AUTOMATIC.
        Ethan: "when an admin sets up bonus points they should enter what the
        bonus points are for... the admin should also select or write the
        message that shows up when a creator submits the video, like 'Is this
        video featuring a Christmas market?', and ticking the box would then
        automatically update the points - this would mean the points system is
        fully automated again, no manual checking."
        Typing a question here turns this bonus into a tick box on the submit
        form and awards it from the answer. Leaving it blank keeps the bonus
        exactly as bonuses have always worked - handed out by an admin from the
        results page - which is why every bonus already in the database goes on
        behaving the way its market expects. The chip above says which it is. */}
    {rule.kind === 'bonus' && (
      <label className="mt-2.5 block">
        <span className="mb-1 block text-[11px] font-medium text-smoke">
          Ask the creator when they submit <span className="font-normal">(leave blank to award it yourself)</span>
        </span>
        <input
          className="input !py-1.5 !text-sm"
          value={rule.prompt ?? ''}
          onChange={(e) => onChange({ ...rule, prompt: e.target.value })}
          placeholder="Is this video featuring a Christmas market?"
        />
      </label>
    )}
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
      {rules.filter((r) => RULE_USES_THRESHOLD.has(r.kind)).length > 1 && (
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
              const tiers = rules.filter((r) => RULE_USES_THRESHOLD.has(r.kind) && r.threshold)
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
