import { useEffect, useState } from 'react'
import Icon from '../Icon'
import { Select } from '../ui'
import { STARTER_POINT_RULES, RULE_USES_THRESHOLD, CONSISTENCY_PERIODS, challengeWeeks, ruleWindowState, isSavedRuleId } from '../../lib/scoring'
import { confirm } from '../../lib/confirm'
import { DateField } from '../DateTimeFields'
import { cx } from '../../lib/utils'
import { useT } from '../../lib/i18n'

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
  // Migration 233. "+5 at the end for posting a video in all 4 weeks."
  consistency: { icon: 'calendar', label: 'Consistency bonus' },
}

let tempId = 0
const DEFAULTS = {
  per_post: { label: 'Video posted', points: 1, threshold: null, max_points: 10 },
  views_threshold: { label: 'Passed 10,000 views', points: 5, threshold: 10000, max_points: null },
  total_views_threshold: { label: 'Passed 25,000 views in total', points: 8, threshold: 25000, max_points: null },
  platform_spread: { label: 'Posted on another platform', points: 2, threshold: null, max_points: 8 },
  bonus: { label: 'Bonus', points: 1, threshold: null, max_points: null, prompt: '', min_views: null },
  consistency: { label: 'Posted every week', points: 5, threshold: null, max_points: null, period_days: 7 },
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
function NumberBox({ value, onChange, width = 'w-14', decimal = false, ariaLabel, dark = false, placeholder }) {
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
        // A LEADING ZERO IS DROPPED AS YOU TYPE. Clearing the points box used
        // to put a 0 straight back, so typing 2 read "02" (Ethan: "it shows
        // up as a zero first"). "0." is kept so a decimal is still reachable.
        const clean = e.target.value.replace(decimal ? /[^0-9.]/g : /[^0-9]/g, '').replace(/^0+(?=\d)/, '')
        setText(clean)
        onChange(clean === '' ? null : Number(clean))
      }}
      aria-label={ariaLabel}
      placeholder={placeholder}
      className={cx(
        'no-ios-zoom border-0 bg-transparent p-0 text-center outline-none focus:ring-0 sm:text-sm',
        width,
        dark ? 'font-bold text-white placeholder:text-white/50' : 'font-medium tabular-nums placeholder:font-normal placeholder:text-gray-300',
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

function Row({ rule, onChange, onRemove, weeks }) {
  const tr = useT()
  const meta = KINDS[rule.kind] || KINDS.bonus
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-3 py-2.5 transition-colors hover:border-brand/30">
    {/* ON A PHONE IT IS TWO LINES, NOT A WRAPPING HEAP (29 Sep 2026). Ethan: editing
        the points on mobile was fiddly. The row used to be a wrapping flex, so the
        name, the points box, the condition and the bin fell wherever the width let
        them. Now line one is always [icon] [name] [remove] and line two is always
        [points] [what earns them], each with its little label, at a 44px touch height.
        From `sm` up it is the five-column grid it always was (`contents` lets the
        second line's two boxes become grid cells again). */}
    <div className={cx('grid grid-cols-[2.25rem_minmax(0,1fr)_2.5rem] items-center gap-x-2 gap-y-2.5', ROW_GRID)}>
      <span className="order-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cloud text-smoke sm:order-1" title={meta.label}>
        <Icon name={meta.icon} className="h-4 w-4" />
      </span>

      {/* The only column that flexes. */}
      <input
        className="input order-2 !w-full min-w-0 !py-2 !no-ios-zoom sm:order-2 sm:!py-1.5 sm:text-sm"
        value={rule.label}
        onChange={(e) => onChange({ ...rule, label: e.target.value })}
        aria-label={tr("Rule name")}
      />

      {/* POINTS. First, every time, in SOLID Tryp orange, and in a column of a
          fixed width so "1 pts" starts exactly where "10 pts" starts.
          It was a pale wash of the brand with brand-coloured digits on it -
          the light orange Ethan has asked twice to stop seeing, and, worse,
          barely louder than the plain bordered box beside it holding a view
          count. The two numbers on a milestone row (5 and 10,000) mean
          completely different things and now look completely different:
          white on orange is the score, ink on white is the condition. */}
      <div className="order-4 col-span-3 flex items-stretch gap-2 sm:contents">
      <label className="flex min-h-[2.75rem] w-[5rem] shrink-0 items-center justify-center gap-1 rounded-lg bg-brand px-2 py-1.5 shadow-sm sm:order-3 sm:min-h-0 sm:w-full">
        <NumberBox
          value={rule.points}
          onChange={(v) => onChange({ ...rule, points: v })}
          width="w-8 sm:w-10"
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
      <div className="flex min-w-0 flex-1 items-center sm:order-4 [&>label]:min-h-[2.75rem] sm:[&>label]:min-h-0 [&>div]:min-h-[2.75rem] sm:[&>div]:min-h-0 [&>span]:flex [&>span]:min-h-[2.75rem] [&>span]:items-center sm:[&>span]:min-h-0">
        {rule.kind === 'views_threshold' && (
          <label className="flex w-full items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1.5 sm:px-2.5">
            <span className="hidden shrink-0 text-xs text-smoke sm:inline">at</span>
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
          <label className="flex w-full items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1.5 sm:px-2.5">
            <span className="hidden shrink-0 text-xs text-smoke sm:inline">at</span>
            <NumberBox
              value={rule.threshold}
              onChange={(v) => onChange({ ...rule, threshold: v })}
              width="w-full min-w-0"
              ariaLabel="Total view threshold"
            />
            <span className="shrink-0 whitespace-nowrap text-xs text-smoke">{tr("in total")}</span>
          </label>
        )}

        {(rule.kind === 'platform_spread' || rule.kind === 'per_post') && (
          <label className="flex w-full items-center gap-1.5 rounded-lg border border-gray-200 bg-white px-2 py-1.5 sm:px-2.5">
            <span className="shrink-0 whitespace-nowrap text-xs text-smoke">{tr("up to")}</span>
            <NumberBox
              value={rule.max_points}
              onChange={(v) => onChange({ ...rule, max_points: v })}
              width="w-full min-w-0"
              ariaLabel="Maximum points"
            />
            <span className="shrink-0 text-xs text-smoke">pts</span>
          </label>
        )}

        {rule.kind === 'consistency' && (
          <ConsistencyPeriod rule={rule} onChange={onChange} />
        )}

        {rule.kind === 'bonus' && (
          /* SHORT, because this cell has to fit the same column as "at 10,000
             views". It used to read "given by an admin, on an entry", which was
             the widest thing in the editor and pushed this row's delete button
             out of line with every other one. */
          <span className={cx(
            'w-full truncate rounded-lg border border-dashed px-2.5 py-1.5 text-xs sm:text-center',
            rule.prompt != null
              ? 'border-brand/40 bg-white font-medium text-brand'
              : 'border-gray-200 bg-white text-smoke',
          )}>
            {/* WHO GIVES IT, AND NOTHING ELSE. It used to add the view gate
                ("You award it, counts at 200"), which read as a to-do: the
                gate has its own labelled box in the panel below. */}
            {rule.prompt != null ? tr('Creator ticks a box') : tr('You award it')}
          </span>
        )}
      </div>

      </div>

      <button
        type="button" onClick={onRemove}
        className="order-3 flex h-10 w-10 shrink-0 items-center justify-center justify-self-end rounded-lg text-smoke transition-colors hover:bg-red-50 hover:text-red-600 sm:order-5 sm:h-auto sm:w-auto sm:p-1.5"
        aria-label={`Remove ${rule.label}`}
      >
        <Icon name="trash" className="h-4 w-4" />
      </button>
    </div>

    {/* THE BONUS SETTINGS, AS ONE PANEL (21 Sep 2026).
        Ethan: "could you tidy up the way the bonus points currently look,
        because it seems a bit scattered and misaligned with the other style."
        It was three free-standing sentences, each with a box dropped somewhere
        along it, so no two boxes lined up. Now it is one tinted panel under the
        row, indented to the name column, with three labelled fields: the
        question (what makes the bonus automatic), the view gate, and the cap.

        THE QUESTION: typing one turns this bonus into a tick box on the submit
        form, awarded from the answer. Blank means an admin awards it from the
        results page. Since migration 233 either way is a CLAIM, so the view
        gate and the cap hold however the bonus was given.
        THE GATE: the claim is kept; only the award waits for the views, and it
        lands by itself on the sync that carries the video past the number.
        THE CAP: "for each one they can only get a max of 9 extra points from
        this bonus" - first qualifying entries by submission time. */}
    {rule.kind === 'bonus' && (
      <div className="mt-2.5 space-y-3 rounded-xl bg-cloud/70 p-3 sm:ml-[2.875rem]">
      {/* HOW IT IS EARNED, AS A CHOICE (26 Sep 2026). Ethan: "the bonus thing
          with all those different things seems a bit confusing ... make it more
          user-friendly to the admins." It used to be a question box whose
          meaning changed when it was left blank. Now it is two buttons that say
          what happens, and the question only appears for the one that needs it.
          A null prompt is "I award it"; a string (even empty while typing) is
          "creator ticks a box". Saving trims an empty one back to null. */}
      <div>
        <span className="mb-1.5 block text-[11px] font-semibold text-smoke">{tr("How it is earned")}</span>
        <div className="grid grid-cols-2 gap-1.5 sm:max-w-md">
          {[
            { on: rule.prompt != null, label: tr('Creator ticks a box'), icon: 'check', set: () => onChange({ ...rule, prompt: rule.prompt ?? '' }) },
            { on: rule.prompt == null, label: tr('I award it'), icon: 'star', set: () => onChange({ ...rule, prompt: null }) },
          ].map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={o.set}
              aria-pressed={o.on}
              className={cx(
                'flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition-all duration-200',
                o.on ? 'bg-brand text-white shadow-sm' : 'border border-gray-200 bg-white text-smoke hover:border-brand/40 hover:text-ink',
              )}
            >
              <Icon name={o.icon} className="h-3.5 w-3.5" />
              {o.label}
            </button>
          ))}
        </div>
      </div>
      <div className={cx('grid gap-3', rule.prompt != null ? 'sm:grid-cols-[minmax(0,1fr)_9.5rem_9.5rem]' : 'sm:grid-cols-2 sm:max-w-md')}>
        {rule.prompt != null && (
          <label className="block min-w-0">
            <span className="mb-1 block text-[11px] font-semibold text-smoke">{tr("The question on the submit form")}</span>
            <input
              className="input !h-[38px] !py-0 !no-ios-zoom sm:text-sm"
              value={rule.prompt ?? ''}
              onChange={(e) => onChange({ ...rule, prompt: e.target.value })}
              placeholder={tr("Does this video feature a Christmas market?")}
            />
          </label>
        )}
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-smoke">{tr("Views needed")}</span>
          <span className="flex h-[38px] items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3">
            <NumberBox
              value={rule.min_views ?? null}
              onChange={(v) => onChange({ ...rule, min_views: v })}
              width="w-full min-w-0 !text-left"
              placeholder="any"
              ariaLabel="Views the entry must reach before this bonus is awarded"
            />
            <span className="shrink-0 text-xs text-smoke">{tr("views")}</span>
          </span>
          <span className="mt-1 block text-[11px] text-smoke">
            {rule.min_views > 0 ? tr('Held until the video passes this') : tr('Blank: counts straight away')}
          </span>
        </label>
        <label className="block">
          <span className="mb-1 block text-[11px] font-semibold text-smoke">{tr("Most per creator")}</span>
          <span className="flex h-[38px] items-center gap-1.5 rounded-xl border border-gray-200 bg-white px-3">
            <NumberBox
              value={rule.max_points ?? null}
              onChange={(v) => onChange({ ...rule, max_points: v })}
              width="w-full min-w-0 !text-left"
              decimal
              placeholder="none"
              ariaLabel="Most points one creator can earn from this bonus"
            />
            <span className="shrink-0 text-xs text-smoke">pts</span>
          </span>
          <span className="mt-1 block text-[11px] text-smoke">{tr("Blank: no limit")}</span>
        </label>
      </div>
      <BonusWindow rule={rule} onChange={onChange} weeks={weeks} />
      </div>
    )}
    </div>
  )
}

// WHEN A BONUS RUNS (migration 256).
//
// Ethan: "maybe I want the bonus point to run for the whole challenge, or maybe
// just for a certain period or a certain week... so there's a different bonus
// point every week." The only way to stop one used to be deleting it, which
// took everybody's points with it.
//
// Three answers, one control: the whole challenge, one of its weeks (worked
// out from the challenge's own dates, so "Week 2" means the same thing here as
// it does to a creator), or two dates. It counts for entries SUBMITTED inside
// the window, and ending it early keeps every point already earned.
const dayMonth = (iso) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
const toLocalYmd = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
// A picked DAY runs from the first minute of the from-day to the last of the
// until-day, on this computer's clock - the same clock the challenge's own
// dates are typed in.
const dayStart = (ymd) => (ymd ? new Date(`${ymd}T00:00:00`).toISOString() : null)
const dayEnd = (ymd) => (ymd ? new Date(`${ymd}T23:59:00`).toISOString() : null)

function BonusWindow({ rule, onChange, weeks }) {
  const tr = useT()
  const weekOf = weeks.find((w) => w.starts_at === rule.starts_at && w.ends_at === rule.ends_at)
  const [custom, setCustom] = useState(() => !!(rule.starts_at || rule.ends_at) && !weekOf)
  const choice = custom ? 'custom' : weekOf ? `w${weekOf.n}` : (rule.starts_at || rule.ends_at) ? 'custom' : 'all'
  const options = [
    { value: 'all', label: tr('The whole challenge') },
    ...weeks.map((w) => ({ value: `w${w.n}`, label: `${tr('Week {n}', { n: w.n })}  ·  ${dayMonth(w.starts_at)} to ${dayMonth(w.ends_at)}` })),
    { value: 'custom', label: tr('Pick the dates') },
  ]
  const state = ruleWindowState(rule)
  const STATE = {
    upcoming: { text: tr('Starts {d}', { d: rule.starts_at ? dayMonth(rule.starts_at) : '' }), cls: 'bg-white text-smoke ring-1 ring-gray-200' },
    live: { text: rule.ends_at ? tr('Running, ends {d}', { d: dayMonth(rule.ends_at) }) : tr('Running'), cls: 'bg-brand text-white' },
    ended: { text: tr('Ended {d}, points kept', { d: rule.ends_at ? dayMonth(rule.ends_at) : '' }), cls: 'bg-ink text-white' },
  }[state]

  return (
    <div className="grid gap-3 border-t border-gray-200/70 pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div className="min-w-0">
        <span className="mb-1 flex items-center gap-2 text-[11px] font-semibold text-smoke">
          {tr('When it runs')}
          {STATE && <span className={cx('rounded-full px-2 py-0.5 text-[10px] font-semibold', STATE.cls)}>{STATE.text}</span>}
        </span>
        <Select
          className="w-full"
          ariaLabel="When this bonus runs"
          value={choice}
          onChange={(v) => {
            if (v === 'all') { setCustom(false); onChange({ ...rule, starts_at: null, ends_at: null }) }
            else if (v === 'custom') { setCustom(true) }
            else {
              const w = weeks.find((x) => `w${x.n}` === v)
              setCustom(false)
              if (w) onChange({ ...rule, starts_at: w.starts_at, ends_at: w.ends_at })
            }
          }}
          options={options}
        />
        {choice === 'custom' && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <DateField
              id={`bonus-from-${rule.id}`}
              label={tr('From')}
              value={toLocalYmd(rule.starts_at)}
              onChange={(ymd) => onChange({ ...rule, starts_at: dayStart(ymd) })}
            />
            <DateField
              id={`bonus-until-${rule.id}`}
              label={tr('Until the end of')}
              value={toLocalYmd(rule.ends_at)}
              min={toLocalYmd(rule.starts_at) || undefined}
              onChange={(ymd) => onChange({ ...rule, ends_at: dayEnd(ymd) })}
              futureError="The bonus would end before it starts."
            />
          </div>
        )}
        <span className="mt-1 block text-[11px] text-smoke">
          {tr('Counts for entries submitted in this window. Ending it keeps every point already earned.')}
        </span>
      </div>
      {state !== 'ended' && state !== 'upcoming' && (
        <button
          type="button"
          onClick={() => { setCustom(true); onChange({ ...rule, ends_at: new Date().toISOString() }) }}
          className="btn-secondary !h-[38px] !px-3 !py-0 !text-xs"
          title={tr('Stop this bonus now. Points already earned stay.')}
        >
          <Icon name="clock" className="h-3.5 w-3.5" />
          {tr('End it now')}
        </button>
      )}
    </div>
  )
}

// HOW OFTEN A CREATOR HAS TO POST, for the consistency bonus. Every day, every
// week, or any number of days. Windows are counted from the challenge's start
// to its deadline, and the points land by themselves on the entry that fills
// the last empty window.
function ConsistencyPeriod({ rule, onChange }) {
  const tr = useT()
  const days = Number(rule.period_days) || 7
  // `custom` sticks once chosen, even when the number typed happens to be 7,
  // so the box does not vanish from under somebody typing "14".
  const [custom, setCustom] = useState(() => !CONSISTENCY_PERIODS.some((p) => p.days === days))
  const named = !custom && CONSISTENCY_PERIODS.find((p) => p.days === days)
  // THE PLATFORM'S OWN DROPDOWN. It was a native <select>, which opens the
  // operating system's menu - Ethan: "this UI is the weird Apple [menu]. It's
  // not our custom UI, so please fix that."
  const options = [
    ...CONSISTENCY_PERIODS.map((p) => ({ value: String(p.days), label: tr(p.label.charAt(0).toUpperCase() + p.label.slice(1)) })),
    { value: 'custom', label: tr('Every few days') },
  ]
  return (
    <div className="flex w-full min-w-0 items-center gap-1.5">
      <Select
        variant="chip"
        className="min-w-0 flex-1"
        ariaLabel="How often they have to post"
        value={named ? String(days) : 'custom'}
        onChange={(v) => {
          if (v === 'custom') { setCustom(true); onChange({ ...rule, period_days: 3 }) }
          else { setCustom(false); onChange({ ...rule, period_days: Number(v) }) }
        }}
        options={options}
      />
      {!named && (
        <span className="flex shrink-0 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2 py-1.5">
          <NumberBox
            value={rule.period_days ?? null}
            onChange={(v) => onChange({ ...rule, period_days: v })}
            width="w-7"
            ariaLabel="Days in each window"
          />
          <span className="text-xs text-smoke">{tr("days")}</span>
        </span>
      )}
    </div>
  )
}

export default function PointRulesEditor({ rules, onChange, thresholdMode, onThresholdMode, challengeStart, challengeEnd }) {
  const tr = useT()
  const weeks = challengeWeeks(challengeStart, challengeEnd)
  const add = (kind) => onChange([...rules, newRule(kind)])
  const update = (i, next) => onChange(rules.map((r, j) => (j === i ? next : r)))
  // REMOVING A SAVED BONUS TAKES ITS POINTS BACK FROM EVERYBODY (the claims
  // cascade). That is almost never what "stop this bonus" means, so it says so
  // and offers the thing that is: end it today and keep what was earned.
  const remove = async (i) => {
    const r = rules[i]
    if (r?.kind === 'bonus' && isSavedRuleId(r.id)) {
      const endInstead = await confirm(
        'Removing this bonus takes its points back from everyone who earned them.\n\nTo stop it without losing anybody\'s points, end it today instead.',
        { title: 'Remove or end this bonus?', confirmLabel: 'End it today, keep points', cancelLabel: 'Remove it' },
      )
      if (endInstead) { update(i, { ...r, ends_at: new Date().toISOString() }); return }
      const sure = await confirm('Every point earned from this bonus will be taken back when you save.', { title: 'Remove the bonus?', confirmLabel: 'Remove it', danger: true })
      if (!sure) return
    }
    onChange(rules.filter((_, j) => j !== i))
  }

  // TWO SECTIONS, EACH WITH ITS OWN ADD BUTTONS (26 Sep 2026). One list of
  // every kind, with six add-buttons under it, mixed view milestones in among
  // bonuses and made the section hard to read. The indexes into `rules` are
  // kept so edits land on the right row whichever section draws it.
  const indexed = rules.map((r, i) => ({ r, i }))
  const milestones = indexed.filter(({ r }) => RULE_USES_THRESHOLD.has(r.kind))
  const extras = indexed.filter(({ r }) => !RULE_USES_THRESHOLD.has(r.kind))
  const addButton = (kind, label) => {
    const meta = KINDS[kind]
    return (
      <button
        key={kind}
        type="button"
        onClick={() => add(kind)}
        className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-gray-300 bg-white px-3 py-2.5 text-xs font-semibold text-smoke transition-all duration-200 hoverable:hover:-translate-y-0.5 hover:border-brand hover:text-brand"
      >
        <Icon name="plus" className="h-3.5 w-3.5 shrink-0" />
        <Icon name={meta.icon} className="h-4 w-4 shrink-0" />
        <span className="min-w-0 truncate">{label || meta.label}</span>
      </button>
    )
  }

  return (
    <div className="space-y-6">
      {rules.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 px-4 py-6 text-center">
          <p className="text-sm text-smoke">{tr("No rules yet, so nobody can score.")}</p>
          <button
            type="button"
            onClick={() => onChange(STARTER_POINT_RULES.map((r, i) => ({ ...r, id: `new-${tempId++}-${i}` })))}
            className="btn-secondary mt-3 !py-2 !px-4 !text-sm"
          >
            {tr("Use the standard set")}
          </button>
          <p className="mt-2 text-xs text-smoke">
            {tr("A point per video capped at ten, plus 5k / 10k / 50k view milestones.")}
          </p>
        </div>
      )}

      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="text-sm font-semibold text-ink">{tr("View milestones")}</p>
          <p className="text-[11px] text-smoke">{tr("Points for views")}</p>
        </div>
        <div className="space-y-2">
          {milestones.map(({ r, i }) => (
            <Row key={r.id ?? i} rule={r} weeks={weeks} onChange={(next) => update(i, next)} onRemove={() => remove(i)} />
          ))}
        </div>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {addButton('views_threshold', tr('Add a milestone on one video'))}
          {addButton('total_views_threshold', tr('Add a milestone on total views'))}
        </div>
      </section>

      {/* Only meaningful once there is more than one milestone, so it hides
          itself rather than asking a question with one possible answer. */}
      {rules.filter((r) => RULE_USES_THRESHOLD.has(r.kind)).length > 1 && (
        /* TWO ANSWERS, DRAWN THE SAME SIZE, WITH THE CONSEQUENCE UNDERNEATH.
           It was two pills of different widths on a tinted panel, so the
           question read as a filter rather than as a decision that changes
           what everybody scores. Equal halves, and the line below says what
           the current answer actually costs in points. */
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <p className="label">{tr("When a video passes several milestones")}</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {[
              { value: 'highest', label: 'Highest one only' },
              { value: 'cumulative', label: 'Every one it passed' },
            ].map((o) => (
              <button
                key={o.value} type="button" onClick={() => onThresholdMode(o.value)}
                aria-pressed={thresholdMode === o.value}
                className={cx(
                  'rounded-xl border px-4 py-2.5 text-sm font-semibold transition-all duration-200 hoverable:hover:-translate-y-0.5 hoverable:hover:scale-[1.03]',
                  thresholdMode === o.value
                    ? 'border-brand bg-brand text-white shadow-card glow-brand'
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

      <section className="rounded-2xl border border-brand/15 bg-brand-tint/20 p-3 sm:p-4">
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Icon name="star" className="h-4 w-4 text-brand" />
            {tr("Bonus points")}
          </p>
          <p className="text-[11px] text-smoke">{tr("On top of the views")}</p>
        </div>
        <div className="space-y-2">
          {extras.length === 0 && (
            <p className="rounded-xl border border-dashed border-gray-200 bg-white px-4 py-4 text-center text-xs text-smoke">{tr("No bonuses yet. Add one below.")}</p>
          )}
          {extras.map(({ r, i }) => (
            <Row key={r.id ?? i} rule={r} weeks={weeks} onChange={(next) => update(i, next)} onRemove={() => remove(i)} />
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 lg:grid-cols-4">
          {addButton('bonus', tr('Special bonus'))}
          {addButton('per_post', tr('Per video'))}
          {addButton('platform_spread', tr('Per platform'))}
          {addButton('consistency', tr('Posting streak'))}
        </div>
      </section>
    </div>
  )
}
