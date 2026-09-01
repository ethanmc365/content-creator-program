import { useEffect, useState } from 'react'
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

// A NUMBER YOU TYPE, NOT ONE YOU CLICK UP AND DOWN.
//
// Ethan: "I don't like that you have those clicking arrows to change it, I just
// want to be able to type in the number, so it will look clean."
//
// `type="number"` brings spinners, changes value on a scroll wheel that was
// only passing over the field, and on several phones opens a keypad with no
// minus or decimal. A text field with `inputMode` is the same keyboard without
// any of that.
//
// IT HOLDS ITS OWN STRING WHILE YOU TYPE. Parsing on every keystroke and
// writing the number straight back makes "0." unreachable (it parses to 0 and
// re-renders as "0") and makes an empty box impossible to have for the moment
// between deleting one number and typing the next. So the text is local, the
// NUMBER goes up on every change, and the prop only overwrites the text when it
// says something different from what is already in the box.
function NumberBox({ value, onChange, width = 'w-14', decimal = false, ariaLabel, dark = false }) {
  const [text, setText] = useState(value == null ? '' : String(value))
  useEffect(() => {
    const mine = text === '' ? null : Number(text)
    if (mine !== value) setText(value == null ? '' : String(value))
    // Only when the VALUE changes: `text` is deliberately not a dependency, or
    // this fires on every keystroke and undoes the line above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])
  return (
    <input
      type="text"
      inputMode={decimal ? 'decimal' : 'numeric'}
      value={text}
      onChange={(e) => {
        const clean = e.target.value.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '')
        setText(clean)
        onChange(clean === '' ? null : Number(clean))
      }}
      aria-label={ariaLabel}
      className={cx(
        'border-0 bg-transparent p-0 text-center text-sm outline-none focus:ring-0',
        width,
        dark ? 'font-bold text-white placeholder:text-white/50' : 'font-medium tabular-nums',
      )}
    />
  )
}

// ONE ROW, AND THE SAME SHAPE WHATEVER THE RULE IS.
//
// Ethan's first report was that the three kinds looked different from each
// other and that points and views were easy to mix up. Both were true, and they
// had the same cause: the second number moved around. A "per video" row put its
// cap before the points, a milestone row put its view count before the points,
// and a bonus row had nothing there at all - so the eye never learned where to
// look and the two numbers on a milestone row (5 and 10,000) sat in identical
// boxes meaning completely different things.
//
// So: the name is always the same width, POINTS ALWAYS COMES FIRST and always
// looks the same, and whatever else the rule needs comes after it in a box that
// is visibly not a points box.
//
// AND THEN IT WAS STILL NOT ALIGNED, WHICH IS THE SECOND REPORT.
// Ethan: "it annoys me that the video posted shows one point, and then below
// it's two points, five points, ten points - they're misaligned. The one point
// is more to the right than the others. I think it's because the [box] after
// the points is different."
//
// He diagnosed it exactly. The row was a FLEX with a `flex-1` name field, so
// the name absorbed whatever the trailing box did not use - and the trailing
// box is a different width on every kind of rule ("at 10,000 views" is much
// wider than "up to 10 pts"). Every column after the name therefore sat
// somewhere different on every row.
//
// It is a GRID from `sm` now, with the points column and the condition column
// both fixed. The name is the only thing that flexes, which is the only thing
// that should: a rule's name is the one part of it with no natural width. Below
// `sm` it stays a wrapping flex, because five fixed columns do not fit on a
// phone and stacking them is the honest answer there.
const ROW_GRID = 'sm:grid sm:grid-cols-[2.25rem_minmax(6rem,1fr)_6.5rem_12rem_2.25rem] sm:items-center'

function Row({ rule, onChange, onRemove }) {
  const meta = KINDS[rule.kind] || KINDS.bonus
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 transition-colors hover:border-brand/30">
    <div className={cx('flex flex-wrap items-center gap-2.5', ROW_GRID)}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cloud text-smoke" title={meta.label}>
        <Icon name={meta.icon} className="h-4 w-4" />
      </span>

      {/* The only column that flexes. */}
      <input
        className="input !w-auto min-w-[8rem] flex-1 !py-1.5 !text-sm sm:!w-full sm:flex-none"
        value={rule.label}
        onChange={(e) => onChange({ ...rule, label: e.target.value })}
        aria-label="Rule name"
      />

      {/* POINTS. First, every time, in SOLID Tryp orange, and in a column of a
          fixed width so "1 pts" starts exactly where "10 pts" starts.
          It was a pale wash of the brand with brand-coloured digits on it -
          the light orange Ethan has asked twice to stop seeing, and, worse,
          barely louder than the plain bordered box beside it holding a view
          count. The two numbers on a milestone row (5 and 10,000) mean
          completely different things and now look completely different:
          white on orange is the score, ink on white is the condition. */}
      <label className="flex w-fit shrink-0 items-center justify-center gap-1.5 rounded-lg bg-brand px-2.5 py-1.5 shadow-sm sm:w-full">
        <NumberBox
          value={rule.points}
          onChange={(v) => onChange({ ...rule, points: v ?? 0 })}
          width="w-10"
          decimal
          dark
          ariaLabel="Points"
        />
        <span className="text-xs font-semibold text-white/90">pts</span>
      </label>

      {/* AND WHAT EARNS THEM, in its own fixed column so the rows line up even
          though no two kinds of rule ask for the same thing. The cell is always
          rendered - an empty one still has to hold the column open, or the
          delete button on a bonus row would slide left past every other row's.
          Plain white, so it can never be read as a points box. */}
      <div className="flex min-w-0 items-center">
        {rule.kind === 'views_threshold' && (
          <label className="flex w-fit items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 sm:w-full">
            <span className="shrink-0 text-xs text-smoke">at</span>
            <NumberBox
              value={rule.threshold}
              onChange={(v) => onChange({ ...rule, threshold: v })}
              width="w-full min-w-0"
              ariaLabel="View threshold"
            />
            <span className="shrink-0 text-xs text-smoke">views</span>
          </label>
        )}

        {rule.kind === 'total_views_threshold' && (
          <label className="flex w-fit items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 sm:w-full">
            <span className="shrink-0 text-xs text-smoke">at</span>
            <NumberBox
              value={rule.threshold}
              onChange={(v) => onChange({ ...rule, threshold: v })}
              width="w-full min-w-0"
              ariaLabel="Total view threshold"
            />
            <span className="shrink-0 whitespace-nowrap text-xs text-smoke">in total</span>
          </label>
        )}

        {(rule.kind === 'platform_spread' || rule.kind === 'per_post') && (
          <label className="flex w-fit items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 sm:w-full">
            <span className="shrink-0 whitespace-nowrap text-xs text-smoke">up to</span>
            <NumberBox
              value={rule.max_points}
              onChange={(v) => onChange({ ...rule, max_points: v })}
              width="w-full min-w-0"
              ariaLabel="Maximum points"
            />
            <span className="shrink-0 text-xs text-smoke">pts</span>
          </label>
        )}

        {rule.kind === 'bonus' && (
          /* SHORT, because this cell has to fit the same column as "at 10,000
             views". It used to read "given by an admin, on an entry", which was
             the widest thing in the editor and pushed this row's delete button
             out of line with every other one. */
          <span className={cx(
            'w-fit truncate rounded-lg border border-dashed px-2.5 py-1.5 text-xs sm:w-full sm:text-center',
            rule.prompt?.trim()
              ? 'border-green-200 bg-green-50 text-green-700'
              : 'border-gray-200 bg-white text-smoke',
          )}>
            {rule.prompt?.trim() ? 'Creator claims it' : 'You award it'}
          </span>
        )}
      </div>

      <button
        type="button" onClick={onRemove}
        className="shrink-0 justify-self-end rounded-lg p-1.5 text-smoke transition-colors hover:bg-red-50 hover:text-red-600"
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

      {/* THE FIVE KINDS, AS A GRID RATHER THAN A WRAPPING ROW.
          Ethan: "improve the UI and design of per video posted, view milestone,
          total views milestone, per platform posted on - and make sure it is
          aligned."
          Five `btn-secondary` pills of five different widths wrapped into a
          ragged two-and-a-half lines under a set of rows that had just been
          brought into alignment, which made the alignment above look accidental.
          A grid gives them one width each, in tidy rows, and reads as a palette
          of things you can add rather than a sentence that ran on. The dashed
          border says the same: these make something, they are not actions on
          what is already there. */}
      <div>
        <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-smoke">Add a rule</p>
        <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {Object.entries(KINDS).map(([kind, meta]) => (
            <button
              key={kind}
              type="button"
              onClick={() => add(kind)}
              className="flex items-center gap-2 rounded-xl border border-dashed border-gray-300 px-3 py-2.5 text-left text-xs font-medium text-smoke transition-all duration-200 hover:-translate-y-0.5 hover:border-brand hover:text-brand"
            >
              <Icon name={meta.icon} className="h-4 w-4 shrink-0" />
              <span className="min-w-0 leading-tight">{meta.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Only meaningful once there is more than one milestone, so it hides
          itself rather than asking a question with one possible answer. */}
      {rules.filter((r) => RULE_USES_THRESHOLD.has(r.kind)).length > 1 && (
        /* TWO ANSWERS, DRAWN THE SAME SIZE, WITH THE CONSEQUENCE UNDERNEATH.
           It was two pills of different widths on a tinted panel, so the
           question read as a filter rather than as a decision that changes
           what everybody scores. Equal halves, and the line below says what
           the current answer actually costs in points. */
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="label">When a video passes several milestones</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {[
              { value: 'highest', label: 'Highest one only' },
              { value: 'cumulative', label: 'Every one it passed' },
            ].map((o) => (
              <button
                key={o.value} type="button" onClick={() => onThresholdMode(o.value)}
                aria-pressed={thresholdMode === o.value}
                className={cx(
                  'rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all duration-200 hover:-translate-y-0.5',
                  thresholdMode === o.value
                    ? 'border-brand bg-brand text-white shadow-card'
                    : 'border-gray-200 bg-white text-smoke hover:border-brand hover:text-brand',
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
          <p className="mt-2.5 text-xs text-smoke">
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
