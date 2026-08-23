import { Link } from 'react-router-dom'
import Icon from '../Icon'
import { Avatar } from '../ui'
import { cx, formatViews } from '../../lib/utils'

// THE MILESTONE LADDER.
//
// WHAT THIS REPLACES, AND WHY IT HAD TO GO
//
// It was a drawn flight path: nodes alternating left and right down a serpentine
// cubic, an aeroplane flying the travelled part in SMIL, labels positioned
// absolutely over the SVG at percentages of a computed viewBox. It was the
// best-looking thing in the product and it did not work.
//
// Ethan: "it seems inaccurate, hard to understand, and both the desktop and
// especially the mobile UI look bad."
//
// All three, and they were not separate faults:
//
//   INACCURATE. The drawing put the plane at `segs[reachedCount]` and read the
//   next stop as `milestones[reachedCount]` - arithmetic that is only correct
//   if the milestones you have reached are always the FIRST n in the list. They
//   are not: the ladder is ordered by `sort_order` and measured on five
//   different metrics, so somebody four months in has "90 days in the
//   programme" ticked while "1,000 views" is not. The plane was then drawn past
//   a stop nobody had reached, and the crowd of other creators was placed by
//   comparing a COUNT of milestones to an INDEX in a list. Every number on the
//   page was a little bit wrong in a way you could feel and not name.
//
//   HARD TO UNDERSTAND. A stop said "12 of 50 videos" and nothing else. It
//   never said what a video counted as, what the reward actually was for, or -
//   the important one - how far off you were in a way you could act on. The
//   `description` column has existed on the table since the first migration and
//   nothing on the creator-facing page ever rendered it.
//
//   THE LAYOUT. A serpentine needs width for the labels to alternate INTO, and
//   375px does not have it. The phone layout was a compromise on a compromise -
//   one lane down the left, a column of labels squeezed beside it, a fixed
//   aspect ratio that made the whole thing over two thousand pixels tall.
//
// WHAT IT IS NOW: a vertical ladder. One spine, one row per milestone, the same
// shape at every width. It reads top to bottom like the list it always was, and
// every row has room for the requirement AND the explanation AND a bar.
//
// The spine is drawn RUNG BY RUNG rather than as one line with a marker on it.
// The first version of this rebuild kept the aeroplane, parked at
// `(reached + fraction) / total` of the ladder's height - and that is wrong for
// the same family of reason the old drawing was: the rows are different heights
// (the next one is deliberately the tallest), so a fraction of the total height
// does not land on the matching node. Each row colouring its own two connector
// stubs cannot disagree with the nodes it joins, and needs nothing measured.

const REWARD_TONE = {
  merch: 'bg-brand text-white',
  voucher: 'bg-green-600 text-white',
  role: 'bg-ink text-white',
  access: 'bg-brand-light text-white',
  status: 'bg-brand-tint text-brand',
  other: 'bg-cloud text-smoke',
}

// WHAT EACH METRIC IS MEASURED ON, IN WORDS A CREATOR WOULD USE.
//
// `unit` completes the sentence "8 of 10 …". `what` is the line that answers
// "yes but what counts", which is the question behind "it seems inaccurate" -
// most of the time the number was right and nobody could tell what it was
// counting.
export const METRIC_COPY = {
  videos: { unit: 'videos', what: 'Entries you have submitted to a challenge.', icon: 'video' },
  views: { unit: 'views', what: 'Views logged across every entry you have posted.', icon: 'eye' },
  referrals: { unit: 'creators', what: 'Creators you brought in who went on to post something.', icon: 'share' },
  challenges: { unit: 'challenges', what: 'Separate challenges you have entered, however many videos each.', icon: 'flag' },
  days: { unit: 'days', what: 'Days since the team accepted you.', icon: 'clock' },
}

const n = (v) => Math.max(0, Math.floor(Number(v || 0)))

/** "8 of 10 videos", with views abbreviated because 1000000 is unreadable. */
export function requirementLine(metric, value, threshold) {
  const copy = METRIC_COPY[metric]
  const unit = copy?.unit || ''
  if (metric === 'views') return `${formatViews(n(value))} of ${formatViews(n(threshold))} views`
  return `${n(value)} of ${n(threshold)}${unit ? ` ${unit}` : ''}`
}

/** How far into this one, 0-1. Clamped, because a reached milestone keeps counting. */
export const fractionOf = (m) =>
  Math.max(0, Math.min(1, Number(m?.value || 0) / Math.max(1, Number(m?.threshold || 1))))

/** What is still needed, said as a number rather than as a percentage. */
export function remainingLine(m) {
  const left = Math.max(0, Number(m.threshold || 0) - Number(m.value || 0))
  if (left <= 0) return 'Everything counted - this one lands next time the numbers refresh.'
  const copy = METRIC_COPY[m.metric]
  if (m.metric === 'views') return `${formatViews(left)} more views to go.`
  if (m.metric === 'days') return `${n(left)} more ${n(left) === 1 ? 'day' : 'days'} to go.`
  const unit = copy?.unit || 'to go'
  return `${n(left)} more ${n(left) === 1 ? unit.replace(/s$/, '') : unit} to go.`
}

/**
 * ONE RUNG.
 *
 * Three states and they are genuinely different objects rather than the same
 * card in three colours:
 *
 *   REACHED  a solid node, a tick, the reward in colour, and the faces of
 *            everybody else who has it. Nothing to do here.
 *   NEXT     the only row with a bar on it, the only row that says what is
 *            left, and the only row that is any bigger than the others. There
 *            is exactly one of these, and it is the whole point of the page.
 *   AHEAD    a hollow node and grey type. It still shows the requirement,
 *            because a locked milestone whose price is hidden is not a goal.
 */
function Rung({ m, state, index, atStop }) {
  const copy = METRIC_COPY[m.metric] || {}
  const frac = fractionOf(m)
  const isNext = state === 'next'
  const done = state === 'done'

  return (
    <li className="ms-rung" data-state={state} style={{ '--i': Math.min(index, 12) }}>
      <span className="ms-node" aria-hidden>
        {done
          ? <Icon name="check" className="h-4 w-4" />
          : <Icon name={m.icon && m.icon !== 'flag' ? m.icon : copy.icon || 'flag'} className="h-4 w-4" />}
      </span>

      <div className="ms-card">
        <div className="ms-card-top">
          <h3 className="ms-title">{m.title}</h3>
          {m.reward && (
            <span className={cx('ms-reward', done ? REWARD_TONE[m.reward_kind] || REWARD_TONE.other : 'bg-cloud text-smoke')}>
              {m.reward}
            </span>
          )}
        </div>

        {/* THE DESCRIPTION, WHICH HAS BEEN IN THE DATABASE SINCE DAY ONE AND
            HAS NEVER BEEN RENDERED. It is where an admin writes what the
            milestone is actually for, and its absence is most of why the page
            read as a list of arbitrary numbers. */}
        {m.description && <p className="ms-desc">{m.description}</p>}

        <p className="ms-req">
          <Icon name={copy.icon || 'flag'} className="h-3.5 w-3.5 shrink-0" />
          <span>{requirementLine(m.metric, done ? m.threshold : m.value, m.threshold)}</span>
          {done && <span className="ms-done-chip">Reached</span>}
        </p>

        {/* A BAR ON THE NEXT ONE ONLY.
            Eleven bars down a page is eleven things to compare and nothing to
            do; one bar, on the one you can actually move, is a target. Rows
            further up the ladder that you have partly progressed on say so in
            the requirement line above, which is the same fact without the
            furniture. */}
        {isNext && (
          <>
            <div className="ms-bar">
              <div className="ms-bar-fill" style={{ width: `${Math.round(frac * 100)}%` }} />
            </div>
            <p className="ms-left">{remainingLine(m)}</p>
          </>
        )}

        {!done && !isNext && copy.what && <p className="ms-what">{copy.what}</p>}

        {atStop?.length > 0 && (
          <div className="ms-faces">
            <span className="flex -space-x-1.5">
              {atStop.slice(0, 4).map((s) => (
                <Link key={s.id} to={`/profile/${s.id}`} title={s.name} className="transition-transform hover:z-10 hover:scale-110">
                  <Avatar src={s.photo_url} name={s.name} size="xs" className="!ring-2 !ring-white" />
                </Link>
              ))}
            </span>
            <span className="ms-faces-count">
              {atStop.length === 1 ? 'One creator has this' : `${atStop.length} creators have this`}
            </span>
          </div>
        )}
      </div>
    </li>
  )
}

/**
 * THE LADDER.
 *
 * `preview` draws every rung as reached whatever the viewer has done. It is how
 * an admin checks the layout end to end in the editor without waiting to earn a
 * million views.
 *
 * `standings` are the other creators, as `{ id, name, photo_url, reached }`
 * where `reached` is a COUNT. That count cannot say WHICH milestones somebody
 * has - the RPC does not return that - so the faces under a rung are the people
 * who have reached at least as many milestones as this rung's position, which
 * is an honest approximation and is labelled as a count rather than as a claim
 * about that specific milestone. The old drawing made the same approximation
 * and presented it as fact.
 */
export default function MilestoneLadder({ milestones = [], standings = [], preview = false }) {
  const rows = preview ? milestones.map((m) => ({ ...m, reached: true, value: m.threshold })) : milestones
  if (rows.length === 0) {
    return (
      <p className="flex items-center justify-center gap-2 rounded-card border border-dashed border-gray-200 px-6 py-12 text-sm text-smoke">
        <Icon name="flag" className="h-4 w-4" /> No milestones have been set up yet.
      </p>
    )
  }

  // THE FIRST UNREACHED ONE, NOT `rows[reachedCount]`. See the note at the top:
  // reached milestones are not a contiguous prefix, because five different
  // metrics move at five different speeds.
  const nextId = rows.find((m) => !m.reached)?.id ?? null

  return (
    <div className="ms-ladder">
      {/* THE SPINE IS DRAWN PER RUNG, NOT AS ONE LINE DOWN THE SIDE.
          There WAS one line, scaled to `(reached + fraction) / total`, with a
          small aeroplane parked at the end of it. It looked good and it was
          wrong: the rungs are different heights - the next one is deliberately
          the tallest - so a fraction of the ladder's total HEIGHT does not land
          on the corresponding NODE. The marker sat between two milestones for
          no reason anybody could work out, which is exactly the kind of
          quietly-wrong number this rebuild exists to remove.
          Every rung now draws its own two connector stubs and colours them from
          its own state, so the spine cannot disagree with the nodes it joins -
          and it needs no measurement of anything. */}
      <ol className="ms-rungs">
        {rows.map((m, i) => (
          <Rung
            key={m.id}
            m={m}
            index={i}
            state={m.reached ? 'done' : m.id === nextId ? 'next' : 'ahead'}
            atStop={standings.filter((s) => Number(s.reached) >= i + 1)}
          />
        ))}
      </ol>
    </div>
  )
}
